"use client"

import React, { useState, useEffect } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { CreditCard, Search, ExternalLink, Users, User, CheckCircle2, Clock, ListTodo, BarChart3, DollarSign } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { collection, query, onSnapshot, where, or, collectionGroup, getDocs } from '@/lib/supabase/document-store';
import { db } from '@/lib/backend';
import { useAuth } from '@/hooks/useAuth';
import Link from 'next/link';
import { Progress } from '@/components/ui/progress';
import { handleDataError, OperationType } from '@/lib/backend-utils';
import { toast } from 'sonner';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Cell } from 'recharts';
import Image from 'next/image';

export default function RateCardsPage() {
  const { user } = useAuth();
  const [projects, setProjects] = useState<any[]>([]);
  const [teamMembers, setTeamMembers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<'projects' | 'people' | 'economic'>('projects');
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
  const [memberTasks, setMemberTasks] = useState<any[]>([]);
  const [loadingTasks, setLoadingTasks] = useState(false);
  const [allRateCards, setAllRateCards] = useState<any[]>([]);
  const [allTasks, setAllTasks] = useState<any[]>([]);
  const [loadingEconomic, setLoadingEconomic] = useState(false);

  useEffect(() => {
    if (!user) return;

    // Fetch projects
    const conditions = [
      where('ownerId', '==', user.uid),
      where('assignedUsers', 'array-contains', user.uid)
    ];

    if (user.email) {
      conditions.push(where('assignedEmails', 'array-contains', user.email));
    }

    const q = query(
      collection(db, 'projects'),
      or(...conditions)
    );

    const unsubscribeProjects = onSnapshot(q, (snapshot) => {
      const projectsData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setProjects(projectsData);
      setLoading(false);
    });

    // Fetch team members
    const qTeam = query(collection(db, 'team_members'));
    const unsubscribeTeam = onSnapshot(qTeam, (snapshot) => {
      const teamData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setTeamMembers(teamData);
    });

    return () => {
      unsubscribeProjects();
      unsubscribeTeam();
    };
  }, [user]);

  const handleSelectMember = (id: string) => {
    if (id !== selectedMemberId) {
      setMemberTasks([]);
      setLoadingTasks(true);
      setSelectedMemberId(id);
    }
  };

  useEffect(() => {
    if (!selectedMemberId) {
      return;
    }

    // Fetch tasks for the selected member across all projects
    // We use collectionGroup to fetch all tasks where assignedTo matches the selected member
    // Note: This might require a composite index in Supabase
    const qTasks = query(
      collectionGroup(db, 'tasks'),
      where('assignedTo', '==', selectedMemberId)
    );

    const unsubscribeTasks = onSnapshot(qTasks, (snapshot) => {
      const tasksData = snapshot.docs.map(doc => {
        const data = doc.data();
        // The parent of the task document is the 'tasks' collection, 
        // and its parent is the project document.
        const projectId = doc.ref.parent.parent?.id;
        return {
          id: doc.id,
          projectId,
          ...data
        };
      });
      setMemberTasks(tasksData);
      setLoadingTasks(false);
    }, (error: any) => {
      handleDataError(error, OperationType.LIST, 'tasks');
      setLoadingTasks(false);
    });

    return () => unsubscribeTasks();
  }, [selectedMemberId]);

  const handleTabChange = (tab: 'projects' | 'people' | 'economic') => {
    if (tab === 'economic' && activeTab !== 'economic') {
      setLoadingEconomic(true);
    }
    setActiveTab(tab);
  };

  useEffect(() => {
    if (activeTab !== 'economic') return;

    // Fetch all rate cards
    const qRateCards = query(collectionGroup(db, 'rateCards'));
    const unsubscribeRateCards = onSnapshot(qRateCards, (snapshot) => {
      const rcData = snapshot.docs.map(doc => {
        const data = doc.data();
        const projectId = doc.ref.parent.parent?.id;
        return {
          id: doc.id,
          projectId,
          ...data
        };
      });
      setAllRateCards(rcData);
    }, (error) => {
      handleDataError(error, OperationType.LIST, 'rateCards');
    });

    // Fetch all tasks
    const qAllTasks = query(collectionGroup(db, 'tasks'));
    const unsubscribeAllTasks = onSnapshot(qAllTasks, (snapshot) => {
      const tasksData = snapshot.docs.map(doc => {
        const data = doc.data();
        const projectId = doc.ref.parent.parent?.id;
        return {
          id: doc.id,
          projectId,
          ...data
        };
      });
      setAllTasks(tasksData);
      setLoadingEconomic(false);
    }, (error) => {
      console.error("Error fetching all tasks:", error);
      setLoadingEconomic(false);
    });

    return () => {
      unsubscribeRateCards();
      unsubscribeAllTasks();
    };
  }, [activeTab]);

  const filteredProjects = projects.filter(p => 
    p.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredMembers = teamMembers.filter(m => 
    m.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    m.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const selectedMember = teamMembers.find(m => m.id === selectedMemberId);

  // Calculate stats for the selected member
  const completedTasks = memberTasks.filter(t => t.status === 'completed').length;
  const totalTasks = memberTasks.length;
  const activeTasks = memberTasks.filter(t => t.status !== 'completed');
  const completionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  // Calculate economic data
  const accessibleProjectIds = new Set(projects.map(p => p.id));
  const filteredRateCards = allRateCards.filter(rc => accessibleProjectIds.has(rc.projectId));

  const globalUserTotals: Record<string, { name: string; value: number }> = {};

  const economicData = filteredRateCards.map(card => {
    const project = projects.find(p => p.id === card.projectId);
    const cardTasks = allTasks.filter(t => t.projectId === card.projectId);
    
    let totalUnits = 0;
    if (card.syncExternal) {
      totalUnits = card.currentValue || 0;
    } else {
      cardTasks.forEach(task => {
        if (task.indicator && task.indicator.toLowerCase() === card.indicator.toLowerCase()) {
          const value = task.indicatorValue || 0;
          const progress = task.progress || 0;
          totalUnits += value * (progress / 100);
        }
      });
    }
    
    const totalGenerated = totalUnits * card.rate;

    if (card.userStats) {
      Object.entries(card.userStats).forEach(([userId, units]: [string, any]) => {
        const member = teamMembers.find(m => m.id === userId);
        const userName = member ? member.name : 'Usuario Desconocido';
        const value = units * card.rate;
        
        if (!globalUserTotals[userId]) {
          globalUserTotals[userId] = { name: userName, value: 0 };
        }
        globalUserTotals[userId].value += value;
      });
    }
    
    return {
      ...card,
      projectName: project?.name || 'Proyecto Desconocido',
      totalUnits,
      totalGenerated
    };
  }).filter(card => 
    card.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    card.projectName.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const globalUserChartData = Object.values(globalUserTotals).sort((a, b) => b.value - a.value);
  const COLORS = ['#4f46e5', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4'];

  const totalMoneyGenerated = economicData.reduce((sum, card) => sum + card.totalGenerated, 0);

  return (
    <DashboardLayout>
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Rate Cards & Logros</h1>
          <p className="text-slate-500 mt-1">Monitorea proyectos y desempeño individual del equipo.</p>
        </div>
        <div className="flex bg-slate-100 p-1 rounded-lg">
          <button 
            onClick={() => handleTabChange('projects')}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${activeTab === 'projects' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
          >
            Por Proyecto
          </button>
          <button 
            onClick={() => handleTabChange('people')}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${activeTab === 'people' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
          >
            Por Persona
          </button>
          <button 
            onClick={() => handleTabChange('economic')}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${activeTab === 'economic' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
          >
            Económica
          </button>
        </div>
      </div>

      {activeTab === 'projects' ? (
        <Card className="border-slate-200 shadow-sm">
          <CardHeader className="pb-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <CardTitle className="text-lg font-semibold flex items-center gap-2">
                <CreditCard className="text-indigo-500" size={20} />
                Proyectos con Rate Cards
              </CardTitle>
              <div className="relative w-full sm:w-64">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
                <input 
                  type="text" 
                  placeholder="Buscar proyecto..." 
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full h-9 pl-9 pr-4 rounded-md border border-slate-200 bg-slate-50 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                />
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50/50">
                  <TableHead className="font-semibold text-slate-600">Proyecto</TableHead>
                  <TableHead className="font-semibold text-slate-600">Estado</TableHead>
                  <TableHead className="font-semibold text-slate-600">Última Actualización</TableHead>
                  <TableHead className="font-semibold text-slate-600 text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-8 text-slate-500">Cargando proyectos...</TableCell>
                  </TableRow>
                ) : filteredProjects.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-8 text-slate-500">No se encontraron proyectos.</TableCell>
                  </TableRow>
                ) : (
                  filteredProjects.map((project) => (
                    <TableRow key={project.id} className="hover:bg-slate-50/50">
                      <TableCell className="font-medium text-slate-900">{project.name}</TableCell>
                      <TableCell>
                        <span className={`px-2 py-1 rounded-md text-[10px] font-bold uppercase ${
                          project.status === 'active' ? 'bg-amber-100 text-amber-700' : 
                          project.status === 'completed' ? 'bg-emerald-100 text-emerald-700' : 
                          'bg-slate-100 text-slate-500'
                        }`}>
                          {project.status === 'active' ? 'Activo' : project.status === 'completed' ? 'Completado' : 'En Pausa'}
                        </span>
                      </TableCell>
                      <TableCell className="text-slate-500 text-sm">
                        {project.updatedAt?.toDate().toLocaleDateString() || 'N/A'}
                      </TableCell>
                      <TableCell className="text-right">
                        <Link href={`/projects/${project.id}?tab=rate-cards`}>
                          <Button variant="ghost" size="sm" className="text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 gap-1">
                            <ExternalLink size={14} />
                            Ver Rate Cards
                          </Button>
                        </Link>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : activeTab === 'people' ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Sidebar: Member List */}
          <div className="lg:col-span-1">
            <Card className="border-slate-200 shadow-sm h-full">
              <CardHeader className="pb-4">
                <CardTitle className="text-lg font-semibold flex items-center gap-2">
                  <Users className="text-indigo-500" size={20} />
                  Equipo
                </CardTitle>
                <div className="relative mt-2">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
                  <input 
                    type="text" 
                    placeholder="Buscar persona..." 
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full h-9 pl-9 pr-4 rounded-md border border-slate-200 bg-slate-50 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                  />
                </div>
              </CardHeader>
              <CardContent className="p-0 max-h-[600px] overflow-y-auto">
                <div className="divide-y divide-slate-100">
                  {filteredMembers.map((member) => (
                    <button
                      key={member.id}
                      onClick={() => handleSelectMember(member.id)}
                      className={`w-full text-left p-4 hover:bg-slate-50 transition-colors flex items-center gap-3 ${selectedMemberId === member.id ? 'bg-indigo-50 border-r-4 border-indigo-500' : ''}`}
                    >
                      <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 font-bold overflow-hidden relative">
                        {member.photoURL ? (
                          <Image src={member.photoURL} alt={member.name} fill className="object-cover" referrerPolicy="no-referrer" />
                        ) : (
                          member.name.charAt(0)
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-slate-900 truncate">{member.name}</p>
                        <p className="text-xs text-slate-500 truncate">{member.roleName || 'Miembro'}</p>
                      </div>
                    </button>
                  ))}
                  {filteredMembers.length === 0 && (
                    <div className="p-8 text-center text-slate-500 text-sm">
                      No se encontraron miembros.
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Main Content: Member Details & Tasks */}
          <div className="lg:col-span-2 space-y-6">
            {!selectedMemberId ? (
              <div className="bg-slate-50 rounded-xl border border-dashed border-slate-300 p-12 text-center h-full flex flex-col items-center justify-center">
                <User className="w-12 h-12 text-slate-300 mb-4" />
                <h3 className="text-lg font-medium text-slate-900">Selecciona una persona</h3>
                <p className="text-slate-500 max-w-xs mx-auto mt-2">
                  Elige un miembro del equipo para ver sus logros y tareas en ejecución.
                </p>
              </div>
            ) : (
              <>
                {/* Member Stats */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <Card className="border-slate-200 shadow-sm">
                    <CardContent className="p-6">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-slate-500 text-sm font-medium">Logros</span>
                        <CheckCircle2 className="text-emerald-500" size={18} />
                      </div>
                      <div className="flex items-baseline gap-2">
                        <span className="text-2xl font-bold text-slate-900">{completedTasks}</span>
                        <span className="text-slate-400 text-sm">tareas completadas</span>
                      </div>
                      <div className="mt-4">
                        <div className="flex justify-between text-xs mb-1">
                          <span className="text-slate-500">Tasa de éxito</span>
                          <span className="font-bold text-indigo-600">{completionRate}%</span>
                        </div>
                        <Progress value={completionRate} className="h-1.5" />
                      </div>
                    </CardContent>
                  </Card>
                  
                  <Card className="border-slate-200 shadow-sm">
                    <CardContent className="p-6">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-slate-500 text-sm font-medium">En Ejecución</span>
                        <Clock className="text-amber-500" size={18} />
                      </div>
                      <div className="flex items-baseline gap-2">
                        <span className="text-2xl font-bold text-slate-900">{activeTasks.length}</span>
                        <span className="text-slate-400 text-sm">tareas activas</span>
                      </div>
                      <p className="text-xs text-slate-500 mt-4">
                        Distribuidas en {new Set(activeTasks.map(t => t.projectId)).size} proyectos.
                      </p>
                    </CardContent>
                  </Card>

                  <Card className="border-slate-200 shadow-sm">
                    <CardContent className="p-6">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-slate-500 text-sm font-medium">Total Asignado</span>
                        <ListTodo className="text-indigo-500" size={18} />
                      </div>
                      <div className="flex items-baseline gap-2">
                        <span className="text-2xl font-bold text-slate-900">{totalTasks}</span>
                        <span className="text-slate-400 text-sm">tareas totales</span>
                      </div>
                      <p className="text-xs text-slate-500 mt-4">
                        Historial completo de asignaciones.
                      </p>
                    </CardContent>
                  </Card>
                </div>

                {/* Active Tasks Table */}
                <Card className="border-slate-200 shadow-sm">
                  <CardHeader className="pb-4">
                    <CardTitle className="text-lg font-semibold flex items-center gap-2">
                      <BarChart3 className="text-indigo-500" size={20} />
                      Tareas en Ejecución
                    </CardTitle>
                    <CardDescription>
                      Listado de tareas activas de {selectedMember?.name} en todos los proyectos.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="p-0">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-slate-50/50">
                          <TableHead className="font-semibold text-slate-600">Tarea</TableHead>
                          <TableHead className="font-semibold text-slate-600">Proyecto</TableHead>
                          <TableHead className="font-semibold text-slate-600">Estado</TableHead>
                          <TableHead className="font-semibold text-slate-600 text-right">Acciones</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {loadingTasks ? (
                          <TableRow>
                            <TableCell colSpan={4} className="text-center py-8 text-slate-500">Cargando tareas...</TableCell>
                          </TableRow>
                        ) : activeTasks.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={4} className="text-center py-8 text-slate-500">No hay tareas en ejecución.</TableCell>
                          </TableRow>
                        ) : (
                          activeTasks.map((task) => {
                            const project = projects.find(p => p.id === task.projectId);
                            return (
                              <TableRow key={task.id} className="hover:bg-slate-50/50">
                                <TableCell>
                                  <div className="font-medium text-slate-900">{task.title}</div>
                                  <div className="text-xs text-slate-500 truncate max-w-[200px]">{task.description}</div>
                                </TableCell>
                                <TableCell className="text-sm text-slate-600">
                                  {project?.name || 'Cargando...'}
                                </TableCell>
                                <TableCell>
                                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                                    task.status === 'in_progress' ? 'bg-blue-100 text-blue-700' : 
                                    task.status === 'todo' ? 'bg-slate-100 text-slate-600' : 
                                    'bg-amber-100 text-amber-700'
                                  }`}>
                                    {task.status === 'in_progress' ? 'En Progreso' : 
                                     task.status === 'todo' ? 'Pendiente' : 
                                     task.status}
                                  </span>
                                </TableCell>
                                <TableCell className="text-right">
                                  <Link href={`/projects/${task.projectId}?tab=tasks`}>
                                    <Button variant="ghost" size="sm" className="text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50">
                                      Ir a Tarea
                                    </Button>
                                  </Link>
                                </TableCell>
                              </TableRow>
                            );
                          })
                        )}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              </>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card className="border-slate-200 shadow-sm bg-gradient-to-br from-indigo-50 to-white md:col-span-1 flex flex-col justify-center">
              <CardContent className="p-8">
                <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
                  <div>
                    <h2 className="text-sm font-semibold text-indigo-600 uppercase tracking-wider mb-1">Total Generado</h2>
                    <div className="flex items-baseline gap-2">
                      <span className="text-4xl font-bold text-slate-900">
                        {totalMoneyGenerated.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })}
                      </span>
                    </div>
                    <span className="text-slate-500 text-sm mt-2 block">en todos los proyectos</span>
                  </div>
                  <div className="p-4 bg-indigo-100 rounded-full">
                    <DollarSign className="w-8 h-8 text-indigo-600" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-slate-200 shadow-sm md:col-span-2">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-slate-500 flex items-center gap-2">
                  <Users size={16} className="text-indigo-500" />
                  Valor Generado por Usuario (Global)
                </CardTitle>
              </CardHeader>
              <CardContent className="h-[200px]">
                {globalUserChartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={globalUserChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                      <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} />
                      <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} tickFormatter={(value) => `$${value}`} />
                      <RechartsTooltip 
                        formatter={(value: any) => [Number(value).toLocaleString('en-US', { style: 'currency', currency: 'USD' }), 'Valor']}
                        cursor={{ fill: '#f1f5f9' }}
                        contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                      />
                      <Bar dataKey="value" fill="#4f46e5" radius={[4, 4, 0, 0]} maxBarSize={50}>
                        {globalUserChartData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex items-center justify-center text-slate-400 text-sm italic">
                    No hay datos por usuario aún
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <Card className="border-slate-200 shadow-sm">
            <CardHeader className="pb-4">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <CardTitle className="text-lg font-semibold flex items-center gap-2">
                  <BarChart3 className="text-indigo-500" size={20} />
                  Desglose por Rate Card
                </CardTitle>
                <div className="relative w-full sm:w-64">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
                  <input 
                    type="text" 
                    placeholder="Buscar rate card o proyecto..." 
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full h-9 pl-9 pr-4 rounded-md border border-slate-200 bg-slate-50 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50/50">
                    <TableHead className="font-semibold text-slate-600">Rate Card</TableHead>
                    <TableHead className="font-semibold text-slate-600">Proyecto</TableHead>
                    <TableHead className="font-semibold text-slate-600">Indicador</TableHead>
                    <TableHead className="font-semibold text-slate-600">Tarifa</TableHead>
                    <TableHead className="font-semibold text-slate-600 text-right">Generado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loadingEconomic ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-8 text-slate-500">Cargando datos económicos...</TableCell>
                    </TableRow>
                  ) : economicData.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-8 text-slate-500">No se encontraron rate cards.</TableCell>
                    </TableRow>
                  ) : (
                    economicData.map((card) => (
                      <TableRow key={card.id} className="hover:bg-slate-50/50">
                        <TableCell className="font-medium text-slate-900">{card.name}</TableCell>
                        <TableCell className="text-slate-600">{card.projectName}</TableCell>
                        <TableCell className="text-slate-600">{card.indicator}</TableCell>
                        <TableCell className="font-medium text-indigo-600">
                          {card.rate.toLocaleString('en-US', { style: 'currency', currency: card.currency || 'USD' })}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="font-medium text-emerald-600">
                            {card.totalGenerated.toLocaleString('en-US', { style: 'currency', currency: card.currency || 'USD' })}
                          </div>
                          <div className="text-xs text-slate-500 font-normal">{card.totalUnits.toFixed(1)} unidades</div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      )}
    </DashboardLayout>
  );
}
