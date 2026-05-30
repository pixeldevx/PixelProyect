"use client"

import React, { useMemo, useState, useEffect } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  CheckCircle2,
  Clock,
  Folder,
  FolderKanban,
  Gauge,
  Layers3,
  Plus,
  Search,
  Sparkles,
  Target,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { collection, query, onSnapshot, orderBy, addDoc, serverTimestamp, where, or, updateDoc, doc, deleteDoc } from '@/lib/supabase/document-store';
import { db } from '@/lib/backend';
import { useAuth } from '@/hooks/useAuth';
import Link from 'next/link';
import { toast } from 'sonner';
import Image from 'next/image';
import { belongsToAnyOrganization } from '@/lib/organizations';
import { differenceInCalendarDays, format } from 'date-fns';
import { es } from 'date-fns/locale';

type ProjectTask = {
  id: string;
  title?: string;
  name?: string;
  status?: string;
  priority?: string;
  progress?: number;
  type?: string;
  parentTaskId?: string;
  workflowSteps?: any[];
  endDate?: any;
  end?: any;
  dueDate?: any;
  updatedAt?: any;
  createdAt?: any;
};

type ProjectStats = {
  total: number;
  open: number;
  pending: number;
  active: number;
  blocked: number;
  completed: number;
  completedLate: number;
  overdue: number;
  dueSoon: number;
  highPriority: number;
  workflows: number;
  averageProgress: number;
  completionRate: number;
  nextDueDate: Date | null;
  lastActivity: number;
};

type HealthFilter = 'all' | 'risk' | 'dueSoon' | 'healthy';

const COMPLETED_STATUSES = new Set(['completed', 'completed_late', 'listo']);
const ACTIVE_STATUSES = new Set(['in_progress', 'en_curso', 'trabajando', 'reproceso']);
const BLOCKED_STATUSES = new Set(['stuck', 'detenido', 'blocked', 'devuelto']);
const PENDING_STATUSES = new Set(['todo', 'pending', 'not_started', 'no_iniciado']);

const EMPTY_PROJECT_STATS: ProjectStats = {
  total: 0,
  open: 0,
  pending: 0,
  active: 0,
  blocked: 0,
  completed: 0,
  completedLate: 0,
  overdue: 0,
  dueSoon: 0,
  highPriority: 0,
  workflows: 0,
  averageProgress: 0,
  completionRate: 0,
  nextDueDate: null,
  lastActivity: 0,
};

const compactNumber = (value: number) => new Intl.NumberFormat('es-CO').format(value);

