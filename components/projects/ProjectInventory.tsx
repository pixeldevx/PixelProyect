"use client"

import React, { useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import {
  AlertTriangle,
  Calendar,
  Camera,
  CheckCircle2,
  ClipboardList,
  DollarSign,
  Download,
  Eye,
  ImageIcon,
  MapPin,
  Package,
  Pencil,
  Plus,
  Printer,
  Search,
  Trash2,
  Upload,
  User,
  Wrench,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  addDoc,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from '@/lib/supabase/document-store';
import { ref, uploadBytes, getDownloadURL, deleteObject } from '@/lib/supabase/storage-shim';
import { db, storage } from '@/lib/backend';
import { toast } from 'sonner';

type InventoryPhoto = {
  name: string;
  url: string;
  storagePath: string;
  uploadedAt: string;
};

type InventoryItem = {
  id: string;
  name?: string;
  category?: string;
  assetCode?: string;
  serialNumber?: string;
  quantity?: number;
  location?: string;
  mapUrl?: string;
  responsibleId?: string;
  responsibleName?: string;
  condition?: string;
  status?: string;
  acquisitionDate?: string;
  estimatedValue?: number;
  observations?: string;
  needsRepair?: boolean;
  photos?: InventoryPhoto[];
  maintenanceHistory?: MaintenanceEntry[];
  createdAt?: any;
  updatedAt?: any;
};

type MaintenanceEntry = {
  id: string;
  type: string;
  date: string;
  description: string;
  technician?: string;
  cost?: number;
  result?: string;
  createdAt: string;
  createdBy?: string | null;
};

type InventoryForm = {
  name: string;
  category: string;
  assetCode: string;
  serialNumber: string;
  quantity: string;
  location: string;
  mapUrl: string;
  responsibleId: string;
  condition: string;
  status: string;
  acquisitionDate: string;
  estimatedValue: string;
  observations: string;
  needsRepair: boolean;
};

type MaintenanceForm = {
  type: string;
  date: string;
  description: string;
  technician: string;
  cost: string;
  result: string;
};

type ProjectInventoryProps = {
  projectId: string;
  project: any;
  teamMembers: any[];
  currentUser: any;
  canManage: boolean;
};

const INVENTORY_CATEGORIES = [
  'Computador',
  'Silla',
  'Mesa',
  'Monitor',
  'Impresora',
  'Celular',
  'Herramienta',
  'Equipo de campo',
  'Licencia',
  'Otro',
];

const STATUS_OPTIONS = [
  { value: 'available', label: 'Disponible', className: 'bg-emerald-50 text-emerald-700 ring-emerald-100' },
  { value: 'assigned', label: 'Asignado', className: 'bg-indigo-50 text-indigo-700 ring-indigo-100' },
  { value: 'repair', label: 'En reparación', className: 'bg-orange-50 text-orange-700 ring-orange-100' },
  { value: 'retired', label: 'Retirado', className: 'bg-slate-100 text-slate-700 ring-slate-200' },
  { value: 'lost', label: 'No localizado', className: 'bg-red-50 text-red-700 ring-red-100' },
];

const CONDITION_OPTIONS = [
  { value: 'excellent', label: 'Excelente', className: 'bg-emerald-50 text-emerald-700 ring-emerald-100' },
  { value: 'good', label: 'Bueno', className: 'bg-cyan-50 text-cyan-700 ring-cyan-100' },
  { value: 'fair', label: 'Regular', className: 'bg-amber-50 text-amber-700 ring-amber-100' },
  { value: 'damaged', label: 'Dañado', className: 'bg-red-50 text-red-700 ring-red-100' },
];

const emptyForm: InventoryForm = {
  name: '',
  category: 'Computador',
  assetCode: '',
  serialNumber: '',
  quantity: '1',
  location: '',
  mapUrl: '',
  responsibleId: '',
  condition: 'good',
  status: 'available',
  acquisitionDate: '',
  estimatedValue: '',
  observations: '',
  needsRepair: false,
};

const emptyMaintenanceForm: MaintenanceForm = {
  type: 'reparacion',
  date: new Date().toISOString().slice(0, 10),
  description: '',
  technician: '',
  cost: '',
  result: '',
};

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(Math.round(value || 0));

const formatNumber = (value: number) => new Intl.NumberFormat('es-CO').format(value || 0);

const toDate = (value: any): Date | null => {
  if (!value) return null;
  if (typeof value.toDate === 'function') return value.toDate();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const formatDate = (value: any) => {
  const date = toDate(value);
  if (!date) return 'Sin fecha';
  return new Intl.DateTimeFormat('es-CO', { day: '2-digit', month: 'short', year: 'numeric' }).format(date);
};

const getStatusMeta = (value?: string) =>
  STATUS_OPTIONS.find((status) => status.value === value) || STATUS_OPTIONS[0];

const getConditionMeta = (value?: string) =>
  CONDITION_OPTIONS.find((condition) => condition.value === value) || CONDITION_OPTIONS[1];

const normalizeMoneyInput = (value: string) => value.replace(/[^\d]/g, '');

const formatMoneyInput = (value: string) => {
  const clean = normalizeMoneyInput(value);
  if (!clean) return '';
  return new Intl.NumberFormat('es-CO').format(Number(clean));
};

const parseMoneyInput = (value: string) => Number(normalizeMoneyInput(value) || 0);

const csvEscape = (value: any) => {
  const text = String(value ?? '');
  return `"${text.replace(/"/g, '""')}"`;
};

const htmlEscape = (value: any) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

export function ProjectInventory({
  projectId,
  project,
  teamMembers,
  currentUser,
  canManage,
}: ProjectInventoryProps) {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);
  const [form, setForm] = useState<InventoryForm>(emptyForm);
  const [photoFiles, setPhotoFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const [maintenanceForm, setMaintenanceForm] = useState<MaintenanceForm>(emptyMaintenanceForm);
  const [savingMaintenance, setSavingMaintenance] = useState(false);

  const projectMemberIds = useMemo(
    () => new Set((project?.assignedTeamMembers || []).filter(Boolean)),
    [project?.assignedTeamMembers]
  );

  const projectMembers = useMemo(() => {
    const filtered = teamMembers.filter((member) => projectMemberIds.size === 0 || projectMemberIds.has(member.id));
    return filtered.length > 0 ? filtered : teamMembers;
  }, [projectMemberIds, teamMembers]);

  const memberById = useMemo(() => {
    const map = new Map<string, any>();
    teamMembers.forEach((member) => {
      if (member.id) map.set(member.id, member);
      if (member.authUserId) map.set(member.authUserId, member);
      if (member.uid) map.set(member.uid, member);
    });
    return map;
  }, [teamMembers]);

  useEffect(() => {
    if (!projectId) return;

    const inventoryQuery = query(
      collection(db, 'projects', projectId, 'inventoryItems'),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(inventoryQuery, (snapshot) => {
      setItems(snapshot.docs.map((document) => ({ id: document.id, ...document.data() } as InventoryItem)));
      setLoading(false);
    }, (error) => {
      console.error('Error loading inventory:', error);
      toast.error('No se pudo cargar el inventario.');
      setLoading(false);
    });

    return () => unsubscribe();
  }, [projectId]);

  useEffect(() => {
    setSelectedItem((current) => {
      if (!current) return current;
      return items.find((item) => item.id === current.id) || current;
    });
  }, [items]);

  const stats = useMemo(() => {
    const totalUnits = items.reduce((sum, item) => sum + Math.max(Number(item.quantity || 0), 0), 0);
    const totalValue = items.reduce((sum, item) => sum + Math.max(Number(item.estimatedValue || 0), 0) * Math.max(Number(item.quantity || 1), 1), 0);
    const repairCount = items.filter((item) => item.needsRepair || item.status === 'repair' || item.condition === 'damaged').length;
    const assignedCount = items.filter((item) => Boolean(item.responsibleId)).length;
    const locations = new Set(items.map((item) => item.location).filter(Boolean));

    return { totalUnits, totalValue, repairCount, assignedCount, locations: locations.size };
  }, [items]);

  const categories = useMemo(() => {
    const values = new Set([...INVENTORY_CATEGORIES, ...items.map((item) => item.category).filter(Boolean) as string[]]);
    return Array.from(values).sort((left, right) => left.localeCompare(right));
  }, [items]);

  const filteredItems = useMemo(() => {
    const search = searchTerm.trim().toLowerCase();
    return items.filter((item) => {
      if (categoryFilter !== 'all' && item.category !== categoryFilter) return false;
      if (statusFilter !== 'all') {
        if (statusFilter === 'repair') {
          if (!(item.needsRepair || item.status === 'repair' || item.condition === 'damaged')) return false;
        } else if (item.status !== statusFilter) {
          return false;
        }
      }

      if (!search) return true;
      const responsible = item.responsibleName || memberById.get(item.responsibleId || '')?.name || '';
      return [
        item.name,
        item.category,
        item.assetCode,
        item.serialNumber,
        item.location,
        item.observations,
        responsible,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(search));
    });
  }, [categoryFilter, items, memberById, searchTerm, statusFilter]);

  const getResponsibleLabel = (item: InventoryItem) => {
    const member = item.responsibleId ? memberById.get(item.responsibleId) : null;
    return item.responsibleName || member?.name || member?.email || 'Sin responsable';
  };

  const resetForm = () => {
    setForm(emptyForm);
    setEditingItem(null);
    setPhotoFiles([]);
    setIsFormOpen(false);
  };

  const openCreateForm = () => {
    setEditingItem(null);
    setForm(emptyForm);
    setPhotoFiles([]);
    setIsFormOpen(true);
  };

  const openEditForm = (item: InventoryItem) => {
    setEditingItem(item);
    setForm({
      name: item.name || '',
      category: item.category || 'Computador',
      assetCode: item.assetCode || '',
      serialNumber: item.serialNumber || '',
      quantity: String(item.quantity || 1),
      location: item.location || '',
      mapUrl: item.mapUrl || '',
      responsibleId: item.responsibleId || '',
      condition: item.condition || 'good',
      status: item.status || 'available',
      acquisitionDate: item.acquisitionDate || '',
      estimatedValue: item.estimatedValue ? formatMoneyInput(String(item.estimatedValue)) : '',
      observations: item.observations || '',
      needsRepair: Boolean(item.needsRepair),
    });
    setPhotoFiles([]);
    setIsFormOpen(true);
  };

  const uploadPhotos = async (files: File[]) => {
    const uploaded: InventoryPhoto[] = [];

    for (const [index, file] of files.entries()) {
      const safeName = file.name.replace(/[^\w.\-]+/g, '_');
      const storagePath = `projects/${projectId}/inventory/${Date.now()}_${index}_${safeName}`;
      const storageRef = ref(storage, storagePath);
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);
      uploaded.push({
        name: file.name,
        url,
        storagePath: storageRef.fullPath,
        uploadedAt: new Date().toISOString(),
      });
    }

    return uploaded;
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!canManage) {
      toast.error('No tienes permisos para administrar el inventario.');
      return;
    }

    const cleanName = form.name.trim();
    const cleanCategory = form.category.trim();
    const quantity = Math.max(Number(form.quantity || 1), 1);

    if (!cleanName || !cleanCategory) {
      toast.warning('Ingresa nombre y categoría del activo.');
      return;
    }

    setSaving(true);
    try {
      const uploadedPhotos = await uploadPhotos(photoFiles);
      const responsibleMember = form.responsibleId ? memberById.get(form.responsibleId) : null;
      const payload = {
        name: cleanName,
        category: cleanCategory,
        assetCode: form.assetCode.trim(),
        serialNumber: form.serialNumber.trim(),
        quantity,
        location: form.location.trim(),
        mapUrl: form.mapUrl.trim(),
        responsibleId: form.responsibleId || null,
        responsibleName: responsibleMember?.name || responsibleMember?.email || null,
        condition: form.condition,
        status: form.needsRepair ? 'repair' : form.status,
        acquisitionDate: form.acquisitionDate || null,
        estimatedValue: parseMoneyInput(form.estimatedValue),
        observations: form.observations.trim(),
        needsRepair: form.needsRepair,
        updatedAt: serverTimestamp(),
        updatedBy: currentUser?.uid || null,
      };

      if (editingItem) {
        await updateDoc(doc(db, 'projects', projectId, 'inventoryItems', editingItem.id), {
          ...payload,
          photos: [...(editingItem.photos || []), ...uploadedPhotos],
        });
        toast.success('Activo actualizado.');
      } else {
        await addDoc(collection(db, 'projects', projectId, 'inventoryItems'), {
          ...payload,
          photos: uploadedPhotos,
          maintenanceHistory: [],
          createdAt: serverTimestamp(),
          createdBy: currentUser?.uid || null,
        });
        toast.success('Activo agregado al inventario.');
      }

      resetForm();
    } catch (error: any) {
      console.error('Error saving inventory item:', error);
      toast.error(error?.message || 'No se pudo guardar el activo.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (item: InventoryItem) => {
    if (!canManage) return;
    const confirmed = window.confirm(`Eliminar "${item.name || 'activo'}" del inventario?`);
    if (!confirmed) return;

    try {
      for (const photo of item.photos || []) {
        if (photo.storagePath) {
          await deleteObject(ref(storage, photo.storagePath));
        }
      }
      await deleteDoc(doc(db, 'projects', projectId, 'inventoryItems', item.id));
      if (selectedItem?.id === item.id) setSelectedItem(null);
      toast.success('Activo eliminado.');
    } catch (error: any) {
      console.error('Error deleting inventory item:', error);
      toast.error(error?.message || 'No se pudo eliminar el activo.');
    }
  };

  const handleMaintenanceSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedItem || !canManage) return;

    const description = maintenanceForm.description.trim();
    if (!description) {
      toast.warning('Describe la intervención o novedad del activo.');
      return;
    }

    const entry: MaintenanceEntry = {
      id: `${selectedItem.id}-${Date.now()}`,
      type: maintenanceForm.type,
      date: maintenanceForm.date || new Date().toISOString().slice(0, 10),
      description,
      technician: maintenanceForm.technician.trim(),
      cost: parseMoneyInput(maintenanceForm.cost),
      result: maintenanceForm.result.trim(),
      createdAt: new Date().toISOString(),
      createdBy: currentUser?.uid || null,
    };

    setSavingMaintenance(true);
    try {
      await updateDoc(doc(db, 'projects', projectId, 'inventoryItems', selectedItem.id), {
        maintenanceHistory: arrayUnion(entry),
        needsRepair: maintenanceForm.type === 'reparacion' ? false : selectedItem.needsRepair,
        status: maintenanceForm.type === 'reparacion' ? 'assigned' : selectedItem.status,
        condition: maintenanceForm.type === 'reparacion' && selectedItem.condition === 'damaged' ? 'good' : selectedItem.condition,
        updatedAt: serverTimestamp(),
      });
      setSelectedItem((current) => current ? {
        ...current,
        maintenanceHistory: [...(current.maintenanceHistory || []), entry],
        needsRepair: maintenanceForm.type === 'reparacion' ? false : current.needsRepair,
        status: maintenanceForm.type === 'reparacion' ? 'assigned' : current.status,
        condition: maintenanceForm.type === 'reparacion' && current.condition === 'damaged' ? 'good' : current.condition,
      } : current);
      setMaintenanceForm(emptyMaintenanceForm);
      toast.success('Hoja de vida actualizada.');
    } catch (error: any) {
      console.error('Error saving maintenance history:', error);
      toast.error(error?.message || 'No se pudo registrar la novedad.');
    } finally {
      setSavingMaintenance(false);
    }
  };

  const buildReportRows = () =>
    filteredItems.map((item) => ({
      activo: item.name || '',
      categoria: item.category || '',
      codigo: item.assetCode || '',
      serial: item.serialNumber || '',
      cantidad: item.quantity || 1,
      responsable: getResponsibleLabel(item),
      ubicacion: item.location || '',
      estado: getStatusMeta(item.status).label,
      condicion: getConditionMeta(item.condition).label,
      requiereReparacion: item.needsRepair ? 'Si' : 'No',
      valor: item.estimatedValue || 0,
      observaciones: item.observations || '',
    }));

  const downloadCsvReport = () => {
    const headers = ['Activo', 'Categoría', 'Código', 'Serial', 'Cantidad', 'Responsable', 'Ubicación', 'Estado', 'Condición', 'Requiere reparación', 'Valor unitario', 'Observaciones'];
    const rows = buildReportRows();
    const csv = [
      headers.map(csvEscape).join(','),
      ...rows.map((row) => [
        row.activo,
        row.categoria,
        row.codigo,
        row.serial,
        row.cantidad,
        row.responsable,
        row.ubicacion,
        row.estado,
        row.condicion,
        row.requiereReparacion,
        row.valor,
        row.observaciones,
      ].map(csvEscape).join(',')),
    ].join('\n');

    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `inventario-${project?.name || projectId}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const openPrintReport = () => {
    const rows = buildReportRows();
    const reportProjectName = htmlEscape(project?.name || 'Proyecto');
    const generatedAt = htmlEscape(new Date().toLocaleString('es-CO'));
    const html = `
      <!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>Reporte de inventario - ${reportProjectName}</title>
          <style>
            body { font-family: Arial, sans-serif; color: #0f172a; margin: 32px; }
            h1 { margin-bottom: 4px; }
            .muted { color: #64748b; }
            .stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin: 24px 0; }
            .stat { border: 1px solid #e2e8f0; border-radius: 10px; padding: 14px; }
            .stat strong { display: block; font-size: 22px; margin-top: 8px; }
            table { width: 100%; border-collapse: collapse; font-size: 12px; }
            th, td { border-bottom: 1px solid #e2e8f0; padding: 9px; text-align: left; vertical-align: top; }
            th { background: #f8fafc; color: #475569; text-transform: uppercase; font-size: 10px; letter-spacing: .08em; }
            .repair { color: #b91c1c; font-weight: 700; }
          </style>
        </head>
        <body>
          <p class="muted">Pixel Project · Reporte de inventario</p>
          <h1>${reportProjectName}</h1>
          <p class="muted">Generado el ${generatedAt}</p>
          <div class="stats">
            <div class="stat">Unidades<strong>${formatNumber(stats.totalUnits)}</strong></div>
            <div class="stat">Valor estimado<strong>${formatCurrency(stats.totalValue)}</strong></div>
            <div class="stat">Reparación<strong>${formatNumber(stats.repairCount)}</strong></div>
            <div class="stat">Ubicaciones<strong>${formatNumber(stats.locations)}</strong></div>
          </div>
          <table>
            <thead>
              <tr>
                <th>Activo</th><th>Categoría</th><th>Código</th><th>Responsable</th><th>Ubicación</th><th>Estado</th><th>Valor</th>
              </tr>
            </thead>
            <tbody>
              ${rows.map((row) => `
                <tr>
                  <td><strong>${htmlEscape(row.activo)}</strong><br/><span class="muted">${htmlEscape(row.serial || row.observaciones)}</span></td>
                  <td>${htmlEscape(row.categoria)}</td>
                  <td>${htmlEscape(row.codigo)}</td>
                  <td>${htmlEscape(row.responsable)}</td>
                  <td>${htmlEscape(row.ubicacion)}</td>
                  <td class="${row.requiereReparacion === 'Si' ? 'repair' : ''}">${htmlEscape(row.estado)} · ${htmlEscape(row.condicion)}</td>
                  <td>${formatCurrency(Number(row.valor || 0))}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </body>
      </html>
    `;

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      toast.error('El navegador bloqueó la ventana del reporte.');
      return;
    }
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
    window.setTimeout(() => printWindow.print(), 250);
  };

  return (
    <div className="space-y-5">
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="relative border-b border-slate-100 bg-slate-950 px-5 py-5 text-white">
          <div className="absolute inset-0 opacity-40 [background-image:linear-gradient(90deg,rgba(255,255,255,.08)_1px,transparent_1px),linear-gradient(rgba(255,255,255,.08)_1px,transparent_1px)] [background-size:22px_22px]" />
          <div className="relative flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-3xl">
              <div className="inline-flex items-center gap-2 rounded-md bg-cyan-400/10 px-3 py-1 text-xs font-black uppercase tracking-[0.16em] text-cyan-200 ring-1 ring-cyan-300/20">
                <Package size={14} />
                Inventario inteligente
              </div>
              <h2 className="mt-3 text-2xl font-black tracking-tight">Inventario del proyecto</h2>
              <p className="mt-2 text-sm font-medium leading-6 text-slate-300">
                Controla activos, responsables, fotos, ubicación y hoja de vida operativa de cada elemento del proyecto.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" onClick={downloadCsvReport} className="border-white/15 bg-white/10 text-white hover:bg-white/15">
                <Download size={16} className="mr-2" />
                CSV
              </Button>
              <Button type="button" variant="outline" onClick={openPrintReport} className="border-white/15 bg-white/10 text-white hover:bg-white/15">
                <Printer size={16} className="mr-2" />
                Reporte
              </Button>
              {canManage && (
                <Button type="button" onClick={openCreateForm} className="bg-cyan-400 font-black text-slate-950 hover:bg-cyan-300">
                  <Plus size={16} className="mr-2" />
                  Nuevo activo
                </Button>
              )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-px bg-slate-100 md:grid-cols-5">
          {[
            { label: 'Unidades', value: formatNumber(stats.totalUnits), icon: <Package size={18} />, tone: 'text-indigo-700 bg-indigo-50' },
            { label: 'Valor estimado', value: formatCurrency(stats.totalValue), icon: <DollarSign size={18} />, tone: 'text-emerald-700 bg-emerald-50' },
            { label: 'Responsables', value: `${formatNumber(stats.assignedCount)}/${formatNumber(items.length)}`, icon: <User size={18} />, tone: 'text-cyan-700 bg-cyan-50' },
            { label: 'Reparación', value: formatNumber(stats.repairCount), icon: <Wrench size={18} />, tone: 'text-orange-700 bg-orange-50' },
            { label: 'Ubicaciones', value: formatNumber(stats.locations), icon: <MapPin size={18} />, tone: 'text-slate-700 bg-slate-50' },
          ].map((stat) => (
            <div key={stat.label} className="bg-white p-4">
              <div className={`mb-3 inline-flex h-9 w-9 items-center justify-center rounded-lg ${stat.tone}`}>
                {stat.icon}
              </div>
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">{stat.label}</p>
              <p className="mt-1 text-xl font-black text-slate-950">{stat.value}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid gap-3 lg:grid-cols-[1fr_220px_220px]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Buscar por activo, código, serial, ubicación o responsable..."
              className="h-11 w-full rounded-lg border border-slate-200 bg-white pl-10 pr-3 text-sm font-semibold text-slate-700 outline-none transition focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10"
            />
          </div>
          <select
            value={categoryFilter}
            onChange={(event) => setCategoryFilter(event.target.value)}
            className="h-11 rounded-lg border border-slate-200 bg-white px-3 text-sm font-bold text-slate-600 outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10"
          >
            <option value="all">Todas las categorías</option>
            {categories.map((category) => (
              <option key={category} value={category}>{category}</option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            className="h-11 rounded-lg border border-slate-200 bg-white px-3 text-sm font-bold text-slate-600 outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10"
          >
            <option value="all">Todos los estados</option>
            {STATUS_OPTIONS.map((status) => (
              <option key={status.value} value={status.value}>{status.label}</option>
            ))}
          </select>
        </div>
      </section>

      {isFormOpen && canManage && (
        <section className="rounded-xl border border-indigo-100 bg-indigo-50/30 p-5 shadow-sm">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.16em] text-indigo-600">
                  {editingItem ? 'Editar activo' : 'Nuevo activo'}
                </p>
                <h3 className="mt-1 text-lg font-black text-slate-950">
                  {editingItem ? editingItem.name : 'Registrar elemento de inventario'}
                </h3>
              </div>
              <button type="button" onClick={resetForm} className="rounded-md p-2 text-slate-400 transition hover:bg-white hover:text-slate-700">
                <X size={18} />
              </button>
            </div>

            <div className="grid gap-4 lg:grid-cols-4">
              <Field label="Nombre del activo *" className="lg:col-span-2">
                <input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} className={inputClass} placeholder="Ej. Portátil Dell, silla ergonómica, mesa sala 1" />
              </Field>
              <Field label="Categoría">
                <input list="inventory-categories" value={form.category} onChange={(event) => setForm((current) => ({ ...current, category: event.target.value }))} className={inputClass} />
                <datalist id="inventory-categories">
                  {categories.map((category) => <option key={category} value={category} />)}
                </datalist>
              </Field>
              <Field label="Cantidad">
                <input type="number" min={1} value={form.quantity} onChange={(event) => setForm((current) => ({ ...current, quantity: event.target.value }))} className={inputClass} />
              </Field>
              <Field label="Código interno">
                <input value={form.assetCode} onChange={(event) => setForm((current) => ({ ...current, assetCode: event.target.value }))} className={inputClass} placeholder="INV-001" />
              </Field>
              <Field label="Serial">
                <input value={form.serialNumber} onChange={(event) => setForm((current) => ({ ...current, serialNumber: event.target.value }))} className={inputClass} placeholder="Serial o placa" />
              </Field>
              <Field label="Responsable">
                <select value={form.responsibleId} onChange={(event) => setForm((current) => ({ ...current, responsibleId: event.target.value }))} className={inputClass}>
                  <option value="">Sin responsable</option>
                  {projectMembers.map((member) => (
                    <option key={member.id} value={member.id}>{member.name || member.email}</option>
                  ))}
                </select>
              </Field>
              <Field label="Valor unitario">
                <input value={form.estimatedValue} onChange={(event) => setForm((current) => ({ ...current, estimatedValue: formatMoneyInput(event.target.value) }))} className={inputClass} placeholder="0" />
              </Field>
              <Field label="Ubicación física" className="lg:col-span-2">
                <input value={form.location} onChange={(event) => setForm((current) => ({ ...current, location: event.target.value }))} className={inputClass} placeholder="Bodega, oficina, ciudad, coordenadas..." />
              </Field>
              <Field label="Link de localización" className="lg:col-span-2">
                <input value={form.mapUrl} onChange={(event) => setForm((current) => ({ ...current, mapUrl: event.target.value }))} className={inputClass} placeholder="Google Maps, Drive o evidencia externa" />
              </Field>
              <Field label="Estado">
                <select value={form.status} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value }))} className={inputClass}>
                  {STATUS_OPTIONS.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}
                </select>
              </Field>
              <Field label="Condición">
                <select value={form.condition} onChange={(event) => setForm((current) => ({ ...current, condition: event.target.value }))} className={inputClass}>
                  {CONDITION_OPTIONS.map((condition) => <option key={condition.value} value={condition.value}>{condition.label}</option>)}
                </select>
              </Field>
              <Field label="Fecha de adquisición">
                <input type="date" value={form.acquisitionDate} onChange={(event) => setForm((current) => ({ ...current, acquisitionDate: event.target.value }))} className={inputClass} />
              </Field>
              <Field label="Fotos">
                <label className="flex h-11 cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-indigo-200 bg-white px-3 text-sm font-black text-indigo-700 transition hover:bg-indigo-50">
                  <Upload size={16} />
                  {photoFiles.length > 0 ? `${photoFiles.length} archivo(s)` : 'Subir fotos'}
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={(event) => setPhotoFiles(Array.from(event.target.files || []))}
                  />
                </label>
              </Field>
              <label className="flex items-center gap-3 rounded-lg border border-orange-100 bg-orange-50 px-3 py-3 text-sm font-black text-orange-800">
                <input
                  type="checkbox"
                  checked={form.needsRepair}
                  onChange={(event) => setForm((current) => ({ ...current, needsRepair: event.target.checked }))}
                  className="h-4 w-4 rounded border-orange-300 text-orange-600"
                />
                Requiere reparación
              </label>
              <Field label="Observaciones" className="lg:col-span-4">
                <textarea value={form.observations} onChange={(event) => setForm((current) => ({ ...current, observations: event.target.value }))} className={`${inputClass} min-h-24 resize-y py-3`} placeholder="Estado, accesorios, garantías, novedades o restricciones de uso." />
              </Field>
            </div>

            <div className="flex justify-end gap-2 border-t border-indigo-100 pt-4">
              <Button type="button" variant="outline" onClick={resetForm}>Cancelar</Button>
              <Button type="submit" disabled={saving} className="bg-indigo-600 font-black text-white hover:bg-indigo-700">
                {saving ? 'Guardando...' : editingItem ? 'Guardar cambios' : 'Crear activo'}
              </Button>
            </div>
          </form>
        </section>
      )}

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <div>
            <h3 className="font-black text-slate-950">Activos registrados</h3>
            <p className="text-xs font-semibold text-slate-500">{formatNumber(filteredItems.length)} visibles de {formatNumber(items.length)} activos</p>
          </div>
          {stats.repairCount > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-orange-50 px-3 py-1 text-xs font-black text-orange-700 ring-1 ring-orange-100">
              <AlertTriangle size={14} />
              {stats.repairCount} con novedad
            </span>
          )}
        </div>

        {loading ? (
          <div className="flex justify-center py-14">
            <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-indigo-600" />
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="py-16 text-center">
            <Package className="mx-auto h-12 w-12 text-slate-300" />
            <h3 className="mt-3 text-lg font-black text-slate-950">No hay activos para mostrar</h3>
            <p className="mt-1 text-sm font-medium text-slate-500">Crea el primer activo o ajusta los filtros de búsqueda.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {filteredItems.map((item) => {
              const status = getStatusMeta(item.status);
              const condition = getConditionMeta(item.condition);
              const firstPhoto = item.photos?.[0];
              return (
                <div key={item.id} className="grid gap-4 px-4 py-4 transition hover:bg-slate-50 xl:grid-cols-[minmax(320px,1.5fr)_repeat(4,minmax(120px,1fr))_auto] xl:items-center">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="relative flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-slate-100 ring-1 ring-slate-200">
                      {firstPhoto?.url ? (
                        <Image src={firstPhoto.url} alt={item.name || 'Activo'} fill className="object-cover" />
                      ) : (
                        <ImageIcon size={22} className="text-slate-400" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate text-base font-black text-slate-950">{item.name || 'Activo sin nombre'}</p>
                        {item.needsRepair && (
                          <span className="rounded bg-orange-50 px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.12em] text-orange-700 ring-1 ring-orange-100">
                            Reparación
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-xs font-bold text-slate-500">
                        {item.category || 'Sin categoría'} · {item.assetCode || item.serialNumber || 'Sin código'}
                      </p>
                    </div>
                  </div>

                  <MetricCell label="Responsable" value={getResponsibleLabel(item)} />
                  <MetricCell label="Ubicación" value={item.location || 'Sin ubicación'} />
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">Estado</p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      <span className={`rounded px-2 py-1 text-xs font-black ring-1 ${status.className}`}>{status.label}</span>
                      <span className={`rounded px-2 py-1 text-xs font-black ring-1 ${condition.className}`}>{condition.label}</span>
                    </div>
                  </div>
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">Cantidad / Valor</p>
                    <p className="mt-1 text-sm font-black text-slate-950">{formatNumber(Number(item.quantity || 1))} unidad(es)</p>
                    <p className="text-xs font-bold text-slate-500">{formatCurrency(Number(item.estimatedValue || 0))}</p>
                  </div>

                  <div className="flex justify-end gap-2">
                    <Button type="button" variant="outline" size="sm" onClick={() => setSelectedItem(item)} className="h-9 border-slate-200">
                      <Eye size={14} />
                      Detalle
                    </Button>
                    {canManage && (
                      <>
                        <button type="button" onClick={() => openEditForm(item)} className="rounded-md p-2 text-slate-400 transition hover:bg-indigo-50 hover:text-indigo-600" title="Editar">
                          <Pencil size={16} />
                        </button>
                        <button type="button" onClick={() => handleDelete(item)} className="rounded-md p-2 text-slate-400 transition hover:bg-red-50 hover:text-red-600" title="Eliminar">
                          <Trash2 size={16} />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {selectedItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm">
          <div className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 p-5">
              <div className="min-w-0">
                <p className="text-xs font-black uppercase tracking-[0.16em] text-indigo-600">Ficha de activo</p>
                <h3 className="truncate text-2xl font-black tracking-tight text-slate-950">{selectedItem.name || 'Activo'}</h3>
                <p className="mt-1 text-sm font-bold text-slate-500">{selectedItem.category || 'Sin categoría'} · {selectedItem.assetCode || selectedItem.serialNumber || 'Sin código'}</p>
              </div>
              <button type="button" onClick={() => setSelectedItem(null)} className="rounded-md p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700">
                <X size={22} />
              </button>
            </div>

            <div className="grid min-h-0 flex-1 overflow-y-auto lg:grid-cols-[0.9fr_1.1fr]">
              <div className="border-b border-slate-200 p-5 lg:border-b-0 lg:border-r">
                <div className="grid grid-cols-2 gap-2">
                  {(selectedItem.photos || []).length === 0 ? (
                    <div className="col-span-2 flex min-h-64 items-center justify-center rounded-xl bg-slate-100 text-slate-400">
                      <Camera size={42} />
                    </div>
                  ) : (
                    (selectedItem.photos || []).slice(0, 4).map((photo, index) => (
                      <div key={`${photo.storagePath}-${index}`} className={`relative overflow-hidden rounded-xl bg-slate-100 ${index === 0 ? 'col-span-2 h-64' : 'h-28'}`}>
                        <Image src={photo.url} alt={photo.name || selectedItem.name || 'Foto'} fill className="object-cover" />
                      </div>
                    ))
                  )}
                </div>

                <div className="mt-4 grid grid-cols-2 gap-2">
                  <InfoTile label="Responsable" value={getResponsibleLabel(selectedItem)} icon={<User size={16} />} />
                  <InfoTile label="Cantidad" value={formatNumber(Number(selectedItem.quantity || 1))} icon={<Package size={16} />} />
                  <InfoTile label="Valor unitario" value={formatCurrency(Number(selectedItem.estimatedValue || 0))} icon={<DollarSign size={16} />} />
                  <InfoTile label="Adquisición" value={formatDate(selectedItem.acquisitionDate)} icon={<Calendar size={16} />} />
                </div>

                <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <h4 className="flex items-center gap-2 text-sm font-black text-slate-950">
                    <MapPin size={16} className="text-indigo-600" />
                    Localización
                  </h4>
                  <p className="mt-2 text-sm font-semibold text-slate-600">{selectedItem.location || 'Sin ubicación registrada.'}</p>
                  {selectedItem.mapUrl && (
                    <a href={selectedItem.mapUrl} target="_blank" rel="noreferrer" className="mt-3 inline-flex text-sm font-black text-indigo-700 hover:text-indigo-900">
                      Abrir ubicación
                    </a>
                  )}
                </div>

                {selectedItem.observations && (
                  <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4">
                    <h4 className="text-sm font-black text-slate-950">Observaciones</h4>
                    <p className="mt-2 whitespace-pre-wrap text-sm font-medium leading-6 text-slate-600">{selectedItem.observations}</p>
                  </div>
                )}
              </div>

              <div className="p-5">
                <div className="flex flex-wrap gap-2">
                  <span className={`rounded px-3 py-1.5 text-xs font-black ring-1 ${getStatusMeta(selectedItem.status).className}`}>
                    {getStatusMeta(selectedItem.status).label}
                  </span>
                  <span className={`rounded px-3 py-1.5 text-xs font-black ring-1 ${getConditionMeta(selectedItem.condition).className}`}>
                    {getConditionMeta(selectedItem.condition).label}
                  </span>
                  {selectedItem.needsRepair && (
                    <span className="rounded bg-orange-50 px-3 py-1.5 text-xs font-black text-orange-700 ring-1 ring-orange-100">
                      Requiere reparación
                    </span>
                  )}
                </div>

                <section className="mt-5 rounded-xl border border-slate-200 bg-white">
                  <div className="border-b border-slate-100 p-4">
                    <h4 className="flex items-center gap-2 text-lg font-black text-slate-950">
                      <ClipboardList size={18} className="text-indigo-600" />
                      Hoja de vida
                    </h4>
                    <p className="mt-1 text-sm font-medium text-slate-500">Intervenciones, reparaciones, inspecciones y novedades del activo.</p>
                  </div>

                  <div className="max-h-72 divide-y divide-slate-100 overflow-y-auto">
                    {(selectedItem.maintenanceHistory || []).length === 0 ? (
                      <div className="p-6 text-center text-sm font-medium text-slate-500">Sin eventos registrados.</div>
                    ) : (
                      [...(selectedItem.maintenanceHistory || [])]
                        .sort((left, right) => String(right.date || '').localeCompare(String(left.date || '')))
                        .map((entry) => (
                          <div key={entry.id} className="p-4">
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <span className="rounded bg-indigo-50 px-2 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-indigo-700 ring-1 ring-indigo-100">
                                  {entry.type || 'Novedad'}
                                </span>
                                <p className="mt-2 text-sm font-black text-slate-950">{entry.description}</p>
                                <p className="mt-1 text-xs font-bold text-slate-500">
                                  {formatDate(entry.date)} · {entry.technician || 'Sin técnico'} {entry.cost ? `· ${formatCurrency(Number(entry.cost))}` : ''}
                                </p>
                              </div>
                              {entry.result && <CheckCircle2 size={18} className="text-emerald-600" />}
                            </div>
                            {entry.result && <p className="mt-2 text-xs font-semibold text-slate-500">{entry.result}</p>}
                          </div>
                        ))
                    )}
                  </div>
                </section>

                {canManage && (
                  <form onSubmit={handleMaintenanceSubmit} className="mt-5 rounded-xl border border-indigo-100 bg-indigo-50/30 p-4">
                    <h4 className="flex items-center gap-2 text-sm font-black text-slate-950">
                      <Wrench size={16} className="text-indigo-600" />
                      Registrar novedad
                    </h4>
                    <div className="mt-3 grid gap-3 md:grid-cols-2">
                      <select value={maintenanceForm.type} onChange={(event) => setMaintenanceForm((current) => ({ ...current, type: event.target.value }))} className={inputClass}>
                        <option value="reparacion">Reparación</option>
                        <option value="inspeccion">Inspección</option>
                        <option value="traslado">Traslado</option>
                        <option value="mantenimiento">Mantenimiento</option>
                        <option value="novedad">Novedad</option>
                      </select>
                      <input type="date" value={maintenanceForm.date} onChange={(event) => setMaintenanceForm((current) => ({ ...current, date: event.target.value }))} className={inputClass} />
                      <input value={maintenanceForm.technician} onChange={(event) => setMaintenanceForm((current) => ({ ...current, technician: event.target.value }))} className={inputClass} placeholder="Responsable o proveedor" />
                      <input value={maintenanceForm.cost} onChange={(event) => setMaintenanceForm((current) => ({ ...current, cost: formatMoneyInput(event.target.value) }))} className={inputClass} placeholder="Costo" />
                      <textarea value={maintenanceForm.description} onChange={(event) => setMaintenanceForm((current) => ({ ...current, description: event.target.value }))} className={`${inputClass} min-h-20 resize-y py-3 md:col-span-2`} placeholder="Qué pasó, qué se reparó o qué novedad se encontró." />
                      <input value={maintenanceForm.result} onChange={(event) => setMaintenanceForm((current) => ({ ...current, result: event.target.value }))} className={`${inputClass} md:col-span-2`} placeholder="Resultado o recomendación" />
                    </div>
                    <div className="mt-3 flex justify-end">
                      <Button type="submit" disabled={savingMaintenance} className="bg-indigo-600 font-black text-white hover:bg-indigo-700">
                        {savingMaintenance ? 'Guardando...' : 'Agregar a hoja de vida'}
                      </Button>
                    </div>
                  </form>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const inputClass =
  'h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 disabled:bg-slate-50';

function Field({
  label,
  children,
  className = '',
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={`space-y-1.5 ${className}`}>
      <span className="text-xs font-black uppercase tracking-[0.12em] text-slate-500">{label}</span>
      {children}
    </label>
  );
}

function MetricCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">{label}</p>
      <p className="mt-1 truncate text-sm font-black text-slate-700">{value}</p>
    </div>
  );
}

function InfoTile({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="flex items-center gap-2 text-slate-400">{icon}</div>
      <p className="mt-2 text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">{label}</p>
      <p className="mt-1 break-words text-sm font-black text-slate-950">{value}</p>
    </div>
  );
}
