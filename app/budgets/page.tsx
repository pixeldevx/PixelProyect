"use client"

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  ArrowRight,
  BriefcaseBusiness,
  CalendarRange,
  CheckCircle2,
  CircleDollarSign,
  Gauge,
  Layers3,
  Search,
  Sparkles,
  Users,
  WalletCards,
} from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Progress } from '@/components/ui/progress';
import { collection, onSnapshot, query } from '@/lib/supabase/document-store';
import { db } from '@/lib/backend';
import { useAuth } from '@/hooks/useAuth';
import { belongsToAnyOrganization, organizationNameFor } from '@/lib/organizations';

type ProjectRow = {
  id: string;
  name?: string;
  description?: string;
  assignedTeamMembers?: string[];
  organizationId?: string;
  organizationIds?: string[];
  organizationName?: string;
};

type BudgetPiece = {
  id?: string;
  name?: string;
  category?: string;
  startMonth?: number;
  activeMonths?: number[];
  assignedMemberIds?: string[];
  quantity?: number;
  duration?: number;
  multiplier?: number;
  unitCost?: number;
  unitLabel?: string;
};

type BudgetLine = {
  id: string;
  projectId: string;
  projectName: string;
  name?: string;
  color?: string;
  plannedAmount?: number;
  currency?: string;
  components?: BudgetPiece[];
};

type RateCard = {
  id: string;
  projectId: string;
  budgetLineId?: string;
  currentValue?: number;
  reworkValue?: number;
  rate?: number;
  userStats?: Record<string, number>;
  userReworkStats?: Record<string, number>;
};

type PersonBudgetRow = {
  key: string;
  memberId: string;
  memberName: string;
  memberEmail: string;
  roleName: string;
  projectId: string;
  projectName: string;
  organizationName: string;
  allocated: number;
  spent: number;
  utilization: number;
  status: 'uncovered' | 'exhausted' | 'risk' | 'covered';
};

type PersonMonthlyCoverageRow = {
  key: string;
  memberId: string;
  memberName: string;
  memberEmail: string;
  roleName: string;
  projectId: string;
  projectName: string;
  organizationName: string;
  totalAllocated: number;
  monthlyAmounts: Record<number, number>;
  firstCoveredMonth: number | null;
  lastCoveredMonth: number | null;
  firstGapMonth: number | null;
  status: 'uncovered' | 'gap' | 'covered';
};

const ACCESS_ROLES = new Set(['admin', 'org_admin', 'manager', 'coordinador']);
const MONTH_LABELS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

const currencyFormatter = (value: number, currency = 'COP') =>
  new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency,
    maximumFractionDigits: currency === 'COP' ? 0 : 2,
  }).format(Number.isFinite(value) ? value : 0);

const compactNumber = (value: number) => new Intl.NumberFormat('es-CO').format(Number.isFinite(value) ? value : 0);

const normalizeIds = (value: any) =>
  Array.from(new Set((Array.isArray(value) ? value : []).map((item) => String(item || '').trim()).filter(Boolean)));

const clampMonthNumber = (value: any, fallback = 1) => Math.max(1, Math.round(Number.isFinite(Number(value)) ? Number(value) : fallback));

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
  Array.from({ length: Math.max(0, Math.ceil(Number(duration) || 0)) }, (_, index) => clampMonthNumber(startMonth) + index);

const getPieceActiveMonths = (piece: BudgetPiece) => {
  if (Array.isArray(piece.activeMonths) && piece.activeMonths.length > 0) {
    return normalizeActiveMonths(piece.activeMonths);
  }
  return buildContinuousMonths(clampMonthNumber(piece.startMonth), Math.max(1, Math.ceil(Number(piece.duration) || 1)));
};

const pieceTotal = (piece: BudgetPiece) =>
  Number(piece.quantity || 0) * getPieceActiveMonths(piece).length * Number(piece.multiplier || 0) * Number(piece.unitCost || 0);

const pieceMonthlyTotal = (piece: BudgetPiece) =>
  Number(piece.quantity || 0) * Number(piece.multiplier || 0) * Number(piece.unitCost || 0);

const rateCardTotal = (card: RateCard) => (Number(card.currentValue || 0) + Number(card.reworkValue || 0)) * Number(card.rate || 0);

const rateCardUserTotal = (card: RateCard, memberId: string) => {
  const produced = Number(card.userStats?.[memberId] || 0) * Number(card.rate || 0);
  const rework = Number(card.userReworkStats?.[memberId] || 0) * Number(card.rate || 0);
  return produced + rework;
};

const statusConfig = {
  uncovered: {
    label: 'Sin presupuesto',
    className: 'bg-red-50 text-red-700 ring-red-100',
    bar: 'bg-red-500',
  },
  exhausted: {
    label: 'Agotado',
    className: 'bg-red-50 text-red-700 ring-red-100',
    bar: 'bg-red-500',
  },
  risk: {
    label: 'En riesgo',
    className: 'bg-orange-50 text-orange-700 ring-orange-100',
    bar: 'bg-orange-500',
  },
  covered: {
    label: 'Cubierto',
    className: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
    bar: 'bg-emerald-500',
  },
};

