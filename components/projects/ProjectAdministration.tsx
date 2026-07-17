"use client";

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  Banknote,
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  FileImage,
  FileText,
  FolderKanban,
  Loader2,
  MapPin,
  Plus,
  ReceiptText,
  RefreshCw,
  Send,
  Settings2,
  ShieldCheck,
  Upload,
  X,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { addDoc, collection, doc, onSnapshot, orderBy, query, serverTimestamp, updateDoc } from '@/lib/supabase/document-store';
import { db, storage } from '@/lib/backend';
import { ref, uploadBytes, getDownloadURL } from '@/lib/supabase/storage-shim';
import { buildDocumentStoragePath } from '@/lib/document-storage';

type ColombiaDepartment = {
  department: string;
  municipalities: string[];
};

type ExpenseCategory = {
  id: string;
  name: string;
  defaultDailyAmount?: number;
  unitLabel?: string;
  active?: boolean;
  requiresCufe?: boolean;
  color?: string;
  description?: string;
};

type AdvanceItem = {
  id: string;
  categoryId: string;
  categoryName: string;
  days: number;
  unitAmount: number;
  amount: number;
  note?: string;
  customAmount?: boolean;
};

type AdvanceReceipt = {
  id: string;
  categoryId: string;
  categoryName: string;
  amount: number;
  date: string;
  businessName: string;
  taxId?: string;
  invoiceNumber?: string;
  cufe?: string;
  description?: string;
  fileName?: string;
  fileSize?: number;
  fileUrl?: string;
  storagePath?: string;
  status: 'submitted' | 'approved' | 'returned' | 'rejected';
  createdAt: string;
  createdBy?: string;
  createdByName?: string;
  reviewedAt?: string;
  reviewedBy?: string;
  reviewComment?: string;
  billingPaymentId?: string;
};

type TravelAdvance = {
  id: string;
  projectId: string;
  requesterId: string;
  requesterName: string;
  requesterEmail?: string;
  destination: string;
  department?: string;
  municipality?: string;
  purpose: string;
  travelStart: string;
  travelEnd: string;
  taskId?: string;
  taskTitle?: string;
  taskIds?: string[];
  taskTitles?: string[];
  status: 'submitted' | 'approved' | 'returned' | 'rejected' | 'closed';
  items: AdvanceItem[];
  receipts?: AdvanceReceipt[];
  amountRequested: number;
  amountApproved: number;
  amountLegalized: number;
  balance: number;
  adminComment?: string;
  createdAt?: any;
  updatedAt?: any;
  submittedAt?: any;
  approvedAt?: any;
  closedAt?: any;
};

type BillingPayment = {
  id: string;
  amount?: number;
  status?: string;
  source?: string;
  advanceId?: string;
  date?: any;
};

type ReviewAction =
  | { type: 'approveAdvance'; advance: TravelAdvance }
  | { type: 'returnAdvance'; advance: TravelAdvance }
  | { type: 'rejectAdvance'; advance: TravelAdvance }
  | { type: 'approveReceipt'; advance: TravelAdvance; receipt: AdvanceReceipt }
  | { type: 'returnReceipt'; advance: TravelAdvance; receipt: AdvanceReceipt }
  | null;

type ProjectAdministrationProps = {
  projectId: string;
  project?: any;
  tasks?: any[];
  teamMembers?: any[];
  currentUser: any;
  canView: boolean;
  canManage: boolean;
  canValidate: boolean;
  canConfigure: boolean;
};

const DEFAULT_CATEGORIES: Array<Omit<ExpenseCategory, 'id'>> = [
  {
    name: 'Transporte',
    defaultDailyAmount: 70000,
    unitLabel: 'dia',
    active: true,
    color: '#2563eb',
    description: 'Movilidad urbana, intermunicipal o logística de desplazamiento.',
  },
  {
    name: 'Alimentación',
    defaultDailyAmount: 65000,
    unitLabel: 'dia',
    active: true,
    color: '#059669',
    description: 'Viáticos de comida durante actividades de campo.',
  },
  {
    name: 'Hospedaje',
    defaultDailyAmount: 180000,
    unitLabel: 'noche',
    active: true,
    color: '#7c3aed',
    description: 'Alojamiento aprobado para desplazamientos operativos.',
  },
  {
    name: 'Peajes y parqueaderos',
    defaultDailyAmount: 35000,
    unitLabel: 'dia',
    active: true,
    color: '#f97316',
    description: 'Peajes, parqueaderos y costos menores de transporte.',
  },
];

const inputClass =
  'h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-800 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/15';
const textareaClass =
  'min-h-24 w-full rounded-lg border border-slate-200 bg-white px-3 py-3 text-sm font-semibold text-slate-800 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/15';

const money = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  maximumFractionDigits: 0,
});

const asNumber = (value: any) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
};

const formatMoney = (value: any) => money.format(asNumber(value));

const safeId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

const getDateValue = (value: any): Date | null => {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value?.toDate === 'function') return value.toDate();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const formatDate = (value: any) => {
  const date = getDateValue(value);
  if (!date) return 'Sin fecha';
  return date.toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' });
};

const todayInputValue = () => new Date().toISOString().slice(0, 10);

const inclusiveDays = (start: string, end: string) => {
  if (!start || !end) return 1;
  const startDate = new Date(`${start}T00:00:00`);
  const endDate = new Date(`${end}T00:00:00`);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) return 1;
  return Math.max(1, Math.round((endDate.getTime() - startDate.getTime()) / 86400000) + 1);
};

const getMemberLabel = (member: any) =>
  member?.displayName || member?.name || member?.email || member?.id || 'Profesional';

const getCurrentUserName = (user: any) =>
  user?.displayName || user?.name || user?.email?.split('@')[0] || 'Usuario';

const getTaskTitle = (task: any) =>
  task?.title || task?.name || task?.displayName || task?.externalWorkflowId || task?.id || 'Tarea sin nombre';

const statusConfig: Record<TravelAdvance['status'], { label: string; className: string }> = {
  submitted: { label: 'Por validar', className: 'bg-amber-50 text-amber-700 ring-amber-100' },
  approved: { label: 'Aprobado', className: 'bg-indigo-50 text-indigo-700 ring-indigo-100' },
  returned: { label: 'Devuelto', className: 'bg-orange-50 text-orange-700 ring-orange-100' },
  rejected: { label: 'Rechazado', className: 'bg-rose-50 text-rose-700 ring-rose-100' },
  closed: { label: 'Legalizado', className: 'bg-emerald-50 text-emerald-700 ring-emerald-100' },
};

const receiptStatusConfig: Record<AdvanceReceipt['status'], { label: string; className: string }> = {
  submitted: { label: 'Por revisar', className: 'bg-amber-50 text-amber-700 ring-amber-100' },
  approved: { label: 'Aceptado', className: 'bg-emerald-50 text-emerald-700 ring-emerald-100' },
  returned: { label: 'Devuelto', className: 'bg-orange-50 text-orange-700 ring-orange-100' },
  rejected: { label: 'Rechazado', className: 'bg-rose-50 text-rose-700 ring-rose-100' },
};

const getReceiptStatusMeta = (status: any) =>
  receiptStatusConfig[status as AdvanceReceipt['status']] || receiptStatusConfig.submitted;

const buildEmptyAdvanceForm = (currentUser: any, teamMembers: any[]) => {
  const currentMember = teamMembers.find((member) => {
    const emailMatches =
      currentUser?.email &&
      member?.email &&
      String(member.email).toLowerCase() === String(currentUser.email).toLowerCase();
    return member?.id === currentUser?.uid || member?.authUserId === currentUser?.uid || emailMatches;
  });

  return {
    requesterId: currentMember?.id || currentUser?.uid || '',
    destination: '',
    department: '',
    municipality: '',
    purpose: '',
    travelStart: todayInputValue(),
    travelEnd: todayInputValue(),
    taskIds: [] as string[],
    items: [] as AdvanceItem[],
  };
};

