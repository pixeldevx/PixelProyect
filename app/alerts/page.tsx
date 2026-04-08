"use client";

import React, { useState, useEffect } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, Trash2, Edit, Bell, Mail, Clock, AlertTriangle, CheckCircle2, Settings } from 'lucide-react';
import { collection, query, onSnapshot, addDoc, deleteDoc, doc, updateDoc, serverTimestamp, getDocs, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

export default function AlertsPage() {
  const { user } = useAuth();
  const [rules, setRules] = useState<any[]>([]);
  const [alerts, setAlerts] = useState<any[]>([]);
  const [isCreatingRule, setIsCreatingRule] = useState(false);
  const [loading, setLoading] = useState(true);
  const [projects, setProjects] = useState<any[]>([]);

  // Form state for new rule
  const [newRule, setNewRule] = useState({
    title: '',
    description: '',
    type: 'overdue',
    condition: 'greater_than',
    threshold: 1,
    thresholdUnit: 'days',
    targetProjects: [] as string[],
    notificationChannels: ['in_app'],
    isActive: true
  });

  useEffect(() => {
    if (!user) return;

    // Fetch alert rules
    const rulesQuery = query(collection(db, 'alert_rules'));
    const unsubscribeRules = onSnapshot(rulesQuery, (snapshot) => {
      const rulesData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setRules(rulesData);
    }, (error) => {
      console.error("Error fetching alert rules:", error);
    });

    // Fetch user's alerts
    const alertsQuery = query(collection(db, 'alerts'), where('userId', '==', user.uid));
    const unsubscribeAlerts = onSnapshot(alertsQuery, (snapshot) => {
      const alertsData = snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() }));
      setAlerts(alertsData);
      setLoading(false);
    }, (error) => {
      console.error("Error fetching alerts:", error);
      setLoading(false);
    });

    // Fetch projects for dropdown
    const fetchProjects = async () => {
      const projectsSnapshot = await getDocs(collection(db, 'projects'));
      const projectsData = projectsSnapshot.docs.map(doc => ({ id: doc.id, name: doc.data().name }));
      setProjects(projectsData);
    };
    fetchProjects();

    return () => {
      unsubscribeRules();
      unsubscribeAlerts();
    };
  }, [user]);

  const handleCreateRule = async () => {
    if (!user || !newRule.title) return;

    try {
      await addDoc(collection(db, 'alert_rules'), {
        ...newRule,
        recipients: [user.uid], // Default to current user
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        createdBy: user.uid
      });
      setIsCreatingRule(false);
      setNewRule({
        title: '',
        description: '',
        type: 'overdue',
        condition: 'greater_than',
        threshold: 1,
        thresholdUnit: 'days',
        targetProjects: [],
        notificationChannels: ['in_app'],
        isActive: true
      });
      toast.success("Regla de alerta creada exitosamente.");
    } catch (error) {
      console.error("Error creating rule:", error);
      toast.error("Error al crear la regla de alerta.");
    }
  };

  const handleDeleteRule = async (ruleId: string) => {
    if (confirm("¿Estás seguro de que deseas eliminar esta regla?")) {
      try {
        await deleteDoc(doc(db, 'alert_rules', ruleId));
        toast.success("Regla eliminada exitosamente.");
      } catch (error) {
        console.error("Error deleting rule:", error);
        toast.error("Error al eliminar la regla.");
      }
    }
  };

  const toggleRuleActive = async (ruleId: string, currentStatus: boolean) => {
    try {
      await updateDoc(doc(db, 'alert_rules', ruleId), {
        isActive: !currentStatus,
        updatedAt: serverTimestamp()
      });
    } catch (error) {
      console.error("Error updating rule:", error);
    }
  };

  const markAlertAsRead = async (alertId: string) => {
    try {
      await updateDoc(doc(db, 'alerts', alertId), {
        status: 'read',
        readAt: serverTimestamp()
      });
    } catch (error) {
      console.error("Error marking alert as read:", error);
    }
  };

  if (loading) {
    return <DashboardLayout><div className="p-8">Cargando alertas...</div></DashboardLayout>;
  }

  return (
    <DashboardLayout>
      <div className="p-8 max-w-7xl mx-auto space-y-8">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Centro de Alertas</h1>
            <p className="text-slate-500 mt-2">Configura reglas y gestiona tus notificaciones</p>
          </div>
          <Button onClick={() => setIsCreatingRule(!isCreatingRule)} className="bg-indigo-600 hover:bg-indigo-700">
            {isCreatingRule ? 'Cancelar' : <><Plus className="w-4 h-4 mr-2" /> Nueva Regla</>}
          </Button>
        </div>

        {isCreatingRule && (
          <Card className="border-indigo-100 shadow-md">
            <CardHeader className="bg-indigo-50/50 border-b border-indigo-100 pb-4">
              <CardTitle className="text-lg text-indigo-900">Crear Nueva Regla de Alerta</CardTitle>
              <CardDescription>Define las condiciones para generar alertas automáticas.</CardDescription>
            </CardHeader>
            <CardContent className="pt-6 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label>Nombre de la Regla</Label>
                  <Input 
                    value={newRule.title} 
                    onChange={(e) => setNewRule({...newRule, title: e.target.value})} 
                    placeholder="Ej: Tareas atrasadas más de 2 días"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Tipo de Alerta</Label>
                  <Select value={newRule.type || ''} onValueChange={(value) => setNewRule({...newRule, type: value || ''})}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecciona el tipo" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="overdue">Tareas Atrasadas</SelectItem>
                      <SelectItem value="inactive">Inactividad (Sin actualización)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="space-y-2">
                  <Label>Condición</Label>
                  <div className="flex gap-2 items-center">
                    <span className="text-sm text-slate-500">Si el tiempo es</span>
                    <Select value={newRule.condition} onValueChange={(value) => setNewRule({...newRule, condition: value || ''})}>
                      <SelectTrigger className="w-[140px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="greater_than">Mayor a</SelectItem>
                        <SelectItem value="equals">Igual a</SelectItem>
                      </SelectContent>
                    </Select>
                    <Input 
                      type="number" 
                      className="w-20" 
                      value={newRule.threshold} 
                      onChange={(e) => setNewRule({...newRule, threshold: parseInt(e.target.value) || 0})}
                      min={1}
                    />
                    <Select value={newRule.thresholdUnit} onValueChange={(value) => setNewRule({...newRule, thresholdUnit: value || ''})}>
                      <SelectTrigger className="w-[120px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="days">Días</SelectItem>
                        <SelectItem value="hours">Horas</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Proyectos (Opcional - Deja vacío para todos)</Label>
                  <Select 
                    value={newRule.targetProjects[0] || 'all'} 
                    onValueChange={(value) => setNewRule({...newRule, targetProjects: value === 'all' || !value ? [] : [value]})}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Todos los proyectos" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos los proyectos</SelectItem>
                      {projects.map(p => (
                        <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Canales de Notificación</Label>
                  <div className="flex gap-4 mt-2">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input 
                        type="checkbox" 
                        checked={newRule.notificationChannels.includes('in_app')}
                        onChange={(e) => {
                          const channels = e.target.checked 
                            ? [...newRule.notificationChannels, 'in_app']
                            : newRule.notificationChannels.filter(c => c !== 'in_app');
                          setNewRule({...newRule, notificationChannels: channels});
                        }}
                        className="rounded text-indigo-600 focus:ring-indigo-500"
                      />
                      <Bell className="w-4 h-4 text-slate-500" />
                      <span className="text-sm">En la App</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input 
                        type="checkbox" 
                        checked={newRule.notificationChannels.includes('email')}
                        onChange={(e) => {
                          const channels = e.target.checked 
                            ? [...newRule.notificationChannels, 'email']
                            : newRule.notificationChannels.filter(c => c !== 'email');
                          setNewRule({...newRule, notificationChannels: channels});
                        }}
                        className="rounded text-indigo-600 focus:ring-indigo-500"
                      />
                      <Mail className="w-4 h-4 text-slate-500" />
                      <span className="text-sm">Email</span>
                    </label>
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
                <Button variant="outline" onClick={() => setIsCreatingRule(false)}>Cancelar</Button>
                <Button onClick={handleCreateRule} className="bg-indigo-600 hover:bg-indigo-700" disabled={!newRule.title}>
                  Guardar Regla
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Active Alerts Section */}
          <Card className="shadow-sm border-slate-200">
            <CardHeader className="border-b border-slate-100 pb-4">
              <div className="flex items-center gap-2">
                <Bell className="w-5 h-5 text-amber-500" />
                <CardTitle className="text-lg">Tus Alertas Activas</CardTitle>
                {alerts.filter(a => a.status === 'unread').length > 0 && (
                  <span className="bg-red-100 text-red-700 text-xs font-bold px-2 py-0.5 rounded-full">
                    {alerts.filter(a => a.status === 'unread').length} nuevas
                  </span>
                )}
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {alerts.length === 0 ? (
                <div className="p-8 text-center text-slate-500 flex flex-col items-center">
                  <CheckCircle2 className="w-12 h-12 text-emerald-400 mb-3 opacity-50" />
                  <p>No tienes alertas activas en este momento.</p>
                  <p className="text-sm mt-1">¡Todo está al día!</p>
                </div>
              ) : (
                <div className="divide-y divide-slate-100 max-h-[500px] overflow-y-auto">
                  {alerts.sort((a, b) => b.createdAt?.toMillis() - a.createdAt?.toMillis()).map(alert => (
                    <div key={alert.id} className={`p-4 flex gap-4 transition-colors ${alert.status === 'unread' ? 'bg-amber-50/30' : 'hover:bg-slate-50'}`}>
                      <div className="mt-1 shrink-0">
                        {alert.type === 'overdue' ? (
                          <AlertTriangle className={`w-5 h-5 ${alert.status === 'unread' ? 'text-red-500' : 'text-slate-400'}`} />
                        ) : (
                          <Clock className={`w-5 h-5 ${alert.status === 'unread' ? 'text-amber-500' : 'text-slate-400'}`} />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className={`text-sm font-medium ${alert.status === 'unread' ? 'text-slate-900' : 'text-slate-700'}`}>
                          {alert.title}
                        </h4>
                        <p className="text-sm text-slate-500 mt-1 line-clamp-2">{alert.message}</p>
                        <div className="flex items-center gap-3 mt-2 text-xs text-slate-400">
                          <span>{alert.createdAt?.toDate().toLocaleString()}</span>
                          {alert.status === 'unread' && (
                            <button 
                              onClick={() => markAlertAsRead(alert.id)}
                              className="text-indigo-600 hover:text-indigo-800 font-medium"
                            >
                              Marcar como leída
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Configured Rules Section */}
          <Card className="shadow-sm border-slate-200">
            <CardHeader className="border-b border-slate-100 pb-4">
              <div className="flex items-center gap-2">
                <Settings className="w-5 h-5 text-slate-500" />
                <CardTitle className="text-lg">Reglas Configuradas</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {rules.length === 0 ? (
                <div className="p-8 text-center text-slate-500">
                  <p>No hay reglas configuradas.</p>
                  <Button variant="link" onClick={() => setIsCreatingRule(true)} className="mt-2 text-indigo-600">
                    Crear tu primera regla
                  </Button>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50/50">
                      <TableHead>Regla</TableHead>
                      <TableHead>Condición</TableHead>
                      <TableHead className="text-center">Estado</TableHead>
                      <TableHead className="text-right">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rules.map(rule => (
                      <TableRow key={rule.id}>
                        <TableCell>
                          <div className="font-medium text-slate-900">{rule.title}</div>
                          <div className="text-xs text-slate-500 flex items-center gap-1 mt-1">
                            {rule.type === 'overdue' ? 'Atraso' : 'Inactividad'}
                            <span className="text-slate-300">•</span>
                            <div className="flex gap-1">
                              {rule.notificationChannels.includes('in_app') && <Bell className="w-3 h-3" />}
                              {rule.notificationChannels.includes('email') && <Mail className="w-3 h-3" />}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm text-slate-600">
                          {rule.condition === 'greater_than' ? '>' : '='} {rule.threshold} {rule.thresholdUnit === 'days' ? 'días' : 'horas'}
                        </TableCell>
                        <TableCell className="text-center">
                          <Switch 
                            checked={rule.isActive} 
                            onCheckedChange={() => toggleRuleActive(rule.id, rule.isActive)}
                          />
                        </TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="sm" onClick={() => handleDeleteRule(rule.id)} className="text-red-500 hover:text-red-700 hover:bg-red-50">
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}