function BudgetMetricCard({
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
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">{label}</p>
          <p className="mt-2 truncate text-3xl font-black tracking-tight text-slate-950">{value}</p>
          <p className="mt-1 text-sm font-bold text-slate-500">{detail}</p>
        </div>
        <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg ring-1 ${tone}`}>
          {icon}
        </div>
      </div>
    </div>
  );
}

export default function BudgetsOverviewPage() {
  const { user, userRole, userOrganizationId, userOrganizationIds } = useAuth();
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [organizations, setOrganizations] = useState<any[]>([]);
  const [teamMembers, setTeamMembers] = useState<any[]>([]);
  const [budgetLinesByProject, setBudgetLinesByProject] = useState<Record<string, BudgetLine[]>>({});
  const [rateCardsByProject, setRateCardsByProject] = useState<Record<string, RateCard[]>>({});
  const [selectedProjectId, setSelectedProjectId] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [peopleFilter, setPeopleFilter] = useState<'all' | 'alerts' | 'uncovered' | 'exhausted'>('alerts');
  const [budgetView, setBudgetView] = useState<'overview' | 'monthly'>('overview');
  const [loading, setLoading] = useState(true);

  const managedOrganizationIds = useMemo(
    () => (userOrganizationIds.length > 0 ? userOrganizationIds : userOrganizationId ? [userOrganizationId] : []),
    [userOrganizationId, userOrganizationIds]
  );

  const canAccessBudgets = ACCESS_ROLES.has(userRole || '');
  const canSeeAllOrganizations = userRole === 'admin' && managedOrganizationIds.length === 0;

  useEffect(() => {
    if (!user || !canAccessBudgets) return;

    const unsubscribeOrganizations = onSnapshot(
      query(collection(db, 'organizations')),
      (snapshot) => setOrganizations(snapshot.docs.map((orgDoc) => ({ id: orgDoc.id, ...orgDoc.data() }))),
      (error) => console.error('Error loading budget organizations:', error)
    );

    const unsubscribeProjects = onSnapshot(
      query(collection(db, 'projects')),
      (snapshot) => {
        const data = snapshot.docs.map((projectDoc) => ({ id: projectDoc.id, ...projectDoc.data() } as ProjectRow));
        data.sort((left, right) => String(left.name || '').localeCompare(String(right.name || '')));
        setProjects(data);
        setLoading(false);
      },
      (error) => {
        console.error('Error loading budget projects:', error);
        setLoading(false);
      }
    );

    const unsubscribeTeam = onSnapshot(
      query(collection(db, 'team_members')),
      (snapshot) => setTeamMembers(snapshot.docs.map((memberDoc) => ({ id: memberDoc.id, ...memberDoc.data() }))),
      (error) => console.error('Error loading budget team members:', error)
    );

    return () => {
      unsubscribeOrganizations();
      unsubscribeProjects();
      unsubscribeTeam();
    };
  }, [canAccessBudgets, user]);

  const scopedProjects = useMemo(() => {
    if (canSeeAllOrganizations) return projects;
    return projects.filter((project) => managedOrganizationIds.length > 0 && belongsToAnyOrganization(project, managedOrganizationIds));
  }, [canSeeAllOrganizations, managedOrganizationIds, projects]);

  useEffect(() => {
    if (!user || !canAccessBudgets || scopedProjects.length === 0) {
      return;
    }

    const unsubscribes = scopedProjects.flatMap((project) => [
      onSnapshot(
        query(collection(db, 'projects', project.id, 'budgetLines')),
        (snapshot) => {
          const lines = snapshot.docs.map((lineDoc) => ({
            id: lineDoc.id,
            projectId: project.id,
            projectName: project.name || 'Proyecto',
            ...lineDoc.data(),
          } as BudgetLine));
          setBudgetLinesByProject((current) => ({ ...current, [project.id]: lines }));
        },
        (error) => console.error(`Error loading budget lines for ${project.id}:`, error)
      ),
      onSnapshot(
        query(collection(db, 'projects', project.id, 'rateCards')),
        (snapshot) => {
          const rateCards = snapshot.docs.map((rateCardDoc) => ({
            id: rateCardDoc.id,
            projectId: project.id,
            ...rateCardDoc.data(),
          } as RateCard));
          setRateCardsByProject((current) => ({ ...current, [project.id]: rateCards }));
        },
        (error) => console.error(`Error loading budget rate cards for ${project.id}:`, error)
      ),
    ]);

    return () => unsubscribes.forEach((unsubscribe) => unsubscribe());
  }, [canAccessBudgets, scopedProjects, user]);

  const projectById = useMemo(() => new Map(scopedProjects.map((project) => [project.id, project])), [scopedProjects]);
  const memberById = useMemo(() => new Map(teamMembers.map((member) => [member.id, member])), [teamMembers]);

  const visibleProjects = useMemo(() => {
    if (selectedProjectId === 'all') return scopedProjects;
    return scopedProjects.filter((project) => project.id === selectedProjectId);
  }, [scopedProjects, selectedProjectId]);

  const visibleProjectIds = useMemo(() => new Set(visibleProjects.map((project) => project.id)), [visibleProjects]);

  const allBudgetLines = useMemo(
    () => visibleProjects.flatMap((project) => budgetLinesByProject[project.id] || []),
    [budgetLinesByProject, visibleProjects]
  );

  const allRateCards = useMemo(
    () => visibleProjects.flatMap((project) => rateCardsByProject[project.id] || []),
    [rateCardsByProject, visibleProjects]
  );

  const lineActualsByKey = useMemo(() => {
    const map = new Map<string, number>();
    allRateCards.forEach((card) => {
      if (!card.budgetLineId) return;
      const key = `${card.projectId}::${card.budgetLineId}`;
      map.set(key, (map.get(key) || 0) + rateCardTotal(card));
    });
    return map;
  }, [allRateCards]);

  const personRows = useMemo<PersonBudgetRow[]>(() => {
    const allocation = new Map<string, number>();
    const spent = new Map<string, number>();

    allBudgetLines.forEach((line) => {
      (line.components || []).forEach((piece) => {
        const assignedIds = normalizeIds(piece.assignedMemberIds);
        if (assignedIds.length === 0) return;
        const allocationPerPerson = pieceTotal(piece) / assignedIds.length;
        assignedIds.forEach((memberId) => {
          const key = `${line.projectId}::${memberId}`;
          allocation.set(key, (allocation.get(key) || 0) + allocationPerPerson);
        });
      });
    });

    allRateCards.forEach((card) => {
      if (!card.budgetLineId) return;
      Object.keys({ ...(card.userStats || {}), ...(card.userReworkStats || {}) }).forEach((memberId) => {
        const key = `${card.projectId}::${memberId}`;
        spent.set(key, (spent.get(key) || 0) + rateCardUserTotal(card, memberId));
      });
    });

    return visibleProjects.flatMap((project) => {
      const organizationName = organizationNameFor(project, organizations);
      const assignedIds = normalizeIds(project.assignedTeamMembers);
      return assignedIds.map((memberId) => {
        const key = `${project.id}::${memberId}`;
        const member = memberById.get(memberId);
        const allocated = allocation.get(key) || 0;
        const consumed = spent.get(key) || 0;
        const utilization = allocated > 0 ? (consumed / allocated) * 100 : consumed > 0 ? 100 : 0;
        const status: PersonBudgetRow['status'] =
          allocated <= 0 ? 'uncovered' : utilization >= 100 ? 'exhausted' : utilization >= 85 ? 'risk' : 'covered';

        return {
          key,
          memberId,
          memberName: member?.name || member?.displayName || member?.email || 'Profesional',
          memberEmail: member?.email || '',
          roleName: member?.roleName || member?.role || 'Sin rol',
          projectId: project.id,
          projectName: project.name || 'Proyecto',
          organizationName,
          allocated,
          spent: consumed,
          utilization,
          status,
        };
      });
    });
  }, [allBudgetLines, allRateCards, memberById, organizations, visibleProjects]);

  const projectStats = useMemo(() => {
    return visibleProjects
      .map((project) => {
        const lines = budgetLinesByProject[project.id] || [];
        const planned = lines.reduce((sum, line) => sum + Number(line.plannedAmount || 0), 0);
        const actual = (rateCardsByProject[project.id] || []).reduce((sum, card) => sum + rateCardTotal(card), 0);
        const projectPeople = personRows.filter((row) => row.projectId === project.id);
        const uncovered = projectPeople.filter((row) => row.status === 'uncovered').length;
        const exhausted = projectPeople.filter((row) => row.status === 'exhausted').length;
        const utilization = planned > 0 ? (actual / planned) * 100 : 0;
        return {
          project,
          planned,
          actual,
          available: planned - actual,
          utilization,
          lines: lines.length,
          uncovered,
          exhausted,
          organizationName: organizationNameFor(project, organizations),
        };
      })
      .sort((left, right) => right.utilization - left.utilization || String(left.project.name || '').localeCompare(String(right.project.name || '')));
  }, [budgetLinesByProject, organizations, personRows, rateCardsByProject, visibleProjects]);

  const filteredPeopleRows = useMemo(() => {
    const search = searchTerm.trim().toLowerCase();
    return personRows
      .filter((row) => {
        if (peopleFilter === 'alerts') return row.status !== 'covered';
        if (peopleFilter === 'uncovered') return row.status === 'uncovered';
        if (peopleFilter === 'exhausted') return row.status === 'exhausted';
        return true;
      })
      .filter((row) => {
        if (!search) return true;
        return [row.memberName, row.memberEmail, row.projectName, row.organizationName, row.roleName]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(search));
      })
      .sort((left, right) => {
        const weight = { exhausted: 0, uncovered: 1, risk: 2, covered: 3 };
        return weight[left.status] - weight[right.status] || right.utilization - left.utilization || left.memberName.localeCompare(right.memberName);
      });
  }, [peopleFilter, personRows, searchTerm]);

  const coverageMonths = useMemo(() => {
    const maxMonth = Math.max(
      12,
      ...allBudgetLines.flatMap((line) =>
        (line.components || []).flatMap((piece) => {
          const activeMonths = getPieceActiveMonths(piece);
          const projectedEnd = clampMonthNumber(piece.startMonth) + Math.max(0, Math.ceil(Number(piece.duration) || 0)) - 1;
          return [...activeMonths, projectedEnd];
        })
      )
    );
    return Array.from({ length: maxMonth }, (_, index) => index + 1);
  }, [allBudgetLines]);

  const monthlyCoverageRows = useMemo<PersonMonthlyCoverageRow[]>(() => {
    const monthlyAllocation = new Map<string, Record<number, number>>();

    allBudgetLines.forEach((line) => {
      (line.components || []).forEach((piece) => {
        const assignedIds = normalizeIds(piece.assignedMemberIds);
        if (assignedIds.length === 0) return;

        const monthlyAmountPerPerson = pieceMonthlyTotal(piece) / assignedIds.length;
        getPieceActiveMonths(piece).forEach((monthNumber) => {
          assignedIds.forEach((memberId) => {
            const key = `${line.projectId}::${memberId}`;
            const current = monthlyAllocation.get(key) || {};
            current[monthNumber] = (current[monthNumber] || 0) + monthlyAmountPerPerson;
            monthlyAllocation.set(key, current);
          });
        });
      });
    });

    const search = searchTerm.trim().toLowerCase();

    return visibleProjects
      .flatMap((project) => {
        const organizationName = organizationNameFor(project, organizations);
        return normalizeIds(project.assignedTeamMembers).map((memberId) => {
          const key = `${project.id}::${memberId}`;
          const member = memberById.get(memberId);
          const monthlyAmounts = monthlyAllocation.get(key) || {};
          const activeMonths = coverageMonths.filter((monthNumber) => Number(monthlyAmounts[monthNumber] || 0) > 0);
          const firstCoveredMonth = activeMonths[0] || null;
          const lastCoveredMonth = activeMonths[activeMonths.length - 1] || null;
          const firstGapMonth = firstCoveredMonth
            ? coverageMonths.find((monthNumber) => monthNumber >= firstCoveredMonth && Number(monthlyAmounts[monthNumber] || 0) <= 0) || null
            : null;
          const totalAllocated = Object.values(monthlyAmounts).reduce((sum, value) => sum + Number(value || 0), 0);
          const status: PersonMonthlyCoverageRow['status'] =
            totalAllocated <= 0 ? 'uncovered' : firstGapMonth ? 'gap' : 'covered';

          return {
            key,
            memberId,
            memberName: member?.name || member?.displayName || member?.email || 'Profesional',
            memberEmail: member?.email || '',
            roleName: member?.roleName || member?.role || 'Sin rol',
            projectId: project.id,
            projectName: project.name || 'Proyecto',
            organizationName,
            totalAllocated,
            monthlyAmounts,
            firstCoveredMonth,
            lastCoveredMonth,
            firstGapMonth,
            status,
          };
        });
      })
      .filter((row) => {
        if (!search) return true;
        return [row.memberName, row.memberEmail, row.projectName, row.organizationName, row.roleName]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(search));
      })
      .sort((left, right) => {
        const weight = { uncovered: 0, gap: 1, covered: 2 };
        return weight[left.status] - weight[right.status] || left.memberName.localeCompare(right.memberName) || left.projectName.localeCompare(right.projectName);
      });
  }, [allBudgetLines, coverageMonths, memberById, organizations, searchTerm, visibleProjects]);

  const filteredBudgetLines = useMemo(() => {
    const search = searchTerm.trim().toLowerCase();
    return allBudgetLines
      .filter((line) => {
        if (!search) return true;
        const project = projectById.get(line.projectId);
        return [line.name, line.projectName, project?.description, organizationNameFor(project || {}, organizations)]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(search));
      })
      .sort((left, right) => {
        const leftActual = lineActualsByKey.get(`${left.projectId}::${left.id}`) || 0;
        const rightActual = lineActualsByKey.get(`${right.projectId}::${right.id}`) || 0;
        const leftUsage = Number(left.plannedAmount || 0) > 0 ? leftActual / Number(left.plannedAmount || 0) : 0;
        const rightUsage = Number(right.plannedAmount || 0) > 0 ? rightActual / Number(right.plannedAmount || 0) : 0;
        return rightUsage - leftUsage;
      });
  }, [allBudgetLines, lineActualsByKey, organizations, projectById, searchTerm]);

  const totals = useMemo(() => {
    const planned = allBudgetLines.reduce((sum, line) => sum + Number(line.plannedAmount || 0), 0);
    const actual = allRateCards.reduce((sum, card) => sum + rateCardTotal(card), 0);
    const uncovered = personRows.filter((row) => row.status === 'uncovered').length;
    const exhausted = personRows.filter((row) => row.status === 'exhausted').length;
    return {
      planned,
      actual,
      available: planned - actual,
      usage: planned > 0 ? (actual / planned) * 100 : 0,
      uncovered,
      exhausted,
    };
  }, [allBudgetLines, allRateCards, personRows]);

  if (!canAccessBudgets) {
    return (
      <DashboardLayout>
        <div className="rounded-lg border border-slate-200 bg-white p-8 text-center shadow-sm">
          <WalletCards className="mx-auto h-12 w-12 text-slate-300" />
          <h1 className="mt-4 text-2xl font-black text-slate-950">Acceso restringido</h1>
          <p className="mx-auto mt-2 max-w-xl text-sm font-medium text-slate-500">
            El tablero global de presupuestos está disponible para coordinadores, gerentes y administradores.
          </p>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="relative p-5">
            <div className="absolute right-6 top-5 hidden h-28 w-28 rounded-full bg-emerald-100/70 blur-2xl lg:block" />
            <div className="absolute right-28 top-16 hidden h-24 w-24 rounded-full bg-cyan-100/70 blur-2xl lg:block" />
            <div className="relative flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
              <div className="max-w-4xl">
                <div className="mb-3 inline-flex items-center gap-2 rounded bg-emerald-50 px-3 py-1 text-[11px] font-black uppercase tracking-[0.16em] text-emerald-700 ring-1 ring-emerald-100">
                  <Sparkles size={14} />
                  Control financiero inteligente
                </div>
                <h1 className="flex items-center gap-3 text-3xl font-black tracking-tight text-slate-950">
                  <WalletCards size={30} className="text-emerald-600" />
                  Presupuestos globales
                </h1>
                <p className="mt-2 text-base font-medium text-slate-500">
                  Mira todos los presupuestos de tus proyectos, detecta personas sin cobertura y anticipa líneas agotadas antes de que afecten la operación.
                </p>
              </div>
              <div className={`rounded-lg px-4 py-3 ring-1 ${totals.exhausted > 0 || totals.uncovered > 0 ? 'bg-red-50 text-red-700 ring-red-100' : 'bg-emerald-50 text-emerald-700 ring-emerald-100'}`}>
                <p className="text-[10px] font-black uppercase tracking-[0.16em]">Pulso financiero</p>
                <p className="mt-1 text-2xl font-black">{Math.round(totals.usage)}%</p>
                <p className="text-sm font-bold">{totals.exhausted || totals.uncovered ? 'Requiere atención' : 'Bajo control'}</p>
              </div>
            </div>
          </div>
        </section>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
          <BudgetMetricCard label="Planificado" value={currencyFormatter(totals.planned)} detail={`${compactNumber(allBudgetLines.length)} líneas`} icon={<CircleDollarSign size={22} />} tone="bg-emerald-50 text-emerald-700 ring-emerald-100" />
          <BudgetMetricCard label="Ejecutado" value={currencyFormatter(totals.actual)} detail={`${totals.usage.toFixed(1)}% consumido`} icon={<Gauge size={22} />} tone="bg-indigo-50 text-indigo-700 ring-indigo-100" />
          <BudgetMetricCard label="Disponible" value={currencyFormatter(totals.available)} detail="Bolsa viva por proyectos" icon={<CheckCircle2 size={22} />} tone={totals.available >= 0 ? 'bg-cyan-50 text-cyan-700 ring-cyan-100' : 'bg-red-50 text-red-700 ring-red-100'} />
          <BudgetMetricCard label="Sin cobertura" value={compactNumber(totals.uncovered)} detail="Personas sin pieza asignada" icon={<Users size={22} />} tone="bg-orange-50 text-orange-700 ring-orange-100" />
          <BudgetMetricCard label="Agotados" value={compactNumber(totals.exhausted)} detail="Presupuestos personales al límite" icon={<AlertTriangle size={22} />} tone="bg-red-50 text-red-700 ring-red-100" />
        </div>

        <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setSelectedProjectId('all')}
                className={`inline-flex h-9 items-center gap-2 rounded border px-3 text-xs font-black uppercase tracking-[0.12em] transition ${
                  selectedProjectId === 'all' ? 'border-emerald-600 bg-emerald-600 text-white shadow-sm' : 'border-slate-200 bg-white text-slate-600 hover:border-emerald-200 hover:bg-emerald-50'
                }`}
              >
                Global
                <span className={`rounded px-1.5 py-0.5 text-[10px] ${selectedProjectId === 'all' ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'}`}>
                  {compactNumber(scopedProjects.length)}
                </span>
              </button>
              {scopedProjects.slice(0, 8).map((project) => (
                <button
                  key={project.id}
                  type="button"
                  onClick={() => setSelectedProjectId(project.id)}
                  className={`inline-flex h-9 items-center gap-2 rounded border px-3 text-xs font-black uppercase tracking-[0.12em] transition ${
                    selectedProjectId === project.id ? 'border-emerald-600 bg-emerald-600 text-white shadow-sm' : 'border-slate-200 bg-white text-slate-600 hover:border-emerald-200 hover:bg-emerald-50'
                  }`}
                >
                  {project.name || 'Proyecto'}
                  <span className={`rounded px-1.5 py-0.5 text-[10px] ${selectedProjectId === project.id ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'}`}>
                    {compactNumber((budgetLinesByProject[project.id] || []).length)}
                  </span>
                </button>
              ))}
            </div>
            <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
              <div className="inline-flex h-10 rounded-md bg-slate-100 p-1 ring-1 ring-slate-200">
                <button
                  type="button"
                  onClick={() => setBudgetView('overview')}
                  className={`rounded px-3 text-sm font-black transition ${
                    budgetView === 'overview' ? 'bg-white text-emerald-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  Vista general
                </button>
                <button
                  type="button"
                  onClick={() => setBudgetView('monthly')}
                  className={`rounded px-3 text-sm font-black transition ${
                    budgetView === 'monthly' ? 'bg-white text-emerald-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  Cobertura mensual
                </button>
              </div>
              <div className="relative lg:w-96">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  className="h-10 w-full rounded-md border border-slate-200 bg-white pl-10 pr-3 text-sm font-medium text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10"
                  placeholder="Buscar proyecto, persona, línea u organización..."
                />
              </div>
              {budgetView === 'overview' && (
                <select
                  value={peopleFilter}
                  onChange={(event) => setPeopleFilter(event.target.value as any)}
                  className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm font-bold text-slate-600 outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10"
                >
                  <option value="alerts">Solo alertas de personal</option>
                  <option value="all">Todo el personal</option>
                  <option value="uncovered">Sin presupuesto</option>
                  <option value="exhausted">Presupuesto agotado</option>
                </select>
              )}
            </div>
          </div>
        </section>

        {budgetView === 'monthly' && (
          <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 p-4">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
              <div>
                <h2 className="flex items-center gap-2 text-xl font-black tracking-tight text-slate-950">
                  <CalendarRange size={20} className="text-emerald-600" />
                  Cobertura mensual por persona
                </h2>
                <p className="text-sm font-medium text-slate-500">
                  Cruza personas, proyectos y meses para anticipar cuándo alguien queda sin cobertura presupuestal.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <span className="rounded bg-slate-100 px-3 py-1 text-xs font-black uppercase tracking-[0.12em] text-slate-600">
                  {compactNumber(monthlyCoverageRows.length)} filas
                </span>
                <span className="rounded bg-red-50 px-3 py-1 text-xs font-black uppercase tracking-[0.12em] text-red-700 ring-1 ring-red-100">
                  {compactNumber(monthlyCoverageRows.filter((row) => row.status === 'uncovered').length)} sin cobertura
                </span>
                <span className="rounded bg-orange-50 px-3 py-1 text-xs font-black uppercase tracking-[0.12em] text-orange-700 ring-1 ring-orange-100">
                  {compactNumber(monthlyCoverageRows.filter((row) => row.status === 'gap').length)} con huecos
                </span>
              </div>
            </div>
          </div>
          {monthlyCoverageRows.length === 0 ? (
            <div className="py-14 text-center">
              <CalendarRange className="mx-auto h-12 w-12 text-slate-300" />
              <h3 className="mt-3 text-lg font-black text-slate-950">Sin cobertura mensual visible</h3>
              <p className="mt-1 text-sm font-medium text-slate-500">
                Vincula personas a piezas presupuestales para activar el mapa mensual.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1180px] text-left">
                <thead className="bg-slate-50 text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">
                  <tr>
                    <th className="sticky left-0 z-10 bg-slate-50 px-4 py-3">Persona / proyecto</th>
                    <th className="px-4 py-3 text-right">Total</th>
                    {coverageMonths.map((monthNumber) => (
                      <th key={`coverage-head-${monthNumber}`} className="px-2 py-3 text-center">
                        {getTimelineMonthLabel(monthNumber)}
                      </th>
                    ))}
                    <th className="px-4 py-3">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {monthlyCoverageRows.map((row) => {
                    const statusClassName =
                      row.status === 'uncovered'
                        ? 'bg-red-50 text-red-700 ring-red-100'
                        : row.status === 'gap'
                          ? 'bg-orange-50 text-orange-700 ring-orange-100'
                          : 'bg-emerald-50 text-emerald-700 ring-emerald-100';
                    const statusLabel =
                      row.status === 'uncovered'
                        ? 'Sin cobertura'
                        : row.status === 'gap'
                          ? `Hueco desde ${getTimelineMonthLabel(row.firstGapMonth || 1)}`
                          : 'Cobertura completa';

                    return (
                      <tr key={row.key} className="transition hover:bg-emerald-50/30">
                        <td className="sticky left-0 z-10 max-w-[340px] bg-white px-4 py-3 shadow-[1px_0_0_#e2e8f0]">
                          <Link href={`/projects/${row.projectId}?tab=budget`} className="block min-w-0">
                            <div className="flex items-center gap-3">
                              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-indigo-50 text-xs font-black uppercase text-indigo-700 ring-1 ring-indigo-100">
                                {(row.memberName || row.memberEmail || '?').charAt(0)}
                              </div>
                              <div className="min-w-0">
                                <p className="truncate text-sm font-black text-slate-950">{row.memberName}</p>
                                <p className="truncate text-xs font-bold text-slate-500">{row.projectName} · {row.roleName}</p>
                                <p className="truncate text-[10px] font-black uppercase tracking-[0.1em] text-emerald-700">{row.organizationName}</p>
                              </div>
                            </div>
                          </Link>
                        </td>
                        <td className="px-4 py-3 text-right text-sm font-black text-slate-950">
                          {currencyFormatter(row.totalAllocated)}
                        </td>
                        {coverageMonths.map((monthNumber) => {
                          const amount = Number(row.monthlyAmounts[monthNumber] || 0);
                          const isCovered = amount > 0;
                          const isGap = !isCovered && Boolean(row.firstCoveredMonth) && monthNumber >= Number(row.firstCoveredMonth);
                          const cellClassName = isCovered
                            ? 'bg-emerald-50 text-emerald-700 ring-emerald-100'
                            : isGap
                              ? 'bg-red-50 text-red-700 ring-red-100'
                              : 'bg-slate-50 text-slate-400 ring-slate-100';

                          return (
                            <td key={`${row.key}-${monthNumber}`} className="px-2 py-3">
                              <div
                                title={`${row.memberName} · ${row.projectName} · ${getTimelineMonthLabel(monthNumber)}: ${amount > 0 ? currencyFormatter(amount) : 'Sin cobertura'}`}
                                className={`mx-auto flex h-9 min-w-20 items-center justify-center rounded-md px-2 text-[10px] font-black ring-1 ${cellClassName}`}
                              >
                                {amount > 0 ? `$${compactNumber(amount)}` : isGap ? 'Hueco' : 'Sin'}
                              </div>
                            </td>
                          );
                        })}
                        <td className="px-4 py-3">
                          <div className="space-y-1">
                            <span className={`inline-flex rounded px-2 py-1 text-[10px] font-black uppercase tracking-[0.12em] ring-1 ${statusClassName}`}>
                              {statusLabel}
                            </span>
                            <p className="text-[11px] font-bold text-slate-500">
                              {row.lastCoveredMonth
                                ? `Último mes cubierto: ${getTimelineMonthLabel(row.lastCoveredMonth)}`
                                : 'No tiene meses cubiertos'}
                            </p>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          </section>
        )}

        {budgetView === 'overview' && (
          <>
            <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(420px,0.85fr)]">
              <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 p-4">
              <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
                <div>
                  <h2 className="flex items-center gap-2 text-xl font-black tracking-tight text-slate-950">
                    <Layers3 size={20} className="text-emerald-600" />
                    Presupuesto por proyecto
                  </h2>
                  <p className="text-sm font-medium text-slate-500">Vista ejecutiva de consumo, disponibilidad y alertas operativas.</p>
                </div>
                <span className="rounded bg-slate-100 px-3 py-1 text-xs font-black uppercase tracking-[0.12em] text-slate-600">
                  {compactNumber(projectStats.length)} proyectos
                </span>
              </div>
            </div>
            {loading ? (
              <div className="flex justify-center py-14">
                <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-emerald-600" />
              </div>
            ) : projectStats.length === 0 ? (
              <div className="py-14 text-center">
                <WalletCards className="mx-auto h-12 w-12 text-slate-300" />
                <h3 className="mt-3 text-lg font-black text-slate-950">No hay presupuestos visibles</h3>
                <p className="mt-1 text-sm font-medium text-slate-500">Crea líneas presupuestales dentro de los proyectos a los que tienes acceso.</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {projectStats.map((row) => {
                  const healthClass =
                    row.utilization >= 100
                      ? 'bg-red-50 text-red-700 ring-red-100'
                      : row.utilization >= 85
                        ? 'bg-orange-50 text-orange-700 ring-orange-100'
                        : 'bg-emerald-50 text-emerald-700 ring-emerald-100';
                  return (
                    <Link
                      key={row.project.id}
                      href={`/projects/${row.project.id}?tab=budget`}
                      className="block p-4 transition hover:bg-emerald-50/40"
                    >
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                        <div className="min-w-0">
                          <div className="mb-2 flex flex-wrap items-center gap-2">
                            <span className="rounded bg-emerald-50 px-2 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-emerald-700 ring-1 ring-emerald-100">
                              {row.organizationName}
                            </span>
                            <span className={`rounded px-2 py-1 text-[10px] font-black uppercase tracking-[0.12em] ring-1 ${healthClass}`}>
                              {row.utilization.toFixed(1)}% usado
                            </span>
                            {row.uncovered > 0 && (
                              <span className="rounded bg-orange-50 px-2 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-orange-700 ring-1 ring-orange-100">
                                {compactNumber(row.uncovered)} sin cobertura
                              </span>
                            )}
                            {row.exhausted > 0 && (
                              <span className="rounded bg-red-50 px-2 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-red-700 ring-1 ring-red-100">
                                {compactNumber(row.exhausted)} agotados
                              </span>
                            )}
                          </div>
                          <h3 className="truncate text-lg font-black text-slate-950">{row.project.name || 'Proyecto'}</h3>
                          <p className="mt-1 line-clamp-1 text-sm font-medium text-slate-500">{row.project.description || 'Sin descripción'}</p>
                        </div>
                        <div className="grid min-w-full grid-cols-2 gap-2 md:min-w-[520px] md:grid-cols-4">
                          <div className="rounded-md bg-slate-50 p-3 ring-1 ring-slate-100">
                            <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">Plan</p>
                            <p className="mt-1 text-sm font-black text-slate-950">{currencyFormatter(row.planned)}</p>
                          </div>
                          <div className="rounded-md bg-indigo-50 p-3 ring-1 ring-indigo-100">
                            <p className="text-[10px] font-black uppercase tracking-[0.14em] text-indigo-600">Real</p>
                            <p className="mt-1 text-sm font-black text-indigo-700">{currencyFormatter(row.actual)}</p>
                          </div>
                          <div className={`rounded-md p-3 ring-1 ${row.available >= 0 ? 'bg-emerald-50 ring-emerald-100' : 'bg-red-50 ring-red-100'}`}>
                            <p className={`text-[10px] font-black uppercase tracking-[0.14em] ${row.available >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>Disponible</p>
                            <p className={`mt-1 text-sm font-black ${row.available >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>{currencyFormatter(row.available)}</p>
                          </div>
                          <div className="rounded-md bg-slate-50 p-3 ring-1 ring-slate-100">
                            <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">Líneas</p>
                            <p className="mt-1 text-sm font-black text-slate-950">{compactNumber(row.lines)}</p>
                          </div>
                        </div>
                      </div>
                      <Progress value={Math.min(row.utilization, 100)} className="mt-4 h-2 bg-slate-100" indicatorClassName={row.utilization >= 100 ? 'bg-red-500' : row.utilization >= 85 ? 'bg-orange-500' : 'bg-emerald-500'} />
                    </Link>
                  );
                })}
              </div>
            )}
          </section>

          <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 p-4">
              <h2 className="flex items-center gap-2 text-xl font-black tracking-tight text-slate-950">
                <Users size={20} className="text-orange-600" />
                Cobertura de personal
              </h2>
              <p className="text-sm font-medium text-slate-500">Personas asignadas a proyectos frente a piezas presupuestales.</p>
            </div>
            {filteredPeopleRows.length === 0 ? (
              <div className="py-14 text-center">
                <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-300" />
                <h3 className="mt-3 text-lg font-black text-slate-950">Sin alertas para este filtro</h3>
                <p className="mt-1 text-sm font-medium text-slate-500">El personal visible tiene cobertura presupuestal vigente.</p>
              </div>
            ) : (
              <div className="max-h-[720px] divide-y divide-slate-100 overflow-y-auto">
                {filteredPeopleRows.map((row) => {
                  const config = statusConfig[row.status];
                  return (
                    <Link
                      key={row.key}
                      href={`/projects/${row.projectId}?tab=budget`}
                      className="block p-4 transition hover:bg-slate-50"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="mb-2 flex flex-wrap items-center gap-2">
                            <span className={`rounded px-2 py-1 text-[10px] font-black uppercase tracking-[0.12em] ring-1 ${config.className}`}>
                              {config.label}
                            </span>
                            <span className="rounded bg-slate-100 px-2 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">
                              {row.roleName}
                            </span>
                          </div>
                          <h3 className="truncate text-sm font-black text-slate-950">{row.memberName}</h3>
                          <p className="truncate text-xs font-bold text-slate-500">{row.memberEmail || row.organizationName}</p>
                          <p className="mt-1 truncate text-xs font-black uppercase tracking-[0.08em] text-emerald-700">{row.projectName}</p>
                        </div>
                        <ArrowRight size={16} className="mt-1 shrink-0 text-slate-300" />
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-2">
                        <div className="rounded bg-slate-50 p-2 ring-1 ring-slate-100">
                          <p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">Asignado</p>
                          <p className="mt-1 text-xs font-black text-slate-800">{currencyFormatter(row.allocated)}</p>
                        </div>
                        <div className="rounded bg-slate-50 p-2 ring-1 ring-slate-100">
                          <p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">Consumido</p>
                          <p className="mt-1 text-xs font-black text-slate-800">{currencyFormatter(row.spent)}</p>
                        </div>
                      </div>
                      <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
                        <div className={`h-full rounded-full ${config.bar}`} style={{ width: `${Math.min(row.utilization, 100)}%` }} />
                      </div>
                      <p className="mt-2 text-xs font-bold text-slate-500">
                        {row.status === 'uncovered'
                          ? 'Acción sugerida: vincular esta persona a una pieza presupuestal.'
                          : row.status === 'exhausted'
                            ? 'Acción sugerida: reasignar presupuesto o revisar continuidad operativa.'
                            : row.status === 'risk'
                              ? 'Acción sugerida: monitorear consumo antes del cierre.'
                              : 'Cobertura vigente.'}
                      </p>
                    </Link>
                  );
                })}
              </div>
            )}
          </section>
        </div>

        <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 p-4">
            <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="flex items-center gap-2 text-xl font-black tracking-tight text-slate-950">
                  <BriefcaseBusiness size={20} className="text-indigo-600" />
                  Líneas presupuestales
                </h2>
                <p className="text-sm font-medium text-slate-500">Detalle consolidado por línea, piezas y personas vinculadas.</p>
              </div>
              <span className="rounded bg-slate-100 px-3 py-1 text-xs font-black uppercase tracking-[0.12em] text-slate-600">
                {compactNumber(filteredBudgetLines.length)} líneas visibles
              </span>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-[980px] w-full text-left">
              <thead className="bg-slate-50 text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">
                <tr>
                  <th className="px-4 py-3">Línea</th>
                  <th className="px-4 py-3">Proyecto</th>
                  <th className="px-4 py-3">Piezas</th>
                  <th className="px-4 py-3">Personal</th>
                  <th className="px-4 py-3 text-right">Plan</th>
                  <th className="px-4 py-3 text-right">Real</th>
                  <th className="px-4 py-3">Uso</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredBudgetLines.map((line) => {
                  const actual = lineActualsByKey.get(`${line.projectId}::${line.id}`) || 0;
                  const planned = Number(line.plannedAmount || 0);
                  const usage = planned > 0 ? (actual / planned) * 100 : 0;
                  const peopleCount = new Set((line.components || []).flatMap((piece) => normalizeIds(piece.assignedMemberIds))).size;
                  return (
                    <tr key={`${line.projectId}-${line.id}`} className="transition hover:bg-slate-50">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="h-9 w-1.5 rounded-full" style={{ backgroundColor: line.color || '#4f46e5' }} />
                          <div className="min-w-0">
                            <p className="truncate text-sm font-black text-slate-950">{line.name || 'Línea sin nombre'}</p>
                            <p className="text-xs font-bold text-slate-500">{organizationNameFor(projectById.get(line.projectId) || {}, organizations)}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <Link href={`/projects/${line.projectId}?tab=budget`} className="text-sm font-bold text-indigo-700 hover:text-indigo-900">
                          {line.projectName}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-sm font-black text-slate-700">{compactNumber((line.components || []).length)}</td>
                      <td className="px-4 py-3 text-sm font-black text-slate-700">{compactNumber(peopleCount)}</td>
                      <td className="px-4 py-3 text-right text-sm font-black text-slate-950">{currencyFormatter(planned, line.currency)}</td>
                      <td className="px-4 py-3 text-right text-sm font-black text-indigo-700">{currencyFormatter(actual, line.currency)}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="h-2 w-28 overflow-hidden rounded-full bg-slate-100">
                            <div className={`h-full rounded-full ${usage >= 100 ? 'bg-red-500' : usage >= 85 ? 'bg-orange-500' : 'bg-emerald-500'}`} style={{ width: `${Math.min(usage, 100)}%` }} />
                          </div>
                          <span className="text-xs font-black text-slate-600">{usage.toFixed(1)}%</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
            </section>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
