"use client"

import React from 'react';
import Link from 'next/link';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import WorkflowTray from '@/components/dashboard/WorkflowTray';
import { Inbox, ChevronLeft } from 'lucide-react';

export default function WorkflowsPage() {
  return (
    <DashboardLayout>
      <div className="p-6 max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2 mb-2">
              <Link href="/dashboard" className="text-xs font-medium text-slate-500 hover:text-indigo-600 transition-colors flex items-center gap-1">
                <ChevronLeft size={12} />
                Regresar al Dashboard
              </Link>
            </div>
            <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
              <Inbox className="text-indigo-600" size={24} />
              Bandeja de Workflows
            </h1>
            <p className="text-slate-500">Gestiona tus tareas pendientes de aprobación y seguimiento.</p>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <WorkflowTray />
        </div>
      </div>
    </DashboardLayout>
  );
}
