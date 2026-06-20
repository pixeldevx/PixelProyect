import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import Image from 'next/image';
import {
  ReactFlow,
  MiniMap,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  addEdge,
  Connection,
  Edge,
  Node,
  Panel,
  MarkerType
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Save, Plus, Trash2, Users, ShieldCheck, WalletCards, AlertTriangle, BriefcaseBusiness } from 'lucide-react';
import { collection, doc, getDoc, getDocs, setDoc } from '@/lib/supabase/document-store';
import { db } from '@/lib/backend';
import { toast } from 'sonner';
import { handleDataError, OperationType } from '@/lib/backend-utils';
import { useAuth } from '@/hooks/useAuth';
import { useRolePermissions } from '@/hooks/useRolePermissions';
import { OrgChartNode } from './OrgChartNode';

interface ProjectOrgChartProps {
  projectId: string;
  teamMembers: any[];
}

type BudgetPiece = {
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
  components?: BudgetPiece[];
};

type MemberCoverage = {
  memberId: string;
  allocated: number;
  coveredMonths: number;
  firstGapMonth: number | null;
  coveragePercent: number;
  status: 'covered' | 'gap' | 'uncovered';
  statusLabel: string;
};

const initialEdges: Edge[] = [];
const MONTH_LABELS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const COVERAGE_WINDOW = 12;

const currencyFormatter = (value: number, currency = 'COP') =>
  new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency,
    maximumFractionDigits: currency === 'COP' ? 0 : 2,
  }).format(Number.isFinite(value) ? value : 0);

const compactNumber = (value: number) => new Intl.NumberFormat('es-CO').format(Number.isFinite(value) ? value : 0);

