"use client";

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import {
  AlertCircle,
  ArrowRight,
  Banknote,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  ClipboardCheck,
  CreditCard,
  Download,
  Eye,
  EyeOff,
  FileImage,
  FileText,
  FolderKanban,
  ExternalLink,
  Loader2,
  MapPin,
  PencilLine,
  Plus,
  ReceiptText,
  RefreshCw,
  RotateCcw,
  Search,
  Send,
  Settings2,
  ShieldCheck,
  Sparkles,
  Trash2,
  Upload,
  WalletCards,
  X,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { SecureDocumentLink } from '@/components/projects/SecureDocumentLink';
import { addDoc, collection, deleteDoc, doc, getDocs, onSnapshot, orderBy, query, serverTimestamp, updateDoc, where } from '@/lib/supabase/document-store';
import { db, storage } from '@/lib/backend';
import {
  ref,
  uploadBytes,
  getDownloadURL,
  getAuthorizedDownloadBlob,
  getAuthorizedDownloadURL,
  getStoragePathFromDownloadUrl,
} from '@/lib/supabase/storage-shim';
import { buildDocumentStoragePath, getDocumentFolderStorageSegments } from '@/lib/document-storage';
import { ensureManagedDocumentFolderPath } from '@/lib/document-folders';
import { isCompletedTaskStatus } from '@/lib/taskProgress';
import {
  AdvanceDossierReport,
  generateAdvanceDossierPdf,
} from '@/lib/advance-dossier-pdf';

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

type CostCenterDomain = {
  id: string;
  name: string;
  code?: string;
  active?: boolean;
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
  billingPaymentId?: string;
  customAmount?: boolean;
};

type CostCenterAllocation = {
  id: string;
  domainId?: string;
  name: string;
  percentage: number;
  amount: number;
  note?: string;
};

type ReceiptDocumentType = 'invoice' | 'cash_receipt';

type ReceiptStatus = 'submitted' | 'approved' | 'approved_modified' | 'returned' | 'rejected';

type ReceiptFieldChange = {
  field: string;
  label: string;
  previousValue: string | number | null;
  nextValue: string | number | null;
};

type ReceiptRevision = {
  type: 'returned' | 'resubmitted' | 'approved' | 'approved_modified' | 'support_replaced';
  actorId?: string | null;
  actorName?: string;
  at: string;
  comment?: string;
  changes?: ReceiptFieldChange[];
};

type AdvanceReceipt = {
  id: string;
  documentType?: ReceiptDocumentType;
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
  documentId?: string;
  status: ReceiptStatus;
  createdAt: string;
  createdBy?: string | null;
  createdByName?: string;
  reviewedAt?: string;
  reviewedBy?: string | null;
  reviewedByName?: string;
  reviewComment?: string;
  revisionCount?: number;
  revisions?: ReceiptRevision[];
  approvalChanges?: ReceiptFieldChange[];
  correctionNote?: string;
  resubmittedAt?: string;
  resubmittedBy?: string | null;
  resubmittedByName?: string;
  dianVerificationStatus?: 'pending' | 'confirmed' | 'failed' | 'not_applicable';
  dianLookupOpenedAt?: string;
  dianVerifiedAt?: string;
  dianVerifiedBy?: string | null;
  dianVerifiedByName?: string;
  dianDocumentUrl?: string;
  billingPaymentId?: string;
  aiExtracted?: boolean;
  aiConfidence?: number;
  aiWarnings?: string[];
};

type AdvancePaymentSupport = {
  documentId: string;
  fileName: string;
  fileSize: number;
  fileUrl: string;
  storagePath: string;
  amount: number;
  date: string;
  reference?: string;
  note?: string;
  billingPaymentId?: string;
  paidAt: string;
  paidBy?: string | null;
  paidByName?: string;
};

type AdvanceReconciliationSupport = {
  documentId: string;
  fileName: string;
  fileSize: number;
  fileUrl: string;
  storagePath: string;
  amount: number;
  date: string;
  reference?: string;
  note?: string;
  billingPaymentId?: string;
  uploadedAt: string;
  uploadedBy?: string | null;
  uploadedByName?: string;
};

type AdvanceReconciliationStatus = 'pending_validation' | 'pending_return' | 'pending_compensation' | 'ready' | 'reconciled';

type AdvanceReportScope = 'advance' | 'payment' | 'justifications' | 'reconciliation' | 'full';

type AdvanceSignatureSnapshot = {
  signatureUrl: string;
  signatureStoragePath?: string;
  signerUserId: string;
  signerMemberId?: string;
  name: string;
  email: string;
  jobTitle: string;
  signedAt: string;
};

type AiReceiptDraft = {
  id: string;
  file: File;
  fileName: string;
  fileSize: number;
  fileType: string;
  documentType: ReceiptDocumentType;
  categoryId: string;
  categoryName?: string;
  amount: string;
  date: string;
  businessName: string;
  taxId: string;
  invoiceNumber: string;
  cufe: string;
  description: string;
  confidence?: number;
  warnings?: string[];
  status: 'ready' | 'error';
  error?: string;
};

type TravelAdvance = {
  id: string;
  customId?: string | null;
  customIdNormalized?: string | null;
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
  status: 'submitted' | 'pending_payment' | 'paid' | 'approved' | 'completed' | 'returned' | 'rejected' | 'closed';
  items: AdvanceItem[];
  receipts?: AdvanceReceipt[];
  amountRequested: number;
  amountApproved: number;
  amountLegalized: number;
  balance: number;
  amountReturned?: number;
  returnComment?: string;
  returnedAt?: any;
  returnedBy?: string | null;
  returnedByName?: string;
  costCenters?: CostCenterAllocation[];
  costCenterId?: string | null;
  costCenterName?: string | null;
  adminComment?: string;
  requesterSignature?: AdvanceSignatureSnapshot;
  approvalSignature?: AdvanceSignatureSnapshot;
  paymentSupport?: AdvancePaymentSupport;
  returnSupport?: AdvanceReconciliationSupport;
  compensationSupport?: AdvanceReconciliationSupport;
  reconciliationStatus?: AdvanceReconciliationStatus;
  amountCompensated?: number;
  reconciledAt?: any;
  reconciledBy?: string | null;
  reconciledByName?: string;
  paymentApprovedAt?: any;
  paymentApprovedBy?: string | null;
  paymentApprovedByName?: string;
  paidAt?: any;
  createdAt?: any;
  updatedAt?: any;
  submittedAt?: any;
  approvedAt?: any;
  completedAt?: any;
  completedBy?: string | null;
  completedByName?: string;
  closedAt?: any;
  administrativeEditedAt?: any;
  administrativeEditedBy?: string | null;
  administrativeEditedByName?: string;
};

type AdvanceEditForm = {
  customId: string;
  department: string;
  municipality: string;
  purpose: string;
  travelStart: string;
  travelEnd: string;
  amountReturned: string;
  returnComment: string;
  costCenters: CostCenterAllocation[];
  items: AdvanceItem[];
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
  | { type: 'deleteAdvance'; advance: TravelAdvance }
  | { type: 'returnReceipt'; advance: TravelAdvance; receipt: AdvanceReceipt }
  | null;

type ReceiptEditorMode = 'review' | 'correction';

type ReceiptEditorState = {
  mode: ReceiptEditorMode;
  advance: TravelAdvance;
  receipt: AdvanceReceipt;
};

type ReceiptEditorForm = {
  documentType: ReceiptDocumentType;
  categoryId: string;
  amount: string;
  date: string;
  businessName: string;
  taxId: string;
  invoiceNumber: string;
  cufe: string;
  description: string;
  correctionNote: string;
  dianVerificationStatus: 'pending' | 'confirmed' | 'failed' | 'not_applicable';
  dianLookupOpenedAt: string;
  dianVerifiedAt: string;
  dianDocumentUrl: string;
};

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

type AdvanceTaskStatusFilter = 'active' | 'all' | 'pending' | 'in_progress' | 'blocked' | 'completed';

const UNGROUPED_TASK_GROUP_ID = '__ungrouped__';

const normalizeTaskSearchText = (value: unknown) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

const getTaskStatusMeta = (task: any) => {
  const status = String(task?.status || '').toLowerCase();
  if (isCompletedTaskStatus(status)) {
    return { key: 'completed', label: 'Finalizada', className: 'bg-emerald-50 text-emerald-700 ring-emerald-100' };
  }
  if (['cancelled', 'canceled', 'deleted'].includes(status)) {
    return { key: 'cancelled', label: 'Cancelada', className: 'bg-slate-100 text-slate-500 ring-slate-200' };
  }
  if (status === 'stuck') {
    return { key: 'blocked', label: 'Bloqueada', className: 'bg-rose-50 text-rose-700 ring-rose-100' };
  }
  if (status === 'paused') {
    return { key: 'blocked', label: 'Pausada', className: 'bg-amber-50 text-amber-700 ring-amber-100' };
  }
  if (['in_progress', 'started'].includes(status)) {
    return { key: 'in_progress', label: 'En curso', className: 'bg-sky-50 text-sky-700 ring-sky-100' };
  }
  return { key: 'pending', label: 'Pendiente', className: 'bg-slate-50 text-slate-600 ring-slate-200' };
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

const DEFAULT_COST_CENTERS: Array<Omit<CostCenterDomain, 'id'>> = [
  {
    name: 'Centro de costos principal',
    code: 'PRINCIPAL',
    active: true,
    description: 'Centro de costos general del proyecto.',
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

const formatSupportFileSize = (size?: number) => {
  const bytes = asNumber(size);
  if (!bytes) return '0 KB';
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
};

const safeId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

const roundCurrency = (value: any) => Math.round(asNumber(value) * 100) / 100;

const buildDefaultCostCenter = (
  amount = 0,
  domain?: Pick<CostCenterDomain, 'id' | 'name'>
): CostCenterAllocation => ({
  id: safeId(),
  domainId: domain?.id,
  name: domain?.name || 'Centro de costos principal',
  percentage: 100,
  amount: roundCurrency(amount),
  note: '',
});

const normalizeCostCenters = (centers: CostCenterAllocation[] | undefined, totalAmount = 0) => {
  const base = centers && centers.length > 0 ? centers : [buildDefaultCostCenter(totalAmount)];
  const normalized = base.map((center, index) => {
    const percentage = Math.max(0, asNumber(center.percentage));
    return {
      id: center.id || safeId(),
      domainId: center.domainId,
      name: String(center.name || `Centro de costos ${index + 1}`).trim() || `Centro de costos ${index + 1}`,
      percentage,
      amount: roundCurrency(totalAmount > 0 ? (totalAmount * percentage) / 100 : center.amount),
      note: center.note || '',
    };
  });

  if (normalized.length === 1 && totalAmount > 0) {
    normalized[0].percentage = 100;
    normalized[0].amount = roundCurrency(totalAmount);
  }

  return normalized;
};

const getCostCenterPercentTotal = (centers?: CostCenterAllocation[]) =>
  roundCurrency((centers || []).reduce((sum, center) => sum + asNumber(center.percentage), 0));

const costCentersAreBalanced = (centers?: CostCenterAllocation[]) =>
  Math.abs(getCostCenterPercentTotal(centers) - 100) < 0.01;

const getAdvanceFinancialCoverage = (advance: Partial<TravelAdvance>) => {
  const approved = asNumber(advance.amountApproved || advance.amountRequested);
  const legalized = asNumber(advance.amountLegalized);
  const returnedCash = asNumber(advance.amountReturned);
  const covered = roundCurrency(legalized + returnedCash);
  const balance = roundCurrency(approved - covered);

  return {
    approved,
    legalized,
    returnedCash,
    covered,
    balance,
    overage: Math.max(0, roundCurrency(covered - approved)),
    progress: approved > 0 ? Math.min(100, Math.round((covered / approved) * 100)) : 0,
    isFullyCovered: approved > 0 && covered >= approved,
  };
};

const getAdvanceJustifiedAmount = (advance: Partial<TravelAdvance>) =>
  roundCurrency(
    (advance.receipts || [])
      .filter((receipt) => receipt.status !== 'rejected')
      .reduce((sum, receipt) => sum + asNumber(receipt.amount), 0)
  );

const getAdvanceReconciliation = (advance: Partial<TravelAdvance>) => {
  const anticipated = asNumber(advance.amountApproved || advance.amountRequested);
  const justified = getAdvanceJustifiedAmount(advance);
  const legalized = asNumber(advance.amountLegalized);
  const difference = roundCurrency(legalized - anticipated);
  return {
    anticipated,
    justified,
    legalized,
    difference,
    returnRequired: Math.max(0, roundCurrency(-difference)),
    compensationRequired: Math.max(0, difference),
    isExact: Math.abs(difference) < 0.01,
  };
};

const isAdvanceReconciled = (advance: Partial<TravelAdvance>) =>
  advance.reconciliationStatus === 'reconciled' || advance.status === 'closed';

const getAdvanceReportAvailability = (advance: Partial<TravelAdvance>) => {
  const hasPayment = Boolean(advance.paymentSupport);
  const hasLegalizations = (advance.receipts || []).some(
    (receipt) => receipt.status !== 'rejected'
  );
  const hasEnteredReconciliation =
    advance.status === 'completed' ||
    advance.status === 'closed' ||
    Boolean(advance.completedAt);
  const hasFinalReport =
    advance.status === 'closed' &&
    advance.reconciliationStatus === 'reconciled';

  return {
    advance: true,
    payment: hasPayment,
    justifications: hasLegalizations,
    reconciliation: hasEnteredReconciliation,
    full: hasFinalReport,
  } satisfies Record<AdvanceReportScope, boolean>;
};

const getSafeFileToken = (value: any) =>
  String(value || 'anticipo')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9-_]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'anticipo';

const downloadBlob = (fileName: string, blob: Blob) => {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
};

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
  pending_payment: { label: 'Aprobado por pagar', className: 'bg-violet-50 text-violet-700 ring-violet-100' },
  paid: { label: 'Pagado · por legalizar', className: 'bg-sky-50 text-sky-700 ring-sky-100' },
  approved: { label: 'En legalización (legado)', className: 'bg-sky-50 text-sky-700 ring-sky-100' },
  completed: { label: 'En conciliación', className: 'bg-cyan-50 text-cyan-700 ring-cyan-100' },
  returned: { label: 'Devuelto', className: 'bg-orange-50 text-orange-700 ring-orange-100' },
  rejected: { label: 'Rechazado', className: 'bg-rose-50 text-rose-700 ring-rose-100' },
  closed: { label: 'Conciliado', className: 'bg-teal-50 text-teal-700 ring-teal-100' },
};

const receiptStatusConfig: Record<AdvanceReceipt['status'], { label: string; className: string }> = {
  submitted: { label: 'Por revisar', className: 'bg-amber-50 text-amber-700 ring-amber-100' },
  approved: { label: 'Aceptado', className: 'bg-emerald-50 text-emerald-700 ring-emerald-100' },
  approved_modified: { label: 'Aprobado con modificación', className: 'bg-indigo-50 text-indigo-700 ring-indigo-100' },
  returned: { label: 'Devuelto', className: 'bg-rose-50 text-rose-700 ring-rose-100' },
  rejected: { label: 'Rechazado', className: 'bg-rose-50 text-rose-700 ring-rose-100' },
};

const receiptDocumentTypeConfig: Record<
  ReceiptDocumentType,
  { label: string; shortLabel: string; numberLabel: string; className: string; hint: string }
> = {
  invoice: {
    label: 'Factura electrónica',
    shortLabel: 'Factura',
    numberLabel: 'No. factura',
    className: 'bg-blue-50 text-blue-700 ring-blue-100',
    hint: 'Usa esta opción cuando el soporte tenga factura electrónica o CUFE.',
  },
  cash_receipt: {
    label: 'Recibo de caja',
    shortLabel: 'Recibo de caja',
    numberLabel: 'No. recibo de caja',
    className: 'bg-amber-50 text-amber-700 ring-amber-100',
    hint: 'Usa esta opción cuando en campo no fue posible conseguir factura electrónica.',
  },
};

const getReceiptStatusMeta = (status: any) =>
  receiptStatusConfig[status as AdvanceReceipt['status']] || receiptStatusConfig.submitted;

const getReceiptDocumentType = (value: any): ReceiptDocumentType =>
  value === 'cash_receipt' ? 'cash_receipt' : 'invoice';

const getReceiptDocumentTypeMeta = (value: any) =>
  receiptDocumentTypeConfig[getReceiptDocumentType(value)];

const APPROVED_RECEIPT_STATUSES: ReceiptStatus[] = ['approved', 'approved_modified'];

const isApprovedReceipt = (receipt: Pick<AdvanceReceipt, 'status'>) =>
  APPROVED_RECEIPT_STATUSES.includes(receipt.status);

const isAdvanceReadyForLegalization = (advance: Pick<TravelAdvance, 'status'>) =>
  advance.status === 'paid' || advance.status === 'approved';

const normalizeCufe = (value: string) => value.replace(/\s+/g, '').trim();

type ReceiptIdentityInput = Pick<
  AdvanceReceipt,
  'documentType' | 'cufe' | 'invoiceNumber' | 'taxId' | 'businessName' | 'amount' | 'date'
>;

type ReceiptDuplicateUsage = {
  advanceId: string;
  advanceTitle: string;
  requesterName: string;
  receiptId: string;
  documentType: ReceiptDocumentType;
  invoiceNumber?: string;
  cufe?: string;
  taxId?: string;
  businessName: string;
  amount: number;
  date: string;
};

const normalizeReceiptToken = (value?: string | number | null) =>
  String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

const getReceiptIdentity = (receipt: Partial<ReceiptIdentityInput>) => {
  const documentType = getReceiptDocumentType(receipt.documentType);
  const cufe = normalizeCufe(String(receipt.cufe || '')).toLowerCase();
  if (documentType === 'invoice' && cufe) return `invoice:cufe:${cufe}`;

  const invoiceNumber = normalizeReceiptToken(receipt.invoiceNumber);
  const taxId = normalizeReceiptToken(receipt.taxId);
  if (invoiceNumber && taxId) return `${documentType}:number-tax:${invoiceNumber}:${taxId}`;

  const businessName = normalizeReceiptToken(receipt.businessName);
  const date = normalizeReceiptToken(receipt.date);
  const amount = asNumber(receipt.amount).toFixed(2);
  if (invoiceNumber && businessName && amount !== '0.00') {
    return `${documentType}:number-business:${invoiceNumber}:${businessName}:${amount}`;
  }
  if (businessName && date && amount !== '0.00') {
    return `${documentType}:fallback:${businessName}:${date}:${amount}`;
  }

  return null;
};

const buildDianDocumentUrl = (cufe: string) =>
  `https://catalogo-vpfe.dian.gov.co/document/searchqr?documentkey=${encodeURIComponent(normalizeCufe(cufe))}`;

const RECEIPT_EDITABLE_FIELDS: Array<{ key: keyof ReceiptEditorForm; label: string }> = [
  { key: 'documentType', label: 'Tipo de documento' },
  { key: 'categoryId', label: 'Tipo de gasto' },
  { key: 'amount', label: 'Valor' },
  { key: 'date', label: 'Fecha' },
  { key: 'businessName', label: 'Razón social' },
  { key: 'taxId', label: 'NIT o documento' },
  { key: 'invoiceNumber', label: 'Número del soporte' },
  { key: 'cufe', label: 'CUFE' },
  { key: 'description', label: 'Descripción' },
];

const buildReceiptEditorForm = (receipt: AdvanceReceipt): ReceiptEditorForm => {
  const documentType = getReceiptDocumentType(receipt.documentType);
  const cufe = receipt.cufe || '';
  return {
    documentType,
    categoryId: receipt.categoryId || '',
    amount: String(asNumber(receipt.amount) || ''),
    date: receipt.date || todayInputValue(),
    businessName: receipt.businessName || '',
    taxId: receipt.taxId || '',
    invoiceNumber: receipt.invoiceNumber || '',
    cufe,
    description: receipt.description || '',
    correctionNote: '',
    dianVerificationStatus:
      documentType === 'cash_receipt'
        ? 'not_applicable'
        : receipt.dianVerificationStatus || (cufe ? 'pending' : 'not_applicable'),
    dianLookupOpenedAt: receipt.dianLookupOpenedAt || '',
    dianVerifiedAt: receipt.dianVerifiedAt || '',
    dianDocumentUrl: receipt.dianDocumentUrl || (cufe ? buildDianDocumentUrl(cufe) : ''),
  };
};

const buildEmptyAdvanceForm = (currentUser: any, teamMembers: any[]) => {
  const currentMember = teamMembers.find((member) => {
    const emailMatches =
      currentUser?.email &&
      member?.email &&
      String(member.email).toLowerCase() === String(currentUser.email).toLowerCase();
    return member?.id === currentUser?.uid || member?.authUserId === currentUser?.uid || emailMatches;
  });

  return {
    customId: '',
    requesterId: currentMember?.id || currentUser?.uid || '',
    destination: '',
    department: '',
    municipality: '',
    purpose: '',
    travelStart: todayInputValue(),
    travelEnd: todayInputValue(),
    taskIds: [] as string[],
    costCenterId: '',
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
  const [costCenterDomains, setCostCenterDomains] = useState<CostCenterDomain[]>([]);
  const [payments, setPayments] = useState<BillingPayment[]>([]);
  const [locationOptions, setLocationOptions] = useState<ColombiaDepartment[]>([]);
  const [locationsLoading, setLocationsLoading] = useState(false);
  const [locationsLoaded, setLocationsLoaded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'requests' | 'approvals' | 'payables' | 'receipts' | 'conciliation' | 'payments' | 'settings'>('requests');
  const [advanceSearch, setAdvanceSearch] = useState('');
  const [showPaidAdvances, setShowPaidAdvances] = useState(false);
  const [showReconciledAdvances, setShowReconciledAdvances] = useState(false);
  const [isAdvanceModalOpen, setIsAdvanceModalOpen] = useState(false);
  const [advanceForm, setAdvanceForm] = useState(() => buildEmptyAdvanceForm(currentUser, teamMembers));
  const [advanceTaskSearch, setAdvanceTaskSearch] = useState('');
  const [advanceTaskStatusFilter, setAdvanceTaskStatusFilter] = useState<AdvanceTaskStatusFilter>('active');
  const [advanceTaskGroupFilter, setAdvanceTaskGroupFilter] = useState('all');
  const [advanceDraftItem, setAdvanceDraftItem] = useState<AdvanceItem | null>(null);
  const [selectedAdvance, setSelectedAdvance] = useState<TravelAdvance | null>(null);
  const [viewingAdvance, setViewingAdvance] = useState<TravelAdvance | null>(null);
  const [paymentAdvance, setPaymentAdvance] = useState<TravelAdvance | null>(null);
  const [paymentFile, setPaymentFile] = useState<File | null>(null);
  const [paymentForm, setPaymentForm] = useState({
    customId: '',
    amount: '',
    date: todayInputValue(),
    reference: '',
    note: '',
  });
  const [reconciliationAdvance, setReconciliationAdvance] = useState<TravelAdvance | null>(null);
  const [reconciliationFile, setReconciliationFile] = useState<File | null>(null);
  const [reconciliationForm, setReconciliationForm] = useState({
    date: todayInputValue(),
    reference: '',
    note: '',
  });
  const [editingAdvance, setEditingAdvance] = useState<TravelAdvance | null>(null);
  const [advanceEditForm, setAdvanceEditForm] = useState<AdvanceEditForm>({
    customId: '',
    department: '',
    municipality: '',
    purpose: '',
    travelStart: todayInputValue(),
    travelEnd: todayInputValue(),
    amountReturned: '',
    returnComment: '',
    costCenters: [],
    items: [],
  });
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [supportPreviewFile, setSupportPreviewFile] = useState<File | null>(null);
  const [receiptMode, setReceiptMode] = useState<'manual' | 'ai'>('manual');
  const [aiReceiptDrafts, setAiReceiptDrafts] = useState<AiReceiptDraft[]>([]);
  const [aiAnalyzingReceipts, setAiAnalyzingReceipts] = useState(false);
  const [receiptForm, setReceiptForm] = useState({
    documentType: 'invoice' as ReceiptDocumentType,
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
  const [costCenterForm, setCostCenterForm] = useState({
    id: '',
    name: '',
    code: '',
    description: '',
  });
  const [reviewAction, setReviewAction] = useState<ReviewAction>(null);
  const [reviewComment, setReviewComment] = useState('');
  const [receiptEditor, setReceiptEditor] = useState<ReceiptEditorState | null>(null);
  const [receiptEditorForm, setReceiptEditorForm] = useState<ReceiptEditorForm | null>(null);
  const [receiptCorrectionFile, setReceiptCorrectionFile] = useState<File | null>(null);
  const [receiptReplacementFile, setReceiptReplacementFile] = useState<File | null>(null);
  const [receiptSupportAction, setReceiptSupportAction] = useState<'replace' | 'reanalyze' | null>(null);
  const [expandedReceiptGroups, setExpandedReceiptGroups] = useState<Record<string, boolean>>({});
  const [submitting, setSubmitting] = useState(false);

  const openReviewAction = (action: NonNullable<ReviewAction>) => {
    setReviewComment('');
    setReviewAction(action);
  };

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
        query(collection(db, 'projects', projectId, 'costCenters'), orderBy('name', 'asc')),
        (snapshot) => {
          setCostCenterDomains(snapshot.docs.map((snap) => ({ id: snap.id, ...snap.data() } as CostCenterDomain)));
        },
        (error) => {
          console.error('Error loading cost center domains:', error);
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

  const costCenterOptions = useMemo(() => {
    const liveCostCenters = costCenterDomains.filter((center) => center.active !== false);
    if (liveCostCenters.length > 0) return liveCostCenters;
    return DEFAULT_COST_CENTERS.map((center, index) => ({ id: `default-cost-center-${index}`, ...center }));
  }, [costCenterDomains]);

  const selectedReceiptCategory = categoryOptions.find((category) => category.id === receiptForm.categoryId);
  const selectedReceiptDocumentType = getReceiptDocumentType(receiptForm.documentType);
  const selectedReceiptDocumentMeta = getReceiptDocumentTypeMeta(receiptForm.documentType);
  const municipalityOptions = useMemo(
    () => locationOptions.find((item) => item.department === advanceForm.department)?.municipalities || [],
    [advanceForm.department, locationOptions]
  );
  const editMunicipalityOptions = useMemo(
    () => locationOptions.find((item) => item.department === advanceEditForm.department)?.municipalities || [],
    [advanceEditForm.department, locationOptions]
  );
  const selectedAdvanceTasks = useMemo(
    () => tasks.filter((task) => advanceForm.taskIds.includes(task.id)),
    [advanceForm.taskIds, tasks]
  );
  const taskById = useMemo(
    () => new Map(tasks.filter((task) => task?.id).map((task) => [task.id as string, task])),
    [tasks]
  );
  const getAdvanceTaskGroupId = useCallback((task: any) => {
    const visited = new Set<string>();
    let current = task;

    while (current && !visited.has(String(current.id || ''))) {
      if (current.groupId) return String(current.groupId);
      if (!current.id || !current.parentTaskId) break;
      visited.add(String(current.id));
      current = taskById.get(current.parentTaskId);
    }

    return UNGROUPED_TASK_GROUP_ID;
  }, [taskById]);
  const advanceTaskGroups = useMemo(() => {
    const groups = new Map<string, { id: string; name: string; color?: string; order: number }>();
    (Array.isArray(project?.taskGroups) ? project.taskGroups : []).forEach((group: any, index: number) => {
      if (!group?.id) return;
      groups.set(group.id, {
        id: group.id,
        name: group.name || 'Grupo sin nombre',
        color: group.color,
        order: Number(group.order ?? index),
      });
    });
    tasks.forEach((task) => {
      const groupId = getAdvanceTaskGroupId(task);
      if (groupId === UNGROUPED_TASK_GROUP_ID || groups.has(groupId)) return;
      groups.set(groupId, {
        id: groupId,
        name: task.groupName || 'Grupo sin nombre',
        color: task.groupColor,
        order: groups.size,
      });
    });

    return [
      ...[...groups.values()].sort((left, right) => left.order - right.order || left.name.localeCompare(right.name)),
      { id: UNGROUPED_TASK_GROUP_ID, name: 'Sin grupo', color: '#94a3b8', order: Number.MAX_SAFE_INTEGER },
    ];
  }, [getAdvanceTaskGroupId, project?.taskGroups, tasks]);
  const advanceTaskGroupById = useMemo(
    () => new Map(advanceTaskGroups.map((group) => [group.id, group])),
    [advanceTaskGroups]
  );
  const filteredAdvanceTasks = useMemo(() => {
    const search = normalizeTaskSearchText(advanceTaskSearch);

    return [...tasks]
      .filter((task) => {
        const statusMeta = getTaskStatusMeta(task);
        const isActive = !['completed', 'cancelled'].includes(statusMeta.key);
        if (advanceTaskStatusFilter === 'active' && !isActive) return false;
        if (advanceTaskStatusFilter !== 'active' && advanceTaskStatusFilter !== 'all' && statusMeta.key !== advanceTaskStatusFilter) {
          return false;
        }

        const groupId = getAdvanceTaskGroupId(task);
        if (advanceTaskGroupFilter !== 'all' && groupId !== advanceTaskGroupFilter) return false;
        if (!search) return true;

        const parentTask = task.parentTaskId ? taskById.get(task.parentTaskId) : null;
        const groupName = advanceTaskGroupById.get(groupId)?.name || 'Sin grupo';
        return normalizeTaskSearchText([
          getTaskTitle(task),
          task.externalWorkflowId,
          task.description,
          task.id,
          groupName,
          parentTask ? getTaskTitle(parentTask) : '',
        ].filter(Boolean).join(' ')).includes(search);
      })
      .sort((left, right) => {
        const leftGroup = advanceTaskGroupById.get(getAdvanceTaskGroupId(left));
        const rightGroup = advanceTaskGroupById.get(getAdvanceTaskGroupId(right));
        const groupOrder = Number(leftGroup?.order ?? Number.MAX_SAFE_INTEGER) - Number(rightGroup?.order ?? Number.MAX_SAFE_INTEGER);
        if (groupOrder !== 0) return groupOrder;
        return getTaskTitle(left).localeCompare(getTaskTitle(right), 'es', { sensitivity: 'base' });
      });
  }, [advanceTaskGroupById, advanceTaskGroupFilter, advanceTaskSearch, advanceTaskStatusFilter, getAdvanceTaskGroupId, taskById, tasks]);

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

  useEffect(() => {
    if (!advanceForm.costCenterId && costCenterOptions.length > 0) {
      setAdvanceForm((current) => ({ ...current, costCenterId: costCenterOptions[0].id }));
    }
  }, [advanceForm.costCenterId, costCenterOptions]);

  const metrics = useMemo(() => {
    const activeAdvances = advances.filter((advance) => advance.status !== 'rejected');
    const requested = activeAdvances.reduce((sum, advance) => sum + asNumber(advance.amountRequested), 0);
    const anticipated = activeAdvances.reduce(
      (sum, advance) => sum + asNumber(advance.amountApproved || advance.amountRequested),
      0
    );
    const justified = activeAdvances.reduce((sum, advance) => sum + getAdvanceJustifiedAmount(advance), 0);
    const legalized = activeAdvances.reduce((sum, advance) => sum + asNumber(advance.amountLegalized), 0);
    const returnedCash = activeAdvances.reduce((sum, advance) => sum + asNumber(advance.amountReturned), 0);
    const pendingValidation = advances.filter((advance) => advance.status === 'submitted').length;
    const pendingPayment = advances.filter((advance) => advance.status === 'pending_payment').length;
    const returned = advances.filter(
      (advance) =>
        advance.status === 'returned' || (advance.receipts || []).some((receipt) => receipt.status === 'returned')
    ).length;
    const realAdminPayments = payments
      .filter((payment) => payment.source === 'advance_receipt' && payment.status !== 'cancelled')
      .reduce((sum, payment) => sum + asNumber(payment.amount), 0);

    return {
      requested,
      anticipated,
      justified,
      legalized,
      returnedCash,
      balance: Math.max(0, anticipated - legalized - returnedCash),
      pendingValidation,
      pendingPayment,
      returned,
      realAdminPayments,
    };
  }, [advances, payments]);

  const filteredAdvances = useMemo(() => {
    const search = advanceSearch.trim().toLowerCase();
    if (!search) return advances;

    return advances.filter((advance) => {
      const linkedTaskTitles =
        Array.isArray(advance.taskTitles) && advance.taskTitles.length > 0
          ? advance.taskTitles
          : advance.taskTitle
            ? [advance.taskTitle]
            : [];
      const haystack = [
        advance.customId,
        advance.id,
        advance.requesterName,
        advance.requesterEmail,
        advance.destination,
        advance.department,
        advance.municipality,
        advance.purpose,
        advance.status,
        ...linkedTaskTitles,
        ...(advance.items || []).map((item) => item.categoryName),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return haystack.includes(search);
    });
  }, [advanceSearch, advances]);

  const hiddenPaidAdvancesCount = useMemo(
    () => filteredAdvances.filter((advance) => advance.status === 'paid').length,
    [filteredAdvances]
  );

  const hiddenReconciledAdvancesCount = useMemo(
    () => filteredAdvances.filter(isAdvanceReconciled).length,
    [filteredAdvances]
  );

  const requestAdvances = useMemo(
    () =>
      filteredAdvances.filter(
        (advance) => showReconciledAdvances || !isAdvanceReconciled(advance)
      ),
    [filteredAdvances, showReconciledAdvances]
  );

  const approvalAdvances = useMemo(
    () => filteredAdvances.filter((advance) => ['submitted', 'returned'].includes(advance.status)),
    [filteredAdvances]
  );

  const payableAdvances = useMemo(
    () =>
      filteredAdvances.filter((advance) =>
        advance.status === 'pending_payment' ||
        (showPaidAdvances && advance.status === 'paid')
      ),
    [filteredAdvances, showPaidAdvances]
  );

  const administrativeQueueAdvances = view === 'approvals' ? approvalAdvances : payableAdvances;

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

  const receiptUsageIndex = useMemo(() => {
    const index = new Map<string, ReceiptDuplicateUsage[]>();

    advances.forEach((advance) => {
      (advance.receipts || []).forEach((receipt) => {
        const identity = getReceiptIdentity(receipt);
        if (!identity || receipt.status === 'rejected') return;

        const usage: ReceiptDuplicateUsage = {
          advanceId: advance.id,
          advanceTitle: advance.purpose || advance.destination || 'Anticipo sin nombre',
          requesterName: advance.requesterName || 'Solicitante',
          receiptId: receipt.id,
          documentType: getReceiptDocumentType(receipt.documentType),
          invoiceNumber: receipt.invoiceNumber,
          cufe: receipt.cufe,
          taxId: receipt.taxId,
          businessName: receipt.businessName || 'Sin razón social',
          amount: asNumber(receipt.amount),
          date: receipt.date,
        };

        index.set(identity, [...(index.get(identity) || []), usage]);
      });
    });

    return index;
  }, [advances]);

  const findDuplicateReceiptUsage = useCallback(
    (receiptLike: Partial<ReceiptIdentityInput>, currentAdvanceId: string) => {
      const identity = getReceiptIdentity(receiptLike);
      if (!identity) return null;
      return (receiptUsageIndex.get(identity) || []).find((usage) => usage.advanceId !== currentAdvanceId) || null;
    },
    [receiptUsageIndex]
  );

  const receiptGroups = useMemo(
    () =>
      filteredAdvances
        .filter((advance) => (advance.receipts || []).length > 0)
        .map((advance) => {
          const advanceReceipts = advance.receipts || [];
          const legalized = advanceReceipts
            .filter(isApprovedReceipt)
            .reduce((sum, receipt) => sum + asNumber(receipt.amount), 0);
          const pending = advanceReceipts
            .filter((receipt) => receipt.status === 'submitted')
            .reduce((sum, receipt) => sum + asNumber(receipt.amount), 0);
          const returned = advanceReceipts
            .filter((receipt) => receipt.status === 'returned')
            .reduce((sum, receipt) => sum + asNumber(receipt.amount), 0);
          const pendingCount = advanceReceipts.filter((receipt) => receipt.status === 'submitted').length;
          const returnedCount = advanceReceipts.filter((receipt) => receipt.status === 'returned').length;
          const duplicateCount = advanceReceipts.filter((receipt) => findDuplicateReceiptUsage(receipt, advance.id)).length;
          const approved = asNumber(advance.amountApproved || advance.amountRequested);
          const justified = getAdvanceJustifiedAmount(advance);
          const coverage = getAdvanceFinancialCoverage({ ...advance, amountApproved: approved, amountLegalized: legalized });
          const difference = coverage.balance;

          return {
            advance,
            receipts: advanceReceipts,
            approved,
            justified,
            legalized,
            returnedCash: coverage.returnedCash,
            pending,
            returned,
            pendingCount,
            returnedCount,
            duplicateCount,
            difference,
            coverage,
            progress: approved > 0 ? Math.min(100, Math.round((justified / approved) * 100)) : 0,
          };
        }),
    [filteredAdvances, findDuplicateReceiptUsage]
  );

  const reconciliationAdvances = useMemo(
    () =>
      filteredAdvances
        .filter((advance) => advance.status === 'completed' || advance.status === 'closed' || Boolean(advance.reconciliationStatus))
        .map((advance) => ({ advance, ...getAdvanceReconciliation(advance) }))
        .sort((left, right) => {
          const leftDate = getDateValue(left.advance.completedAt || left.advance.updatedAt)?.getTime() || 0;
          const rightDate = getDateValue(right.advance.completedAt || right.advance.updatedAt)?.getTime() || 0;
          return rightDate - leftDate;
        }),
    [filteredAdvances]
  );

  const visibleReconciliationAdvances = useMemo(
    () =>
      reconciliationAdvances.filter(
        (item) => showReconciledAdvances || !isAdvanceReconciled(item.advance)
      ),
    [reconciliationAdvances, showReconciledAdvances]
  );

  const realCostAdvanceGroups = useMemo(
    () =>
      filteredAdvances
        .filter((advance) => advance.status === 'closed' && advance.reconciliationStatus === 'reconciled')
        .map((advance) => {
          const approvedReceipts = (advance.receipts || []).filter(isApprovedReceipt);
          const legalizationsTotal = approvedReceipts.reduce((sum, receipt) => sum + asNumber(receipt.amount), 0);
          const advancePayments = payments.filter(
            (payment) =>
              payment.source === 'advance_receipt' &&
              payment.status !== 'cancelled' &&
              payment.advanceId === advance.id
          );
          const paymentTotal = advancePayments.reduce((sum, payment) => sum + asNumber(payment.amount), 0);
          const realCost = paymentTotal > 0 ? paymentTotal : legalizationsTotal;
          const coverage = getAdvanceFinancialCoverage({ ...advance, amountLegalized: legalizationsTotal });

          return {
            advance,
            receipts: approvedReceipts,
            payments: advancePayments,
            legalizationsTotal,
            paymentTotal,
            realCost,
            coverage,
            costCenters: normalizeCostCenters(advance.costCenters, coverage.approved),
          };
        })
        .sort((left, right) => {
          const leftDate = getDateValue(left.advance.closedAt || left.advance.updatedAt || left.advance.createdAt)?.getTime() || 0;
          const rightDate = getDateValue(right.advance.closedAt || right.advance.updatedAt || right.advance.createdAt)?.getTime() || 0;
          return rightDate - leftDate;
        }),
    [filteredAdvances, payments]
  );

  const downloadAdvanceDossier = useCallback(
    async ({
      advance,
      reportReceipts,
      title,
      filePrefix,
      scope,
      realCost,
    }: {
      advance: TravelAdvance;
      reportReceipts: AdvanceReceipt[];
      title: string;
      filePrefix: string;
      scope: AdvanceReportScope;
      realCost?: number;
    }) => {
      const toastId = toast.loading('Preparando el expediente y anexando los soportes...');
      try {
        const includePayment = ['payment', 'justifications', 'reconciliation', 'full'].includes(scope);
        const includeLegalizations = ['justifications', 'reconciliation', 'full'].includes(scope);
        const includeReconciliation = scope === 'reconciliation' || scope === 'full';
        const unavailableAttachments: string[] = [];
        const resolveProtectedAsset = async (path?: string, fallback?: string) => {
          if (!path) return fallback || '';
          try {
            return await getAuthorizedDownloadURL(ref(storage, path));
          } catch {
            return fallback || '';
          }
        };
        const resolveProtectedAttachment = async (
          path: string | undefined,
          fallback: string | undefined,
          label: string
        ) => {
          const recoverablePath = path || getStoragePathFromDownloadUrl(fallback);
          if (!recoverablePath && !fallback) return null;

          try {
            if (recoverablePath) {
              return {
                blob: await getAuthorizedDownloadBlob(ref(storage, recoverablePath)),
              };
            }
            return { url: fallback || '' };
          } catch (error: any) {
            unavailableAttachments.push(label);
            console.warn(
              `Se omitirá ${label} del expediente porque no pudo descargarse:`,
              error
            );
            return null;
          }
        };
        const [
          requesterSignatureUrl,
          approvalSignatureUrl,
          paymentSupportAsset,
          returnSupportAsset,
          compensationSupportAsset,
          receiptSupportAssets,
        ] = await Promise.all([
          resolveProtectedAsset(
            advance.requesterSignature?.signatureStoragePath,
            advance.requesterSignature?.signatureUrl
          ),
          resolveProtectedAsset(
            advance.approvalSignature?.signatureStoragePath,
            advance.approvalSignature?.signatureUrl
          ),
          includePayment
            ? resolveProtectedAttachment(
                advance.paymentSupport?.storagePath,
                advance.paymentSupport?.fileUrl,
                'el soporte del pago del anticipo'
              )
            : Promise.resolve(null),
          includeReconciliation
            ? resolveProtectedAttachment(
                advance.returnSupport?.storagePath,
                advance.returnSupport?.fileUrl,
                'el soporte de devolución'
              )
            : Promise.resolve(null),
          includeReconciliation
            ? resolveProtectedAttachment(
                advance.compensationSupport?.storagePath,
                advance.compensationSupport?.fileUrl,
                'el soporte de compensación'
              )
            : Promise.resolve(null),
          includeLegalizations
            ? Promise.all(
                reportReceipts.map((receipt) =>
                  resolveProtectedAttachment(
                    receipt.storagePath,
                    receipt.fileUrl,
                    `el soporte de la legalización ${receipt.categoryName}`
                  )
                )
              )
            : Promise.resolve([]),
        ]);

        const coverage = getAdvanceFinancialCoverage(advance);
        const reconciliation = getAdvanceReconciliation(advance);
        const costCenters = normalizeCostCenters(
          advance.costCenters,
          asNumber(advance.amountApproved || advance.amountRequested)
        );
        const report: AdvanceDossierReport = {
          title,
          advanceId: advance.customId || 'Sin ID contable',
          projectName: project?.name || project?.title || projectId,
          status: (statusConfig[advance.status] || statusConfig.submitted).label,
          generatedAt: formatDate(new Date()),
          sections: {
            payment: includePayment,
            legalizations: includeLegalizations,
            reconciliation: includeReconciliation,
          },
          metrics:
            scope === 'advance'
              ? [
                  { label: 'Solicitado', value: formatMoney(advance.amountRequested) },
                  { label: 'Aprobado', value: formatMoney(coverage.approved) },
                  { label: 'Ítems', value: String(advance.items?.length || 0) },
                ]
              : scope === 'payment'
              ? [
                  { label: 'Solicitado', value: formatMoney(advance.amountRequested) },
                  { label: 'Aprobado', value: formatMoney(coverage.approved) },
                  { label: 'Pagado', value: formatMoney(advance.paymentSupport?.amount) },
                ]
              : scope === 'justifications'
                ? [
                    { label: 'Anticipado', value: formatMoney(coverage.approved) },
                    { label: 'Justificado', value: formatMoney(getAdvanceJustifiedAmount(advance)) },
                    { label: 'Legalizado', value: formatMoney(coverage.legalized) },
                    { label: 'Saldo', value: formatMoney(Math.max(0, coverage.balance)) },
                  ]
                : [
                    { label: 'Anticipado', value: formatMoney(coverage.approved) },
                    { label: 'Justificado', value: formatMoney(getAdvanceJustifiedAmount(advance)) },
                    { label: 'Legalizado', value: formatMoney(coverage.legalized) },
                    { label: 'Devuelto', value: formatMoney(coverage.returnedCash) },
                    { label: 'Compensado', value: formatMoney(advance.amountCompensated) },
                    ...(realCost === undefined
                      ? [{ label: 'Saldo', value: formatMoney(Math.max(0, coverage.balance)) }]
                      : [{ label: 'Costo real', value: formatMoney(realCost) }]),
                  ],
          advanceDetails: [
            { label: 'Solicitante', value: advance.requesterName },
            { label: 'Correo', value: advance.requesterEmail || 'Sin correo' },
            { label: 'Destino', value: advance.destination },
            {
              label: 'Periodo',
              value: `${formatDate(advance.travelStart)} - ${formatDate(advance.travelEnd)}`,
            },
            { label: 'Justificación', value: advance.purpose || 'Sin justificación' },
            {
              label: 'Tareas',
              value:
                (advance.taskTitles || []).join(', ') ||
                advance.taskTitle ||
                'Sin tareas vinculadas',
            },
            {
              label: 'Observación administrativa',
              value: advance.adminComment || 'Sin observaciones',
            },
            {
              label: 'Observación de devolución',
              value: advance.returnComment || 'No aplica',
            },
          ],
          items: (advance.items || []).map((item, index) => [
            String(index + 1),
            item.categoryName,
            String(item.days),
            formatMoney(item.unitAmount),
            item.note || '-',
            formatMoney(item.amount),
          ]),
          costCenters: costCenters.map((center) => [
            center.name,
            `${center.percentage}%`,
            formatMoney(center.amount),
            center.note || '-',
          ]),
          signatures: [
            {
              role: 'Firma solicitante',
              name: advance.requesterSignature?.name || 'Pendiente',
              jobTitle: advance.requesterSignature?.jobTitle,
              email: advance.requesterSignature?.email,
              signedAt: advance.requesterSignature?.signedAt,
              imageUrl: requesterSignatureUrl,
            },
            {
              role: 'Firma aprobador',
              name: advance.approvalSignature?.name || 'Pendiente',
              jobTitle: advance.approvalSignature?.jobTitle,
              email: advance.approvalSignature?.email,
              signedAt: advance.approvalSignature?.signedAt,
              imageUrl: approvalSignatureUrl,
            },
          ],
          paymentDetails: includePayment && advance.paymentSupport
            ? [
                { label: 'Valor pagado', value: formatMoney(advance.paymentSupport.amount) },
                { label: 'Fecha', value: formatDate(advance.paymentSupport.date) },
                {
                  label: 'Referencia bancaria',
                  value: advance.paymentSupport.reference || 'Sin referencia',
                },
                {
                  label: 'Registrado por',
                  value: advance.paymentSupport.paidByName || 'Sin responsable',
                },
              ]
            : [],
          legalizations: includeLegalizations ? reportReceipts.map((receipt, index) => [
            String(index + 1),
            `${receipt.categoryName}\n${getReceiptDocumentTypeMeta(receipt.documentType).label}`,
            receipt.businessName || 'Sin razón social',
            formatDate(receipt.date),
            receipt.invoiceNumber || receipt.cufe || 'Sin número',
            formatMoney(receipt.amount),
            `${getReceiptStatusMeta(receipt.status).label}${receipt.storagePath || receipt.fileUrl ? '' : ' - Sin archivo adjunto'}`,
          ]) : [],
          reconciliationDetails: includeReconciliation ? [
            {
              label: 'Estado',
              value: advance.reconciliationStatus === 'reconciled' ? 'Conciliado' : 'Pendiente',
            },
            {
              label: 'Fecha de cierre',
              value: formatDate(advance.reconciledAt || advance.closedAt),
            },
            { label: 'Anticipado', value: formatMoney(reconciliation.anticipated) },
            { label: 'Legalizado', value: formatMoney(reconciliation.legalized) },
            {
              label: 'Por devolver / consignar',
              value: formatMoney(reconciliation.returnRequired),
            },
            {
              label: 'Por compensar',
              value: formatMoney(reconciliation.compensationRequired),
            },
            {
              label: 'Conciliado por',
              value: advance.reconciledByName || 'Pendiente',
            },
          ] : [],
          paymentAttachment:
            includePayment && advance.paymentSupport && paymentSupportAsset
              ? {
                  label: 'Soporte del pago del anticipo',
                  description: `Pago de ${formatMoney(advance.paymentSupport.amount)} - ${formatDate(advance.paymentSupport.date)}${advance.paymentSupport.reference ? ` - Referencia ${advance.paymentSupport.reference}` : ''}`,
                  fileName: advance.paymentSupport.fileName || 'soporte-pago',
                  ...paymentSupportAsset,
                }
              : undefined,
          legalizationAttachments: includeLegalizations
            ? reportReceipts.flatMap((receipt, index) => {
                const asset = receiptSupportAssets[index];
                return asset
                  ? [{
                      label: `Soporte de legalización ${index + 1}`,
                      description: `${receipt.categoryName} - ${receipt.businessName || 'Sin razón social'} - ${receipt.invoiceNumber || receipt.cufe || 'Sin número'} - ${formatMoney(receipt.amount)}`,
                      fileName: receipt.fileName || `soporte-legalizacion-${index + 1}`,
                      ...asset,
                    }]
                  : [];
              })
            : [],
          reconciliationAttachments: includeReconciliation ? [
            ...(advance.returnSupport && returnSupportAsset
              ? [
                  {
                    label: 'Soporte de conciliación - devolución / consignación bancaria',
                    description: `Consignación por ${formatMoney(advance.returnSupport.amount)} - ${formatDate(advance.returnSupport.date)}${advance.returnSupport.reference ? ` - Referencia ${advance.returnSupport.reference}` : ''}`,
                    fileName: advance.returnSupport.fileName || 'soporte-devolucion',
                    ...returnSupportAsset,
                  },
                ]
              : []),
            ...(advance.compensationSupport && compensationSupportAsset
              ? [
                  {
                    label: 'Soporte de conciliación - compensación',
                    description: `Compensación por ${formatMoney(advance.compensationSupport.amount)} - ${formatDate(advance.compensationSupport.date)}${advance.compensationSupport.reference ? ` - Referencia ${advance.compensationSupport.reference}` : ''}`,
                    fileName: advance.compensationSupport.fileName || 'soporte-compensacion',
                    ...compensationSupportAsset,
                  },
                ]
              : []),
          ] : [],
        };

        const {
          bytes: pdfBytes,
          omittedAttachments: invalidAttachments,
        } = await generateAdvanceDossierPdf(report);
        const omittedAttachments = Array.from(
          new Set([...unavailableAttachments, ...invalidAttachments])
        );
        const pdfArrayBuffer = pdfBytes.buffer.slice(
          pdfBytes.byteOffset,
          pdfBytes.byteOffset + pdfBytes.byteLength
        ) as ArrayBuffer;
        downloadBlob(
          `${filePrefix}-${getSafeFileToken(advance.customId || advance.id)}.pdf`,
          new Blob([pdfArrayBuffer], { type: 'application/pdf' })
        );
        toast.success(
          omittedAttachments.length > 0
            ? `Reporte PDF generado. Se omitieron ${omittedAttachments.length} archivo${omittedAttachments.length === 1 ? '' : 's'} no disponible${omittedAttachments.length === 1 ? '' : 's'} o dañado${omittedAttachments.length === 1 ? '' : 's'}.`
            : 'Reporte PDF generado con los documentos seleccionados.',
          { id: toastId }
        );
      } catch (error: any) {
        console.error('Error generating advance dossier PDF:', error);
        toast.error(error?.message || 'No se pudo generar el expediente PDF.', { id: toastId });
      }
    },
    [project?.name, project?.title, projectId]
  );

  const downloadAdvanceReportOption = useCallback(
    async (
      advance: TravelAdvance,
      scope: AdvanceReportScope,
      realCost?: number
    ) => {
      if (!getAdvanceReportAvailability(advance)[scope]) {
        toast.error('Este informe se habilitará cuando el anticipo complete la etapa correspondiente.');
        return;
      }

      const onlyApprovedReceipts = scope === 'reconciliation' || scope === 'full';
      const reportReceipts =
        scope === 'advance' || scope === 'payment'
          ? []
          : (advance.receipts || []).filter((receipt) =>
              onlyApprovedReceipts ? isApprovedReceipt(receipt) : receipt.status !== 'rejected'
            );
      const reportMeta = {
        advance: {
          title: 'Informe del anticipo',
          filePrefix: 'anticipo',
        },
        payment: {
          title: 'Anticipo y soporte de pago',
          filePrefix: 'anticipo-con-pago',
        },
        justifications: {
          title: 'Anticipo, pago y legalizaciones',
          filePrefix: 'anticipo-con-legalizaciones',
        },
        reconciliation: {
          title: 'Anticipo y conciliación',
          filePrefix: 'anticipo-con-conciliacion',
        },
        full: {
          title: 'Informe final del anticipo',
          filePrefix: 'informe-final-anticipo',
        },
      }[scope];

      await downloadAdvanceDossier({
        advance,
        reportReceipts,
        title: reportMeta.title,
        filePrefix: reportMeta.filePrefix,
        scope,
        realCost,
      });
    },
    [downloadAdvanceDossier]
  );

  const currentActorIds = useMemo(() => {
    const ids = new Set<string>();
    if (currentUser?.uid) ids.add(String(currentUser.uid));
    const currentEmail = String(currentUser?.email || '').toLowerCase();
    teamMembers.forEach((member) => {
      const memberEmail = String(member?.email || '').toLowerCase();
      if (
        member?.id === currentUser?.uid ||
        member?.authUserId === currentUser?.uid ||
        (currentEmail && memberEmail === currentEmail)
      ) {
        if (member?.id) ids.add(String(member.id));
        if (member?.authUserId) ids.add(String(member.authUserId));
      }
    });
    return ids;
  }, [currentUser?.email, currentUser?.uid, teamMembers]);

  const currentSignerMember = useMemo(() => {
    const currentEmail = String(currentUser?.email || '').trim().toLowerCase();
    return teamMembers.find((member) => {
      const memberEmail = String(member?.email || '').trim().toLowerCase();
      return (
        member?.id === currentUser?.uid ||
        member?.authUserId === currentUser?.uid ||
        Boolean(currentEmail && memberEmail === currentEmail)
      );
    }) || null;
  }, [currentUser?.email, currentUser?.uid, teamMembers]);

  const buildCurrentSignatureSnapshot = useCallback((): AdvanceSignatureSnapshot | null => {
    if (!currentUser?.uid || !currentSignerMember?.signatureUrl) return null;
    return {
      signatureUrl: currentSignerMember.signatureUrl,
      signatureStoragePath: currentSignerMember.signatureStoragePath || undefined,
      signerUserId: String(currentUser.uid),
      signerMemberId: currentSignerMember.id ? String(currentSignerMember.id) : undefined,
      name: getMemberLabel(currentSignerMember) || getCurrentUserName(currentUser),
      email: String(currentSignerMember.email || currentUser.email || ''),
      jobTitle: String(
        currentSignerMember.roleName ||
        currentSignerMember.position ||
        currentSignerMember.jobTitle ||
        currentSignerMember.profileRole ||
        currentSignerMember.systemRole ||
        'Sin cargo configurado'
      ),
      signedAt: new Date().toISOString(),
    };
  }, [currentSignerMember, currentUser]);

  const requesterMatchesCurrentActor = useCallback(
    (requesterId: string, requesterEmail?: string) => {
      const emailMatches =
        requesterEmail &&
        currentUser?.email &&
        String(requesterEmail).trim().toLowerCase() === String(currentUser.email).trim().toLowerCase();
      return currentActorIds.has(String(requesterId)) || Boolean(emailMatches);
    },
    [currentActorIds, currentUser?.email]
  );

  const canCorrectAdvanceReceipt = useCallback(
    (advance: TravelAdvance) => {
      const emailMatches =
        advance.requesterEmail &&
        currentUser?.email &&
        String(advance.requesterEmail).toLowerCase() === String(currentUser.email).toLowerCase();
      return canValidate || currentActorIds.has(String(advance.requesterId)) || Boolean(emailMatches);
    },
    [canValidate, currentActorIds, currentUser?.email]
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
    setAdvanceTaskSearch('');
    setAdvanceTaskStatusFilter('active');
    setAdvanceTaskGroupFilter('all');
    void loadLocationOptions();
    setIsAdvanceModalOpen(true);
  };

  const toggleAdvanceTask = (taskId: string) => {
    setAdvanceForm((current) => ({
      ...current,
      taskIds: current.taskIds.includes(taskId)
        ? current.taskIds.filter((id) => id !== taskId)
        : [...current.taskIds, taskId],
    }));
  };

  const selectVisibleAdvanceTasks = () => {
    const visibleIds = filteredAdvanceTasks.map((task) => task.id).filter(Boolean);
    setAdvanceForm((current) => ({
      ...current,
      taskIds: Array.from(new Set([...current.taskIds, ...visibleIds])),
    }));
  };

  const openAdvanceEditor = (advance: TravelAdvance) => {
    const coverage = getAdvanceFinancialCoverage(advance);
    setEditingAdvance(advance);
    setAdvanceEditForm({
      customId: advance.customId || '',
      department: advance.department || '',
      municipality: advance.municipality || '',
      purpose: advance.purpose || '',
      travelStart: advance.travelStart || todayInputValue(),
      travelEnd: advance.travelEnd || todayInputValue(),
      amountReturned: advance.amountReturned ? String(advance.amountReturned) : '',
      returnComment: advance.returnComment || '',
      costCenters: normalizeCostCenters(advance.costCenters, coverage.approved || asNumber(advance.amountRequested)),
      items: (advance.items || []).map((item) => ({ ...item })),
    });
    void loadLocationOptions();
  };

  const editingAdvanceApprovedAmount = useMemo(
    () => editingAdvance
      ? editingAdvance.status === 'returned'
        ? advanceEditForm.items.reduce((sum, item) => sum + asNumber(item.amount), 0)
        : getAdvanceFinancialCoverage(editingAdvance).approved
      : 0,
    [advanceEditForm.items, editingAdvance]
  );

  const editingAdvanceCoverage = useMemo(
    () =>
      editingAdvance
        ? getAdvanceFinancialCoverage({
            ...editingAdvance,
            amountReturned: asNumber(advanceEditForm.amountReturned),
          })
        : null,
    [advanceEditForm.amountReturned, editingAdvance]
  );

  const editingCostCenterTotal = useMemo(
    () => getCostCenterPercentTotal(advanceEditForm.costCenters),
    [advanceEditForm.costCenters]
  );

  const updateAdvanceCostCenter = (id: string, updates: Partial<CostCenterAllocation>) => {
    setAdvanceEditForm((current) => ({
      ...current,
      costCenters: normalizeCostCenters(
        current.costCenters.map((center) => (center.id === id ? { ...center, ...updates } : center)),
        editingAdvanceApprovedAmount
      ),
    }));
  };

  const addAdvanceCostCenter = () => {
    const availableDomain = costCenterOptions.find(
      (domain) => !advanceEditForm.costCenters.some((center) => center.domainId === domain.id)
    );
    if (!availableDomain) {
      toast.error('No hay más centros de costos activos disponibles. Configura otro dominio para agregarlo.');
      return;
    }
    setAdvanceEditForm((current) => ({
      ...current,
      costCenters: normalizeCostCenters(
        [
          ...current.costCenters,
          {
            id: safeId(),
            domainId: availableDomain.id.startsWith('default-cost-center-') ? undefined : availableDomain.id,
            name: availableDomain.name,
            percentage: 0,
            amount: 0,
            note: '',
          },
        ],
        editingAdvanceApprovedAmount
      ),
    }));
  };

  const removeAdvanceCostCenter = (id: string) => {
    if (advanceEditForm.costCenters.length <= 1) {
      toast.error('El anticipo debe conservar al menos un centro de costos.');
      return;
    }
    setAdvanceEditForm((current) => ({
      ...current,
      costCenters: normalizeCostCenters(
        current.costCenters.filter((center) => center.id !== id),
        editingAdvanceApprovedAmount
      ),
    }));
  };

  const updateAdvanceEditItem = (id: string, updates: Partial<AdvanceItem>) => {
    setAdvanceEditForm((current) => {
      const items = current.items.map((item) => {
        if (item.id !== id) return item;
        const next = { ...item, ...updates };
        return { ...next, amount: roundCurrency(asNumber(next.days) * asNumber(next.unitAmount)) };
      });
      const requestedAmount = items.reduce((sum, item) => sum + asNumber(item.amount), 0);
      return { ...current, items, costCenters: normalizeCostCenters(current.costCenters, requestedAmount) };
    });
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

  const openReceiptEditor = (mode: ReceiptEditorMode, advance: TravelAdvance, receipt: AdvanceReceipt) => {
    setReceiptEditor({ mode, advance, receipt });
    setReceiptEditorForm(buildReceiptEditorForm(receipt));
    setReceiptCorrectionFile(null);
    setReceiptReplacementFile(null);
    setReceiptSupportAction(null);
  };

  const updateReceiptEditorForm = (patch: Partial<ReceiptEditorForm>) => {
    setReceiptEditorForm((current) => current ? { ...current, ...patch } : current);
  };

  const closeReceiptEditor = () => {
    setReceiptEditor(null);
    setReceiptEditorForm(null);
    setReceiptCorrectionFile(null);
    setReceiptReplacementFile(null);
    setReceiptSupportAction(null);
  };

  const getReceiptEditorChanges = (
    receipt: AdvanceReceipt,
    form: ReceiptEditorForm
  ): ReceiptFieldChange[] => {
    const original = buildReceiptEditorForm(receipt);
    const changes: ReceiptFieldChange[] = [];

    RECEIPT_EDITABLE_FIELDS.forEach(({ key, label }) => {
      const normalizeValue = (value: any) => {
        if (key === 'amount') return asNumber(value);
        if (key === 'cufe') return normalizeCufe(String(value || ''));
        return String(value || '').trim();
      };
      const previousValue = normalizeValue(original[key]);
      const nextValue = normalizeValue(form[key]);
      if (previousValue === nextValue) return;

      if (key === 'categoryId') {
        changes.push({
          field: key,
          label,
          previousValue: categoryOptions.find((category) => category.id === previousValue)?.name || previousValue,
          nextValue: categoryOptions.find((category) => category.id === nextValue)?.name || nextValue,
        });
        return;
      }

      changes.push({ field: key, label, previousValue, nextValue });
    });

    return changes;
  };

  const openDianLookup = () => {
    if (!receiptEditorForm) return;
    const cufe = normalizeCufe(receiptEditorForm.cufe);
    if (!cufe) {
      toast.error('Ingresa el CUFE antes de consultar la DIAN.');
      return;
    }
    const dianDocumentUrl = buildDianDocumentUrl(cufe);
    window.open(dianDocumentUrl, '_blank', 'noopener,noreferrer');
    setReceiptEditorForm((current) => current ? {
      ...current,
      cufe,
      dianVerificationStatus: 'pending',
      dianLookupOpenedAt: new Date().toISOString(),
      dianDocumentUrl,
    } : current);
  };

  const confirmDianLookup = () => {
    if (!receiptEditorForm?.dianLookupOpenedAt) {
      toast.error('Primero consulta el CUFE en el portal oficial de la DIAN.');
      return;
    }
    setReceiptEditorForm((current) => current ? {
      ...current,
      dianVerificationStatus: 'confirmed',
      dianVerifiedAt: new Date().toISOString(),
    } : current);
    toast.success('Consulta CUFE confirmada y vinculada a la trazabilidad.');
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

    const customId = advanceForm.customId.trim();
    if (
      customId &&
      advances.some((advance) => String(advance.customId || '').trim().toLowerCase() === customId.toLowerCase())
    ) {
      toast.error('Ya existe un anticipo con ese ID en este proyecto.');
      return;
    }

    const requester = teamMembers.find((member) => member.id === advanceForm.requesterId);
    const requesterEmail = requester?.email || currentUser?.email || '';
    if (!requesterMatchesCurrentActor(advanceForm.requesterId, requesterEmail)) {
      toast.error('El solicitante debe coincidir con la persona que inició sesión y firma el anticipo.');
      return;
    }
    const requesterSignature = buildCurrentSignatureSnapshot();
    if (!requesterSignature) {
      toast.error('Antes de solicitar el anticipo debes cargar tu firma en Mi perfil.');
      return;
    }
    const selectedCostCenter = costCenterOptions.find((center) => center.id === advanceForm.costCenterId);
    if (!selectedCostCenter) {
      toast.error('Selecciona un centro de costos para el anticipo.');
      return;
    }
    const selectedTaskIds = Array.from(new Set(advanceForm.taskIds.filter(Boolean)));
    const selectedTasks = tasks.filter((task) => selectedTaskIds.includes(task.id));
    const amountRequested = advanceForm.items.reduce((sum, item) => sum + asNumber(item.amount), 0);
    const selectedCostCenterId = selectedCostCenter.id.startsWith('default-cost-center-')
      ? null
      : selectedCostCenter.id;
    const selectedCostCenterAllocation: CostCenterAllocation = {
      ...buildDefaultCostCenter(amountRequested, {
        id: selectedCostCenter.id,
        name: selectedCostCenter.name,
      }),
      domainId: selectedCostCenterId || undefined,
    };

    setSubmitting(true);
    try {
      const docRef = await addDoc(collection(db, 'projects', projectId, 'advanceRequests'), {
        projectId,
        customId: customId || null,
        customIdNormalized: customId ? customId.toLowerCase() : null,
        requesterId: advanceForm.requesterId,
        requesterName: requester ? getMemberLabel(requester) : getCurrentUserName(currentUser),
        requesterEmail,
        requesterSignature,
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
        amountReturned: 0,
        returnComment: '',
        costCenterId: selectedCostCenterId,
        costCenterName: selectedCostCenter.name,
        costCenters: normalizeCostCenters([selectedCostCenterAllocation], amountRequested),
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
      toast.success('Anticipo firmado y enviado al área administrativa.');
      setIsAdvanceModalOpen(false);
    } catch (error: any) {
      console.error('Error creating advance:', error);
      toast.error(error?.message || 'No se pudo crear el anticipo.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdateAdvanceFromLegalizations = async () => {
    if (!editingAdvance) return;
    const isReturnedCorrection = editingAdvance.status === 'returned';
    if (!canManage && !canValidate && !isReturnedCorrection) {
      toast.error('No tienes permisos para editar anticipos.');
      return;
    }
    let correctedRequesterSignature: AdvanceSignatureSnapshot | null = null;
    if (isReturnedCorrection) {
      if (!requesterMatchesCurrentActor(editingAdvance.requesterId, editingAdvance.requesterEmail)) {
        toast.error('Solo el solicitante original puede corregir, firmar y reenviar este anticipo.');
        return;
      }
      correctedRequesterSignature = buildCurrentSignatureSnapshot();
      if (!correctedRequesterSignature) {
        toast.error('Carga tu firma en Mi perfil antes de reenviar la corrección.');
        return;
      }
      if (advanceEditForm.items.length === 0 || advanceEditForm.items.some((item) => asNumber(item.days) <= 0 || asNumber(item.unitAmount) < 0)) {
        toast.error('Revisa los días, unidades y valores de los ítems del anticipo.');
        return;
      }
    }

    const customId = advanceEditForm.customId.trim();
    if (
      customId &&
      advances.some(
        (advance) =>
          advance.id !== editingAdvance.id &&
          String(advance.customId || '').trim().toLowerCase() === customId.toLowerCase()
      )
    ) {
      toast.error('Ya existe otro anticipo con ese ID contable en este proyecto.');
      return;
    }
    if (!advanceEditForm.department || !advanceEditForm.municipality || !advanceEditForm.purpose.trim()) {
      toast.error('Completa departamento, municipio y justificación.');
      return;
    }
    if (
      advanceEditForm.travelStart &&
      advanceEditForm.travelEnd &&
      new Date(`${advanceEditForm.travelEnd}T00:00:00`) < new Date(`${advanceEditForm.travelStart}T00:00:00`)
    ) {
      toast.error('La fecha final no puede ser anterior a la fecha inicial.');
      return;
    }

    const amountReturned = roundCurrency(advanceEditForm.amountReturned);
    const correctedRequestedAmount = roundCurrency(
      advanceEditForm.items.reduce((sum, item) => sum + asNumber(item.amount), 0)
    );
    const approvedAmount = isReturnedCorrection
      ? correctedRequestedAmount
      : asNumber(editingAdvance.amountApproved || editingAdvance.amountRequested);
    const legalizedAmount = asNumber(editingAdvance.amountLegalized);
    const maxReturnable = Math.max(0, approvedAmount - legalizedAmount);
    if (amountReturned < 0) {
      toast.error('El valor devuelto no puede ser negativo.');
      return;
    }
    if (amountReturned > maxReturnable + 0.01) {
      toast.error(`La devolución no puede superar el saldo pendiente: ${formatMoney(maxReturnable)}.`);
      return;
    }
    const costCenters = normalizeCostCenters(advanceEditForm.costCenters, approvedAmount || asNumber(editingAdvance.amountRequested));
    if (!costCentersAreBalanced(costCenters)) {
      toast.error(`Los centros de costo deben sumar 100%. Ahora suman ${editingCostCenterTotal}%.`);
      return;
    }
    const coverage = getAdvanceFinancialCoverage({
      ...editingAdvance,
      amountApproved: approvedAmount,
      amountLegalized: legalizedAmount,
      amountReturned,
    });
    const destination = [advanceEditForm.municipality, advanceEditForm.department].filter(Boolean).join(', ');
    setSubmitting(true);
    try {
      const updatePayload: any = {
        customId: customId || null,
        customIdNormalized: customId ? customId.toLowerCase() : null,
        destination,
        department: advanceEditForm.department || null,
        municipality: advanceEditForm.municipality || null,
        purpose: advanceEditForm.purpose.trim(),
        travelStart: advanceEditForm.travelStart,
        travelEnd: advanceEditForm.travelEnd,
        amountReturned,
        returnComment: advanceEditForm.returnComment.trim(),
        costCenterId: costCenters[0]?.domainId || null,
        costCenterName: costCenters[0]?.name || null,
        costCenters,
        balance: Math.max(0, coverage.balance),
        updatedAt: serverTimestamp(),
        administrativeEditedAt: serverTimestamp(),
        administrativeEditedBy: currentUser?.uid || null,
        administrativeEditedByName: getCurrentUserName(currentUser),
      };

      if (amountReturned !== asNumber(editingAdvance.amountReturned)) {
        updatePayload.returnedAt = amountReturned > 0 ? serverTimestamp() : null;
        updatePayload.returnedBy = amountReturned > 0 ? currentUser?.uid || null : null;
        updatePayload.returnedByName = amountReturned > 0 ? getCurrentUserName(currentUser) : '';
      }
      if (isReturnedCorrection) {
        updatePayload.status = 'submitted';
        updatePayload.items = advanceEditForm.items;
        updatePayload.amountRequested = correctedRequestedAmount;
        updatePayload.amountApproved = 0;
        updatePayload.amountLegalized = 0;
        updatePayload.amountReturned = 0;
        updatePayload.balance = correctedRequestedAmount;
        updatePayload.requesterSignature = correctedRequesterSignature;
        updatePayload.approvalSignature = null;
        updatePayload.paymentApprovedAt = null;
        updatePayload.paymentApprovedBy = null;
        updatePayload.paymentApprovedByName = '';
        updatePayload.nextAction = 'validate_advance';
        updatePayload.pendingRole = 'administrative_validation';
        updatePayload.inboxTargetUserId = null;
        updatePayload.submittedAt = serverTimestamp();
      }

      await updateDoc(doc(db, 'projects', projectId, 'advanceRequests', editingAdvance.id), updatePayload);

      await logAdministrativeEvent(editingAdvance.id, 'advance_administrative_updated', {
        customId: customId || null,
        destination,
        travelStart: advanceEditForm.travelStart,
        travelEnd: advanceEditForm.travelEnd,
        amountReturned,
        returnComment: advanceEditForm.returnComment.trim(),
        costCenters,
        balance: Math.max(0, coverage.balance),
        closed: false,
        resubmitted: isReturnedCorrection,
      });
      if (isReturnedCorrection) {
        await logAdministrativeEvent(editingAdvance.id, 'advance_resubmitted', {
          comment: advanceEditForm.returnComment.trim(),
        });
      }
      toast.success(
        isReturnedCorrection
          ? 'Anticipo corregido y reenviado para aprobación.'
          : 'Anticipo actualizado desde legalizaciones.'
      );
      setEditingAdvance(null);
    } catch (error: any) {
      console.error('Error updating advance from legalizations:', error);
      toast.error(error?.message || 'No se pudo actualizar el anticipo.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleApproveReceipt = async () => {
    if (!receiptEditor || !receiptEditorForm || receiptEditor.mode !== 'review') return;
    if (!canValidate) {
      toast.error('No tienes permisos para aprobar legalizaciones.');
      return;
    }

    const latestAdvance = advances.find((advance) => advance.id === receiptEditor.advance.id) || receiptEditor.advance;
    const latestReceipt = (latestAdvance.receipts || []).find((receipt) => receipt.id === receiptEditor.receipt.id) || receiptEditor.receipt;
    const category = categoryOptions.find((item) => item.id === receiptEditorForm.categoryId);
    const amount = asNumber(receiptEditorForm.amount);
    const documentType = getReceiptDocumentType(receiptEditorForm.documentType);
    const cufe = normalizeCufe(receiptEditorForm.cufe);

    if (!category || amount <= 0 || !receiptEditorForm.businessName.trim() || !receiptEditorForm.date) {
      toast.error('Completa tipo de gasto, valor, fecha y razón social.');
      return;
    }
    if (documentType === 'invoice' && category.requiresCufe && !cufe) {
      toast.error('Este tipo de gasto requiere CUFE para aprobar la factura.');
      return;
    }
    if (documentType === 'invoice' && cufe && receiptEditorForm.dianVerificationStatus !== 'confirmed') {
      toast.error('Consulta y confirma el CUFE en la DIAN antes de aprobar.');
      return;
    }
    const duplicateUsage = findDuplicateReceiptUsage(
      {
        documentType,
        cufe,
        invoiceNumber: receiptEditorForm.invoiceNumber,
        taxId: receiptEditorForm.taxId,
        businessName: receiptEditorForm.businessName,
        amount,
        date: receiptEditorForm.date,
      },
      latestAdvance.id
    );
    if (duplicateUsage) {
      toast.error(`Este soporte ya fue usado en "${duplicateUsage.advanceTitle}" por ${duplicateUsage.requesterName}.`);
      return;
    }

    setSubmitting(true);
    try {
      const changes = getReceiptEditorChanges(latestReceipt, receiptEditorForm);
      const status: 'approved' | 'approved_modified' = changes.length > 0 ? 'approved_modified' : 'approved';
      const now = new Date().toISOString();
      const documentMeta = getReceiptDocumentTypeMeta(documentType);
      const paymentData = {
        projectId,
        description: `Legalización anticipo: ${category.name}`,
        vendor: receiptEditorForm.businessName.trim() || 'Proveedor sin nombre',
        amount,
        date: new Date(`${receiptEditorForm.date || todayInputValue()}T00:00:00`),
        status: 'paid',
        budgetLineId: null,
        budgetPieceId: null,
        notes: [
          documentMeta.label,
          receiptEditorForm.invoiceNumber.trim() ? `${documentMeta.numberLabel}: ${receiptEditorForm.invoiceNumber.trim()}` : null,
          receiptEditorForm.description.trim(),
          cufe ? `CUFE: ${cufe}` : null,
          changes.length > 0 ? 'Aprobado con modificación administrativa' : null,
        ].filter(Boolean).join(' · '),
        source: 'advance_receipt',
        advanceId: latestAdvance.id,
        receiptId: latestReceipt.id,
        documentType,
        documentTypeLabel: documentMeta.label,
        expenseCategoryId: category.id,
        updatedAt: serverTimestamp(),
      };

      let billingPaymentId = latestReceipt.billingPaymentId || '';
      if (billingPaymentId) {
        await updateDoc(doc(db, 'projects', projectId, 'billingPayments', billingPaymentId), paymentData);
      } else {
        const paymentRef = await addDoc(collection(db, 'projects', projectId, 'billingPayments'), {
          ...paymentData,
          createdAt: serverTimestamp(),
          createdBy: currentUser?.uid || null,
        });
        billingPaymentId = paymentRef.id;
      }

      const approvedReceipt: AdvanceReceipt = {
        ...latestReceipt,
        documentType,
        categoryId: category.id,
        categoryName: category.name,
        amount,
        date: receiptEditorForm.date,
        businessName: receiptEditorForm.businessName.trim(),
        taxId: receiptEditorForm.taxId.trim(),
        invoiceNumber: receiptEditorForm.invoiceNumber.trim(),
        cufe,
        description: receiptEditorForm.description.trim(),
        status,
        reviewedAt: now,
        reviewedBy: currentUser?.uid || null,
        reviewedByName: getCurrentUserName(currentUser),
        reviewComment: reviewComment.trim(),
        approvalChanges: changes,
        dianVerificationStatus: documentType === 'cash_receipt' ? 'not_applicable' : receiptEditorForm.dianVerificationStatus,
        dianLookupOpenedAt: receiptEditorForm.dianLookupOpenedAt || '',
        dianVerifiedAt: receiptEditorForm.dianVerifiedAt || '',
        dianVerifiedBy: receiptEditorForm.dianVerifiedAt ? currentUser?.uid || null : null,
        dianVerifiedByName: receiptEditorForm.dianVerifiedAt ? getCurrentUserName(currentUser) : '',
        dianDocumentUrl: documentType === 'invoice' && cufe ? buildDianDocumentUrl(cufe) : '',
        billingPaymentId,
        revisions: [
          ...(latestReceipt.revisions || []),
          {
            type: status,
            actorId: currentUser?.uid || null,
            actorName: getCurrentUserName(currentUser),
            at: now,
            comment: reviewComment.trim(),
            changes,
          },
        ],
      };

      const nextReceipts = (latestAdvance.receipts || []).map((item) =>
        item.id === latestReceipt.id ? approvedReceipt : item
      );
      const amountLegalized = nextReceipts
        .filter(isApprovedReceipt)
        .reduce((sum, item) => sum + asNumber(item.amount), 0);
      const amountApproved = asNumber(latestAdvance.amountApproved || latestAdvance.amountRequested);
      const coverage = getAdvanceFinancialCoverage({
        ...latestAdvance,
        amountApproved,
        amountLegalized,
      });
      const difference = coverage.balance;
      const shouldStayCompleted = latestAdvance.status === 'completed';
      const nextAdvanceStatus: TravelAdvance['status'] = shouldStayCompleted ? 'completed' : 'approved';
      const allReceiptsReviewed = nextReceipts.every(isApprovedReceipt);
      const reconciliation = getAdvanceReconciliation({
        ...latestAdvance,
        receipts: nextReceipts,
        amountApproved,
        amountLegalized,
      });
      const reconciliationStatus: AdvanceReconciliationStatus | null = shouldStayCompleted
        ? allReceiptsReviewed
          ? reconciliation.returnRequired > 0
            ? latestAdvance.returnSupport
              ? 'ready'
              : 'pending_return'
            : reconciliation.compensationRequired > 0
              ? latestAdvance.compensationSupport
                ? 'ready'
                : 'pending_compensation'
              : 'ready'
          : 'pending_validation'
        : latestAdvance.reconciliationStatus || null;

      await updateDoc(doc(db, 'projects', projectId, 'advanceRequests', latestAdvance.id), {
        receipts: nextReceipts,
        amountLegalized,
        balance: difference,
        status: nextAdvanceStatus,
        reconciliationStatus,
        nextAction: shouldStayCompleted
          ? allReceiptsReviewed
            ? 'reconcile_advance'
            : 'validate_receipt'
          : 'justify_advance',
        pendingRole: shouldStayCompleted ? 'administrative_validation' : null,
        inboxTargetUserId: shouldStayCompleted ? null : latestAdvance.requesterId,
        closedAt: null,
        updatedAt: serverTimestamp(),
      });
      await logAdministrativeEvent(latestAdvance.id, status === 'approved_modified' ? 'receipt_approved_modified' : 'receipt_approved', {
        receiptId: latestReceipt.id,
        documentType,
        amount,
        billingPaymentId,
        comment: reviewComment.trim(),
        changes,
        cufeVerified: receiptEditorForm.dianVerificationStatus === 'confirmed',
        dianDocumentUrl: documentType === 'invoice' && cufe ? buildDianDocumentUrl(cufe) : null,
      });

      toast.success(status === 'approved_modified' ? 'Soporte aprobado con modificación y auditoría guardada.' : 'Soporte aprobado y costo real registrado.');
      setReviewComment('');
      closeReceiptEditor();
    } catch (error: any) {
      console.error('Error approving receipt:', error);
      toast.error(error?.message || 'No se pudo aprobar el soporte.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleResubmitReceipt = async () => {
    if (!receiptEditor || !receiptEditorForm || receiptEditor.mode !== 'correction') return;
    const latestAdvance = advances.find((advance) => advance.id === receiptEditor.advance.id) || receiptEditor.advance;
    const latestReceipt = (latestAdvance.receipts || []).find((receipt) => receipt.id === receiptEditor.receipt.id) || receiptEditor.receipt;
    if (!canCorrectAdvanceReceipt(latestAdvance)) {
      toast.error('Solo el solicitante o el área administrativa pueden subsanar este soporte.');
      return;
    }
    if (!receiptEditorForm.correctionNote.trim()) {
      toast.error('Describe qué corregiste antes de reenviar.');
      return;
    }

    const category = categoryOptions.find((item) => item.id === receiptEditorForm.categoryId);
    const amount = asNumber(receiptEditorForm.amount);
    const documentType = getReceiptDocumentType(receiptEditorForm.documentType);
    const cufe = normalizeCufe(receiptEditorForm.cufe);
    if (!category || amount <= 0 || !receiptEditorForm.businessName.trim() || !receiptEditorForm.date) {
      toast.error('Completa tipo de gasto, valor, fecha y razón social.');
      return;
    }
    if (documentType === 'invoice' && category.requiresCufe && !cufe) {
      toast.error('Este tipo de gasto requiere CUFE para reenviar la factura.');
      return;
    }
    const duplicateUsage = findDuplicateReceiptUsage(
      {
        documentType,
        cufe,
        invoiceNumber: receiptEditorForm.invoiceNumber,
        taxId: receiptEditorForm.taxId,
        businessName: receiptEditorForm.businessName,
        amount,
        date: receiptEditorForm.date,
      },
      latestAdvance.id
    );
    if (duplicateUsage) {
      toast.error(`Este soporte ya fue usado en "${duplicateUsage.advanceTitle}" por ${duplicateUsage.requesterName}.`);
      return;
    }

    setSubmitting(true);
    try {
      const changes = getReceiptEditorChanges(latestReceipt, receiptEditorForm);
      let replacementFile = {
        fileName: latestReceipt.fileName,
        fileSize: latestReceipt.fileSize,
        fileUrl: latestReceipt.fileUrl,
        storagePath: latestReceipt.storagePath,
        documentId: latestReceipt.documentId,
      };
      if (receiptCorrectionFile) {
        const uploaded = await uploadReceiptDocument(
          latestAdvance,
          category,
          receiptCorrectionFile,
          receiptEditorForm.businessName || category.name,
          documentType
        );
        replacementFile = {
          fileName: receiptCorrectionFile.name,
          fileSize: receiptCorrectionFile.size,
          fileUrl: uploaded.fileUrl,
          storagePath: uploaded.storagePath,
          documentId: uploaded.documentId,
        };
        changes.push({
          field: 'file',
          label: 'Archivo de soporte',
          previousValue: latestReceipt.fileName || null,
          nextValue: receiptCorrectionFile.name,
        });
      }

      const now = new Date().toISOString();
      const nextReceipt: AdvanceReceipt = {
        ...latestReceipt,
        ...replacementFile,
        documentType,
        categoryId: category.id,
        categoryName: category.name,
        amount,
        date: receiptEditorForm.date,
        businessName: receiptEditorForm.businessName.trim(),
        taxId: receiptEditorForm.taxId.trim(),
        invoiceNumber: receiptEditorForm.invoiceNumber.trim(),
        cufe,
        description: receiptEditorForm.description.trim(),
        status: 'submitted',
        correctionNote: receiptEditorForm.correctionNote.trim(),
        resubmittedAt: now,
        resubmittedBy: currentUser?.uid || null,
        resubmittedByName: getCurrentUserName(currentUser),
        revisionCount: asNumber(latestReceipt.revisionCount) + 1,
        dianVerificationStatus: documentType === 'cash_receipt' ? 'not_applicable' : cufe ? 'pending' : 'not_applicable',
        dianLookupOpenedAt: '',
        dianVerifiedAt: '',
        dianVerifiedBy: null,
        dianVerifiedByName: '',
        dianDocumentUrl: documentType === 'invoice' && cufe ? buildDianDocumentUrl(cufe) : '',
        revisions: [
          ...(latestReceipt.revisions || []),
          {
            type: 'resubmitted',
            actorId: currentUser?.uid || null,
            actorName: getCurrentUserName(currentUser),
            at: now,
            comment: receiptEditorForm.correctionNote.trim(),
            changes,
          },
        ],
      };
      const nextReceipts = (latestAdvance.receipts || []).map((item) =>
        item.id === latestReceipt.id ? nextReceipt : item
      );
      const amountLegalized = nextReceipts
        .filter(isApprovedReceipt)
        .reduce((sum, item) => sum + asNumber(item.amount), 0);
      const amountApproved = asNumber(latestAdvance.amountApproved || latestAdvance.amountRequested);
      const coverage = getAdvanceFinancialCoverage({
        ...latestAdvance,
        amountApproved,
        amountLegalized,
      });

      await updateDoc(doc(db, 'projects', projectId, 'advanceRequests', latestAdvance.id), {
        receipts: nextReceipts,
        amountLegalized,
        balance: Math.max(0, coverage.balance),
        status: latestAdvance.status === 'approved' ? 'approved' : 'paid',
        nextAction: 'validate_receipt',
        pendingRole: 'administrative_validation',
        inboxTargetUserId: null,
        completedAt: null,
        completedBy: null,
        completedByName: '',
        reconciliationStatus: null,
        updatedAt: serverTimestamp(),
      });
      await logAdministrativeEvent(latestAdvance.id, 'receipt_resubmitted', {
        receiptId: latestReceipt.id,
        amount,
        comment: receiptEditorForm.correctionNote.trim(),
        changes,
      });
      toast.success('Soporte subsanado y reenviado al área administrativa.');
      closeReceiptEditor();
    } catch (error: any) {
      console.error('Error resubmitting receipt:', error);
      toast.error(error?.message || 'No se pudo reenviar el soporte.');
    } finally {
      setSubmitting(false);
    }
  };

  const applyReviewAction = async () => {
    if (!reviewAction) return;
    const isDeleteAction = reviewAction.type === 'deleteAdvance';
    if (isDeleteAction ? !canManage : !canValidate) {
      toast.error(isDeleteAction ? 'Solo administradores o coordinadores pueden eliminar anticipos.' : 'No tienes permisos para validar este proceso.');
      return;
    }
    if ((reviewAction.type === 'returnReceipt' || reviewAction.type === 'returnAdvance') && !reviewComment.trim()) {
      toast.error('Explica qué debe corregirse antes de devolver el soporte.');
      return;
    }
    const approvalSignature = reviewAction.type === 'approveAdvance' ? buildCurrentSignatureSnapshot() : null;
    if (reviewAction.type === 'approveAdvance' && !reviewAction.advance.requesterSignature) {
      toast.error('El anticipo no tiene la firma verificable del solicitante. Devuélvelo para corrección.');
      return;
    }
    if (reviewAction.type === 'approveAdvance' && !approvalSignature) {
      toast.error('Antes de aprobar debes cargar tu firma en Mi perfil.');
      return;
    }

    setSubmitting(true);
    try {
      if (reviewAction.type === 'deleteAdvance') {
        const advance = reviewAction.advance;
        const [eventSnapshot, paymentSnapshot] = await Promise.all([
          getDocs(query(collection(db, 'projects', projectId, 'administrativeEvents'), where('advanceId', '==', advance.id))),
          getDocs(query(collection(db, 'projects', projectId, 'billingPayments'), where('advanceId', '==', advance.id))),
        ]);

        await Promise.all([
          ...eventSnapshot.docs.map((snapshot) =>
            deleteDoc(doc(db, 'projects', projectId, 'administrativeEvents', snapshot.id))
          ),
          ...paymentSnapshot.docs.map((snapshot) =>
            deleteDoc(doc(db, 'projects', projectId, 'billingPayments', snapshot.id))
          ),
        ]);
        await deleteDoc(doc(db, 'projects', projectId, 'advanceRequests', advance.id));
        if (selectedAdvance?.id === advance.id) {
          setSelectedAdvance(null);
        }
        toast.success('Anticipo eliminado junto con sus pagos y trazabilidad asociada.');
      }

      if (reviewAction.type === 'approveAdvance') {
        const approvedAmount = asNumber(reviewAction.advance.amountRequested);
        const coverage = getAdvanceFinancialCoverage({
          ...reviewAction.advance,
          amountApproved: approvedAmount,
        });
        await updateDoc(doc(db, 'projects', projectId, 'advanceRequests', reviewAction.advance.id), {
          status: 'pending_payment',
          amountApproved: approvedAmount,
          amountReturned: coverage.returnedCash,
          balance: Math.max(0, coverage.balance),
          costCenters: normalizeCostCenters(reviewAction.advance.costCenters, approvedAmount),
          adminComment: reviewComment.trim() || null,
          approvalSignature,
          paymentApprovedAt: serverTimestamp(),
          paymentApprovedBy: currentUser?.uid || null,
          paymentApprovedByName: getCurrentUserName(currentUser),
          nextAction: 'pay_advance',
          pendingRole: 'administrative_payment',
          inboxTargetUserId: null,
          approvedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        await logAdministrativeEvent(reviewAction.advance.id, 'advance_approved', {
          amount: approvedAmount,
          comment: reviewComment.trim(),
        });
        toast.success('Anticipo firmado y aprobado. Queda pendiente de registrar el pago.');
      }

      if (reviewAction.type === 'returnAdvance' || reviewAction.type === 'rejectAdvance') {
        const nextStatus = reviewAction.type === 'returnAdvance' ? 'returned' : 'rejected';
        await updateDoc(doc(db, 'projects', projectId, 'advanceRequests', reviewAction.advance.id), {
          status: nextStatus,
          adminComment: reviewComment.trim(),
          amountApproved: nextStatus === 'returned' ? 0 : reviewAction.advance.amountApproved,
          approvalSignature: nextStatus === 'returned' ? null : reviewAction.advance.approvalSignature || null,
          paymentApprovedAt: nextStatus === 'returned' ? null : reviewAction.advance.paymentApprovedAt || null,
          paymentApprovedBy: nextStatus === 'returned' ? null : reviewAction.advance.paymentApprovedBy || null,
          paymentApprovedByName: nextStatus === 'returned' ? '' : reviewAction.advance.paymentApprovedByName || '',
          nextAction: nextStatus === 'returned' ? 'correct_advance' : 'closed',
          pendingRole: null,
          inboxTargetUserId: reviewAction.advance.requesterId,
          updatedAt: serverTimestamp(),
        });
        await logAdministrativeEvent(reviewAction.advance.id, `advance_${nextStatus}`, {
          comment: reviewComment.trim(),
        });
        toast.success(nextStatus === 'returned' ? 'Anticipo devuelto para corrección.' : 'Anticipo rechazado.');
      }

      if (reviewAction.type === 'returnReceipt') {
        const advance = reviewAction.advance;
        const receipt = reviewAction.receipt;
        const now = new Date().toISOString();
        const nextReceipts = (advance.receipts || []).map((item) =>
          item.id === receipt.id
            ? {
                ...item,
                status: 'returned' as const,
                reviewedAt: now,
                reviewedBy: currentUser?.uid || null,
                reviewedByName: getCurrentUserName(currentUser),
                reviewComment: reviewComment.trim(),
                revisions: [
                  ...(item.revisions || []),
                  {
                    type: 'returned' as const,
                    actorId: currentUser?.uid || null,
                    actorName: getCurrentUserName(currentUser),
                    at: now,
                    comment: reviewComment.trim(),
                  },
                ],
              }
            : item
        );
        const amountLegalized = nextReceipts
          .filter(isApprovedReceipt)
          .reduce((sum, item) => sum + asNumber(item.amount), 0);
        const amountApproved = asNumber(advance.amountApproved || advance.amountRequested);
        const coverage = getAdvanceFinancialCoverage({
          ...advance,
          amountApproved,
          amountLegalized,
        });
        await updateDoc(doc(db, 'projects', projectId, 'advanceRequests', advance.id), {
          receipts: nextReceipts,
          amountLegalized,
          balance: Math.max(0, coverage.balance),
          status: advance.status === 'approved' ? 'approved' : 'paid',
          nextAction: 'correct_receipt',
          pendingRole: null,
          inboxTargetUserId: advance.requesterId,
          completedAt: null,
          completedBy: null,
          completedByName: '',
          reconciliationStatus: null,
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

  const handleCompleteAdvance = async (advance: TravelAdvance) => {
    if (!requesterMatchesCurrentActor(advance.requesterId, advance.requesterEmail)) {
      toast.error('Solo el solicitante original puede cerrar el anticipo y enviarlo a conciliación.');
      return;
    }

    const latestAdvance = advances.find((item) => item.id === advance.id) || advance;
    if (!isAdvanceReadyForLegalization(latestAdvance)) {
      toast.error('El anticipo debe tener su pago registrado antes de legalizarse.');
      return;
    }
    const nextReceipts = latestAdvance.receipts || [];
    if (nextReceipts.length === 0) {
      toast.error('Carga al menos un soporte antes de completar el anticipo.');
      return;
    }
    if (nextReceipts.some((receipt) => receipt.status === 'returned')) {
      toast.error('Subsanar los soportes devueltos antes de completar.');
      return;
    }
    if (!nextReceipts.every(isApprovedReceipt)) {
      const pendingCount = nextReceipts.filter((receipt) => !isApprovedReceipt(receipt)).length;
      toast.error(`Aún ${pendingCount === 1 ? 'hay 1 legalización pendiente' : `hay ${pendingCount} legalizaciones pendientes`} de aprobación administrativa.`);
      return;
    }

    const amountLegalized = nextReceipts.filter(isApprovedReceipt).reduce((sum, item) => sum + asNumber(item.amount), 0);
    const amountApproved = asNumber(latestAdvance.amountApproved || latestAdvance.amountRequested);
    const coverage = getAdvanceFinancialCoverage({
      ...latestAdvance,
      amountApproved,
      amountLegalized,
    });
    const balance = coverage.balance;
    const reconciliation = getAdvanceReconciliation({
      ...latestAdvance,
      receipts: nextReceipts,
      amountApproved,
      amountLegalized,
    });
    const reconciliationStatus: AdvanceReconciliationStatus = reconciliation.returnRequired > 0
      ? latestAdvance.returnSupport
        ? 'ready'
        : 'pending_return'
      : reconciliation.compensationRequired > 0
        ? latestAdvance.compensationSupport
          ? 'ready'
          : 'pending_compensation'
        : 'ready';

    setSubmitting(true);
    try {
      await updateDoc(doc(db, 'projects', projectId, 'advanceRequests', latestAdvance.id), {
        amountLegalized,
        balance,
        status: 'completed',
        reconciliationStatus,
        nextAction: 'reconcile_advance',
        pendingRole: 'administrative_validation',
        inboxTargetUserId: null,
        completedAt: serverTimestamp(),
        completedBy: currentUser?.uid || null,
        completedByName: getCurrentUserName(currentUser),
        closedAt: null,
        updatedAt: serverTimestamp(),
      });
      await logAdministrativeEvent(latestAdvance.id, 'advance_completed_by_requester', {
        amountApproved,
        amountLegalized,
        amountReturned: coverage.returnedCash,
        balance,
      });
      if (reconciliation.returnRequired > 0) {
        setReconciliationAdvance({
          ...latestAdvance,
          receipts: nextReceipts,
          amountLegalized,
          status: 'completed',
          reconciliationStatus,
        });
        setReconciliationFile(null);
        setReconciliationForm({ date: todayInputValue(), reference: '', note: '' });
        toast.success('Justificación cerrada. Adjunta ahora el soporte de devolución para enviarla a conciliación.');
      } else if (reconciliation.compensationRequired > 0) {
        toast.success('Justificación cerrada. La compensación quedó pendiente del área administrativa en Conciliación.');
      } else {
        toast.success('Justificación cerrada y enviada a conciliación.');
      }
    } catch (error: any) {
      console.error('Error completing advance:', error);
      toast.error(error?.message || 'No se pudo completar el anticipo.');
    } finally {
      setSubmitting(false);
    }
  };

  const openAdvancePayment = (advance: TravelAdvance) => {
    setPaymentAdvance(advance);
    setPaymentFile(null);
    setPaymentForm({
      customId: advance.customId || '',
      amount: String(asNumber(advance.amountApproved || advance.amountRequested) || ''),
      date: todayInputValue(),
      reference: '',
      note: '',
    });
  };

  const uploadAdvancePaymentSupport = async (advance: TravelAdvance, file: File) => {
    const uploadDate = new Date();
    const advanceFolderName = advance.customId
      ? `${advance.customId} - ${advance.destination || advance.purpose || 'Anticipo'}`
      : `${advance.destination || advance.purpose || 'Anticipo'} - ${advance.id.slice(0, 8)}`;
    const managedPrefix = `managed-advance-${advance.id}`;
    const { folders: indexedFolders, leafFolderId } = await ensureManagedDocumentFolderPath({
      projectId,
      userId: currentUser?.uid || null,
      segments: [
        { id: 'managed-administrativo', name: 'Administrativo', accessMode: 'all', metadata: { documentContext: 'administration' } },
        { id: 'managed-administrativo-anticipos', name: 'Anticipos', accessMode: 'inherit', metadata: { documentContext: 'advanceRepository' } },
        { id: managedPrefix, name: advanceFolderName, accessMode: 'inherit', metadata: { administrativeRequestId: advance.id, documentContext: 'advanceRepository' } },
        { id: `${managedPrefix}-pago`, name: 'Pago', accessMode: 'inherit', metadata: { administrativeRequestId: advance.id, documentContext: 'advancePayment' } },
      ],
    });
    const projectFolderSegments = getDocumentFolderStorageSegments(leafFolderId, indexedFolders);
    let storagePath = buildDocumentStoragePath({
      projectId,
      projectName: project?.name,
      fileName: file.name,
      documentName: `soporte-pago-${advance.customId || advance.id}`,
      date: uploadDate,
      folderName: 'administrativo',
      folderSegments: ['anticipos', advance.id, 'pago'],
    });
    const storageRef = ref(storage, storagePath);
    await uploadBytes(storageRef, file);
    storagePath = storageRef.fullPath;
    const fileUrl = await getDownloadURL(storageRef);
    const documentRef = await addDoc(collection(db, 'projects', projectId, 'documents'), {
      projectId,
      name: file.name,
      documentName: `Soporte de pago ${advance.customId || advance.id}`,
      type: 'Soporte de pago de anticipo',
      itemKind: 'file',
      scope: 'project',
      parentFolderId: leafFolderId,
      projectFolderSegments,
      administrativeRequestId: advance.id,
      documentContext: 'advancePayment',
      url: fileUrl,
      downloadURL: fileUrl,
      fileName: file.name,
      fileSize: file.size,
      fileType: file.type || 'application/octet-stream',
      storagePath,
      storageFolder: storagePath.split('/').slice(0, -1).join('/'),
      uploadedAt: serverTimestamp(),
      uploadedBy: currentUser?.uid || null,
      uploadedByName: getCurrentUserName(currentUser),
      createdAt: serverTimestamp(),
      accessMode: 'inherit',
      allowedMemberIds: [],
      accessPolicyVersion: 'folder-inheritance-v1',
      providerPathVersion: 'structured-v2',
    });
    return { fileUrl, storagePath, documentId: documentRef.id };
  };

  const handleRegisterAdvancePayment = async () => {
    if (!paymentAdvance || !canValidate) {
      toast.error('No tienes permisos para registrar pagos de anticipos.');
      return;
    }
    const latestAdvance = advances.find((advance) => advance.id === paymentAdvance.id) || paymentAdvance;
    if (latestAdvance.status !== 'pending_payment') {
      toast.error('Este anticipo ya no está pendiente de pago.');
      return;
    }
    if (!paymentFile) {
      toast.error('Carga el soporte del pago realizado.');
      return;
    }
    const amount = roundCurrency(paymentForm.amount);
    const approvedAmount = roundCurrency(latestAdvance.amountApproved || latestAdvance.amountRequested);
    const customId = paymentForm.customId.trim();
    if (!customId) {
      toast.error('Asigna el ID administrativo del anticipo antes de registrar el pago.');
      return;
    }
    if (
      advances.some(
        (advance) => advance.id !== latestAdvance.id && String(advance.customId || '').trim().toLowerCase() === customId.toLowerCase()
      )
    ) {
      toast.error('Ya existe otro anticipo con ese ID administrativo.');
      return;
    }
    if (amount <= 0 || Math.abs(amount - approvedAmount) > 0.01) {
      toast.error(`El pago debe coincidir con el valor aprobado: ${formatMoney(approvedAmount)}.`);
      return;
    }
    if (!paymentForm.date) {
      toast.error('Selecciona la fecha del pago.');
      return;
    }

    setSubmitting(true);
    try {
      const identifiedAdvance = { ...latestAdvance, customId };
      const uploaded = await uploadAdvancePaymentSupport(identifiedAdvance, paymentFile);
      const paymentRef = await addDoc(collection(db, 'projects', projectId, 'billingPayments'), {
        projectId,
        description: `Pago de anticipo ${customId}`,
        vendor: latestAdvance.requesterName,
        recipientId: latestAdvance.requesterId,
        recipientEmail: latestAdvance.requesterEmail || '',
        amount,
        date: new Date(`${paymentForm.date}T00:00:00`),
        status: 'paid',
        source: 'advance_disbursement',
        advanceId: latestAdvance.id,
        reference: paymentForm.reference.trim() || null,
        notes: paymentForm.note.trim() || null,
        supportDocumentId: uploaded.documentId,
        supportStoragePath: uploaded.storagePath,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        createdBy: currentUser?.uid || null,
      });
      const paymentSupport: AdvancePaymentSupport = {
        documentId: uploaded.documentId,
        fileName: paymentFile.name,
        fileSize: paymentFile.size,
        fileUrl: uploaded.fileUrl,
        storagePath: uploaded.storagePath,
        amount,
        date: paymentForm.date,
        reference: paymentForm.reference.trim() || undefined,
        note: paymentForm.note.trim() || undefined,
        billingPaymentId: paymentRef.id,
        paidAt: new Date().toISOString(),
        paidBy: currentUser?.uid || null,
        paidByName: getCurrentUserName(currentUser),
      };
      await updateDoc(doc(db, 'projects', projectId, 'advanceRequests', latestAdvance.id), {
        customId,
        customIdNormalized: customId.toLowerCase(),
        status: 'paid',
        paymentSupport,
        paidAt: serverTimestamp(),
        nextAction: 'justify_advance',
        pendingRole: null,
        inboxTargetUserId: latestAdvance.requesterId,
        updatedAt: serverTimestamp(),
      });
      await logAdministrativeEvent(latestAdvance.id, 'advance_paid', {
        amount,
        customId,
        date: paymentForm.date,
        reference: paymentForm.reference.trim(),
        documentId: uploaded.documentId,
      });
      toast.success('Pago registrado. El anticipo ya está disponible para legalización.');
      setPaymentAdvance(null);
      setPaymentFile(null);
    } catch (error: any) {
      console.error('Error registering advance payment:', error);
      toast.error(error?.message || 'No se pudo registrar el pago del anticipo.');
    } finally {
      setSubmitting(false);
    }
  };

  const openReconciliationSupport = (advance: TravelAdvance) => {
    setReconciliationAdvance(advance);
    setReconciliationFile(null);
    setReconciliationForm({ date: todayInputValue(), reference: '', note: '' });
  };

  const uploadAdvanceReconciliationSupport = async (
    advance: TravelAdvance,
    file: File,
    kind: 'return' | 'compensation',
    amount: number
  ) => {
    const uploadDate = new Date();
    const advanceFolderName = advance.customId
      ? `${advance.customId} - ${advance.destination || advance.purpose || 'Anticipo'}`
      : `${advance.destination || advance.purpose || 'Anticipo'} - ${advance.id.slice(0, 8)}`;
    const managedPrefix = `managed-advance-${advance.id}`;
    const folderName = kind === 'return' ? 'Devolución' : 'Compensación';
    const documentContext = kind === 'return' ? 'advanceReturn' : 'advanceCompensation';
    const { folders: indexedFolders, leafFolderId } = await ensureManagedDocumentFolderPath({
      projectId,
      userId: currentUser?.uid || null,
      segments: [
        { id: 'managed-administrativo', name: 'Administrativo', accessMode: 'all', metadata: { documentContext: 'administration' } },
        { id: 'managed-administrativo-anticipos', name: 'Anticipos', accessMode: 'inherit', metadata: { documentContext: 'advanceRepository' } },
        { id: managedPrefix, name: advanceFolderName, accessMode: 'inherit', metadata: { administrativeRequestId: advance.id, documentContext: 'advanceRepository' } },
        { id: `${managedPrefix}-conciliacion`, name: 'Conciliación', accessMode: 'inherit', metadata: { administrativeRequestId: advance.id, documentContext: 'advanceReconciliation' } },
        { id: `${managedPrefix}-conciliacion-${kind}`, name: folderName, accessMode: 'inherit', metadata: { administrativeRequestId: advance.id, documentContext } },
      ],
    });
    const projectFolderSegments = getDocumentFolderStorageSegments(leafFolderId, indexedFolders);
    let storagePath = buildDocumentStoragePath({
      projectId,
      projectName: project?.name,
      fileName: file.name,
      documentName: `soporte-${kind}-${advance.customId || advance.id}`,
      date: uploadDate,
      folderName: 'administrativo',
      folderSegments: ['anticipos', advance.id, 'conciliacion', kind],
    });
    const storageRef = ref(storage, storagePath);
    await uploadBytes(storageRef, file);
    storagePath = storageRef.fullPath;
    const fileUrl = await getDownloadURL(storageRef);
    const documentRef = await addDoc(collection(db, 'projects', projectId, 'documents'), {
      projectId,
      name: file.name,
      documentName: `Soporte de ${folderName.toLowerCase()} ${advance.customId || advance.id}`,
      type: `Soporte de ${folderName.toLowerCase()} de anticipo`,
      itemKind: 'file',
      scope: 'project',
      parentFolderId: leafFolderId,
      projectFolderSegments,
      administrativeRequestId: advance.id,
      documentContext,
      reconciliationKind: kind,
      reconciliationAmount: amount,
      url: fileUrl,
      downloadURL: fileUrl,
      fileName: file.name,
      fileSize: file.size,
      fileType: file.type || 'application/octet-stream',
      storagePath,
      storageFolder: storagePath.split('/').slice(0, -1).join('/'),
      uploadedAt: serverTimestamp(),
      uploadedBy: currentUser?.uid || null,
      uploadedByName: getCurrentUserName(currentUser),
      createdAt: serverTimestamp(),
      accessMode: 'inherit',
      allowedMemberIds: [],
      accessPolicyVersion: 'folder-inheritance-v1',
      providerPathVersion: 'structured-v2',
    });
    return { documentId: documentRef.id, fileUrl, storagePath };
  };

  const handleSaveReconciliationSupport = async () => {
    if (!reconciliationAdvance || !reconciliationFile) return;
    const latestAdvance = advances.find((advance) => advance.id === reconciliationAdvance.id) || reconciliationAdvance;
    if (!['completed', 'closed'].includes(latestAdvance.status) || (!latestAdvance.completedAt && latestAdvance.status !== 'closed')) {
      toast.error('El solicitante debe cerrar primero el anticipo antes de registrar la conciliación.');
      return;
    }
    const reconciliation = getAdvanceReconciliation(latestAdvance);
    const kind = reconciliation.returnRequired > 0 ? 'return' : 'compensation';
    const amount = kind === 'return' ? reconciliation.returnRequired : reconciliation.compensationRequired;
    if (kind === 'compensation' && !canValidate) {
      toast.error('La compensación solo puede ser cargada por el área administrativa.');
      return;
    }
    if (kind === 'return' && !canCorrectAdvanceReceipt(latestAdvance) && !canManage && !canValidate) {
      toast.error('No tienes permisos para registrar esta devolución.');
      return;
    }
    if (amount <= 0) {
      toast.error('Este anticipo no requiere soporte de devolución ni compensación.');
      return;
    }
    if (!reconciliationForm.date) {
      toast.error('Selecciona la fecha del movimiento.');
      return;
    }

    setSubmitting(true);
    try {
      const uploaded = await uploadAdvanceReconciliationSupport(latestAdvance, reconciliationFile, kind, amount);
      let compensationPaymentId = latestAdvance.compensationSupport?.billingPaymentId || '';
      if (kind === 'compensation') {
        const compensationPayment = {
          projectId,
          description: `Compensación anticipo ${latestAdvance.customId || latestAdvance.id}`,
          vendor: latestAdvance.requesterName,
          recipientId: latestAdvance.requesterId,
          recipientEmail: latestAdvance.requesterEmail || '',
          amount,
          date: new Date(`${reconciliationForm.date}T00:00:00`),
          status: 'paid',
          source: 'advance_compensation',
          advanceId: latestAdvance.id,
          reference: reconciliationForm.reference.trim() || null,
          notes: reconciliationForm.note.trim() || null,
          supportDocumentId: uploaded.documentId,
          supportStoragePath: uploaded.storagePath,
          updatedAt: serverTimestamp(),
        };
        if (compensationPaymentId) {
          await updateDoc(doc(db, 'projects', projectId, 'billingPayments', compensationPaymentId), compensationPayment);
        } else {
          const paymentRef = await addDoc(collection(db, 'projects', projectId, 'billingPayments'), {
            ...compensationPayment,
            createdAt: serverTimestamp(),
            createdBy: currentUser?.uid || null,
          });
          compensationPaymentId = paymentRef.id;
        }
      }
      const support: AdvanceReconciliationSupport = {
        ...uploaded,
        fileName: reconciliationFile.name,
        fileSize: reconciliationFile.size,
        amount,
        date: reconciliationForm.date,
        reference: reconciliationForm.reference.trim() || undefined,
        note: reconciliationForm.note.trim() || undefined,
        billingPaymentId: compensationPaymentId || undefined,
        uploadedAt: new Date().toISOString(),
        uploadedBy: currentUser?.uid || null,
        uploadedByName: getCurrentUserName(currentUser),
      };
      await updateDoc(doc(db, 'projects', projectId, 'advanceRequests', latestAdvance.id), {
        ...(kind === 'return'
          ? { returnSupport: support, amountReturned: amount, returnedAt: serverTimestamp(), returnedBy: currentUser?.uid || null, returnedByName: getCurrentUserName(currentUser) }
          : { compensationSupport: support, amountCompensated: amount }),
        reconciliationStatus: 'ready',
        nextAction: 'reconcile_advance',
        pendingRole: 'administrative_validation',
        updatedAt: serverTimestamp(),
      });
      await logAdministrativeEvent(latestAdvance.id, kind === 'return' ? 'advance_return_support_uploaded' : 'advance_compensation_uploaded', {
        amount,
        documentId: uploaded.documentId,
        date: reconciliationForm.date,
        reference: reconciliationForm.reference.trim(),
      });
      toast.success(kind === 'return' ? 'Soporte de devolución cargado e indexado.' : 'Compensación cargada e indexada.');
      setReconciliationAdvance(null);
      setReconciliationFile(null);
    } catch (error: any) {
      console.error('Error saving reconciliation support:', error);
      toast.error(error?.message || 'No se pudo guardar el soporte de conciliación.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleFinalizeReconciliation = async (advance: TravelAdvance) => {
    if (!canValidate) {
      toast.error('Solo el área administrativa puede conciliar y cerrar el anticipo.');
      return;
    }
    const latestAdvance = advances.find((item) => item.id === advance.id) || advance;
    if (!['completed', 'closed'].includes(latestAdvance.status) || (!latestAdvance.completedAt && latestAdvance.status !== 'closed')) {
      toast.error('Este anticipo todavía no ha sido cerrado por el solicitante.');
      return;
    }
    const openReceipts = (latestAdvance.receipts || []).some((receipt) => !isApprovedReceipt(receipt));
    if (openReceipts) {
      toast.error('Primero revisa todos los soportes de la justificación.');
      return;
    }
    const reconciliation = getAdvanceReconciliation(latestAdvance);
    if (reconciliation.returnRequired > 0 && !latestAdvance.returnSupport) {
      toast.error('Carga el soporte de devolución antes de cerrar.');
      return;
    }
    if (
      reconciliation.returnRequired > 0 &&
      Math.abs(asNumber(latestAdvance.returnSupport?.amount) - reconciliation.returnRequired) > 0.01
    ) {
      toast.error('El soporte de devolución no coincide con el saldo actual. Cárgalo nuevamente.');
      return;
    }
    if (reconciliation.compensationRequired > 0 && !latestAdvance.compensationSupport) {
      toast.error('Carga la compensación antes de cerrar.');
      return;
    }
    if (
      reconciliation.compensationRequired > 0 &&
      Math.abs(asNumber(latestAdvance.compensationSupport?.amount) - reconciliation.compensationRequired) > 0.01
    ) {
      toast.error('El soporte de compensación no coincide con el excedente actual. Cárgalo nuevamente.');
      return;
    }

    setSubmitting(true);
    try {
      await updateDoc(doc(db, 'projects', projectId, 'advanceRequests', latestAdvance.id), {
        amountReturned: reconciliation.returnRequired,
        amountCompensated: reconciliation.compensationRequired,
        balance: 0,
        status: 'closed',
        reconciliationStatus: 'reconciled',
        reconciledAt: serverTimestamp(),
        reconciledBy: currentUser?.uid || null,
        reconciledByName: getCurrentUserName(currentUser),
        nextAction: 'closed',
        pendingRole: null,
        inboxTargetUserId: null,
        closedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      await logAdministrativeEvent(latestAdvance.id, 'advance_reconciled', {
        anticipated: reconciliation.anticipated,
        justified: reconciliation.justified,
        legalized: reconciliation.legalized,
        amountReturned: reconciliation.returnRequired,
        amountCompensated: reconciliation.compensationRequired,
      });
      toast.success('Anticipo conciliado. Costos reales y expediente final habilitados.');
    } catch (error: any) {
      console.error('Error finalizing reconciliation:', error);
      toast.error(error?.message || 'No se pudo cerrar la conciliación.');
    } finally {
      setSubmitting(false);
    }
  };

  const resetReceiptForm = () => {
    setReceiptForm({
      documentType: 'invoice',
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

  const resetAiReceiptState = () => {
    setAiReceiptDrafts([]);
    setAiAnalyzingReceipts(false);
  };

  const closeReceiptModal = () => {
    resetReceiptForm();
    resetAiReceiptState();
    setReceiptMode('manual');
    setSupportPreviewFile(null);
    setSelectedAdvance(null);
  };

  const uploadReceiptDocument = async (
    advance: TravelAdvance,
    category: ExpenseCategory,
    file?: File | null,
    documentLabel?: string,
    documentType: ReceiptDocumentType = 'invoice'
  ) => {
    if (!file) return { fileUrl: '', storagePath: '', documentId: '' };

    const uploadDate = new Date();
    const documentTypeMeta = getReceiptDocumentTypeMeta(documentType);
    const advanceFolderName = advance.customId
      ? `${advance.customId} - ${advance.destination || advance.purpose || 'Anticipo'}`
      : `${advance.destination || advance.purpose || 'Anticipo'} - ${advance.id.slice(0, 8)}`;
    const managedPrefix = `managed-advance-${advance.id}`;
    const { folders: indexedFolders, leafFolderId } = await ensureManagedDocumentFolderPath({
      projectId,
      userId: currentUser?.uid || null,
      segments: [
        { id: 'managed-administrativo', name: 'Administrativo', accessMode: 'all', metadata: { documentContext: 'administration' } },
        { id: 'managed-administrativo-anticipos', name: 'Anticipos', accessMode: 'inherit', metadata: { documentContext: 'advanceRepository' } },
        { id: managedPrefix, name: advanceFolderName, accessMode: 'inherit', metadata: { administrativeRequestId: advance.id, documentContext: 'advanceRepository' } },
        { id: `${managedPrefix}-${documentType}`, name: documentTypeMeta.label, accessMode: 'inherit', metadata: { administrativeRequestId: advance.id, documentType } },
        { id: `${managedPrefix}-${documentType}-${category.id}`, name: category.name, accessMode: 'inherit', metadata: { administrativeRequestId: advance.id, documentType, categoryId: category.id } },
      ],
    });
    const projectFolderSegments = getDocumentFolderStorageSegments(leafFolderId, indexedFolders);
    let storagePath = buildDocumentStoragePath({
      projectId,
      projectName: project?.name,
      fileName: file.name,
      documentName: `legalizacion-${advance.destination}-${documentTypeMeta.shortLabel}-${documentLabel || category.name}`,
      date: uploadDate,
      folderName: 'administrativo',
      folderSegments: ['anticipos', advance.id, documentTypeMeta.shortLabel, category.name],
    });
    const storageRef = ref(storage, storagePath);
    await uploadBytes(storageRef, file);
    storagePath = storageRef.fullPath;
    const fileUrl = await getDownloadURL(storageRef);
    const storageFolder = storagePath.split('/').slice(0, -1).join('/');

    const documentRef = await addDoc(collection(db, 'projects', projectId, 'documents'), {
      projectId,
      name: file.name,
      documentName: `${documentTypeMeta.label} ${category.name}`,
      type: documentTypeMeta.label,
      itemKind: 'file',
      scope: 'project',
      parentFolderId: leafFolderId,
      projectFolderSegments,
      administrativeRequestId: advance.id,
      documentContext: 'advanceReceipt',
      documentType,
      documentTypeLabel: documentTypeMeta.label,
      category: category.name,
      url: fileUrl,
      downloadURL: fileUrl,
      fileName: file.name,
      fileSize: file.size,
      fileType: file.type || 'application/octet-stream',
      storagePath,
      storageFolder,
      uploadedAt: serverTimestamp(),
      uploadedBy: currentUser?.uid || null,
      uploadedByName: getCurrentUserName(currentUser),
      createdAt: serverTimestamp(),
      accessMode: 'inherit',
      allowedMemberIds: [],
      accessPolicyVersion: 'folder-inheritance-v1',
      providerPathVersion: 'structured-v2',
    });

    return { fileUrl, storagePath, documentId: documentRef.id };
  };

  const handleCreateReceipt = async () => {
    if (!selectedAdvance || !canManage) return;
    const category = categoryOptions.find((item) => item.id === receiptForm.categoryId);
    const amount = asNumber(receiptForm.amount);
    if (!category || amount <= 0 || !receiptForm.businessName.trim()) {
      toast.error('Completa categoría, valor y razón social del soporte.');
      return;
    }
    if (!receiptFile) {
      toast.error('Adjunta el documento soporte antes de crear la legalización.');
      return;
    }
    const documentType = getReceiptDocumentType(receiptForm.documentType);
    const documentTypeMeta = getReceiptDocumentTypeMeta(documentType);
    if (documentType === 'invoice' && category.requiresCufe && !receiptForm.cufe.trim()) {
      toast.error('Este dominio requiere CUFE cuando se legaliza con factura electrónica.');
      return;
    }
    const latestAdvance = advances.find((advance) => advance.id === selectedAdvance.id) || selectedAdvance;
    if (!isAdvanceReadyForLegalization(latestAdvance)) {
      toast.error('El anticipo debe tener su pago registrado antes de cargar legalizaciones.');
      return;
    }
    const cufe = normalizeCufe(receiptForm.cufe);
    const duplicateUsage = findDuplicateReceiptUsage(
      {
        documentType,
        cufe,
        invoiceNumber: receiptForm.invoiceNumber,
        taxId: receiptForm.taxId,
        businessName: receiptForm.businessName,
        amount,
        date: receiptForm.date,
      },
      latestAdvance.id
    );
    if (duplicateUsage) {
      toast.error(`Este soporte ya fue usado en "${duplicateUsage.advanceTitle}" por ${duplicateUsage.requesterName}.`);
      return;
    }

    setSubmitting(true);
    try {
      const { fileUrl, storagePath, documentId } = await uploadReceiptDocument(
        latestAdvance,
        category,
        receiptFile,
        receiptForm.businessName || category.name,
        documentType
      );

      const receipt: AdvanceReceipt = {
        id: safeId(),
        documentType,
        categoryId: category.id,
        categoryName: category.name,
        amount,
        date: receiptForm.date,
        businessName: receiptForm.businessName.trim(),
        taxId: receiptForm.taxId.trim(),
        invoiceNumber: receiptForm.invoiceNumber.trim(),
        cufe,
        description: receiptForm.description.trim(),
        fileName: receiptFile?.name,
        fileSize: receiptFile?.size,
        fileUrl,
        storagePath,
        documentId,
        status: 'submitted',
        createdAt: new Date().toISOString(),
        createdBy: currentUser?.uid || null,
        createdByName: getCurrentUserName(currentUser),
      };

      await updateDoc(doc(db, 'projects', projectId, 'advanceRequests', selectedAdvance.id), {
        receipts: [...(latestAdvance.receipts || []), receipt],
        status: latestAdvance.status === 'approved' ? 'approved' : 'paid',
        nextAction: 'validate_receipt',
        pendingRole: 'administrative_validation',
        inboxTargetUserId: null,
        completedAt: null,
        completedBy: null,
        completedByName: '',
        updatedAt: serverTimestamp(),
      });
      await logAdministrativeEvent(selectedAdvance.id, 'receipt_submitted', {
        receiptId: receipt.id,
        documentType,
        documentTypeLabel: documentTypeMeta.label,
        amount,
        categoryName: category.name,
      });
      toast.success('Soporte cargado para validación.');
      closeReceiptModal();
    } catch (error: any) {
      console.error('Error creating receipt:', error);
      toast.error(error?.message || 'No se pudo guardar el soporte.');
    } finally {
      setSubmitting(false);
    }
  };

  const analyzeReceiptFilesForAdvance = async (advance: TravelAdvance, files: File[]): Promise<AiReceiptDraft[]> => {
    const body = new FormData();
    files.forEach((file) => body.append('files', file));
    body.append(
      'categories',
      JSON.stringify(
        categoryOptions.map((category) => ({
          id: category.id,
          name: category.name,
          requiresCufe: category.requiresCufe,
          defaultDailyAmount: category.defaultDailyAmount,
          description: category.description,
        }))
      )
    );
    body.append(
      'advanceContext',
      JSON.stringify({
        id: advance.id,
        destination: advance.destination,
        purpose: advance.purpose,
        items: advance.items,
        travelStart: advance.travelStart,
        travelEnd: advance.travelEnd,
      })
    );

    const response = await fetch('/api/administration/receipts/analyze', {
      method: 'POST',
      body,
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(data?.error || 'No se pudo analizar el soporte.');
    }

    return ((data?.receipts || []) as any[])
      .map((item, fallbackIndex) => {
        const fileIndex = Number.isInteger(item?.index) ? item.index : fallbackIndex;
        const file = files[fileIndex];
        if (!file) return null;
        const categoryById = categoryOptions.find((category) => category.id === item?.categoryId);
        const categoryByName = categoryOptions.find(
          (category) => category.name.toLowerCase() === String(item?.categoryName || '').toLowerCase()
        );
        const category = categoryById || categoryByName || categoryOptions[0];

        return {
          id: safeId(),
          file,
          fileName: file.name,
          fileSize: file.size,
          fileType: file.type || 'application/octet-stream',
          documentType: getReceiptDocumentType(item?.documentType),
          categoryId: category?.id || item?.categoryId || '',
          categoryName: item?.categoryName || category?.name || '',
          amount: item?.amount ? String(item.amount) : '',
          date: item?.date || todayInputValue(),
          businessName: item?.businessName || '',
          taxId: item?.taxId || '',
          invoiceNumber: item?.invoiceNumber || '',
          cufe: normalizeCufe(item?.cufe || ''),
          description: item?.description || '',
          confidence: typeof item?.confidence === 'number' ? item.confidence : undefined,
          warnings: Array.isArray(item?.warnings) ? item.warnings : [],
          status: item?.status === 'error' ? 'error' : 'ready',
          error: item?.error || '',
        } as AiReceiptDraft;
      })
      .filter(Boolean) as AiReceiptDraft[];
  };

  const handleAnalyzeReceiptFiles = async (fileList: FileList | null) => {
    if (!selectedAdvance) return;
    const files = Array.from(fileList || []);
    if (files.length === 0) return;

    setReceiptMode('ai');
    setAiAnalyzingReceipts(true);
    try {
      const drafts = await analyzeReceiptFilesForAdvance(selectedAdvance, files);
      setAiReceiptDrafts((current) => [...current, ...drafts]);
      const errors = drafts.filter((draft) => draft.status === 'error').length;
      toast.success(
        errors > 0
          ? `${drafts.length - errors} soportes listos y ${errors} con alertas.`
          : `${drafts.length} soportes analizados.`
      );
    } catch (error: any) {
      console.error('Error analyzing receipts:', error);
      toast.error(error?.message || 'No se pudo analizar el lote.');
    } finally {
      setAiAnalyzingReceipts(false);
    }
  };

  const applyAiDraftToReceiptEditor = (draft: AiReceiptDraft) => {
    setReceiptEditorForm((current) => {
      if (!current) return current;

      const documentType = getReceiptDocumentType(draft.documentType);
      const cufe = normalizeCufe(draft.cufe);

      return {
        ...current,
        documentType,
        categoryId: draft.categoryId || current.categoryId,
        amount: draft.amount || current.amount,
        date: draft.date || current.date,
        businessName: draft.businessName || current.businessName,
        taxId: draft.taxId || current.taxId,
        invoiceNumber: draft.invoiceNumber || current.invoiceNumber,
        cufe,
        description: draft.description || current.description,
        dianVerificationStatus: documentType === 'cash_receipt' ? 'not_applicable' : cufe ? 'pending' : 'not_applicable',
        dianLookupOpenedAt: '',
        dianVerifiedAt: '',
        dianDocumentUrl: documentType === 'invoice' && cufe ? buildDianDocumentUrl(cufe) : '',
      };
    });
  };

  const handleReplaceReceiptSupport = async (reanalyze = false) => {
    if (!receiptEditor || !receiptEditorForm || receiptEditor.mode !== 'review') return;
    if (!canValidate) {
      toast.error('No tienes permisos para cambiar el soporte desde revisión.');
      return;
    }
    if (!receiptReplacementFile) {
      toast.error('Selecciona el nuevo soporte antes de guardar.');
      return;
    }

    const latestAdvance = advances.find((advance) => advance.id === receiptEditor.advance.id) || receiptEditor.advance;
    const latestReceipt = (latestAdvance.receipts || []).find((receipt) => receipt.id === receiptEditor.receipt.id) || receiptEditor.receipt;
    const currentCategory = categoryOptions.find((item) => item.id === receiptEditorForm.categoryId);
    const fallbackCategory = categoryOptions.find((item) => item.id === latestReceipt.categoryId);
    const category = currentCategory || fallbackCategory;
    if (!category) {
      toast.error('Selecciona un tipo de gasto antes de reemplazar el soporte.');
      return;
    }

    const documentType = getReceiptDocumentType(receiptEditorForm.documentType);
    setReceiptSupportAction(reanalyze ? 'reanalyze' : 'replace');
    try {
      const uploaded = await uploadReceiptDocument(
        latestAdvance,
        category,
        receiptReplacementFile,
        receiptEditorForm.businessName || latestReceipt.businessName || category.name,
        documentType
      );

      let analyzedDraft: AiReceiptDraft | null = null;
      let aiWarning = '';
      if (reanalyze) {
        try {
          const drafts = await analyzeReceiptFilesForAdvance(latestAdvance, [receiptReplacementFile]);
          analyzedDraft = drafts[0] || null;
          if (!analyzedDraft) {
            aiWarning = 'La IA no devolvió datos para este soporte.';
          } else if (analyzedDraft.status === 'error') {
            aiWarning = analyzedDraft.error || 'La IA no pudo leer el soporte reemplazado.';
          }
        } catch (error: any) {
          aiWarning = error?.message || 'La IA no pudo leer el soporte reemplazado.';
        }
      }

      const now = new Date().toISOString();
      const fileChange: ReceiptFieldChange = {
        field: 'file',
        label: 'Archivo de soporte',
        previousValue: latestReceipt.fileName || null,
        nextValue: receiptReplacementFile.name,
      };
      const nextReceipt: AdvanceReceipt = {
        ...latestReceipt,
        fileName: receiptReplacementFile.name,
        fileSize: receiptReplacementFile.size,
        fileUrl: uploaded.fileUrl,
        storagePath: uploaded.storagePath,
        documentId: uploaded.documentId,
        aiExtracted: reanalyze ? Boolean(analyzedDraft && analyzedDraft.status !== 'error') : latestReceipt.aiExtracted,
        aiConfidence: analyzedDraft?.confidence ?? latestReceipt.aiConfidence,
        aiWarnings: analyzedDraft?.warnings || latestReceipt.aiWarnings,
        revisionCount: asNumber(latestReceipt.revisionCount) + 1,
        revisions: [
          ...(latestReceipt.revisions || []),
          {
            type: 'support_replaced',
            actorId: currentUser?.uid || null,
            actorName: getCurrentUserName(currentUser),
            at: now,
            comment: reanalyze
              ? aiWarning
                ? `Soporte reemplazado. ${aiWarning}`
                : 'Soporte reemplazado y leído nuevamente con IA.'
              : 'Soporte original reemplazado.',
            changes: [fileChange],
          },
        ],
      };
      const nextReceipts = (latestAdvance.receipts || []).map((item) =>
        item.id === latestReceipt.id ? nextReceipt : item
      );
      const nextAdvance = { ...latestAdvance, receipts: nextReceipts };

      await updateDoc(doc(db, 'projects', projectId, 'advanceRequests', latestAdvance.id), {
        receipts: nextReceipts,
        updatedAt: serverTimestamp(),
      });
      await logAdministrativeEvent(latestAdvance.id, reanalyze ? 'receipt_support_reanalyzed' : 'receipt_support_replaced', {
        receiptId: latestReceipt.id,
        fileName: receiptReplacementFile.name,
        storagePath: uploaded.storagePath,
        aiWarnings: aiWarning ? [aiWarning] : analyzedDraft?.warnings || [],
      });

      setAdvances((current) => current.map((advance) => (advance.id === nextAdvance.id ? nextAdvance : advance)));
      setReceiptEditor((current) => (current ? { ...current, advance: nextAdvance, receipt: nextReceipt } : current));
      if (analyzedDraft && analyzedDraft.status !== 'error') {
        applyAiDraftToReceiptEditor(analyzedDraft);
      }
      setReceiptReplacementFile(null);
      toast.success(
        aiWarning
          ? 'Soporte reemplazado. La IA no pudo completar la lectura; ajusta los campos manualmente.'
          : reanalyze
            ? 'Soporte reemplazado y campos actualizados con IA.'
            : 'Soporte reemplazado correctamente.'
      );
    } catch (error: any) {
      console.error('Error replacing receipt support:', error);
      toast.error(error?.message || 'No se pudo reemplazar el soporte.');
    } finally {
      setReceiptSupportAction(null);
    }
  };

  const updateAiReceiptDraft = (id: string, updates: Partial<AiReceiptDraft>) => {
    setAiReceiptDrafts((current) => current.map((draft) => (draft.id === id ? { ...draft, ...updates } : draft)));
  };

  const removeAiReceiptDraft = (id: string) => {
    setAiReceiptDrafts((current) => current.filter((draft) => draft.id !== id));
  };

  const handleCreateAiReceipts = async () => {
    if (!selectedAdvance || !canManage) return;
    const readyDrafts = aiReceiptDrafts.filter((draft) => draft.status !== 'error');
    if (readyDrafts.length === 0) {
      toast.error('No hay soportes listos para guardar.');
      return;
    }

    const latestAdvance = advances.find((advance) => advance.id === selectedAdvance.id) || selectedAdvance;
    if (!isAdvanceReadyForLegalization(latestAdvance)) {
      toast.error('El anticipo debe tener su pago registrado antes de cargar legalizaciones.');
      return;
    }
    const batchIdentities = new Map<string, string>();
    for (const draft of readyDrafts) {
      const category = categoryOptions.find((item) => item.id === draft.categoryId);
      const amount = asNumber(draft.amount);
      const documentType = getReceiptDocumentType(draft.documentType);
      const cufe = normalizeCufe(draft.cufe);
      if (!category || amount <= 0 || !draft.businessName.trim()) {
        toast.error(`Revisa categoría, valor y proveedor en ${draft.fileName}.`);
        return;
      }
      if (documentType === 'invoice' && category.requiresCufe && !cufe) {
        toast.error(`${draft.fileName} requiere CUFE para el dominio ${category.name} cuando es factura electrónica.`);
        return;
      }

      const identity = getReceiptIdentity({
        documentType,
        cufe,
        invoiceNumber: draft.invoiceNumber,
        taxId: draft.taxId,
        businessName: draft.businessName,
        amount,
        date: draft.date || todayInputValue(),
      });
      if (identity && batchIdentities.has(identity)) {
        toast.error(`${draft.fileName} repite el mismo soporte de ${batchIdentities.get(identity)} dentro del lote.`);
        return;
      }
      if (identity) batchIdentities.set(identity, draft.fileName);

      const duplicateUsage = findDuplicateReceiptUsage(
        {
          documentType,
          cufe,
          invoiceNumber: draft.invoiceNumber,
          taxId: draft.taxId,
          businessName: draft.businessName,
          amount,
          date: draft.date || todayInputValue(),
        },
        latestAdvance.id
      );
      if (duplicateUsage) {
        toast.error(`${draft.fileName} ya fue usado en "${duplicateUsage.advanceTitle}" por ${duplicateUsage.requesterName}.`);
        return;
      }
    }

    setSubmitting(true);
    try {
      const createdReceipts: AdvanceReceipt[] = [];

      for (const draft of readyDrafts) {
        const category = categoryOptions.find((item) => item.id === draft.categoryId)!;
        const documentType = getReceiptDocumentType(draft.documentType);
        const { fileUrl, storagePath, documentId } = await uploadReceiptDocument(
          latestAdvance,
          category,
          draft.file,
          draft.businessName || category.name,
          documentType
        );

        createdReceipts.push({
          id: safeId(),
          documentType,
          categoryId: category.id,
          categoryName: category.name,
          amount: asNumber(draft.amount),
          date: draft.date || todayInputValue(),
          businessName: draft.businessName.trim(),
          taxId: draft.taxId.trim(),
          invoiceNumber: draft.invoiceNumber.trim(),
          cufe: normalizeCufe(draft.cufe),
          description: draft.description.trim(),
          fileName: draft.fileName,
          fileSize: draft.fileSize,
          fileUrl,
          storagePath,
          documentId,
          status: 'submitted',
          createdAt: new Date().toISOString(),
          createdBy: currentUser?.uid || null,
          createdByName: getCurrentUserName(currentUser),
          aiExtracted: true,
          aiConfidence: draft.confidence,
          aiWarnings: draft.warnings || [],
        });
      }

      await updateDoc(doc(db, 'projects', projectId, 'advanceRequests', selectedAdvance.id), {
        receipts: [...(latestAdvance.receipts || []), ...createdReceipts],
        status: latestAdvance.status === 'approved' ? 'approved' : 'paid',
        nextAction: 'validate_receipt',
        pendingRole: 'administrative_validation',
        inboxTargetUserId: null,
        completedAt: null,
        completedBy: null,
        completedByName: '',
        updatedAt: serverTimestamp(),
      });
      await logAdministrativeEvent(selectedAdvance.id, 'receipts_ai_bulk_submitted', {
        receiptCount: createdReceipts.length,
        documentTypes: Array.from(new Set(createdReceipts.map((receipt) => receipt.documentType))),
        amount: createdReceipts.reduce((sum, receipt) => sum + asNumber(receipt.amount), 0),
      });
      toast.success(`${createdReceipts.length} soportes creados para validación.`);
      closeReceiptModal();
    } catch (error: any) {
      console.error('Error creating AI receipts:', error);
      toast.error(error?.message || 'No se pudieron crear las legalizaciones.');
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
      const existingCostCenterNames = new Set(
        costCenterDomains.map((center) => center.name.trim().toLowerCase())
      );
      const missingCostCenters = DEFAULT_COST_CENTERS.filter(
        (center) => !existingCostCenterNames.has(center.name.trim().toLowerCase())
      );
      await Promise.all(
        [
          ...missing.map((category) =>
            addDoc(collection(db, 'projects', projectId, 'expenseCategories'), {
              ...category,
              projectId,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
              createdBy: currentUser?.uid || null,
            })
          ),
          ...missingCostCenters.map((center) =>
            addDoc(collection(db, 'projects', projectId, 'costCenters'), {
              ...center,
              projectId,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
              createdBy: currentUser?.uid || null,
            })
          ),
        ]
      );
      toast.success(
        missing.length + missingCostCenters.length > 0
          ? 'Dominios base creados.'
          : 'Los dominios base ya existían.'
      );
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

  const saveCostCenter = async () => {
    if (!canConfigure) return;
    const name = costCenterForm.name.trim();
    if (!name) {
      toast.error('Escribe el nombre del centro de costos.');
      return;
    }
    const duplicate = costCenterDomains.some(
      (center) => center.id !== costCenterForm.id && center.name.trim().toLowerCase() === name.toLowerCase()
    );
    if (duplicate) {
      toast.error('Ya existe un centro de costos con ese nombre.');
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        projectId,
        name,
        code: costCenterForm.code.trim().toUpperCase(),
        description: costCenterForm.description.trim(),
        active: true,
        updatedAt: serverTimestamp(),
      };
      if (costCenterForm.id) {
        await updateDoc(doc(db, 'projects', projectId, 'costCenters', costCenterForm.id), payload);
        toast.success('Centro de costos actualizado.');
      } else {
        await addDoc(collection(db, 'projects', projectId, 'costCenters'), {
          ...payload,
          createdAt: serverTimestamp(),
          createdBy: currentUser?.uid || null,
        });
        toast.success('Centro de costos creado.');
      }
      setCostCenterForm({ id: '', name: '', code: '', description: '' });
    } catch (error: any) {
      console.error('Error saving cost center domain:', error);
      toast.error(error?.message || 'No se pudo guardar el centro de costos.');
    } finally {
      setSubmitting(false);
    }
  };

  const toggleCostCenter = async (center: CostCenterDomain) => {
    if (!canConfigure || center.id.startsWith('default-cost-center-')) return;
    await updateDoc(doc(db, 'projects', projectId, 'costCenters', center.id), {
      active: center.active === false,
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
        <div className="flex flex-col gap-3 bg-slate-950 px-5 py-4 text-white lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-md bg-emerald-400/10 px-3 py-1 text-[11px] font-black uppercase tracking-[0.28em] text-emerald-200 ring-1 ring-emerald-300/20">
              <FolderKanban size={14} />
              Control administrativo
            </div>
            <h2 className="mt-2 text-2xl font-black tracking-tight">Anticipos, legalizaciones y costos reales</h2>
            <p className="mt-1 max-w-3xl text-xs font-semibold leading-5 text-slate-300">
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

        <div className="grid gap-2 border-t border-slate-800 bg-slate-950/95 p-3 sm:grid-cols-2 xl:grid-cols-5">
          <Metric label="Solicitado" value={formatMoney(metrics.requested)} icon={<Send size={18} />} tone="blue" />
          <Metric label="Justificado" value={formatMoney(metrics.justified)} icon={<ClipboardCheck size={18} />} tone="indigo" />
          <Metric label="Legalizado" value={formatMoney(metrics.legalized)} icon={<ReceiptText size={18} />} tone="emerald" />
          <Metric label="Saldo por legalizar" value={formatMoney(metrics.balance)} icon={<AlertCircle size={18} />} tone="amber" />
          <Metric label="Costo real registrado" value={formatMoney(metrics.realAdminPayments)} icon={<Banknote size={18} />} tone="rose" />
        </div>
      </section>

      <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap gap-2">
          {[
            ['requests', 'Anticipos', advances.filter((advance) => showReconciledAdvances || !isAdvanceReconciled(advance)).length],
            ['approvals', 'Anticipos por aprobar', approvalAdvances.length],
            ['payables', 'Anticipos por pagar', payableAdvances.length],
            ['receipts', 'Legalizaciones', receipts.length],
            ['conciliation', 'Conciliación', reconciliationAdvances.filter((item) => item.advance.reconciliationStatus !== 'reconciled').length],
            ['payments', 'Costos reales', realCostAdvanceGroups.length],
            ['settings', 'Dominios', categoryOptions.length + costCenterOptions.length],
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
          <span className="rounded-md bg-violet-50 px-2 py-1 text-violet-700">{metrics.pendingPayment} por pagar</span>
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
              <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm md:flex-row md:items-center md:justify-between">
                <div className="relative min-w-0 flex-1">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    className={`${inputClass} pl-10`}
                    value={advanceSearch}
                    onChange={(event) => setAdvanceSearch(event.target.value)}
                    placeholder="Buscar por ID, solicitante, municipio, tarea o justificación..."
                  />
                </div>
                <button
                  type="button"
                  aria-pressed={showReconciledAdvances}
                  onClick={() => setShowReconciledAdvances((current) => !current)}
                  className={`inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-lg px-3 text-xs font-black ring-1 transition ${
                    showReconciledAdvances
                      ? 'bg-teal-600 text-white ring-teal-600'
                      : 'bg-white text-slate-600 ring-slate-200 hover:bg-slate-50'
                  }`}
                >
                  {showReconciledAdvances ? <EyeOff size={15} /> : <Eye size={15} />}
                  {showReconciledAdvances
                    ? 'Ocultar conciliados'
                    : `Mostrar conciliados${hiddenReconciledAdvancesCount ? ` (${hiddenReconciledAdvancesCount})` : ''}`}
                </button>
                <span className="rounded-lg bg-slate-50 px-3 py-2 text-xs font-black uppercase tracking-[0.16em] text-slate-500 ring-1 ring-slate-200">
                  {requestAdvances.length} de {advances.length}
                </span>
              </div>
              {advances.length === 0 ? (
                <EmptyState title="No hay anticipos registrados" body="Crea el primer anticipo de viaje para iniciar el control administrativo del proyecto." />
              ) : requestAdvances.length === 0 ? (
                <EmptyState
                  title="Sin anticipos encontrados"
                  body={
                    hiddenReconciledAdvancesCount > 0 && !showReconciledAdvances
                      ? `Hay ${hiddenReconciledAdvancesCount} anticipo${hiddenReconciledAdvancesCount === 1 ? '' : 's'} conciliado${hiddenReconciledAdvancesCount === 1 ? '' : 's'} oculto${hiddenReconciledAdvancesCount === 1 ? '' : 's'}. Activa “Mostrar conciliados” para consultarlo${hiddenReconciledAdvancesCount === 1 ? '' : 's'}.`
                      : 'Ajusta la búsqueda o revisa el ID ingresado para consultar la solicitud.'
                  }
                />
              ) : (
                requestAdvances.map((advance) => (
                  <AdvanceCard
                    key={advance.id}
                    advance={advance}
                    canValidate={false}
                    canManage={canManage}
                    canCorrect={requesterMatchesCurrentActor(advance.requesterId, advance.requesterEmail)}
                    onOpenReceipt={() => setSelectedAdvance(advance)}
                    onComplete={() => handleCompleteAdvance(advance)}
                    onApprove={() => openReviewAction({ type: 'approveAdvance', advance })}
                    onReturn={() => openReviewAction({ type: 'returnAdvance', advance })}
                    onReject={() => openReviewAction({ type: 'rejectAdvance', advance })}
                    onDelete={() => openReviewAction({ type: 'deleteAdvance', advance })}
                    onView={() => setViewingAdvance(advance)}
                    onGenerateReport={(scope) => void downloadAdvanceReportOption(advance, scope)}
                  />
                ))
              )}
            </div>
          )}

          {(view === 'approvals' || view === 'payables') && (
            <div className="space-y-4">
              <div className={`rounded-xl border bg-gradient-to-r to-white p-4 shadow-sm ${view === 'approvals' ? 'border-amber-200 from-amber-50' : 'border-violet-200 from-violet-50'}`}>
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <div className={`flex items-center gap-2 ${view === 'approvals' ? 'text-amber-700' : 'text-violet-700'}`}>
                      {view === 'approvals' ? <ClipboardCheck size={20} /> : <WalletCards size={20} />}
                      <h3 className="text-lg font-black">{view === 'approvals' ? 'Anticipos por aprobar' : 'Anticipos por pagar'}</h3>
                    </div>
                    <p className="mt-1 text-sm font-medium text-slate-600">
                      {view === 'approvals'
                        ? 'Revisa la ficha, los ítems y la firma del solicitante para aprobar, devolver o rechazar la solicitud.'
                        : 'Gestiona únicamente anticipos aprobados: registra el soporte de pago o devuelve la solicitud para corrección.'}
                    </p>
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    {view === 'payables' && (
                      <button
                        type="button"
                        aria-pressed={showPaidAdvances}
                        onClick={() => setShowPaidAdvances((current) => !current)}
                        className={`inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-lg px-3 text-xs font-black ring-1 transition ${showPaidAdvances ? 'bg-sky-600 text-white ring-sky-600' : 'bg-white text-slate-600 ring-slate-200 hover:bg-slate-50'}`}
                      >
                        {showPaidAdvances ? <EyeOff size={15} /> : <Eye size={15} />}
                        {showPaidAdvances ? 'Ocultar pagados' : `Mostrar pagados${hiddenPaidAdvancesCount ? ` (${hiddenPaidAdvancesCount})` : ''}`}
                      </button>
                    )}
                    <div className="relative min-w-0 lg:w-80">
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      <input className={`${inputClass} pl-10`} value={advanceSearch} onChange={(event) => setAdvanceSearch(event.target.value)} placeholder={view === 'approvals' ? 'Buscar solicitud por ID, persona o destino...' : 'Buscar por ID, persona o destino...'} />
                    </div>
                  </div>
                </div>
              </div>
              {administrativeQueueAdvances.length === 0 ? (
                view === 'approvals' ? (
                  <EmptyState title="No hay anticipos por aprobar" body="Las solicitudes nuevas o devueltas para corrección aparecerán en esta bandeja." />
                ) : (
                  <EmptyState title="No hay anticipos pendientes de pago" body={hiddenPaidAdvancesCount > 0 && !showPaidAdvances ? `Hay ${hiddenPaidAdvancesCount} anticipo${hiddenPaidAdvancesCount === 1 ? '' : 's'} pagado${hiddenPaidAdvancesCount === 1 ? '' : 's'} oculto${hiddenPaidAdvancesCount === 1 ? '' : 's'}. Activa “Mostrar pagados” para consultarlos.` : 'Los anticipos aparecerán aquí después de ser aprobados y firmados.'} />
                )
              ) : administrativeQueueAdvances.map((advance) => {
                const status = statusConfig[advance.status] || statusConfig.submitted;
                const canCorrect = requesterMatchesCurrentActor(advance.requesterId, advance.requesterEmail);
                return (
                  <section key={advance.id} className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                    <div className="flex flex-col gap-4 border-b border-slate-200 bg-slate-50 p-4 xl:flex-row xl:items-start xl:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`rounded-md px-2 py-1 text-[10px] font-black uppercase tracking-[0.12em] ring-1 ${status.className}`}>{status.label}</span>
                          <span className="rounded-md bg-slate-900 px-2 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-white">{advance.customId || advance.id.slice(0, 8)}</span>
                        </div>
                        <h4 className="mt-2 text-lg font-black text-slate-950">{advance.purpose || advance.destination}</h4>
                        <p className="mt-1 text-sm font-semibold text-slate-500">{advance.requesterName} · {advance.requesterEmail || 'Sin correo'} · {advance.destination}</p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button type="button" size="sm" variant="outline" onClick={() => setViewingAdvance(advance)}><FileText size={14} className="mr-2" />Ver anticipo</Button>
                        <AdvanceReportMenu
                          advance={advance}
                          onSelect={(scope) => void downloadAdvanceReportOption(advance, scope)}
                        />
                        {(canManage || canValidate) && ['submitted', 'pending_payment', 'paid'].includes(advance.status) && (
                          <Button type="button" size="sm" variant="outline" onClick={() => openAdvanceEditor(advance)} className="border-indigo-200 text-indigo-700 hover:bg-indigo-50"><PencilLine size={14} className="mr-2" />Editar</Button>
                        )}
                        {advance.status === 'submitted' && canValidate && <>
                          <Button type="button" size="sm" onClick={() => openReviewAction({ type: 'approveAdvance', advance })} className="bg-emerald-600 text-white hover:bg-emerald-700"><CheckCircle2 size={14} className="mr-2" />Aprobar y firmar</Button>
                          <Button type="button" size="sm" variant="outline" onClick={() => openReviewAction({ type: 'returnAdvance', advance })} className="border-orange-200 text-orange-700"><RotateCcw size={14} className="mr-2" />Devolver</Button>
                          <Button type="button" size="sm" variant="outline" onClick={() => openReviewAction({ type: 'rejectAdvance', advance })} className="border-rose-200 text-rose-700">Rechazar</Button>
                        </>}
                        {advance.status === 'pending_payment' && canValidate && <>
                          <Button type="button" size="sm" onClick={() => openAdvancePayment(advance)} className="bg-violet-600 text-white hover:bg-violet-700"><CreditCard size={14} className="mr-2" />Registrar pago</Button>
                          <Button type="button" size="sm" variant="outline" onClick={() => openReviewAction({ type: 'returnAdvance', advance })} className="border-orange-200 text-orange-700"><RotateCcw size={14} className="mr-2" />Devolver</Button>
                        </>}
                        {advance.status === 'returned' && canCorrect && <Button type="button" size="sm" onClick={() => openAdvanceEditor(advance)} className="bg-orange-600 text-white hover:bg-orange-700"><PencilLine size={14} className="mr-2" />Corregir y reenviar</Button>}
                        {advance.status === 'paid' && canManage && <Button type="button" size="sm" onClick={() => setSelectedAdvance(advance)} className="bg-sky-600 text-white hover:bg-sky-700"><ReceiptText size={14} className="mr-2" />Legalizar</Button>}
                      </div>
                    </div>
                    <AdvanceLifecycle advance={advance} compact />
                    <div className="grid gap-2 border-t border-slate-100 p-3 sm:grid-cols-2 xl:grid-cols-5">
                      <ReceiptGroupMetric label="Solicitado" value={formatMoney(advance.amountRequested)} tone="slate" />
                      <ReceiptGroupMetric label="Ítems" value={`${advance.items?.length || 0}`} tone="slate" />
                      <ReceiptGroupMetric label="Firma solicitante" value={advance.requesterSignature ? 'Verificada' : 'Pendiente'} tone={advance.requesterSignature ? 'emerald' : 'amber'} />
                      <ReceiptGroupMetric label="Firma aprobador" value={advance.approvalSignature ? 'Verificada' : 'Pendiente'} tone={advance.approvalSignature ? 'emerald' : 'amber'} />
                      <div className={`rounded-lg border px-3 py-2 ${advance.paymentSupport ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-violet-200 bg-violet-50 text-violet-800'}`}>
                        <p className="text-[9px] font-black uppercase tracking-[0.16em] opacity-70">Soporte de pago</p>
                        {advance.paymentSupport ? (
                          <SecureDocumentLink storagePath={advance.paymentSupport.storagePath} fallbackUrl={advance.paymentSupport.fileUrl} className="mt-1 inline-flex items-center gap-1 text-sm font-black"><FileText size={13} />{formatMoney(advance.paymentSupport.amount)}</SecureDocumentLink>
                        ) : <p className="mt-1 text-sm font-black">Pendiente</p>}
                      </div>
                    </div>
                    {(advance.adminComment || advance.paymentSupport?.reference) && (
                      <div className="flex flex-wrap gap-x-5 gap-y-1 border-t border-slate-100 bg-slate-50 px-4 py-2 text-xs font-bold text-slate-600">
                        {advance.adminComment && <span><strong className="text-orange-700">Observación:</strong> {advance.adminComment}</span>}
                        {advance.paymentSupport?.reference && <span><strong className="text-emerald-700">Referencia:</strong> {advance.paymentSupport.reference}</span>}
                      </div>
                    )}
                  </section>
                );
              })}
            </div>
          )}

          {view === 'receipts' && (
            <div className="space-y-4">
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div><h3 className="text-lg font-black text-slate-950">Legalizaciones agrupadas por anticipo</h3><p className="text-sm font-medium text-slate-500">Revisa el saldo de cada solicitud, sus soportes, devoluciones y subsanaciones en un solo lugar.</p></div>
                  <div className="relative min-w-0 lg:w-96">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input className={`${inputClass} pl-10`} value={advanceSearch} onChange={(event) => setAdvanceSearch(event.target.value)} placeholder="Buscar legalización por ID del anticipo..." />
                  </div>
                </div>
              </div>
              {receiptGroups.length === 0 ? (
                <EmptyState
                  title={advanceSearch.trim() ? 'No se encontró ese ID de anticipo' : 'Sin soportes cargados'}
                  body={advanceSearch.trim() ? 'Verifica el ID administrativo o el identificador interno e intenta nuevamente.' : 'Los comprobantes de campo aparecerán aquí cuando se legalice un anticipo.'}
                />
              ) : (
                receiptGroups.map((group) => {
                  const isExpanded = expandedReceiptGroups[group.advance.id] ?? false;
                  const advanceStatus = statusConfig[group.advance.status] || statusConfig.submitted;
                  const hasReturned = group.returnedCount > 0;
                  const hasDuplicates = group.duplicateCount > 0;
                  const isCompleted = group.advance.status === 'completed' || group.advance.status === 'closed';

                  return (
                    <section
                      key={group.advance.id}
                      className={`overflow-hidden rounded-xl border bg-white shadow-sm transition ${
                        isCompleted
                          ? 'border-emerald-200 ring-2 ring-emerald-50'
                          : hasReturned
                            ? 'border-rose-200 ring-2 ring-rose-50'
                            : hasDuplicates
                              ? 'border-amber-200 ring-2 ring-amber-50'
                              : 'border-slate-200'
                      }`}
                    >
                      <div className="border-b border-slate-200 bg-slate-50 p-4 transition hover:bg-slate-100">
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedReceiptGroups((current) => ({
                              ...current,
                              [group.advance.id]: !isExpanded,
                            }))
                          }
                          className="block w-full text-left"
                        >
                          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_repeat(5,minmax(120px,auto))] xl:items-center">
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-white text-slate-500 ring-1 ring-slate-200">
                                  {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                                </span>
                                <span className="rounded-md bg-indigo-600 px-2 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-white">Anticipo</span>
                                <span className={`rounded-md px-2 py-1 text-[10px] font-black uppercase tracking-[0.12em] ring-1 ${advanceStatus.className}`}>
                                  {advanceStatus.label}
                                </span>
                                {group.advance.customId ? (
                                  <span className="rounded-md bg-violet-50 px-2 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-violet-700 ring-1 ring-violet-100">
                                    ID {group.advance.customId}
                                  </span>
                                ) : (
                                  <span className="text-xs font-black text-slate-400">{group.advance.id}</span>
                                )}
                                {group.pendingCount > 0 && (
                                  <span className="rounded-md bg-amber-50 px-2 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-amber-700 ring-1 ring-amber-100">
                                    {group.pendingCount} por revisar
                                  </span>
                                )}
                                {hasReturned && (
                                  <span className="rounded-md bg-rose-100 px-2 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-rose-700 ring-1 ring-rose-200">
                                    {group.returnedCount} devuelto{group.returnedCount === 1 ? '' : 's'}
                                  </span>
                                )}
                                {hasDuplicates && (
                                  <span className="rounded-md bg-red-100 px-2 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-red-700 ring-1 ring-red-200">
                                    {group.duplicateCount} duplicado{group.duplicateCount === 1 ? '' : 's'}
                                  </span>
                                )}
                              </div>
                              <h4 className="mt-2 truncate text-base font-black text-slate-950">{group.advance.purpose || group.advance.destination}</h4>
                              <p className="mt-1 text-xs font-bold text-slate-500">
                                {group.advance.requesterName} · {group.advance.destination} · {group.receipts.length} soportes
                              </p>
                            </div>
                            <ReceiptGroupMetric label="Anticipado" value={formatMoney(group.approved)} tone="slate" />
                            <ReceiptGroupMetric label="Justificado" value={formatMoney(group.justified)} tone="indigo" />
                            <ReceiptGroupMetric label="Legalizado" value={formatMoney(group.legalized)} tone="emerald" />
                            <ReceiptGroupMetric label="En revisión" value={formatMoney(group.pending)} tone="amber" />
                            <ReceiptGroupMetric
                              label={group.difference < 0 ? 'Por compensar' : group.difference > 0 ? 'Por devolver o justificar' : 'Saldo'}
                              value={formatMoney(Math.abs(group.difference))}
                              tone={group.difference < 0 ? 'rose' : group.difference > 0 ? 'amber' : 'emerald'}
                            />
                          </div>
                          <div className="mt-3 flex items-center gap-3">
                            <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-200">
                              <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${group.progress}%` }} />
                            </div>
                            <span className="text-xs font-black text-slate-500">{group.progress}% justificado</span>
                            {group.returned > 0 && (
                              <span className="rounded-md bg-rose-100 px-2 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-rose-700 ring-1 ring-rose-200">
                                {formatMoney(group.returned)} devuelto
                              </span>
                            )}
                          </div>
                        </button>
                        {(canManage || canValidate) && (
                          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-200/70 pt-3">
                            <p className="text-xs font-bold text-slate-500">
                              Edición administrativa disponible sin alterar soportes ni legalizaciones.
                            </p>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => openAdvanceEditor(group.advance)}
                              className="border-indigo-200 text-indigo-700 hover:bg-indigo-50"
                            >
                              <PencilLine size={14} className="mr-2" />
                              Editar anticipo
                            </Button>
                          </div>
                        )}
                      </div>

                      <AdvanceLifecycle advance={group.advance} compact />

                      {isExpanded && (
                        <div className="divide-y divide-slate-100">
                          {group.receipts.map((receipt) => {
                            const documentMeta = getReceiptDocumentTypeMeta(receipt.documentType);
                            const statusMeta = getReceiptStatusMeta(receipt.status);
                            const isReturned = receipt.status === 'returned';
                            const duplicateUsage = findDuplicateReceiptUsage(receipt, group.advance.id);
                            return (
                              <div
                                key={receipt.id}
                                className={`grid gap-3 p-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center ${
                                  isReturned ? 'border-l-4 border-rose-500 bg-rose-50/80' : duplicateUsage ? 'border-l-4 border-red-500 bg-red-50/70' : ''
                                }`}
                              >
                                <div className="min-w-0">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="text-sm font-black text-slate-950">{receipt.categoryName}</span>
                                    <span className={`rounded-md px-2 py-1 text-[10px] font-black uppercase tracking-[0.12em] ring-1 ${documentMeta.className}`}>
                                      {documentMeta.shortLabel}
                                    </span>
                                    <span className={`rounded-md px-2 py-1 text-[10px] font-black uppercase tracking-[0.12em] ring-1 ${statusMeta.className}`}>
                                      {statusMeta.label}
                                    </span>
                                    <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-black text-slate-700">{formatMoney(receipt.amount)}</span>
                                    {duplicateUsage && (
                                      <span className="rounded-md bg-red-100 px-2 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-red-700 ring-1 ring-red-200">
                                        Factura repetida
                                      </span>
                                    )}
                                    {receipt.dianVerificationStatus === 'confirmed' && (
                                      <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-emerald-700 ring-1 ring-emerald-200">
                                        <ShieldCheck size={12} /> CUFE confirmado
                                      </span>
                                    )}
                                  </div>
                                  <p className="mt-1 text-sm font-semibold text-slate-600">{receipt.businessName || 'Sin razón social'} · {formatDate(receipt.date)}</p>
                                  <p className="mt-1 break-words text-xs font-semibold text-slate-400">
                                    {receipt.invoiceNumber ? `${documentMeta.numberLabel} ${receipt.invoiceNumber}` : documentMeta.label}
                                    {receipt.cufe ? ` · CUFE ${receipt.cufe}` : ''}
                                    {receipt.revisionCount ? ` · ${receipt.revisionCount} subsanación${receipt.revisionCount === 1 ? '' : 'es'}` : ''}
                                  </p>
                                  {duplicateUsage && (
                                    <div className="mt-3 rounded-lg border border-red-200 bg-white px-3 py-2 text-xs font-bold text-red-700">
                                      Este soporte coincide con &quot;{duplicateUsage.advanceTitle}&quot; de {duplicateUsage.requesterName}.
                                    </div>
                                  )}
                                  {isReturned && receipt.reviewComment && (
                                    <div className="mt-3 rounded-lg border border-rose-200 bg-white px-3 py-2 text-xs font-bold text-rose-700">
                                      <span className="font-black">Corrección solicitada:</span> {receipt.reviewComment}
                                    </div>
                                  )}
                                  {receipt.status === 'approved_modified' && (receipt.approvalChanges || []).length > 0 && (
                                    <p className="mt-2 text-xs font-bold text-indigo-600">Aprobado con {(receipt.approvalChanges || []).length} ajuste(s) administrativo(s) registrados.</p>
                                  )}
                                  <div className="mt-3 flex flex-wrap gap-3">
                                    {(receipt.fileUrl || receipt.storagePath) && (
                                      <SecureDocumentLink storagePath={receipt.storagePath} fallbackUrl={receipt.fileUrl} className="inline-flex items-center gap-1 text-xs font-black text-indigo-600 hover:text-indigo-800">
                                        <FileImage size={14} /> Ver soporte
                                      </SecureDocumentLink>
                                    )}
                                    {receipt.dianDocumentUrl && (
                                      <a href={receipt.dianDocumentUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-black text-sky-700 hover:text-sky-900">
                                        <ExternalLink size={14} /> Consultar en DIAN
                                      </a>
                                    )}
                                  </div>
                                </div>

                                <div className="flex flex-wrap justify-end gap-2">
                                  {canValidate && receipt.status === 'submitted' && (
                                    <>
                                      <Button type="button" size="sm" onClick={() => openReceiptEditor('review', group.advance, receipt)} className="bg-emerald-600 text-white hover:bg-emerald-700">
                                        <PencilLine size={14} className="mr-1" /> Revisar y aprobar
                                      </Button>
                                      <Button type="button" size="sm" variant="outline" onClick={() => openReviewAction({ type: 'returnReceipt', advance: group.advance, receipt })} className="border-rose-200 text-rose-700 hover:bg-rose-50">
                                        Devolver
                                      </Button>
                                    </>
                                  )}
                                  {isReturned && canCorrectAdvanceReceipt(group.advance) && (
                                    <Button type="button" size="sm" onClick={() => openReceiptEditor('correction', group.advance, receipt)} className="bg-rose-600 text-white hover:bg-rose-700">
                                      <RotateCcw size={14} className="mr-1" /> Subsanar y reenviar
                                    </Button>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </section>
                  );
                })
              )}
            </div>
          )}

          {view === 'conciliation' && (
            <div className="space-y-4">
              <div className="rounded-xl border border-cyan-200 bg-gradient-to-r from-cyan-50 to-white p-4 shadow-sm">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <div className="flex items-center gap-2 text-cyan-800"><RefreshCw size={20} /><h3 className="text-lg font-black">Conciliación de anticipos</h3></div>
                    <p className="mt-1 text-sm font-medium text-slate-600">Compara lo anticipado, justificado y legalizado. El expediente solo se cierra con devolución o compensación soportada cuando exista diferencia.</p>
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <button
                      type="button"
                      aria-pressed={showReconciledAdvances}
                      onClick={() => setShowReconciledAdvances((current) => !current)}
                      className={`inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-lg px-3 text-xs font-black ring-1 transition ${
                        showReconciledAdvances
                          ? 'bg-teal-600 text-white ring-teal-600'
                          : 'bg-white text-slate-600 ring-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      {showReconciledAdvances ? <EyeOff size={15} /> : <Eye size={15} />}
                      {showReconciledAdvances
                        ? 'Ocultar conciliados'
                        : `Mostrar conciliados${hiddenReconciledAdvancesCount ? ` (${hiddenReconciledAdvancesCount})` : ''}`}
                    </button>
                    <div className="relative min-w-0 lg:w-80">
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      <input className={`${inputClass} pl-10`} value={advanceSearch} onChange={(event) => setAdvanceSearch(event.target.value)} placeholder="Buscar conciliación por ID, persona o destino..." />
                    </div>
                  </div>
                </div>
              </div>
              {visibleReconciliationAdvances.length === 0 ? (
                <EmptyState
                  title={advanceSearch.trim() ? 'No se encontró esa conciliación' : 'Sin anticipos pendientes de conciliación'}
                  body={
                    hiddenReconciledAdvancesCount > 0 && !showReconciledAdvances
                      ? 'Los anticipos ya conciliados están ocultos. Puedes consultarlos en Costos reales o activar “Mostrar conciliados”.'
                      : 'Aparecerán aquí cuando el profesional cierre su justificación y todos los soportes entren a revisión.'
                  }
                />
              ) : visibleReconciliationAdvances.map((item) => {
                const { advance } = item;
                const hasOpenReceipts = (advance.receipts || []).some((receipt) => !isApprovedReceipt(receipt));
                const requiredKind = item.returnRequired > 0 ? 'return' : item.compensationRequired > 0 ? 'compensation' : 'exact';
                const requiredSupport = requiredKind === 'return' ? advance.returnSupport : requiredKind === 'compensation' ? advance.compensationSupport : null;
                const requiredAmount = requiredKind === 'return' ? item.returnRequired : requiredKind === 'compensation' ? item.compensationRequired : 0;
                const supportMatches = requiredKind === 'exact' || Boolean(requiredSupport && Math.abs(asNumber(requiredSupport.amount) - requiredAmount) < 0.01);
                const isReconciled = advance.reconciliationStatus === 'reconciled';
                return (
                  <section key={advance.id} className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                    <div className="flex flex-col gap-3 border-b border-slate-100 bg-slate-50 p-4 lg:flex-row lg:items-center lg:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`rounded-md px-2 py-1 text-[10px] font-black uppercase tracking-[0.14em] ring-1 ${isReconciled ? 'bg-emerald-50 text-emerald-700 ring-emerald-100' : hasOpenReceipts ? 'bg-amber-50 text-amber-700 ring-amber-100' : 'bg-cyan-50 text-cyan-700 ring-cyan-100'}`}>
                            {isReconciled ? 'Conciliado' : hasOpenReceipts ? 'Pendiente de validación' : requiredKind === 'return' ? 'Requiere devolución' : requiredKind === 'compensation' ? 'Requiere compensación' : 'Listo para cerrar'}
                          </span>
                          {advance.customId && <span className="rounded-md bg-slate-900 px-2 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-white">ID {advance.customId}</span>}
                        </div>
                        <h4 className="mt-2 truncate text-base font-black text-slate-950">{advance.purpose || advance.destination}</h4>
                        <p className="mt-1 text-xs font-bold text-slate-500">{advance.requesterName} · {advance.destination}</p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button type="button" size="sm" variant="outline" onClick={() => setViewingAdvance(advance)}><FileText size={14} className="mr-2" />Ver anticipo</Button>
                        <AdvanceReportMenu
                          advance={advance}
                          onSelect={(scope) => void downloadAdvanceReportOption(advance, scope)}
                        />
                        {!isReconciled && !hasOpenReceipts && requiredKind === 'return' && !supportMatches && (canCorrectAdvanceReceipt(advance) || canManage || canValidate) && (
                          <Button type="button" size="sm" onClick={() => openReconciliationSupport(advance)} className="bg-amber-600 text-white hover:bg-amber-700"><Upload size={14} className="mr-2" />{requiredSupport ? 'Actualizar devolución' : 'Cargar devolución'}</Button>
                        )}
                        {!isReconciled && !hasOpenReceipts && requiredKind === 'compensation' && !supportMatches && canValidate && (
                          <Button type="button" size="sm" onClick={() => openReconciliationSupport(advance)} className="bg-violet-600 text-white hover:bg-violet-700"><Upload size={14} className="mr-2" />{requiredSupport ? 'Actualizar compensación' : 'Cargar compensación'}</Button>
                        )}
                        {!isReconciled && !hasOpenReceipts && supportMatches && canValidate && (
                          <Button type="button" size="sm" onClick={() => void handleFinalizeReconciliation(advance)} disabled={submitting} className="bg-emerald-600 text-white hover:bg-emerald-700"><CheckCircle2 size={14} className="mr-2" />Conciliar y cerrar</Button>
                        )}
                      </div>
                    </div>
                    <AdvanceLifecycle advance={advance} compact />
                    <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-5">
                      <ReceiptGroupMetric label="Anticipado" value={formatMoney(item.anticipated)} tone="slate" />
                      <ReceiptGroupMetric label="Justificado" value={formatMoney(item.justified)} tone="indigo" />
                      <ReceiptGroupMetric label="Legalizado" value={formatMoney(item.legalized)} tone="emerald" />
                      <ReceiptGroupMetric label={requiredKind === 'compensation' ? 'Por compensar' : 'Por devolver'} value={formatMoney(requiredKind === 'compensation' ? item.compensationRequired : item.returnRequired)} tone="amber" />
                      <ReceiptGroupMetric label="Soportes" value={`${(advance.receipts || []).length}`} tone="slate" />
                    </div>
                    {requiredSupport && (
                      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 bg-slate-50 px-4 py-3 text-xs font-bold text-slate-600">
                        <span>{requiredKind === 'return' ? 'Devolución' : 'Compensación'}: {formatMoney(requiredSupport.amount)} · {formatDate(requiredSupport.date)}{requiredSupport.reference ? ` · Ref. ${requiredSupport.reference}` : ''}</span>
                        <SecureDocumentLink storagePath={requiredSupport.storagePath} fallbackUrl={requiredSupport.fileUrl} className="inline-flex items-center gap-2 font-black text-indigo-700"><FileText size={14} />Ver soporte</SecureDocumentLink>
                      </div>
                    )}
                  </section>
                );
              })}
            </div>
          )}

          {view === 'payments' && (
            <div className="space-y-4">
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div><h3 className="text-lg font-black text-slate-950">Costos reales por anticipo conciliado</h3><p className="text-sm font-medium text-slate-500">Cada expediente cerrado agrupa soportes validados, devolución o compensación, centros de costo y el informe final.</p></div>
                  <div className="relative min-w-0 lg:w-96">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input className={`${inputClass} pl-10`} value={advanceSearch} onChange={(event) => setAdvanceSearch(event.target.value)} placeholder="Buscar costo real por ID del anticipo..." />
                  </div>
                </div>
              </div>
              {realCostAdvanceGroups.length === 0 ? (
                <EmptyState
                  title={advanceSearch.trim() ? 'No se encontró ese ID de anticipo' : 'Sin anticipos finalizados'}
                  body={advanceSearch.trim() ? 'Verifica el ID administrativo o el identificador interno e intenta nuevamente.' : 'Los costos reales aparecerán únicamente después de cerrar la conciliación administrativa.'}
                />
              ) : (
                realCostAdvanceGroups.map((group) => {
                  const statusMeta = statusConfig[group.advance.status] || statusConfig.closed;
                  const attachedSupportCount = group.receipts.filter(
                    (receipt) => Boolean(receipt.storagePath || receipt.fileUrl)
                  ).length;
                  return (
                    <section key={group.advance.id} className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                      <div className="grid gap-4 border-b border-slate-100 bg-slate-50 p-4 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-center">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="rounded-md bg-slate-900 px-2 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-white">
                              Costo real
                            </span>
                            <span className={`rounded-md px-2 py-1 text-[10px] font-black uppercase tracking-[0.12em] ring-1 ${statusMeta.className}`}>
                              {statusMeta.label}
                            </span>
                            {group.advance.customId && (
                              <span className="rounded-md bg-violet-50 px-2 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-violet-700 ring-1 ring-violet-100">
                                ID {group.advance.customId}
                              </span>
                            )}
                            <span className="rounded-md bg-slate-100 px-2 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-slate-600 ring-1 ring-slate-200">
                              {group.receipts.length} legalización{group.receipts.length === 1 ? '' : 'es'} aprobada{group.receipts.length === 1 ? '' : 's'}
                            </span>
                            <span className="rounded-md bg-indigo-50 px-2 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-indigo-700 ring-1 ring-indigo-100">
                              {attachedSupportCount} soporte{attachedSupportCount === 1 ? '' : 's'} adjunto{attachedSupportCount === 1 ? '' : 's'}
                            </span>
                          </div>
                          <h4 className="mt-2 truncate text-base font-black text-slate-950">{group.advance.purpose || group.advance.destination}</h4>
                          <p className="mt-1 text-xs font-bold text-slate-500">
                            {group.advance.requesterName} · {group.advance.destination} · cerrado {formatDate(group.advance.closedAt || group.advance.updatedAt)}
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Button type="button" variant="outline" onClick={() => setViewingAdvance(group.advance)}>
                            <FileText size={16} className="mr-2" />
                            Ver anticipo
                          </Button>
                          <AdvanceReportMenu
                            advance={group.advance}
                            onSelect={(scope) => void downloadAdvanceReportOption(group.advance, scope, group.realCost)}
                            dark
                          />
                        </div>
                      </div>

                      <AdvanceLifecycle advance={group.advance} compact />

                      <div className="grid gap-3 p-4 md:grid-cols-3 xl:grid-cols-7">
                        <ReceiptGroupMetric label="Anticipado" value={formatMoney(group.coverage.approved)} tone="slate" />
                        <ReceiptGroupMetric label="Justificado" value={formatMoney(getAdvanceJustifiedAmount(group.advance))} tone="indigo" />
                        <ReceiptGroupMetric label="Legalizado" value={formatMoney(group.coverage.legalized)} tone="emerald" />
                        <ReceiptGroupMetric label="Devuelto" value={formatMoney(group.coverage.returnedCash)} tone="amber" />
                        <ReceiptGroupMetric label="Compensado" value={formatMoney(group.advance.amountCompensated)} tone="indigo" />
                        <ReceiptGroupMetric label="Costo real" value={formatMoney(group.realCost)} tone="slate" />
                        <ReceiptGroupMetric label="Soportes adjuntos" value={`${attachedSupportCount}`} tone="slate" />
                      </div>

                      <div className="grid gap-4 border-t border-slate-100 p-4 lg:grid-cols-[0.9fr_1.4fr]">
                        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                          <p className="text-[11px] font-black uppercase tracking-[0.22em] text-slate-500">Centros de costo</p>
                          <div className="mt-3 space-y-2">
                            {group.costCenters.map((center) => (
                              <div key={center.id} className="rounded-lg bg-white px-3 py-2 ring-1 ring-slate-200">
                                <div className="flex items-center justify-between gap-2">
                                  <span className="truncate text-sm font-black text-slate-900">{center.name}</span>
                                  <span className="text-xs font-black text-indigo-600">{center.percentage}%</span>
                                </div>
                                <p className="mt-1 text-xs font-bold text-slate-500">
                                  {formatMoney(center.amount)}
                                  {center.note ? ` · ${center.note}` : ''}
                                </p>
                              </div>
                            ))}
                          </div>
                        </div>

                        <div className="rounded-xl border border-slate-200 bg-white">
                          <div className="border-b border-slate-100 px-3 py-2">
                            <p className="text-[11px] font-black uppercase tracking-[0.22em] text-slate-500">Ficha técnica de legalizaciones</p>
                          </div>
                          <div className="divide-y divide-slate-100">
                            {group.receipts.length === 0 ? (
                              <div className="p-3 text-sm font-bold text-slate-500">Sin soportes aprobados.</div>
                            ) : (
                              group.receipts.map((receipt) => {
                                const documentMeta = getReceiptDocumentTypeMeta(receipt.documentType);
                                return (
                                  <div key={receipt.id} className="grid gap-3 p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                                    <div className="min-w-0">
                                      <div className="flex flex-wrap items-center gap-2">
                                        <span className="text-sm font-black text-slate-950">{receipt.categoryName}</span>
                                        <span className={`rounded-md px-2 py-1 text-[10px] font-black uppercase tracking-[0.12em] ring-1 ${documentMeta.className}`}>
                                          {documentMeta.shortLabel}
                                        </span>
                                        <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-black text-slate-700">
                                          {formatMoney(receipt.amount)}
                                        </span>
                                      </div>
                                      <p className="mt-1 truncate text-xs font-bold text-slate-500">
                                        {receipt.businessName || 'Sin razón social'} · {formatDate(receipt.date)}
                                      </p>
                                      <p className="mt-1 break-words text-[11px] font-semibold text-slate-400">
                                        {receipt.invoiceNumber ? `${documentMeta.numberLabel} ${receipt.invoiceNumber}` : documentMeta.label}
                                        {receipt.cufe ? ` · CUFE ${receipt.cufe}` : ''}
                                      </p>
                                    </div>
                                    {(receipt.fileUrl || receipt.storagePath) && (
                                      <SecureDocumentLink
                                        storagePath={receipt.storagePath}
                                        fallbackUrl={receipt.fileUrl}
                                        className="inline-flex items-center justify-center gap-1 rounded-lg border border-indigo-100 px-3 py-2 text-xs font-black text-indigo-600 hover:bg-indigo-50"
                                      >
                                        <FileImage size={14} />
                                        Soporte
                                      </SecureDocumentLink>
                                    )}
                                  </div>
                                );
                              })
                            )}
                          </div>
                        </div>
                      </div>
                    </section>
                  );
                })
              )}
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
              <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
                <div className="border-b border-slate-100 p-4">
                  <h3 className="flex items-center gap-2 text-lg font-black text-slate-950">
                    <FolderKanban size={18} className="text-emerald-600" />
                    Centros de costos
                  </h3>
                  <p className="text-sm font-medium text-slate-500">
                    Catálogo configurable para clasificar y distribuir los anticipos del proyecto.
                  </p>
                </div>
                <div className="divide-y divide-slate-100">
                  {(costCenterDomains.length > 0 ? costCenterDomains : costCenterOptions).map((center) => (
                    <div key={center.id} className="grid gap-3 p-4 sm:grid-cols-[1fr_auto] sm:items-center">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-black text-slate-950">{center.name}</p>
                          {center.code && (
                            <span className="rounded-md bg-emerald-50 px-2 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-emerald-700 ring-1 ring-emerald-100">
                              {center.code}
                            </span>
                          )}
                          {center.active === false && (
                            <span className="rounded-md bg-slate-100 px-2 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">
                              Inactivo
                            </span>
                          )}
                        </div>
                        {center.description && (
                          <p className="mt-1 text-xs font-medium text-slate-400">{center.description}</p>
                        )}
                      </div>
                      {canConfigure && !center.id.startsWith('default-cost-center-') && (
                        <div className="flex gap-2">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              setCostCenterForm({
                                id: center.id,
                                name: center.name,
                                code: center.code || '',
                                description: center.description || '',
                              })
                            }
                          >
                            Editar
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => toggleCostCenter(center)}
                            className={center.active === false ? 'border-emerald-200 text-emerald-700' : 'border-rose-200 text-rose-700'}
                          >
                            {center.active === false ? 'Activar' : 'Desactivar'}
                          </Button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <h3 className="text-base font-black text-slate-950">
                  {costCenterForm.id ? 'Editar centro de costos' : 'Nuevo centro de costos'}
                </h3>
                <div className="mt-4 space-y-3">
                  <Field label="Nombre">
                    <input
                      className={inputClass}
                      value={costCenterForm.name}
                      onChange={(event) => setCostCenterForm((current) => ({ ...current, name: event.target.value }))}
                      placeholder="Ej: Operación de campo"
                    />
                  </Field>
                  <Field label="Código (opcional)">
                    <input
                      className={inputClass}
                      value={costCenterForm.code}
                      maxLength={30}
                      onChange={(event) => setCostCenterForm((current) => ({ ...current, code: event.target.value }))}
                      placeholder="Ej: CC-001"
                    />
                  </Field>
                  <Field label="Descripción">
                    <textarea
                      className={textareaClass}
                      value={costCenterForm.description}
                      onChange={(event) => setCostCenterForm((current) => ({ ...current, description: event.target.value }))}
                      placeholder="Uso previsto de este centro de costos."
                    />
                  </Field>
                  <Button
                    type="button"
                    onClick={saveCostCenter}
                    disabled={submitting || !canConfigure}
                    className="w-full bg-emerald-600 font-bold text-white hover:bg-emerald-700"
                  >
                    {submitting && <Loader2 size={16} className="mr-2 animate-spin" />}
                    Guardar centro de costos
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
                <Field label="ID del anticipo (opcional)">
                  <input
                    className={inputClass}
                    value={advanceForm.customId}
                    maxLength={80}
                    onChange={(event) => setAdvanceForm((current) => ({ ...current, customId: event.target.value }))}
                    placeholder="Ej: ANT-VIAJE-001"
                  />
                </Field>
                <Field label="Solicitante">
                  <select className={`${inputClass} bg-slate-50`} value={advanceForm.requesterId} disabled>
                    {currentSignerMember ? <option value={currentSignerMember.id}>{getMemberLabel(currentSignerMember)}</option> : currentUser ? <option value={currentUser.uid}>{getCurrentUserName(currentUser)}</option> : <option value="">Sin usuario</option>}
                  </select>
                </Field>
                <div className="md:col-span-2">
                  <Field label="Centro de costos">
                    <select
                      className={inputClass}
                      value={advanceForm.costCenterId}
                      onChange={(event) => setAdvanceForm((current) => ({ ...current, costCenterId: event.target.value }))}
                    >
                      <option value="">Selecciona centro de costos</option>
                      {costCenterOptions.map((center) => (
                        <option key={center.id} value={center.id}>
                          {center.code ? `${center.code} · ` : ''}{center.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>
                <div className="md:col-span-2">
                  <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Tareas relacionadas</span>
                    <span className="rounded-full bg-indigo-50 px-2.5 py-1 text-[11px] font-black text-indigo-700 ring-1 ring-indigo-100">
                      {selectedAdvanceTasks.length} seleccionada{selectedAdvanceTasks.length === 1 ? '' : 's'}
                    </span>
                  </div>
                  <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50/70 shadow-sm">
                    <div className="grid gap-2 border-b border-slate-200 bg-white p-3 lg:grid-cols-[minmax(0,1fr)_180px_210px]">
                      <div className="flex min-h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 transition focus-within:border-indigo-400 focus-within:ring-2 focus-within:ring-indigo-500/10">
                        <Search size={16} className="shrink-0 text-slate-400" />
                        <input
                          type="search"
                          value={advanceTaskSearch}
                          onChange={(event) => setAdvanceTaskSearch(event.target.value)}
                          placeholder="Buscar por tarea, código o descripción..."
                          className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-slate-800 outline-none placeholder:text-slate-400"
                        />
                        {advanceTaskSearch && (
                          <button
                            type="button"
                            onClick={() => setAdvanceTaskSearch('')}
                            className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                            aria-label="Limpiar búsqueda de tareas"
                          >
                            <X size={14} />
                          </button>
                        )}
                      </div>
                      <select
                        value={advanceTaskStatusFilter}
                        onChange={(event) => setAdvanceTaskStatusFilter(event.target.value as AdvanceTaskStatusFilter)}
                        className={inputClass}
                        aria-label="Filtrar tareas por estado"
                      >
                        <option value="active">Tareas activas</option>
                        <option value="pending">Pendientes</option>
                        <option value="in_progress">En curso</option>
                        <option value="blocked">Pausadas o bloqueadas</option>
                        <option value="completed">Finalizadas</option>
                        <option value="all">Todos los estados</option>
                      </select>
                      <select
                        value={advanceTaskGroupFilter}
                        onChange={(event) => setAdvanceTaskGroupFilter(event.target.value)}
                        className={inputClass}
                        aria-label="Filtrar tareas por grupo"
                      >
                        <option value="all">Todos los grupos</option>
                        {advanceTaskGroups.map((group) => (
                          <option key={group.id} value={group.id}>{group.name}</option>
                        ))}
                      </select>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-3 py-2">
                      <p className="text-[11px] font-bold text-slate-500">
                        {filteredAdvanceTasks.length} resultado{filteredAdvanceTasks.length === 1 ? '' : 's'}
                      </p>
                      <div className="flex items-center gap-2">
                        {filteredAdvanceTasks.length > 0 && (
                          <button
                            type="button"
                            onClick={selectVisibleAdvanceTasks}
                            className="text-[11px] font-black text-indigo-600 hover:text-indigo-800"
                          >
                            Seleccionar resultados
                          </button>
                        )}
                        {selectedAdvanceTasks.length > 0 && (
                          <button
                            type="button"
                            onClick={() => setAdvanceForm((current) => ({ ...current, taskIds: [] }))}
                            className="text-[11px] font-black text-rose-600 hover:text-rose-800"
                          >
                            Quitar todas
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="max-h-64 overflow-y-auto bg-white p-2">
                      {filteredAdvanceTasks.length === 0 ? (
                        <div className="px-4 py-8 text-center">
                          <Search className="mx-auto h-7 w-7 text-slate-300" />
                          <p className="mt-2 text-sm font-black text-slate-600">No encontramos tareas</p>
                          <p className="mt-1 text-xs font-medium text-slate-400">Prueba otro término, estado o grupo.</p>
                        </div>
                      ) : (
                        <div className="space-y-1">
                          {filteredAdvanceTasks.map((task) => {
                            const selected = advanceForm.taskIds.includes(task.id);
                            const group = advanceTaskGroupById.get(getAdvanceTaskGroupId(task));
                            const status = getTaskStatusMeta(task);
                            const parentTask = task.parentTaskId ? taskById.get(task.parentTaskId) : null;

                            return (
                              <label
                                key={task.id}
                                className={`flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 transition ${
                                  selected
                                    ? 'border-indigo-200 bg-indigo-50/70 ring-1 ring-indigo-100'
                                    : 'border-transparent bg-white hover:border-slate-200 hover:bg-slate-50'
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  checked={selected}
                                  onChange={() => toggleAdvanceTask(task.id)}
                                  className="mt-1 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                                />
                                <span className="min-w-0 flex-1">
                                  <span className="block truncate text-sm font-black text-slate-800">{getTaskTitle(task)}</span>
                                  <span className="mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-[11px] font-semibold text-slate-400">
                                    <span className="inline-flex min-w-0 items-center gap-1.5">
                                      <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: group?.color || '#94a3b8' }} />
                                      <span className="truncate">{group?.name || 'Sin grupo'}</span>
                                    </span>
                                    {parentTask && <span className="truncate">Subtarea de {getTaskTitle(parentTask)}</span>}
                                    {task.externalWorkflowId && <span className="truncate">{task.externalWorkflowId}</span>}
                                  </span>
                                </span>
                                <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-black ring-1 ${status.className}`}>
                                  {status.label}
                                </span>
                              </label>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    <div className="border-t border-slate-200 bg-slate-50 p-3">
                      {selectedAdvanceTasks.length === 0 ? (
                        <p className="text-xs font-bold text-slate-400">No hay tareas asociadas. Este campo es opcional.</p>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          {selectedAdvanceTasks.map((task) => (
                            <span key={task.id} className="inline-flex max-w-full items-center gap-2 rounded-lg bg-white px-3 py-2 text-xs font-black text-indigo-700 ring-1 ring-indigo-100">
                              <span className="max-w-64 truncate">{getTaskTitle(task)}</span>
                              <button
                                type="button"
                                onClick={() => toggleAdvanceTask(task.id)}
                                className="rounded-md p-0.5 text-indigo-400 hover:bg-indigo-100 hover:text-indigo-700"
                                aria-label={`Quitar ${getTaskTitle(task)}`}
                              >
                                <X size={13} />
                              </button>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
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
                <SummaryLine label="ID del anticipo" value={advanceForm.customId.trim() || 'Sin ID personalizado'} />
                <SummaryLine
                  label="Centro de costos"
                  value={costCenterOptions.find((center) => center.id === advanceForm.costCenterId)?.name || 'Sin seleccionar'}
                />
                <SummaryLine label="Destino" value={[advanceForm.municipality, advanceForm.department].filter(Boolean).join(', ') || 'Sin destino'} />
                <SummaryLine label="Tareas asociadas" value={`${selectedAdvanceTasks.length}`} />
                <SummaryLine label="Periodo" value={`${formatDate(advanceForm.travelStart)} - ${formatDate(advanceForm.travelEnd)}`} />
                <SummaryLine label="Días calendario" value={`${inclusiveDays(advanceForm.travelStart, advanceForm.travelEnd)} días`} />
                <SummaryLine label="Ítems" value={`${advanceForm.items.length}`} />
                <SummaryLine label="Total solicitado" value={formatMoney(advanceForm.items.reduce((sum, item) => sum + item.amount, 0))} strong />
              </div>
              <div className="mt-4">
                <SignatureSummary title="Firma del solicitante" signature={buildCurrentSignatureSnapshot() || undefined} />
              </div>
              <div className="mt-5 rounded-xl border border-indigo-200 bg-white p-3 text-xs font-semibold leading-5 text-slate-600">
                Al enviar confirmas esta solicitud con la firma registrada en tu perfil. Quedará <strong>por validar</strong> y, una vez aprobada, pasará a <strong>Anticipos por pagar</strong>.
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

      {viewingAdvance && (() => {
        const advance = advances.find((item) => item.id === viewingAdvance.id) || viewingAdvance;
        const status = statusConfig[advance.status] || statusConfig.submitted;
        const costCenters = normalizeCostCenters(
          advance.costCenters,
          asNumber(advance.amountApproved || advance.amountRequested)
        );
        return (
          <ModalShell
            title={`Vista del anticipo ${advance.customId || advance.id.slice(0, 8)}`}
            subtitle="Consulta completa de la solicitud, sus ítems, asignación administrativa, firmas y pago."
            onClose={() => setViewingAdvance(null)}
            wide
          >
            <div className="space-y-5">
              <div className="grid gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-3">
                <SummaryLine label="ID administrativo" value={advance.customId || 'Pendiente de asignar'} strong />
                <SummaryLine label="Estado" value={status.label} />
                <SummaryLine label="Total aprobado" value={formatMoney(advance.amountApproved || advance.amountRequested)} strong />
              </div>

              <div className="grid gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(320px,.7fr)]">
                <div className="space-y-5">
                  <section className="rounded-xl border border-slate-200 bg-white p-4">
                    <h3 className="text-sm font-black uppercase tracking-[0.16em] text-slate-500">Información general</h3>
                    <div className="mt-4 grid gap-3 md:grid-cols-2">
                      <SummaryLine label="Solicitante" value={advance.requesterName} />
                      <SummaryLine label="Correo" value={advance.requesterEmail || 'Sin correo'} />
                      <SummaryLine label="Destino" value={advance.destination} />
                      <SummaryLine label="Periodo" value={`${formatDate(advance.travelStart)} - ${formatDate(advance.travelEnd)}`} />
                    </div>
                    <div className="mt-3 rounded-lg bg-slate-50 p-3"><p className="text-[10px] font-black uppercase tracking-[0.15em] text-slate-400">Justificación</p><p className="mt-1 text-sm font-semibold leading-6 text-slate-700">{advance.purpose}</p></div>
                    {advance.adminComment && <div className="mt-3 rounded-lg border border-orange-200 bg-orange-50 p-3 text-sm font-semibold text-orange-800"><span className="font-black">Observación administrativa:</span> {advance.adminComment}</div>}
                  </section>

                  <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                    <div className="border-b border-slate-200 px-4 py-3"><h3 className="text-sm font-black uppercase tracking-[0.16em] text-slate-500">Ítems del anticipo</h3></div>
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[680px] text-left text-xs">
                        <thead className="bg-slate-100 text-[10px] font-black uppercase tracking-[0.12em] text-slate-500"><tr><th className="px-3 py-2">Concepto</th><th className="px-3 py-2">Días / unidades</th><th className="px-3 py-2">Unitario</th><th className="px-3 py-2">Nota</th><th className="px-3 py-2 text-right">Total</th></tr></thead>
                        <tbody className="divide-y divide-slate-100">{(advance.items || []).map((item) => <tr key={item.id}><td className="px-3 py-3 font-black text-slate-900">{item.categoryName}</td><td className="px-3 py-3 text-slate-600">{item.days}</td><td className="px-3 py-3 text-slate-600">{formatMoney(item.unitAmount)}</td><td className="px-3 py-3 text-slate-500">{item.note || '—'}</td><td className="px-3 py-3 text-right font-black">{formatMoney(item.amount)}</td></tr>)}</tbody>
                        <tfoot className="border-t-2 border-slate-200 bg-slate-50"><tr><td colSpan={4} className="px-3 py-3 text-right font-black uppercase text-slate-500">Total solicitado</td><td className="px-3 py-3 text-right text-sm font-black text-indigo-700">{formatMoney(advance.amountRequested)}</td></tr></tfoot>
                      </table>
                    </div>
                  </section>

                  <section className="rounded-xl border border-slate-200 bg-white p-4">
                    <h3 className="text-sm font-black uppercase tracking-[0.16em] text-slate-500">Asignación y trazabilidad</h3>
                    <div className="mt-4 grid gap-3 md:grid-cols-2">
                      <SummaryLine label="Tareas vinculadas" value={(advance.taskTitles || []).join(', ') || advance.taskTitle || 'Sin tareas'} />
                      <SummaryLine label="Centro principal" value={advance.costCenterName || costCenters[0]?.name || 'Sin asignar'} />
                    </div>
                    {costCenters.length > 0 && <div className="mt-3 grid gap-2 sm:grid-cols-2">{costCenters.map((center) => <div key={center.id} className="rounded-lg bg-emerald-50 px-3 py-2 ring-1 ring-emerald-100"><p className="text-xs font-black text-emerald-900">{center.name}</p><p className="mt-1 text-xs font-semibold text-emerald-700">{center.percentage}% · {formatMoney(center.amount)}</p></div>)}</div>}
                  </section>
                </div>

                <aside className="space-y-3">
                  <SignatureSummary title="Firma solicitante" signature={advance.requesterSignature} />
                  <SignatureSummary title="Firma aprobador" signature={advance.approvalSignature} />
                  <div className={`rounded-xl border p-4 ${advance.paymentSupport ? 'border-emerald-200 bg-emerald-50' : 'border-violet-200 bg-violet-50'}`}>
                    <p className="text-[10px] font-black uppercase tracking-[0.15em] text-slate-500">Pago</p>
                    {advance.paymentSupport ? <><p className="mt-2 text-lg font-black text-emerald-900">{formatMoney(advance.paymentSupport.amount)}</p><p className="mt-1 text-xs font-semibold text-emerald-700">{formatDate(advance.paymentSupport.date)}{advance.paymentSupport.reference ? ` · Ref. ${advance.paymentSupport.reference}` : ''}</p><div className="mt-3"><SecureDocumentLink storagePath={advance.paymentSupport.storagePath} fallbackUrl={advance.paymentSupport.fileUrl} className="inline-flex items-center gap-2 text-xs font-black text-emerald-800"><FileText size={14} />Ver soporte de pago</SecureDocumentLink></div></> : <p className="mt-2 text-sm font-bold text-violet-800">Pendiente de registrar el desembolso.</p>}
                  </div>
                </aside>
              </div>
            </div>
            <ModalFooter>
              <AdvanceReportMenu
                advance={advance}
                onSelect={(scope) => void downloadAdvanceReportOption(advance, scope)}
              />
              {(canManage || canValidate) && ['submitted', 'pending_payment', 'paid'].includes(advance.status) && <Button type="button" variant="outline" onClick={() => { setViewingAdvance(null); openAdvanceEditor(advance); }} className="border-indigo-200 text-indigo-700"><PencilLine size={15} className="mr-2" />Editar anticipo</Button>}
              {canValidate && advance.status === 'pending_payment' && <Button type="button" onClick={() => { setViewingAdvance(null); openAdvancePayment(advance); }} className="bg-violet-600 font-bold text-white hover:bg-violet-700"><CreditCard size={15} className="mr-2" />Registrar pago</Button>}
              <Button type="button" variant="outline" onClick={() => setViewingAdvance(null)}>Cerrar</Button>
            </ModalFooter>
          </ModalShell>
        );
      })()}

      {paymentAdvance && (
        <ModalShell
          title="Registrar pago del anticipo"
          subtitle="El anticipo solo pasa a legalización cuando el soporte del desembolso queda cargado e indexado."
          onClose={() => setPaymentAdvance(null)}
          wide
        >
          <div className="grid gap-4 lg:grid-cols-[1fr_330px]">
            <div className="space-y-4">
              <div className="grid gap-3 md:grid-cols-2">
                <div className="md:col-span-2 rounded-xl border border-indigo-200 bg-indigo-50/60 p-4">
                  <Field label="ID administrativo del anticipo · obligatorio">
                    <input className={`${inputClass} bg-white font-black uppercase tracking-wide`} value={paymentForm.customId} maxLength={80} onChange={(event) => setPaymentForm((current) => ({ ...current, customId: event.target.value }))} placeholder="Ej: ANT-2026-001 o ID contable" />
                  </Field>
                  <p className="mt-2 text-xs font-semibold text-indigo-700">La administrativa asigna o confirma este ID antes del desembolso. Se usará en búsquedas, ficha e indexación documental.</p>
                </div>
                <Field label="Valor pagado">
                  <input className={inputClass} type="number" min="0" step="0.01" value={paymentForm.amount} onChange={(event) => setPaymentForm((current) => ({ ...current, amount: event.target.value }))} />
                </Field>
                <Field label="Fecha del pago">
                  <input className={inputClass} type="date" value={paymentForm.date} onChange={(event) => setPaymentForm((current) => ({ ...current, date: event.target.value }))} />
                </Field>
                <Field label="Referencia bancaria (opcional)">
                  <input className={inputClass} value={paymentForm.reference} onChange={(event) => setPaymentForm((current) => ({ ...current, reference: event.target.value }))} placeholder="Ej: TRANS-928374" />
                </Field>
                <Field label="Nota (opcional)">
                  <input className={inputClass} value={paymentForm.note} onChange={(event) => setPaymentForm((current) => ({ ...current, note: event.target.value }))} placeholder="Cuenta, banco u observación" />
                </Field>
              </div>
              <div>
                <p className="mb-2 text-xs font-black uppercase tracking-[0.16em] text-slate-500">Soporte obligatorio</p>
                <label className="flex min-h-36 cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-violet-300 bg-violet-50/60 p-5 text-center transition hover:bg-violet-50">
                  <Upload size={24} className="text-violet-600" />
                  <span className="mt-2 text-sm font-black text-violet-800">{paymentFile?.name || 'Seleccionar comprobante de pago'}</span>
                  <span className="mt-1 text-xs font-semibold text-slate-500">PDF, imagen o comprobante exportado por el banco</span>
                  <input type="file" accept="image/*,application/pdf" className="hidden" onChange={(event) => setPaymentFile(event.target.files?.[0] || null)} />
                </label>
              </div>
            </div>
            <aside className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
              <SummaryLine label="ID administrativo" value={paymentForm.customId.trim() || 'Pendiente de asignar'} />
              <SummaryLine label="ID interno Pixel" value={paymentAdvance.id} />
              <SummaryLine label="Beneficiario" value={paymentAdvance.requesterName} />
              <SummaryLine label="Valor aprobado" value={formatMoney(paymentAdvance.amountApproved || paymentAdvance.amountRequested)} strong />
              <SignatureSummary title="Firma solicitante" signature={paymentAdvance.requesterSignature} />
              <SignatureSummary title="Firma aprobador" signature={paymentAdvance.approvalSignature} />
              <Button type="button" variant="outline" onClick={() => { const advance = paymentAdvance; setPaymentAdvance(null); openAdvanceEditor(advance); }} className="w-full border-indigo-200 text-indigo-700 hover:bg-indigo-50"><PencilLine size={15} className="mr-2" />Editar anticipo completo</Button>
            </aside>
          </div>
          <ModalFooter>
            <Button type="button" variant="outline" onClick={() => setPaymentAdvance(null)}>Cancelar</Button>
            <Button type="button" onClick={handleRegisterAdvancePayment} disabled={submitting || !paymentFile || !paymentForm.customId.trim()} className="bg-violet-600 font-bold text-white hover:bg-violet-700">
              {submitting ? <Loader2 size={16} className="mr-2 animate-spin" /> : <CreditCard size={16} className="mr-2" />}
              Confirmar pago y habilitar legalización
            </Button>
          </ModalFooter>
        </ModalShell>
      )}

      {reconciliationAdvance && (() => {
        const reconciliation = getAdvanceReconciliation(reconciliationAdvance);
        const isReturn = reconciliation.returnRequired > 0;
        const amount = isReturn ? reconciliation.returnRequired : reconciliation.compensationRequired;
        return (
          <ModalShell
            title={isReturn ? 'Registrar devolución del anticipo' : 'Registrar compensación del anticipo'}
            subtitle={isReturn ? 'El profesional devuelve el saldo no soportado y adjunta el comprobante.' : 'La profesional administrativa registra el pago adicional reconocido al solicitante.'}
            onClose={() => setReconciliationAdvance(null)}
            wide
          >
            <div className="grid gap-4 lg:grid-cols-[1fr_330px]">
              <div className="space-y-4">
                <div className="grid gap-3 md:grid-cols-2">
                  <Field label="Valor conciliado">
                    <input className={`${inputClass} bg-slate-50 font-black`} value={formatMoney(amount)} disabled />
                  </Field>
                  <Field label="Fecha del movimiento">
                    <input className={inputClass} type="date" value={reconciliationForm.date} onChange={(event) => setReconciliationForm((current) => ({ ...current, date: event.target.value }))} />
                  </Field>
                  <Field label="Referencia (opcional)">
                    <input className={inputClass} value={reconciliationForm.reference} onChange={(event) => setReconciliationForm((current) => ({ ...current, reference: event.target.value }))} placeholder="Transferencia, consignación o comprobante" />
                  </Field>
                  <Field label="Nota (opcional)">
                    <input className={inputClass} value={reconciliationForm.note} onChange={(event) => setReconciliationForm((current) => ({ ...current, note: event.target.value }))} placeholder="Observación de conciliación" />
                  </Field>
                </div>
                <label className="flex min-h-40 cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-cyan-300 bg-cyan-50/60 p-5 text-center transition hover:bg-cyan-50">
                  <Upload size={26} className="text-cyan-700" />
                  <span className="mt-2 text-sm font-black text-cyan-900">{reconciliationFile?.name || `Seleccionar soporte de ${isReturn ? 'devolución' : 'compensación'}`}</span>
                  <span className="mt-1 text-xs font-semibold text-slate-500">PDF o imagen. Quedará indexado dentro del expediente del anticipo.</span>
                  <input type="file" accept="image/*,application/pdf" className="hidden" onChange={(event) => setReconciliationFile(event.target.files?.[0] || null)} />
                </label>
                {reconciliationFile && <Button type="button" variant="outline" onClick={() => setSupportPreviewFile(reconciliationFile)} className="border-indigo-200 text-indigo-700"><FileText size={14} className="mr-2" />Previsualizar soporte</Button>}
              </div>
              <aside className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
                <SummaryLine label="Anticipado" value={formatMoney(reconciliation.anticipated)} />
                <SummaryLine label="Justificado" value={formatMoney(reconciliation.justified)} />
                <SummaryLine label="Legalizado" value={formatMoney(reconciliation.legalized)} />
                <SummaryLine label={isReturn ? 'Por devolver' : 'Por compensar'} value={formatMoney(amount)} strong />
                <p className="rounded-lg bg-white p-3 text-xs font-semibold leading-5 text-slate-600 ring-1 ring-slate-200">Después de cargar el soporte, el área administrativa deberá usar “Conciliar y cerrar”. Solo entonces se habilitarán costos reales y expediente final.</p>
              </aside>
            </div>
            <ModalFooter>
              <Button type="button" variant="outline" onClick={() => setReconciliationAdvance(null)}>Cancelar</Button>
              <Button type="button" onClick={handleSaveReconciliationSupport} disabled={submitting || !reconciliationFile} className="bg-cyan-700 font-bold text-white hover:bg-cyan-800">
                {submitting ? <Loader2 size={16} className="mr-2 animate-spin" /> : <Upload size={16} className="mr-2" />}
                Guardar soporte
              </Button>
            </ModalFooter>
          </ModalShell>
        );
      })()}

      {editingAdvance && (
        <ModalShell
          title={editingAdvance.status === 'returned' ? 'Corregir anticipo devuelto' : 'Editar anticipo administrativo'}
          subtitle={editingAdvance.status === 'returned' ? 'Ajusta la solicitud, vuelve a firmarla y reenvíala para aprobación.' : 'Corrige datos del anticipo desde legalizaciones sin alterar soportes ni aprobaciones.'}
          onClose={() => setEditingAdvance(null)}
          wide
        >
          <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
            <div className="space-y-4">
              <div className="rounded-2xl border border-indigo-100 bg-indigo-50/60 p-4">
                <p className="text-[11px] font-black uppercase tracking-[0.28em] text-indigo-600">
                  Ajuste administrativo
                </p>
                <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">
                  Usa esta edición para corregir el ID contable, destino, fechas o descripción del anticipo cuando ya fue aprobado
                  y la legalización necesita quedar alineada con el sistema administrativo.
                </p>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <Field label="ID contable / sistema">
                  <input
                    className={inputClass}
                    value={advanceEditForm.customId}
                    maxLength={80}
                    onChange={(event) => setAdvanceEditForm((current) => ({ ...current, customId: event.target.value }))}
                    placeholder="Ej: 676, ANT-2026-001"
                  />
                </Field>
                <Field label="Estado actual">
                  <input
                    className={`${inputClass} bg-slate-50 text-slate-500`}
                    value={(statusConfig[editingAdvance.status] || statusConfig.submitted).label}
                    readOnly
                  />
                </Field>
                <Field label="Departamento">
                  <select
                    className={inputClass}
                    value={advanceEditForm.department}
                    disabled={locationsLoading || locationOptions.length === 0}
                    onChange={(event) =>
                      setAdvanceEditForm((current) => ({
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
                    value={advanceEditForm.municipality}
                    disabled={locationsLoading || !advanceEditForm.department}
                    onChange={(event) => setAdvanceEditForm((current) => ({ ...current, municipality: event.target.value }))}
                  >
                    <option value="">
                      {locationsLoading
                        ? 'Cargando municipios...'
                        : advanceEditForm.department
                          ? 'Selecciona municipio'
                          : 'Primero elige departamento'}
                    </option>
                    {editMunicipalityOptions.map((municipality) => (
                      <option key={municipality} value={municipality}>
                        {municipality}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Inicio">
                  <input
                    className={inputClass}
                    type="date"
                    value={advanceEditForm.travelStart}
                    onChange={(event) => setAdvanceEditForm((current) => ({ ...current, travelStart: event.target.value }))}
                  />
                </Field>
                <Field label="Fin">
                  <input
                    className={inputClass}
                    type="date"
                    value={advanceEditForm.travelEnd}
                    onChange={(event) => setAdvanceEditForm((current) => ({ ...current, travelEnd: event.target.value }))}
                  />
                </Field>
              </div>
              <Field label="Justificación / descripción">
                <textarea
                  className={textareaClass}
                  value={advanceEditForm.purpose}
                  onChange={(event) => setAdvanceEditForm((current) => ({ ...current, purpose: event.target.value }))}
                  placeholder="Describe o corrige el alcance administrativo del anticipo."
                />
              </Field>
              {editingAdvance.status === 'returned' && (
                <div className="rounded-2xl border border-orange-200 bg-orange-50/50 p-4">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <div><p className="text-[11px] font-black uppercase tracking-[0.24em] text-orange-700">Corregir ítems solicitados</p><p className="mt-1 text-xs font-semibold text-slate-500">Ajusta cantidades, valores o notas antes de volver a firmar y reenviar.</p></div>
                    <span className="rounded-md bg-white px-3 py-1.5 text-sm font-black text-orange-800 ring-1 ring-orange-200">{formatMoney(editingAdvanceApprovedAmount)}</span>
                  </div>
                  <div className="space-y-2">
                    {advanceEditForm.items.map((item) => (
                      <div key={item.id} className="grid gap-2 rounded-xl border border-white bg-white p-3 shadow-sm md:grid-cols-[minmax(150px,1fr)_100px_150px_minmax(160px,1fr)_120px] md:items-end">
                        <Field label="Concepto"><input className={`${inputClass} bg-slate-50`} value={item.categoryName} readOnly /></Field>
                        <Field label="Días / und."><input className={inputClass} type="number" min="0.01" step="0.01" value={item.days} onChange={(event) => updateAdvanceEditItem(item.id, { days: asNumber(event.target.value) })} /></Field>
                        <Field label="Valor unitario"><input className={inputClass} type="number" min="0" step="0.01" value={item.unitAmount} onChange={(event) => updateAdvanceEditItem(item.id, { unitAmount: asNumber(event.target.value) })} /></Field>
                        <Field label="Nota"><input className={inputClass} value={item.note || ''} onChange={(event) => updateAdvanceEditItem(item.id, { note: event.target.value })} /></Field>
                        <div className="rounded-lg bg-orange-50 px-3 py-2 text-right"><p className="text-[9px] font-black uppercase text-orange-500">Total</p><p className="font-black text-orange-800">{formatMoney(item.amount)}</p></div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {editingAdvance.status !== 'returned' && <div className="grid gap-3 md:grid-cols-[220px_1fr]">
                <Field label="Dinero devuelto">
                  <input
                    className={inputClass}
                    type="number"
                    min="0"
                    step="0.01"
                    value={advanceEditForm.amountReturned}
                    onChange={(event) => setAdvanceEditForm((current) => ({ ...current, amountReturned: event.target.value }))}
                    placeholder="0"
                  />
                </Field>
                <Field label="Comentario de devolución">
                  <input
                    className={inputClass}
                    value={advanceEditForm.returnComment}
                    onChange={(event) => setAdvanceEditForm((current) => ({ ...current, returnComment: event.target.value }))}
                    placeholder="Ej: reintegro caja menor, transferencia o saldo no usado."
                  />
                </Field>
              </div>}
              <div className="rounded-2xl border border-emerald-100 bg-emerald-50/40 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-[11px] font-black uppercase tracking-[0.28em] text-emerald-700">Centros de costo</p>
                    <p className="mt-1 text-xs font-bold text-slate-500">Distribuye el dinero aprobado. La suma de porcentajes debe ser 100%.</p>
                  </div>
                  <span
                    className={`rounded-md px-2 py-1 text-xs font-black ${
                      costCentersAreBalanced(advanceEditForm.costCenters)
                        ? 'bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200'
                        : 'bg-amber-100 text-amber-700 ring-1 ring-amber-200'
                    }`}
                  >
                    {editingCostCenterTotal}% asignado
                  </span>
                </div>
                <div className="mt-3 space-y-3">
                  {advanceEditForm.costCenters.map((center) => (
                    <div key={center.id} className="rounded-xl border border-white/70 bg-white p-3 shadow-sm">
                      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_120px_auto] lg:items-end">
                        <Field label="Centro">
                          <select
                            className={inputClass}
                            value={center.domainId || ''}
                            onChange={(event) => {
                              const domain = costCenterOptions.find((option) => option.id === event.target.value);
                              if (!domain) return;
                              updateAdvanceCostCenter(center.id, {
                                domainId: domain.id.startsWith('default-cost-center-') ? undefined : domain.id,
                                name: domain.name,
                              });
                            }}
                          >
                            <option value={center.domainId || ''}>
                              {center.name}{center.domainId ? '' : ' · registro anterior'}
                            </option>
                            {costCenterOptions
                              .filter((domain) => domain.id !== center.domainId)
                              .map((domain) => (
                                <option key={domain.id} value={domain.id}>
                                  {domain.code ? `${domain.code} · ` : ''}{domain.name}
                                </option>
                              ))}
                          </select>
                        </Field>
                        <Field label="%">
                          <input
                            className={inputClass}
                            type="number"
                            min="0"
                            max="100"
                            step="0.01"
                            value={center.percentage}
                            onChange={(event) => updateAdvanceCostCenter(center.id, { percentage: asNumber(event.target.value) })}
                          />
                        </Field>
                        <button
                          type="button"
                          onClick={() => removeAdvanceCostCenter(center.id)}
                          disabled={advanceEditForm.costCenters.length <= 1}
                          className="inline-flex h-11 items-center justify-center rounded-lg border border-rose-100 px-3 text-rose-500 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-40"
                          aria-label={`Eliminar ${center.name}`}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                      <div className="mt-3 grid gap-3 md:grid-cols-[180px_1fr]">
                        <div className="rounded-lg bg-slate-50 px-3 py-2 ring-1 ring-slate-100">
                          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Monto calculado</p>
                          <p className="mt-1 text-sm font-black text-slate-950">{formatMoney(center.amount)}</p>
                        </div>
                        <Field label="Nota">
                          <input
                            className={inputClass}
                            value={center.note || ''}
                            onChange={(event) => updateAdvanceCostCenter(center.id, { note: event.target.value })}
                            placeholder="Opcional"
                          />
                        </Field>
                      </div>
                    </div>
                  ))}
                </div>
                <Button type="button" variant="outline" onClick={addAdvanceCostCenter} className="mt-3 border-emerald-200 text-emerald-700 hover:bg-emerald-50">
                  <Plus size={14} className="mr-2" />
                  Agregar centro de costo
                </Button>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-[11px] font-black uppercase tracking-[0.28em] text-slate-500">Resumen del anticipo</p>
              <div className="mt-4 space-y-3">
                <SummaryLine label="Solicitante" value={editingAdvance.requesterName || 'Sin solicitante'} />
                <SummaryLine label="ID actual" value={editingAdvance.customId || editingAdvance.id} />
                <SummaryLine label="Nuevo ID" value={advanceEditForm.customId.trim() || 'Sin ID personalizado'} />
                <SummaryLine label="Destino" value={[advanceEditForm.municipality, advanceEditForm.department].filter(Boolean).join(', ') || 'Sin destino'} />
                <SummaryLine label="Periodo" value={`${formatDate(advanceEditForm.travelStart)} - ${formatDate(advanceEditForm.travelEnd)}`} />
                <SummaryLine label="Días calendario" value={`${inclusiveDays(advanceEditForm.travelStart, advanceEditForm.travelEnd)} días`} />
                <SummaryLine label="Tareas vinculadas" value={`${(editingAdvance.taskIds || []).length || (editingAdvance.taskId ? 1 : 0)}`} />
                <SummaryLine label="Anticipado" value={formatMoney(editingAdvanceCoverage?.approved || editingAdvance.amountApproved || editingAdvance.amountRequested)} />
                <SummaryLine label="Legalizado" value={formatMoney(editingAdvanceCoverage?.legalized || editingAdvance.amountLegalized)} />
                <SummaryLine label="Devuelto" value={formatMoney(editingAdvanceCoverage?.returnedCash || 0)} />
                <SummaryLine label="Cubierto" value={`${formatMoney(editingAdvanceCoverage?.covered || 0)} · ${editingAdvanceCoverage?.progress || 0}%`} />
                <SummaryLine
                  label={(editingAdvanceCoverage?.balance || 0) < 0 ? 'Sobra' : 'Saldo'}
                  value={formatMoney(Math.abs(editingAdvanceCoverage?.balance || 0))}
                  strong
                />
              </div>
              {editingAdvance.status === 'returned' && <div className="mt-4"><SignatureSummary title="Firma para el reenvío" signature={buildCurrentSignatureSnapshot() || undefined} /></div>}
              {editingAdvance.administrativeEditedAt && (
                <p className="mt-4 rounded-xl border border-slate-200 bg-white p-3 text-xs font-bold leading-5 text-slate-500">
                  Último ajuste administrativo: {formatDate(editingAdvance.administrativeEditedAt)} por{' '}
                  {editingAdvance.administrativeEditedByName || 'Usuario administrativo'}.
                </p>
              )}
            </div>
          </div>
          <ModalFooter>
            <Button type="button" variant="outline" onClick={() => setEditingAdvance(null)}>
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={handleUpdateAdvanceFromLegalizations}
              disabled={submitting}
              className="bg-indigo-600 font-bold text-white hover:bg-indigo-700"
            >
              {submitting && <Loader2 size={16} className="mr-2 animate-spin" />}
              {editingAdvance.status === 'returned' ? 'Firmar y reenviar' : 'Guardar cambios'}
            </Button>
          </ModalFooter>
        </ModalShell>
      )}

      {selectedAdvance && (
        <ModalShell title="Legalizar anticipo" subtitle={selectedAdvance.purpose || selectedAdvance.destination} onClose={closeReceiptModal} wide>
          <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
            <div className="space-y-4">
              <div className="grid gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-2 md:grid-cols-2">
                <button
                  type="button"
                  onClick={() => setReceiptMode('manual')}
                  className={`rounded-xl px-4 py-3 text-left transition ${
                    receiptMode === 'manual' ? 'bg-white text-indigo-700 shadow-sm ring-1 ring-indigo-100' : 'text-slate-500 hover:bg-white/70'
                  }`}
                >
                  <span className="flex items-center gap-2 text-sm font-black">
                    <ReceiptText size={16} />
                    Manual
                  </span>
                  <span className="mt-1 block text-xs font-semibold">Carga un soporte y diligencia los datos.</span>
                </button>
                <button
                  type="button"
                  onClick={() => setReceiptMode('ai')}
                  className={`rounded-xl px-4 py-3 text-left transition ${
                    receiptMode === 'ai' ? 'bg-white text-indigo-700 shadow-sm ring-1 ring-indigo-100' : 'text-slate-500 hover:bg-white/70'
                  }`}
                >
                  <span className="flex items-center gap-2 text-sm font-black">
                    <Sparkles size={16} />
                    IA por lote
                  </span>
                  <span className="mt-1 block text-xs font-semibold">Sube varios recibos y Pixel crea los registros.</span>
                </button>
              </div>

              {receiptMode === 'manual' ? (
                <>
                  <div className="grid gap-3 md:grid-cols-2">
                    <Field label="Tipo de documento">
                      <select
                        className={inputClass}
                        value={receiptForm.documentType}
                        onChange={(event) =>
                          setReceiptForm((current) => ({
                            ...current,
                            documentType: getReceiptDocumentType(event.target.value),
                          }))
                        }
                      >
                        <option value="invoice">Factura electrónica</option>
                        <option value="cash_receipt">Recibo de caja</option>
                      </select>
                      <span className="mt-1 block text-xs font-semibold text-slate-400">{selectedReceiptDocumentMeta.hint}</span>
                    </Field>
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
                    <Field label={selectedReceiptDocumentMeta.numberLabel}>
                      <input className={inputClass} value={receiptForm.invoiceNumber} onChange={(event) => setReceiptForm((current) => ({ ...current, invoiceNumber: event.target.value }))} />
                    </Field>
                  </div>
                  <Field label={selectedReceiptDocumentType === 'invoice' && selectedReceiptCategory?.requiresCufe ? 'CUFE requerido' : 'CUFE (opcional)'}>
                    <input
                      className={inputClass}
                      value={receiptForm.cufe}
                      onChange={(event) => setReceiptForm((current) => ({ ...current, cufe: event.target.value }))}
                      placeholder={selectedReceiptDocumentType === 'cash_receipt' ? 'No aplica para recibo de caja' : 'Código CUFE de la factura electrónica'}
                    />
                    {selectedReceiptDocumentType === 'cash_receipt' && (
                      <span className="mt-1 block text-xs font-semibold text-amber-600">
                        Para recibo de caja el CUFE no es obligatorio.
                      </span>
                    )}
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
                    {receiptFile && (
                      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-indigo-100 bg-indigo-50/70 px-3 py-2">
                        <div className="min-w-0"><p className="truncate text-xs font-black text-slate-800">{receiptFile.name}</p><p className="text-[11px] font-semibold text-slate-500">{formatSupportFileSize(receiptFile.size)} · listo para revisar</p></div>
                        <Button type="button" size="sm" variant="outline" onClick={() => setSupportPreviewFile(receiptFile)} className="border-indigo-200 bg-white text-indigo-700 hover:bg-indigo-50"><FileText size={14} className="mr-2" />Previsualizar soporte</Button>
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <div className="space-y-4">
                  <div className="rounded-2xl border border-indigo-100 bg-indigo-50/70 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="flex gap-3">
                        <span className="rounded-xl bg-indigo-600 p-2 text-white">
                          <Sparkles size={20} />
                        </span>
                        <div>
                          <h3 className="text-lg font-black text-slate-950">Legalización inteligente por lote</h3>
                          <p className="mt-1 max-w-2xl text-sm font-semibold leading-6 text-slate-600">
                            Sube fotos o PDF de recibos. Pixel leerá tipo de documento, proveedor, fecha, valor, CUFE si aplica y dominio sugerido para crear una legalización por cada soporte.
                          </p>
                        </div>
                      </div>
                      {aiAnalyzingReceipts && (
                        <span className="inline-flex items-center rounded-full bg-white px-3 py-1 text-xs font-black uppercase tracking-[0.16em] text-indigo-600 ring-1 ring-indigo-100">
                          <Loader2 size={14} className="mr-2 animate-spin" />
                          Analizando
                        </span>
                      )}
                    </div>
                    <label className="mt-4 flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-indigo-200 bg-white/80 p-6 text-center transition hover:bg-white">
                      <Upload size={24} className="text-indigo-600" />
                      <span className="mt-2 text-sm font-black text-slate-900">Subir recibos para leer con IA</span>
                      <span className="mt-1 text-xs font-semibold text-slate-500">Máximo 12 archivos por lote. Puedes corregir cada registro antes de guardarlo.</span>
                      <input
                        type="file"
                        multiple
                        className="hidden"
                        accept="image/*,application/pdf"
                        onChange={(event) => {
                          void handleAnalyzeReceiptFiles(event.target.files);
                          event.currentTarget.value = '';
                        }}
                      />
                    </label>
                  </div>

                  {aiReceiptDrafts.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
                      <FileImage className="mx-auto h-8 w-8 text-slate-300" />
                      <p className="mt-3 text-sm font-black text-slate-800">Sin soportes analizados.</p>
                      <p className="mt-1 text-xs font-semibold text-slate-400">Cuando subas recibos, aparecerán aquí como registros editables.</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {aiReceiptDrafts.map((draft) => {
                        const draftCategory = categoryOptions.find((category) => category.id === draft.categoryId);
                        const draftDocumentMeta = getReceiptDocumentTypeMeta(draft.documentType);
                        const confidence = Math.round(asNumber(draft.confidence) * 100);
                        return (
                          <div key={draft.id} className={`rounded-2xl border p-4 ${draft.status === 'error' ? 'border-rose-200 bg-rose-50/60' : 'border-slate-200 bg-white'}`}>
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div>
                                <p className="text-sm font-black text-slate-950">{draft.fileName}</p>
                                <p className="mt-1 text-xs font-semibold text-slate-500">
                                  {draft.status === 'error'
                                    ? draft.error || 'No se pudo leer este soporte.'
                                    : `Confianza IA ${confidence || 0}% · ${formatMoney(draft.amount)}`}
                                </p>
                              </div>
                              <div className="flex items-center gap-2">
                                <Button type="button" size="sm" variant="outline" onClick={() => setSupportPreviewFile(draft.file)} className="border-indigo-200 text-indigo-700 hover:bg-indigo-50"><FileText size={14} className="mr-2" />Previsualizar</Button>
                                <button type="button" onClick={() => removeAiReceiptDraft(draft.id)} className="rounded-lg p-2 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600" aria-label={`Eliminar ${draft.fileName}`}>
                                  <Trash2 size={16} />
                                </button>
                              </div>
                            </div>

                            {draft.status !== 'error' && (
                              <>
                                <div className="mt-4 grid gap-3 md:grid-cols-2">
                                  <Field label="Tipo de documento">
                                    <select
                                      className={inputClass}
                                      value={draft.documentType}
                                      onChange={(event) => updateAiReceiptDraft(draft.id, { documentType: getReceiptDocumentType(event.target.value) })}
                                    >
                                      <option value="invoice">Factura electrónica</option>
                                      <option value="cash_receipt">Recibo de caja</option>
                                    </select>
                                  </Field>
                                  <Field label="Tipo de gasto">
                                    <select className={inputClass} value={draft.categoryId} onChange={(event) => updateAiReceiptDraft(draft.id, { categoryId: event.target.value })}>
                                      {categoryOptions.map((category) => (
                                        <option key={category.id} value={category.id}>{category.name}</option>
                                      ))}
                                    </select>
                                  </Field>
                                  <Field label="Valor">
                                    <input className={inputClass} type="number" min="0" step="0.01" value={draft.amount} onChange={(event) => updateAiReceiptDraft(draft.id, { amount: event.target.value })} />
                                  </Field>
                                  <Field label="Fecha">
                                    <input className={inputClass} type="date" value={draft.date} onChange={(event) => updateAiReceiptDraft(draft.id, { date: event.target.value })} />
                                  </Field>
                                  <Field label="Razón social / proveedor">
                                    <input className={inputClass} value={draft.businessName} onChange={(event) => updateAiReceiptDraft(draft.id, { businessName: event.target.value })} />
                                  </Field>
                                  <Field label="NIT o documento">
                                    <input className={inputClass} value={draft.taxId} onChange={(event) => updateAiReceiptDraft(draft.id, { taxId: event.target.value })} />
                                  </Field>
                                  <Field label={draftDocumentMeta.numberLabel}>
                                    <input className={inputClass} value={draft.invoiceNumber} onChange={(event) => updateAiReceiptDraft(draft.id, { invoiceNumber: event.target.value })} />
                                  </Field>
                                </div>
                                <div className="mt-3 grid gap-3">
                                  <Field label={draft.documentType === 'invoice' && draftCategory?.requiresCufe ? 'CUFE requerido' : 'CUFE (opcional)'}>
                                    <input
                                      className={inputClass}
                                      value={draft.cufe}
                                      onChange={(event) => updateAiReceiptDraft(draft.id, { cufe: event.target.value })}
                                      placeholder={draft.documentType === 'cash_receipt' ? 'No aplica para recibo de caja' : 'Código CUFE de la factura electrónica'}
                                    />
                                    {draft.documentType === 'cash_receipt' && (
                                      <span className="mt-1 block text-xs font-semibold text-amber-600">
                                        Para recibo de caja el CUFE no es obligatorio.
                                      </span>
                                    )}
                                  </Field>
                                  <Field label="Descripción">
                                    <textarea className={textareaClass} value={draft.description} onChange={(event) => updateAiReceiptDraft(draft.id, { description: event.target.value })} />
                                  </Field>
                                </div>
                                {(draft.warnings || []).length > 0 && (
                                  <div className="mt-3 rounded-xl bg-amber-50 p-3 text-xs font-semibold leading-5 text-amber-700 ring-1 ring-amber-100">
                                    {(draft.warnings || []).join(' · ')}
                                  </div>
                                )}
                              </>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <p className="text-[11px] font-black uppercase tracking-[0.28em] text-slate-400">Anticipo</p>
              <h3 className="mt-2 text-xl font-black text-slate-950">{selectedAdvance.destination}</h3>
              <p className="mt-1 text-sm font-semibold text-slate-500">{selectedAdvance.requesterName}</p>
              <div className="mt-4 space-y-3">
                <SummaryLine label="Anticipado" value={formatMoney(selectedAdvance.amountApproved || selectedAdvance.amountRequested)} />
                <SummaryLine label="Justificado" value={formatMoney(getAdvanceJustifiedAmount(selectedAdvance))} />
                <SummaryLine label="Legalizado" value={formatMoney(selectedAdvance.amountLegalized)} />
                <SummaryLine label="Saldo" value={formatMoney(selectedAdvance.balance)} strong />
                {receiptMode === 'ai' && <SummaryLine label="Borradores IA" value={`${aiReceiptDrafts.length}`} />}
              </div>
              <div className="mt-4 grid gap-2">
                <SignatureSummary title="Firma solicitante" signature={selectedAdvance.requesterSignature} />
                <SignatureSummary title="Firma aprobador" signature={selectedAdvance.approvalSignature} />
              </div>
              <div className="mt-5 rounded-xl bg-slate-50 p-3 text-xs font-semibold leading-5 text-slate-500">
                La validación DIAN por CUFE queda preparada para facturas electrónicas. Los recibos de caja quedan aceptados
                como soporte manual cuando no se consiga factura en campo.
              </div>
            </div>
          </div>
          <ModalFooter>
            <Button type="button" variant="outline" onClick={closeReceiptModal}>Cancelar</Button>
            <Button
              type="button"
              onClick={receiptMode === 'ai' ? handleCreateAiReceipts : handleCreateReceipt}
              disabled={submitting || (receiptMode === 'ai' && (aiAnalyzingReceipts || aiReceiptDrafts.length === 0))}
              className="bg-emerald-600 font-bold text-white hover:bg-emerald-700"
            >
              {submitting && <Loader2 size={16} className="mr-2 animate-spin" />}
              {receiptMode === 'ai' ? 'Crear legalizaciones' : 'Enviar soporte'}
            </Button>
          </ModalFooter>
        </ModalShell>
      )}

      {supportPreviewFile && (
        <ModalShell
          title="Previsualización del soporte"
          subtitle={`${supportPreviewFile.name} · ${formatSupportFileSize(supportPreviewFile.size)}`}
          onClose={() => setSupportPreviewFile(null)}
          wide
          topLayer
        >
          <LocalFilePreview key={`${supportPreviewFile.name}-${supportPreviewFile.lastModified}`} file={supportPreviewFile} />
          <ModalFooter>
            <Button type="button" onClick={() => setSupportPreviewFile(null)} className="bg-indigo-600 font-bold text-white hover:bg-indigo-700">Cerrar previsualización</Button>
          </ModalFooter>
        </ModalShell>
      )}

      {receiptEditor && receiptEditorForm && (() => {
        const isReview = receiptEditor.mode === 'review';
        const documentMeta = getReceiptDocumentTypeMeta(receiptEditorForm.documentType);
        const selectedCategory = categoryOptions.find((category) => category.id === receiptEditorForm.categoryId);
        const changes = getReceiptEditorChanges(receiptEditor.receipt, receiptEditorForm);
        const requiresCufe = receiptEditorForm.documentType === 'invoice' && Boolean(selectedCategory?.requiresCufe);
        return (
          <ModalShell
            title={isReview ? 'Revisar y aprobar soporte' : 'Subsanar legalización devuelta'}
            subtitle={`${receiptEditor.advance.purpose || receiptEditor.advance.destination} · ${receiptEditor.receipt.categoryName}`}
            onClose={closeReceiptEditor}
            wide
          >
            <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
              <div className="space-y-5">
                {receiptEditor.receipt.status === 'returned' && receiptEditor.receipt.reviewComment && (
                  <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-800">
                    <p className="text-xs font-black uppercase tracking-[0.16em] text-rose-600">Motivo de devolución</p>
                    <p className="mt-2">{receiptEditor.receipt.reviewComment}</p>
                  </div>
                )}

                <div className="grid gap-4 rounded-xl border border-slate-200 bg-white p-4 md:grid-cols-2">
                  <Field label="Tipo de documento">
                    <select
                      className={inputClass}
                      value={receiptEditorForm.documentType}
                      onChange={(event) => {
                        const documentType = getReceiptDocumentType(event.target.value);
                        updateReceiptEditorForm({
                          documentType,
                          dianVerificationStatus: documentType === 'cash_receipt' ? 'not_applicable' : receiptEditorForm.cufe ? 'pending' : 'not_applicable',
                          dianLookupOpenedAt: '',
                          dianVerifiedAt: '',
                        });
                      }}
                    >
                      <option value="invoice">Factura electrónica</option>
                      <option value="cash_receipt">Recibo de caja</option>
                    </select>
                  </Field>
                  <Field label="Tipo de gasto">
                    <select className={inputClass} value={receiptEditorForm.categoryId} onChange={(event) => updateReceiptEditorForm({ categoryId: event.target.value })}>
                      {categoryOptions.map((category) => (
                        <option key={category.id} value={category.id}>{category.name}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Valor">
                    <input className={inputClass} type="number" min="0" step="0.01" value={receiptEditorForm.amount} onChange={(event) => updateReceiptEditorForm({ amount: event.target.value })} />
                  </Field>
                  <Field label="Fecha del soporte">
                    <input className={inputClass} type="date" value={receiptEditorForm.date} onChange={(event) => updateReceiptEditorForm({ date: event.target.value })} />
                  </Field>
                  <Field label="Razón social">
                    <input className={inputClass} value={receiptEditorForm.businessName} onChange={(event) => updateReceiptEditorForm({ businessName: event.target.value })} />
                  </Field>
                  <Field label="NIT o documento">
                    <input className={inputClass} value={receiptEditorForm.taxId} onChange={(event) => updateReceiptEditorForm({ taxId: event.target.value })} />
                  </Field>
                  <Field label={documentMeta.numberLabel}>
                    <input className={inputClass} value={receiptEditorForm.invoiceNumber} onChange={(event) => updateReceiptEditorForm({ invoiceNumber: event.target.value })} />
                  </Field>
                  {receiptEditorForm.documentType === 'invoice' && (
                    <Field label={requiresCufe ? 'CUFE obligatorio' : 'CUFE'}>
                      <input
                        className={inputClass}
                        value={receiptEditorForm.cufe}
                        onChange={(event) => {
                          const cufe = event.target.value;
                          updateReceiptEditorForm({
                            cufe,
                            dianVerificationStatus: cufe.trim() ? 'pending' : 'not_applicable',
                            dianLookupOpenedAt: '',
                            dianVerifiedAt: '',
                            dianDocumentUrl: cufe.trim() ? buildDianDocumentUrl(cufe) : '',
                          });
                        }}
                      />
                    </Field>
                  )}
                  <div className="md:col-span-2">
                    <Field label="Descripción">
                      <textarea className={textareaClass} value={receiptEditorForm.description} onChange={(event) => updateReceiptEditorForm({ description: event.target.value })} />
                    </Field>
                  </div>
                </div>

                {receiptEditorForm.documentType === 'invoice' ? (
                  <div className={`rounded-xl border p-4 ${receiptEditorForm.dianVerificationStatus === 'confirmed' ? 'border-emerald-200 bg-emerald-50' : 'border-sky-200 bg-sky-50'}`}>
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="flex items-center gap-2 text-sm font-black text-slate-950">
                          <ShieldCheck size={17} className={receiptEditorForm.dianVerificationStatus === 'confirmed' ? 'text-emerald-600' : 'text-sky-600'} />
                          Verificación oficial de CUFE
                        </p>
                        <p className="mt-1 text-xs font-semibold text-slate-600">
                          {receiptEditorForm.dianVerificationStatus === 'confirmed'
                            ? 'Consulta confirmada y URL oficial vinculada a la legalización.'
                            : 'Consulta el documento en el portal oficial y confirma el resultado para dejar trazabilidad.'}
                        </p>
                      </div>
                      <span className={`rounded-md px-2 py-1 text-[10px] font-black uppercase tracking-[0.12em] ${receiptEditorForm.dianVerificationStatus === 'confirmed' ? 'bg-emerald-600 text-white' : 'bg-white text-sky-700 ring-1 ring-sky-200'}`}>
                        {receiptEditorForm.dianVerificationStatus === 'confirmed' ? 'CUFE confirmado' : 'Pendiente'}
                      </span>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <Button type="button" size="sm" variant="outline" onClick={openDianLookup} className="border-sky-200 bg-white text-sky-700 hover:bg-sky-100">
                        <ExternalLink size={14} className="mr-1" /> Consultar en DIAN
                      </Button>
                      <Button type="button" size="sm" onClick={confirmDianLookup} disabled={!receiptEditorForm.dianLookupOpenedAt} className="bg-emerald-600 text-white hover:bg-emerald-700">
                        <CheckCircle2 size={14} className="mr-1" /> Confirmar consulta
                      </Button>
                      {receiptEditorForm.dianDocumentUrl && (
                        <a href={receiptEditorForm.dianDocumentUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-md px-3 py-2 text-xs font-black text-slate-600 hover:bg-white">
                          Abrir documento oficial <ExternalLink size={13} />
                        </a>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-800">
                    El recibo de caja no requiere verificación CUFE. Su archivo y datos quedan sujetos a revisión administrativa.
                  </div>
                )}

                {isReview ? (
                  <Field label="Comentario administrativo">
                    <textarea className={textareaClass} value={reviewComment} onChange={(event) => setReviewComment(event.target.value)} placeholder="Observaciones de la revisión o explicación de los ajustes realizados." />
                  </Field>
                ) : (
                  <div className="space-y-4 rounded-xl border border-rose-200 bg-rose-50/60 p-4">
                    <Field label="Detalle de la subsanación">
                      <textarea className={textareaClass} value={receiptEditorForm.correctionNote} onChange={(event) => updateReceiptEditorForm({ correctionNote: event.target.value })} placeholder="Explica qué corregiste y cómo atiendes la devolución." />
                    </Field>
                    <Field label="Reemplazar archivo de soporte (opcional)">
                      <input className={inputClass} type="file" accept="image/*,application/pdf" onChange={(event) => setReceiptCorrectionFile(event.target.files?.[0] || null)} />
                    </Field>
                  </div>
                )}
              </div>

              <aside className="space-y-4">
                <div className="rounded-xl bg-slate-950 p-4 text-white">
                  <p className="text-[10px] font-black uppercase tracking-[0.22em] text-indigo-300">Resumen del soporte</p>
                  <p className="mt-3 text-lg font-black">{selectedCategory?.name || receiptEditor.receipt.categoryName}</p>
                  <p className="mt-1 text-sm font-semibold text-slate-300">{receiptEditor.advance.requesterName}</p>
                  <div className="mt-4 space-y-2">
                    <SummaryLine label="Valor" value={formatMoney(asNumber(receiptEditorForm.amount))} strong />
                    <SummaryLine label="Documento" value={documentMeta.shortLabel} />
                    <SummaryLine label="Cambios" value={`${changes.length}`} />
                    <SummaryLine label="Revisiones" value={`${asNumber(receiptEditor.receipt.revisionCount)}`} />
                  </div>
                </div>

                {changes.length > 0 && (
                  <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-4">
                    <p className="text-xs font-black uppercase tracking-[0.16em] text-indigo-700">Cambios que quedarán auditados</p>
                    <div className="mt-3 space-y-2">
                      {changes.map((change) => (
                        <div key={change.field} className="rounded-lg bg-white p-3 ring-1 ring-indigo-100">
                          <p className="text-xs font-black text-slate-900">{change.label}</p>
                          <p className="mt-1 break-words text-[11px] font-semibold text-slate-500">{String(change.previousValue || 'Vacío')} → {String(change.nextValue || 'Vacío')}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {(receiptEditor.receipt.fileUrl || receiptEditor.receipt.storagePath) && (
                  <SecureDocumentLink storagePath={receiptEditor.receipt.storagePath} fallbackUrl={receiptEditor.receipt.fileUrl} className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-indigo-700 shadow-sm hover:bg-indigo-50">
                    <FileImage size={16} /> Ver soporte original
                  </SecureDocumentLink>
                )}

                {isReview && (
                  <div className="rounded-xl border border-indigo-100 bg-white p-4 shadow-sm">
                    <div className="flex items-start gap-3">
                      <span className="rounded-lg bg-indigo-50 p-2 text-indigo-600">
                        <Upload size={16} />
                      </span>
                      <div>
                        <p className="text-xs font-black uppercase tracking-[0.16em] text-indigo-700">Cambiar soporte</p>
                        <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">
                          Sube el archivo correcto y, si quieres, Pixel vuelve a leerlo con IA para llenar los campos.
                        </p>
                      </div>
                    </div>
                    <input
                      id={`receipt-support-replacement-${receiptEditor.receipt.id}`}
                      type="file"
                      accept="image/*,application/pdf"
                      className="hidden"
                      onChange={(event) => setReceiptReplacementFile(event.target.files?.[0] || null)}
                    />
                    <label
                      htmlFor={`receipt-support-replacement-${receiptEditor.receipt.id}`}
                      className="mt-4 flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-indigo-200 bg-indigo-50/60 px-3 py-4 text-center text-xs font-black text-indigo-700 transition hover:bg-indigo-50"
                    >
                      <FileImage size={18} className="mb-2" />
                      {receiptReplacementFile ? receiptReplacementFile.name : 'Seleccionar nuevo soporte'}
                      {receiptReplacementFile && (
                        <span className="mt-1 text-[10px] font-bold text-slate-500">{formatSupportFileSize(receiptReplacementFile.size)}</span>
                      )}
                    </label>
                    <div className="mt-3 grid gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => void handleReplaceReceiptSupport(false)}
                        disabled={!receiptReplacementFile || Boolean(receiptSupportAction) || submitting}
                        className="justify-center"
                      >
                        {receiptSupportAction === 'replace' ? <Loader2 size={15} className="mr-2 animate-spin" /> : <Upload size={15} className="mr-2" />}
                        Guardar nuevo soporte
                      </Button>
                      <Button
                        type="button"
                        onClick={() => void handleReplaceReceiptSupport(true)}
                        disabled={!receiptReplacementFile || Boolean(receiptSupportAction) || submitting}
                        className="justify-center bg-indigo-600 text-white hover:bg-indigo-700"
                      >
                        {receiptSupportAction === 'reanalyze' ? <Loader2 size={15} className="mr-2 animate-spin" /> : <Sparkles size={15} className="mr-2" />}
                        Releer con IA y llenar campos
                      </Button>
                    </div>
                  </div>
                )}
              </aside>
            </div>

            <ModalFooter>
              <Button type="button" variant="outline" onClick={closeReceiptEditor} disabled={submitting || Boolean(receiptSupportAction)}>Cancelar</Button>
              <Button
                type="button"
                onClick={isReview ? handleApproveReceipt : handleResubmitReceipt}
                disabled={submitting || Boolean(receiptSupportAction)}
                className={isReview ? 'bg-emerald-600 font-bold text-white hover:bg-emerald-700' : 'bg-rose-600 font-bold text-white hover:bg-rose-700'}
              >
                {(submitting || receiptSupportAction) && <Loader2 size={16} className="mr-2 animate-spin" />}
                {isReview ? (changes.length > 0 ? 'Aprobar con modificación' : 'Aprobar soporte') : 'Reenviar subsanación'}
              </Button>
            </ModalFooter>
          </ModalShell>
        );
      })()}

      {reviewAction && (
        <ModalShell
          title={
            reviewAction.type === 'deleteAdvance'
              ? 'Eliminar anticipo'
              : reviewAction.type.includes('Receipt')
              ? 'Devolver soporte'
              : reviewAction.type === 'approveAdvance'
                ? 'Aprobar anticipo'
                : reviewAction.type === 'rejectAdvance'
                  ? 'Rechazar anticipo'
                  : 'Devolver anticipo'
          }
          subtitle={
            reviewAction.type === 'deleteAdvance'
              ? 'Se eliminará el anticipo y los registros administrativos asociados.'
              : 'La decisión quedará en la trazabilidad administrativa.'
          }
          onClose={() => setReviewAction(null)}
        >
          {reviewAction.type === 'deleteAdvance' && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm font-bold leading-6 text-rose-700">
              Esta acción borra el anticipo, sus pagos reales y la trazabilidad administrativa relacionada. No elimina otros documentos del proyecto.
            </div>
          )}
          {reviewAction.type === 'approveAdvance' && (
            <div className="grid gap-3 sm:grid-cols-2">
              <SignatureSummary title="Firma del solicitante" signature={reviewAction.advance.requesterSignature} />
              <SignatureSummary title="Tu firma de aprobación" signature={buildCurrentSignatureSnapshot() || undefined} />
            </div>
          )}
          <Field label={reviewAction.type === 'deleteAdvance' ? 'Comentario administrativo (opcional)' : 'Comentario administrativo'}>
            <textarea
              className={textareaClass}
              value={reviewComment}
              onChange={(event) => setReviewComment(event.target.value)}
              placeholder={
                reviewAction.type === 'deleteAdvance'
                  ? 'Opcional: deja una nota interna antes de eliminar este anticipo.'
                  : 'Explica la decisión, observaciones o ajustes solicitados.'
              }
            />
          </Field>
          <ModalFooter>
            <Button type="button" variant="outline" onClick={() => setReviewAction(null)}>Cancelar</Button>
            <Button
              type="button"
              onClick={applyReviewAction}
              disabled={submitting}
              className={
                reviewAction.type === 'deleteAdvance'
                  ? 'bg-rose-600 font-bold text-white hover:bg-rose-700'
                  : 'bg-indigo-600 font-bold text-white hover:bg-indigo-700'
              }
            >
              {submitting && <Loader2 size={16} className="mr-2 animate-spin" />}
              {reviewAction.type === 'deleteAdvance' ? 'Eliminar anticipo' : reviewAction.type === 'approveAdvance' ? 'Firmar y aprobar' : 'Confirmar'}
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

function SignatureSummary({ title, signature }: { title: string; signature?: AdvanceSignatureSnapshot }) {
  const [authorizedImage, setAuthorizedImage] = useState({ path: '', url: '' });

  useEffect(() => {
    let active = true;
    if (!signature?.signatureStoragePath) {
      return () => { active = false; };
    }
    void getAuthorizedDownloadURL(ref(storage, signature.signatureStoragePath))
      .then((url) => { if (active) setAuthorizedImage({ path: signature.signatureStoragePath || '', url }); })
      .catch(() => { if (active) setAuthorizedImage({ path: signature.signatureStoragePath || '', url: signature.signatureUrl || '' }); });
    return () => { active = false; };
  }, [signature?.signatureStoragePath, signature?.signatureUrl]);
  const authorizedImageUrl = signature?.signatureStoragePath && authorizedImage.path === signature.signatureStoragePath
    ? authorizedImage.url
    : signature?.signatureUrl || '';

  return (
    <div className={`rounded-lg border p-3 ${signature ? 'border-indigo-200 bg-indigo-50/50' : 'border-slate-200 bg-slate-50'}`}>
      <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">{title}</p>
      {signature ? (
        <>
          <div className="mt-2 flex h-16 items-center justify-center rounded-md bg-white p-1 ring-1 ring-indigo-100">
            {authorizedImageUrl ? <Image src={authorizedImageUrl} alt={title} width={220} height={64} className="max-h-14 w-auto object-contain" unoptimized /> : <PencilLine size={22} className="text-slate-300" />}
          </div>
          <p className="mt-2 truncate text-xs font-black text-slate-900">{signature.name}</p>
          <p className="truncate text-[11px] font-semibold text-slate-500">{signature.jobTitle}</p>
          <p className="truncate text-[11px] text-slate-500">{signature.email}</p>
        </>
      ) : (
        <p className="mt-3 text-xs font-semibold text-slate-400">Pendiente de firma verificable</p>
      )}
    </div>
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
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] font-black uppercase tracking-[0.24em] text-slate-400">{label}</p>
        <span className={`rounded-lg p-1.5 ring-1 ${tones[tone]}`}>{icon}</span>
      </div>
      <p className="mt-2 text-xl font-black tracking-tight text-white">{value}</p>
    </div>
  );
}

function ReceiptGroupMetric({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: 'slate' | 'indigo' | 'emerald' | 'amber' | 'rose';
}) {
  const tones = {
    slate: 'border-slate-200 bg-white text-slate-950',
    indigo: 'border-indigo-200 bg-indigo-50 text-indigo-800',
    emerald: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    amber: 'border-amber-200 bg-amber-50 text-amber-800',
    rose: 'border-rose-200 bg-rose-50 text-rose-800',
  };

  return (
    <div className={`min-w-0 rounded-lg border px-3 py-2 ${tones[tone]}`}>
      <p className="truncate text-[9px] font-black uppercase tracking-[0.16em] opacity-70">{label}</p>
      <p className="mt-1 truncate text-sm font-black" title={value}>{value}</p>
    </div>
  );
}

function AdvanceReportMenu({
  advance,
  onSelect,
  dark = false,
}: {
  advance: TravelAdvance;
  onSelect: (scope: AdvanceReportScope) => void;
  dark?: boolean;
}) {
  const reportAvailability = getAdvanceReportAvailability(advance);

  return (
    <label
      className={`relative inline-flex h-9 items-center overflow-hidden rounded-md border text-sm font-bold shadow-sm transition focus-within:ring-2 focus-within:ring-indigo-300 ${
        dark
          ? 'border-slate-950 bg-slate-950 text-white hover:bg-slate-800'
          : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
      }`}
    >
      <Download size={15} className="pointer-events-none absolute left-3" />
      <select
        defaultValue=""
        aria-label="Generar reporte del anticipo"
        onChange={(event) => {
          const scope = event.target.value as AdvanceReportScope;
          if (scope) onSelect(scope);
          event.currentTarget.value = '';
        }}
        className="h-full cursor-pointer appearance-none bg-transparent py-0 pl-9 pr-8 text-sm font-bold outline-none"
      >
        <option value="" disabled>Generar reporte</option>
        <option value="advance">Informe del anticipo</option>
        {reportAvailability.payment && <option value="payment">Anticipo con pago</option>}
        {reportAvailability.justifications && <option value="justifications">Anticipo con legalizaciones</option>}
        {reportAvailability.reconciliation && <option value="reconciliation">Anticipo con conciliación</option>}
        {reportAvailability.full && <option value="full">Informe final</option>}
      </select>
      <ChevronDown size={14} className="pointer-events-none absolute right-2.5" />
    </label>
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
  topLayer = false,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  onClose: () => void;
  wide?: boolean;
  topLayer?: boolean;
}) {
  return (
    <div className={`fixed inset-0 flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm ${topLayer ? 'z-[70]' : 'z-50'}`}>
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

function LocalFilePreview({ file }: { file: File }) {
  const [objectUrl] = useState(() => URL.createObjectURL(file));
  const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
  const isImage = file.type.startsWith('image/');

  useEffect(() => () => URL.revokeObjectURL(objectUrl), [objectUrl]);

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-100">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-white px-4 py-3">
        <div className="min-w-0"><p className="truncate text-sm font-black text-slate-900">{file.name}</p><p className="text-xs font-semibold text-slate-500">{isPdf ? 'Documento PDF' : isImage ? 'Imagen' : file.type || 'Archivo'} · {formatSupportFileSize(file.size)}</p></div>
        <a href={objectUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-lg border border-indigo-200 bg-white px-3 py-2 text-xs font-black text-indigo-700 transition hover:bg-indigo-50"><ExternalLink size={14} />Abrir en otra pestaña</a>
      </div>
      {isPdf ? (
        <iframe src={`${objectUrl}#toolbar=1&navpanes=0`} title={`Previsualización de ${file.name}`} className="h-[68vh] min-h-[480px] w-full bg-white" />
      ) : isImage ? (
        <div className="h-[68vh] min-h-[420px] w-full bg-contain bg-center bg-no-repeat" style={{ backgroundImage: `url(${JSON.stringify(objectUrl)})` }} role="img" aria-label={`Previsualización de ${file.name}`} />
      ) : (
        <div className="flex min-h-80 flex-col items-center justify-center p-8 text-center"><FileText size={42} className="text-slate-300" /><p className="mt-3 text-sm font-black text-slate-700">Este formato no tiene previsualización integrada.</p><p className="mt-1 text-xs font-semibold text-slate-500">Puedes abrirlo en otra pestaña para revisarlo.</p></div>
      )}
    </div>
  );
}

function AdvanceLifecycle({ advance, compact = false }: { advance: TravelAdvance; compact?: boolean }) {
  const receipts = advance.receipts || [];
  const allLegalizationsApproved = receipts.length > 0 && receipts.every(isApprovedReceipt);
  const requesterClosed = Boolean(advance.completedAt) && ['completed', 'closed'].includes(advance.status);
  const reconciled = advance.reconciliationStatus === 'reconciled';
  const steps = [
    { label: 'Creación', complete: true },
    { label: 'Aprobación', complete: Boolean(advance.approvalSignature) || ['pending_payment', 'paid', 'approved', 'completed', 'closed'].includes(advance.status) },
    { label: 'Por pagar', complete: Boolean(advance.paymentSupport) || ['paid', 'approved', 'completed', 'closed'].includes(advance.status) },
    { label: 'Legalizaciones', complete: allLegalizationsApproved },
    { label: 'Cierre funcionario', complete: requesterClosed },
    { label: 'Conciliación', complete: reconciled },
    { label: 'Informe final', complete: reconciled && advance.status === 'closed' },
  ];
  const activeIndex = steps.findIndex((step) => !step.complete);

  return (
    <div className={`overflow-x-auto border-t border-slate-100 bg-white ${compact ? 'px-3 py-2.5' : 'px-4 py-3'}`} aria-label="Ciclo de vida del anticipo">
      <div className="grid min-w-[820px] grid-cols-7">
        {steps.map((step, index) => {
          const active = index === activeIndex;
          return (
            <div key={step.label} className="relative flex min-w-0 flex-col items-center text-center">
              {index > 0 && <span className={`absolute right-1/2 top-3 h-0.5 w-full ${step.complete ? 'bg-emerald-400' : 'bg-slate-200'}`} />}
              <span className={`relative z-10 flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-black ring-4 ring-white ${step.complete ? 'bg-emerald-500 text-white' : active ? 'bg-indigo-600 text-white shadow-md shadow-indigo-200' : 'bg-slate-200 text-slate-500'}`}>
                {step.complete ? <CheckCircle2 size={14} /> : index + 1}
              </span>
              <span className={`mt-1.5 truncate px-1 text-[9px] font-black uppercase tracking-[0.1em] ${step.complete ? 'text-emerald-700' : active ? 'text-indigo-700' : 'text-slate-400'}`}>{step.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function AdvanceCard({
  advance,
  canValidate,
  canManage,
  canCorrect,
  onView,
  onGenerateReport,
  onOpenReceipt,
  onComplete,
  onApprove,
  onReturn,
  onReject,
  onDelete,
}: {
  advance: TravelAdvance;
  canValidate: boolean;
  canManage: boolean;
  canCorrect: boolean;
  onView: () => void;
  onGenerateReport: (scope: AdvanceReportScope) => void;
  onOpenReceipt: () => void;
  onComplete: () => void;
  onApprove: () => void;
  onReturn: () => void;
  onReject: () => void;
  onDelete: () => void;
}) {
  const status = statusConfig[advance.status] || statusConfig.submitted;
  const linkedTaskTitles =
    Array.isArray(advance.taskTitles) && advance.taskTitles.length > 0
      ? advance.taskTitles
      : advance.taskTitle
        ? [advance.taskTitle]
        : [];
  const costCenterNames = Array.from(
    new Set(
      (advance.costCenters || [])
        .map((center) => center.name)
        .concat(advance.costCenterName || [])
        .filter(Boolean)
    )
  );
  const progress =
    asNumber(advance.amountApproved) > 0
      ? Math.min(100, Math.round((getAdvanceJustifiedAmount(advance) / asNumber(advance.amountApproved)) * 100))
      : 0;
  const advanceReceipts = advance.receipts || [];
  const pendingApprovalCount = advanceReceipts.filter((receipt) => !isApprovedReceipt(receipt)).length;
  const allLegalizationsApproved = advanceReceipts.length > 0 && pendingApprovalCount === 0;

  return (
    <article className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="grid gap-4 p-4 lg:grid-cols-[1fr_auto] lg:items-start">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-md px-2 py-1 text-[11px] font-black ring-1 ${status.className}`}>{status.label}</span>
            {advance.customId && (
              <span className="rounded-md bg-violet-50 px-2 py-1 text-[11px] font-black uppercase tracking-[0.12em] text-violet-700 ring-1 ring-violet-100">
                ID {advance.customId}
              </span>
            )}
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
            {costCenterNames.length > 0 && (
              <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-1 text-emerald-700 ring-1 ring-emerald-100">
                <FolderKanban size={13} />
                {costCenterNames[0]}{costCenterNames.length > 1 ? ` +${costCenterNames.length - 1}` : ''}
              </span>
            )}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:min-w-[360px]">
          <SummaryLine label="Solicitado" value={formatMoney(advance.amountRequested)} />
          <SummaryLine label="Justificado" value={formatMoney(getAdvanceJustifiedAmount(advance))} />
          <SummaryLine label="Legalizado" value={formatMoney(advance.amountLegalized)} strong />
          <SummaryLine label="Avance justificación" value={`${progress}%`} />
          <div className="col-span-2 flex flex-wrap gap-2 text-[10px] font-black uppercase tracking-[0.1em]">
            <span className={`rounded-md px-2 py-1 ring-1 ${advance.requesterSignature ? 'bg-emerald-50 text-emerald-700 ring-emerald-100' : 'bg-amber-50 text-amber-700 ring-amber-100'}`}>Solicitante {advance.requesterSignature ? 'firmó' : 'pendiente'}</span>
            <span className={`rounded-md px-2 py-1 ring-1 ${advance.approvalSignature ? 'bg-emerald-50 text-emerald-700 ring-emerald-100' : 'bg-amber-50 text-amber-700 ring-amber-100'}`}>Aprobador {advance.approvalSignature ? 'firmó' : 'pendiente'}</span>
          </div>
        </div>
      </div>

      <AdvanceLifecycle advance={advance} />

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
          <Button type="button" size="sm" variant="outline" onClick={onView}>
            <FileText size={15} className="mr-2" />
            Ver anticipo
          </Button>
          <AdvanceReportMenu advance={advance} onSelect={onGenerateReport} />
          {canManage && isAdvanceReadyForLegalization(advance) && (
            <Button type="button" size="sm" onClick={onOpenReceipt} className="bg-emerald-600 text-white hover:bg-emerald-700">
              <ReceiptText size={15} className="mr-2" />
              Legalizar
            </Button>
          )}
          {canCorrect && isAdvanceReadyForLegalization(advance) && advanceReceipts.length > 0 && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={onComplete}
              disabled={!allLegalizationsApproved}
              title={!allLegalizationsApproved ? 'Todas las legalizaciones deben estar aprobadas antes del cierre.' : 'Cerrar como solicitante y enviar a conciliación.'}
              className="border-emerald-200 text-emerald-700 hover:bg-emerald-50 disabled:border-slate-200 disabled:bg-slate-50 disabled:text-slate-400"
            >
              <CheckCircle2 size={15} className="mr-2" />
              {allLegalizationsApproved ? 'Cerrar y enviar a conciliación' : `${pendingApprovalCount} por aprobar`}
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
          {canManage && (
            <Button type="button" size="sm" variant="outline" onClick={onDelete} className="border-rose-200 text-rose-700 hover:bg-rose-50">
              <Trash2 size={15} className="mr-2" />
              Eliminar
            </Button>
          )}
          <ArrowRight size={18} className="hidden text-slate-300 lg:block" />
        </div>
      </div>
    </article>
  );
}
