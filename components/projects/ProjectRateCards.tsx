import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { CreditCard, Plus, Trash2, AlertCircle, X, TrendingUp, Users, FileText, Download, DollarSign, WalletCards, Target } from 'lucide-react';
import { collection, query, onSnapshot, addDoc, deleteDoc, doc, serverTimestamp } from '@/lib/supabase/document-store';
import { db } from '@/lib/backend';
import { toast } from 'sonner';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Cell } from 'recharts';
import {
  formatRateCardRate,
  formatRateCardUnits,
  formatRateCardValue,
  getRateCardCostRate,
  getRateCardCostValue,
  getRateCardIncomeRate,
  getRateCardIncomeValue,
  getRateCardOutputValue,
  isCurrencyRateCard,
  normalizeDecimalInput,
  normalizeRateCardValueType,
} from '@/lib/rate-card-config';

export function ProjectRateCards({ projectId, currentUser, tasks = [], teamMembers = [], budgetLines = [] }: { projectId: string, currentUser: any, tasks?: any[], teamMembers?: any[], budgetLines?: any[] }) {
  const [rateCards, setRateCards] = useState<any[]>([]);
  const [name, setName] = useState('');
  const [indicator, setIndicator] = useState('');
  const [rate, setRate] = useState('');
  const [incomeRate, setIncomeRate] = useState('');
  const [costRate, setCostRate] = useState('');
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
  const [selectedRateCardId, setSelectedRateCardId] = useState<string | null>(null);
  const [analysisRateIds, setAnalysisRateIds] = useState<string[]>([]);

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

  useEffect(() => {
    if (rateCards.length === 0) {
      setSelectedRateCardId(null);
      setAnalysisRateIds([]);
      return;
    }

    if (!selectedRateCardId || !rateCards.some(card => card.id === selectedRateCardId)) {
      setSelectedRateCardId(rateCards[0].id);
    }

    const validAnalysisIds = analysisRateIds.filter(id => rateCards.some(card => card.id === id));
    if (validAnalysisIds.length === 0) {
      setAnalysisRateIds([rateCards[0].id]);
    } else if (validAnalysisIds.length !== analysisRateIds.length) {
      setAnalysisRateIds(validAnalysisIds);
    }
  }, [rateCards, selectedRateCardId, analysisRateIds]);

  // Calculate data for charts and totals
  const userTotals: Record<string, { name: string; income: number; cost: number; output: number; reworkCost: number }> = {};
  const rateCardAnalytics: any[] = [];
  let totalProjectGenerated = 0;
  let totalProjectCost = 0;
  let totalProjectRework = 0;
  let totalUnitOutput = 0;
  let unitRateCardCount = 0;

  rateCards.forEach(card => {
    let cardTotalUnits = 0;
    const rateEntries = rateCardEntries.filter(entry => entry.rateCardId === card.id);
    const entryUserStats = rateEntries.reduce((acc: Record<string, number>, entry: any) => {
      const userId = entry.assignedTo || 'unknown';
      acc[userId] = (acc[userId] || 0) + Number(entry.units || 0);
      return acc;
    }, {});
    const hasReportedEntries = rateEntries.length > 0;
    const computedUserStats: Record<string, number> = hasReportedEntries ? entryUserStats : { ...(card.userStats || {}) };

    if (card.syncExternal) {
      cardTotalUnits = Number(card.currentValue || 0);
    } else if (hasReportedEntries) {
      cardTotalUnits = Object.values(computedUserStats).reduce((sum: number, val: any) => sum + (Number(val) || 0), 0);
    } else {
      cardTotalUnits = Number(card.currentValue || 0);
      tasks.forEach(task => {
        if (!task.isRateCardTask && task.indicator && task.indicator.toLowerCase() === card.indicator.toLowerCase()) {
          const value = Number(task.indicatorValue || 0);
          const progress = Number(task.progress || 0);
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
    
    const currencyRate = isCurrencyRateCard(card);
    const incomeValue = getRateCardIncomeValue(cardTotalUnits, card);
    const costValue = getRateCardCostValue(cardTotalUnits, card);
    const outputValue = getRateCardOutputValue(cardTotalUnits, card);
    const reworkCostValue = getRateCardCostValue(Number(card.reworkValue || 0), card);
    const associatedBudgetLine = budgetLines.find(bl => bl.id === card.budgetLineId);
    const contributors = Object.entries(computedUserStats)
      .map(([userId, units]: [string, any]) => {
        const member = teamMembers.find(m => m.id === userId);
        const amount = Number(units || 0);
        return {
          userId,
          name: member ? member.name : 'Usuario Desconocido',
          units: amount,
          income: getRateCardIncomeValue(amount, card),
          cost: getRateCardCostValue(amount, card),
          output: getRateCardOutputValue(amount, card),
        };
      })
      .sort((left, right) => right.units - left.units)
      .slice(0, 5);

    if (currencyRate) {
      totalProjectGenerated += incomeValue;
    } else {
      unitRateCardCount += 1;
      totalUnitOutput += outputValue;
    }
    totalProjectCost += costValue;
    totalProjectRework += reworkCostValue;

    rateCardAnalytics.push({
      ...card,
      cardTotalUnits,
      incomeValue,
      costValue,
      outputValue,
      marginValue: incomeValue - costValue,
      reworkCostValue,
      associatedBudgetLine,
      contributors,
      incomeRate: getRateCardIncomeRate(card),
      costRate: getRateCardCostRate(card),
    });

    Object.entries(computedUserStats).forEach(([userId, units]: [string, any]) => {
      const member = teamMembers.find(m => m.id === userId);
      const userName = member ? member.name : 'Usuario Desconocido';
      const amount = Number(units || 0);
      
      if (!userTotals[userId]) {
        userTotals[userId] = { name: userName, income: 0, cost: 0, output: 0, reworkCost: 0 };
      }
      userTotals[userId].income += getRateCardIncomeValue(amount, card);
      userTotals[userId].cost += getRateCardCostValue(amount, card);
      userTotals[userId].output += getRateCardOutputValue(amount, card);
    });
    
    if (card.userReworkStats) {
      Object.entries(card.userReworkStats).forEach(([userId, units]: [string, any]) => {
        const member = teamMembers.find(m => m.id === userId);
        const userName = member ? member.name : 'Usuario Desconocido';
        const amount = Number(units || 0);
        
        if (!userTotals[userId]) {
          userTotals[userId] = { name: userName, income: 0, cost: 0, output: 0, reworkCost: 0 };
        }
        userTotals[userId].reworkCost += getRateCardCostValue(amount, card);
      });
    }
  });

  const selectedRateCard = rateCardAnalytics.find(card => card.id === selectedRateCardId) || rateCardAnalytics[0] || null;
  const selectedRateCardContribution = selectedRateCard?.contributors || [];
  const userChartData = Object.values(userTotals)
    .map((row) => ({ ...row, margin: row.income - row.cost }))
    .sort((a, b) => (b.income + b.output) - (a.income + a.output));
  const COLORS = ['#4f46e5', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4'];
  const formatMoney = (value: number, currency = 'USD') =>
    value.toLocaleString('en-US', { style: 'currency', currency, maximumFractionDigits: 0 });
  const formatCompactMoney = (value: number) => {
    const absoluteValue = Math.abs(value);
    if (absoluteValue >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(1)}B`;
    if (absoluteValue >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
    if (absoluteValue >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
    return `$${value.toLocaleString('es-CO', { maximumFractionDigits: 0 })}`;
  };
  const shortLabel = (value: string, maxLength = 18) => {
    if (!value) return '';
    return value.length > maxLength ? `${value.slice(0, maxLength - 1)}…` : value;
  };

  const toDateKey = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const parseDateLike = (value: any): Date | null => {
    if (!value) return null;
    if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
    if (typeof value?.toDate === 'function') {
      const date = value.toDate();
      return date instanceof Date && !Number.isNaN(date.getTime()) ? date : null;
    }
    if (typeof value?.toMillis === 'function') {
      const date = new Date(value.toMillis());
      return Number.isNaN(date.getTime()) ? null : date;
    }
    if (typeof value?.seconds === 'number') {
      const date = new Date(value.seconds * 1000);
      return Number.isNaN(date.getTime()) ? null : date;
    }
    if (typeof value === 'number') {
      const date = new Date(value < 10000000000 ? value * 1000 : value);
      return Number.isNaN(date.getTime()) ? null : date;
    }
    if (typeof value === 'string') {
      const date = new Date(value);
      return Number.isNaN(date.getTime()) ? null : date;
    }
    return null;
  };

  const normalizeDateKey = (value: any) => {
    if (typeof value !== 'string') return '';
    const trimmed = value.trim();
    const dateKeyMatch = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (dateKeyMatch) {
      const [, year, month, day] = dateKeyMatch;
      return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    }

    const parsed = parseDateLike(trimmed);
    return parsed ? toDateKey(parsed) : '';
  };

  const getEntryDateKey = (entry: any) => {
    const directDateKey = normalizeDateKey(entry.dateKey || entry.dayKey || entry.reportDate);
    if (directDateKey) return directDateKey;

    const date =
      parseDateLike(entry.createdAt) ||
      parseDateLike(entry.completedAt) ||
      parseDateLike(entry.approvedAt) ||
      parseDateLike(entry.updatedAt);

    return date ? toDateKey(date) : '';
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

  const buildReportRow = (entry: any, card: any) => {
    const units = Number(entry.units || 0);
    const rateCardContext = card || entry;
    const isRework = Boolean(entry.isRework);
    const costUnits = isRework ? Math.abs(units) : units;
    const costValue = getRateCardCostValue(costUnits, rateCardContext);

    return {
      ...entry,
      dateKey: entry.dateKey || getEntryDateKey(entry),
      personName: getMemberName(entry.assignedTo),
      rateCardName: card?.name || entry.rateCardName || 'Rate Card eliminado',
      indicator: rateCardContext?.indicator || 'unidades',
      rateType: normalizeRateCardValueType(rateCardContext?.rateType || rateCardContext?.valueType),
      unitLabel: rateCardContext?.unitLabel || rateCardContext?.measureUnit || 'unidades',
      currency: rateCardContext?.currency || 'USD',
      income: isRework ? 0 : getRateCardIncomeValue(units, rateCardContext),
      cost: costValue,
      value: isRework ? -costValue : getRateCardOutputValue(units, rateCardContext),
      units,
    };
  };

  const buildHistoricalBalanceRows = () => {
    if (!reportGenerated || !reportEndDate) return [];

    const trackedUnitsByUser = rateCardEntries.reduce((acc: Record<string, number>, entry: any) => {
      if (!entry.rateCardId) return acc;
      const statsType = entry.isRework ? 'rework' : 'production';
      const userId = entry.assignedTo || 'unknown';
      const key = `${entry.rateCardId}::${userId}::${statsType}`;
      acc[key] = (acc[key] || 0) + Number(entry.units || 0);
      return acc;
    }, {});

    return rateCards.flatMap(card => {
      if (analysisRateIds.length > 0 && !analysisRateIds.includes(card.id)) return [];

      const rows: any[] = [];
      const productionStats = card.userStats || {};
      const reworkStats = card.userReworkStats || {};

      Object.entries(productionStats).forEach(([assignedTo, rawUnits]) => {
        const totalUnits = Number(rawUnits || 0);
        const trackedUnits = trackedUnitsByUser[`${card.id}::${assignedTo}::production`] || 0;
        const historicalUnits = totalUnits - trackedUnits;
        if (Math.abs(historicalUnits) < 0.000001) return;

        rows.push(buildReportRow({
          id: `historical-${card.id}-${assignedTo}-production`,
          rateCardId: card.id,
          assignedTo,
          units: historicalUnits,
          dateKey: reportEndDate,
          displayDate: 'Acumulado histórico',
          taskTitle: 'Saldo acumulado sin fecha individual',
          source: 'historical_user_stats',
          historicalBalance: true,
        }, card));
      });

      Object.entries(reworkStats).forEach(([assignedTo, rawUnits]) => {
        const totalUnits = Number(rawUnits || 0);
        const trackedUnits = trackedUnitsByUser[`${card.id}::${assignedTo}::rework`] || 0;
        const historicalUnits = totalUnits - trackedUnits;
        if (Math.abs(historicalUnits) < 0.000001) return;

        rows.push(buildReportRow({
          id: `historical-${card.id}-${assignedTo}-rework`,
          rateCardId: card.id,
          assignedTo,
          units: historicalUnits,
          dateKey: reportEndDate,
          displayDate: 'Reproceso histórico',
          taskTitle: 'Reproceso acumulado sin fecha individual',
          source: 'historical_rework_stats',
          historicalBalance: true,
          isRework: true,
        }, card));
      });

      return rows;
    });
  };

  const selectedRateCardEntries = selectedRateCard
    ? rateCardEntries
      .filter(entry => entry.rateCardId === selectedRateCard.id)
      .map(entry => {
        const units = Number(entry.units || 0);
        return {
          ...entry,
          dateKey: getEntryDateKey(entry),
          personName: getMemberName(entry.assignedTo),
          income: getRateCardIncomeValue(units, selectedRateCard),
          cost: getRateCardCostValue(units, selectedRateCard),
          value: getRateCardOutputValue(units, selectedRateCard),
          units,
        };
      })
      .sort((a, b) => (b.dateKey || '').localeCompare(a.dateKey || ''))
    : [];
  const chartDisplayData = userChartData.slice(0, 8);
  const activeUserCount = userChartData.filter(row => row.income > 0 || row.cost > 0 || row.output > 0 || row.reworkCost > 0).length;
  const totalMovements = rateCardEntries.length;
  const totalMargin = totalProjectGenerated - totalProjectCost;
  const topFinancialUsers = userChartData
    .filter(row => row.income > 0 || row.cost > 0 || row.reworkCost > 0)
    .slice(0, 5);
  const topProductiveUsers = userChartData
    .filter(row => row.output > 0)
    .sort((left, right) => right.output - left.output)
    .slice(0, 5);
  const selectedRateCardLastEntry = selectedRateCardEntries[0];

  const buildRateCardRecalculation = (card: any) => {
    const entries = rateCardEntries.filter(entry => entry.rateCardId === card.id);
    const reportedUnits = entries.reduce((sum, entry) => sum + Number(entry.units || 0), 0);
    const calculatedIncome = getRateCardIncomeValue(reportedUnits, card);
    const calculatedCost = getRateCardCostValue(reportedUnits, card);
    const calculatedOutput = getRateCardOutputValue(reportedUnits, card);

    return {
      reportedUnits,
      calculatedIncome,
      calculatedCost,
      calculatedOutput,
      calculatedMargin: calculatedIncome - calculatedCost,
      recalculatedAt: serverTimestamp(),
    };
  };

  const toggleAnalysisRate = (rateCardId: string) => {
    setReportGenerated(false);
    setAnalysisRateIds(previous => {
      if (previous.includes(rateCardId)) {
        return previous.length === 1 ? previous : previous.filter(id => id !== rateCardId);
      }
      return [...previous, rateCardId];
    });
  };

  const selectAllAnalysisRates = () => {
    setReportGenerated(false);
    setAnalysisRateIds(rateCards.map(card => card.id));
  };

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
    ? [
      ...rateCardEntries
        .map(entry => buildReportRow({
          ...entry,
          dateKey: getEntryDateKey(entry),
        }, getRateCardById(entry.rateCardId)))
        .filter(entry => {
          const matchesRate = analysisRateIds.length === 0 || analysisRateIds.includes(entry.rateCardId);
          return matchesRate && entry.dateKey && entry.dateKey >= reportStartDate && entry.dateKey <= reportEndDate;
        }),
      ...buildHistoricalBalanceRows(),
    ].sort((a, b) => b.dateKey.localeCompare(a.dateKey) || a.personName.localeCompare(b.personName))
    : [];
  const reportHasHistoricalBalances = reportRows.some((entry: any) => entry.historicalBalance);

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
        income: 0,
        cost: 0,
        value: 0,
        movements: 0,
      };
    }
    acc[key].units += entry.units;
    acc[key].income += entry.income;
    acc[key].cost += entry.cost;
    acc[key].value += entry.value;
    acc[key].movements += 1;
    return acc;
  }, {})).sort((a: any, b: any) => b.value - a.value || b.units - a.units);

  const selectedAnalysisCards = rateCards.filter(card => analysisRateIds.includes(card.id));
  const reportChartData = Object.values(reportRows.reduce((acc: Record<string, any>, entry: any) => {
    if (!acc[entry.dateKey]) {
      acc[entry.dateKey] = {
        dateKey: entry.dateKey,
        dateLabel: formatReportDate(entry.dateKey),
      };
    }
    acc[entry.dateKey][entry.rateCardId] = (acc[entry.dateKey][entry.rateCardId] || 0) + entry.units;
    return acc;
  }, {})).sort((a: any, b: any) => a.dateKey.localeCompare(b.dateKey));

  const exportReportCsv = () => {
    if (reportRows.length === 0) {
      toast.info('No hay movimientos para exportar en este rango.');
      return;
    }

    const headers = ['Fecha', 'Persona', 'Rate Card', 'Tarea', 'Unidades', 'Indicador', 'Ingreso', 'Costo', 'Resultado', 'Tipo', 'Unidad/moneda', 'Fuente'];
    const csvRows = reportRows.map((entry: any) => [
      entry.displayDate || entry.dateKey,
      entry.personName,
      entry.rateCardName,
      entry.taskTitle || '',
      entry.units,
      entry.indicator,
      entry.income.toFixed(2),
      entry.cost.toFixed(2),
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
    const parsedIncomeRate = normalizeDecimalInput(incomeRate, Number.NaN);
    const parsedCostRate = normalizeDecimalInput(costRate, 0);
    const parsedRate = rateType === 'currency'
      ? parsedIncomeRate
      : normalizeDecimalInput(rate, Number.NaN);
    if (!name.trim() || !indicator.trim() || !Number.isFinite(parsedRate) || parsedRate < 0 || !Number.isFinite(parsedCostRate) || parsedCostRate < 0) {
      toast.warning('Completa nombre, indicador y valores válidos en cero o mayores.');
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
        incomeRate: rateType === 'currency' ? parsedIncomeRate : null,
        costRate: parsedCostRate,
        unitCost: parsedCostRate,
        rateType,
        valueType: rateType,
        currency: rateType === 'currency' ? currency : null,
        unitLabel: rateType === 'unit' ? unitLabel.trim() : null,
        syncExternal,
        budgetLineId: budgetLineId || null,
        reportedUnits: 0,
        calculatedIncome: 0,
        calculatedCost: 0,
        calculatedOutput: 0,
        calculatedMargin: 0,
        createdAt: serverTimestamp(),
        createdBy: currentUser.uid
      });
      setName('');
      setIndicator('');
      setRate('');
      setIncomeRate('');
      setCostRate('');
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
    setIncomeRate(String(card.incomeRate ?? card.rate ?? ''));
    setCostRate(String(card.costRate ?? card.unitCost ?? '0'));
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
    const parsedIncomeRate = normalizeDecimalInput(incomeRate, Number.NaN);
    const parsedCostRate = normalizeDecimalInput(costRate, 0);
    const parsedRate = rateType === 'currency'
      ? parsedIncomeRate
      : normalizeDecimalInput(rate, Number.NaN);
    if (!rateCardToEdit || !name.trim() || !indicator.trim() || !Number.isFinite(parsedRate) || parsedRate < 0 || !Number.isFinite(parsedCostRate) || parsedCostRate < 0) {
      toast.warning('Completa nombre, indicador y valores válidos en cero o mayores.');
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
        incomeRate: rateType === 'currency' ? parsedIncomeRate : null,
        costRate: parsedCostRate,
        unitCost: parsedCostRate,
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

      Object.assign(updateData, buildRateCardRecalculation({
        ...rateCardToEdit,
        ...updateData,
        id: rateCardToEdit.id,
      }));
      
      await updateDoc(doc(db, 'projects', projectId, 'rateCards', rateCardToEdit.id), updateData);
      setName('');
      setIndicator('');
      setRate('');
      setIncomeRate('');
      setCostRate('');
      setRateType('currency');
      setUnitLabel('');
      setCurrency('USD');
      setBudgetLineId('');
      setSyncExternal(false);
      setCurrentValue('');
      setIsEditModalOpen(false);
      setRateCardToEdit(null);
      toast.success('Rate card actualizado y recalculado con las unidades reportadas.');
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
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
            <Card className="border-emerald-200 bg-emerald-50/40 shadow-sm">
              <CardContent className="p-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-black uppercase tracking-wider text-emerald-700">Ingresos</p>
                    <p className="mt-2 text-2xl font-black text-slate-900">{formatMoney(totalProjectGenerated)}</p>
                    <p className="mt-1 text-xs font-semibold text-emerald-700">Rates monetarios</p>
                  </div>
                  <DollarSign className="h-8 w-8 text-emerald-500" />
                </div>
              </CardContent>
            </Card>
            <Card className="border-rose-200 bg-rose-50/40 shadow-sm">
              <CardContent className="p-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-black uppercase tracking-wider text-rose-700">Costos</p>
                    <p className="mt-2 text-2xl font-black text-slate-900">{formatMoney(totalProjectCost)}</p>
                    <p className="mt-1 text-xs font-semibold text-rose-700">
                      Producción asociada{totalProjectRework > 0 ? ` · ${formatMoney(totalProjectRework)} reproceso` : ''}
                    </p>
                  </div>
                  <WalletCards className="h-8 w-8 text-rose-500" />
                </div>
              </CardContent>
            </Card>
            <Card className="border-indigo-200 bg-indigo-50/40 shadow-sm">
              <CardContent className="p-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-black uppercase tracking-wider text-indigo-700">Margen</p>
                    <p className="mt-2 text-2xl font-black text-slate-900">{formatMoney(totalProjectGenerated - totalProjectCost)}</p>
                    <p className="mt-1 text-xs font-semibold text-indigo-700">Ingreso - costo</p>
                  </div>
                  <TrendingUp className="h-8 w-8 text-indigo-500" />
                </div>
              </CardContent>
            </Card>
            <Card className="border-cyan-200 bg-cyan-50/40 shadow-sm">
              <CardContent className="p-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-black uppercase tracking-wider text-cyan-700">Productividad</p>
                    <p className="mt-2 text-2xl font-black text-slate-900">{totalUnitOutput.toLocaleString('es-CO', { maximumFractionDigits: 1 })}</p>
                    <p className="mt-1 text-xs font-semibold text-cyan-700">{unitRateCardCount} rates por unidad</p>
                  </div>
                  <Target className="h-8 w-8 text-cyan-500" />
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_420px] 2xl:grid-cols-[minmax(0,1fr)_460px]">
            <Card className="min-w-0 border-slate-200 shadow-sm">
              <CardHeader className="pb-2">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2 text-base font-black text-slate-900">
                      <Users size={18} className="text-indigo-500" />
                      Contribución por usuario
                    </CardTitle>
                    <CardDescription className="mt-1">
                      Compara ingreso, costo y reproceso sin perder las etiquetas del gráfico.
                    </CardDescription>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div className="rounded-xl bg-slate-50 px-3 py-2">
                      <p className="font-black uppercase tracking-wider text-slate-400">Usuarios</p>
                      <p className="mt-1 text-lg font-black text-slate-900">{activeUserCount}</p>
                    </div>
                    <div className="rounded-xl bg-indigo-50 px-3 py-2">
                      <p className="font-black uppercase tracking-wider text-indigo-500">Mov.</p>
                      <p className="mt-1 text-lg font-black text-indigo-700">{totalMovements}</p>
                    </div>
                    <div className={`rounded-xl px-3 py-2 ${totalMargin >= 0 ? 'bg-emerald-50' : 'bg-rose-50'}`}>
                      <p className={`font-black uppercase tracking-wider ${totalMargin >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>Margen</p>
                      <p className="mt-1 text-lg font-black text-slate-900">{formatCompactMoney(totalMargin)}</p>
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {chartDisplayData.length > 0 ? (
                  <div className="h-[340px] min-w-0">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={chartDisplayData} margin={{ top: 12, right: 24, left: 8, bottom: 28 }} barCategoryGap="24%">
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                        <XAxis
                          dataKey="name"
                          axisLine={false}
                          tickLine={false}
                          interval={0}
                          minTickGap={6}
                          tick={{ fontSize: 11, fill: '#64748b' }}
                          tickFormatter={(value) => shortLabel(String(value), 14)}
                        />
                        <YAxis
                          width={76}
                          axisLine={false}
                          tickLine={false}
                          tick={{ fontSize: 11, fill: '#64748b' }}
                          tickFormatter={(value) => formatCompactMoney(Number(value || 0))}
                        />
                        <RechartsTooltip
                          formatter={(value: any, name: any, item: any) => {
                            const metricKey = item?.dataKey || name;
                            const labels: Record<string, string> = {
                              income: 'Ingreso',
                              Ingreso: 'Ingreso',
                              cost: 'Costo',
                              Costo: 'Costo',
                              reworkCost: 'Reproceso',
                              Reproceso: 'Reproceso',
                            };

                            return [
                              formatMoney(Number(value || 0)),
                              labels[metricKey] || String(name || metricKey),
                            ];
                          }}
                          labelFormatter={(label) => String(label)}
                          cursor={{ fill: '#f8fafc' }}
                          contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 16px 30px -20px rgb(15 23 42 / 0.45)' }}
                        />
                        <Bar dataKey="income" name="Ingreso" fill="#10b981" radius={[5, 5, 0, 0]} maxBarSize={42}>
                          {chartDisplayData.map((entry, index) => (
                            <Cell key={`income-${entry.name}-${index}`} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Bar>
                        <Bar dataKey="cost" name="Costo" fill="#ef4444" radius={[5, 5, 0, 0]} maxBarSize={42} />
                        <Bar dataKey="reworkCost" name="Reproceso" fill="#f97316" radius={[5, 5, 0, 0]} maxBarSize={42} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div className="flex min-h-[260px] items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 text-sm italic text-slate-400">
                    No hay datos por usuario aún.
                  </div>
                )}

                <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                  <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Top financiero</p>
                      <span className="text-[10px] font-black text-slate-400">{topFinancialUsers.length} visibles</span>
                    </div>
                    <div className="mt-2 space-y-2">
                      {topFinancialUsers.length === 0 ? (
                        <p className="rounded-lg bg-white p-3 text-xs font-semibold text-slate-500">Sin contribución monetaria todavía.</p>
                      ) : (
                        topFinancialUsers.map((person, index) => (
                          <div key={`${person.name}-${index}`} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-lg bg-white px-3 py-2 text-xs ring-1 ring-slate-100">
                            <span className="truncate font-bold text-slate-800" title={person.name}>{person.name}</span>
                            <span className={`font-black ${person.margin >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                              {formatCompactMoney(person.margin)}
                            </span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Top productividad</p>
                      <span className="text-[10px] font-black text-slate-400">{unitRateCardCount} rates unidad</span>
                    </div>
                    <div className="mt-2 space-y-2">
                      {topProductiveUsers.length === 0 ? (
                        <p className="rounded-lg bg-white p-3 text-xs font-semibold text-slate-500">Sin producción por unidad todavía.</p>
                      ) : (
                        topProductiveUsers.map((person, index) => (
                          <div key={`${person.name}-output-${index}`} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-lg bg-white px-3 py-2 text-xs ring-1 ring-slate-100">
                            <span className="truncate font-bold text-slate-800" title={person.name}>{person.name}</span>
                            <span className="font-black text-indigo-700">
                              {person.output.toLocaleString('es-CO', { maximumFractionDigits: 1 })}
                            </span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="min-w-0 border-slate-200 shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-black text-slate-900">Rate seleccionado</CardTitle>
                <CardDescription>Elige un indicador y revisa quién más aporta.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <select
                  value={selectedRateCard?.id || ''}
                  onChange={(event) => setSelectedRateCardId(event.target.value)}
                  className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500/20"
                >
                  {rateCardAnalytics.map(card => (
                    <option key={card.id} value={card.id}>{card.name}</option>
                  ))}
                </select>
                {selectedRateCard && (
                  <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
                      <div className="min-w-0">
                        <p className="text-xs font-black uppercase tracking-wider text-slate-400">
                          {isCurrencyRateCard(selectedRateCard) ? 'Monetario' : 'Productividad'}
                        </p>
                        <p className="mt-1 break-words text-lg font-black leading-tight text-slate-900">{selectedRateCard.name}</p>
                        <p className="mt-1 text-xs font-semibold text-slate-500">
                          {selectedRateCard.associatedBudgetLine?.name || 'Sin línea de presupuesto'}
                        </p>
                      </div>
                      <span className="max-w-[160px] rounded-full bg-white px-2 py-1 text-right text-[11px] font-black leading-tight text-indigo-700 ring-1 ring-indigo-100">
                        {formatRateCardUnits(selectedRateCard.cardTotalUnits, selectedRateCard, 1)}
                      </span>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                      <div className="min-w-0 rounded-lg bg-white p-2">
                        <p className="font-bold text-slate-400">Ingreso</p>
                        <p className="break-words font-black text-emerald-700">{formatMoney(selectedRateCard.incomeValue, selectedRateCard.currency || 'USD')}</p>
                      </div>
                      <div className="min-w-0 rounded-lg bg-white p-2">
                        <p className="font-bold text-slate-400">Costo</p>
                        <p className="break-words font-black text-rose-700">{formatMoney(selectedRateCard.costValue, selectedRateCard.currency || 'USD')}</p>
                      </div>
                      <div className="min-w-0 rounded-lg bg-white p-2">
                        <p className="font-bold text-slate-400">Resultado</p>
                        <p className="break-words font-black text-indigo-700">{formatRateCardValue(selectedRateCard.outputValue, selectedRateCard)}</p>
                      </div>
                      <div className="min-w-0 rounded-lg bg-white p-2">
                        <p className="font-bold text-slate-400">Margen</p>
                        <p className="break-words font-black text-slate-900">{formatMoney(selectedRateCard.marginValue, selectedRateCard.currency || 'USD')}</p>
                      </div>
                    </div>

                    <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                      <div className="rounded-lg border border-slate-100 bg-white p-2">
                        <p className="font-bold text-slate-400">Movimientos</p>
                        <p className="mt-1 font-black text-slate-900">{selectedRateCardEntries.length}</p>
                      </div>
                      <div className="rounded-lg border border-slate-100 bg-white p-2">
                        <p className="font-bold text-slate-400">Último</p>
                        <p className="mt-1 truncate font-black text-slate-900" title={selectedRateCardLastEntry?.personName || 'Sin movimiento'}>
                          {selectedRateCardLastEntry ? formatReportDate(selectedRateCardLastEntry.dateKey) : 'Sin dato'}
                        </p>
                      </div>
                    </div>

                    <div className="mt-3 space-y-2">
                      <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Top contribuyentes</p>
                      {selectedRateCardContribution.length === 0 ? (
                        <p className="rounded-lg bg-white p-3 text-xs font-semibold text-slate-500">Sin movimientos individuales.</p>
                      ) : (
                        selectedRateCardContribution.map((person: any) => (
                          <div key={person.userId} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-lg bg-white p-2">
                            <span className="truncate text-xs font-bold text-slate-700" title={person.name}>{person.name}</span>
                            <span className="max-w-[180px] break-words text-right text-xs font-black leading-tight text-indigo-700">
                              {formatRateCardUnits(person.units, selectedRateCard, 1)}
                            </span>
                          </div>
                        ))
                      )}
                    </div>
                    <div className="mt-4 space-y-2">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Interacciones recientes</p>
                        <span className="rounded-full bg-white px-2 py-1 text-[10px] font-black text-slate-500 ring-1 ring-slate-100">
                          {selectedRateCardEntries.length}
                        </span>
                      </div>
                      {selectedRateCardEntries.length === 0 ? (
                        <p className="rounded-lg bg-white p-3 text-xs font-semibold text-slate-500">Este rate todavía no tiene interacciones reportadas.</p>
                      ) : (
                        <div className="max-h-60 space-y-2 overflow-y-auto pr-1">
                          {selectedRateCardEntries.slice(0, 8).map((entry: any) => (
                            <div key={entry.id} className="rounded-lg bg-white p-2 text-xs ring-1 ring-slate-100">
                              <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
                                <span className="truncate font-bold text-slate-800" title={entry.personName}>{entry.personName}</span>
                                <span className="max-w-[180px] break-words text-right font-black leading-tight text-indigo-700">
                                  {formatRateCardUnits(entry.units, selectedRateCard, 1)}
                                </span>
                              </div>
                              <div className="mt-1 grid grid-cols-[auto_minmax(0,1fr)] gap-2 text-[11px] text-slate-500">
                                <span>{formatReportDate(entry.dateKey)}</span>
                                <span className="truncate text-right" title={entry.taskTitle || 'Sin tarea asociada'}>{entry.taskTitle || 'Sin tarea asociada'}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      <Card className="border-slate-200 shadow-sm">
        <CardHeader className="pb-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <CardTitle className="text-lg font-semibold text-slate-900 flex items-center gap-2">
                <FileText size={18} className="text-indigo-500" />
                Estadísticas e interacciones de rates
              </CardTitle>
              <CardDescription className="mt-1">
                Selecciona uno o varios indicadores, grafica su movimiento y descarga el reporte filtrado.
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
                Analizar
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
          <div className="mt-4 rounded-xl border border-slate-100 bg-slate-50 p-3">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">Rates a graficar</p>
              <div className="flex gap-2">
                <Button type="button" variant="outline" size="sm" onClick={selectAllAnalysisRates} className="h-8 border-slate-200 text-xs">
                  Todos
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setReportGenerated(false);
                    setAnalysisRateIds(selectedRateCard ? [selectedRateCard.id] : rateCards.slice(0, 1).map(card => card.id));
                  }}
                  className="h-8 border-slate-200 text-xs"
                >
                  Rate activo
                </Button>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {rateCards.map(card => {
                const active = analysisRateIds.includes(card.id);
                return (
                  <button
                    key={card.id}
                    type="button"
                    onClick={() => toggleAnalysisRate(card.id)}
                    className={`rounded-full border px-3 py-1.5 text-xs font-black transition ${
                      active
                        ? 'border-indigo-200 bg-indigo-600 text-white shadow-sm'
                        : 'border-slate-200 bg-white text-slate-600 hover:border-indigo-200 hover:text-indigo-700'
                    }`}
                  >
                    {card.name}
                  </button>
                );
              })}
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
                <div className="rounded-lg border border-emerald-100 bg-emerald-50 p-4">
                  <p className="text-xs font-bold uppercase tracking-wider text-emerald-700">Ingresos</p>
                  <p className="mt-1 text-2xl font-bold text-slate-900">
                    {formatMoney(reportRows.reduce((sum: number, entry: any) => sum + entry.income, 0), rateCards[0]?.currency || 'USD')}
                  </p>
                </div>
                <div className="rounded-lg border border-rose-100 bg-rose-50 p-4">
                  <p className="text-xs font-bold uppercase tracking-wider text-rose-700">Costos</p>
                  <p className="mt-1 text-2xl font-bold text-slate-900">
                    {formatMoney(reportRows.reduce((sum: number, entry: any) => sum + entry.cost, 0), rateCards[0]?.currency || 'USD')}
                  </p>
                </div>
              </div>
              {reportHasHistoricalBalances && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">
                  Algunos valores vienen de saldos acumulados antiguos sin fecha individual. Se incluyen como acumulado histórico para que el reporte no oculte producción registrada.
                </div>
              )}

              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-black text-slate-900">Movimiento por indicador</h3>
                    <p className="text-xs text-slate-500">La gráfica muestra unidades reportadas por día para comparar rates distintos sin mezclar moneda y productividad.</p>
                  </div>
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-600">
                    {selectedAnalysisCards.length} seleccionados
                  </span>
                </div>
                {reportChartData.length > 0 ? (
                  <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={reportChartData} margin={{ top: 10, right: 16, left: -10, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                        <XAxis dataKey="dateLabel" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} />
                        <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} />
                        <RechartsTooltip
                          formatter={(value: any, name: any, item: any) => {
                            const metricKey = item?.dataKey || name;
                            const card = rateCards.find(rate => rate.id === metricKey || rate.name === name);
                            return [
                              formatRateCardUnits(Number(value || 0), card || { indicator: 'unidades' }, 2),
                              card?.name || name,
                            ];
                          }}
                          cursor={{ fill: '#f8fafc' }}
                          contentStyle={{ borderRadius: '10px', border: '1px solid #e2e8f0', boxShadow: '0 12px 24px -16px rgb(15 23 42 / 0.35)' }}
                        />
                        {selectedAnalysisCards.map((card, index) => (
                          <Bar
                            key={card.id}
                            dataKey={card.id}
                            name={card.name}
                            fill={COLORS[index % COLORS.length]}
                            radius={[4, 4, 0, 0]}
                            maxBarSize={34}
                          />
                        ))}
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 py-10 text-center text-sm text-slate-500">
                    No hay datos para graficar en el rango y rates seleccionados.
                  </div>
                )}
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
                        <TableHead className="font-semibold text-slate-600 text-right">Ingreso</TableHead>
                        <TableHead className="font-semibold text-slate-600 text-right">Costo</TableHead>
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
                            {formatMoney(row.income, row.currency || 'USD')}
                          </TableCell>
                          <TableCell className="text-right font-semibold text-rose-700">
                            {formatMoney(row.cost, row.currency || 'USD')}
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
                      <TableHead className="font-semibold text-slate-600 text-right">Ingreso</TableHead>
                      <TableHead className="font-semibold text-slate-600 text-right">Costo</TableHead>
                      <TableHead className="font-semibold text-slate-600 text-right">Resultado</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {reportRows.map((entry: any) => (
                      <TableRow key={entry.id}>
                        <TableCell className="whitespace-nowrap text-slate-700">
                          {entry.displayDate || formatReportDate(entry.dateKey)}
                        </TableCell>
                        <TableCell className="font-medium text-slate-900">{entry.personName}</TableCell>
                        <TableCell className="text-slate-700">{entry.rateCardName}</TableCell>
                        <TableCell className="max-w-[260px] truncate text-slate-600" title={entry.taskTitle || ''}>
                          {entry.taskTitle || 'Sin tarea'}
                        </TableCell>
                        <TableCell className={entry.units < 0 ? 'font-medium text-red-600' : 'font-medium text-emerald-700'}>
                          {formatRateCardUnits(entry.units, entry)}
                        </TableCell>
                        <TableCell className="text-right font-semibold text-emerald-700">
                          {formatMoney(entry.income, entry.currency || 'USD')}
                        </TableCell>
                        <TableCell className="text-right font-semibold text-rose-700">
                          {formatMoney(entry.cost, entry.currency || 'USD')}
                        </TableCell>
                        <TableCell className={`text-right font-semibold ${entry.value < 0 ? 'text-red-600' : 'text-emerald-700'}`}>
                          {formatRateCardValue(entry.value, entry)}
                        </TableCell>
                      </TableRow>
                    ))}
                    {reportRows.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={8} className="py-8 text-center text-sm text-slate-500">
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
                <TableHead className="font-semibold text-slate-600 text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rateCards.map((card) => {
                const analytics = rateCardAnalytics.find(row => row.id === card.id);
                const totalUnits = analytics?.cardTotalUnits || 0;
                const totalGenerated = analytics?.outputValue || 0;
                const incomeValue = analytics?.incomeValue || 0;
                const costValue = analytics?.costValue || 0;
                const marginValue = analytics?.marginValue || 0;
                const reworkCostValue = analytics?.reworkCostValue || 0;
                const associatedBudgetLine = analytics?.associatedBudgetLine || budgetLines.find(bl => bl.id === card.budgetLineId);

                return (
                  <TableRow
                    key={card.id}
                    onClick={() => setSelectedRateCardId(card.id)}
                    className={`cursor-pointer hover:bg-slate-50/70 ${selectedRateCardId === card.id ? 'bg-indigo-50/60 ring-1 ring-inset ring-indigo-100' : ''}`}
                  >
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
                      <div>{formatRateCardRate(isCurrencyRateCard(card) ? getRateCardIncomeRate(card) : card.rate, card)}</div>
                      {getRateCardCostRate(card) > 0 && (
                        <div className="mt-1 text-[11px] font-semibold text-rose-600">
                          Costo {formatMoney(getRateCardCostRate(card), card.currency || 'USD')} / {card.indicator || 'unidad'}
                        </div>
                      )}
                      <div className="mt-1 text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">
                        {isCurrencyRateCard(card) ? 'Dinero' : 'Unidad / medida'}
                      </div>
                    </TableCell>
                    <TableCell className="font-medium">
                      <div className="text-emerald-700">
                        {formatRateCardValue(totalGenerated, card)}
                        <div className="text-xs text-slate-500 font-normal">{formatRateCardUnits(totalUnits, card, 1)}</div>
                      </div>
                      <div className="mt-1 grid grid-cols-1 gap-1 text-[11px] text-slate-500">
                        {isCurrencyRateCard(card) && <span>Ingreso: <b className="text-emerald-700">{formatMoney(incomeValue, card.currency || 'USD')}</b></span>}
                        {costValue > 0 && <span>Costo: <b className="text-rose-700">{formatMoney(costValue, card.currency || 'USD')}</b></span>}
                        {isCurrencyRateCard(card) && <span>Margen: <b className={marginValue < 0 ? 'text-rose-700' : 'text-slate-900'}>{formatMoney(marginValue, card.currency || 'USD')}</b></span>}
                      </div>
                      {reworkCostValue > 0 && (
                        <div className="mt-1 text-red-600" title="Costo de reproceso (Devoluciones)">
                          -{formatMoney(reworkCostValue, card.currency || 'USD')}
                          <div className="text-[10px] font-normal">{formatRateCardUnits(card.reworkValue, card, 1)} reproceso</div>
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <button 
                          onClick={(event) => {
                            event.stopPropagation();
                            handleEditRateCard(card);
                          }}
                          className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-md transition-colors"
                          title="Editar"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>
                        </button>
                        <button 
                          onClick={(event) => {
                            event.stopPropagation();
                            handleDeleteRateCard(card.id);
                          }}
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
                  <TableCell colSpan={7} className="text-center py-12 text-slate-500">
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
          <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-xl bg-white p-6 m-4 shadow-xl animate-in fade-in zoom-in-95 duration-200">
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
              {rateType === 'currency' ? (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-700">Ingreso por indicador</label>
                    <input
                      type="number"
                      step="any"
                      min="0"
                      value={incomeRate}
                      onChange={(e) => setIncomeRate(e.target.value)}
                      className="w-full h-10 px-3 rounded-md border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-sm"
                      placeholder="0.00"
                      required
                    />
                    <p className="text-xs text-slate-500">Puede ser 0 si solo genera costo.</p>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-700">Costo por indicador</label>
                    <input
                      type="number"
                      step="any"
                      min="0"
                      value={costRate}
                      onChange={(e) => setCostRate(e.target.value)}
                      className="w-full h-10 px-3 rounded-md border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-sm"
                      placeholder="0.00"
                    />
                  </div>
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
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-700">Factor productivo</label>
                    <input
                      type="number"
                      step="any"
                      min="0"
                      value={rate}
                      onChange={(e) => setRate(e.target.value)}
                      className="w-full h-10 px-3 rounded-md border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-sm"
                      placeholder="1.00"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-700">Unidad resultado</label>
                    <input
                      type="text"
                      value={unitLabel}
                      onChange={(e) => setUnitLabel(e.target.value)}
                      className="w-full h-10 px-3 rounded-md border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-sm"
                      placeholder="Ej. predios, m2, puntos"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-700">Costo por unidad</label>
                    <input
                      type="number"
                      step="any"
                      min="0"
                      value={costRate}
                      onChange={(e) => setCostRate(e.target.value)}
                      className="w-full h-10 px-3 rounded-md border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-sm"
                      placeholder="0.00"
                    />
                  </div>
                </div>
              )}
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
                  disabled={!name || !indicator || (rateType === 'currency' ? incomeRate === '' : rate === '') || loading} 
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
          <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-xl bg-white p-6 m-4 shadow-xl animate-in fade-in zoom-in-95 duration-200">
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
              {rateType === 'currency' ? (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-700">Ingreso por indicador</label>
                    <input
                      type="number"
                      step="any"
                      min="0"
                      value={incomeRate}
                      onChange={(e) => setIncomeRate(e.target.value)}
                      className="w-full h-10 px-3 rounded-md border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-sm"
                      placeholder="0.00"
                      required
                    />
                    <p className="text-xs text-slate-500">Puede ser 0 si solo genera costo.</p>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-700">Costo por indicador</label>
                    <input
                      type="number"
                      step="any"
                      min="0"
                      value={costRate}
                      onChange={(e) => setCostRate(e.target.value)}
                      className="w-full h-10 px-3 rounded-md border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-sm"
                      placeholder="0.00"
                    />
                  </div>
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
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-700">Factor productivo</label>
                    <input
                      type="number"
                      step="any"
                      min="0"
                      value={rate}
                      onChange={(e) => setRate(e.target.value)}
                      className="w-full h-10 px-3 rounded-md border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-sm"
                      placeholder="1.00"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-700">Unidad resultado</label>
                    <input
                      type="text"
                      value={unitLabel}
                      onChange={(e) => setUnitLabel(e.target.value)}
                      className="w-full h-10 px-3 rounded-md border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-sm"
                      placeholder="Ej. predios, m2, puntos"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-700">Costo por unidad</label>
                    <input
                      type="number"
                      step="any"
                      min="0"
                      value={costRate}
                      onChange={(e) => setCostRate(e.target.value)}
                      className="w-full h-10 px-3 rounded-md border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-sm"
                      placeholder="0.00"
                    />
                  </div>
                </div>
              )}
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
                  disabled={!name || !indicator || (rateType === 'currency' ? incomeRate === '' : rate === '') || loading} 
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