const getDate = (value: any): Date | null => {
  if (!value) return null;
  if (value.toDate) return value.toDate();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const getTime = (value: any) => getDate(value)?.getTime() || 0;

const getStatusBucket = (status?: string) => {
  const normalized = String(status || 'todo').toLowerCase();
  if (normalized === 'completed_late') return 'completedLate';
  if (COMPLETED_STATUSES.has(normalized)) return 'completed';
  if (BLOCKED_STATUSES.has(normalized)) return 'blocked';
  if (ACTIVE_STATUSES.has(normalized)) return 'active';
  if (PENDING_STATUSES.has(normalized)) return 'pending';
  return 'pending';
};

const isCompletedTask = (task: ProjectTask) => COMPLETED_STATUSES.has(String(task.status || '').toLowerCase());

const getScheduleState = (task: ProjectTask) => {
  if (isCompletedTask(task)) return task.status === 'completed_late' ? 'completed_late' : 'completed';
  const endDate = getDate(task.endDate || task.end || task.dueDate);
  if (!endDate) return 'none';
  const days = differenceInCalendarDays(endDate, new Date());
  if (days < 0) return 'overdue';
  if (days <= 3) return 'due_soon';
  return 'ok';
};

const formatDate = (value: any) => {
  const date = getDate(value);
  return date ? format(date, 'd MMM yyyy', { locale: es }) : 'Reciente';
};

const formatShortDate = (date: Date | null) => {
  if (!date) return 'Sin fecha crítica';
  return format(date, 'd MMM', { locale: es });
};

const calculateProjectStats = (tasks: ProjectTask[]): ProjectStats => {
  const safeTasks = tasks.filter(Boolean);
  const total = safeTasks.length;
  const openTasks = safeTasks.filter((task) => !isCompletedTask(task));
  const dueDates = openTasks
    .map((task) => getDate(task.endDate || task.end || task.dueDate))
    .filter((date): date is Date => Boolean(date))
    .sort((left, right) => left.getTime() - right.getTime());

  return {
    total,
    open: openTasks.length,
    pending: safeTasks.filter((task) => getStatusBucket(task.status) === 'pending').length,
    active: safeTasks.filter((task) => getStatusBucket(task.status) === 'active').length,
    blocked: safeTasks.filter((task) => getStatusBucket(task.status) === 'blocked').length,
    completed: safeTasks.filter((task) => getStatusBucket(task.status) === 'completed').length,
    completedLate: safeTasks.filter((task) => getStatusBucket(task.status) === 'completedLate').length,
    overdue: openTasks.filter((task) => getScheduleState(task) === 'overdue').length,
    dueSoon: openTasks.filter((task) => getScheduleState(task) === 'due_soon').length,
    highPriority: openTasks.filter((task) => String(task.priority || '').toLowerCase() === 'high').length,
    workflows: safeTasks.filter((task) => task.type === 'workflow' || Array.isArray(task.workflowSteps)).length,
    averageProgress: total ? Math.round(safeTasks.reduce((sum, task) => sum + Number(task.progress || 0), 0) / total) : 0,
    completionRate: total ? Math.round(((safeTasks.filter(isCompletedTask).length) / total) * 100) : 0,
    nextDueDate: dueDates[0] || null,
    lastActivity: Math.max(...safeTasks.map((task) => getTime(task.updatedAt || task.createdAt)), 0),
  };
};

const getProjectHealth = (stats: ProjectStats) => {
  if (stats.overdue > 0 || stats.blocked > 0) {
    return {
      key: 'risk',
      label: 'Atención crítica',
      hint: 'Hay tareas vencidas o bloqueadas',
      rail: 'bg-red-500',
      badge: 'bg-red-50 text-red-700 ring-red-100',
      glow: 'from-red-50 to-white',
      icon: AlertTriangle,
    };
  }

  if (stats.dueSoon > 0 || stats.highPriority > 0) {
    return {
      key: 'dueSoon',
      label: 'Vigilancia activa',
      hint: 'Se acercan cierres importantes',
      rail: 'bg-orange-500',
      badge: 'bg-orange-50 text-orange-700 ring-orange-100',
      glow: 'from-orange-50 to-white',
      icon: Clock,
    };
  }

  if (stats.total > 0 && stats.completionRate >= 80) {
    return {
      key: 'healthy',
      label: 'Saludable',
      hint: 'Avance sólido y controlado',
      rail: 'bg-emerald-500',
      badge: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
      glow: 'from-emerald-50 to-white',
      icon: CheckCircle2,
    };
  }

  return {
    key: 'steady',
    label: 'En marcha',
    hint: 'Plan en seguimiento',
    rail: 'bg-indigo-500',
    badge: 'bg-indigo-50 text-indigo-700 ring-indigo-100',
    glow: 'from-indigo-50 to-white',
    icon: Gauge,
  };
};

function PortfolioMetric({
  label,
  value,
  detail,
  icon,
  tone,
}: {
  label: string;
  value: string | number;
  detail: string;
  icon: React.ReactNode;
  tone: 'indigo' | 'emerald' | 'orange' | 'red';
}) {
  const toneClass = {
    indigo: 'bg-indigo-50 text-indigo-700 ring-indigo-100',
    emerald: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
    orange: 'bg-orange-50 text-orange-700 ring-orange-100',
    red: 'bg-red-50 text-red-700 ring-red-100',
  }[tone];

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">{label}</p>
          <p className="mt-2 text-3xl font-black tracking-tight text-slate-950">{value}</p>
          <p className="mt-1 text-sm font-medium text-slate-500">{detail}</p>
        </div>
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ring-1 ${toneClass}`}>
          {icon}
        </div>
      </div>
    </div>
  );
}

export default function ProjectsPage() {
  const { user, userRole, userOrganizationId, userOrganizationIds } = useAuth();
  const [projects, setProjects] = useState<any[]>([]);
  const [teamMembers, setTeamMembers] = useState<any[]>([]);
  const [organizations, setOrganizations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectDesc, setNewProjectDesc] = useState('');
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [selectedProjectOrgId, setSelectedProjectOrgId] = useState('');
  const [projectSearch, setProjectSearch] = useState('');
  const [healthFilter, setHealthFilter] = useState<HealthFilter>('all');
  const [tasksByProject, setTasksByProject] = useState<Record<string, ProjectTask[]>>({});

  // Edit Team State
  const [editingTeamProjectId, setEditingTeamProjectId] = useState<string | null>(null);
  const [editSelectedMembers, setEditSelectedMembers] = useState<string[]>([]);
  const [editSelectedOrgId, setEditSelectedOrgId] = useState<string>('');
  const [isSavingTeam, setIsSavingTeam] = useState(false);
  const managedOrganizationIds = useMemo(
    () => (userOrganizationIds.length > 0 ? userOrganizationIds : userOrganizationId ? [userOrganizationId] : []),
    [userOrganizationId, userOrganizationIds]
  );
  const visibleOrganizations = useMemo(
    () =>
      userRole === 'admin'
        ? organizations
        : organizations.filter((organization) => managedOrganizationIds.includes(organization.id)),
    [managedOrganizationIds, organizations, userRole]
  );
  const organizationsById = useMemo(
    () => new Map(organizations.map((organization) => [organization.id, organization])),
    [organizations]
  );

  useEffect(() => {
    if (!user) return;

    let q;
    if (userRole === 'admin' || userRole === 'org_admin') {
      q = query(collection(db, 'projects'));
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
      let projectsData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      if (userRole === 'org_admin') {
        projectsData = projectsData.filter((project) => belongsToAnyOrganization(project, managedOrganizationIds));
      }
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
    const unsubscribeTeam = onSnapshot(qTeam, (snapshot) => {
      let teamData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      if (userRole !== 'admin') {
        teamData = teamData.filter((member) => belongsToAnyOrganization(member, managedOrganizationIds));
      }
      setTeamMembers(teamData);
    }, (error) => {
      console.error("Error fetching team members:", error);
    });

    return () => {
      unsubscribe();
      unsubscribeOrgs();
      unsubscribeTeam();
    };
  }, [user, userRole, managedOrganizationIds]);

  useEffect(() => {
    if (!user) return;
    if (projects.length === 0) {
      setTasksByProject({});
      return;
    }

    const projectIds = new Set(projects.map((project) => project.id));
    setTasksByProject((current) =>
      Object.fromEntries(Object.entries(current).filter(([projectId]) => projectIds.has(projectId)))
    );

    const unsubscribes = projects.map((project) =>
      onSnapshot(
        query(collection(db, 'projects', project.id, 'tasks'), orderBy('displayOrder', 'asc')),
        (snapshot) => {
          const tasks = snapshot.docs.map((taskDoc) => ({
            id: taskDoc.id,
            ...taskDoc.data(),
          } as ProjectTask));

          setTasksByProject((current) => ({ ...current, [project.id]: tasks }));
        },
        (error) => {
          console.error(`Error loading tasks for project ${project.id}:`, error);
        }
      )
    );

    return () => unsubscribes.forEach((unsubscribe) => unsubscribe());
  }, [projects, user]);

  useEffect(() => {
    if (!isCreating) return;
    if (selectedProjectOrgId || visibleOrganizations.length === 0) return;
    setSelectedProjectOrgId(visibleOrganizations[0].id);
  }, [isCreating, selectedProjectOrgId, visibleOrganizations]);

  const projectStatsById = useMemo(() => {
    return Object.fromEntries(projects.map((project) => [project.id, calculateProjectStats(tasksByProject[project.id] || [])]));
  }, [projects, tasksByProject]);

  const portfolioStats = useMemo(() => {
    const stats = projects.map((project) => projectStatsById[project.id] || EMPTY_PROJECT_STATS);
    const activeProjects = projects.filter((project) => project.status !== 'completed').length;
    const totalTasks = stats.reduce((sum, item) => sum + item.total, 0);
    const totalOpen = stats.reduce((sum, item) => sum + item.open, 0);
    const totalOverdue = stats.reduce((sum, item) => sum + item.overdue, 0);
    const totalDueSoon = stats.reduce((sum, item) => sum + item.dueSoon, 0);
    const totalWorkflows = stats.reduce((sum, item) => sum + item.workflows, 0);
    const averageProgress = totalTasks
      ? Math.round(stats.reduce((sum, item) => sum + item.averageProgress * item.total, 0) / totalTasks)
      : 0;

    return {
      activeProjects,
      totalTasks,
      totalOpen,
      totalOverdue,
      totalDueSoon,
      totalWorkflows,
      averageProgress,
    };
  }, [projectStatsById, projects]);

  const healthCounts = useMemo(() => {
    return projects.reduce(
      (counts, project) => {
        const stats = projectStatsById[project.id] || EMPTY_PROJECT_STATS;
        const health = getProjectHealth(stats);
        if (health.key === 'risk') counts.risk += 1;
        if (health.key === 'dueSoon') counts.dueSoon += 1;
        if (health.key === 'healthy') counts.healthy += 1;
        return counts;
      },
      { all: projects.length, risk: 0, dueSoon: 0, healthy: 0 }
    );
  }, [projectStatsById, projects]);

  const filteredProjects = useMemo(() => {
    const search = projectSearch.trim().toLowerCase();

    return projects.filter((project) => {
      const stats = projectStatsById[project.id] || EMPTY_PROJECT_STATS;
      const health = getProjectHealth(stats);
      const organization =
        organizationsById.get(project.organizationId) ||
        (project.organizationIds || [])
          .map((organizationId: string) => organizationsById.get(organizationId))
          .find(Boolean);
      const teamNames = (project.assignedTeamMembers || [])
        .map((memberId: string) => teamMembers.find((member) => member.id === memberId)?.name)
        .filter(Boolean)
        .join(' ');

      const matchesSearch =
        !search ||
        [project.name, project.description, organization?.name, teamNames]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(search));

      const matchesHealth =
        healthFilter === 'all' ||
        (healthFilter === 'risk' && health.key === 'risk') ||
        (healthFilter === 'dueSoon' && health.key === 'dueSoon') ||
        (healthFilter === 'healthy' && health.key === 'healthy');

      return matchesSearch && matchesHealth;
    });
  }, [healthFilter, organizationsById, projectSearch, projectStatsById, projects, teamMembers]);

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
      } else if (userRole === 'org_admin' && visibleOrganizations.length > 1) {
        if (!editSelectedOrgId || !managedOrganizationIds.includes(editSelectedOrgId)) {
          toast.warning("Selecciona una organización válida para el proyecto.");
          setIsSavingTeam(false);
          return;
        }
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
      const projectOrganizationId =
        userRole === 'admin' || userRole === 'org_admin'
          ? selectedProjectOrgId || visibleOrganizations[0]?.id || ''
          : userOrganizationId || '';

      if (!projectOrganizationId) {
        toast.warning("Selecciona una organización para el proyecto.");
        return;
      }

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
        organizationId: projectOrganizationId
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

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active': return <span className="rounded px-2 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-amber-700 ring-1 ring-amber-100 bg-amber-50">Activo</span>;
      case 'completed': return <span className="rounded px-2 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-emerald-700 ring-1 ring-emerald-100 bg-emerald-50">Completado</span>;
      case 'on-hold': return <span className="rounded px-2 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-red-700 ring-1 ring-red-100 bg-red-50">En pausa</span>;
      default: return <span className="rounded px-2 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-slate-600 ring-1 ring-slate-200 bg-slate-50">Proyecto</span>;
    }
  };

  const canEditProject = (project: any) => {
    return userRole === 'admin' || userRole === 'org_admin' || userRole === 'manager' || userRole === 'coordinador' || project.ownerId === user?.uid;
  };

  const canDeleteProject = (project: any) => {
    return userRole === 'admin' || (userRole === 'org_admin' && belongsToAnyOrganization(project, managedOrganizationIds)) || project.ownerId === user?.uid;
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

  const getProjectMembers = (project: any) =>
    (project.assignedTeamMembers || [])
      .map((memberId: string) => teamMembers.find((member) => member.id === memberId))
      .filter(Boolean);

  const filterOptions: { id: HealthFilter; label: string; count: number }[] = [
    { id: 'all', label: 'Todos', count: healthCounts.all },
    { id: 'risk', label: 'Críticos', count: healthCounts.risk },
    { id: 'dueSoon', label: 'Por vencer', count: healthCounts.dueSoon },
    { id: 'healthy', label: 'Saludables', count: healthCounts.healthy },
  ];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
            <div className="max-w-3xl">
              <div className="mb-3 inline-flex items-center gap-2 rounded bg-indigo-50 px-3 py-1 text-[11px] font-black uppercase tracking-[0.16em] text-indigo-700 ring-1 ring-indigo-100">
                <Sparkles size={14} />
                Centro de proyectos
              </div>
              <h1 className="text-3xl font-black tracking-tight text-slate-950">Proyectos</h1>
              <p className="mt-2 text-base font-medium text-slate-500">
                Prioriza, compara y entra al proyecto correcto con señales claras de avance, carga y riesgo.
              </p>
            </div>
            {(userRole === 'admin' || userRole === 'org_admin' || userRole === 'manager' || userRole === 'coordinador') && (
              <Button onClick={() => setIsCreating(!isCreating)} className="h-12 shrink-0 bg-indigo-600 px-5 font-black hover:bg-indigo-700">
                <Plus size={18} />
                Nuevo Proyecto
              </Button>
            )}
          </div>
        </section>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <PortfolioMetric
            label="Activos"
            value={compactNumber(portfolioStats.activeProjects)}
            detail={`${compactNumber(projects.length)} proyectos visibles`}
            icon={<FolderKanban size={20} />}
            tone="indigo"
          />
          <PortfolioMetric
            label="Tareas abiertas"
            value={compactNumber(portfolioStats.totalOpen)}
            detail={`${portfolioStats.averageProgress}% de avance promedio`}
            icon={<Target size={20} />}
            tone="emerald"
          />
          <PortfolioMetric
            label="Riesgo"
            value={compactNumber(portfolioStats.totalOverdue)}
            detail={`${compactNumber(portfolioStats.totalDueSoon)} por vencer pronto`}
            icon={<AlertTriangle size={20} />}
            tone={portfolioStats.totalOverdue > 0 ? 'red' : 'orange'}
          />
          <PortfolioMetric
            label="Workflows"
            value={compactNumber(portfolioStats.totalWorkflows)}
            detail={`${compactNumber(portfolioStats.totalTasks)} tareas monitoreadas`}
            icon={<Layers3 size={20} />}
            tone="indigo"
          />
        </div>

        {isCreating && (
          <Card className="border-indigo-100 bg-indigo-50/30 shadow-sm">
            <CardContent className="pt-6">
              <form onSubmit={handleCreateProject} className="space-y-4">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
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

              {(userRole === 'admin' || userRole === 'org_admin') && (
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700">Organización *</label>
                  <select 
                    value={selectedProjectOrgId}
                    onChange={(e) => setSelectedProjectOrgId(e.target.value)}
                    className="w-full h-10 px-3 rounded-md border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 bg-white"
                    required
                  >
                    <option value="">Selecciona una organización</option>
                    {visibleOrganizations.map(org => (
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

        <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <h2 className="text-xl font-black tracking-tight text-slate-950">Radar de proyectos</h2>
              <p className="mt-1 text-sm font-medium text-slate-500">Busca por nombre, organización o equipo asignado.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {filterOptions.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setHealthFilter(option.id)}
                  className={`inline-flex h-9 items-center gap-2 rounded border px-3 text-xs font-black uppercase tracking-[0.12em] transition ${
                    healthFilter === option.id
                      ? 'border-indigo-600 bg-indigo-600 text-white shadow-sm'
                      : 'border-slate-200 bg-white text-slate-600 hover:border-indigo-200 hover:bg-indigo-50'
                  }`}
                >
                  {option.label}
                  <span className={`rounded px-1.5 py-0.5 text-[10px] ${healthFilter === option.id ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'}`}>
                    {option.count}
                  </span>
                </button>
              ))}
            </div>
          </div>
          <div className="mt-4 flex flex-col gap-3 lg:flex-row">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={projectSearch}
                onChange={(event) => setProjectSearch(event.target.value)}
                className="h-11 w-full rounded-md border border-slate-200 bg-white pl-10 pr-3 text-sm font-medium text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10"
                placeholder="Buscar proyecto, organización o responsable..."
              />
            </div>
          </div>
        </section>

        {loading ? (
          <div className="rounded-lg border border-slate-200 bg-white py-14 text-center text-slate-500 shadow-sm">Cargando proyectos...</div>
        ) : projects.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-200 bg-white py-14 text-center shadow-sm">
            <Folder className="mx-auto mb-3 h-12 w-12 text-slate-300" />
            <h3 className="text-lg font-black text-slate-900">No hay proyectos</h3>
            <p className="mt-1 text-slate-500">Crea tu primer proyecto para empezar a planificar.</p>
          </div>
        ) : filteredProjects.length === 0 ? (
          <div className="rounded-lg border border-slate-200 bg-white py-14 text-center shadow-sm">
            <Search className="mx-auto mb-3 h-12 w-12 text-slate-300" />
            <h3 className="text-lg font-black text-slate-900">No encontramos coincidencias</h3>
            <p className="mt-1 text-slate-500">Prueba con otro nombre, organización o filtro de salud.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2 2xl:grid-cols-3">
            {filteredProjects.map((project) => {
              const stats = projectStatsById[project.id] || EMPTY_PROJECT_STATS;
              const health = getProjectHealth(stats);
              const HealthIcon = health.icon;
              const projectMembers = getProjectMembers(project);
              const organization =
                organizationsById.get(project.organizationId) ||
                (project.organizationIds || [])
                  .map((organizationId: string) => organizationsById.get(organizationId))
                  .find(Boolean);
              const memberCount = project.assignedTeamMembers?.length || 0;
              const lastActivityLabel = stats.lastActivity ? formatDate(stats.lastActivity) : formatDate(project.updatedAt || project.createdAt);

              return (
                <article key={project.id} className="relative overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
                  <div className={`absolute inset-x-0 top-0 h-1 ${health.rail}`} />
                  <div className={`absolute inset-x-0 top-0 h-28 bg-gradient-to-b ${health.glow} opacity-80`} />
                  <div className="relative p-5">
                    <div className="mb-4 flex items-start justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-slate-50 text-indigo-600 ring-1 ring-slate-200">
                          <FolderKanban size={22} />
                        </div>
                        <div className="min-w-0">
                          <div className="mb-1 flex flex-wrap items-center gap-2">
                            {getStatusBadge(project.status)}
                            <span className={`inline-flex items-center gap-1 rounded px-2 py-1 text-[10px] font-black uppercase tracking-[0.12em] ring-1 ${health.badge}`}>
                              <HealthIcon size={12} />
                              {health.label}
                            </span>
                          </div>
                          <h3 className="truncate text-xl font-black tracking-tight text-slate-950">{project.name}</h3>
                        </div>
                      </div>
                      {canDeleteProject(project) && (
                        <button
                          onClick={() => handleDeleteProject(project.id)}
                          className="rounded-md p-2 text-slate-400 transition hover:bg-red-50 hover:text-red-600"
                          title="Eliminar proyecto"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>

                    <p className="min-h-10 text-sm font-medium leading-5 text-slate-500 line-clamp-2">
                      {project.description || 'Sin descripción'}
                    </p>

                    <div className="mt-5">
                      <div className="mb-2 flex items-center justify-between text-xs font-black uppercase tracking-[0.12em] text-slate-400">
                        <span>Avance general</span>
                        <span className="text-slate-700">{stats.averageProgress}%</span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                        <div className={`h-full rounded-full ${health.rail}`} style={{ width: `${Math.min(Math.max(stats.averageProgress, 0), 100)}%` }} />
                      </div>
                    </div>

                    <div className="mt-5 grid grid-cols-3 gap-2">
                      <div className="rounded-md bg-slate-50 p-3 ring-1 ring-slate-100">
                        <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">Abiertas</p>
                        <p className="mt-1 text-xl font-black text-slate-950">{compactNumber(stats.open)}</p>
                      </div>
                      <div className={`rounded-md p-3 ring-1 ${stats.overdue > 0 ? 'bg-red-50 ring-red-100' : 'bg-slate-50 ring-slate-100'}`}>
                        <p className={`text-[10px] font-black uppercase tracking-[0.14em] ${stats.overdue > 0 ? 'text-red-500' : 'text-slate-400'}`}>Vencidas</p>
                        <p className={`mt-1 text-xl font-black ${stats.overdue > 0 ? 'text-red-700' : 'text-slate-950'}`}>{compactNumber(stats.overdue)}</p>
                      </div>
                      <div className={`rounded-md p-3 ring-1 ${stats.dueSoon > 0 ? 'bg-orange-50 ring-orange-100' : 'bg-slate-50 ring-slate-100'}`}>
                        <p className={`text-[10px] font-black uppercase tracking-[0.14em] ${stats.dueSoon > 0 ? 'text-orange-500' : 'text-slate-400'}`}>Próximas</p>
                        <p className={`mt-1 text-xl font-black ${stats.dueSoon > 0 ? 'text-orange-700' : 'text-slate-950'}`}>{compactNumber(stats.dueSoon)}</p>
                      </div>
                    </div>

                    <div className="mt-4 grid grid-cols-1 gap-2 text-xs font-bold text-slate-500 sm:grid-cols-2">
                      <div className="flex min-w-0 items-center gap-2 rounded-md bg-white/70 px-3 py-2 ring-1 ring-slate-100">
                        <Clock size={14} className="shrink-0 text-slate-400" />
                        <span className="truncate">Próximo cierre: {formatShortDate(stats.nextDueDate)}</span>
                      </div>
                      <div className="flex min-w-0 items-center gap-2 rounded-md bg-white/70 px-3 py-2 ring-1 ring-slate-100">
                        <BarChart3 size={14} className="shrink-0 text-slate-400" />
                        <span className="truncate">{compactNumber(stats.workflows)} workflows · {compactNumber(stats.highPriority)} alta prioridad</span>
                      </div>
                    </div>

                    <div className="mt-5 flex items-center justify-between gap-3 border-t border-slate-100 pt-4">
                      <div className="min-w-0">
                        <div className="mb-2 flex items-center gap-2 text-xs font-bold text-slate-500">
                          <Clock size={14} />
                          <span>Actividad: {lastActivityLabel}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="flex -space-x-2 overflow-hidden">
                            {projectMembers.slice(0, 4).map((member: any) => {
                              const display = member.name || member.email || '?';
                              return (
                                <div key={member.id} className="relative inline-flex h-7 w-7 items-center justify-center overflow-hidden rounded-full bg-indigo-100 text-[10px] font-black text-indigo-700 ring-2 ring-white" title={display}>
                                  {member.photoURL ? (
                                    <Image src={member.photoURL} alt={display} fill className="object-cover" referrerPolicy="no-referrer" />
                                  ) : (
                                    display.charAt(0).toUpperCase()
                                  )}
                                </div>
                              );
                            })}
                            {memberCount > 4 && (
                              <div className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-[10px] font-black text-slate-600 ring-2 ring-white">
                                +{memberCount - 4}
                              </div>
                            )}
                          </div>
                          <div className="min-w-0 text-xs font-bold text-slate-500">
                            <p className="truncate">{memberCount} miembro{memberCount !== 1 ? 's' : ''}</p>
                            <p className="truncate text-slate-400">{organization?.name || 'Sin organización'}</p>
                          </div>
                        </div>
                      </div>

                      <div className="flex shrink-0 flex-col gap-2">
                        {canEditProject(project) && (
                          <Button variant="outline" size="sm" onClick={() => handleOpenEditTeam(project)} className="h-9 justify-start border-slate-200 text-slate-600 hover:bg-slate-50">
                            <Users size={14} />
                            Equipo
                          </Button>
                        )}
                        <Link href={`/projects/${project.id}`}>
                          <Button className="h-10 bg-slate-950 px-4 font-black text-white hover:bg-indigo-700">
                            Abrir
                            <ArrowRight size={16} />
                          </Button>
                        </Link>
                      </div>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
      
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
            
            {(userRole === 'admin' || (userRole === 'org_admin' && visibleOrganizations.length > 1)) && (
              <div className="space-y-2 mb-4">
                <label className="text-sm font-medium text-slate-700">Organización *</label>
                <select 
                  value={editSelectedOrgId}
                  onChange={(e) => setEditSelectedOrgId(e.target.value)}
                  className="w-full h-10 px-3 rounded-md border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 bg-white"
                  required
                >
                  <option value="">Selecciona una organización</option>
                  {visibleOrganizations.map(org => (
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
