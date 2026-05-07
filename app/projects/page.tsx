"use client"

import React, { useState, useEffect } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Plus, Folder, Clock, CheckCircle, AlertCircle, FileText, Users, X, Trash2 } from 'lucide-react';
import { collection, query, onSnapshot, orderBy, addDoc, serverTimestamp, where, or, updateDoc, doc, deleteDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/hooks/useAuth';
import Link from 'next/link';
import { toast } from 'sonner';
import Image from 'next/image';

export default function ProjectsPage() {
  const { user, userRole, userOrganizationId } = useAuth();
  const [projects, setProjects] = useState<any[]>([]);
  const [teamMembers, setTeamMembers] = useState<any[]>([]);
  const [organizations, setOrganizations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectDesc, setNewProjectDesc] = useState('');
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [selectedProjectOrgId, setSelectedProjectOrgId] = useState('');

  // Edit Team State
  const [editingTeamProjectId, setEditingTeamProjectId] = useState<string | null>(null);
  const [editSelectedMembers, setEditSelectedMembers] = useState<string[]>([]);
  const [editSelectedOrgId, setEditSelectedOrgId] = useState<string>('');
  const [isSavingTeam, setIsSavingTeam] = useState(false);

  useEffect(() => {
    if (!user) return;

    let q;
    if (userRole === 'admin') {
      q = query(collection(db, 'projects'));
    } else if (userRole === 'org_admin' && userOrganizationId) {
      q = query(collection(db, 'projects'), where('organizationId', '==', userOrganizationId));
    } else {
      const conditions = [
        where('ownerId', '==', user.uid),
        where('assignedUsers', 'array-contains', user.uid)
      ];

      if (user.email) {
        conditions.push(where('assignedEmails', 'array-contains', user.email));
      }

      q = query(
        collection(db, 'projects'),
        or(...conditions)
      );
    }
    
    // Everyone needs to know organizations to create projects or assign them
    const unsubscribeOrgs = onSnapshot(query(collection(db, 'organizations')), (snap) => {
      const orgsData = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setOrganizations(orgsData);
    });

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const projectsData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      // Sort by createdAt descending
      projectsData.sort((a: any, b: any) => (b.createdAt?.toMillis() || 0) - (a.createdAt?.toMillis() || 0));
      setProjects(projectsData);
      setLoading(false);
    }, (error: any) => {
      console.error("Error fetching projects:", error);
      toast.error(`Error al cargar proyectos: ${error.message}`);
      setLoading(false);
    });

    // Fetch team members for assignment
    let qTeam = query(collection(db, 'team_members'));
    if (userRole !== 'admin' && userOrganizationId) {
       qTeam = query(collection(db, 'team_members'), where('organizationId', '==', userOrganizationId));
    }
    const unsubscribeTeam = onSnapshot(qTeam, (snapshot) => {
      const teamData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setTeamMembers(teamData);
    }, (error) => {
      console.error("Error fetching team members:", error);
    });

    return () => {
      unsubscribe();
      unsubscribeOrgs();
      unsubscribeTeam();
    };
  }, [user, userRole, userOrganizationId]);

  const toggleMemberSelection = (memberId: string) => {
    setSelectedMembers(prev => 
      prev.includes(memberId) 
        ? prev.filter(id => id !== memberId)
        : [...prev, memberId]
    );
  };

  const handleOpenEditTeam = (project: any) => {
    setEditingTeamProjectId(project.id);
    setEditSelectedMembers(project.assignedTeamMembers || []);
    setEditSelectedOrgId(project.organizationId || '');
  };

  const toggleEditMemberSelection = (memberId: string) => {
    setEditSelectedMembers(prev => 
      prev.includes(memberId) 
        ? prev.filter(id => id !== memberId)
        : [...prev, memberId]
    );
  };

  const handleSaveTeam = async () => {
    if (!editingTeamProjectId) return;
    setIsSavingTeam(true);
    try {
      const assignedEmails = editSelectedMembers
        .map(id => teamMembers.find(m => m.id === id)?.email)
        .filter(email => !!email);

      const updateData: any = {
        assignedTeamMembers: editSelectedMembers,
        assignedEmails: assignedEmails
      };

      if (userRole === 'admin') {
         updateData.organizationId = editSelectedOrgId;
      }

      await updateDoc(doc(db, 'projects', editingTeamProjectId), updateData);
      toast.success("Proyecto actualizado exitosamente.");
      setEditingTeamProjectId(null);
    } catch (error) {
      console.error("Error updating project:", error);
      toast.error("Error al actualizar el proyecto");
    } finally {
      setIsSavingTeam(false);
    }
  };

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !newProjectName.trim()) return;

    try {
      const assignedEmails = selectedMembers
        .map(id => teamMembers.find(m => m.id === id)?.email)
        .filter(email => !!email);

      await addDoc(collection(db, 'projects'), {
        name: newProjectName,
        description: newProjectDesc,
        status: 'active',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        ownerId: user.uid,
        assignedUsers: [],
        assignedTeamMembers: selectedMembers,
        assignedEmails: assignedEmails,
        organizationId: (!userOrganizationId || userRole === 'admin') ? selectedProjectOrgId : userOrganizationId
      });
      setIsCreating(false);
      setNewProjectName('');
      setNewProjectDesc('');
      setSelectedMembers([]);
      setSelectedProjectOrgId('');
    } catch (error) {
      console.error("Error creating project:", error);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'active': return <Clock className="w-4 h-4 text-amber-500" />;
      case 'completed': return <CheckCircle className="w-4 h-4 text-emerald-500" />;
      case 'on-hold': return <AlertCircle className="w-4 h-4 text-red-500" />;
      default: return <Folder className="w-4 h-4 text-slate-500" />;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active': return <span className="bg-amber-50 text-amber-700 px-2 py-1 rounded-md text-xs font-medium">Activo</span>;
      case 'completed': return <span className="bg-emerald-50 text-emerald-700 px-2 py-1 rounded-md text-xs font-medium">Completado</span>;
      case 'on-hold': return <span className="bg-red-50 text-red-700 px-2 py-1 rounded-md text-xs font-medium">En Pausa</span>;
      default: return null;
    }
  };

  const canEditProject = (project: any) => {
    return userRole === 'admin' || userRole === 'org_admin' || userRole === 'manager' || userRole === 'coordinador' || project.ownerId === user?.uid;
  };

  const canDeleteProject = (project: any) => {
    return userRole === 'admin' || (userRole === 'org_admin' && project.organizationId === userOrganizationId) || project.ownerId === user?.uid;
  };

  const handleDeleteProject = async (projectId: string) => {
    if (window.confirm("¿Estás seguro de que deseas eliminar este proyecto? Esta acción no se puede deshacer.")) {
      try {
        await deleteDoc(doc(db, 'projects', projectId));
        toast.success("Proyecto eliminado exitosamente.");
      } catch (error) {
        console.error("Error al eliminar proyecto:", error);
        toast.error("Error al eliminar el proyecto");
      }
    }
  };

  return (
    <DashboardLayout>
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Proyectos</h1>
          <p className="text-slate-500 mt-1">Gestiona tus proyectos y documentos asociados.</p>
        </div>
        {(userRole === 'admin' || userRole === 'org_admin' || userRole === 'manager' || userRole === 'coordinador') && (
          <Button onClick={() => setIsCreating(!isCreating)} className="bg-indigo-600 hover:bg-indigo-700 gap-2">
            <Plus size={16} />
            Nuevo Proyecto
          </Button>
        )}
      </div>

      {isCreating && (
        <Card className="mb-8 border-indigo-100 bg-indigo-50/30">
          <CardContent className="pt-6">
            <form onSubmit={handleCreateProject} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700">Nombre del Proyecto</label>
                  <input 
                    type="text" 
                    value={newProjectName}
                    onChange={(e) => setNewProjectName(e.target.value)}
                    className="w-full h-10 px-3 rounded-md border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                    placeholder="Ej. Actualización Catastral 2026"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700">Descripción</label>
                  <input 
                    type="text" 
                    value={newProjectDesc}
                    onChange={(e) => setNewProjectDesc(e.target.value)}
                    className="w-full h-10 px-3 rounded-md border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                    placeholder="Breve descripción del proyecto"
                  />
                </div>
              </div>

              {(!userOrganizationId || userRole === 'admin') && (
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700">Organización *</label>
                  <select 
                    value={selectedProjectOrgId}
                    onChange={(e) => setSelectedProjectOrgId(e.target.value)}
                    className="w-full h-10 px-3 rounded-md border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 bg-white"
                    required
                  >
                    <option value="">Selecciona una organización</option>
                    {organizations.map(org => (
                      <option key={org.id} value={org.id}>{org.name}</option>
                    ))}
                  </select>
                </div>
              )}
              
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">Asignar Equipo (Opcional)</label>
                <div className="border border-slate-200 rounded-md p-3 max-h-40 overflow-y-auto bg-white">
                  {teamMembers.length === 0 ? (
                    <p className="text-sm text-slate-500 text-center py-2">No hay miembros en el equipo. Puedes añadirlos en la sección &quot;Team Performance&quot;.</p>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                      {teamMembers.map(member => (
                        <label key={member.id} className="flex items-center gap-2 p-2 hover:bg-slate-50 rounded cursor-pointer border border-transparent hover:border-slate-100">
                          <input 
                            type="checkbox" 
                            checked={selectedMembers.includes(member.id)}
                            onChange={() => toggleMemberSelection(member.id)}
                            className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                          />
                          <div className="flex items-center gap-2 overflow-hidden">
                            <div className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold text-xs shrink-0">
                              {member.name.charAt(0).toUpperCase()}
                            </div>
                            <div className="truncate">
                              <p className="text-sm font-medium text-slate-900 truncate">{member.name}</p>
                              <p className="text-xs text-slate-500 truncate">{member.roleName}</p>
                            </div>
                          </div>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setIsCreating(false)}>Cancelar</Button>
                <Button type="submit" className="bg-indigo-600 hover:bg-indigo-700">Guardar Proyecto</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {loading ? (
        <div className="text-center py-12 text-slate-500">Cargando proyectos...</div>
      ) : projects.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-xl border border-slate-200 border-dashed">
          <Folder className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <h3 className="text-lg font-medium text-slate-900">No hay proyectos</h3>
          <p className="text-slate-500 mt-1">Crea tu primer proyecto para empezar a gestionar documentos.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {projects.map((project) => (
            <Card key={project.id} className="hover:shadow-md transition-shadow border-slate-200">
              <CardHeader className="pb-3">
                <div className="flex justify-between items-start mb-2">
                  <div className="p-2 bg-slate-50 rounded-md border border-slate-100">
                    <Folder className="w-5 h-5 text-indigo-500" />
                  </div>
                  <div className="flex items-center gap-2">
                    {getStatusBadge(project.status)}
                    {canDeleteProject(project) && (
                      <button 
                        onClick={() => handleDeleteProject(project.id)}
                        className="text-slate-400 hover:text-red-500 transition-colors p-1"
                        title="Eliminar proyecto"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
                <CardTitle className="text-lg font-semibold text-slate-900 line-clamp-1">{project.name}</CardTitle>
                <p className="text-sm text-slate-500 line-clamp-2 mt-1 h-10">
                  {project.description || 'Sin descripción'}
                </p>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2 text-xs text-slate-400 mb-4">
                  <Clock size={14} />
                  <span>Creado: {project.createdAt?.toDate().toLocaleDateString() || 'Reciente'}</span>
                </div>
                
                {project.assignedTeamMembers && project.assignedTeamMembers.length > 0 && (
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <div className="flex -space-x-2 overflow-hidden">
                        {project.assignedTeamMembers.slice(0, 3).map((memberId: string) => {
                          const member = teamMembers.find(m => m.id === memberId);
                          if (!member) return null;
                          return (
                            <div key={memberId} className="inline-block h-6 w-6 rounded-full ring-2 ring-white bg-indigo-100 text-indigo-700 flex items-center justify-center text-[10px] font-bold" title={member.name}>
                              {member.name.charAt(0).toUpperCase()}
                            </div>
                          );
                        })}
                        {project.assignedTeamMembers.length > 3 && (
                          <div className="inline-block h-6 w-6 rounded-full ring-2 ring-white bg-slate-100 text-slate-600 flex items-center justify-center text-[10px] font-medium">
                            +{project.assignedTeamMembers.length - 3}
                          </div>
                        )}
                      </div>
                      <span className="text-xs text-slate-500">
                        {project.assignedTeamMembers.length} miembro{project.assignedTeamMembers.length !== 1 ? 's' : ''}
                      </span>
                    </div>
                    {canEditProject(project) && (
                      <Button variant="ghost" size="sm" onClick={() => handleOpenEditTeam(project)} className="h-8 px-2 text-slate-500 hover:text-indigo-600">
                        <Users size={14} className="mr-1" /> Editar
                      </Button>
                    )}
                  </div>
                )}
                
                {(!project.assignedTeamMembers || project.assignedTeamMembers.length === 0) && canEditProject(project) && (
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-xs text-slate-400">Sin equipo asignado</span>
                    <Button variant="ghost" size="sm" onClick={() => handleOpenEditTeam(project)} className="h-8 px-2 text-slate-500 hover:text-indigo-600">
                      <Users size={14} className="mr-1" /> Asignar
                    </Button>
                  </div>
                )}

                <Link href={`/projects/${project.id}`}>
                  <Button className="w-full bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 gap-2">
                    <FileText size={16} />
                    Gestionar Proyecto
                  </Button>
                </Link>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      
      {/* Edit Team Modal */}
      {editingTeamProjectId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 m-4 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-slate-900">Editar Configuración del Proyecto</h3>
              <button onClick={() => setEditingTeamProjectId(null)} className="text-slate-400 hover:text-slate-600">
                <X size={20} />
              </button>
            </div>
            
            {userRole === 'admin' && (
              <div className="space-y-2 mb-4">
                <label className="text-sm font-medium text-slate-700">Organización *</label>
                <select 
                  value={editSelectedOrgId}
                  onChange={(e) => setEditSelectedOrgId(e.target.value)}
                  className="w-full h-10 px-3 rounded-md border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 bg-white"
                  required
                >
                  <option value="">Selecciona una organización</option>
                  {organizations.map(org => (
                    <option key={org.id} value={org.id}>{org.name}</option>
                  ))}
                </select>
              </div>
            )}
            
            <label className="text-sm font-medium text-slate-700 mb-2 block">Asignar Equipo</label>
            <div className="border border-slate-200 rounded-md p-3 max-h-60 overflow-y-auto bg-white mb-6">
              {teamMembers.length === 0 ? (
                <p className="text-sm text-slate-500 text-center py-2">No hay miembros en el equipo. Puedes añadirlos en la sección &quot;Team Performance&quot;.</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {teamMembers.map(member => (
                    <label key={member.id} className="flex items-center gap-3 p-2 hover:bg-slate-50 rounded cursor-pointer border border-transparent hover:border-slate-100">
                      <input 
                        type="checkbox" 
                        checked={editSelectedMembers.includes(member.id)}
                        onChange={() => toggleEditMemberSelection(member.id)}
                        className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                      />
                      <div className="flex items-center gap-3 overflow-hidden">
                        <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold text-sm shrink-0 overflow-hidden relative">
                          {member.photoURL ? (
                            <Image src={member.photoURL} alt={member.name} fill className="object-cover" referrerPolicy="no-referrer" />
                          ) : (
                            member.name.charAt(0).toUpperCase()
                          )}
                        </div>
                        <div className="truncate">
                          <p className="text-sm font-medium text-slate-900 truncate">{member.name}</p>
                          <p className="text-xs text-slate-500 truncate">{member.roleName}</p>
                        </div>
                      </div>
                    </label>
                  ))}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => setEditingTeamProjectId(null)} className="border-slate-200 text-slate-700 hover:bg-slate-50">
                Cancelar
              </Button>
              <Button onClick={handleSaveTeam} disabled={isSavingTeam} className="bg-indigo-600 hover:bg-indigo-700 text-white">
                {isSavingTeam ? 'Guardando...' : 'Guardar Cambios'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