const toNumber = (value: any, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const normalizeIds = (value: any) =>
  Array.from(new Set((Array.isArray(value) ? value : []).map((item) => String(item || '').trim()).filter(Boolean)));

const clampMonthNumber = (value: any, fallback = 1) => Math.max(1, Math.round(toNumber(value, fallback)));

const getTimelineMonthLabel = (monthNumber: number) => {
  const safeMonth = clampMonthNumber(monthNumber);
  const monthIndex = (safeMonth - 1) % MONTH_LABELS.length;
  const cycle = Math.floor((safeMonth - 1) / MONTH_LABELS.length);
  return cycle === 0 ? MONTH_LABELS[monthIndex] : `${MONTH_LABELS[monthIndex]} +${cycle}`;
};

const normalizeActiveMonths = (months: any[] = []) =>
  Array.from(new Set(months.map((month) => clampMonthNumber(month)).filter((month) => month > 0))).sort((a, b) => a - b);

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

const memberName = (member: any) => member?.name || member?.email?.split('@')[0] || 'Profesional';

const statusClassName: Record<MemberCoverage['status'], string> = {
  covered: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
  gap: 'bg-amber-50 text-amber-700 ring-amber-100',
  uncovered: 'bg-red-50 text-red-700 ring-red-100',
};

const buildCoverageByMember = (
  lines: BudgetLine[],
  members: any[],
  currentMonthNumber: number
) => {
  const map = new Map<string, MemberCoverage>();
  const activeMonthsByMember = new Map<string, Set<number>>();

  members.forEach((member) => {
    map.set(member.id, {
      memberId: member.id,
      allocated: 0,
      coveredMonths: 0,
      firstGapMonth: currentMonthNumber,
      coveragePercent: 0,
      status: 'uncovered',
      statusLabel: 'Sin cobertura',
    });
    activeMonthsByMember.set(member.id, new Set());
  });

  lines.forEach((line) => {
    (line.components || []).forEach((piece) => {
      const assignedIds = normalizeIds(piece.assignedMemberIds);
      if (assignedIds.length === 0) return;
      const pieceAmount = pieceTotal(piece);
      const activeMonths = getPieceActiveMonths(piece);

      assignedIds.forEach((memberId) => {
        const current = map.get(memberId) || {
          memberId,
          allocated: 0,
          coveredMonths: 0,
          firstGapMonth: currentMonthNumber,
          coveragePercent: 0,
          status: 'uncovered' as const,
          statusLabel: 'Sin cobertura',
        };
        current.allocated += pieceAmount;
        map.set(memberId, current);

        const activeMonthsForMember = activeMonthsByMember.get(memberId) || new Set<number>();
        activeMonths.forEach((month) => activeMonthsForMember.add(month));
        activeMonthsByMember.set(memberId, activeMonthsForMember);
      });
    });
  });

  map.forEach((coverage) => {
    const activeMonths = activeMonthsByMember.get(coverage.memberId) || new Set<number>();
    coverage.coveredMonths = Array.from(activeMonths).filter((month) => month >= currentMonthNumber && month < currentMonthNumber + COVERAGE_WINDOW).length;
    coverage.firstGapMonth = Array.from({ length: COVERAGE_WINDOW }, (_, index) => currentMonthNumber + index).find((month) => !activeMonths.has(month)) || null;
    coverage.coveragePercent = Math.round((coverage.coveredMonths / COVERAGE_WINDOW) * 100);
    coverage.status = coverage.allocated <= 0 ? 'uncovered' : coverage.firstGapMonth ? 'gap' : 'covered';
    coverage.statusLabel = coverage.status === 'covered' ? 'Cubierto' : coverage.status === 'gap' ? `Hueco desde ${getTimelineMonthLabel(coverage.firstGapMonth || currentMonthNumber)}` : 'Sin cobertura';
  });

  return map;
};

function CoveragePixels({ coverage, startMonth }: { coverage: MemberCoverage | null; startMonth: number }) {
  const months = Array.from({ length: COVERAGE_WINDOW }, (_, index) => startMonth + index);
  return (
    <div className="flex gap-1">
      {months.map((month) => {
        const covered = Boolean(coverage && coverage.coveredMonths > 0 && (!coverage.firstGapMonth || month < coverage.firstGapMonth));
        return (
          <span
            key={month}
            title={`${getTimelineMonthLabel(month)} · ${covered ? 'Con cobertura' : 'Sin cobertura'}`}
            className={`h-3.5 w-3.5 rounded border ${covered ? 'border-emerald-300 bg-emerald-500' : 'border-slate-200 bg-slate-100'}`}
          />
        );
      })}
    </div>
  );
}

function PersonnelMetric({
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
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">{label}</p>
          <p className="mt-2 truncate text-2xl font-black tracking-tight text-slate-950">{value}</p>
          <p className="mt-1 text-xs font-bold text-slate-500">{detail}</p>
        </div>
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ring-1 ${tone}`}>
          {icon}
        </div>
      </div>
    </div>
  );
}

export function ProjectOrgChart({ projectId, teamMembers }: ProjectOrgChartProps) {
  const { userRole } = useAuth();
  const { permissions } = useRolePermissions(userRole);
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [budgetLines, setBudgetLines] = useState<BudgetLine[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isAddMenuOpen, setIsAddMenuOpen] = useState(false);
  const loadedOrgChartProjectRef = useRef<string | null>(null);

  const nodeTypes = useMemo(() => ({ orgChartNode: OrgChartNode }), []);
  const canView = Boolean(permissions.orgChartView);
  const canEdit = Boolean(permissions.orgChartManage);
  const canViewBudget = Boolean(permissions.personnelBudgetView);
  const currentMonthNumber = new Date().getMonth() + 1;

  const handleNodeLabelChange = useCallback((id: string, newLabel: string) => {
    setNodes((nds) =>
      nds.map((node) => {
        if (node.id === id) {
          node.data = {
            ...node.data,
            label: newLabel,
          };
        }
        return node;
      })
    );
  }, [setNodes]);

  const coverageByMember = useMemo(
    () => buildCoverageByMember(budgetLines, teamMembers, currentMonthNumber),
    [budgetLines, currentMonthNumber, teamMembers]
  );

  const enrichNodeData = useCallback((node: Node, coverageMap = coverageByMember): Node => {
    const memberId = String(node.data?.memberId || '');
    const member = memberId ? teamMembers.find((item) => item.id === memberId) : null;
    const coverage = memberId ? coverageMap.get(memberId) : null;

    return {
      ...node,
      data: {
        ...node.data,
        label: member ? memberName(member) : node.data?.label || 'Doble clic para editar',
        member: member?.role || member?.systemRole || node.data?.member || 'Miembro',
        photoURL: member?.photoURL || node.data?.photoURL || null,
        coverageStatus: coverage?.status,
        coverageLabel: canViewBudget ? coverage?.statusLabel : 'Presupuesto protegido',
        budgetAmount: canViewBudget ? coverage?.allocated : null,
        onChange: (newLabel: string) => handleNodeLabelChange(node.id, newLabel),
      },
    };
  }, [canViewBudget, coverageByMember, handleNodeLabelChange, teamMembers]);

  useEffect(() => {
    if (!canView) return;
    if (loadedOrgChartProjectRef.current === projectId) return;

    loadedOrgChartProjectRef.current = projectId;

    const fetchOrgChart = async () => {
      setIsLoading(true);
      try {
        const [docSnap, budgetSnapshot] = await Promise.all([
          getDoc(doc(db, 'projects', projectId, 'orgChart', 'data')),
          getDocs(collection(db, 'projects', projectId, 'budgetLines')),
        ]);

        const loadedBudgetLines = budgetSnapshot.docs.map((docSnapItem) => ({ id: docSnapItem.id, ...docSnapItem.data() } as BudgetLine));
        const loadedCoverageByMember = buildCoverageByMember(loadedBudgetLines, teamMembers, currentMonthNumber);
        setBudgetLines(loadedBudgetLines);

        if (docSnap.exists()) {
          const data = docSnap.data();
          if (data.nodes && data.nodes.length > 0) {
            setNodes(data.nodes.map((node: Node) => enrichNodeData(node, loadedCoverageByMember)));
          } else {
            setNodes([enrichNodeData({
              id: '1',
              type: 'orgChartNode',
              data: { label: 'Director del Proyecto' },
              position: { x: 250, y: 25 },
            }, loadedCoverageByMember)]);
          }
          if (data.edges) {
            setEdges(data.edges);
          }
        } else {
          setNodes([enrichNodeData({
            id: '1',
            type: 'orgChartNode',
            data: { label: 'Director del Proyecto' },
            position: { x: 250, y: 25 },
          }, loadedCoverageByMember)]);
        }
      } catch (error) {
        loadedOrgChartProjectRef.current = null;
        console.error("Error fetching org chart:", error);
        handleDataError(error, OperationType.GET, `projects/${projectId}/orgChart/data`);
      } finally {
        setIsLoading(false);
      }
    };

    void fetchOrgChart();
  }, [canView, currentMonthNumber, enrichNodeData, projectId, setEdges, setNodes, teamMembers]);

  const onConnect = useCallback(
    (params: Connection | Edge) => {
      if (!canEdit) return;
      setEdges((eds) => addEdge({ ...params, type: 'smoothstep', markerEnd: { type: MarkerType.ArrowClosed } }, eds));
    },
    [canEdit, setEdges],
  );

  const onSave = useCallback(async () => {
    if (!canEdit) {
      toast.error('No tienes permiso para editar el organigrama.');
      return;
    }

    setIsSaving(true);
    try {
      const nodesToSave = nodes.map(node => {
        const { onChange, ...dataToSave } = node.data;
        return {
          ...node,
          data: dataToSave
        };
      });

      await setDoc(doc(db, 'projects', projectId, 'orgChart', 'data'), {
        nodes: nodesToSave,
        edges,
        updatedAt: new Date()
      });
      toast.success('Organigrama guardado correctamente');
    } catch (error: any) {
      console.error("Error saving org chart:", error);
      toast.error(`Error al guardar: ${error.message}`);
      handleDataError(error, OperationType.WRITE, `projects/${projectId}/orgChart/data`);
    } finally {
      setIsSaving(false);
    }
  }, [canEdit, projectId, nodes, edges]);

  const addCustomNode = () => {
    if (!canEdit) return;
    const newId = `node_${new Date().getTime()}`;
    const newNode: Node = enrichNodeData({
      id: newId,
      type: 'orgChartNode',
      data: { label: 'Doble clic para editar' },
      position: { x: Math.random() * 300, y: Math.random() * 300 },
    });
    setNodes((nds) => nds.concat(newNode));
    setIsAddMenuOpen(false);
  };

  const addTeamMemberNode = (member: any) => {
    if (!canEdit) return;
    const newId = `node_${new Date().getTime()}`;
    const newNode: Node = enrichNodeData({
      id: newId,
      type: 'orgChartNode',
      data: {
        label: memberName(member),
        member: member.role || member.systemRole || 'Miembro',
        memberId: member.id,
        photoURL: member.photoURL || null,
      },
      position: { x: Math.random() * 420, y: Math.random() * 320 },
    });
    setNodes((nds) => nds.concat(newNode));
    setIsAddMenuOpen(false);
  };

  const deleteSelected = () => {
    if (!canEdit) return;
    setNodes((nds) => nds.filter((node) => !node.selected));
    setEdges((eds) => eds.filter((edge) => !edge.selected));
  };

  const metrics = useMemo(() => {
    const coverages = Array.from(coverageByMember.values());
    return {
      people: teamMembers.length,
      allocated: coverages.reduce((sum, coverage) => sum + coverage.allocated, 0),
      uncovered: coverages.filter((coverage) => coverage.status === 'uncovered').length,
      gaps: coverages.filter((coverage) => coverage.status === 'gap').length,
    };
  }, [coverageByMember, teamMembers.length]);

  if (!canView) {
    return (
      <section className="rounded-2xl border border-amber-200 bg-white p-8 text-center shadow-sm">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-50 text-amber-700 ring-1 ring-amber-100">
          <ShieldCheck size={28} />
        </div>
        <h2 className="mt-4 text-2xl font-black tracking-tight text-slate-950">Organigrama protegido</h2>
        <p className="mx-auto mt-2 max-w-2xl text-sm font-semibold leading-6 text-slate-500">
          El organigrama y el panel administrativo de personal requieren permiso de visualización.
        </p>
      </section>
    );
  }

  if (isLoading) {
    return <div className="flex h-[600px] items-center justify-center text-slate-500">Cargando organigrama...</div>;
  }

  return (
    <div className="space-y-5">
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <PersonnelMetric
          label="Equipo visible"
          value={compactNumber(metrics.people)}
          detail="personas asignadas al proyecto"
          icon={<Users size={21} className="text-indigo-700" />}
          tone="bg-indigo-50 text-indigo-700 ring-indigo-100"
        />
        <PersonnelMetric
          label="Cobertura"
          value={canViewBudget ? currencyFormatter(metrics.allocated) : 'Protegida'}
          detail={canViewBudget ? 'presupuesto de personal' : 'requiere permiso'}
          icon={<WalletCards size={21} className="text-emerald-700" />}
          tone="bg-emerald-50 text-emerald-700 ring-emerald-100"
        />
        <PersonnelMetric
          label="Sin cobertura"
          value={compactNumber(metrics.uncovered)}
          detail="personas sin pieza asignada"
          icon={<AlertTriangle size={21} className="text-red-700" />}
          tone="bg-red-50 text-red-700 ring-red-100"
        />
        <PersonnelMetric
          label="Huecos"
          value={compactNumber(metrics.gaps)}
          detail="cobertura incompleta a 12 meses"
          icon={<BriefcaseBusiness size={21} className="text-orange-700" />}
          tone="bg-orange-50 text-orange-700 ring-orange-100"
        />
      </section>

      <section className="grid gap-5 xl:grid-cols-[1fr_360px]">
        <div className="h-[680px] min-h-[560px] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodesChange={canEdit ? onNodesChange : undefined}
            onEdgesChange={canEdit ? onEdgesChange : undefined}
            onConnect={onConnect}
            nodesDraggable={canEdit}
            nodesConnectable={canEdit}
            elementsSelectable={canEdit}
            fitView
            attributionPosition="bottom-right"
          >
            <Panel position="top-right" className="flex gap-2">
              {canEdit && (
                <>
                  <div className="relative">
                    <Button onClick={() => setIsAddMenuOpen(!isAddMenuOpen)} variant="outline" size="sm" className="bg-white font-bold shadow-sm">
                      <Plus size={16} className="mr-1" /> Nuevo nodo
                    </Button>
                    {isAddMenuOpen && (
                      <div className="absolute right-0 top-full z-50 mt-2 max-h-96 w-72 overflow-y-auto rounded-xl border border-slate-200 bg-white p-2 shadow-2xl shadow-slate-900/10">
                        <div className="px-2 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Estructura</div>
                        <button
                          onClick={addCustomNode}
                          className="w-full rounded-lg px-2 py-2 text-left text-sm font-bold text-slate-700 hover:bg-slate-50"
                        >
                          Nodo personalizado
                        </button>
                        {teamMembers.length > 0 && (
                          <>
                            <div className="mt-3 px-2 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Personas del proyecto</div>
                            {teamMembers.map(member => (
                              <button
                                key={member.id}
                                onClick={() => addTeamMemberNode(member)}
                                className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left hover:bg-indigo-50"
                              >
                                <div className="relative h-8 w-8 shrink-0 overflow-hidden rounded-full bg-indigo-100 text-indigo-600">
                                  {member.photoURL ? (
                                    <Image src={member.photoURL} alt={memberName(member)} fill className="object-cover" referrerPolicy="no-referrer" />
                                  ) : (
                                    <span className="flex h-full w-full items-center justify-center text-xs font-black">{memberName(member).charAt(0).toUpperCase()}</span>
                                  )}
                                </div>
                                <div className="min-w-0">
                                  <div className="truncate text-sm font-black text-slate-900">{memberName(member)}</div>
                                  <div className="truncate text-xs font-semibold text-slate-500">{member.role || member.systemRole || 'Miembro'}</div>
                                </div>
                              </button>
                            ))}
                          </>
                        )}
                      </div>
                    )}
                  </div>
                  <Button onClick={deleteSelected} variant="outline" size="sm" className="bg-white font-bold text-red-600 shadow-sm hover:text-red-700">
                    <Trash2 size={16} className="mr-1" /> Eliminar
                  </Button>
                </>
              )}
              <Button onClick={onSave} disabled={isSaving || !canEdit} size="sm" className="bg-indigo-600 font-bold text-white shadow-sm hover:bg-indigo-700 disabled:bg-slate-200 disabled:text-slate-500">
                <Save size={16} className="mr-1" /> {isSaving ? 'Guardando...' : canEdit ? 'Guardar' : 'Solo lectura'}
              </Button>
            </Panel>
            <MiniMap />
            <Controls />
            <Background color="#dbe4f0" gap={18} />
          </ReactFlow>
        </div>

        <aside className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 p-4">
            <h3 className="text-lg font-black text-slate-950">Personal del proyecto</h3>
            <p className="text-sm font-semibold text-slate-500">Cobertura y alertas antes de ubicar a cada persona en el organigrama.</p>
          </div>
          <div className="max-h-[616px] divide-y divide-slate-100 overflow-y-auto">
            {teamMembers.length === 0 ? (
              <div className="p-6 text-center text-sm font-bold text-slate-500">No hay personas asignadas a este proyecto.</div>
            ) : teamMembers.map((member) => {
              const coverage = coverageByMember.get(member.id) || null;
              const status = coverage?.status || 'uncovered';
              return (
                <div key={member.id} className="p-4 transition hover:bg-slate-50">
                  <div className="flex items-start gap-3">
                    <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-full bg-indigo-100 text-indigo-700 ring-1 ring-indigo-100">
                      {member.photoURL ? (
                        <Image src={member.photoURL} alt={memberName(member)} fill className="object-cover" referrerPolicy="no-referrer" />
                      ) : (
                        <span className="flex h-full w-full items-center justify-center text-sm font-black">{memberName(member).charAt(0).toUpperCase()}</span>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-black text-slate-950">{memberName(member)}</p>
                          <p className="truncate text-xs font-bold text-slate-500">{member.role || member.systemRole || 'Sin rol'}</p>
                        </div>
                        <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-black uppercase tracking-wider ring-1 ${statusClassName[status]}`}>
                          {coverage?.statusLabel || 'Sin cobertura'}
                        </span>
                      </div>
                      <div className="mt-3">
                        <CoveragePixels coverage={coverage} startMonth={currentMonthNumber} />
                      </div>
                      <div className="mt-3 flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-xs font-black text-slate-900">{canViewBudget ? currencyFormatter(coverage?.allocated || 0) : 'Presupuesto protegido'}</p>
                          <Progress value={coverage?.coveragePercent || 0} className="mt-1 h-1.5 bg-slate-100" />
                        </div>
                        {canEdit && (
                          <Button type="button" variant="outline" size="sm" onClick={() => addTeamMemberNode(member)} className="h-8 shrink-0 border-slate-200 text-xs font-black">
                            Agregar
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </aside>
      </section>
    </div>
  );
}
