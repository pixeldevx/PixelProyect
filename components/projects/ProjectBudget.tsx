import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, Trash2, DollarSign, TrendingUp, AlertCircle, X } from 'lucide-react';
import { collection, query, onSnapshot, addDoc, deleteDoc, doc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { toast } from 'sonner';
import { Progress } from '@/components/ui/progress';

export function ProjectBudget({ projectId, rateCards = [], tasks = [] }: { projectId: string, rateCards?: any[], tasks?: any[] }) {
  const [budgetLines, setBudgetLines] = useState<any[]>([]);
  const [name, setName] = useState('');
  const [plannedAmount, setPlannedAmount] = useState('');
  const [currency, setCurrency] = useState('COP');
  const [loading, setLoading] = useState(false);
  const [budgetLineToDelete, setBudgetLineToDelete] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  useEffect(() => {
    const q = query(collection(db, 'projects', projectId, 'budgetLines'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      data.sort((a: any, b: any) => (b.createdAt?.toMillis() || 0) - (a.createdAt?.toMillis() || 0));
      setBudgetLines(data);
    });
    return () => unsubscribe();
  }, [projectId]);

  const handleCreateBudgetLine = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !plannedAmount) return;
    setLoading(true);
    try {
      await addDoc(collection(db, 'projects', projectId, 'budgetLines'), {
        name: name.trim(),
        plannedAmount: parseFloat(plannedAmount),
        currency,
        createdAt: serverTimestamp(),
      });
      setName('');
      setPlannedAmount('');
      setIsCreateModalOpen(false);
      toast.success('Línea de presupuesto creada');
    } catch (error) {
      console.error("Error creating budget line:", error);
      toast.error('Error al crear línea de presupuesto');
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
      toast.success('Línea de presupuesto eliminada');
    } catch (error) {
      console.error("Error deleting budget line:", error);
      toast.error('Error al eliminar línea de presupuesto');
    } finally {
      setIsDeleting(false);
    }
  };

  // Calculate actuals for each rate card
  const rateCardActuals = rateCards.map(card => {
    let cardTotalUnits = 0;
    const computedUserStats: Record<string, number> = { ...(card.userStats || {}) };

    if (card.syncExternal) {
      cardTotalUnits = card.currentValue || 0;
    } else {
      // Start with currentValue (which includes units from isRateCardTask tasks)
      cardTotalUnits = card.currentValue || 0;
      
      // Add units from non-isRateCardTask tasks that match the indicator
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
      
      // Ensure cardTotalUnits is at least the sum of user stats
      const userStatsTotal = Object.values(computedUserStats).reduce((sum: number, val: any) => sum + (Number(val) || 0), 0);
      if (userStatsTotal > cardTotalUnits) {
        cardTotalUnits = userStatsTotal;
      }
    }
    
    const generatedValue = cardTotalUnits * card.rate;
    const reworkValue = (card.reworkValue || 0) * card.rate;
    const totalValue = generatedValue + reworkValue;

    return {
      ...card,
      generatedValue,
      reworkValue,
      totalValue
    };
  });

  // Map budget lines to their actuals
  const budgetData = budgetLines.map(line => {
    const associatedActuals = rateCardActuals.filter(rc => rc.budgetLineId === line.id);
    const actualAmount = associatedActuals.reduce((sum, rc) => sum + rc.totalValue, 0);
    const variance = line.plannedAmount - actualAmount;
    const percentUsed = line.plannedAmount > 0 ? (actualAmount / line.plannedAmount) * 100 : 0;

    return {
      ...line,
      actualAmount,
      variance,
      percentUsed
    };
  });

  // Calculate unassigned costs
  const unassignedActuals = rateCardActuals.filter(rc => !rc.budgetLineId);
  const totalUnassignedActual = unassignedActuals.reduce((sum, rc) => sum + rc.totalValue, 0);

  const totalPlanned = budgetData.reduce((sum, line) => sum + line.plannedAmount, 0);
  const totalActual = budgetData.reduce((sum, line) => sum + line.actualAmount, 0) + totalUnassignedActual;
  const totalVariance = totalPlanned - totalActual;
  const totalPercentUsed = totalPlanned > 0 ? (totalActual / totalPlanned) * 100 : 0;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <DollarSign size={20} className="text-emerald-500" />
            Presupuesto del Proyecto
          </h2>
          <p className="text-sm text-slate-500 mt-1">Gestiona las líneas de presupuesto y monitorea los costos reales vs planificados.</p>
        </div>
        <Button 
          onClick={() => setIsCreateModalOpen(true)}
          className="bg-emerald-600 hover:bg-emerald-700 text-white"
        >
          <Plus size={16} className="mr-2" />
          Nueva Línea
        </Button>
      </div>

      {/* Dashboard Section */}
      {budgetLines.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="border-slate-200 shadow-sm">
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-2">
                <span className="text-slate-500 text-sm font-medium">Presupuesto Planificado</span>
                <DollarSign className="text-slate-400" size={18} />
              </div>
              <div className="text-3xl font-bold text-slate-900">
                {totalPlanned.toLocaleString('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })}
              </div>
            </CardContent>
          </Card>

          <Card className="border-slate-200 shadow-sm">
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-2">
                <span className="text-slate-500 text-sm font-medium">Costo Real (Rate Cards)</span>
                <TrendingUp className="text-indigo-500" size={18} />
              </div>
              <div className="text-3xl font-bold text-indigo-600">
                {totalActual.toLocaleString('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })}
              </div>
            </CardContent>
          </Card>

          <Card className="border-slate-200 shadow-sm">
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-2">
                <span className="text-slate-500 text-sm font-medium">Presupuesto Disponible</span>
                <AlertCircle className={totalVariance >= 0 ? "text-emerald-500" : "text-red-500"} size={18} />
              </div>
              <div className={`text-3xl font-bold ${totalVariance >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                {totalVariance.toLocaleString('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })}
              </div>
              <div className="mt-4">
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-slate-500">Uso del presupuesto</span>
                  <span className="font-bold text-slate-700">{totalPercentUsed.toFixed(1)}%</span>
                </div>
                <Progress value={Math.min(totalPercentUsed, 100)} className={`h-1.5 ${totalPercentUsed > 100 ? 'bg-red-100' : ''}`} indicatorClassName={totalPercentUsed > 100 ? 'bg-red-500' : 'bg-emerald-500'} />
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <Card className="border-slate-200 shadow-sm">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50/50">
                <TableHead className="font-semibold text-slate-600">Línea de Presupuesto</TableHead>
                <TableHead className="font-semibold text-slate-600 text-right">Planificado</TableHead>
                <TableHead className="font-semibold text-slate-600 text-right">Costo Real</TableHead>
                <TableHead className="font-semibold text-slate-600 text-right">Disponible</TableHead>
                <TableHead className="font-semibold text-slate-600 text-center">Uso</TableHead>
                <TableHead className="font-semibold text-slate-600 text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {budgetData.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-slate-500">
                    No hay líneas de presupuesto configuradas.
                  </TableCell>
                </TableRow>
              ) : (
                <>
                  {budgetData.map((line) => (
                    <TableRow key={line.id} className="hover:bg-slate-50/50">
                      <TableCell>
                        <div className="font-medium text-slate-900">{line.name}</div>
                      </TableCell>
                      <TableCell className="text-right font-medium text-slate-700">
                        {line.plannedAmount.toLocaleString('es-CO', { style: 'currency', currency: line.currency })}
                      </TableCell>
                      <TableCell className="text-right font-medium text-indigo-600">
                        {line.actualAmount.toLocaleString('es-CO', { style: 'currency', currency: line.currency })}
                      </TableCell>
                      <TableCell className="text-right">
                        <span className={`font-medium ${line.variance >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                          {line.variance.toLocaleString('es-CO', { style: 'currency', currency: line.currency })}
                        </span>
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex flex-col items-center gap-1">
                          <span className="text-xs font-medium text-slate-600">{line.percentUsed.toFixed(1)}%</span>
                          <Progress value={Math.min(line.percentUsed, 100)} className="h-1.5 w-16" indicatorClassName={line.percentUsed > 100 ? 'bg-red-500' : 'bg-emerald-500'} />
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          onClick={() => setBudgetLineToDelete(line.id)}
                          className="text-red-500 hover:text-red-700 hover:bg-red-50"
                        >
                          <Trash2 size={16} />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  
                  {totalUnassignedActual > 0 && (
                    <TableRow className="bg-slate-50/30 italic">
                      <TableCell>
                        <div className="font-medium text-slate-600 flex items-center gap-2">
                          Otros Costos (Rate Cards sin asignar)
                          <div className="group relative">
                            <AlertCircle size={14} className="text-slate-400 cursor-help" />
                            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block w-48 p-2 bg-slate-800 text-white text-[10px] rounded shadow-lg z-10 not-italic">
                              Costos generados por Rate Cards que no están vinculadas a ninguna línea de presupuesto específica.
                            </div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-right text-slate-400">
                        -
                      </TableCell>
                      <TableCell className="text-right font-medium text-indigo-600">
                        {totalUnassignedActual.toLocaleString('es-CO', { style: 'currency', currency: 'COP' })}
                      </TableCell>
                      <TableCell className="text-right text-slate-400">
                        -
                      </TableCell>
                      <TableCell className="text-center text-slate-400">
                        -
                      </TableCell>
                      <TableCell className="text-right">
                        {/* No actions for unassigned costs */}
                      </TableCell>
                    </TableRow>
                  )}
                </>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Create Modal */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="flex justify-between items-center p-4 border-b border-slate-100">
              <h3 className="font-semibold text-lg text-slate-800">Nueva Línea de Presupuesto</h3>
              <button onClick={() => setIsCreateModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleCreateBudgetLine} className="p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Nombre de la Línea</label>
                <input 
                  type="text" 
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full p-2 border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  placeholder="Ej. Avalúos, Estudios Técnicos..."
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Monto Planificado</label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-slate-500">$</span>
                  <input 
                    type="number" 
                    value={plannedAmount}
                    onChange={(e) => setPlannedAmount(e.target.value)}
                    className="w-full p-2 pl-8 border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    placeholder="0.00"
                    min="0"
                    step="0.01"
                    required
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Moneda</label>
                <select 
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  className="w-full p-2 border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="COP">COP - Peso Colombiano</option>
                  <option value="USD">USD - Dólar Estadounidense</option>
                  <option value="EUR">EUR - Euro</option>
                </select>
              </div>
              <div className="flex justify-end gap-2 pt-4">
                <Button type="button" variant="outline" onClick={() => setIsCreateModalOpen(false)}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={loading} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                  {loading ? 'Guardando...' : 'Guardar Línea'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {budgetLineToDelete && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm overflow-hidden p-6 text-center">
            <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
            <h3 className="text-lg font-bold text-slate-900 mb-2">¿Eliminar línea de presupuesto?</h3>
            <p className="text-slate-500 text-sm mb-6">
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
