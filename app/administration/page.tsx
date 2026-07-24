"use client"

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  Banknote,
  BriefcaseBusiness,
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  CreditCard,
  FileText,
  FolderKanban,
  MapPin,
  ReceiptText,
  Search,
  ShieldCheck,
  WalletCards,
} from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import {
  collection,
  collectionGroup,
  onSnapshot,
  orderBy,
  query,
} from '@/lib/supabase/document-store';
import { db } from '@/lib/backend';
import { useAuth } from '@/hooks/useAuth';
import { useRolePermissions } from '@/hooks/useRolePermissions';
import { belongsToAnyOrganization, organizationNameFor } from '@/lib/organizations';

type ProjectRow = {
  id: string;
  name?: string;
  description?: string;
  ownerId?: string;
  organizationId?: string;
  organizationIds?: string[];
  assignedUsers?: string[];
  assignedEmails?: string[];
  assignedTeamMembers?: string[];
  status?: string;
};

type TeamMemberRow = {
  id: string;
  name?: string;
  displayName?: string;
  email?: string;
  authUserId?: string;
  organizationId?: string;
  organizationIds?: string[];
};

type ReceiptStatus = 'submitted' | 'approved' | 'approved_modified' | 'returned' | 'rejected';

type AdvanceReceipt = {
  id?: string;
  status?: ReceiptStatus;
  amount?: number;
};

type TravelAdvance = {
  id: string;
  projectId: string;
  customId?: string | null;
  requesterName?: string;
  requesterEmail?: string;
  destination?: string;
  department?: string;
  municipality?: string;
  purpose?: string;
  travelStart?: string;
  travelEnd?: string;
  status?: 'submitted' | 'pending_payment' | 'partially_paid' | 'paid' | 'approved' | 'completed' | 'returned' | 'rejected' | 'closed';
  amountRequested?: number;
  amountApproved?: number;
  amountLegalized?: number;
  amountReturned?: number;
  amountCompensated?: number;
  balance?: number;
  receipts?: AdvanceReceipt[];
  paymentSupport?: unknown;
  paymentSupports?: Array<{ amount?: number }>;
  amountPaid?: number;
  paymentBalance?: number;
  paymentProgress?: number;
  reconciliationStatus?: string;
  createdAt?: any;
  approvedAt?: any;
  paidAt?: any;
  completedAt?: any;
  closedAt?: any;
};

type StatusFilter =
  | 'all'
  | 'submitted'
  | 'pending_payment'
  | 'legalization'
  | 'completed'
  | 'closed'
  | 'returned'
  | 'rejected';

const ADMIN_ORGANIZATION_SCOPE_ROLES = new Set(['admin', 'org_admin', 'manager', 'gerente', 'project_manager', 'coordinador', 'coordinator']);

const statusMeta: Record<string, { label: string; className: string; dotClassName: string }> = {
  submitted: {
    label: 'Por aprobar',
    className: 'bg-amber-50 text-amber-700 ring-amber-100',
    dotClassName: 'bg-amber-500',
  },
  pending_payment: {
    label: 'Por pagar',
    className: 'bg-violet-50 text-violet-700 ring-violet-100',
    dotClassName: 'bg-violet-500',
  },
  partially_paid: {
    label: 'Abonado · saldo pendiente',
    className: 'bg-fuchsia-50 text-fuchsia-700 ring-fuchsia-100',
    dotClassName: 'bg-fuchsia-500',
  },
  paid: {
    label: 'Pagado · legalización',
    className: 'bg-sky-50 text-sky-700 ring-sky-100',
    dotClassName: 'bg-sky-500',
  },
  approved: {
    label: 'En legalización',
    className: 'bg-sky-50 text-sky-700 ring-sky-100',
    dotClassName: 'bg-sky-500',
  },
  completed: {
    label: 'Conciliación',
    className: 'bg-cyan-50 text-cyan-700 ring-cyan-100',
    dotClassName: 'bg-cyan-500',
  },
  closed: {
    label: 'Conciliado',
    className: 'bg-teal-50 text-teal-700 ring-teal-100',
    dotClassName: 'bg-teal-500',
  },
  returned: {
    label: 'Devuelto',
    className: 'bg-orange-50 text-orange-700 ring-orange-100',
    dotClassName: 'bg-orange-500',
  },
  rejected: {
    label: 'Rechazado',
    className: 'bg-rose-50 text-rose-700 ring-rose-100',
    dotClassName: 'bg-rose-500',
  },
};

