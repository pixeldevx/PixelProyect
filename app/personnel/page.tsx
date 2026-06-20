"use client"

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import {
  AlertTriangle,
  ArrowRight,
  BriefcaseBusiness,
  CalendarClock,
  CheckCircle2,
  CircleDollarSign,
  Eye,
  Gauge,
  Search,
  ShieldCheck,
  Users,
  WalletCards,
  X,
} from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { useAuth } from '@/hooks/useAuth';
import { useRolePermissions } from '@/hooks/useRolePermissions';
import { belongsToAnyOrganization, organizationNameFor } from '@/lib/organizations';
import { collection, getDocs, onSnapshot, query } from '@/lib/supabase/document-store';
import { db } from '@/lib/backend';

type ProjectRow = {
  id: string;
  name?: string;
  organizationId?: string;
  organizationIds?: string[];
  assignedTeamMembers?: string[];
};

type TeamMemberRow = {
  id: string;
  name?: string;
  email?: string;
  photoURL?: string;
  role?: string;
  roleId?: string;
  systemRole?: string;
  organizationId?: string;
  organizationIds?: string[];
  authUserId?: string;
};

type RoleRow = {
  id: string;
  name?: string;
};

type BudgetPiece = {
  id?: string;
  name?: string;
  category?: string;
  assignedMemberIds?: string[];
  startMonth?: number;
  activeMonths?: number[];
  quantity?: number;
  duration?: number;
  multiplier?: number;
  unitCost?: number;
};

type BudgetLine = {
  id: string;
  name?: string;
  projectId: string;
  projectName: string;
  currency?: string;
  color?: string;
  components?: BudgetPiece[];
};

type TaskRow = {
  id: string;
  title?: string;
  name?: string;
  status?: string;
  progress?: number;
  assignedTo?: string;
  assignedUsers?: string[];
  assignedTeamMembers?: string[];
  parentTaskId?: string;
  parentId?: string;
  dueDate?: any;
  endDate?: any;
  startDate?: any;
  createdAt?: any;
};

type ProjectData = {
  budgetLines: BudgetLine[];
  tasks: TaskRow[];
};

type PersonProjectCoverage = {
  projectId: string;
  projectName: string;
  organizationName: string;
  allocated: number;
  monthlyAmounts: Record<number, number>;
  taskCount: number;
  overdueTasks: number;
  dueSoonTasks: number;
};

type PersonRow = {
  id: string;
  name: string;
  email: string;
  photoURL?: string;
  roleName: string;
  systemRole?: string;
  organizationNames: string[];
  projects: PersonProjectCoverage[];
  totalAllocated: number;
  monthlyAmounts: Record<number, number>;
  activeTasks: number;
  overdueTasks: number;
  dueSoonTasks: number;
  completedTasks: number;
  firstGapMonth: number | null;
  coveragePercent: number;
  status: 'covered' | 'gap' | 'uncovered' | 'risk';
};

const ACCESS_ROLES = new Set(['admin', 'org_admin', 'manager', 'coordinador']);
const MONTH_LABELS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const COVERAGE_WINDOW = 12;

const statusStyles = {
  covered: {
    label: 'Cubierto',
    pill: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
    dot: 'bg-emerald-500',
    row: 'hover:border-emerald-200 hover:bg-emerald-50/45',
  },
  gap: {
    label: 'Con huecos',
    pill: 'bg-amber-50 text-amber-700 ring-amber-100',
    dot: 'bg-amber-500',
    row: 'hover:border-amber-200 hover:bg-amber-50/45',
  },
  uncovered: {
    label: 'Sin cobertura',
    pill: 'bg-red-50 text-red-700 ring-red-100',
    dot: 'bg-red-500',
    row: 'hover:border-red-200 hover:bg-red-50/45',
  },
  risk: {
    label: 'Requiere acción',
    pill: 'bg-orange-50 text-orange-700 ring-orange-100',
    dot: 'bg-orange-500',
    row: 'hover:border-orange-200 hover:bg-orange-50/45',
  },
};

const currencyFormatter = (value: number, currency = 'COP') =>
  new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency,
    maximumFractionDigits: currency === 'COP' ? 0 : 2,
  }).format(Number.isFinite(value) ? value : 0);

const compactNumber = (value: number) => new Intl.NumberFormat('es-CO').format(Number.isFinite(value) ? value : 0);

const normalizeIds = (value: any) =>
  Array.from(new Set((Array.isArray(value) ? value : []).map((item) => String(item || '').trim()).filter(Boolean)));

