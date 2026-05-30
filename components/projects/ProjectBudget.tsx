import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  Boxes,
  Calculator,
  CheckCircle2,
  Copy,
  DollarSign,
  Layers3,
  PackagePlus,
  Plus,
  Save,
  Sparkles,
  Timer,
  Trash2,
  TrendingUp,
  UserRound,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { addDoc, collection, deleteDoc, doc, onSnapshot, query, serverTimestamp, updateDoc } from '@/lib/supabase/document-store';
import { db } from '@/lib/backend';
import { toast } from 'sonner';

type BudgetPiece = {
  id: string;
  name: string;
  category: string;
  quantity: number;
  duration: number;
  multiplier: number;
  unitCost: number;
  unitLabel: string;
  notes?: string;
};

type BudgetLine = {
  id: string;
  name?: string;
  description?: string;
  category?: string;
  plannedAmount?: number;
  currency?: string;
  components?: BudgetPiece[];
  createdAt?: any;
};

type BudgetLineData = BudgetLine & {
  pieces: BudgetPiece[];
  plannedAmount: number;
  actualAmount: number;
  variance: number;
  percentUsed: number;
  pieceCount: number;
};

const PIECE_CATEGORIES = [
  { id: 'people', label: 'Personas', icon: UserRound, tone: 'bg-indigo-50 text-indigo-700 ring-indigo-100' },
  { id: 'licenses', label: 'Licencias', icon: Copy, tone: 'bg-cyan-50 text-cyan-700 ring-cyan-100' },
  { id: 'operations', label: 'Operación', icon: Boxes, tone: 'bg-emerald-50 text-emerald-700 ring-emerald-100' },
  { id: 'deliverables', label: 'Entregables', icon: Layers3, tone: 'bg-orange-50 text-orange-700 ring-orange-100' },
  { id: 'other', label: 'Otro', icon: PackagePlus, tone: 'bg-slate-100 text-slate-700 ring-slate-200' },
];

const BUDGET_TEMPLATES: { label: string; hint: string; pieces: BudgetPiece[] }[] = [
  {
    label: 'Equipo humano',
    hint: 'Profesionales por tiempo y dedicación.',
    pieces: [
      { id: 'tpl-manager', name: 'Gerente de proyecto', category: 'people', quantity: 1, duration: 3, multiplier: 1, unitCost: 0, unitLabel: 'mes' },
      { id: 'tpl-analyst', name: 'Analistas', category: 'people', quantity: 2, duration: 3, multiplier: 1, unitCost: 0, unitLabel: 'mes' },
    ],
  },
  {
    label: 'Licencias y software',
    hint: 'Suscripciones multiplicadas por usuarios y meses.',
    pieces: [
      { id: 'tpl-license', name: 'Licencias de software', category: 'licenses', quantity: 5, duration: 3, multiplier: 1, unitCost: 0, unitLabel: 'licencia/mes' },
    ],
  },
  {
    label: 'Operación de campo',
    hint: 'Jornadas, viáticos, equipos o logística.',
    pieces: [
      { id: 'tpl-field', name: 'Jornadas operativas', category: 'operations', quantity: 10, duration: 1, multiplier: 1, unitCost: 0, unitLabel: 'jornada' },
      { id: 'tpl-logistics', name: 'Logística y transporte', category: 'operations', quantity: 1, duration: 1, multiplier: 1, unitCost: 0, unitLabel: 'global' },
    ],
  },
];

const currencyFormatter = (value: number, currency = 'COP') =>
  new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency,
    maximumFractionDigits: currency === 'COP' ? 0 : 2,
  }).format(Number.isFinite(value) ? value : 0);

const compactNumber = (value: number) => new Intl.NumberFormat('es-CO').format(Number.isFinite(value) ? value : 0);

const createId = () => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `${Date.now()}_${Math.random().toString(36).slice(2)}`;
};