const normalizeEmail = (value?: string | null) => String(value || '').trim().toLowerCase();

const normalizeText = (value: unknown) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

const asNumber = (value: unknown) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
};

const formatMoney = (value: unknown) =>
  new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(asNumber(value));

const getDateValue = (value: any): Date | null => {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value?.toDate === 'function') return value.toDate();
  if (typeof value === 'string') {
    const dateOnlyMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (dateOnlyMatch) {
      const [, year, month, day] = dateOnlyMatch;
      const localDate = new Date(Number(year), Number(month) - 1, Number(day));
      return Number.isNaN(localDate.getTime()) ? null : localDate;
    }
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const getDateTime = (value: any) => getDateValue(value)?.getTime() || 0;

const formatDate = (value: any) => {
  const date = getDateValue(value);
  return date ? date.toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Sin fecha';
};

const getAdvanceStatusMeta = (status?: string) => statusMeta[status || 'submitted'] || statusMeta.submitted;

const getJustifiedAmount = (advance: TravelAdvance) =>
  (advance.receipts || [])
    .filter((receipt) => receipt.status !== 'rejected')
    .reduce((sum, receipt) => sum + asNumber(receipt.amount), 0);

const getPaidAmount = (advance: TravelAdvance) => {
  const supportsTotal = (advance.paymentSupports || []).reduce((sum, support) => sum + asNumber(support.amount), 0);
  const legacySupport = advance.paymentSupport as { amount?: number } | undefined;
  return supportsTotal || asNumber(advance.amountPaid) || asNumber(legacySupport?.amount);
};

const getPaymentProgress = (advance: TravelAdvance) => {
  const approved = asNumber(advance.amountApproved || advance.amountRequested);
  if (approved <= 0) return 0;
  return Math.min(100, Math.round((getPaidAmount(advance) / approved) * 100));
};

const isApprovedReceipt = (receipt: AdvanceReceipt) =>
  receipt.status === 'approved' || receipt.status === 'approved_modified';

const getProjectIdFromAdvanceSnapshot = (snapshot: any, data: any) =>
  data.projectId || snapshot.ref?.parent?.parent?.id || '';

const buildCurrentUserIds = (user: any, teamMembers: TeamMemberRow[]) => {
  const email = normalizeEmail(user?.email);
  return Array.from(new Set([
    user?.uid,
    ...teamMembers
      .filter((member) => member.authUserId === user?.uid || normalizeEmail(member.email) === email)
      .map((member) => member.id),
  ].filter(Boolean)));
};

const userCanAccessProject = ({
  project,
  user,
  userRole,
  managedOrganizationIds,
  currentUserIds,
}: {
  project: ProjectRow;
  user: any;
  userRole?: string | null;
  managedOrganizationIds: string[];
  currentUserIds: string[];
}) => {
  if (userRole === 'admin') return true;

  const projectInManagedOrg =
    managedOrganizationIds.length === 0 ||
    belongsToAnyOrganization(project, managedOrganizationIds);

  if (userRole === 'org_admin') return projectInManagedOrg;

  if (
    userRole &&
    ADMIN_ORGANIZATION_SCOPE_ROLES.has(userRole) &&
    managedOrganizationIds.length > 0 &&
    projectInManagedOrg
  ) {
    return true;
  }

  const assignedUsers = Array.isArray(project.assignedUsers) ? project.assignedUsers : [];
  const assignedTeamMembers = Array.isArray(project.assignedTeamMembers) ? project.assignedTeamMembers : [];
  const assignedEmails = Array.isArray(project.assignedEmails) ? project.assignedEmails.map(normalizeEmail) : [];
  const directlyAssigned =
    project.ownerId === user?.uid ||
    assignedUsers.includes(user?.uid || '') ||
    assignedEmails.includes(normalizeEmail(user?.email)) ||
    assignedTeamMembers.some((memberId) => currentUserIds.includes(memberId));

  return directlyAssigned && projectInManagedOrg;
};

function MetricCard({
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
  tone: 'indigo' | 'emerald' | 'amber' | 'sky' | 'rose';
}) {
  const tones = {
    indigo: 'border-indigo-100 bg-indigo-50/70 text-indigo-700',
    emerald: 'border-emerald-100 bg-emerald-50/70 text-emerald-700',
    amber: 'border-amber-100 bg-amber-50/70 text-amber-700',
    sky: 'border-sky-100 bg-sky-50/70 text-sky-700',
    rose: 'border-rose-100 bg-rose-50/70 text-rose-700',
  };

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">{label}</p>
          <p className="mt-2 text-2xl font-black tracking-tight text-slate-950">{value}</p>
          <p className="mt-1 truncate text-xs font-bold text-slate-500">{detail}</p>
        </div>
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border ${tones[tone]}`}>
          {icon}
        </div>
      </div>
    </div>
  );
}

function EmptyState({ canAccess }: { canAccess: boolean }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-6 py-14 text-center shadow-sm">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg bg-slate-50 text-slate-400 ring-1 ring-slate-100">
        {canAccess ? <BriefcaseBusiness size={24} /> : <ShieldCheck size={24} />}
      </div>
      <h2 className="mt-4 text-lg font-black text-slate-950">
        {canAccess ? 'Sin anticipos administrativos para mostrar' : 'Módulo administrativo protegido'}
      </h2>
      <p className="mx-auto mt-2 max-w-xl text-sm font-semibold leading-6 text-slate-500">
        {canAccess
          ? 'Cuando existan anticipos en los proyectos donde tienes alcance administrativo aparecerán en este tablero.'
          : 'Tu rol no tiene activo el permiso para ver anticipos y costos administrativos.'}
      </p>
    </div>
  );
}

export default function AdministrationOverviewPage() {
  const { user, userRole, userOrganizationId, userOrganizationIds } = useAuth();
  const { permissions, loading: permissionsLoading } = useRolePermissions(userRole);
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [teamMembers, setTeamMembers] = useState<TeamMemberRow[]>([]);
  const [organizations, setOrganizations] = useState<any[]>([]);
  const [advances, setAdvances] = useState<TravelAdvance[]>([]);
  const [advancesLoaded, setAdvancesLoaded] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedProjectId, setSelectedProjectId] = useState('all');
  const [selectedOrganizationId, setSelectedOrganizationId] = useState('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [showClosed, setShowClosed] = useState(false);

  const canAccessAdministration = Boolean(permissions.administrationProjectView);
  const loading = canAccessAdministration && !advancesLoaded;
  const managedOrganizationIds = useMemo(
    () => (userOrganizationIds.length > 0 ? userOrganizationIds : userOrganizationId ? [userOrganizationId] : []),
    [userOrganizationId, userOrganizationIds]
  );
  const currentUserIds = useMemo(() => buildCurrentUserIds(user, teamMembers), [teamMembers, user]);

  useEffect(() => {
    if (!user || !canAccessAdministration) {
      return;
    }

    const unsubscribeProjects = onSnapshot(
      query(collection(db, 'projects')),
      (snapshot) => {
        setProjects(snapshot.docs.map((projectDoc) => ({ id: projectDoc.id, ...projectDoc.data() } as ProjectRow)));
      },
      (error) => {
        console.error('Error loading projects for administration overview:', error);
      }
    );

    const unsubscribeTeam = onSnapshot(
      query(collection(db, 'team_members')),
      (snapshot) => {
        setTeamMembers(snapshot.docs.map((teamDoc) => ({ id: teamDoc.id, ...teamDoc.data() } as TeamMemberRow)));
      },
      (error) => {
        console.error('Error loading team members for administration overview:', error);
      }
    );

    const unsubscribeOrganizations = onSnapshot(
      query(collection(db, 'organizations')),
      (snapshot) => {
        setOrganizations(snapshot.docs.map((organizationDoc) => ({ id: organizationDoc.id, ...organizationDoc.data() })));
      },
      (error) => {
        console.error('Error loading organizations for administration overview:', error);
      }
    );

    const unsubscribeAdvances = onSnapshot(
      query(collectionGroup(db, 'advanceRequests'), orderBy('createdAt', 'desc')),
      (snapshot) => {
        setAdvances(
          snapshot.docs.map((advanceDoc) => {
            const data = advanceDoc.data();
            return {
              id: advanceDoc.id,
              ...data,
              projectId: getProjectIdFromAdvanceSnapshot(advanceDoc, data),
            } as TravelAdvance;
          })
        );
        setAdvancesLoaded(true);
      },
      (error) => {
        console.error('Error loading global advances:', error);
        setAdvancesLoaded(true);
      }
    );

    return () => {
      unsubscribeProjects();
      unsubscribeTeam();
      unsubscribeOrganizations();
      unsubscribeAdvances();
    };
  }, [canAccessAdministration, user]);

  const scopedProjects = useMemo(
    () =>
      projects.filter((project) =>
        userCanAccessProject({
          project,
          user,
          userRole,
          managedOrganizationIds,
          currentUserIds,
        })
      ),
    [currentUserIds, managedOrganizationIds, projects, user, userRole]
  );

  const scopedProjectIds = useMemo(() => new Set(scopedProjects.map((project) => project.id)), [scopedProjects]);
  const projectById = useMemo(() => new Map(scopedProjects.map((project) => [project.id, project])), [scopedProjects]);

  const visibleOrganizations = useMemo(() => {
    const organizationIds = new Set(scopedProjects.flatMap((project) => [project.organizationId, ...(project.organizationIds || [])].filter(Boolean)));
    return organizations
      .filter((organization) => organizationIds.has(organization.id))
      .sort((left, right) => String(left.name || '').localeCompare(String(right.name || '')));
  }, [organizations, scopedProjects]);

  const visibleProjects = useMemo(() => {
    return scopedProjects
      .filter((project) => selectedOrganizationId === 'all' || belongsToAnyOrganization(project, [selectedOrganizationId]))
      .sort((left, right) => String(left.name || '').localeCompare(String(right.name || '')));
  }, [scopedProjects, selectedOrganizationId]);
  const activeSelectedProjectId = useMemo(
    () =>
      selectedProjectId === 'all' || visibleProjects.some((project) => project.id === selectedProjectId)
        ? selectedProjectId
        : 'all',
    [selectedProjectId, visibleProjects]
  );

  const baseFilteredAdvances = useMemo(() => {
    const search = normalizeText(searchTerm);
    const visibleProjectIds = new Set(visibleProjects.map((project) => project.id));

    return advances
      .filter((advance) => scopedProjectIds.has(advance.projectId))
      .filter((advance) => visibleProjectIds.has(advance.projectId))
      .filter((advance) => activeSelectedProjectId === 'all' || advance.projectId === activeSelectedProjectId)
      .filter((advance) => showClosed || (advance.status !== 'closed' && advance.reconciliationStatus !== 'reconciled'))
      .filter((advance) => {
        if (!search) return true;
        const project = projectById.get(advance.projectId);
        const organizationName = project ? organizationNameFor(project, organizations) : '';
        return [
          advance.customId,
          advance.requesterName,
          advance.requesterEmail,
          advance.destination,
          advance.department,
          advance.municipality,
          advance.purpose,
          project?.name,
          organizationName,
          advance.status,
        ]
          .filter(Boolean)
          .some((value) => normalizeText(value).includes(search));
      })
      .sort((left, right) => getDateTime(right.createdAt || right.approvedAt) - getDateTime(left.createdAt || left.approvedAt));
  }, [activeSelectedProjectId, advances, organizations, projectById, scopedProjectIds, searchTerm, showClosed, visibleProjects]);

  const filteredAdvances = useMemo(
    () =>
      baseFilteredAdvances.filter((advance) => {
        if (statusFilter === 'all') return true;
        if (statusFilter === 'legalization') return advance.status === 'partially_paid' || advance.status === 'paid' || advance.status === 'approved';
        if (statusFilter === 'pending_payment') return advance.status === 'pending_payment' || advance.status === 'partially_paid';
        if (statusFilter === 'closed') return advance.status === 'closed' || advance.reconciliationStatus === 'reconciled';
        return advance.status === statusFilter;
      }),
    [baseFilteredAdvances, statusFilter]
  );

  const totals = useMemo(() => {
    const activeAdvances = filteredAdvances.filter((advance) => advance.status !== 'rejected');
    const requested = activeAdvances.reduce((sum, advance) => sum + asNumber(advance.amountRequested), 0);
    const approved = activeAdvances.reduce((sum, advance) => sum + asNumber(advance.amountApproved || advance.amountRequested), 0);
    const justified = activeAdvances.reduce((sum, advance) => sum + getJustifiedAmount(advance), 0);
    const legalized = activeAdvances.reduce((sum, advance) => sum + asNumber(advance.amountLegalized), 0);
    const paid = activeAdvances.reduce((sum, advance) => sum + getPaidAmount(advance), 0);
    const paymentBase = activeAdvances.reduce((sum, advance) => sum + asNumber(advance.amountApproved || advance.amountRequested), 0);
    const costReal = activeAdvances
      .filter((advance) => advance.status === 'closed' || advance.reconciliationStatus === 'reconciled')
      .reduce((sum, advance) => sum + asNumber(advance.amountLegalized), 0);

    return {
      requested,
      approved,
      paid,
      paymentProgress: paymentBase > 0 ? Math.min(100, Math.round((paid / paymentBase) * 100)) : 0,
      justified,
      legalized,
      costReal,
      submitted: baseFilteredAdvances.filter((advance) => advance.status === 'submitted').length,
      pendingPayment: baseFilteredAdvances.filter((advance) => advance.status === 'pending_payment' || advance.status === 'partially_paid').length,
      partiallyPaid: baseFilteredAdvances.filter((advance) => advance.status === 'partially_paid' || (getPaymentProgress(advance) > 0 && getPaymentProgress(advance) < 100)).length,
      legalizing: baseFilteredAdvances.filter((advance) => advance.status === 'partially_paid' || advance.status === 'paid' || advance.status === 'approved').length,
      conciliation: baseFilteredAdvances.filter((advance) => advance.status === 'completed').length,
      closed: baseFilteredAdvances.filter((advance) => advance.status === 'closed' || advance.reconciliationStatus === 'reconciled').length,
    };
  }, [baseFilteredAdvances, filteredAdvances]);

  const statusFilters: Array<{ id: StatusFilter; label: string; count: number }> = [
    { id: 'all', label: 'Todos', count: baseFilteredAdvances.length },
    { id: 'submitted', label: 'Por aprobar', count: totals.submitted },
    { id: 'pending_payment', label: 'Por pagar', count: totals.pendingPayment },
    { id: 'legalization', label: 'Legalización', count: totals.legalizing },
    { id: 'completed', label: 'Conciliación', count: totals.conciliation },
    { id: 'closed', label: 'Conciliados', count: totals.closed },
    { id: 'returned', label: 'Devueltos', count: baseFilteredAdvances.filter((advance) => advance.status === 'returned').length },
  ];

  return (
    <DashboardLayout>
      <div className="space-y-5">
        <section className="rounded-lg bg-slate-950 p-5 text-white shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <div className="inline-flex items-center gap-2 rounded-md border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-[11px] font-black uppercase tracking-[0.22em] text-emerald-200">
                <BriefcaseBusiness size={14} />
                Administrativo general
              </div>
              <h1 className="mt-3 text-2xl font-black tracking-tight sm:text-3xl">Control administrativo de anticipos</h1>
              <p className="mt-2 text-sm font-semibold leading-6 text-slate-300">
                Agrupa los anticipos de los proyectos donde tienes alcance administrativo, con filtros por proyecto,
                organización, estado y búsqueda operativa.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2 text-right sm:grid-cols-4">
              <div className="rounded-lg border border-white/10 bg-white/5 p-3">
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Proyectos</p>
                <p className="mt-1 text-xl font-black">{visibleProjects.length}</p>
              </div>
              <div className="rounded-lg border border-white/10 bg-white/5 p-3">
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Anticipos</p>
                <p className="mt-1 text-xl font-black">{filteredAdvances.length}</p>
              </div>
              <div className="rounded-lg border border-white/10 bg-white/5 p-3">
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Por pagar</p>
                <p className="mt-1 text-xl font-black">{totals.pendingPayment}</p>
              </div>
              <div className="rounded-lg border border-white/10 bg-white/5 p-3">
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Conciliación</p>
                <p className="mt-1 text-xl font-black">{totals.conciliation}</p>
              </div>
            </div>
          </div>
        </section>

        {!canAccessAdministration && !permissionsLoading ? (
          <EmptyState canAccess={false} />
        ) : (
          <>
            <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
              <MetricCard label="Solicitado" value={formatMoney(totals.requested)} detail="Total filtrado" icon={<WalletCards size={20} />} tone="indigo" />
              <MetricCard label="Aprobado" value={formatMoney(totals.approved)} detail={`${totals.submitted} por aprobar`} icon={<ClipboardCheck size={20} />} tone="amber" />
              <MetricCard label="Pagado / abonado" value={formatMoney(totals.paid)} detail={`${totals.paymentProgress}% desembolsado · ${totals.partiallyPaid} abonados`} icon={<CreditCard size={20} />} tone="sky" />
              <MetricCard label="Justificado" value={formatMoney(totals.justified)} detail={`${totals.legalizing} en legalización`} icon={<ReceiptText size={20} />} tone="sky" />
              <MetricCard label="Legalizado" value={formatMoney(totals.legalized)} detail={`${totals.conciliation} en conciliación`} icon={<CheckCircle2 size={20} />} tone="emerald" />
              <MetricCard label="Costo real" value={formatMoney(totals.costReal)} detail={`${totals.closed} conciliados`} icon={<Banknote size={20} />} tone="rose" />
            </section>

            <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <div className="grid gap-3 lg:grid-cols-[minmax(220px,1fr)_220px_220px_220px_auto]">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    value={searchTerm}
                    onChange={(event) => setSearchTerm(event.target.value)}
                    placeholder="Buscar por ID, solicitante, proyecto, municipio o justificación..."
                    className="h-11 w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-10 pr-4 text-sm font-semibold text-slate-700 outline-none transition focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-500/15"
                  />
                </div>
                <select
                  value={selectedOrganizationId}
                  onChange={(event) => setSelectedOrganizationId(event.target.value)}
                  className="h-11 rounded-lg border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/15"
                >
                  <option value="all">Todas las organizaciones</option>
                  {visibleOrganizations.map((organization) => (
                    <option key={organization.id} value={organization.id}>{organization.name || organization.id}</option>
                  ))}
                </select>
                <select
                  value={activeSelectedProjectId}
                  onChange={(event) => setSelectedProjectId(event.target.value)}
                  className="h-11 rounded-lg border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/15"
                >
                  <option value="all">Todos los proyectos</option>
                  {visibleProjects.map((project) => (
                    <option key={project.id} value={project.id}>{project.name || project.id}</option>
                  ))}
                </select>
                <select
                  value={statusFilter}
                  onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
                  className="h-11 rounded-lg border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/15"
                >
                  {statusFilters.map((filter) => (
                    <option key={filter.id} value={filter.id}>{filter.label}</option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => setShowClosed((current) => !current)}
                  className={`h-11 rounded-lg border px-4 text-sm font-black transition ${
                    showClosed
                      ? 'border-teal-200 bg-teal-50 text-teal-700'
                      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {showClosed ? 'Ocultar conciliados' : 'Mostrar conciliados'}
                </button>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {statusFilters.map((filter) => (
                  <button
                    key={filter.id}
                    type="button"
                    onClick={() => setStatusFilter(filter.id)}
                    className={`rounded-lg border px-3 py-2 text-xs font-black transition ${
                      statusFilter === filter.id
                        ? 'border-indigo-200 bg-indigo-600 text-white shadow-sm'
                        : 'border-slate-200 bg-slate-50 text-slate-600 hover:border-indigo-100 hover:bg-indigo-50 hover:text-indigo-700'
                    }`}
                  >
                    {filter.label}
                    <span className={`ml-2 rounded-md px-1.5 py-0.5 ${statusFilter === filter.id ? 'bg-white/20 text-white' : 'bg-white text-slate-500'}`}>
                      {filter.count}
                    </span>
                  </button>
                ))}
              </div>
            </section>

            {loading || permissionsLoading ? (
              <div className="rounded-lg border border-slate-200 bg-white px-6 py-16 text-center text-sm font-semibold text-slate-500 shadow-sm">
                Cargando tablero administrativo...
              </div>
            ) : filteredAdvances.length === 0 ? (
              <EmptyState canAccess />
            ) : (
              <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
                <div className="border-b border-slate-100 bg-slate-50 px-4 py-3">
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                    <h2 className="text-sm font-black uppercase tracking-[0.18em] text-slate-500">Anticipos por controlar</h2>
                    <p className="text-xs font-bold text-slate-400">{filteredAdvances.length} registros filtrados</p>
                  </div>
                </div>
                <div className="divide-y divide-slate-100">
                  {filteredAdvances.map((advance) => {
                    const project = projectById.get(advance.projectId);
                    const meta = getAdvanceStatusMeta(advance.status);
                    const receipts = advance.receipts || [];
                    const approvedReceipts = receipts.filter(isApprovedReceipt).length;
                    const justifiedAmount = getJustifiedAmount(advance);
                    const paidAmount = getPaidAmount(advance);
                    const paymentProgress = getPaymentProgress(advance);
                    const adminUrl = `/projects/${advance.projectId}?tab=administration`;

                    return (
                      <article key={`${advance.projectId}-${advance.id}`} className="p-4 transition hover:bg-slate-50/70">
                        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className={`inline-flex items-center gap-2 rounded-md px-2.5 py-1 text-[11px] font-black uppercase tracking-[0.14em] ring-1 ${meta.className}`}>
                                <span className={`h-2 w-2 rounded-full ${meta.dotClassName}`} />
                                {meta.label}
                              </span>
                              {advance.customId && (
                                <span className="rounded-md bg-slate-100 px-2 py-1 text-[11px] font-black uppercase tracking-[0.14em] text-slate-600">
                                  ID {advance.customId}
                                </span>
                              )}
                              <span className="rounded-md bg-indigo-50 px-2 py-1 text-[11px] font-black uppercase tracking-[0.14em] text-indigo-700">
                                {project?.name || 'Proyecto sin nombre'}
                              </span>
                            </div>
                            <h3 className="mt-3 text-xl font-black tracking-tight text-slate-950">{advance.destination || 'Sin destino'}</h3>
                            <p className="mt-1 line-clamp-2 text-sm font-semibold leading-6 text-slate-600">{advance.purpose || 'Sin justificación registrada'}</p>
                            <div className="mt-3 flex flex-wrap gap-2 text-xs font-black text-slate-600">
                              <span className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1">
                                <FolderKanban size={14} className="text-indigo-500" />
                                {organizationNameFor(project || {}, organizations)}
                              </span>
                              <span className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1">
                                <MapPin size={14} className="text-slate-400" />
                                {[advance.municipality, advance.department].filter(Boolean).join(', ') || 'Sin ubicación'}
                              </span>
                              <span className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1">
                                <CalendarDays size={14} className="text-slate-400" />
                                {formatDate(advance.travelStart)} - {formatDate(advance.travelEnd)}
                              </span>
                            </div>
                          </div>

                          <div className="grid gap-2 sm:grid-cols-4 xl:w-[680px]">
                            <div className="rounded-lg border border-slate-200 bg-white p-3">
                              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Solicitado</p>
                              <p className="mt-1 text-base font-black text-slate-950">{formatMoney(advance.amountRequested)}</p>
                            </div>
                            <div className="rounded-lg border border-fuchsia-100 bg-fuchsia-50/40 p-3">
                              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-fuchsia-500">Pagado</p>
                              <p className="mt-1 text-base font-black text-fuchsia-700">{formatMoney(paidAmount)} · {paymentProgress}%</p>
                            </div>
                            <div className="rounded-lg border border-indigo-100 bg-indigo-50/40 p-3">
                              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-indigo-400">Justificado</p>
                              <p className="mt-1 text-base font-black text-indigo-700">{formatMoney(justifiedAmount)}</p>
                            </div>
                            <div className="rounded-lg border border-emerald-100 bg-emerald-50/40 p-3">
                              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-emerald-500">Legalizado</p>
                              <p className="mt-1 text-base font-black text-emerald-700">{formatMoney(advance.amountLegalized)}</p>
                            </div>
                          </div>
                        </div>

                        <div className="mt-4 flex flex-col gap-3 border-t border-slate-100 pt-4 lg:flex-row lg:items-center lg:justify-between">
                          <div className="flex flex-wrap gap-2 text-xs font-black">
                            <span className="rounded-md bg-slate-100 px-2 py-1 text-slate-600">{advance.requesterName || 'Solicitante sin nombre'}</span>
                            <span className="rounded-md bg-sky-50 px-2 py-1 text-sky-700">{receipts.length} soportes</span>
                            <span className="rounded-md bg-emerald-50 px-2 py-1 text-emerald-700">{approvedReceipts} aprobados</span>
                            {paidAmount > 0 && <span className="rounded-md bg-violet-50 px-2 py-1 text-violet-700">{paymentProgress >= 100 ? 'Pago registrado' : `Abonado ${paymentProgress}%`}</span>}
                          </div>
                          <div className="flex flex-col gap-2 sm:flex-row">
                            <Link
                              href={adminUrl}
                              className="inline-flex h-10 items-center justify-center rounded-lg border border-slate-200 bg-white px-4 text-sm font-black text-slate-700 transition hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700"
                            >
                              <FileText size={16} className="mr-2" />
                              Ver módulo
                            </Link>
                            <Link
                              href={adminUrl}
                              className="inline-flex h-10 items-center justify-center rounded-lg bg-indigo-600 px-4 text-sm font-black text-white shadow-sm transition hover:bg-indigo-700"
                            >
                              Gestionar
                              <ArrowRight size={16} className="ml-2" />
                            </Link>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
