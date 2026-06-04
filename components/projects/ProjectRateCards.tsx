import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { CreditCard, Plus, Trash2, AlertCircle, X, TrendingUp, Users, FileText, Download } from 'lucide-react';
import { collection, query, onSnapshot, addDoc, deleteDoc, doc, serverTimestamp } from '@/lib/supabase/document-store';
import { db } from '@/lib/backend';
import { toast } from 'sonner';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import {
  formatRateCardRate,
  formatRateCardUnits,
  formatRateCardValue,
  isCurrencyRateCard,
  normalizeDecimalInput,
  normalizeRateCardValueType,
} from '@/lib/rate-card-config';

export function ProjectRateCards({ projectId, currentUser, tasks = [], teamMembers = [], budgetLines = [] }: { projectId: string, currentUser: any, tasks?: any[], teamMembers?: any[], budgetLines?: any[] }) {
  const [rateCards, setRateCards] = useState<any[]>([]);
  const [name, setName] = useState('');
  const [indicator, setIndicator] = useState('');
  const [rate, setRate] = useState('');
  const [rateType, setRateType] = useState<'currency' | 'unit'>('currency');
  const [currency, setCurrency] = useState('USD');
  const [unitLabel, setUnitLabel] = useState('');
  const [syncExternal, setSyncExternal] = useState(false);
  const [budgetLineId, setBudgetLineId] = useState('');
  const [currentValue, setCurrentValue] = useState('');
  const [loading, setLoading] = useState(false);
  const [rateCardToDelete, setRateCardToDelete] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [rateCardToEdit, setRateCardToEdit] = useState<any>(null);
  const [rateCardEntries, setRateCardEntries] = useState<any[]>([]);
  const [reportStartDate, setReportStartDate] = useState('');
  const [reportEndDate, setReportEndDate] = useState('');
  const [reportGenerated, setReportGenerated] = useState(false);

  useEffect(() => {
    const q = query(collection(db, 'projects', projectId, 'rateCards'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      data.sort((a: any, b: any) => (b.createdAt?.toMillis() || 0) - (a.createdAt?.toMillis() || 0));
      setRateCards(data);
    });
    return () => unsubscribe();
  }, [projectId]);

  useEffect(() => {
    const q = query(collection(db, 'projects', projectId, 'rateCardEntries'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      data.sort((a: any, b: any) => {
        const right = b.createdAt?.toMillis?.() || Date.parse(b.createdAt || b.dateKey || '') || 0;
        const left = a.createdAt?.toMillis?.() || Date.parse(a.createdAt || a.dateKey || '') || 0;
        return right - left;
      });
      setRateCardEntries(data);
    });
    return () => unsubscribe();
  }, [projectId]);

  // Calculate data for charts and totals
  const userTotals: Record<string, { name: string; value: number; reworkValue: number }> = {};
  const cardTotals: { name: string; value: number; reworkValue: number }[] = [];
  let totalProjectGenerated = 0;
  let totalProjectRework = 0;

  const cardComputedUserStats: Record<string, Record<string, number>> = {};
  let unitRateCardCount = 0;

  rateCards.forEach(card => {
    let cardTotalUnits = 0;
    const computedUserStats: Record<string, number> = { ...(card.userStats || {}) };

    if (card.syncExternal) {
      cardTotalUnits = card.currentValue || 0;
    } else {
      cardTotalUnits = card.currentValue || 0;
      tasks.forEach(task => {
        if (!task.isRateCardTask && task.indicator && task.indicator.toLowerCase() === card.indicator.toLowerCase()) {
          const value = task.indicatorValue || 0;
          const progress = task.progress || 0;
          const units = value * (progress / 100);
          cardTotalUnits += units;
          
          if (units > 0 && task.assignedTo) {
            computedUserStats[task.assignedTo] = (computedUserStats[task.assignedTo] || 0) + units;
          }
        }
      });
      
      let userStatsTotal = 0;
      userStatsTotal = Object.values(computedUserStats).reduce((sum: number, val: any) => sum + (Number(val) || 0), 0);
      
      if (userStatsTotal > cardTotalUnits) {
        cardTotalUnits = userStatsTotal;
      }
    }
    
    cardComputedUserStats[card.id] = computedUserStats;

    const cardTotalValue = cardTotalUnits * Number(card.rate || 0);
    const cardReworkValue = Number(card.reworkValue || 0) * Number(card.rate || 0);

    if (isCurrencyRateCard(card)) {
      totalProjectGenerated += cardTotalValue;
      totalProjectRework += cardReworkValue;
    } else {
      unitRateCardCount += 1;
    }
    
    cardTotals.push({ name: card.name, value: cardTotalValue, reworkValue: cardReworkValue });

    Object.entries(computedUserStats).forEach(([userId, units]: [string, any]) => {
      const member = teamMembers.find(m => m.id === userId);
      const userName = member ? member.name : 'Usuario Desconocido';
      const value = units * Number(card.rate || 0);
      
      if (!userTotals[userId]) {
        userTotals[userId] = { name: userName, value: 0, reworkValue: 0 };
      }
      if (isCurrencyRateCard(card)) userTotals[userId].value += value;
    });
    
    if (card.userReworkStats) {
      Object.entries(card.userReworkStats).forEach(([userId, units]: [string, any]) => {
        const member = teamMembers.find(m => m.id === userId);
        const userName = member ? member.name : 'Usuario Desconocido';
        const value = units * Number(card.rate || 0);
        
        if (!userTotals[userId]) {
          userTotals[userId] = { name: userName, value: 0, reworkValue: 0 };
        }
        if (isCurrencyRateCard(card)) userTotals[userId].reworkValue += value;
      });
    }
  });

  const userChartData = Object.values(userTotals).sort((a, b) => b.value - a.value);
  const COLORS = ['#4f46e5', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4'];

  const getEntryDateKey = (entry: any) => {
    if (entry.dateKey) return entry.dateKey;
    const createdAt = entry.createdAt?.toDate ? entry.createdAt.toDate() : entry.createdAt ? new Date(entry.createdAt) : null;
    return createdAt && !Number.isNaN(createdAt.getTime()) ? createdAt.toISOString().slice(0, 10) : '';
  };

  const formatReportDate = (dateKey: string) => {
    if (!dateKey) return 'Sin fecha';
    const [year, month, day] = dateKey.split('-').map(Number);
    const date = new Date(year, (month || 1) - 1, day || 1);
    return date.toLocaleDateString('es-CO', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  };

  const getMemberName = (memberId: string) =>
    teamMembers.find(member => member.id === memberId)?.name || 'Usuario desconocido';

  const getRateCardById = (rateCardId: string) =>
    rateCards.find(card => card.id === rateCardId);

  const handleGenerateReport = () => {
    if (!reportStartDate || !reportEndDate) {
      toast.warning('Selecciona fecha inicial y fecha final para generar el informe.');
      return;
    }

    if (reportEndDate < reportStartDate) {
      toast.warning('La fecha final no puede ser anterior a la fecha inicial.');
      return;
    }

    setReportGenerated(true);
  };

  const reportRows = reportGenerated
    ? rateCardEntries
      .map(entry => {
        const dateKey = getEntryDateKey(entry);
        const card = getRateCardById(entry.rateCardId);
        const units = Number(entry.units || 0);
        const rateCardContext = card || entry;
        return {
          ...entry,
          dateKey,
          personName: getMemberName(entry.assignedTo),
          rateCardName: card?.name || 'Rate Card eliminado',
          indicator: rateCardContext?.indicator || 'unidades',
          rateType: normalizeRateCardValueType(rateCardContext?.rateType || rateCardContext?.valueType),
          unitLabel: rateCardContext?.unitLabel || rateCardContext?.measureUnit || 'unidades',
          currency: rateCardContext?.currency || 'USD',
          value: units * Number(rateCardContext?.rate || 0),
          units,
        };
      })
      .filter(entry => entry.dateKey && entry.dateKey >= reportStartDate && entry.dateKey <= reportEndDate)
      .sort((a, b) => b.dateKey.localeCompare(a.dateKey) || a.personName.localeCompare(b.personName))
    : [];

  const reportSummaryRows = Object.values(reportRows.reduce((acc: Record<string, any>, entry: any) => {
    const key = `${entry.assignedTo || 'unknown'}::${entry.rateCardId || 'unknown'}`;
    if (!acc[key]) {
      acc[key] = {
        key,
        personName: entry.personName,
        rateCardName: entry.rateCardName,
        indicator: entry.indicator,
        currency: entry.currency,
        rateType: entry.rateType,
        unitLabel: entry.unitLabel,
        units: 0,
        value: 0,
        movements: 0,
      };
    }
    acc[key].units += entry.units;
    acc[key].value += entry.value;
    acc[key].movements += 1;
    return acc;
  }, {})).sort((a: any, b: any) => b.value - a.value || b.units - a.units);

  const exportReportCsv = () => {
    if (reportRows.length === 0) {
      toast.info('No hay movimientos para exportar en este rango.');
      return;
    }

    const headers = ['Fecha', 'Persona', 'Rate Card', 'Tarea', 'Unidades', 'Indicador', 'Resultado', 'Tipo', 'Unidad/moneda', 'Fuente'];
    const csvRows = reportRows.map((entry: any) => [
      entry.dateKey,
      entry.personName,
      entry.rateCardName,
      entry.taskTitle || '',
      entry.units,
      entry.indicator,
      entry.value.toFixed(2),
      entry.rateType === 'unit' ? 'Unidad' : 'Dinero',
      entry.rateType === 'unit' ? entry.unitLabel : entry.currency,
      entry.source || '',
    ]);
    const escapeCsv = (value: any) => `"${String(value ?? '').replace(/"/g, '""')}"`;
    const csv = [headers, ...csvRows].map(row => row.map(escapeCsv).join(',')).join('\n');
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `informe-rate-cards-${reportStartDate}-${reportEndDate}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleCreateRateCard = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsedRate = normalizeDecimalInput(rate, Number.NaN);
    if (!name.trim() || !indicator.trim() || !Number.isFinite(parsedRate) || parsedRate < 0) {
      toast.warning('Completa nombre, indicador y un valor/factor válido en cero o mayor.');
      return;
    }
    if (rateType === 'unit' && !unitLabel.trim()) {
      toast.warning('Define la unidad o medida que produce este rate card.');
      return;
    }
    setLoading(true);
    try {
      await addDoc(collection(db, 'projects', projectId, 'rateCards'), {
        projectId,
        name: name.trim(),
        indicator: indicator.trim(),
        rate: parsedRate,
        rateType,
        valueType: rateType,
        currency: rateType === 'currency' ? currency : null,
        unitLabel: rateType === 'unit' ? unitLabel.trim() : null,
        syncExternal,
        budgetLineId: budgetLineId || null,
        createdAt: serverTimestamp(),
        createdBy: currentUser.uid
      });
      setName('');
      setIndicator('');
      setRate('');
      setRateType('currency');
      setUnitLabel('');
      setCurrency('USD');
      setBudgetLineId('');
      setSyncExternal(false);
      setIsCreateModalOpen(false);
      toast.success('Rate card creado exitosamente');
    } catch (error: any) {
      console.error("Error creating rate card:", error);
      toast.error(`Error al crear rate card: ${error.message}`);
    }
    setLoading(false);
  };

  const handleEditRateCard = (card: any) => {
    setRateCardToEdit(card);
    setName(card.name);
    setIndicator(card.indicator);
    setRate(String(card.rate ?? ''));
    setRateType(normalizeRateCardValueType(card.rateType || card.valueType));
    setCurrency(card.currency || 'USD');
    setUnitLabel(card.unitLabel || card.measureUnit || '');
    setSyncExternal(card.syncExternal || false);
    setBudgetLineId(card.budgetLineId || '');
    setCurrentValue(card.currentValue ? card.currentValue.toString() : '0');
    setIsEditModalOpen(true);
  };

  const executeEditRateCard = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsedRate = normalizeDecimalInput(rate, Number.NaN);
    if (!rateCardToEdit || !name.trim() || !indicator.trim() || !Number.isFinite(parsedRate) || parsedRate < 0) {
      toast.warning('Completa nombre, indicador y un valor/factor válido en cero o mayor.');
      return;
    }
    if (rateType === 'unit' && !unitLabel.trim()) {
      toast.warning('Define la unidad o medida que produce este rate card.');
      return;
    }
    setLoading(true);
    try {
      const { updateDoc } = await import('@/lib/supabase/document-store');
      const updateData: any = {
        name: name.trim(),
        indicator: indicator.trim(),
        rate: parsedRate,
        rateType,
        valueType: rateType,
        currency: rateType === 'currency' ? currency : null,
        unitLabel: rateType === 'unit' ? unitLabel.trim() : null,
        syncExternal,
        budgetLineId: budgetLineId || null,
      };
      
      if (syncExternal && currentValue !== '') {
        updateData.currentValue = normalizeDecimalInput(currentValue, 0);
      }
      
      await updateDoc(doc(db, 'projects', projectId, 'rateCards', rateCardToEdit.id), updateData);
      setName('');
      setIndicator('');
      setRate('');
      setRateType('currency');
      setUnitLabel('');
      setCurrency('USD');
      setBudgetLineId('');
      setSyncExternal(false);
      setCurrentValue('');
      setIsEditModalOpen(false);
      setRateCardToEdit(null);
      toast.success('Rate card actualizado exitosamente');
    } catch (error: any) {
      console.error("Error updating rate card:", error);
      toast.error(`Error al actualizar rate card: ${error.message}`);
    }
    setLoading(false);
  };

  const handleDeleteRateCard = (id: string) => {
    setRateCardToDelete(id);
  };

  const executeDeleteRateCard = async () => {
    if (!rateCardToDelete) return;
    setIsDeleting(true);
    try {
      await deleteDoc(doc(db, 'projects', projectId, 'rateCards', rateCardToDelete));
      setRateCardToDelete(null);
      toast.success('Rate card eliminado');
    } catch (error) {
      console.error("Error deleting rate card:", error);
      toast.error('Error al eliminar rate card');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <CreditCard size={20} className="text-indigo-500" />
            Rate Cards del Proyecto
          </h2>
          <p className="text-sm text-slate-500 mt-1">Gestiona las tarifas y métricas de facturación.</p>
        </div>
        <Button 
          onClick={() => setIsCreateModalOpen(true)}
          className="bg-indigo-600 hover:bg-indigo-700 text-white"
        >
          <Plus size={16} className="mr-2" />
          Nuevo Rate Card
        </Button>
      </div>

      {/* Dashboard Section */}
      {rateCards.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div className="md:col-span-1 flex flex-col gap-6">
            <Card className="border-slate-200 shadow-sm flex-1 flex flex-col justify-center">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-slate-500 flex items-center gap-2">
                  <TrendingUp size={16} className="text-emerald-500" />
                  Total Generado
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-slate-900">
                  {totalProjectGenerated.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })}
                </div>
                <p className="text-xs text-slate-500 mt-2">
                  Valor acumulado en rate cards monetarios
                  {unitRateCardCount > 0 ? ` · ${unitRateCardCount} métricas de unidad aparte` : ''}
                </p>
              </CardContent>
            </Card>

            <Card className="border-red-200 bg-red-50/30 shadow-sm flex-1 flex flex-col justify-center">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-red-600 flex items-center gap-2">
                  <AlertCircle size={16} className="text-red-500" />
                  Costo de Reproceso
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-red-600">
                  -{totalProjectRework.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })}
                </div>
                <p className="text-xs text-red-500/80 mt-2">
                  Valor perdido por devoluciones
                </p>
              </CardContent>
            </Card>
          </div>

          <Card className="border-slate-200 shadow-sm md:col-span-3">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-slate-500 flex items-center gap-2">
                <Users size={16} className="text-indigo-500" />
                Valor Generado por Usuario
              </CardTitle>
            </CardHeader>
            <CardContent className="h-[200px]">
              {userChartData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={userChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} tickFormatter={(value) => `$${value}`} />
                    <RechartsTooltip 
                      formatter={(value: any, name: any) => [
                        Number(value).toLocaleString('en-US', { style: 'currency', currency: 'USD' }), 
                        name === 'value' ? 'Generado' : 'Reproceso'
                      ]}
                      cursor={{ fill: '#f1f5f9' }}
                      contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                    />
                    <Bar dataKey="value" name="Generado" fill="#4f46e5" radius={[4, 4, 0, 0]} maxBarSize={50}>
                      {userChartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Bar>
                    <Bar dataKey="reworkValue" name="Reproceso" fill="#ef4444" radius={[4, 4, 0, 0]} maxBarSize={50} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-slate-400 text-sm italic">
                  No hay datos por usuario aún
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      <Card className="border-slate-200 shadow-sm">
        <CardHeader className="pb-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <CardTitle className="text-lg font-semibold text-slate-900 flex items-center gap-2">
                <FileText size={18} className="text-indigo-500" />
                Generador de Informes
              </CardTitle>
              <CardDescription className="mt-1">
                Movimientos registrados por fecha, persona y rate card.
              </CardDescription>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(150px,1fr)_minmax(150px,1fr)_auto_auto]">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">
                  Fecha inicial
                </label>
                <input
                  type="date"
                  value={reportStartDate}
                  onChange={(event) => {
                    setReportStartDate(event.target.value);
                    setReportGenerated(false);
                  }}
                  className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">
                  Fecha final
                </label>
                <input
                  type="date"
                  value={reportEndDate}
                  onChange={(event) => {
                    setReportEndDate(event.target.value);
                    setReportGenerated(false);
                  }}
                  className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                />
              </div>
              <Button
                type="button"
                onClick={handleGenerateReport}
                className="h-10 self-end bg-indigo-600 text-white hover:bg-indigo-700"
              >
                Generar
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={exportReportCsv}
                disabled={!reportGenerated || reportRows.length === 0}
                className="h-10 self-end border-slate-200 text-slate-700 hover:bg-slate-50"
              >
                <Download size={15} className="mr-2" />
                CSV
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {reportGenerated ? (
            <>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <div className="rounded-lg border border-slate-100 bg-slate-50 p-4">
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Movimientos</p>
                  <p className="mt-1 text-2xl font-bold text-slate-900">{reportRows.length}</p>
                </div>
                <div className="rounded-lg border border-slate-100 bg-slate-50 p-4">
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Personas</p>
                  <p className="mt-1 text-2xl font-bold text-slate-900">
                    {new Set(reportRows.map((entry: any) => entry.assignedTo)).size}
                  </p>
                </div>
                <div className="rounded-lg border border-slate-100 bg-slate-50 p-4">
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Rate cards</p>
                  <p className="mt-1 text-2xl font-bold text-slate-900">
                    {new Set(reportRows.map((entry: any) => entry.rateCardId)).size}
                  </p>
                </div>
              </div>

              {reportSummaryRows.length > 0 && (
                <div className="overflow-x-auto rounded-xl border border-slate-200">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-slate-50/80 hover:bg-slate-50/80">
                        <TableHead className="font-semibold text-slate-600">Persona</TableHead>
                        <TableHead className="font-semibold text-slate-600">Rate Card</TableHead>
                        <TableHead className="font-semibold text-slate-600">Movimientos</TableHead>
                        <TableHead className="font-semibold text-slate-600">Unidades netas</TableHead>
                        <TableHead className="font-semibold text-slate-600 text-right">Resultado</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {reportSummaryRows.map((row: any) => (
                        <TableRow key={row.key}>
                          <TableCell className="font-medium text-slate-900">{row.personName}</TableCell>
                          <TableCell className="text-slate-700">{row.rateCardName}</TableCell>
                          <TableCell className="text-slate-600">{row.movements}</TableCell>
                          <TableCell className="text-slate-700">
                            {formatRateCardUnits(row.units, row)}
                          </TableCell>
                          <TableCell className="text-right font-semibold text-emerald-700">
                            {formatRateCardValue(row.value, row)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}

              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50/80 hover:bg-slate-50/80">
                      <TableHead className="font-semibold text-slate-600">Día</TableHead>
                      <TableHead className="font-semibold text-slate-600">Persona</TableHead>
                      <TableHead className="font-semibold text-slate-600">Rate Card</TableHead>
                      <TableHead className="font-semibold text-slate-600">Tarea</TableHead>
                      <TableHead className="font-semibold text-slate-600">Unidades</TableHead>
                      <TableHead className="font-semibold text-slate-600 text-right">Resultado</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {reportRows.map((entry: any) => (
                      <TableRow key={entry.id}>
                        <TableCell className="whitespace-nowrap text-slate-700">{formatReportDate(entry.dateKey)}</TableCell>
                        <TableCell className="font-medium text-slate-900">{entry.personName}</TableCell>
                        <TableCell className="text-slate-700">{entry.rateCardName}</TableCell>
                        <TableCell className="max-w-[260px] truncate text-slate-600" title={entry.taskTitle || ''}>
                          {entry.taskTitle || 'Sin tarea'}
                        </TableCell>
                        <TableCell className={entry.units < 0 ? 'font-medium text-red-600' : 'font-medium text-emerald-700'}>
                          {formatRateCardUnits(entry.units, entry)}
                        </TableCell>
                        <TableCell className={`text-right font-semibold ${entry.value < 0 ? 'text-red-600' : 'text-emerald-700'}`}>
                          {formatRateCardValue(entry.value, entry)}
                        </TableCell>
                      </TableRow>
                    ))}
                    {reportRows.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={6} className="py-8 text-center text-sm text-slate-500">
                          No hay movimientos registrados en el rango seleccionado.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </>
          ) : (
            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 py-10 text-center text-sm text-slate-500">
              Selecciona el rango de fechas para generar el informe.
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-slate-200 shadow-sm">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50/50 hover:bg-slate-50/50">
                <TableHead className="font-semibold text-slate-600">Nombre</TableHead>
                <TableHead className="font-semibold text-slate-600">Línea de Presupuesto</TableHead>
                <TableHead className="font-semibold text-slate-600">Indicador</TableHead>
                <TableHead className="font-semibold text-slate-600">Sincronización</TableHead>
                <TableHead className="font-semibold text-slate-600">Tipo / Factor</TableHead>
                <TableHead className="font-semibold text-slate-600">Generado</TableHead>
                <TableHead className="font-semibold text-slate-600">Por Usuario</TableHead>
                <TableHead className="font-semibold text-slate-600 text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rateCards.map((card) => {
                const computedUserStats = cardComputedUserStats[card.id] || {};
                
                // Calculate total generated from tasks or use currentValue for external sync
                let totalUnits = 0;
                if (card.syncExternal) {
                  totalUnits = card.currentValue || 0;
                } else {
                  totalUnits = card.currentValue || 0;
                  tasks.forEach(task => {
                    if (!task.isRateCardTask && task.indicator && task.indicator.toLowerCase() === card.indicator.toLowerCase()) {
                      const value = task.indicatorValue || 0;
                      const progress = task.progress || 0;
                      totalUnits += value * (progress / 100);
                    }
                  });
                  
                  let userStatsTotal = Object.values(computedUserStats).reduce((sum: number, val: any) => sum + (Number(val) || 0), 0);
                  if (userStatsTotal > totalUnits) {
                    totalUnits = userStatsTotal;
                  }
                }
                const totalGenerated = totalUnits * Number(card.rate || 0);
                const associatedBudgetLine = budgetLines.find(bl => bl.id === card.budgetLineId);

                return (
                  <TableRow key={card.id} className="hover:bg-slate-50/50">
                    <TableCell className="font-medium text-slate-900">{card.name}</TableCell>
                    <TableCell className="text-slate-600">
                      {associatedBudgetLine ? (
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-indigo-50 text-indigo-700">
                          {associatedBudgetLine.name}
                        </span>
                      ) : (
                        <span className="text-slate-400 italic text-xs">Ninguna</span>
                      )}
                    </TableCell>
                    <TableCell className="text-slate-600">{card.indicator}</TableCell>
                    <TableCell>
                      {card.syncExternal ? (
                        <span className="px-2 py-1 bg-emerald-100 text-emerald-700 text-[10px] font-bold rounded uppercase">Activa</span>
                      ) : (
                        <span className="px-2 py-1 bg-slate-100 text-slate-500 text-[10px] font-bold rounded uppercase">Manual</span>
                      )}
                    </TableCell>
                    <TableCell className="font-medium text-indigo-600">
                      <div>{formatRateCardRate(card.rate, card)}</div>
                      <div className="mt-1 text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">
                        {isCurrencyRateCard(card) ? 'Dinero' : 'Unidad / medida'}
                      </div>
                    </TableCell>
                    <TableCell className="font-medium text-emerald-600">
                      <div>
                        {formatRateCardValue(totalGenerated, card)}
                        <div className="text-xs text-slate-500 font-normal">{formatRateCardUnits(totalUnits, card, 1)}</div>
                      </div>
                      {card.reworkValue > 0 && (
                        <div className="mt-1 text-red-600" title="Costo de reproceso (Devoluciones)">
                          -{formatRateCardValue(card.reworkValue * Number(card.rate || 0), card)}
                          <div className="text-[10px] font-normal">{formatRateCardUnits(card.reworkValue, card, 1)} reproceso</div>
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1 max-w-[200px]">
                        {(Object.keys(computedUserStats).length > 0) || (card.userReworkStats && Object.entries(card.userReworkStats).length > 0) ? (
                          Array.from(new Set([...Object.keys(computedUserStats), ...Object.keys(card.userReworkStats || {})])).map(userId => {
                            const units = computedUserStats[userId] || 0;
                            const reworkUnits = (card.userReworkStats && card.userReworkStats[userId]) || 0;
                            const member = teamMembers.find(m => m.id === userId);
                            const name = member ? member.name : 'Usuario Desconocido';
                            const value = units * Number(card.rate || 0);
                            const reworkValue = reworkUnits * Number(card.rate || 0);
                            
                            return (
                              <div key={userId} className="flex flex-col text-[11px] border-b border-slate-50 pb-1 last:border-0">
                                <div className="flex items-center justify-between">
                                  <span className="text-slate-600 truncate mr-2" title={name}>{name}</span>
                                  <span className="font-medium text-indigo-600 whitespace-nowrap">
                                    {formatRateCardUnits(units, card, 1)} ({formatRateCardValue(value, card, 0)})
                                  </span>
                                </div>
                                {reworkUnits > 0 && (
                                  <div className="flex items-center justify-between text-red-600 mt-0.5">
                                    <span className="truncate mr-2 text-[10px]">Reproceso:</span>
                                    <span className="font-medium whitespace-nowrap">
                                      {formatRateCardUnits(reworkUnits, card, 1)} (-{formatRateCardValue(reworkValue, card, 0)})
                                    </span>
                                  </div>
                                )}
                              </div>
                            );
                          })
                        ) : (
                          <span className="text-[11px] text-slate-400 italic">Sin datos individuales</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <button 
                          onClick={() => handleEditRateCard(card)}
                          className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-md transition-colors"
                          title="Editar"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>
                        </button>
                        <button 
                          onClick={() => handleDeleteRateCard(card.id)}
                          className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors"
                          title="Eliminar"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
              {rateCards.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-12 text-slate-500">
                    <CreditCard className="w-12 h-12 text-slate-200 mx-auto mb-3" />
                    <h3 className="text-base font-medium text-slate-900">No hay rate cards</h3>
                    <p className="text-sm text-slate-500 mt-1 mb-4">Crea un rate card para empezar a medir el valor generado.</p>
                    <Button onClick={() => setIsCreateModalOpen(true)} className="bg-indigo-600 hover:bg-indigo-700 text-white">
                      <Plus size={16} className="mr-2" />
                      Crear Rate Card
                    </Button>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Create Rate Card Modal */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full p-6 m-4 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-indigo-100 rounded-lg">
                  <CreditCard className="w-5 h-5 text-indigo-600" />
                </div>
                <h3 className="text-lg font-semibold text-slate-900">Nuevo Rate Card</h3>
              </div>
              <button 
                onClick={() => setIsCreateModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            
            <form onSubmit={handleCreateRateCard} className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">Nombre</label>
                <input 
                  type="text" 
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full h-10 px-3 rounded-md border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-sm"
                  placeholder="Ej. Tarifa Consultor Senior"
                  required
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">Indicador a medir</label>
                <input 
                  type="text" 
                  value={indicator}
                  onChange={(e) => setIndicator(e.target.value)}
                  className="w-full h-10 px-3 rounded-md border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-sm"
                  placeholder="Ej. Horas trabajadas"
                  required
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">Tipo de resultado</label>
                <select
                  value={rateType}
                  onChange={(e) => setRateType(e.target.value === 'unit' ? 'unit' : 'currency')}
                  className="w-full h-10 px-3 rounded-md border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-sm"
                >
                  <option value="currency">Dinero / tarifa monetaria</option>
                  <option value="unit">Unidad / métrica medible</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700">
                    {rateType === 'currency' ? 'Tarifa por indicador' : 'Factor por indicador'}
                  </label>
                  <input 
                    type="number" 
                    step="any"
                    min="0"
                    value={rate}
                    onChange={(e) => setRate(e.target.value)}
                    className="w-full h-10 px-3 rounded-md border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-sm"
                    placeholder="0.00"
                    required
                  />
                </div>
                {rateType === 'currency' ? (
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-700">Moneda</label>
                    <select
                      value={currency}
                      onChange={(e) => setCurrency(e.target.value)}
                      className="w-full h-10 px-3 rounded-md border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-sm"
                    >
                      <option value="USD">USD</option>
                      <option value="EUR">EUR</option>
                      <option value="COP">COP</option>
                      <option value="MXN">MXN</option>
                    </select>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-700">Unidad resultado</label>
                    <input
                      type="text"
                      value={unitLabel}
                      onChange={(e) => setUnitLabel(e.target.value)}
                      className="w-full h-10 px-3 rounded-md border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-sm"
                      placeholder="Ej. predios, m2, puntos"
                      required={rateType === 'unit'}
                    />
                  </div>
                )}
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">Línea de Presupuesto (Opcional)</label>
                <select 
                  value={budgetLineId}
                  onChange={(e) => setBudgetLineId(e.target.value)}
                  className="w-full h-10 px-3 rounded-md border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-sm"
                >
                  <option value="">Ninguna</option>
                  {budgetLines.map(line => (
                    <option key={line.id} value={line.id}>{line.name} ({line.plannedAmount.toLocaleString('es-CO', { style: 'currency', currency: line.currency, maximumFractionDigits: 0 })})</option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-2 pt-2">
                <input 
                  type="checkbox" 
                  id="syncExternalRC"
                  checked={syncExternal}
                  onChange={(e) => setSyncExternal(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                />
                <label htmlFor="syncExternalRC" className="text-sm font-medium text-slate-700 cursor-pointer">
                  Sincronizar con base de datos externa
                </label>
              </div>
              
              <div className="flex justify-end gap-3 pt-4 border-t border-slate-100 mt-6">
                <Button 
                  type="button"
                  variant="outline" 
                  onClick={() => setIsCreateModalOpen(false)}
                  className="border-slate-200 text-slate-700 hover:bg-slate-50"
                >
                  Cancelar
                </Button>
                <Button 
                  type="submit" 
                  disabled={!name || !indicator || !rate || loading} 
                  className="bg-indigo-600 hover:bg-indigo-700 text-white disabled:bg-slate-300"
                >
                  {loading ? 'Creando...' : 'Crear Rate Card'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Rate Card Modal */}
      {isEditModalOpen && rateCardToEdit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full p-6 m-4 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-indigo-100 rounded-lg">
                  <CreditCard className="w-5 h-5 text-indigo-600" />
                </div>
                <h3 className="text-lg font-semibold text-slate-900">Editar Rate Card</h3>
              </div>
              <button 
                onClick={() => {
                  setIsEditModalOpen(false);
                  setRateCardToEdit(null);
                }}
                className="text-slate-400 hover:text-slate-600 transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            
            <form onSubmit={executeEditRateCard} className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">Nombre</label>
                <input 
                  type="text" 
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full h-10 px-3 rounded-md border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-sm"
                  placeholder="Ej. Tarifa Consultor Senior"
                  required
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">Indicador a medir</label>
                <input 
                  type="text" 
                  value={indicator}
                  onChange={(e) => setIndicator(e.target.value)}
                  className="w-full h-10 px-3 rounded-md border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-sm"
                  placeholder="Ej. Horas trabajadas"
                  required
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">Tipo de resultado</label>
                <select
                  value={rateType}
                  onChange={(e) => setRateType(e.target.value === 'unit' ? 'unit' : 'currency')}
                  className="w-full h-10 px-3 rounded-md border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-sm"
                >
                  <option value="currency">Dinero / tarifa monetaria</option>
                  <option value="unit">Unidad / métrica medible</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700">
                    {rateType === 'currency' ? 'Tarifa por indicador' : 'Factor por indicador'}
                  </label>
                  <input 
                    type="number" 
                    step="any"
                    min="0"
                    value={rate}
                    onChange={(e) => setRate(e.target.value)}
                    className="w-full h-10 px-3 rounded-md border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-sm"
                    placeholder="0.00"
                    required
                  />
                </div>
                {rateType === 'currency' ? (
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-700">Moneda</label>
                    <select
                      value={currency}
                      onChange={(e) => setCurrency(e.target.value)}
                      className="w-full h-10 px-3 rounded-md border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-sm"
                    >
                      <option value="USD">USD</option>
                      <option value="EUR">EUR</option>
                      <option value="COP">COP</option>
                      <option value="MXN">MXN</option>
                    </select>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-700">Unidad resultado</label>
                    <input
                      type="text"
                      value={unitLabel}
                      onChange={(e) => setUnitLabel(e.target.value)}
                      className="w-full h-10 px-3 rounded-md border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-sm"
                      placeholder="Ej. predios, m2, puntos"
                      required={rateType === 'unit'}
                    />
                  </div>
                )}
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">Línea de Presupuesto (Opcional)</label>
                <select 
                  value={budgetLineId}
                  onChange={(e) => setBudgetLineId(e.target.value)}
                  className="w-full h-10 px-3 rounded-md border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-sm"
                >
                  <option value="">Ninguna</option>
                  {budgetLines.map(line => (
                    <option key={line.id} value={line.id}>{line.name} ({line.plannedAmount.toLocaleString('es-CO', { style: 'currency', currency: line.currency, maximumFractionDigits: 0 })})</option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-2 pt-2">
                <input 
                  type="checkbox" 
                  id="syncExternalRCEdit"
                  checked={syncExternal}
                  onChange={(e) => setSyncExternal(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                />
                <label htmlFor="syncExternalRCEdit" className="text-sm font-medium text-slate-700 cursor-pointer">
                  Sincronizar con base de datos externa
                </label>
              </div>

              {syncExternal && (
                <div className="space-y-2 animate-in fade-in slide-in-from-top-2">
                  <label className="text-sm font-medium text-slate-700">Valor Actual (Cantidad)</label>
                  <input 
                    type="number" 
                    step="any"
                    min="0"
                    value={currentValue}
                    onChange={(e) => setCurrentValue(e.target.value)}
                    className="w-full h-10 px-3 rounded-md border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-sm"
                    placeholder="0.00"
                    required={syncExternal}
                  />
                  <p className="text-xs text-slate-500">
                    Como la sincronización externa está activa, puedes ajustar el valor actual manualmente si es necesario.
                  </p>
                </div>
              )}
              
              <div className="flex justify-end gap-3 pt-4 border-t border-slate-100 mt-6">
                <Button 
                  type="button"
                  variant="outline" 
                  onClick={() => {
                    setIsEditModalOpen(false);
                    setRateCardToEdit(null);
                  }}
                  className="border-slate-200 text-slate-700 hover:bg-slate-50"
                >
                  Cancelar
                </Button>
                <Button 
                  type="submit" 
                  disabled={!name || !indicator || !rate || loading} 
                  className="bg-indigo-600 hover:bg-indigo-700 text-white disabled:bg-slate-300"
                >
                  {loading ? 'Guardando...' : 'Guardar Cambios'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Rate Card Modal */}
      {rateCardToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 m-4 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center gap-3 text-red-600 mb-4">
              <div className="p-2 bg-red-100 rounded-full">
                <AlertCircle className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-semibold text-slate-900">Eliminar Rate Card</h3>
            </div>
            
            <p className="text-slate-600 mb-6">
              ¿Estás seguro de que deseas eliminar este rate card? Esta acción no se puede deshacer.
            </p>
            
            <div className="flex justify-end gap-3">
              <Button 
                variant="outline" 
                onClick={() => setRateCardToDelete(null)}
                disabled={isDeleting}
                className="border-slate-200 text-slate-700 hover:bg-slate-50"
              >
                Cancelar
              </Button>
              <Button 
                onClick={executeDeleteRateCard}
                disabled={isDeleting}
                className="bg-red-600 hover:bg-red-700 text-white"
              >
                {isDeleting ? 'Eliminando...' : 'Sí, eliminar rate card'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
