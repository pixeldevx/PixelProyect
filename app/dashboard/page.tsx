"use client"

import React from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { 
  LayoutDashboard, 
  FolderKanban, 
  FileText, 
  TrendingUp, 
  CheckCircle2,
  Clock,
  AlertCircle
} from 'lucide-react';

export default function DashboardPage() {
  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
          <p className="text-slate-500">Bienvenido a tu panel de control. Aquí tienes un resumen de tus proyectos.</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-slate-700">Proyectos Activos</h3>
              <div className="w-10 h-10 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-600">
                <FolderKanban size={20} />
              </div>
            </div>
            <p className="text-3xl font-bold text-slate-900">12</p>
            <p className="text-sm text-emerald-600 flex items-center mt-2">
              <TrendingUp size={16} className="mr-1" /> +2 este mes
            </p>
          </div>

          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-slate-700">Tareas Pendientes</h3>
              <div className="w-10 h-10 rounded-lg bg-amber-50 flex items-center justify-center text-amber-600">
                <Clock size={20} />
              </div>
            </div>
            <p className="text-3xl font-bold text-slate-900">34</p>
            <p className="text-sm text-slate-500 mt-2">5 vencen hoy</p>
          </div>

          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-slate-700">Aprobaciones</h3>
              <div className="w-10 h-10 rounded-lg bg-emerald-50 flex items-center justify-center text-emerald-600">
                <CheckCircle2 size={20} />
              </div>
            </div>
            <p className="text-3xl font-bold text-slate-900">8</p>
            <p className="text-sm text-slate-500 mt-2">Requieren tu atención</p>
          </div>

          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-slate-700">Presupuesto Ejecutado</h3>
              <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600">
                <FileText size={20} />
              </div>
            </div>
            <p className="text-3xl font-bold text-slate-900">$45.2K</p>
            <p className="text-sm text-emerald-600 flex items-center mt-2">
              <TrendingUp size={16} className="mr-1" /> 68% del total
            </p>
          </div>
        </div>

        {/* Recent Activity & Alerts */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-6 border-b border-slate-200">
              <h3 className="font-bold text-slate-900">Proyectos Recientes</h3>
            </div>
            <div className="p-0">
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-slate-500 uppercase bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-6 py-3 font-medium">Proyecto</th>
                    <th className="px-6 py-3 font-medium">Estado</th>
                    <th className="px-6 py-3 font-medium">Progreso</th>
                    <th className="px-6 py-3 font-medium">Última act.</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  <tr className="hover:bg-slate-50">
                    <td className="px-6 py-4 font-medium text-slate-900">Implementación ERP</td>
                    <td className="px-6 py-4">
                      <span className="px-2.5 py-1 text-xs font-medium bg-emerald-100 text-emerald-800 rounded-full">En curso</span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="w-full bg-slate-200 rounded-full h-2">
                        <div className="bg-indigo-600 h-2 rounded-full" style={{ width: '45%' }}></div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-slate-500">Hace 2 horas</td>
                  </tr>
                  <tr className="hover:bg-slate-50">
                    <td className="px-6 py-4 font-medium text-slate-900">Migración Cloud</td>
                    <td className="px-6 py-4">
                      <span className="px-2.5 py-1 text-xs font-medium bg-amber-100 text-amber-800 rounded-full">En riesgo</span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="w-full bg-slate-200 rounded-full h-2">
                        <div className="bg-amber-500 h-2 rounded-full" style={{ width: '72%' }}></div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-slate-500">Ayer</td>
                  </tr>
                  <tr className="hover:bg-slate-50">
                    <td className="px-6 py-4 font-medium text-slate-900">Actualización App Móvil</td>
                    <td className="px-6 py-4">
                      <span className="px-2.5 py-1 text-xs font-medium bg-slate-100 text-slate-800 rounded-full">Planificación</span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="w-full bg-slate-200 rounded-full h-2">
                        <div className="bg-slate-400 h-2 rounded-full" style={{ width: '10%' }}></div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-slate-500">Hace 3 días</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-6 border-b border-slate-200">
              <h3 className="font-bold text-slate-900">Alertas</h3>
            </div>
            <div className="p-6 space-y-4">
              <div className="flex gap-3">
                <div className="mt-0.5 text-amber-500">
                  <AlertCircle size={18} />
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-900">Presupuesto excedido</p>
                  <p className="text-xs text-slate-500 mt-1">El proyecto &quot;Migración Cloud&quot; ha superado el presupuesto inicial en un 5%.</p>
                </div>
              </div>
              <div className="flex gap-3">
                <div className="mt-0.5 text-red-500">
                  <AlertCircle size={18} />
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-900">Tarea crítica atrasada</p>
                  <p className="text-xs text-slate-500 mt-1">La revisión de seguridad debía completarse ayer.</p>
                </div>
              </div>
              <div className="flex gap-3">
                <div className="mt-0.5 text-indigo-500">
                  <CheckCircle2 size={18} />
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-900">Aprobación pendiente</p>
                  <p className="text-xs text-slate-500 mt-1">Tienes 3 facturas pendientes de revisión.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