export function ProjectAdministration({
  projectId,
  project,
  tasks = [],
  teamMembers = [],
  currentUser,
  canView,
  canManage,
  canValidate,
  canConfigure,
}: ProjectAdministrationProps) {
  const [advances, setAdvances] = useState<TravelAdvance[]>([]);
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [payments, setPayments] = useState<BillingPayment[]>([]);
  const [locationOptions, setLocationOptions] = useState<ColombiaDepartment[]>([]);
  const [locationsLoading, setLocationsLoading] = useState(false);
  const [locationsLoaded, setLocationsLoaded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'requests' | 'receipts' | 'payments' | 'settings'>('requests');
  const [isAdvanceModalOpen, setIsAdvanceModalOpen] = useState(false);
  const [advanceForm, setAdvanceForm] = useState(() => buildEmptyAdvanceForm(currentUser, teamMembers));
  const [advanceDraftItem, setAdvanceDraftItem] = useState<AdvanceItem | null>(null);
  const [selectedAdvance, setSelectedAdvance] = useState<TravelAdvance | null>(null);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptForm, setReceiptForm] = useState({
    categoryId: '',
    amount: '',
    date: todayInputValue(),
    businessName: '',
    taxId: '',
    invoiceNumber: '',
    cufe: '',
    description: '',
  });
  const [categoryForm, setCategoryForm] = useState({
    id: '',
    name: '',
    defaultDailyAmount: '',
    unitLabel: 'dia',
    color: '#4f46e5',
    requiresCufe: false,
    description: '',
  });
  const [reviewAction, setReviewAction] = useState<ReviewAction>(null);
  const [reviewComment, setReviewComment] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!canView) return;
    setLoading(true);
    const unsubscribes = [
      onSnapshot(
        query(collection(db, 'projects', projectId, 'advanceRequests'), orderBy('createdAt', 'desc')),
        (snapshot) => {
          setAdvances(snapshot.docs.map((snap) => ({ id: snap.id, ...snap.data() } as TravelAdvance)));
          setLoading(false);
        },
        (error) => {
          console.error('Error loading advance requests:', error);
          toast.error('No se pudieron cargar los anticipos del proyecto.');
          setLoading(false);
        }
      ),
      onSnapshot(
        query(collection(db, 'projects', projectId, 'expenseCategories'), orderBy('name', 'asc')),
        (snapshot) => {
          setCategories(snapshot.docs.map((snap) => ({ id: snap.id, ...snap.data() } as ExpenseCategory)));
        },
        (error) => {
          console.error('Error loading expense categories:', error);
        }
      ),
      onSnapshot(
        query(collection(db, 'projects', projectId, 'billingPayments'), orderBy('date', 'desc')),
        (snapshot) => {
          setPayments(snapshot.docs.map((snap) => ({ id: snap.id, ...snap.data() } as BillingPayment)));
        },
        (error) => {
          console.error('Error loading billing payments for admin module:', error);
        }
      ),
    ];

    return () => {
      unsubscribes.forEach((unsubscribe) => unsubscribe());
    };
  }, [canView, projectId]);

  const categoryOptions = useMemo(() => {
    const liveCategories = categories.filter((category) => category.active !== false);
    if (liveCategories.length > 0) return liveCategories;
    return DEFAULT_CATEGORIES.map((category, index) => ({ id: `default-${index}`, ...category }));
  }, [categories]);

  const selectedReceiptCategory = categoryOptions.find((category) => category.id === receiptForm.categoryId);
  const municipalityOptions = useMemo(
    () => locationOptions.find((item) => item.department === advanceForm.department)?.municipalities || [],
    [advanceForm.department, locationOptions]
  );
  const selectedAdvanceTasks = useMemo(
    () => tasks.filter((task) => advanceForm.taskIds.includes(task.id)),
    [advanceForm.taskIds, tasks]
  );

  useEffect(() => {
    if (!advanceDraftItem && categoryOptions.length > 0) {
      const category = categoryOptions[0];
      setAdvanceDraftItem({
        id: safeId(),
        categoryId: category.id,
        categoryName: category.name,
        days: 1,
        unitAmount: asNumber(category.defaultDailyAmount),
        amount: asNumber(category.defaultDailyAmount),
        note: '',
      });
    }
  }, [advanceDraftItem, categoryOptions]);

  useEffect(() => {
    if (!receiptForm.categoryId && categoryOptions.length > 0) {
      setReceiptForm((current) => ({ ...current, categoryId: categoryOptions[0].id }));
    }
  }, [categoryOptions, receiptForm.categoryId]);

  const metrics = useMemo(() => {
    const activeAdvances = advances.filter((advance) => advance.status !== 'rejected');
    const requested = activeAdvances.reduce((sum, advance) => sum + asNumber(advance.amountRequested), 0);
    const approved = activeAdvances.reduce((sum, advance) => sum + asNumber(advance.amountApproved), 0);
    const legalized = activeAdvances.reduce((sum, advance) => sum + asNumber(advance.amountLegalized), 0);
    const pendingValidation = advances.filter((advance) => advance.status === 'submitted').length;
    const returned = advances.filter((advance) => advance.status === 'returned').length;
    const realAdminPayments = payments
      .filter((payment) => payment.source === 'advance_receipt' && payment.status !== 'cancelled')
      .reduce((sum, payment) => sum + asNumber(payment.amount), 0);

    return {
      requested,
      approved,
      legalized,
      balance: Math.max(0, approved - legalized),
      pendingValidation,
      returned,
      realAdminPayments,
    };
  }, [advances, payments]);

  const receipts = useMemo(
    () =>
      advances.flatMap((advance) =>
        (advance.receipts || []).map((receipt) => ({
          ...receipt,
          advanceId: advance.id,
          advanceTitle: advance.purpose || advance.destination,
          requesterName: advance.requesterName,
          advance,
        }))
      ),
    [advances]
  );

  const loadLocationOptions = useCallback(async () => {
    if (locationsLoaded || locationsLoading) return;

    setLocationsLoading(true);
    try {
      const response = await fetch('/data/colombia-municipalities.json', { cache: 'force-cache' });
      if (!response.ok) {
        throw new Error('No se pudo cargar el catálogo de municipios.');
      }
      const data = (await response.json()) as ColombiaDepartment[];
      setLocationOptions(data);
      setLocationsLoaded(true);
    } catch (error) {
      console.error('Error loading Colombia municipalities:', error);
      toast.error('No se pudo cargar la lista de departamentos y municipios.');
    } finally {
      setLocationsLoading(false);
    }
  }, [locationsLoaded, locationsLoading]);

  const openNewAdvance = () => {
    setAdvanceForm(buildEmptyAdvanceForm(currentUser, teamMembers));
    void loadLocationOptions();
    setIsAdvanceModalOpen(true);
  };

  const updateDraftItem = (updates: Partial<AdvanceItem>) => {
    setAdvanceDraftItem((current) => {
      if (!current) return current;
      const next = { ...current, ...updates };
      const category = categoryOptions.find((item) => item.id === next.categoryId);
      if (category && updates.categoryId) {
        next.categoryName = category.name;
        next.unitAmount = asNumber(category.defaultDailyAmount);
      }
      next.amount = asNumber(next.days) * asNumber(next.unitAmount);
      return next;
    });
  };

  const addDraftItem = () => {
    if (!advanceDraftItem) return;
    if (!advanceDraftItem.categoryId || !advanceDraftItem.categoryName) {
      toast.error('Selecciona un dominio de gasto.');
      return;
    }
    setAdvanceForm((current) => ({
      ...current,
      items: [...current.items, { ...advanceDraftItem, id: safeId() }],
    }));
  };

  const removeAdvanceItem = (itemId: string) => {
    setAdvanceForm((current) => ({
      ...current,
      items: current.items.filter((item) => item.id !== itemId),
    }));
  };

  const logAdministrativeEvent = async (advanceId: string, type: string, payload: Record<string, any> = {}) => {
    await addDoc(collection(db, 'projects', projectId, 'administrativeEvents'), {
      projectId,
      advanceId,
      type,
      actorId: currentUser?.uid || null,
      actorName: getCurrentUserName(currentUser),
      createdAt: serverTimestamp(),
      ...payload,
    });
  };

  const handleCreateAdvance = async () => {
    if (!canManage) {
      toast.error('No tienes permisos para crear anticipos.');
      return;
    }
    const destination = [advanceForm.municipality, advanceForm.department].filter(Boolean).join(', ');
    if (!advanceForm.requesterId || !destination || !advanceForm.purpose.trim()) {
      toast.error('Completa solicitante, departamento, municipio y justificación.');
      return;
    }
    if (advanceForm.items.length === 0) {
      toast.error('Agrega al menos un ítem del anticipo.');
      return;
    }

    const requester = teamMembers.find((member) => member.id === advanceForm.requesterId);
    const selectedTaskIds = Array.from(new Set(advanceForm.taskIds.filter(Boolean)));
    const selectedTasks = tasks.filter((task) => selectedTaskIds.includes(task.id));
    const amountRequested = advanceForm.items.reduce((sum, item) => sum + asNumber(item.amount), 0);

    setSubmitting(true);
    try {
      const docRef = await addDoc(collection(db, 'projects', projectId, 'advanceRequests'), {
        projectId,
        requesterId: advanceForm.requesterId,
        requesterName: requester ? getMemberLabel(requester) : getCurrentUserName(currentUser),
        requesterEmail: requester?.email || currentUser?.email || '',
        destination,
        department: advanceForm.department || null,
        municipality: advanceForm.municipality || null,
        purpose: advanceForm.purpose.trim(),
        travelStart: advanceForm.travelStart,
        travelEnd: advanceForm.travelEnd,
        taskIds: selectedTaskIds,
        taskTitles: selectedTasks.map((task) => getTaskTitle(task)),
        taskId: selectedTasks[0]?.id || null,
        taskTitle: selectedTasks[0] ? getTaskTitle(selectedTasks[0]) : null,
        status: 'submitted',
        items: advanceForm.items,
        receipts: [],
        amountRequested,
        amountApproved: 0,
        amountLegalized: 0,
        balance: amountRequested,
        pendingRole: 'administrative_validation',
        nextAction: 'validate_advance',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        submittedAt: serverTimestamp(),
        createdBy: currentUser?.uid || null,
        createdByName: getCurrentUserName(currentUser),
      });

      await logAdministrativeEvent(docRef.id, 'advance_submitted', { amount: amountRequested });
      toast.success('Anticipo enviado al área administrativa.');
      setIsAdvanceModalOpen(false);
    } catch (error: any) {
      console.error('Error creating advance:', error);
      toast.error(error?.message || 'No se pudo crear el anticipo.');
    } finally {
      setSubmitting(false);
    }
  };

  const applyReviewAction = async () => {
    if (!reviewAction) return;
    if (!canValidate) {
      toast.error('No tienes permisos para validar este proceso.');
      return;
    }

    setSubmitting(true);
    try {
      if (reviewAction.type === 'approveAdvance') {
        const approvedAmount = asNumber(reviewAction.advance.amountRequested);
        await updateDoc(doc(db, 'projects', projectId, 'advanceRequests', reviewAction.advance.id), {
          status: 'approved',
          amountApproved: approvedAmount,
          balance: Math.max(0, approvedAmount - asNumber(reviewAction.advance.amountLegalized)),
          adminComment: reviewComment.trim() || null,
          nextAction: 'justify_advance',
          inboxTargetUserId: reviewAction.advance.requesterId,
          approvedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        await logAdministrativeEvent(reviewAction.advance.id, 'advance_approved', {
          amount: approvedAmount,
          comment: reviewComment.trim(),
        });
        toast.success('Anticipo aprobado. Queda listo para legalización.');
      }

      if (reviewAction.type === 'returnAdvance' || reviewAction.type === 'rejectAdvance') {
        const nextStatus = reviewAction.type === 'returnAdvance' ? 'returned' : 'rejected';
        await updateDoc(doc(db, 'projects', projectId, 'advanceRequests', reviewAction.advance.id), {
          status: nextStatus,
          adminComment: reviewComment.trim(),
          nextAction: nextStatus === 'returned' ? 'correct_advance' : 'closed',
          inboxTargetUserId: reviewAction.advance.requesterId,
          updatedAt: serverTimestamp(),
        });
        await logAdministrativeEvent(reviewAction.advance.id, `advance_${nextStatus}`, {
          comment: reviewComment.trim(),
        });
        toast.success(nextStatus === 'returned' ? 'Anticipo devuelto para corrección.' : 'Anticipo rechazado.');
      }

      if (reviewAction.type === 'approveReceipt') {
        const advance = reviewAction.advance;
        const receipt = reviewAction.receipt;
        const paymentRef = await addDoc(collection(db, 'projects', projectId, 'billingPayments'), {
          projectId,
          description: `Legalización anticipo: ${receipt.categoryName}`,
          vendor: receipt.businessName || 'Proveedor sin nombre',
          amount: asNumber(receipt.amount),
          date: new Date(`${receipt.date || todayInputValue()}T00:00:00`),
          status: 'paid',
          budgetLineId: null,
          budgetPieceId: null,
          notes: [receipt.description, receipt.cufe ? `CUFE: ${receipt.cufe}` : null].filter(Boolean).join(' · '),
          source: 'advance_receipt',
          advanceId: advance.id,
          receiptId: receipt.id,
          expenseCategoryId: receipt.categoryId,
          createdAt: serverTimestamp(),
          createdBy: currentUser?.uid || null,
        });

        const nextReceipts = (advance.receipts || []).map((item) =>
          item.id === receipt.id
            ? {
                ...item,
                status: 'approved' as const,
                reviewedAt: new Date().toISOString(),
                reviewedBy: currentUser?.uid || null,
                reviewComment: reviewComment.trim(),
                billingPaymentId: paymentRef.id,
              }
            : item
        );
        const amountLegalized = nextReceipts
          .filter((item) => item.status === 'approved')
          .reduce((sum, item) => sum + asNumber(item.amount), 0);
        const amountApproved = asNumber(advance.amountApproved);
        const isClosed = amountApproved > 0 && amountLegalized >= amountApproved;

        await updateDoc(doc(db, 'projects', projectId, 'advanceRequests', advance.id), {
          receipts: nextReceipts,
          amountLegalized,
          balance: Math.max(0, amountApproved - amountLegalized),
          status: isClosed ? 'closed' : advance.status === 'returned' ? 'approved' : advance.status,
          nextAction: isClosed ? 'closed' : 'justify_advance',
          closedAt: isClosed ? serverTimestamp() : null,
          updatedAt: serverTimestamp(),
        });
        await logAdministrativeEvent(advance.id, 'receipt_approved', {
          receiptId: receipt.id,
          amount: receipt.amount,
          billingPaymentId: paymentRef.id,
          comment: reviewComment.trim(),
        });
        toast.success('Soporte aprobado y costo real registrado.');
      }

      if (reviewAction.type === 'returnReceipt') {
        const advance = reviewAction.advance;
        const receipt = reviewAction.receipt;
        const nextReceipts = (advance.receipts || []).map((item) =>
          item.id === receipt.id
            ? {
                ...item,
                status: 'returned' as const,
                reviewedAt: new Date().toISOString(),
                reviewedBy: currentUser?.uid || null,
                reviewComment: reviewComment.trim(),
              }
            : item
        );
        await updateDoc(doc(db, 'projects', projectId, 'advanceRequests', advance.id), {
          receipts: nextReceipts,
          status: 'returned',
          nextAction: 'correct_receipt',
          inboxTargetUserId: advance.requesterId,
          updatedAt: serverTimestamp(),
        });
        await logAdministrativeEvent(advance.id, 'receipt_returned', {
          receiptId: receipt.id,
          comment: reviewComment.trim(),
        });
        toast.success('Soporte devuelto para corrección.');
      }

      setReviewAction(null);
      setReviewComment('');
    } catch (error: any) {
      console.error('Error reviewing advance action:', error);
      toast.error(error?.message || 'No se pudo completar la validación.');
    } finally {
      setSubmitting(false);
    }
  };

  const resetReceiptForm = () => {
    setReceiptForm({
      categoryId: categoryOptions[0]?.id || '',
      amount: '',
      date: todayInputValue(),
      businessName: '',
      taxId: '',
      invoiceNumber: '',
      cufe: '',
      description: '',
    });
    setReceiptFile(null);
  };

  const handleCreateReceipt = async () => {
    if (!selectedAdvance || !canManage) return;
    const category = categoryOptions.find((item) => item.id === receiptForm.categoryId);
    const amount = asNumber(receiptForm.amount);
    if (!category || amount <= 0 || !receiptForm.businessName.trim()) {
      toast.error('Completa categoría, valor y razón social del soporte.');
      return;
    }
    if (category.requiresCufe && !receiptForm.cufe.trim()) {
      toast.error('Este dominio requiere CUFE.');
      return;
    }

    setSubmitting(true);
    try {
      let fileUrl = '';
      let storagePath = '';

      if (receiptFile) {
        const uploadDate = new Date();
        storagePath = buildDocumentStoragePath({
          projectId,
          projectName: project?.name,
          fileName: receiptFile.name,
          documentName: `legalizacion-${selectedAdvance.destination}-${category.name}`,
          date: uploadDate,
          folderName: 'administrativo',
          folderSegments: ['anticipos', selectedAdvance.id, category.name],
        });
        const storageRef = ref(storage, storagePath);
        await uploadBytes(storageRef, receiptFile);
        storagePath = storageRef.fullPath;
        fileUrl = await getDownloadURL(storageRef);

        await addDoc(collection(db, 'projects', projectId, 'documents'), {
          projectId,
          name: receiptFile.name,
          documentName: `Soporte ${category.name}`,
          type: 'Comprobante administrativo',
          itemKind: 'file',
          scope: 'project',
          administrativeRequestId: selectedAdvance.id,
          documentContext: 'advanceReceipt',
          category: category.name,
          url: fileUrl,
          downloadURL: fileUrl,
          fileName: receiptFile.name,
          fileSize: receiptFile.size,
          fileType: receiptFile.type || 'application/octet-stream',
          storagePath,
          uploadedAt: serverTimestamp(),
          uploadedBy: currentUser?.uid || null,
          uploadedByName: getCurrentUserName(currentUser),
          createdAt: serverTimestamp(),
          accessMode: 'all',
          providerPathVersion: 'structured-v1',
        });
      }

      const receipt: AdvanceReceipt = {
        id: safeId(),
        categoryId: category.id,
        categoryName: category.name,
        amount,
        date: receiptForm.date,
        businessName: receiptForm.businessName.trim(),
        taxId: receiptForm.taxId.trim(),
        invoiceNumber: receiptForm.invoiceNumber.trim(),
        cufe: receiptForm.cufe.trim(),
        description: receiptForm.description.trim(),
        fileName: receiptFile?.name,
        fileSize: receiptFile?.size,
        fileUrl,
        storagePath,
        status: 'submitted',
        createdAt: new Date().toISOString(),
        createdBy: currentUser?.uid || null,
        createdByName: getCurrentUserName(currentUser),
      };

      await updateDoc(doc(db, 'projects', projectId, 'advanceRequests', selectedAdvance.id), {
        receipts: [...(selectedAdvance.receipts || []), receipt],
        nextAction: 'validate_receipt',
        pendingRole: 'administrative_validation',
        updatedAt: serverTimestamp(),
      });
      await logAdministrativeEvent(selectedAdvance.id, 'receipt_submitted', {
        receiptId: receipt.id,
        amount,
        categoryName: category.name,
      });
      toast.success('Soporte cargado para validación.');
      resetReceiptForm();
      setSelectedAdvance(null);
    } catch (error: any) {
      console.error('Error creating receipt:', error);
      toast.error(error?.message || 'No se pudo guardar el soporte.');
    } finally {
      setSubmitting(false);
    }
  };

  const seedDefaultCategories = async () => {
    if (!canConfigure) return;
    setSubmitting(true);
    try {
      const existingNames = new Set(categories.map((category) => category.name.trim().toLowerCase()));
      const missing = DEFAULT_CATEGORIES.filter((category) => !existingNames.has(category.name.trim().toLowerCase()));
      await Promise.all(
        missing.map((category) =>
          addDoc(collection(db, 'projects', projectId, 'expenseCategories'), {
            ...category,
            projectId,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
            createdBy: currentUser?.uid || null,
          })
        )
      );
      toast.success(missing.length > 0 ? 'Dominios base creados.' : 'Los dominios base ya existían.');
    } catch (error: any) {
      console.error('Error seeding categories:', error);
      toast.error(error?.message || 'No se pudieron crear los dominios.');
    } finally {
      setSubmitting(false);
    }
  };

  const saveCategory = async () => {
    if (!canConfigure) return;
    if (!categoryForm.name.trim()) {
      toast.error('Escribe el nombre del dominio.');
      return;
    }
    setSubmitting(true);
    try {
      const payload = {
        projectId,
        name: categoryForm.name.trim(),
        defaultDailyAmount: asNumber(categoryForm.defaultDailyAmount),
        unitLabel: categoryForm.unitLabel.trim() || 'dia',
        color: categoryForm.color || '#4f46e5',
        requiresCufe: categoryForm.requiresCufe,
        description: categoryForm.description.trim(),
        active: true,
        updatedAt: serverTimestamp(),
      };
      if (categoryForm.id) {
        await updateDoc(doc(db, 'projects', projectId, 'expenseCategories', categoryForm.id), payload);
        toast.success('Dominio actualizado.');
      } else {
        await addDoc(collection(db, 'projects', projectId, 'expenseCategories'), {
          ...payload,
          createdAt: serverTimestamp(),
          createdBy: currentUser?.uid || null,
        });
        toast.success('Dominio creado.');
      }
      setCategoryForm({
        id: '',
        name: '',
        defaultDailyAmount: '',
        unitLabel: 'dia',
        color: '#4f46e5',
        requiresCufe: false,
        description: '',
      });
    } catch (error: any) {
      console.error('Error saving category:', error);
      toast.error(error?.message || 'No se pudo guardar el dominio.');
    } finally {
      setSubmitting(false);
    }
  };

  const toggleCategory = async (category: ExpenseCategory) => {
    if (!canConfigure || category.id.startsWith('default-')) return;
    await updateDoc(doc(db, 'projects', projectId, 'expenseCategories', category.id), {
      active: category.active === false,
      updatedAt: serverTimestamp(),
    });
  };

  if (!canView) {
    return (
      <section className="rounded-xl border border-amber-200 bg-white p-8 text-center shadow-sm">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-xl bg-amber-50 text-amber-700 ring-1 ring-amber-100">
          <ShieldCheck size={28} />
        </div>
        <h2 className="mt-4 text-2xl font-black tracking-tight text-slate-950">Administración protegida</h2>
        <p className="mx-auto mt-2 max-w-2xl text-sm font-medium leading-6 text-slate-500">
          Este módulo controla anticipos, legalizaciones y costos reales del proyecto. Tu rol no tiene acceso habilitado.
        </p>
      </section>
    );
  }

  return (
    <div className="space-y-5">
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-5 bg-slate-950 px-5 py-6 text-white lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-md bg-emerald-400/10 px-3 py-1 text-[11px] font-black uppercase tracking-[0.28em] text-emerald-200 ring-1 ring-emerald-300/20">
              <FolderKanban size={14} />
              Control administrativo
            </div>
            <h2 className="mt-3 text-3xl font-black tracking-tight">Anticipos, legalizaciones y costos reales</h2>
            <p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-slate-300">
              Gestiona solicitudes de viaje, soportes de campo y validaciones administrativas sin perder trazabilidad.
              Los soportes aprobados alimentan los pagos reales del proyecto.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {canConfigure && (
              <Button type="button" variant="outline" onClick={seedDefaultCategories} className="border-white/20 bg-white/10 text-white hover:bg-white/20">
                <RefreshCw size={16} className="mr-2" />
                Dominios base
              </Button>
            )}
            {canManage && (
              <Button type="button" onClick={openNewAdvance} className="bg-emerald-500 font-bold text-white hover:bg-emerald-600">
                <Plus size={17} className="mr-2" />
                Nuevo anticipo
              </Button>
            )}
          </div>
        </div>

        <div className="grid gap-3 border-t border-slate-800 bg-slate-950/95 p-4 sm:grid-cols-2 xl:grid-cols-5">
          <Metric label="Solicitado" value={formatMoney(metrics.requested)} icon={<Send size={18} />} tone="blue" />
          <Metric label="Aprobado" value={formatMoney(metrics.approved)} icon={<CheckCircle2 size={18} />} tone="indigo" />
          <Metric label="Legalizado" value={formatMoney(metrics.legalized)} icon={<ReceiptText size={18} />} tone="emerald" />
          <Metric label="Saldo por legalizar" value={formatMoney(metrics.balance)} icon={<AlertCircle size={18} />} tone="amber" />
          <Metric label="Costo real registrado" value={formatMoney(metrics.realAdminPayments)} icon={<Banknote size={18} />} tone="rose" />
        </div>
      </section>

      <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap gap-2">
          {[
            ['requests', 'Anticipos', advances.length],
            ['receipts', 'Legalizaciones', receipts.length],
            ['payments', 'Costos reales', payments.filter((payment) => payment.source === 'advance_receipt').length],
            ['settings', 'Dominios', categoryOptions.length],
          ].map(([id, label, count]) => (
            <button
              key={String(id)}
              type="button"
              onClick={() => setView(id as typeof view)}
              className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-black transition ${
                view === id
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20'
                  : 'bg-slate-50 text-slate-600 ring-1 ring-slate-200 hover:bg-slate-100'
              }`}
            >
              {label}
              <span className={`rounded-md px-1.5 py-0.5 text-[11px] ${view === id ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-600'}`}>{count}</span>
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2 text-xs font-bold">
          <span className="rounded-md bg-amber-50 px-2 py-1 text-amber-700">{metrics.pendingValidation} por validar</span>
          <span className="rounded-md bg-orange-50 px-2 py-1 text-orange-700">{metrics.returned} devueltos</span>
        </div>
      </div>

      {loading ? (
        <div className="flex min-h-72 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
          Cargando administración...
        </div>
      ) : (
        <>
          {view === 'requests' && (
            <div className="grid gap-4">
              {advances.length === 0 ? (
                <EmptyState title="No hay anticipos registrados" body="Crea el primer anticipo de viaje para iniciar el control administrativo del proyecto." />
              ) : (
                advances.map((advance) => (
                  <AdvanceCard
                    key={advance.id}
                    advance={advance}
                    canValidate={canValidate}
                    canManage={canManage}
                    onOpenReceipt={() => setSelectedAdvance(advance)}
                    onApprove={() => setReviewAction({ type: 'approveAdvance', advance })}
                    onReturn={() => setReviewAction({ type: 'returnAdvance', advance })}
                    onReject={() => setReviewAction({ type: 'rejectAdvance', advance })}
                  />
                ))
              )}
            </div>
          )}

          {view === 'receipts' && (
            <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-100 p-4">
                <h3 className="text-lg font-black text-slate-950">Legalizaciones y soportes</h3>
                <p className="text-sm font-medium text-slate-500">Cada soporte conserva factura, CUFE, foto y su trazabilidad de validación.</p>
              </div>
              {receipts.length === 0 ? (
                <EmptyState title="Sin soportes cargados" body="Los comprobantes de campo aparecerán aquí cuando se legalice un anticipo." />
              ) : (
                <div className="divide-y divide-slate-100">
                  {receipts.map((receipt: any) => (
                    <div key={`${receipt.advanceId}-${receipt.id}`} className="grid gap-3 p-4 lg:grid-cols-[1fr_auto] lg:items-center">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-black text-slate-950">{receipt.categoryName}</span>
                          <span className={`rounded-md px-2 py-1 text-[11px] font-black ring-1 ${getReceiptStatusMeta(receipt.status).className}`}>
                            {getReceiptStatusMeta(receipt.status).label}
                          </span>
                          <span className="rounded-md bg-slate-100 px-2 py-1 text-[11px] font-black text-slate-500">{formatMoney(receipt.amount)}</span>
                        </div>
                        <p className="mt-1 text-sm font-semibold text-slate-600">{receipt.businessName || 'Sin razón social'} · {formatDate(receipt.date)}</p>
                        <p className="mt-1 text-xs font-semibold text-slate-400">
                          {receipt.advanceTitle} · {receipt.requesterName}
                          {receipt.cufe ? ` · CUFE ${receipt.cufe}` : ''}
                        </p>
                        {receipt.fileUrl && (
                          <a href={receipt.fileUrl} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-xs font-black text-indigo-600 hover:text-indigo-800">
                            <FileImage size={14} />
                            Ver soporte
                          </a>
                        )}
                      </div>
                      {canValidate && receipt.status === 'submitted' && (
                        <div className="flex gap-2">
                          <Button type="button" size="sm" onClick={() => setReviewAction({ type: 'approveReceipt', advance: receipt.advance, receipt })} className="bg-emerald-600 text-white hover:bg-emerald-700">
                            Aprobar
                          </Button>
                          <Button type="button" size="sm" variant="outline" onClick={() => setReviewAction({ type: 'returnReceipt', advance: receipt.advance, receipt })} className="border-orange-200 text-orange-700 hover:bg-orange-50">
                            Devolver
                          </Button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {view === 'payments' && (
            <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-100 p-4">
                <h3 className="text-lg font-black text-slate-950">Costos reales administrativos</h3>
                <p className="text-sm font-medium text-slate-500">Pagos reales generados al aprobar legalizaciones de anticipos.</p>
              </div>
              <div className="divide-y divide-slate-100">
                {payments.filter((payment) => payment.source === 'advance_receipt').length === 0 ? (
                  <EmptyState title="Sin costos reales administrativos" body="Cuando un soporte sea aprobado se creará un pago real para facturación y análisis financiero." />
                ) : (
                  payments
                    .filter((payment) => payment.source === 'advance_receipt')
                    .map((payment) => (
                      <div key={payment.id} className="grid gap-2 p-4 sm:grid-cols-[1fr_auto] sm:items-center">
                        <div>
                          <p className="font-black text-slate-950">{formatMoney(payment.amount)}</p>
                          <p className="text-xs font-bold text-slate-500">Registrado {formatDate(payment.date)} · Anticipo {payment.advanceId}</p>
                        </div>
                        <span className="rounded-md bg-emerald-50 px-2 py-1 text-xs font-black text-emerald-700 ring-1 ring-emerald-100">
                          Pago real
                        </span>
                      </div>
                    ))
                )}
              </div>
            </div>
          )}

          {view === 'settings' && (
            <div className="grid gap-4 lg:grid-cols-[1fr_420px]">
              <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
                <div className="border-b border-slate-100 p-4">
                  <h3 className="flex items-center gap-2 text-lg font-black text-slate-950">
                    <Settings2 size={18} className="text-indigo-600" />
                    Dominios de gasto
                  </h3>
                  <p className="text-sm font-medium text-slate-500">Transporte, alimentación, hospedaje y cualquier otro rubro configurable.</p>
                </div>
                <div className="divide-y divide-slate-100">
                  {categoryOptions.map((category) => (
                    <div key={category.id} className="grid gap-3 p-4 sm:grid-cols-[auto_1fr_auto] sm:items-center">
                      <span className="h-4 w-4 rounded-full" style={{ backgroundColor: category.color || '#64748b' }} />
                      <div>
                        <p className="font-black text-slate-950">{category.name}</p>
                        <p className="text-xs font-semibold text-slate-500">
                          {formatMoney(category.defaultDailyAmount)} por {category.unitLabel || 'dia'}
                          {category.requiresCufe ? ' · requiere CUFE' : ''}
                        </p>
                        {category.description && <p className="mt-1 text-xs font-medium text-slate-400">{category.description}</p>}
                      </div>
                      {canConfigure && !category.id.startsWith('default-') && (
                        <div className="flex gap-2">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              setCategoryForm({
                                id: category.id,
                                name: category.name,
                                defaultDailyAmount: String(category.defaultDailyAmount || ''),
                                unitLabel: category.unitLabel || 'dia',
                                color: category.color || '#4f46e5',
                                requiresCufe: Boolean(category.requiresCufe),
                                description: category.description || '',
                              })
                            }
                          >
                            Editar
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => toggleCategory(category)}
                            className={category.active === false ? 'border-emerald-200 text-emerald-700' : 'border-rose-200 text-rose-700'}
                          >
                            {category.active === false ? 'Activar' : 'Desactivar'}
                          </Button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <h3 className="text-base font-black text-slate-950">{categoryForm.id ? 'Editar dominio' : 'Nuevo dominio'}</h3>
                <div className="mt-4 space-y-3">
                  <Field label="Nombre">
                    <input className={inputClass} value={categoryForm.name} onChange={(event) => setCategoryForm((current) => ({ ...current, name: event.target.value }))} placeholder="Ej: Transporte rural" />
                  </Field>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Valor por unidad">
                      <input className={inputClass} type="number" value={categoryForm.defaultDailyAmount} onChange={(event) => setCategoryForm((current) => ({ ...current, defaultDailyAmount: event.target.value }))} />
                    </Field>
                    <Field label="Unidad">
                      <input className={inputClass} value={categoryForm.unitLabel} onChange={(event) => setCategoryForm((current) => ({ ...current, unitLabel: event.target.value }))} />
                    </Field>
                  </div>
                  <Field label="Color">
                    <input className={`${inputClass} p-1`} type="color" value={categoryForm.color} onChange={(event) => setCategoryForm((current) => ({ ...current, color: event.target.value }))} />
                  </Field>
                  <label className="flex items-center gap-2 rounded-lg border border-slate-200 p-3 text-sm font-bold text-slate-700">
                    <input type="checkbox" checked={categoryForm.requiresCufe} onChange={(event) => setCategoryForm((current) => ({ ...current, requiresCufe: event.target.checked }))} />
                    Requiere CUFE para validar factura
                  </label>
                  <Field label="Descripción">
                    <textarea className={textareaClass} value={categoryForm.description} onChange={(event) => setCategoryForm((current) => ({ ...current, description: event.target.value }))} />
                  </Field>
                  <Button type="button" onClick={saveCategory} disabled={submitting || !canConfigure} className="w-full bg-indigo-600 font-bold text-white hover:bg-indigo-700">
                    {submitting && <Loader2 size={16} className="mr-2 animate-spin" />}
                    Guardar dominio
                  </Button>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {isAdvanceModalOpen && (
        <ModalShell title="Nuevo anticipo de viaje" subtitle="Solicitud administrativa para operación en campo." onClose={() => setIsAdvanceModalOpen(false)} wide>
          <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
            <div className="space-y-4">
              <div className="grid gap-3 md:grid-cols-2">
                <Field label="Solicitante">
                  <select className={inputClass} value={advanceForm.requesterId} onChange={(event) => setAdvanceForm((current) => ({ ...current, requesterId: event.target.value }))}>
                    {teamMembers.map((member) => (
                      <option key={member.id} value={member.id}>
                        {getMemberLabel(member)}
                      </option>
                    ))}
                    {!teamMembers.length && currentUser && <option value={currentUser.uid}>{getCurrentUserName(currentUser)}</option>}
                  </select>
                </Field>
                <Field label="Tareas relacionadas">
                  <div className="space-y-2">
                    <select
                      className={inputClass}
                      value=""
                      onChange={(event) => {
                        const taskId = event.target.value;
                        if (!taskId) return;
                        setAdvanceForm((current) => ({
                          ...current,
                          taskIds: current.taskIds.includes(taskId) ? current.taskIds : [...current.taskIds, taskId],
                        }));
                      }}
                    >
                      <option value="">Agregar tarea asociada...</option>
                      {tasks.map((task) => (
                        <option key={task.id} value={task.id} disabled={advanceForm.taskIds.includes(task.id)}>
                          {getTaskTitle(task)}
                        </option>
                      ))}
                    </select>
                    <div className="flex min-h-9 flex-wrap gap-2">
                      {selectedAdvanceTasks.length === 0 ? (
                        <span className="rounded-lg bg-slate-50 px-3 py-2 text-xs font-bold text-slate-400 ring-1 ring-slate-200">
                          Sin tareas asociadas
                        </span>
                      ) : (
                        selectedAdvanceTasks.map((task) => (
                          <span key={task.id} className="inline-flex max-w-full items-center gap-2 rounded-lg bg-indigo-50 px-3 py-2 text-xs font-black text-indigo-700 ring-1 ring-indigo-100">
                            <span className="truncate">{getTaskTitle(task)}</span>
                            <button
                              type="button"
                              onClick={() =>
                                setAdvanceForm((current) => ({
                                  ...current,
                                  taskIds: current.taskIds.filter((id) => id !== task.id),
                                }))
                              }
                              className="rounded-md p-0.5 text-indigo-400 hover:bg-indigo-100 hover:text-indigo-700"
                              aria-label={`Quitar ${getTaskTitle(task)}`}
                            >
                              <X size={13} />
                            </button>
                          </span>
                        ))
                      )}
                    </div>
                  </div>
                </Field>
                <Field label="Departamento">
                  <select
                    className={inputClass}
                    value={advanceForm.department}
                    disabled={locationsLoading || locationOptions.length === 0}
                    onChange={(event) =>
                      setAdvanceForm((current) => ({
                        ...current,
                        department: event.target.value,
                        municipality: '',
                      }))
                    }
                  >
                    <option value="">
                      {locationsLoading
                        ? 'Cargando departamentos...'
                        : locationOptions.length > 0
                          ? 'Selecciona departamento'
                          : 'Departamentos no disponibles'}
                    </option>
                    {locationOptions.map((department) => (
                      <option key={department.department} value={department.department}>
                        {department.department}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Municipio">
                  <select
                    className={inputClass}
                    value={advanceForm.municipality}
                    disabled={locationsLoading || !advanceForm.department}
                    onChange={(event) => setAdvanceForm((current) => ({ ...current, municipality: event.target.value }))}
                  >
                    <option value="">
                      {locationsLoading
                        ? 'Cargando municipios...'
                        : advanceForm.department
                          ? 'Selecciona municipio'
                          : 'Primero elige departamento'}
                    </option>
                    {municipalityOptions.map((municipality) => (
                      <option key={municipality} value={municipality}>
                        {municipality}
                      </option>
                    ))}
                  </select>
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Inicio">
                    <input className={inputClass} type="date" value={advanceForm.travelStart} onChange={(event) => setAdvanceForm((current) => ({ ...current, travelStart: event.target.value }))} />
                  </Field>
                  <Field label="Fin">
                    <input className={inputClass} type="date" value={advanceForm.travelEnd} onChange={(event) => setAdvanceForm((current) => ({ ...current, travelEnd: event.target.value }))} />
                  </Field>
                </div>
              </div>
              <Field label="Justificación del anticipo">
                <textarea className={textareaClass} value={advanceForm.purpose} onChange={(event) => setAdvanceForm((current) => ({ ...current, purpose: event.target.value }))} placeholder="Describe para qué se requiere el anticipo, actividad y alcance." />
              </Field>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex flex-col gap-2 border-b border-slate-200 pb-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h3 className="font-black text-slate-950">Ítems del anticipo</h3>
                    <p className="text-xs font-semibold text-slate-500">Los valores pueden partir de dominios configurados o ajustarse manualmente.</p>
                  </div>
                  <span className="rounded-md bg-white px-3 py-1 text-sm font-black text-slate-900 ring-1 ring-slate-200">
                    {formatMoney(advanceForm.items.reduce((sum, item) => sum + item.amount, 0))}
                  </span>
                </div>

                {advanceDraftItem && (
                  <div className="mt-4 grid gap-3 rounded-xl border border-slate-200 bg-white p-3 lg:grid-cols-[1.2fr_0.6fr_0.8fr_1fr_auto] lg:items-end">
                    <Field label="Dominio">
                      <select className={inputClass} value={advanceDraftItem.categoryId} onChange={(event) => updateDraftItem({ categoryId: event.target.value })}>
                        {categoryOptions.map((category) => (
                          <option key={category.id} value={category.id}>
                            {category.name}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Días/unidades">
                      <input className={inputClass} type="number" min="0" step="0.5" value={advanceDraftItem.days} onChange={(event) => updateDraftItem({ days: asNumber(event.target.value) })} />
                    </Field>
                    <Field label="Valor unitario">
                      <input className={inputClass} type="number" min="0" value={advanceDraftItem.unitAmount} onChange={(event) => updateDraftItem({ unitAmount: asNumber(event.target.value), customAmount: true })} />
                    </Field>
                    <Field label="Nota">
                      <input className={inputClass} value={advanceDraftItem.note || ''} onChange={(event) => updateDraftItem({ note: event.target.value })} placeholder="Opcional" />
                    </Field>
                    <Button type="button" onClick={addDraftItem} className="h-11 bg-slate-950 font-bold text-white hover:bg-slate-800">
                      Agregar
                    </Button>
                  </div>
                )}

                <div className="mt-3 divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
                  {advanceForm.items.length === 0 ? (
                    <div className="p-5 text-center text-sm font-semibold text-slate-400">Sin ítems agregados.</div>
                  ) : (
                    advanceForm.items.map((item) => (
                      <div key={item.id} className="grid gap-2 p-3 sm:grid-cols-[1fr_auto_auto] sm:items-center">
                        <div>
                          <p className="font-black text-slate-900">{item.categoryName}</p>
                          <p className="text-xs font-semibold text-slate-500">
                            {item.days} x {formatMoney(item.unitAmount)}
                            {item.note ? ` · ${item.note}` : ''}
                          </p>
                        </div>
                        <span className="font-black text-slate-950">{formatMoney(item.amount)}</span>
                        <button type="button" onClick={() => removeAdvanceItem(item.id)} className="rounded-md p-2 text-rose-500 hover:bg-rose-50">
                          <X size={16} />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-indigo-100 bg-indigo-50/70 p-4">
              <p className="text-[11px] font-black uppercase tracking-[0.28em] text-indigo-600">Resumen</p>
              <div className="mt-4 space-y-3">
                <SummaryLine label="Destino" value={[advanceForm.municipality, advanceForm.department].filter(Boolean).join(', ') || 'Sin destino'} />
                <SummaryLine label="Tareas asociadas" value={`${selectedAdvanceTasks.length}`} />
                <SummaryLine label="Periodo" value={`${formatDate(advanceForm.travelStart)} - ${formatDate(advanceForm.travelEnd)}`} />
                <SummaryLine label="Días calendario" value={`${inclusiveDays(advanceForm.travelStart, advanceForm.travelEnd)} días`} />
                <SummaryLine label="Ítems" value={`${advanceForm.items.length}`} />
                <SummaryLine label="Total solicitado" value={formatMoney(advanceForm.items.reduce((sum, item) => sum + item.amount, 0))} strong />
              </div>
              <div className="mt-5 rounded-xl border border-indigo-200 bg-white p-3 text-xs font-semibold leading-5 text-slate-600">
                Esta solicitud queda en estado <strong>por validar</strong>. Luego el área administrativa podrá aprobarla,
                devolverla o rechazarla y el responsable recibirá la acción pendiente en la estructura del anticipo.
              </div>
            </div>
          </div>
          <ModalFooter>
            <Button type="button" variant="outline" onClick={() => setIsAdvanceModalOpen(false)}>Cancelar</Button>
            <Button type="button" onClick={handleCreateAdvance} disabled={submitting} className="bg-indigo-600 font-bold text-white hover:bg-indigo-700">
              {submitting && <Loader2 size={16} className="mr-2 animate-spin" />}
              Enviar anticipo
            </Button>
          </ModalFooter>
        </ModalShell>
      )}

      {selectedAdvance && (
        <ModalShell title="Legalizar anticipo" subtitle={selectedAdvance.purpose || selectedAdvance.destination} onClose={() => setSelectedAdvance(null)} wide>
          <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
            <div className="space-y-4">
              <div className="grid gap-3 md:grid-cols-2">
                <Field label="Tipo de gasto">
                  <select className={inputClass} value={receiptForm.categoryId} onChange={(event) => setReceiptForm((current) => ({ ...current, categoryId: event.target.value }))}>
                    {categoryOptions.map((category) => (
                      <option key={category.id} value={category.id}>{category.name}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Valor del soporte">
                  <input className={inputClass} type="number" min="0" step="0.01" value={receiptForm.amount} onChange={(event) => setReceiptForm((current) => ({ ...current, amount: event.target.value }))} />
                </Field>
                <Field label="Fecha del gasto">
                  <input className={inputClass} type="date" value={receiptForm.date} onChange={(event) => setReceiptForm((current) => ({ ...current, date: event.target.value }))} />
                </Field>
                <Field label="Razón social / proveedor">
                  <input className={inputClass} value={receiptForm.businessName} onChange={(event) => setReceiptForm((current) => ({ ...current, businessName: event.target.value }))} />
                </Field>
                <Field label="NIT o documento">
                  <input className={inputClass} value={receiptForm.taxId} onChange={(event) => setReceiptForm((current) => ({ ...current, taxId: event.target.value }))} />
                </Field>
                <Field label="Factura / recibo">
                  <input className={inputClass} value={receiptForm.invoiceNumber} onChange={(event) => setReceiptForm((current) => ({ ...current, invoiceNumber: event.target.value }))} />
                </Field>
              </div>
              <Field label={selectedReceiptCategory?.requiresCufe ? 'CUFE requerido' : 'CUFE (opcional)'}>
                <input className={inputClass} value={receiptForm.cufe} onChange={(event) => setReceiptForm((current) => ({ ...current, cufe: event.target.value }))} placeholder="Código CUFE de la factura electrónica" />
              </Field>
              <Field label="Descripción / justificación">
                <textarea className={textareaClass} value={receiptForm.description} onChange={(event) => setReceiptForm((current) => ({ ...current, description: event.target.value }))} placeholder="Qué gasto se realizó y por qué corresponde al anticipo." />
              </Field>
              <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4">
                <label className="flex cursor-pointer flex-col items-center justify-center rounded-lg bg-white p-6 text-center ring-1 ring-slate-200 transition hover:bg-slate-50">
                  <Upload size={24} className="text-indigo-600" />
                  <span className="mt-2 text-sm font-black text-slate-900">{receiptFile ? receiptFile.name : 'Adjuntar foto o PDF del soporte'}</span>
                  <span className="mt-1 text-xs font-semibold text-slate-400">Se guardará dentro del gestor documental del proyecto.</span>
                  <input type="file" className="hidden" accept="image/*,application/pdf" onChange={(event) => setReceiptFile(event.target.files?.[0] || null)} />
                </label>
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <p className="text-[11px] font-black uppercase tracking-[0.28em] text-slate-400">Anticipo</p>
              <h3 className="mt-2 text-xl font-black text-slate-950">{selectedAdvance.destination}</h3>
              <p className="mt-1 text-sm font-semibold text-slate-500">{selectedAdvance.requesterName}</p>
              <div className="mt-4 space-y-3">
                <SummaryLine label="Aprobado" value={formatMoney(selectedAdvance.amountApproved)} />
                <SummaryLine label="Legalizado" value={formatMoney(selectedAdvance.amountLegalized)} />
                <SummaryLine label="Saldo" value={formatMoney(selectedAdvance.balance)} strong />
              </div>
              <div className="mt-5 rounded-xl bg-slate-50 p-3 text-xs font-semibold leading-5 text-slate-500">
                La validación DIAN por CUFE queda preparada como dato estructurado; la consulta automática se conectará
                cuando definamos el servicio de verificación.
              </div>
            </div>
          </div>
          <ModalFooter>
            <Button type="button" variant="outline" onClick={() => setSelectedAdvance(null)}>Cancelar</Button>
            <Button type="button" onClick={handleCreateReceipt} disabled={submitting} className="bg-emerald-600 font-bold text-white hover:bg-emerald-700">
              {submitting && <Loader2 size={16} className="mr-2 animate-spin" />}
              Enviar soporte
            </Button>
          </ModalFooter>
        </ModalShell>
      )}

      {reviewAction && (
        <ModalShell
          title={
            reviewAction.type.includes('Receipt')
              ? 'Validar soporte'
              : reviewAction.type === 'approveAdvance'
                ? 'Aprobar anticipo'
                : reviewAction.type === 'rejectAdvance'
                  ? 'Rechazar anticipo'
                  : 'Devolver anticipo'
          }
          subtitle="La decisión quedará en la trazabilidad administrativa."
          onClose={() => setReviewAction(null)}
        >
          <Field label="Comentario administrativo">
            <textarea
              className={textareaClass}
              value={reviewComment}
              onChange={(event) => setReviewComment(event.target.value)}
              placeholder="Explica la decisión, observaciones o ajustes solicitados."
            />
          </Field>
          <ModalFooter>
            <Button type="button" variant="outline" onClick={() => setReviewAction(null)}>Cancelar</Button>
            <Button type="button" onClick={applyReviewAction} disabled={submitting} className="bg-indigo-600 font-bold text-white hover:bg-indigo-700">
              {submitting && <Loader2 size={16} className="mr-2 animate-spin" />}
              Confirmar
            </Button>
          </ModalFooter>
        </ModalShell>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-black uppercase tracking-[0.16em] text-slate-500">{label}</span>
      {children}
    </label>
  );
}

function Metric({ label, value, icon, tone }: { label: string; value: string; icon: React.ReactNode; tone: 'blue' | 'indigo' | 'emerald' | 'amber' | 'rose' }) {
  const tones = {
    blue: 'bg-sky-400/10 text-sky-200 ring-sky-300/20',
    indigo: 'bg-indigo-400/10 text-indigo-200 ring-indigo-300/20',
    emerald: 'bg-emerald-400/10 text-emerald-200 ring-emerald-300/20',
    amber: 'bg-amber-400/10 text-amber-200 ring-amber-300/20',
    rose: 'bg-rose-400/10 text-rose-200 ring-rose-300/20',
  };
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] font-black uppercase tracking-[0.24em] text-slate-400">{label}</p>
        <span className={`rounded-lg p-2 ring-1 ${tones[tone]}`}>{icon}</span>
      </div>
      <p className="mt-4 text-2xl font-black tracking-tight text-white">{value}</p>
    </div>
  );
}

function SummaryLine({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg bg-white/70 px-3 py-2 ring-1 ring-slate-200">
      <span className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">{label}</span>
      <span className={`text-sm ${strong ? 'font-black text-slate-950' : 'font-bold text-slate-600'}`}>{value}</span>
    </div>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-white p-12 text-center">
      <ClipboardCheck className="mx-auto h-10 w-10 text-slate-300" />
      <h3 className="mt-3 text-lg font-black text-slate-900">{title}</h3>
      <p className="mx-auto mt-1 max-w-xl text-sm font-medium text-slate-500">{body}</p>
    </div>
  );
}

function ModalShell({
  title,
  subtitle,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm">
      <div className={`max-h-[92vh] w-full overflow-hidden rounded-2xl bg-white shadow-2xl ${wide ? 'max-w-6xl' : 'max-w-2xl'}`}>
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4">
          <div>
            <h2 className="text-2xl font-black tracking-tight text-slate-950">{title}</h2>
            {subtitle && <p className="mt-1 text-sm font-semibold text-slate-500">{subtitle}</p>}
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700">
            <X size={20} />
          </button>
        </div>
        <div className="max-h-[calc(92vh-88px)] overflow-y-auto px-5 py-5">{children}</div>
      </div>
    </div>
  );
}

function ModalFooter({ children }: { children: React.ReactNode }) {
  return <div className="mt-5 flex justify-end gap-2 border-t border-slate-100 pt-4">{children}</div>;
}

function AdvanceCard({
  advance,
  canValidate,
  canManage,
  onOpenReceipt,
  onApprove,
  onReturn,
  onReject,
}: {
  advance: TravelAdvance;
  canValidate: boolean;
  canManage: boolean;
  onOpenReceipt: () => void;
  onApprove: () => void;
  onReturn: () => void;
  onReject: () => void;
}) {
  const status = statusConfig[advance.status] || statusConfig.submitted;
  const linkedTaskTitles =
    Array.isArray(advance.taskTitles) && advance.taskTitles.length > 0
      ? advance.taskTitles
      : advance.taskTitle
        ? [advance.taskTitle]
        : [];
  const progress =
    asNumber(advance.amountApproved) > 0
      ? Math.min(100, Math.round((asNumber(advance.amountLegalized) / asNumber(advance.amountApproved)) * 100))
      : 0;

  return (
    <article className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="grid gap-4 p-4 lg:grid-cols-[1fr_auto] lg:items-start">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-md px-2 py-1 text-[11px] font-black ring-1 ${status.className}`}>{status.label}</span>
            <span className="rounded-md bg-slate-100 px-2 py-1 text-[11px] font-black text-slate-500">{advance.requesterName}</span>
            {linkedTaskTitles.slice(0, 2).map((taskTitle) => (
              <span key={taskTitle} className="max-w-[220px] truncate rounded-md bg-indigo-50 px-2 py-1 text-[11px] font-black text-indigo-700 ring-1 ring-indigo-100">
                {taskTitle}
              </span>
            ))}
            {linkedTaskTitles.length > 2 && (
              <span className="rounded-md bg-indigo-100 px-2 py-1 text-[11px] font-black text-indigo-700 ring-1 ring-indigo-100">
                +{linkedTaskTitles.length - 2} tareas
              </span>
            )}
          </div>
          <h3 className="mt-3 text-xl font-black tracking-tight text-slate-950">{advance.destination}</h3>
          <p className="mt-1 line-clamp-2 text-sm font-semibold leading-6 text-slate-600">{advance.purpose}</p>
          <div className="mt-3 flex flex-wrap gap-2 text-xs font-bold text-slate-500">
            <span className="inline-flex items-center gap-1 rounded-md bg-slate-50 px-2 py-1 ring-1 ring-slate-200">
              <CalendarDays size={13} />
              {formatDate(advance.travelStart)} - {formatDate(advance.travelEnd)}
            </span>
            <span className="inline-flex items-center gap-1 rounded-md bg-slate-50 px-2 py-1 ring-1 ring-slate-200">
              <MapPin size={13} />
              {advance.items?.length || 0} ítems
            </span>
          </div>
        </div>
        <div className="grid min-w-[280px] gap-2">
          <SummaryLine label="Solicitado" value={formatMoney(advance.amountRequested)} />
          <SummaryLine label="Aprobado" value={formatMoney(advance.amountApproved)} />
          <SummaryLine label="Legalizado" value={`${formatMoney(advance.amountLegalized)} · ${progress}%`} strong />
        </div>
      </div>

      <div className="grid gap-3 border-t border-slate-100 bg-slate-50/70 p-4 lg:grid-cols-[1fr_auto] lg:items-center">
        <div className="flex min-w-0 flex-wrap gap-2">
          {(advance.items || []).slice(0, 5).map((item) => (
            <span key={item.id} className="rounded-md bg-white px-2 py-1 text-xs font-black text-slate-600 ring-1 ring-slate-200">
              {item.categoryName}: {formatMoney(item.amount)}
            </span>
          ))}
          {(advance.receipts || []).length > 0 && (
            <span className="rounded-md bg-emerald-50 px-2 py-1 text-xs font-black text-emerald-700 ring-1 ring-emerald-100">
              {(advance.receipts || []).length} soportes
            </span>
          )}
          {advance.adminComment && (
            <span className="rounded-md bg-orange-50 px-2 py-1 text-xs font-black text-orange-700 ring-1 ring-orange-100">
              {advance.adminComment}
            </span>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {canManage && ['approved', 'returned'].includes(advance.status) && (
            <Button type="button" size="sm" onClick={onOpenReceipt} className="bg-emerald-600 text-white hover:bg-emerald-700">
              <ReceiptText size={15} className="mr-2" />
              Legalizar
            </Button>
          )}
          {canValidate && advance.status === 'submitted' && (
            <>
              <Button type="button" size="sm" onClick={onApprove} className="bg-indigo-600 text-white hover:bg-indigo-700">
                Aprobar
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={onReturn} className="border-orange-200 text-orange-700 hover:bg-orange-50">
                Devolver
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={onReject} className="border-rose-200 text-rose-700 hover:bg-rose-50">
                Rechazar
              </Button>
            </>
          )}
          <ArrowRight size={18} className="hidden text-slate-300 lg:block" />
        </div>
      </div>
    </article>
  );
}