const toNumber = (value: any, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const createBlankPiece = (overrides: Partial<BudgetPiece> = {}): BudgetPiece => ({
  id: createId(),
  name: 'Nueva pieza',
  category: 'people',
  quantity: 1,
  duration: 1,
  multiplier: 1,
  unitCost: 0,
  unitLabel: 'mes',
  notes: '',
  ...overrides,
});

const normalizePiece = (piece: any): BudgetPiece => ({
  id: piece?.id || createId(),
  name: piece?.name || 'Pieza de presupuesto',
  category: piece?.category || 'other',
  quantity: toNumber(piece?.quantity, 1),
  duration: toNumber(piece?.duration, 1),
  multiplier: toNumber(piece?.multiplier, 1),
  unitCost: toNumber(piece?.unitCost, 0),
  unitLabel: piece?.unitLabel || 'unidad',
  notes: piece?.notes || '',
});

const normalizeBudgetPieces = (line: BudgetLine): BudgetPiece[] => {
  if (Array.isArray(line.components) && line.components.length > 0) {
    return line.components.map(normalizePiece);
  }

  if (Number(line.plannedAmount || 0) > 0) {
    return [
      createBlankPiece({
        id: 'base-budget',
        name: 'Presupuesto base',
        category: 'other',
        quantity: 1,
        duration: 1,
        multiplier: 1,
        unitCost: Number(line.plannedAmount || 0),
        unitLabel: 'global',
      }),
    ];
  }

  return [createBlankPiece()];
};

const pieceTotal = (piece: BudgetPiece) =>
  toNumber(piece.quantity, 0) * toNumber(piece.duration, 0) * toNumber(piece.multiplier, 0) * toNumber(piece.unitCost, 0);

const piecesTotal = (pieces: BudgetPiece[]) => pieces.reduce((sum, piece) => sum + pieceTotal(piece), 0);

const getCategoryConfig = (category: string) => PIECE_CATEGORIES.find((item) => item.id === category) || PIECE_CATEGORIES[PIECE_CATEGORIES.length - 1];

export function ProjectBudget({ projectId, rateCards = [], tasks = [] }: { projectId: string; rateCards?: any[]; tasks?: any[] }) {
  const [budgetLines, setBudgetLines] = useState<BudgetLine[]>([]);
  const [lineDrafts, setLineDrafts] = useState<Record<string, BudgetPiece[]>>({});
  const [dirtyLines, setDirtyLines] = useState<Record<string, boolean>>({});
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('people');
  const [currency, setCurrency] = useState('COP');
  const [newLinePieces, setNewLinePieces] = useState<BudgetPiece[]>([createBlankPiece()]);
  const [loading, setLoading] = useState(false);
  const [budgetLineToDelete, setBudgetLineToDelete] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  useEffect(() => {
    const budgetQuery = query(collection(db, 'projects', projectId, 'budgetLines'));
    const unsubscribe = onSnapshot(budgetQuery, (snapshot) => {
      const data = snapshot.docs.map((budgetDoc) => ({
        id: budgetDoc.id,
        ...budgetDoc.data(),
      } as BudgetLine));
      data.sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
      setBudgetLines(data);
      setLineDrafts((current) => {
        const next: Record<string, BudgetPiece[]> = {};
        data.forEach((line) => {
          next[line.id] = current[line.id] || normalizeBudgetPieces(line);
        });
        return next;
      });
    });

    return () => unsubscribe();
  }, [projectId]);

  const resetCreateForm = () => {
    setName('');
    setDescription('');
    setCategory('people');
    setCurrency('COP');
    setNewLinePieces([createBlankPiece()]);
  };

  const openCreateModal = () => {
    resetCreateForm();
    setIsCreateModalOpen(true);
  };

  const handleCreateBudgetLine = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!name.trim()) {
      toast.warning('Ponle un nombre a la línea de presupuesto.');
      return;
    }

    const cleanPieces = newLinePieces.map(normalizePiece).filter((piece) => piece.name.trim());
    if (cleanPieces.length === 0) {
      toast.warning('Agrega al menos una pieza de presupuesto.');
      return;
    }

    const plannedAmount = piecesTotal(cleanPieces);
    setLoading(true);
    try {
      await addDoc(collection(db, 'projects', projectId, 'budgetLines'), {
        name: name.trim(),
        description: description.trim(),
        category,
        currency,
        plannedAmount,
        components: cleanPieces,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      resetCreateForm();
      setIsCreateModalOpen(false);
      toast.success('Línea de presupuesto creada.');
    } catch (error) {
      console.error('Error creating budget line:', error);
      toast.error('Error al crear la línea de presupuesto.');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteBudgetLine = async () => {
    if (!budgetLineToDelete) return;
    setIsDeleting(true);
    try {
      await deleteDoc(doc(db, 'projects', projectId, 'budgetLines', budgetLineToDelete));
      setBudgetLineToDelete(null);
      toast.success('Línea de presupuesto eliminada.');
    } catch (error) {
      console.error('Error deleting budget line:', error);
      toast.error('Error al eliminar la línea de presupuesto.');
    } finally {
      setIsDeleting(false);
    }
  };

  const updateDraftPiece = (lineId: string, pieceId: string, field: keyof BudgetPiece, value: string | number) => {
    setLineDrafts((current) => ({
      ...current,
      [lineId]: (current[lineId] || []).map((piece) =>
        piece.id === pieceId
          ? {
              ...piece,
              [field]: ['quantity', 'duration', 'multiplier', 'unitCost'].includes(field) ? toNumber(value) : value,
            }
          : piece
      ),
    }));
    setDirtyLines((current) => ({ ...current, [lineId]: true }));
  };

  const addDraftPiece = (lineId: string, categoryHint = 'people') => {
    setLineDrafts((current) => ({
      ...current,
      [lineId]: [...(current[lineId] || []), createBlankPiece({ category: categoryHint })],
    }));
    setDirtyLines((current) => ({ ...current, [lineId]: true }));
  };

  const duplicateDraftPiece = (lineId: string, piece: BudgetPiece) => {
    setLineDrafts((current) => ({
      ...current,
      [lineId]: [...(current[lineId] || []), { ...piece, id: createId(), name: `${piece.name} copia` }],
    }));
    setDirtyLines((current) => ({ ...current, [lineId]: true }));
  };

  const removeDraftPiece = (lineId: string, pieceId: string) => {
    setLineDrafts((current) => ({
      ...current,
      [lineId]: (current[lineId] || []).filter((piece) => piece.id !== pieceId),
    }));
    setDirtyLines((current) => ({ ...current, [lineId]: true }));
  };

  const saveLineDraft = async (line: BudgetLineData) => {
    const pieces = (lineDrafts[line.id] || []).map(normalizePiece).filter((piece) => piece.name.trim());
    if (pieces.length === 0) {
      toast.warning('La línea debe tener al menos una pieza.');
      return;
    }

    try {
      await updateDoc(doc(db, 'projects', projectId, 'budgetLines', line.id), {
        components: pieces,
        plannedAmount: piecesTotal(pieces),
        updatedAt: serverTimestamp(),
      });
      setDirtyLines((current) => ({ ...current, [line.id]: false }));
      toast.success('Presupuesto actualizado.');
    } catch (error) {
      console.error('Error updating budget line:', error);
      toast.error('No se pudo actualizar la línea.');
    }
  };

  const updateNewPiece = (pieceId: string, field: keyof BudgetPiece, value: string | number) => {
    setNewLinePieces((current) =>
      current.map((piece) =>
        piece.id === pieceId
          ? {
              ...piece,
              [field]: ['quantity', 'duration', 'multiplier', 'unitCost'].includes(field) ? toNumber(value) : value,
            }
          : piece
      )
    );
  };

  const addNewPiece = (categoryHint = category) => {
    setNewLinePieces((current) => [...current, createBlankPiece({ category: categoryHint })]);
  };

  const applyTemplate = (templatePieces: BudgetPiece[]) => {
    setNewLinePieces((current) => [
      ...current.filter((piece) => piece.name !== 'Nueva pieza' || pieceTotal(piece) > 0),
      ...templatePieces.map((piece) => ({ ...piece, id: createId() })),
    ]);
  };

  const removeNewPiece = (pieceId: string) => {
    setNewLinePieces((current) => current.filter((piece) => piece.id !== pieceId));
  };

  const rateCardActuals = useMemo(() => {
    return rateCards.map((card) => {
      let cardTotalUnits = 0;
      const computedUserStats: Record<string, number> = { ...(card.userStats || {}) };

      if (card.syncExternal) {
        cardTotalUnits = card.currentValue || 0;
      } else {
        cardTotalUnits = card.currentValue || 0;

        tasks.forEach((task) => {
          if (!task.isRateCardTask && task.indicator && task.indicator.toLowerCase() === card.indicator?.toLowerCase()) {
            const value = task.indicatorValue || 0;
            const progress = task.progress || 0;
            const units = value * (progress / 100);
            cardTotalUnits += units;

            if (units > 0 && task.assignedTo) {
              computedUserStats[task.assignedTo] = (computedUserStats[task.assignedTo] || 0) + units;
            }
          }
        });

        const userStatsTotal = Object.values(computedUserStats).reduce((sum: number, val: any) => sum + (Number(val) || 0), 0);
        if (userStatsTotal > cardTotalUnits) {
          cardTotalUnits = userStatsTotal;
        }
      }

      const generatedValue = cardTotalUnits * Number(card.rate || 0);
      const reworkValue = Number(card.reworkValue || 0) * Number(card.rate || 0);
      const totalValue = generatedValue + reworkValue;

      return {
        ...card,
        generatedValue,
        reworkValue,
        totalValue,
      };
    });
  }, [rateCards, tasks]);

  const budgetData = useMemo<BudgetLineData[]>(() => {
    return budgetLines.map((line) => {
      const pieces = lineDrafts[line.id] || normalizeBudgetPieces(line);
      const plannedAmount = piecesTotal(pieces);
      const associatedActuals = rateCardActuals.filter((rateCard) => rateCard.budgetLineId === line.id);
      const actualAmount = associatedActuals.reduce((sum, rateCard) => sum + Number(rateCard.totalValue || 0), 0);
      const variance = plannedAmount - actualAmount;
      const percentUsed = plannedAmount > 0 ? (actualAmount / plannedAmount) * 100 : 0;

      return {
        ...line,
        pieces,
        plannedAmount,
        actualAmount,
        variance,
        percentUsed,
        pieceCount: pieces.length,
      };
    });
  }, [budgetLines, lineDrafts, rateCardActuals]);

  const unassignedActuals = rateCardActuals.filter((rateCard) => !rateCard.budgetLineId);
  const totalUnassignedActual = unassignedActuals.reduce((sum, rateCard) => sum + Number(rateCard.totalValue || 0), 0);
  const totalPlanned = budgetData.reduce((sum, line) => sum + line.plannedAmount, 0);
  const totalActual = budgetData.reduce((sum, line) => sum + line.actualAmount, 0) + totalUnassignedActual;
  const totalVariance = totalPlanned - totalActual;
  const totalPercentUsed = totalPlanned > 0 ? (totalActual / totalPlanned) * 100 : 0;
  const totalPieces = budgetData.reduce((sum, line) => sum + line.pieceCount, 0);
  const activeCurrency = budgetData[0]?.currency || currency;

  const categoryTotals = PIECE_CATEGORIES.map((item) => ({
    ...item,
    total: budgetData.reduce(
      (sum, line) => sum + line.pieces.filter((piece) => piece.category === item.id).reduce((inner, piece) => inner + pieceTotal(piece), 0),
      0
    ),
  })).filter((item) => item.total > 0);

  const renderPieceEditor = (
    pieces: BudgetPiece[],
    handlers: {
      update: (pieceId: string, field: keyof BudgetPiece, value: string | number) => void;
      duplicate?: (piece: BudgetPiece) => void;
      remove: (pieceId: string) => void;
    },
    options: { compact?: boolean } = {}
  ) => (
    <div className="overflow-x-auto">
      <div className="min-w-[980px]">
        <div className="grid grid-cols-[1.5fr_130px_90px_90px_90px_140px_130px_90px] gap-2 border-b border-slate-200 px-2 pb-2 text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">
          <span>Pieza</span>
          <span>Tipo</span>
          <span>Cantidad</span>
          <span>Tiempo</span>
          <span>Factor</span>
          <span>Valor unitario</span>
          <span>Subtotal</span>
          <span className="text-right">Acciones</span>
        </div>
        <div className="divide-y divide-slate-100">
          {pieces.map((piece) => {
            const categoryConfig = getCategoryConfig(piece.category);
            const CategoryIcon = categoryConfig.icon;

            return (
              <div key={piece.id} className="grid grid-cols-[1.5fr_130px_90px_90px_90px_140px_130px_90px] gap-2 px-2 py-2">
                <div className="min-w-0">
                  <input
                    value={piece.name}
                    onChange={(event) => handlers.update(piece.id, 'name', event.target.value)}
                    className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm font-bold text-slate-800 outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10"
                    placeholder="Ej. Analista catastral"
                  />
                  {!options.compact && (
                    <input
                      value={piece.notes || ''}
                      onChange={(event) => handlers.update(piece.id, 'notes', event.target.value)}
                      className="mt-1 h-8 w-full rounded-md border border-slate-100 bg-slate-50 px-3 text-xs font-medium text-slate-500 outline-none focus:border-indigo-300"
                      placeholder="Nota o supuesto de cálculo"
                    />
                  )}
                </div>
                <div>
                  <select
                    value={piece.category}
                    onChange={(event) => handlers.update(piece.id, 'category', event.target.value)}
                    className="h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-xs font-black text-slate-600 outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10"
                  >
                    {PIECE_CATEGORIES.map((item) => (
                      <option key={item.id} value={item.id}>{item.label}</option>
                    ))}
                  </select>
                  {!options.compact && (
                    <span className={`mt-1 inline-flex items-center gap-1 rounded px-2 py-1 text-[10px] font-black uppercase tracking-[0.12em] ring-1 ${categoryConfig.tone}`}>
                      <CategoryIcon size={12} />
                      {categoryConfig.label}
                    </span>
                  )}
                </div>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={piece.quantity}
                  onChange={(event) => handlers.update(piece.id, 'quantity', event.target.value)}
                  className="h-9 rounded-md border border-slate-200 px-2 text-right text-sm font-bold text-slate-700 outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10"
                />
                <div>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={piece.duration}
                    onChange={(event) => handlers.update(piece.id, 'duration', event.target.value)}
                    className="h-9 w-full rounded-md border border-slate-200 px-2 text-right text-sm font-bold text-slate-700 outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10"
                  />
                  {!options.compact && (
                    <input
                      value={piece.unitLabel}
                      onChange={(event) => handlers.update(piece.id, 'unitLabel', event.target.value)}
                      className="mt-1 h-8 w-full rounded-md border border-slate-100 bg-slate-50 px-2 text-xs font-medium text-slate-500 outline-none focus:border-indigo-300"
                      placeholder="mes"
                    />
                  )}
                </div>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={piece.multiplier}
                  onChange={(event) => handlers.update(piece.id, 'multiplier', event.target.value)}
                  className="h-9 rounded-md border border-slate-200 px-2 text-right text-sm font-bold text-slate-700 outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10"
                />
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={piece.unitCost}
                  onChange={(event) => handlers.update(piece.id, 'unitCost', event.target.value)}
                  className="h-9 rounded-md border border-slate-200 px-2 text-right text-sm font-bold text-slate-700 outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10"
                />
                <div className="flex h-9 items-center justify-end rounded-md bg-slate-50 px-2 text-sm font-black text-slate-900 ring-1 ring-slate-100">
                  {currencyFormatter(pieceTotal(piece), activeCurrency)}
                </div>
                <div className="flex items-center justify-end gap-1">
                  {handlers.duplicate && (
                    <button
                      type="button"
                      onClick={() => handlers.duplicate?.(piece)}
                      className="rounded-md p-2 text-slate-400 transition hover:bg-indigo-50 hover:text-indigo-600"
                      title="Duplicar pieza"
                    >
                      <Copy size={15} />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => handlers.remove(piece.id)}
                    className="rounded-md p-2 text-slate-400 transition hover:bg-red-50 hover:text-red-600"
                    title="Eliminar pieza"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
          <div className="max-w-3xl">
            <div className="mb-3 inline-flex items-center gap-2 rounded bg-emerald-50 px-3 py-1 text-[11px] font-black uppercase tracking-[0.16em] text-emerald-700 ring-1 ring-emerald-100">
              <Sparkles size={14} />
              Constructor financiero
            </div>
            <h2 className="flex items-center gap-2 text-3xl font-black tracking-tight text-slate-950">
              <DollarSign size={28} className="text-emerald-600" />
              Presupuesto del proyecto
            </h2>
            <p className="mt-2 text-base font-medium text-slate-500">
              Arma el presupuesto con piezas reutilizables: personas, licencias, tiempos, factores y valores unitarios.
            </p>
          </div>
          <Button onClick={openCreateModal} className="h-12 shrink-0 bg-emerald-600 px-5 font-black text-white hover:bg-emerald-700">
            <Plus size={18} />
            Nueva línea
          </Button>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">Planificado</p>
              <p className="mt-2 text-3xl font-black tracking-tight text-slate-950">{currencyFormatter(totalPlanned, activeCurrency)}</p>
              <p className="mt-1 text-sm font-medium text-slate-500">{compactNumber(totalPieces)} piezas en {compactNumber(budgetData.length)} líneas</p>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100">
              <Calculator size={20} />
            </div>
          </div>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">Costo real</p>
              <p className="mt-2 text-3xl font-black tracking-tight text-indigo-700">{currencyFormatter(totalActual, activeCurrency)}</p>
              <p className="mt-1 text-sm font-medium text-slate-500">Incluye rate cards vinculados</p>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-50 text-indigo-700 ring-1 ring-indigo-100">
              <TrendingUp size={20} />
            </div>
          </div>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">Disponible</p>
              <p className={`mt-2 text-3xl font-black tracking-tight ${totalVariance >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                {currencyFormatter(totalVariance, activeCurrency)}
              </p>
              <p className="mt-1 text-sm font-medium text-slate-500">{totalPercentUsed.toFixed(1)}% de uso</p>
            </div>
            <div className={`flex h-10 w-10 items-center justify-center rounded-lg ring-1 ${totalVariance >= 0 ? 'bg-emerald-50 text-emerald-700 ring-emerald-100' : 'bg-red-50 text-red-700 ring-red-100'}`}>
              {totalVariance >= 0 ? <CheckCircle2 size={20} /> : <AlertCircle size={20} />}
            </div>
          </div>
          <Progress value={Math.min(totalPercentUsed, 100)} className="mt-4 h-2 bg-slate-100" indicatorClassName={totalPercentUsed > 100 ? 'bg-red-500' : 'bg-emerald-500'} />
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">Sin asignar</p>
              <p className="mt-2 text-3xl font-black tracking-tight text-orange-700">{currencyFormatter(totalUnassignedActual, activeCurrency)}</p>
              <p className="mt-1 text-sm font-medium text-slate-500">{compactNumber(unassignedActuals.length)} rate cards sin línea</p>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-orange-50 text-orange-700 ring-1 ring-orange-100">
              <AlertCircle size={20} />
            </div>
          </div>
        </div>
      </div>

      {categoryTotals.length > 0 && (
        <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-black text-slate-950">Composición del presupuesto</h3>
              <p className="text-sm font-medium text-slate-500">Dónde se concentra la planeación antes de ejecutar.</p>
            </div>
            <span className="rounded bg-slate-100 px-3 py-1 text-xs font-black uppercase tracking-[0.12em] text-slate-600">
              {totalPlanned > 0 ? '100%' : '0%'} distribuido
            </span>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
            {categoryTotals.map((item) => {
              const Icon = item.icon;
              const percent = totalPlanned > 0 ? (item.total / totalPlanned) * 100 : 0;
              return (
                <div key={item.id} className="rounded-lg border border-slate-100 bg-slate-50/60 p-3">
                  <div className="flex items-center gap-2">
                    <span className={`flex h-8 w-8 items-center justify-center rounded-md ring-1 ${item.tone}`}>
                      <Icon size={16} />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-black text-slate-900">{item.label}</p>
                      <p className="text-xs font-bold text-slate-500">{percent.toFixed(1)}%</p>
                    </div>
                  </div>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-white">
                    <div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.min(percent, 100)}%` }} />
                  </div>
                  <p className="mt-2 text-xs font-black text-slate-700">{currencyFormatter(item.total, activeCurrency)}</p>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {budgetData.length === 0 ? (
        <section className="rounded-lg border border-dashed border-slate-300 bg-white p-10 text-center shadow-sm">
          <Calculator className="mx-auto h-12 w-12 text-slate-300" />
          <h3 className="mt-4 text-xl font-black text-slate-950">Todavía no hay líneas de presupuesto</h3>
          <p className="mx-auto mt-2 max-w-xl text-sm font-medium text-slate-500">
            Crea la primera línea y desglósala en piezas: cargos, licencias, meses, jornadas, valores unitarios y factores.
          </p>
          <Button onClick={openCreateModal} className="mt-5 bg-emerald-600 font-black text-white hover:bg-emerald-700">
            <Plus size={16} />
            Crear primera línea
          </Button>
        </section>
      ) : (
        <section className="space-y-4">
          {budgetData.map((line) => {
            const lineCategory = getCategoryConfig(line.category || 'other');
            const CategoryIcon = lineCategory.icon;
            const isDirty = Boolean(dirtyLines[line.id]);

            return (
              <article key={line.id} className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
                <div className="border-b border-slate-200 p-4">
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                    <div className="min-w-0">
                      <div className="mb-2 flex flex-wrap items-center gap-2">
                        <span className={`inline-flex items-center gap-1 rounded px-2 py-1 text-[10px] font-black uppercase tracking-[0.12em] ring-1 ${lineCategory.tone}`}>
                          <CategoryIcon size={12} />
                          {lineCategory.label}
                        </span>
                        {isDirty && (
                          <span className="rounded bg-orange-50 px-2 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-orange-700 ring-1 ring-orange-100">
                            Cambios sin guardar
                          </span>
                        )}
                      </div>
                      <h3 className="text-xl font-black tracking-tight text-slate-950">{line.name}</h3>
                      <p className="mt-1 text-sm font-medium text-slate-500">{line.description || 'Sin descripción'}</p>
                    </div>
                    <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:min-w-[640px]">
                      <div className="rounded-md bg-slate-50 p-3 ring-1 ring-slate-100">
                        <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">Plan</p>
                        <p className="mt-1 text-sm font-black text-slate-950">{currencyFormatter(line.plannedAmount, line.currency)}</p>
                      </div>
                      <div className="rounded-md bg-indigo-50 p-3 ring-1 ring-indigo-100">
                        <p className="text-[10px] font-black uppercase tracking-[0.14em] text-indigo-600">Real</p>
                        <p className="mt-1 text-sm font-black text-indigo-700">{currencyFormatter(line.actualAmount, line.currency)}</p>
                      </div>
                      <div className={`rounded-md p-3 ring-1 ${line.variance >= 0 ? 'bg-emerald-50 ring-emerald-100' : 'bg-red-50 ring-red-100'}`}>
                        <p className={`text-[10px] font-black uppercase tracking-[0.14em] ${line.variance >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>Disponible</p>
                        <p className={`mt-1 text-sm font-black ${line.variance >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>{currencyFormatter(line.variance, line.currency)}</p>
                      </div>
                      <div className="rounded-md bg-slate-50 p-3 ring-1 ring-slate-100">
                        <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">Uso</p>
                        <p className="mt-1 text-sm font-black text-slate-950">{line.percentUsed.toFixed(1)}%</p>
                      </div>
                    </div>
                  </div>
                  <div className="mt-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div className="flex items-center gap-3">
                      <Progress value={Math.min(line.percentUsed, 100)} className="h-2 w-64 max-w-full bg-slate-100" indicatorClassName={line.percentUsed > 100 ? 'bg-red-500' : 'bg-emerald-500'} />
                      <span className="text-xs font-bold text-slate-500">{compactNumber(line.pieceCount)} piezas</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button type="button" variant="outline" size="sm" onClick={() => addDraftPiece(line.id, line.category || 'people')} className="border-slate-200 text-slate-700 hover:bg-slate-50">
                        <Plus size={14} />
                        Agregar pieza
                      </Button>
                      <Button type="button" size="sm" onClick={() => saveLineDraft(line)} disabled={!isDirty} className="bg-slate-950 font-black text-white hover:bg-emerald-700 disabled:opacity-50">
                        <Save size={14} />
                        Guardar
                      </Button>
                      <Button type="button" variant="ghost" size="sm" onClick={() => setBudgetLineToDelete(line.id)} className="text-red-600 hover:bg-red-50 hover:text-red-700">
                        <Trash2 size={14} />
                      </Button>
                    </div>
                  </div>
                </div>
                <div className="bg-white p-3">
                  {renderPieceEditor(line.pieces, {
                    update: (pieceId, field, value) => updateDraftPiece(line.id, pieceId, field, value),
                    duplicate: (piece) => duplicateDraftPiece(line.id, piece),
                    remove: (pieceId) => removeDraftPiece(line.id, pieceId),
                  })}
                </div>
              </article>
            );
          })}
        </section>
      )}

      {totalUnassignedActual > 0 && (
        <section className="rounded-lg border border-orange-200 bg-orange-50/40 p-4 shadow-sm">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-orange-600" />
            <div>
              <h3 className="font-black text-orange-900">Costos reales sin línea de presupuesto</h3>
              <p className="mt-1 text-sm font-medium text-orange-800">
                Hay {compactNumber(unassignedActuals.length)} rate cards generando {currencyFormatter(totalUnassignedActual, activeCurrency)} sin estar vinculados a una línea.
              </p>
            </div>
          </div>
        </section>
      )}

      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm">
          <div className="flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-lg bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 p-5">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.16em] text-emerald-600">Nueva estructura presupuestal</p>
                <h3 className="text-2xl font-black tracking-tight text-slate-950">Crear línea con piezas</h3>
                <p className="mt-1 text-sm font-medium text-slate-500">Define la línea y arma su fórmula con una o varias piezas.</p>
              </div>
              <button onClick={() => setIsCreateModalOpen(false)} className="rounded-md p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700">
                <X size={22} />
              </button>
            </div>

            <form onSubmit={handleCreateBudgetLine} className="overflow-y-auto p-5">
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_260px]">
                <div className="space-y-4">
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-sm font-bold text-slate-700">Nombre de la línea *</label>
                      <input
                        type="text"
                        value={name}
                        onChange={(event) => setName(event.target.value)}
                        className="h-11 w-full rounded-md border border-slate-200 px-3 text-sm font-bold text-slate-800 outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10"
                        placeholder="Ej. Equipo de análisis"
                        required
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-bold text-slate-700">Tipo de línea</label>
                      <select
                        value={category}
                        onChange={(event) => setCategory(event.target.value)}
                        className="h-11 w-full rounded-md border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700 outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10"
                      >
                        {PIECE_CATEGORIES.map((item) => (
                          <option key={item.id} value={item.id}>{item.label}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-bold text-slate-700">Moneda</label>
                      <select
                        value={currency}
                        onChange={(event) => setCurrency(event.target.value)}
                        className="h-11 w-full rounded-md border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700 outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10"
                      >
                        <option value="COP">COP - Peso Colombiano</option>
                        <option value="USD">USD - Dólar Estadounidense</option>
                        <option value="EUR">EUR - Euro</option>
                      </select>
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-bold text-slate-700">Total calculado</label>
                      <div className="flex h-11 items-center rounded-md bg-slate-50 px-3 text-sm font-black text-slate-950 ring-1 ring-slate-200">
                        {currencyFormatter(piecesTotal(newLinePieces), currency)}
                      </div>
                    </div>
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-bold text-slate-700">Descripción</label>
                    <input
                      value={description}
                      onChange={(event) => setDescription(event.target.value)}
                      className="h-11 w-full rounded-md border border-slate-200 px-3 text-sm font-medium text-slate-700 outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10"
                      placeholder="Supuesto, alcance o criterio de esta línea"
                    />
                  </div>

                  <div className="rounded-lg border border-slate-200">
                    <div className="flex items-center justify-between gap-3 border-b border-slate-200 p-3">
                      <div>
                        <h4 className="font-black text-slate-950">Hoja de cálculo de piezas</h4>
                        <p className="text-xs font-medium text-slate-500">Subtotal = cantidad x tiempo x factor x valor unitario.</p>
                      </div>
                      <Button type="button" variant="outline" size="sm" onClick={() => addNewPiece()} className="border-slate-200">
                        <Plus size={14} />
                        Agregar pieza
                      </Button>
                    </div>
                    <div className="p-3">
                      {renderPieceEditor(newLinePieces, {
                        update: updateNewPiece,
                        duplicate: (piece) => setNewLinePieces((current) => [...current, { ...piece, id: createId(), name: `${piece.name} copia` }]),
                        remove: removeNewPiece,
                      })}
                    </div>
                  </div>
                </div>

                <aside className="space-y-3">
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                    <h4 className="flex items-center gap-2 font-black text-slate-950">
                      <Sparkles size={16} className="text-emerald-600" />
                      Plantillas rápidas
                    </h4>
                    <div className="mt-3 space-y-2">
                      {BUDGET_TEMPLATES.map((template) => (
                        <button
                          key={template.label}
                          type="button"
                          onClick={() => applyTemplate(template.pieces)}
                          className="w-full rounded-md border border-slate-200 bg-white p-3 text-left transition hover:border-emerald-200 hover:bg-emerald-50"
                        >
                          <p className="text-sm font-black text-slate-900">{template.label}</p>
                          <p className="mt-1 text-xs font-medium text-slate-500">{template.hint}</p>
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
                    <h4 className="font-black text-emerald-900">Cómo leer la fórmula</h4>
                    <p className="mt-2 text-sm font-medium text-emerald-800">
                      Usa cantidad para personas o licencias, tiempo para meses/días/horas y factor para dedicación, riesgo o multiplicadores especiales.
                    </p>
                  </div>
                </aside>
              </div>

              <div className="mt-5 flex justify-end gap-3 border-t border-slate-200 pt-4">
                <Button type="button" variant="outline" onClick={() => setIsCreateModalOpen(false)}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={loading} className="bg-emerald-600 font-black text-white hover:bg-emerald-700">
                  {loading ? 'Guardando...' : 'Crear línea'}
                  <ArrowRight size={16} />
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {budgetLineToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-lg bg-white p-6 text-center shadow-xl">
            <AlertCircle className="mx-auto mb-4 h-12 w-12 text-red-500" />
            <h3 className="mb-2 text-lg font-black text-slate-950">¿Eliminar línea de presupuesto?</h3>
            <p className="mb-6 text-sm font-medium text-slate-500">
              Esta acción no se puede deshacer. Los rate cards asociados perderán su vinculación.
            </p>
            <div className="flex justify-center gap-3">
              <Button variant="outline" onClick={() => setBudgetLineToDelete(null)} disabled={isDeleting}>
                Cancelar
              </Button>
              <Button variant="destructive" onClick={handleDeleteBudgetLine} disabled={isDeleting}>
                {isDeleting ? 'Eliminando...' : 'Sí, eliminar'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
