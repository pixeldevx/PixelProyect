import React, { useState, useEffect } from 'react';
import { collection, query, onSnapshot, addDoc, updateDoc, deleteDoc, doc, serverTimestamp, orderBy, getDoc } from '@/lib/supabase/document-store';
import { db, auth } from '@/lib/backend';
import { handleDataError, OperationType } from '@/lib/backend-utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Plus, Trash2, Edit, FileText, DollarSign, TrendingUp, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

interface Invoice {
  id: string;
  projectId: string;
  invoiceNumber: string;
  description: string;
  amount: number;
  date: any;
  status: 'pending' | 'paid' | 'cancelled';
  createdAt: any;
  createdBy: string;
}

interface ProjectBillingProps {
  projectId: string;
  rateCards: any[];
  tasks: any[];
}

export default function ProjectBilling({ projectId, rateCards, tasks }: ProjectBillingProps) {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [budgetLines, setBudgetLines] = useState<any[]>([]);
  const [userRole, setUserRole] = useState<string>('user');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState<Invoice | null>(null);
  const [formData, setFormData] = useState({
    invoiceNumber: '',
    description: '',
    amount: '',
    date: new Date().toISOString().split('T')[0],
    status: 'pending'
  });

  const canEdit = ['admin', 'manager', 'administrativo'].includes(userRole);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (user) => {
      if (user) {
        try {
          const userDoc = await getDoc(doc(db, 'users', user.uid));
          if (userDoc.exists()) {
            setUserRole(userDoc.data().role || 'user');
          }
        } catch (error) {
          console.error("Error fetching user role:", error);
        }
      } else {
        setUserRole('user');
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!projectId) return;

    const qInvoices = query(collection(db, `projects/${projectId}/invoices`), orderBy('date', 'desc'));
    const unsubscribeInvoices = onSnapshot(qInvoices, (snapshot) => {
      const invoiceData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Invoice[];
      setInvoices(invoiceData);
    }, (error) => {
      handleDataError(error, OperationType.GET, `projects/${projectId}/invoices`);
    });

    const qBudget = query(collection(db, `projects/${projectId}/budgetLines`));
    const unsubscribeBudget = onSnapshot(qBudget, (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setBudgetLines(data);
    }, (error) => {
      handleDataError(error, OperationType.GET, `projects/${projectId}/budgetLines`);
    });

    return () => {
      unsubscribeInvoices();
      unsubscribeBudget();
    };
  }, [projectId]);

  // Calculate Costs (same logic as ProjectBudget)
  const rateCardActuals = rateCards.map(card => {
    let cardTotalUnits = card.currentValue || 0;
    if (card.userStats) {
      const userStatsTotal: number = Object.values(card.userStats).reduce((sum: any, val: any) => sum + (Number(val) || 0), 0) as number;
      if (userStatsTotal > cardTotalUnits) {
        cardTotalUnits = userStatsTotal;
      }
    }
    
    const generatedValue = cardTotalUnits * card.rate;
    const reworkValue = (card.reworkValue || 0) * card.rate;
    const totalValue = generatedValue + reworkValue;

    return {
      ...card,
      totalValue
    };
  });

  const budgetData = budgetLines.map(line => {
    const associatedActuals = rateCardActuals.filter(rc => rc.budgetLineId === line.id);
    const actualAmount = associatedActuals.reduce((sum, rc) => sum + rc.totalValue, 0);
    return { ...line, actualAmount };
  });

  const unassignedActuals = rateCardActuals.filter(rc => !rc.budgetLineId);
  const totalUnassignedActual = unassignedActuals.reduce((sum, rc) => sum + rc.totalValue, 0);

  const totalPlanned = budgetData.reduce((sum, line) => sum + line.plannedAmount, 0);
  const totalActual = budgetData.reduce((sum, line) => sum + line.actualAmount, 0) + totalUnassignedActual;

  // Calculate Billing
  const totalBilled = invoices.filter(i => i.status !== 'cancelled').reduce((sum, i) => sum + i.amount, 0);
  const totalPaid = invoices.filter(i => i.status === 'paid').reduce((sum, i) => sum + i.amount, 0);
  
  const grossMargin = totalBilled > 0 ? ((totalBilled - totalActual) / totalBilled) * 100 : 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth.currentUser) return;

    try {
      const invoiceData = {
        projectId,
        invoiceNumber: formData.invoiceNumber,
        description: formData.description,
        amount: Number(formData.amount),
        date: new Date(formData.date),
        status: formData.status,
      };

      if (editingInvoice) {
        await updateDoc(doc(db, `projects/${projectId}/invoices`, editingInvoice.id), invoiceData);
        toast.success('Factura actualizada exitosamente');
      } else {
        await addDoc(collection(db, `projects/${projectId}/invoices`), {
          ...invoiceData,
          createdAt: serverTimestamp(),
          createdBy: auth.currentUser.uid
        });
        toast.success('Factura creada exitosamente');
      }
      setIsModalOpen(false);
      setEditingInvoice(null);
      setFormData({ invoiceNumber: '', description: '', amount: '', date: new Date().toISOString().split('T')[0], status: 'pending' });
    } catch (error) {
      handleDataError(error, editingInvoice ? OperationType.UPDATE : OperationType.CREATE, `projects/${projectId}/invoices`);
      toast.error('Error al guardar la factura');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('¿Estás seguro de que deseas eliminar esta factura?')) return;
    try {
      await deleteDoc(doc(db, `projects/${projectId}/invoices`, id));
      toast.success('Factura eliminada');
    } catch (error) {
      handleDataError(error, OperationType.DELETE, `projects/${projectId}/invoices/${id}`);
      toast.error('Error al eliminar la factura');
    }
  };

  const openEditModal = (invoice: Invoice) => {
    setEditingInvoice(invoice);
    setFormData({
      invoiceNumber: invoice.invoiceNumber,
      description: invoice.description || '',
      amount: invoice.amount.toString(),
      date: invoice.date?.toDate ? invoice.date.toDate().toISOString().split('T')[0] : new Date(invoice.date).toISOString().split('T')[0],
      status: invoice.status
    });
    setIsModalOpen(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <FileText size={20} className="text-blue-500" />
            Facturación y Cobros
          </h2>
          <p className="text-sm text-slate-500 mt-1">Gestiona las facturas y monitorea los ingresos vs costos reales.</p>
        </div>
        {canEdit && (
          <Button 
            onClick={() => {
              setEditingInvoice(null);
              setFormData({ invoiceNumber: '', description: '', amount: '', date: new Date().toISOString().split('T')[0], status: 'pending' });
              setIsModalOpen(true);
            }}
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            <Plus size={16} className="mr-2" />
            Nueva Factura
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="border-slate-200 shadow-sm">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-500">Ingresos Totales (Facturado)</p>
                <h3 className="text-2xl font-bold text-slate-900 mt-1">
                  ${totalBilled.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </h3>
              </div>
              <div className="p-3 bg-blue-100 rounded-full">
                <FileText size={20} className="text-blue-600" />
              </div>
            </div>
            <div className="mt-4 flex items-center text-sm">
              <span className="text-slate-500">Cobrado: ${totalPaid.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-200 shadow-sm">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-500">Costo Real</p>
                <h3 className="text-2xl font-bold text-slate-900 mt-1">
                  ${totalActual.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </h3>
              </div>
              <div className="p-3 bg-rose-100 rounded-full">
                <DollarSign size={20} className="text-rose-600" />
              </div>
            </div>
            <div className="mt-4 flex items-center text-sm">
              <span className="text-slate-500">Presupuesto: ${totalPlanned.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-200 shadow-sm">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-500">Margen Bruto</p>
                <h3 className={`text-2xl font-bold mt-1 ${grossMargin >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                  {grossMargin.toFixed(1)}%
                </h3>
              </div>
              <div className={`p-3 rounded-full ${grossMargin >= 0 ? 'bg-emerald-100' : 'bg-rose-100'}`}>
                <TrendingUp size={20} className={grossMargin >= 0 ? 'text-emerald-600' : 'text-rose-600'} />
              </div>
            </div>
            <div className="mt-4 flex items-center text-sm">
              <span className="text-slate-500">Utilidad: ${(totalBilled - totalActual).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-slate-500 uppercase bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-6 py-4 font-medium">Nº Factura</th>
                <th className="px-6 py-4 font-medium">Descripción</th>
                <th className="px-6 py-4 font-medium">Fecha</th>
                <th className="px-6 py-4 font-medium text-right">Monto</th>
                <th className="px-6 py-4 font-medium text-center">Estado</th>
                {canEdit && <th className="px-6 py-4 font-medium text-right">Acciones</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {invoices.length === 0 ? (
                <tr>
                  <td colSpan={canEdit ? 6 : 5} className="px-6 py-8 text-center text-slate-500">
                    <div className="flex flex-col items-center justify-center">
                      <FileText size={32} className="text-slate-300 mb-2" />
                      <p>No hay facturas registradas</p>
                    </div>
                  </td>
                </tr>
              ) : (
                invoices.map((invoice) => (
                  <tr key={invoice.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-6 py-4 font-medium text-slate-900">{invoice.invoiceNumber}</td>
                    <td className="px-6 py-4 text-slate-600">{invoice.description}</td>
                    <td className="px-6 py-4 text-slate-600">
                      {invoice.date?.toDate ? invoice.date.toDate().toLocaleDateString() : new Date(invoice.date).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 text-right font-medium text-slate-900">
                      ${invoice.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        invoice.status === 'paid' ? 'bg-emerald-100 text-emerald-800' :
                        invoice.status === 'pending' ? 'bg-amber-100 text-amber-800' :
                        'bg-slate-100 text-slate-800'
                      }`}>
                        {invoice.status === 'paid' ? 'Pagada' : invoice.status === 'pending' ? 'Pendiente' : 'Cancelada'}
                      </span>
                    </td>
                    {canEdit && (
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => openEditModal(invoice)}
                            className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                            title="Editar"
                          >
                            <Edit size={16} />
                          </button>
                          <button
                            onClick={() => handleDelete(invoice.id)}
                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                            title="Eliminar"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="p-6 border-b border-slate-100">
              <h3 className="text-lg font-semibold text-slate-900">
                {editingInvoice ? 'Editar Factura' : 'Nueva Factura'}
              </h3>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Número de Factura</label>
                <input
                  type="text"
                  required
                  value={formData.invoiceNumber}
                  onChange={(e) => setFormData({...formData, invoiceNumber: e.target.value})}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  placeholder="Ej: FAC-001"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Descripción</label>
                <input
                  type="text"
                  value={formData.description}
                  onChange={(e) => setFormData({...formData, description: e.target.value})}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  placeholder="Concepto de la factura"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Monto ($)</label>
                <input
                  type="number"
                  required
                  min="0"
                  step="0.01"
                  value={formData.amount}
                  onChange={(e) => setFormData({...formData, amount: e.target.value})}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  placeholder="0.00"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Fecha</label>
                <input
                  type="date"
                  required
                  value={formData.date}
                  onChange={(e) => setFormData({...formData, date: e.target.value})}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Estado</label>
                <select
                  value={formData.status}
                  onChange={(e) => setFormData({...formData, status: e.target.value as any})}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                >
                  <option value="pending">Pendiente</option>
                  <option value="paid">Pagada</option>
                  <option value="cancelled">Cancelada</option>
                </select>
              </div>

              <div className="flex justify-end gap-3 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsModalOpen(false)}
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  className="bg-blue-600 hover:bg-blue-700 text-white"
                >
                  {editingInvoice ? 'Actualizar' : 'Guardar'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