const toNumber = (value: any, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const clampMonthNumber = (value: any, fallback = 1) => Math.max(1, Math.round(toNumber(value, fallback)));

const getTimelineMonthLabel = (monthNumber: number) => {
  const safeMonth = clampMonthNumber(monthNumber);
  const monthIndex = (safeMonth - 1) % MONTH_LABELS.length;
  const cycle = Math.floor((safeMonth - 1) / MONTH_LABELS.length);
  return cycle === 0 ? MONTH_LABELS[monthIndex] : `${MONTH_LABELS[monthIndex]} +${cycle}`;
};

const normalizeActiveMonths = (months: any[] = []) =>
  Array.from(
    new Set(
      months
        .map((month) => clampMonthNumber(month))
        .filter((month) => Number.isFinite(month) && month > 0)
    )
  ).sort((a, b) => a - b);

const buildContinuousMonths = (startMonth: number, duration: number) =>
  Array.from({ length: Math.max(0, Math.ceil(toNumber(duration, 0))) }, (_, index) => clampMonthNumber(startMonth) + index);

const getPieceActiveMonths = (piece: BudgetPiece) => {
  if (Array.isArray(piece.activeMonths) && piece.activeMonths.length > 0) {
    return normalizeActiveMonths(piece.activeMonths);
  }
  return buildContinuousMonths(clampMonthNumber(piece.startMonth), Math.max(1, Math.ceil(toNumber(piece.duration, 1))));
};

const getPieceDuration = (piece: BudgetPiece) => {
  const parsedDuration = toNumber(piece.duration, NaN);
  return Number.isFinite(parsedDuration) ? Math.max(0, parsedDuration) : getPieceActiveMonths(piece).length || 0;
};

const pieceTotal = (piece: BudgetPiece) =>
  toNumber(piece.quantity) * getPieceDuration(piece) * toNumber(piece.multiplier, 1) * toNumber(piece.unitCost);

const pieceMonthlyTotal = (piece: BudgetPiece) =>
  pieceTotal(piece) / Math.max(1, getPieceActiveMonths(piece).length);

const getMemberName = (member: TeamMemberRow) =>
  member.name || member.email?.split('@')[0] || 'Profesional';

const getMemberAliases = (member: TeamMemberRow) =>
  new Set(
    [member.id, member.authUserId, member.email, member.name]
      .map((value) => String(value || '').trim())
      .filter(Boolean)
  );

const taskTitle = (task: TaskRow) => task.title || task.name || task.id || 'Tarea sin nombre';

const getDateValue = (value: any): Date | null => {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value?.toDate === 'function') return value.toDate();
  if (typeof value === 'string' || typeof value === 'number') {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  return null;
};

const isCompletedStatus = (status?: string) => {
  const normalized = String(status || '').toLowerCase();
  return normalized.includes('finaliz') || normalized.includes('listo') || normalized.includes('complet');
};

const isTaskAssignedToMember = (task: TaskRow, member: TeamMemberRow) => {
  const aliases = getMemberAliases(member);
  const assignedValues = [
    task.assignedTo,
    ...normalizeIds(task.assignedUsers),
    ...normalizeIds(task.assignedTeamMembers),
  ];

  return assignedValues.some((value) => aliases.has(String(value || '').trim()));
};

const getTaskDueDate = (task: TaskRow) =>
  getDateValue(task.dueDate) || getDateValue(task.endDate) || null;

function MetricCard({
  label,
  value,
  detail,
  icon,
  tone,
}: {
  label: string;
  value: string;
  detail: string;
  icon: React.ReactNode;
  tone: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg hover:shadow-slate-900/8">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">{label}</p>
          <p className="mt-2 truncate text-3xl font-black tracking-tight text-slate-950">{value}</p>
          <p className="mt-1 text-sm font-bold text-slate-500">{detail}</p>
        </div>
        <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ring-1 ${tone}`}>
          {icon}
        </div>
      </div>
    </div>
  );
}

function PersonAvatar({ member, size = 'h-11 w-11' }: { member: Pick<PersonRow, 'name' | 'photoURL'>; size?: string }) {
  return (
    <div className={`relative ${size} shrink-0 overflow-hidden rounded-full bg-indigo-50 ring-1 ring-indigo-100`}>
      {member.photoURL ? (
        <Image src={member.photoURL} alt={member.name} fill className="object-cover" referrerPolicy="no-referrer" />
      ) : (
        <span className="flex h-full w-full items-center justify-center text-sm font-black text-indigo-700">
          {member.name.charAt(0).toUpperCase()}
        </span>
      )}
    </div>
  );
}

function CoveragePixels({ monthlyAmounts, startMonth, dense = false }: { monthlyAmounts: Record<number, number>; startMonth: number; dense?: boolean }) {
  const months = Array.from({ length: COVERAGE_WINDOW }, (_, index) => startMonth + index);

  return (
    <div className={`flex items-center ${dense ? 'gap-1' : 'gap-1.5'}`}>
      {months.map((month) => {
        const covered = toNumber(monthlyAmounts[month]) > 0;
        return (
          <span
            key={month}
            title={`${getTimelineMonthLabel(month)}: ${covered ? currencyFormatter(monthlyAmounts[month]) : 'Sin cobertura'}`}
            className={`${dense ? 'h-4 w-4' : 'h-5 w-5'} rounded-md border transition ${
              covered ? 'border-emerald-300 bg-emerald-500' : 'border-slate-200 bg-slate-100'
            }`}
          />
        );
      })}
    </div>
  );
}

export default function PersonnelPage() {
  const { userRole, userOrganizationId, userOrganizationIds } = useAuth();
  const { permissions } = useRolePermissions(userRole);
  const [organizations, setOrganizations] = useState<any[]>([]);
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [teamMembers, setTeamMembers] = useState<TeamMemberRow[]>([]);
  const [roles, setRoles] = useState<RoleRow[]>([]);
  const [projectData, setProjectData] = useState<Record<string, ProjectData>>({});
  const [selectedOrganizationId, setSelectedOrganizationId] = useState('all');
  const [selectedProjectId, setSelectedProjectId] = useState('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'alerts' | 'uncovered' | 'gap' | 'covered'>('alerts');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(true);

  const managedOrganizationIds = useMemo(
    () => (userOrganizationIds.length > 0 ? userOrganizationIds : userOrganizationId ? [userOrganizationId] : []),
    [userOrganizationId, userOrganizationIds]
  );

  const hasAccess = Boolean(permissions.personnelOverview) && ACCESS_ROLES.has(userRole || '');
  const canManagePersonnel = Boolean(permissions.personnelManage);
  const canViewBudget = Boolean(permissions.personnelBudgetView);
  const currentMonthNumber = new Date().getMonth() + 1;

  useEffect(() => {
    const unsubscribers = [
      onSnapshot(query(collection(db, 'organizations')), (snapshot) => {
        setOrganizations(snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() })));
      }),
      onSnapshot(query(collection(db, 'projects')), (snapshot) => {
        setProjects(snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() } as ProjectRow)));
      }),
      onSnapshot(query(collection(db, 'team_members')), (snapshot) => {
        setTeamMembers(snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() } as TeamMemberRow)));
      }),
      onSnapshot(query(collection(db, 'roles')), (snapshot) => {
        setRoles(snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() } as RoleRow)));
      }),
    ];

    return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
  }, []);

  const visibleOrganizations = useMemo(() => {
    if (userRole === 'admin' && managedOrganizationIds.length === 0) return organizations;
    return organizations.filter((organization) => managedOrganizationIds.includes(organization.id));
  }, [managedOrganizationIds, organizations, userRole]);

  const visibleProjects = useMemo(() => {
    return projects.filter((project) => {
      const allowedByOrg = userRole === 'admin' && managedOrganizationIds.length === 0
        ? true
        : belongsToAnyOrganization(project, managedOrganizationIds);
      const allowedBySelectedOrg = selectedOrganizationId === 'all'
        ? true
        : belongsToAnyOrganization(project, [selectedOrganizationId]);
      return allowedByOrg && allowedBySelectedOrg;
    });
  }, [managedOrganizationIds, projects, selectedOrganizationId, userRole]);

  useEffect(() => {
    if (!hasAccess) return;

    let active = true;
    const loadProjectDetails = async () => {
      const next: Record<string, ProjectData> = {};

      await Promise.all(
        visibleProjects.map(async (project) => {
          try {
            const [budgetSnapshot, taskSnapshot] = await Promise.all([
              getDocs(collection(db, 'projects', project.id, 'budgetLines')),
              getDocs(collection(db, 'projects', project.id, 'tasks')),
            ]);

            next[project.id] = {
              budgetLines: budgetSnapshot.docs.map((docSnap) => ({
                id: docSnap.id,
                projectId: project.id,
                projectName: project.name || 'Proyecto',
                ...docSnap.data(),
              } as BudgetLine)),
              tasks: taskSnapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() } as TaskRow)),
            };
          } catch (error) {
            console.warn('No fue posible cargar datos de personal del proyecto', project.id, error);
            next[project.id] = { budgetLines: [], tasks: [] };
          }
        })
      );

      if (!active) return;
      setProjectData(next);
      setLoadingDetails(false);
    };

    void loadProjectDetails();
    return () => {
      active = false;
    };
  }, [hasAccess, visibleProjects]);

  const roleNameById = useMemo(() => {
    const map = new Map<string, string>();
    roles.forEach((role) => map.set(role.id, role.name || role.id));
    return map;
  }, [roles]);

  const visibleTeamMembers = useMemo(() => {
    return teamMembers.filter((member) => {
      const allowedByOrg = userRole === 'admin' && managedOrganizationIds.length === 0
        ? true
        : belongsToAnyOrganization(member, managedOrganizationIds);
      const allowedBySelectedOrg = selectedOrganizationId === 'all'
        ? true
        : belongsToAnyOrganization(member, [selectedOrganizationId]);
      return allowedByOrg && allowedBySelectedOrg;
    });
  }, [managedOrganizationIds, selectedOrganizationId, teamMembers, userRole]);

  const personRows = useMemo<PersonRow[]>(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dueSoonLimit = new Date(today);
    dueSoonLimit.setDate(dueSoonLimit.getDate() + 7);

    return visibleTeamMembers.map((member) => {
      const memberProjects = visibleProjects.filter((project) => {
        const assignedTeamMembers = normalizeIds(project.assignedTeamMembers);
        const hasAssignedProject = assignedTeamMembers.includes(member.id);
        const details = projectData[project.id] || { budgetLines: [], tasks: [] };
        const hasBudget = details.budgetLines.some((line) =>
          (line.components || []).some((piece) => normalizeIds(piece.assignedMemberIds).includes(member.id))
        );
        const hasTask = details.tasks.some((task) => isTaskAssignedToMember(task, member));
        return selectedProjectId === 'all'
          ? hasAssignedProject || hasBudget || hasTask
          : project.id === selectedProjectId && (hasAssignedProject || hasBudget || hasTask);
      });

      const monthlyAmounts: Record<number, number> = {};
      let totalAllocated = 0;
      let activeTasks = 0;
      let completedTasks = 0;
      let overdueTasks = 0;
      let dueSoonTasks = 0;

      const projectsCoverage = memberProjects.map((project) => {
        const details = projectData[project.id] || { budgetLines: [], tasks: [] };
        const projectMonthlyAmounts: Record<number, number> = {};
        let allocated = 0;

        details.budgetLines.forEach((line) => {
          (line.components || []).forEach((piece) => {
            if (!normalizeIds(piece.assignedMemberIds).includes(member.id)) return;
            const amount = pieceMonthlyTotal(piece);
            allocated += pieceTotal(piece);
            getPieceActiveMonths(piece).forEach((month) => {
              projectMonthlyAmounts[month] = toNumber(projectMonthlyAmounts[month]) + amount;
              monthlyAmounts[month] = toNumber(monthlyAmounts[month]) + amount;
            });
          });
        });

        const assignedTasks = details.tasks.filter((task) => isTaskAssignedToMember(task, member));
        const projectOverdue = assignedTasks.filter((task) => {
          if (isCompletedStatus(task.status)) return false;
          const dueDate = getTaskDueDate(task);
          return Boolean(dueDate && dueDate < today);
        }).length;
        const projectDueSoon = assignedTasks.filter((task) => {
          if (isCompletedStatus(task.status)) return false;
          const dueDate = getTaskDueDate(task);
          return Boolean(dueDate && dueDate >= today && dueDate <= dueSoonLimit);
        }).length;

        totalAllocated += allocated;
        activeTasks += assignedTasks.filter((task) => !isCompletedStatus(task.status)).length;
        completedTasks += assignedTasks.filter((task) => isCompletedStatus(task.status)).length;
        overdueTasks += projectOverdue;
        dueSoonTasks += projectDueSoon;

        return {
          projectId: project.id,
          projectName: project.name || 'Proyecto',
          organizationName: organizationNameFor(project, organizations),
          allocated,
          monthlyAmounts: projectMonthlyAmounts,
          taskCount: assignedTasks.length,
          overdueTasks: projectOverdue,
          dueSoonTasks: projectDueSoon,
        };
      });

      const coveredMonths = Array.from({ length: COVERAGE_WINDOW }, (_, index) => currentMonthNumber + index)
        .filter((month) => toNumber(monthlyAmounts[month]) > 0);
      const firstGapMonth = Array.from({ length: COVERAGE_WINDOW }, (_, index) => currentMonthNumber + index)
        .find((month) => toNumber(monthlyAmounts[month]) <= 0) || null;
      const coveragePercent = Math.round((coveredMonths.length / COVERAGE_WINDOW) * 100);

      let status: PersonRow['status'] = 'covered';
      if (totalAllocated <= 0) status = 'uncovered';
      else if (overdueTasks > 0 || dueSoonTasks > 0) status = 'risk';
      else if (firstGapMonth) status = 'gap';

      const organizationNames = organizationNameFor(member, organizations).split(', ').filter(Boolean);

      return {
        id: member.id,
        name: getMemberName(member),
        email: member.email || '',
        photoURL: member.photoURL,
        roleName: roleNameById.get(member.roleId || '') || member.role || member.systemRole || 'Sin rol',
        systemRole: member.systemRole,
        organizationNames,
        projects: projectsCoverage,
        totalAllocated,
        monthlyAmounts,
        activeTasks,
        overdueTasks,
        dueSoonTasks,
        completedTasks,
        firstGapMonth,
        coveragePercent,
        status,
      };
    }).filter((row) => row.projects.length > 0 || selectedProjectId === 'all');
  }, [
    currentMonthNumber,
    organizations,
    projectData,
    roleNameById,
    selectedProjectId,
    visibleProjects,
    visibleTeamMembers,
  ]);

  const filteredRows = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();

    return personRows
      .filter((row) => {
        if (statusFilter === 'alerts') return row.status !== 'covered';
        if (statusFilter === 'uncovered') return row.status === 'uncovered';
        if (statusFilter === 'gap') return row.status === 'gap' || row.status === 'risk';
        if (statusFilter === 'covered') return row.status === 'covered';
        return true;
      })
      .filter((row) => {
        if (!term) return true;
        return [
          row.name,
          row.email,
          row.roleName,
          ...row.organizationNames,
          ...row.projects.map((project) => project.projectName),
        ].join(' ').toLowerCase().includes(term);
      })
      .sort((a, b) => {
        const priority: Record<PersonRow['status'], number> = { uncovered: 0, risk: 1, gap: 2, covered: 3 };
        return priority[a.status] - priority[b.status] || b.activeTasks - a.activeTasks || a.name.localeCompare(b.name);
      });
  }, [personRows, searchTerm, statusFilter]);

  const selectedPerson = useMemo(
    () => personRows.find((row) => row.id === selectedPersonId) || null,
    [personRows, selectedPersonId]
  );

  const summary = useMemo(() => {
    const totalAllocated = personRows.reduce((sum, row) => sum + row.totalAllocated, 0);
    const uncovered = personRows.filter((row) => row.status === 'uncovered').length;
    const gaps = personRows.filter((row) => row.status === 'gap' || row.status === 'risk').length;
    const overdue = personRows.reduce((sum, row) => sum + row.overdueTasks, 0);
    const activeTasks = personRows.reduce((sum, row) => sum + row.activeTasks, 0);

    return {
      totalAllocated,
      uncovered,
      gaps,
      overdue,
      activeTasks,
    };
  }, [personRows]);

  if (!hasAccess) {
    return (
      <DashboardLayout>
        <section className="rounded-2xl border border-amber-200 bg-white p-10 text-center shadow-sm">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-50 text-amber-700 ring-1 ring-amber-100">
            <ShieldCheck size={28} />
          </div>
          <h1 className="mt-4 text-3xl font-black tracking-tight text-slate-950">Talento humano protegido</h1>
          <p className="mx-auto mt-2 max-w-2xl text-sm font-semibold leading-6 text-slate-500">
            Este panel consolida personas, cobertura presupuestal y alertas operativas. Solo coordinadores,
            gerentes y administradores autorizados pueden ingresar.
          </p>
        </section>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <section className="relative overflow-hidden rounded-2xl border border-slate-200 bg-slate-950 p-7 text-white shadow-xl shadow-slate-900/10">
          <div className="absolute inset-0 opacity-30 [background-image:linear-gradient(rgba(99,102,241,.35)_1px,transparent_1px),linear-gradient(90deg,rgba(99,102,241,.35)_1px,transparent_1px)] [background-size:44px_44px]" />
          <div className="relative flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-4xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-cyan-300/30 bg-cyan-300/10 px-3 py-1 text-[11px] font-black uppercase tracking-[0.22em] text-cyan-200">
                <BriefcaseBusiness size={14} />
                Centro administrativo de talento
              </div>
              <h1 className="mt-4 text-4xl font-black tracking-tight">Talento humano global</h1>
              <p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-slate-300">
                Controla profesionales, proyectos asignados, tareas abiertas y cobertura presupuestal antes de que una persona quede sin frente de trabajo.
              </p>
            </div>
            <div className="grid min-w-[300px] grid-cols-2 gap-3">
              <div className="rounded-2xl border border-white/10 bg-white/10 p-4">
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Alcance</p>
                <p className="mt-2 text-2xl font-black">{compactNumber(visibleProjects.length)}</p>
                <p className="text-xs font-bold text-slate-300">proyectos visibles</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/10 p-4">
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Gestión</p>
                <p className="mt-2 text-2xl font-black">{canManagePersonnel ? 'Activa' : 'Consulta'}</p>
                <p className="text-xs font-bold text-slate-300">según permisos</p>
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <MetricCard
            label="Profesionales"
            value={compactNumber(personRows.length)}
            detail={`${compactNumber(filteredRows.length)} visibles`}
            icon={<Users size={22} className="text-indigo-700" />}
            tone="bg-indigo-50 text-indigo-700 ring-indigo-100"
          />
          <MetricCard
            label="Cobertura"
            value={canViewBudget ? currencyFormatter(summary.totalAllocated) : 'Protegida'}
            detail={canViewBudget ? 'bolsa asignada a personas' : 'requiere permiso'}
            icon={<WalletCards size={22} className="text-emerald-700" />}
            tone="bg-emerald-50 text-emerald-700 ring-emerald-100"
          />
          <MetricCard
            label="Sin cobertura"
            value={compactNumber(summary.uncovered)}
            detail="personas sin pieza asignada"
            icon={<AlertTriangle size={22} className="text-red-700" />}
            tone="bg-red-50 text-red-700 ring-red-100"
          />
          <MetricCard
            label="Con alerta"
            value={compactNumber(summary.gaps)}
            detail="huecos, vencimientos o riesgo"
            icon={<Gauge size={22} className="text-orange-700" />}
            tone="bg-orange-50 text-orange-700 ring-orange-100"
          />
          <MetricCard
            label="Carga abierta"
            value={compactNumber(summary.activeTasks)}
            detail={`${compactNumber(summary.overdue)} tareas vencidas`}
            icon={<CalendarClock size={22} className="text-cyan-700" />}
            tone="bg-cyan-50 text-cyan-700 ring-cyan-100"
          />
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setSelectedOrganizationId('all')}
                className={`rounded-lg border px-3 py-2 text-xs font-black uppercase tracking-[0.12em] transition ${selectedOrganizationId === 'all' ? 'border-indigo-600 bg-indigo-600 text-white shadow-lg shadow-indigo-600/20' : 'border-slate-200 bg-white text-slate-600 hover:border-indigo-200 hover:bg-indigo-50'}`}
              >
                Todas
              </button>
              {visibleOrganizations.map((organization) => (
                <button
                  type="button"
                  key={organization.id}
                  onClick={() => setSelectedOrganizationId(organization.id)}
                  className={`rounded-lg border px-3 py-2 text-xs font-black uppercase tracking-[0.12em] transition ${selectedOrganizationId === organization.id ? 'border-indigo-600 bg-indigo-600 text-white shadow-lg shadow-indigo-600/20' : 'border-slate-200 bg-white text-slate-600 hover:border-indigo-200 hover:bg-indigo-50'}`}
                >
                  {organization.name || organization.id}
                </button>
              ))}
            </div>
            <div className="grid gap-2 sm:grid-cols-3 lg:min-w-[720px]">
              <div className="relative">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="Buscar persona, proyecto, correo o rol..."
                  className="h-11 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm font-semibold text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-indigo-300 focus:ring-4 focus:ring-indigo-100"
                />
              </div>
              <select
                value={selectedProjectId}
                onChange={(event) => setSelectedProjectId(event.target.value)}
                className="h-11 rounded-lg border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700 outline-none focus:border-indigo-300 focus:ring-4 focus:ring-indigo-100"
              >
                <option value="all">Todos los proyectos</option>
                {visibleProjects.map((project) => (
                  <option key={project.id} value={project.id}>{project.name || project.id}</option>
                ))}
              </select>
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}
                className="h-11 rounded-lg border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700 outline-none focus:border-indigo-300 focus:ring-4 focus:ring-indigo-100"
              >
                <option value="alerts">Solo alertas</option>
                <option value="all">Todos</option>
                <option value="uncovered">Sin cobertura</option>
                <option value="gap">Con huecos o riesgo</option>
                <option value="covered">Cubiertos</option>
              </select>
            </div>
          </div>
        </section>

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 p-5">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="text-2xl font-black tracking-tight text-slate-950">Profesionales</h2>
                <p className="text-sm font-semibold text-slate-500">
                  Comparativo de cobertura, carga operativa y señales administrativas por persona.
                </p>
              </div>
              <div className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] text-slate-600">
                {loadingDetails ? 'Actualizando...' : `${compactNumber(filteredRows.length)} visibles`}
              </div>
            </div>
          </div>

          <div className="divide-y divide-slate-100">
            {loadingDetails ? (
              <div className="p-10 text-center text-sm font-bold text-slate-500">Cargando talento humano...</div>
            ) : filteredRows.length === 0 ? (
              <div className="p-10 text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100 text-slate-400">
                  <Users size={24} />
                </div>
                <h3 className="mt-3 text-lg font-black text-slate-900">No hay profesionales para mostrar</h3>
                <p className="mt-1 text-sm font-semibold text-slate-500">Cambia los filtros o asigna personas a proyectos.</p>
              </div>
            ) : (
              filteredRows.map((person) => {
                const style = statusStyles[person.status];
                return (
                  <article
                    key={person.id}
                    className={`group grid gap-4 px-5 py-4 transition md:grid-cols-[minmax(260px,1.3fr)_minmax(260px,1.4fr)_160px_170px_120px] md:items-center ${style.row}`}
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <PersonAvatar member={person} />
                      <div className="min-w-0">
                        <p className="truncate text-base font-black text-slate-950">{person.name}</p>
                        <p className="truncate text-xs font-bold text-slate-500">{person.email || 'Sin correo'}</p>
                        <div className="mt-1 flex flex-wrap items-center gap-2">
                          <span className="rounded-md bg-slate-100 px-2 py-1 text-[10px] font-black uppercase tracking-wider text-slate-600">
                            {person.roleName}
                          </span>
                          <span className={`rounded-md px-2 py-1 text-[10px] font-black uppercase tracking-wider ring-1 ${style.pill}`}>
                            {style.label}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="min-w-0">
                      <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Proyectos en alcance</p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {person.projects.slice(0, 4).map((project) => (
                          <span key={project.projectId} className="rounded-full bg-indigo-50 px-2.5 py-1 text-[11px] font-black uppercase tracking-wider text-indigo-700">
                            {project.projectName}
                          </span>
                        ))}
                        {person.projects.length > 4 && (
                          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-black text-slate-500">
                            +{person.projects.length - 4}
                          </span>
                        )}
                      </div>
                    </div>

                    <div>
                      <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Cobertura</p>
                      <p className="mt-1 text-lg font-black text-slate-950">{canViewBudget ? currencyFormatter(person.totalAllocated) : 'Protegida'}</p>
                      <div className="mt-2">
                        <Progress value={person.coveragePercent} className="h-2 bg-slate-100" />
                      </div>
                      <p className="mt-1 text-[11px] font-bold text-slate-500">{person.coveragePercent}% próximos 12 meses</p>
                    </div>

                    <div>
                      <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Calendario</p>
                      <div className="mt-2">
                        <CoveragePixels monthlyAmounts={person.monthlyAmounts} startMonth={currentMonthNumber} dense />
                      </div>
                      <p className="mt-1 text-[11px] font-bold text-slate-500">
                        {person.firstGapMonth ? `Hueco desde ${getTimelineMonthLabel(person.firstGapMonth)}` : 'Cobertura completa'}
                      </p>
                    </div>

                    <div className="flex items-center justify-between gap-3 md:justify-end">
                      <div className="text-right">
                        <p className="text-lg font-black text-slate-950">{person.activeTasks}</p>
                        <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">abiertas</p>
                        {person.overdueTasks > 0 && (
                          <p className="text-[11px] font-black text-red-600">{person.overdueTasks} vencidas</p>
                        )}
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setSelectedPersonId(person.id)}
                        className="h-9 border-slate-200 text-slate-700 hover:bg-slate-50"
                      >
                        <Eye size={15} className="mr-2" />
                        Detalle
                      </Button>
                    </div>
                  </article>
                );
              })
            )}
          </div>
        </section>
      </div>

      {selectedPerson && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm">
          <section className="max-h-[92vh] w-full max-w-6xl overflow-hidden rounded-2xl bg-white shadow-2xl shadow-slate-950/20">
            <header className="flex items-start justify-between gap-4 border-b border-slate-100 p-6">
              <div className="flex min-w-0 items-center gap-4">
                <PersonAvatar member={selectedPerson} size="h-14 w-14" />
                <div className="min-w-0">
                  <p className="text-[11px] font-black uppercase tracking-[0.2em] text-indigo-600">Ficha administrativa</p>
                  <h2 className="truncate text-3xl font-black tracking-tight text-slate-950">{selectedPerson.name}</h2>
                  <p className="truncate text-sm font-bold text-slate-500">{selectedPerson.roleName} · {selectedPerson.organizationNames.join(', ') || 'Sin organización'}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedPersonId(null)}
                className="rounded-full p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                aria-label="Cerrar"
              >
                <X size={22} />
              </button>
            </header>

            <div className="grid max-h-[calc(92vh-104px)] gap-0 overflow-y-auto lg:grid-cols-[1.2fr_0.8fr]">
              <div className="space-y-5 p-6">
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Tareas abiertas</p>
                    <p className="mt-2 text-3xl font-black text-slate-950">{selectedPerson.activeTasks}</p>
                    <p className="text-sm font-bold text-slate-500">{selectedPerson.completedTasks} finalizadas</p>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Cobertura</p>
                    <p className="mt-2 text-3xl font-black text-slate-950">{selectedPerson.coveragePercent}%</p>
                    <p className="text-sm font-bold text-slate-500">{canViewBudget ? currencyFormatter(selectedPerson.totalAllocated) : 'Protegida'}</p>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Alertas</p>
                    <p className="mt-2 text-3xl font-black text-slate-950">{selectedPerson.overdueTasks + selectedPerson.dueSoonTasks}</p>
                    <p className="text-sm font-bold text-slate-500">vencidas o próximas</p>
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-5">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <h3 className="text-xl font-black text-slate-950">Cobertura mensual</h3>
                      <p className="text-sm font-semibold text-slate-500">Cada bloque representa un mes; verde es presupuesto activo.</p>
                    </div>
                    <span className={`rounded-full px-3 py-1 text-[11px] font-black uppercase tracking-wider ring-1 ${statusStyles[selectedPerson.status].pill}`}>
                      {statusStyles[selectedPerson.status].label}
                    </span>
                  </div>
                  <div className="mt-5 overflow-x-auto">
                    <div className="min-w-[760px] space-y-3">
                      <div className="grid grid-cols-[180px_repeat(12,minmax(42px,1fr))] gap-2 text-center text-[10px] font-black uppercase tracking-wider text-slate-400">
                        <span className="text-left">Proyecto</span>
                        {Array.from({ length: COVERAGE_WINDOW }, (_, index) => currentMonthNumber + index).map((month) => (
                          <span key={month}>{getTimelineMonthLabel(month)}</span>
                        ))}
                      </div>
                      {selectedPerson.projects.map((project) => (
                        <div key={project.projectId} className="grid grid-cols-[180px_repeat(12,minmax(42px,1fr))] items-center gap-2">
                          <div className="min-w-0">
                            <p className="truncate text-xs font-black text-slate-900">{project.projectName}</p>
                            <p className="truncate text-[10px] font-bold uppercase tracking-wider text-emerald-700">{project.organizationName}</p>
                          </div>
                          {Array.from({ length: COVERAGE_WINDOW }, (_, index) => currentMonthNumber + index).map((month) => {
                            const amount = toNumber(project.monthlyAmounts[month]);
                            return (
                              <div
                                key={month}
                                title={`${getTimelineMonthLabel(month)} · ${amount ? currencyFormatter(amount) : 'Sin cobertura'}`}
                                className={`h-10 rounded-lg border text-[10px] font-black ${
                                  amount > 0
                                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                                    : 'border-slate-200 bg-slate-50 text-slate-300'
                                } flex items-center justify-center`}
                              >
                                {amount > 0 ? currencyFormatter(amount).replace('COP', '').trim() : 'Sin'}
                              </div>
                            );
                          })}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <aside className="space-y-4 border-t border-slate-100 bg-slate-50 p-6 lg:border-l lg:border-t-0">
                <div className="rounded-2xl border border-slate-200 bg-white p-5">
                  <h3 className="flex items-center gap-2 text-lg font-black text-slate-950">
                    <AlertTriangle size={18} className="text-orange-500" />
                    Señales administrativas
                  </h3>
                  <div className="mt-4 space-y-2">
                    {selectedPerson.status === 'covered' && selectedPerson.overdueTasks === 0 ? (
                      <div className="rounded-xl bg-emerald-50 p-3 text-sm font-bold text-emerald-700">
                        Cobertura estable y sin tareas vencidas visibles.
                      </div>
                    ) : (
                      <>
                        {selectedPerson.totalAllocated <= 0 && (
                          <div className="rounded-xl bg-red-50 p-3 text-sm font-bold text-red-700">
                            Esta persona no tiene presupuesto asignado.
                          </div>
                        )}
                        {selectedPerson.firstGapMonth && selectedPerson.totalAllocated > 0 && (
                          <div className="rounded-xl bg-amber-50 p-3 text-sm font-bold text-amber-700">
                            La cobertura presenta hueco desde {getTimelineMonthLabel(selectedPerson.firstGapMonth)}.
                          </div>
                        )}
                        {selectedPerson.overdueTasks > 0 && (
                          <div className="rounded-xl bg-red-50 p-3 text-sm font-bold text-red-700">
                            Tiene {selectedPerson.overdueTasks} tareas vencidas.
                          </div>
                        )}
                        {selectedPerson.dueSoonTasks > 0 && (
                          <div className="rounded-xl bg-orange-50 p-3 text-sm font-bold text-orange-700">
                            Tiene {selectedPerson.dueSoonTasks} tareas próximas a vencer.
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-5">
                  <h3 className="flex items-center gap-2 text-lg font-black text-slate-950">
                    <CircleDollarSign size={18} className="text-emerald-600" />
                    Acciones rápidas
                  </h3>
                  <div className="mt-4 grid gap-2">
                    <Link href="/budgets" className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-700 transition hover:bg-slate-50">
                      Revisar presupuestos
                      <ArrowRight size={16} />
                    </Link>
                    <Link href="/team" className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-700 transition hover:bg-slate-50">
                      Ver rendimiento
                      <ArrowRight size={16} />
                    </Link>
                    <Button
                      type="button"
                      disabled={!canManagePersonnel}
                      className="h-11 bg-indigo-600 font-black text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500"
                      onClick={() => window.alert('La gestión contractual editable queda protegida para la siguiente iteración del módulo.')}
                    >
                      Gestionar contrato
                    </Button>
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-5">
                  <h3 className="flex items-center gap-2 text-lg font-black text-slate-950">
                    <CheckCircle2 size={18} className="text-indigo-600" />
                    Proyectos
                  </h3>
                  <div className="mt-4 space-y-2">
                    {selectedPerson.projects.map((project) => (
                      <div key={project.projectId} className="rounded-xl bg-slate-50 p-3">
                        <div className="flex items-center justify-between gap-2">
                          <p className="truncate text-sm font-black text-slate-900">{project.projectName}</p>
                          <span className="rounded-full bg-white px-2 py-1 text-[10px] font-black text-slate-500">
                            {project.taskCount} tareas
                          </span>
                        </div>
                        <p className="mt-1 truncate text-[11px] font-bold uppercase tracking-wider text-emerald-700">{project.organizationName}</p>
                        <p className="mt-2 text-xs font-bold text-slate-500">
                          {canViewBudget ? currencyFormatter(project.allocated) : 'Presupuesto protegido'}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              </aside>
            </div>
          </section>
        </div>
      )}
    </DashboardLayout>
  );
}
