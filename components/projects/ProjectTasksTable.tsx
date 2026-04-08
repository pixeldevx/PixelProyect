"use client"

import React, { useState, useEffect } from 'react';
import { Trash2, FileText, ListTodo, Plus, Calendar, AlertCircle, ChevronDown, ChevronRight, MoreHorizontal, CornerDownRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { motion, AnimatePresence } from 'motion/react';

interface ProjectTasksTableProps {
  tasks: any[];
  teamMembers: any[];
  onUpdateTaskProgress: (taskId: string, progress: number, task: any) => void;
  onUpdateTaskStatus: (taskId: string, status: string, task: any) => void;
  onUpdateTaskPriority?: (taskId: string, priority: string, task: any) => void;
  onUpdateTaskAssignee?: (taskId: string, assigneeId: string, task: any) => void;
  onDeleteTask: (taskId: string) => void;
  onOpenTaskDocs?: (taskId: string, task: any) => void;
  onCreateTask?: () => void;
}

export const ProjectTasksTable: React.FC<ProjectTasksTableProps> = ({
  tasks,
  teamMembers,
  onUpdateTaskProgress,
  onUpdateTaskStatus,
  onUpdateTaskPriority,
  onUpdateTaskAssignee,
  onDeleteTask,
  onOpenTaskDocs,
  onCreateTask
}) => {
  const [expandedTasks, setExpandedTasks] = useState<Record<string, boolean>>({});

  const toggleExpand = (taskId: string) => {
    setExpandedTasks(prev => ({
      ...prev,
      [taskId]: prev[taskId] === undefined ? false : !prev[taskId]
    }));
  };

  const getStatusSolidColor = (status: string) => {
    switch (status) {
      case 'completed': return 'bg-emerald-500 text-white';
      case 'in_progress': return 'bg-amber-500 text-white';
      case 'stuck': return 'bg-red-500 text-white';
      case 'todo':
      case 'pending': return 'bg-slate-400 text-white';
      default: return 'bg-slate-400 text-white';
    }
  };

  const getStatusBorderColor = (status: string) => {
    switch (status) {
      case 'completed': return 'border-l-emerald-500';
      case 'in_progress': return 'border-l-amber-500';
      case 'stuck': return 'border-l-red-500';
      case 'todo':
      case 'pending': return 'border-l-slate-400';
      default: return 'border-l-slate-400';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'completed': return 'Listo';
      case 'in_progress': return 'En curso';
      case 'stuck': return 'Detenido';
      case 'todo':
      case 'pending': return 'Pendiente';
      default: return status;
    }
  };

  const rootTasks = tasks.filter(t => !t.parentTaskId).sort((a, b) => (a.displayOrder || 0) - (b.displayOrder || 0));

  if (tasks.length === 0) {
    return (
      <div className="text-center py-12 px-4 bg-white rounded-lg border border-slate-200">
        <ListTodo className="w-12 h-12 text-slate-200 mx-auto mb-3" />
        <h3 className="text-base font-medium text-slate-900">No hay tareas</h3>
        <p className="text-sm text-slate-500 mt-1 mb-4">Crea tareas para empezar a medir el progreso.</p>
        {onCreateTask && (
          <Button onClick={onCreateTask} className="bg-indigo-600 hover:bg-indigo-700 text-white">
            <Plus size={16} className="mr-2" />
            Crear Primera Tarea
          </Button>
        )}
      </div>
    );
  }

  const renderTaskRow = (task: any, depth: number = 0, isLastChild: boolean = false) => {
    const assignee = teamMembers.find(m => m.id === task.assignedTo);
    
    let endDate = new Date();
    if (task.end) {
      endDate = task.end.toDate ? task.end.toDate() : new Date(task.end);
    }

    const subtasks = tasks.filter(t => t.parentTaskId === task.id).sort((a, b) => (a.displayOrder || 0) - (b.displayOrder || 0));
    const hasSubtasks = subtasks.length > 0;
    const isExpanded = expandedTasks[task.id] !== false;

    return (
      <React.Fragment key={task.id}>
        <motion.tr 
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.2 }}
          className={`border-b border-slate-200 hover:bg-slate-50 transition-colors group ${depth > 0 ? 'bg-slate-50/30' : 'bg-white'}`}
        >
          <td className={`px-4 py-2 ${depth === 0 ? `border-l-8 ${getStatusBorderColor(task.status || 'todo')}` : 'border-l-8 border-transparent'} relative`}>
            <div className="flex items-center gap-2" style={{ paddingLeft: `${depth * 1.5}rem` }}>
              {depth > 0 && (
                <div className="absolute flex items-center justify-center text-slate-300" style={{ left: `${(depth - 1) * 1.5 + 1.5}rem` }}>
                  <CornerDownRight size={16} strokeWidth={2.5} />
                </div>
              )}
              
              {hasSubtasks ? (
                <button 
                  onClick={() => toggleExpand(task.id)}
                  className="w-5 h-5 flex items-center justify-center text-slate-400 hover:bg-slate-200 rounded transition-colors z-10"
                >
                  {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </button>
              ) : (
                <div className="w-5 h-5 flex items-center justify-center text-slate-300 z-10">
                  {depth === 0 && <div className="w-1.5 h-1.5 rounded-full bg-slate-300"></div>}
                </div>
              )}
              <div className="font-medium text-slate-800">{task.title}</div>
            </div>
          </td>
          
          <td className="px-2 py-2 text-center border-l border-slate-200 w-16 relative">
            <div className="flex justify-center">
              {assignee ? (
                <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-sm font-bold shadow-sm" title={assignee.name}>
                  {assignee.name.charAt(0).toUpperCase()}
                </div>
              ) : (
                <div className="w-8 h-8 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center text-sm border border-dashed border-slate-300 hover:bg-slate-200 transition-colors" title="Sin asignar">
                  <Plus size={14} />
                </div>
              )}
            </div>
            {onUpdateTaskAssignee && (
              <select 
                value={task.assignedTo || ''}
                onChange={(e) => onUpdateTaskAssignee(task.id, e.target.value, task)}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              >
                <option value="">Sin asignar</option>
                {teamMembers.map(m => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
            )}
          </td>

          <td className="p-0 border-l border-white w-32 relative">
            <div className={`absolute inset-0 flex items-center justify-center ${getStatusSolidColor(task.status || 'todo')} transition-colors`}>
              <span className="font-medium text-sm text-white">{getStatusLabel(task.status || 'todo')}</span>
            </div>
            <select
              value={task.status || 'todo'}
              onChange={(e) => onUpdateTaskStatus(task.id, e.target.value, task)}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            >
              <option value="todo">Pendiente</option>
              <option value="in_progress">En curso</option>
              <option value="stuck">Detenido</option>
              <option value="completed">Listo</option>
            </select>
          </td>

          <td className="px-4 py-2 border-l border-slate-200 w-48">
            <div className="flex items-center gap-2">
              <div className="flex-1 h-5 bg-slate-200 rounded-full overflow-hidden relative">
                <div 
                  className={`h-full rounded-full transition-all duration-500 ${task.progress === 100 ? 'bg-emerald-500' : 'bg-blue-500'}`}
                  style={{ width: `${task.progress || 0}%` }}
                />
              </div>
              <span className="text-xs font-medium text-slate-500 w-8 text-right">
                {task.progress || 0}%
              </span>
            </div>
          </td>

          <td className="px-4 py-2 text-center border-l border-slate-200 w-28 text-sm text-slate-700">
            {format(endDate, 'MMM. d', { locale: es })}
          </td>

          <td className="px-4 py-2 text-center border-l border-slate-200 w-32 relative">
            <div className="flex items-center justify-center gap-0.5">
              {[1, 2, 3, 4, 5].map(star => {
                let activeStars = 3;
                if (task.priority === 'high') activeStars = 5;
                if (task.priority === 'low') activeStars = 1;
                
                return (
                  <span key={star} className={`text-lg leading-none ${star <= activeStars ? 'text-amber-400' : 'text-slate-200'}`}>
                    ★
                  </span>
                );
              })}
            </div>
            {onUpdateTaskPriority && (
              <select
                value={task.priority || 'medium'}
                onChange={(e) => onUpdateTaskPriority(task.id, e.target.value, task)}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              >
                <option value="high">Alta</option>
                <option value="medium">Media</option>
                <option value="low">Baja</option>
              </select>
            )}
          </td>

          <td className="px-2 py-2 text-center border-l border-slate-200 w-16">
            <div className="flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              {onOpenTaskDocs && (
                <button
                  onClick={() => onOpenTaskDocs(task.id, task)}
                  className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-colors"
                  title="Documentos"
                >
                  <FileText size={16} />
                </button>
              )}
              <button
                onClick={() => onDeleteTask(task.id)}
                className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                title="Eliminar"
              >
                <Trash2 size={16} />
              </button>
            </div>
          </td>
        </motion.tr>
        <AnimatePresence>
          {isExpanded && subtasks.map((subtask, index) => renderTaskRow(subtask, depth + 1, index === subtasks.length - 1))}
        </AnimatePresence>
      </React.Fragment>
    );
  };

  return (
    <div className="flex flex-col h-full bg-white rounded-lg overflow-hidden border border-slate-200 shadow-sm">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 bg-white">
        <div className="flex items-center gap-2">
          {onCreateTask && (
            <Button onClick={onCreateTask} size="sm" className="bg-indigo-600 hover:bg-indigo-700 text-white h-8 px-3 mr-2 rounded-md">
              <Plus size={14} className="mr-1.5" />
              Nueva Tarea
            </Button>
          )}
        </div>
        <div className="text-[12px] font-medium text-slate-500">
          {tasks.length} tareas en total
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left border-collapse">
          <thead className="text-xs text-slate-500 bg-white border-b-2 border-slate-200">
            <tr>
              <th className="px-4 py-3 font-normal">Tarea</th>
              <th className="px-2 py-3 font-normal text-center">Resp.</th>
              <th className="px-0 py-3 font-normal text-center">Estado</th>
              <th className="px-4 py-3 font-normal text-center">Cronograma</th>
              <th className="px-4 py-3 font-normal text-center">Vence</th>
              <th className="px-4 py-3 font-normal text-center">Prioridad</th>
              <th className="px-2 py-3 font-normal text-center"></th>
            </tr>
          </thead>
          <tbody>
            <AnimatePresence>
              {rootTasks.map((task, index) => renderTaskRow(task, 0, index === rootTasks.length - 1))}
            </AnimatePresence>
          </tbody>
        </table>
      </div>
    </div>
  );
};
