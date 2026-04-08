"use client"

import React, { useMemo, useState } from 'react';
import Image from 'next/image';
import { Gantt, Task, ViewMode } from 'gantt-task-react';
import "gantt-task-react/dist/index.css";
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import { GripVertical, Trash2, RefreshCw, FileText, ListTodo, Users, Calendar, ChevronLeft, ChevronRight, AlertCircle, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

interface ProjectGanttProps {
  tasks: any[];
  teamMembers: any[];
  onUpdateTaskProgress: (taskId: string, progress: number, task: any) => void;
  onUpdateTaskValue: (taskId: string, value: number, task: any) => void;
  onUpdateTaskStatus: (taskId: string, status: string, task: any) => void;
  onDeleteTask: (taskId: string) => void;
  onSyncTask: (taskId: string, task: any) => void;
  onReorderTasks: (newTasks: any[]) => void;
  onUpdateTaskDates: (taskId: string, start: Date, end: Date, task: any) => void;
  onOpenTaskDocs?: (taskId: string, task: any) => void;
  onCreateTask?: () => void;
}

export const ProjectGantt: React.FC<ProjectGanttProps> = ({
  tasks,
  teamMembers,
  onUpdateTaskProgress,
  onUpdateTaskValue,
  onUpdateTaskStatus,
  onDeleteTask,
  onSyncTask,
  onReorderTasks,
  onUpdateTaskDates,
  onOpenTaskDocs,
  onCreateTask
}) => {
  const [viewMode, setViewMode] = useState<ViewMode>(ViewMode.Day);
  const [expandedParents, setExpandedParents] = useState<Record<string, boolean>>({});

  const toggleParent = (parentId: string) => {
    setExpandedParents(prev => ({
      ...prev,
      [parentId]: !prev[parentId]
    }));
  };

  // Sort tasks by displayOrder or createdAt
  const sortedTasks = useMemo(() => {
    return [...tasks].sort((a, b) => {
      if (a.displayOrder !== undefined && b.displayOrder !== undefined) {
        return a.displayOrder - b.displayOrder;
      }
      return (a.createdAt?.toMillis?.() || 0) - (b.createdAt?.toMillis?.() || 0);
    });
  }, [tasks]);

  const visibleTasks = useMemo(() => {
    const parentsAndNormal = sortedTasks.filter(t => !t.parentTaskId);
    const result: any[] = [];
    
    parentsAndNormal.forEach(task => {
      result.push(task);
      if (task.isParentTask && expandedParents[task.id]) {
        const subTasks = sortedTasks.filter(t => t.parentTaskId === task.id);
        // Sort subtasks by cycleNumber if available
        subTasks.sort((a, b) => (a.cycleNumber || 0) - (b.cycleNumber || 0));
        result.push(...subTasks);
      }
    });
    
    return result;
  }, [sortedTasks, expandedParents]);

  // Map Firestore tasks to gantt-task-react tasks
  const ganttTasks: Task[] = useMemo(() => {
    if (visibleTasks.length === 0) return [];
    
    return visibleTasks.map((t, index) => ({
      id: t.id,
      name: t.title,
      start: t.startDate?.toDate() || new Date(),
      end: t.endDate?.toDate() || new Date(),
      progress: t.progress || 0,
      type: t.isParentTask ? 'project' : 'task',
      project: t.parentTaskId || undefined,
      displayOrder: index + 1,
      styles: {
        backgroundColor: t.status === 'completed' ? '#00c875' : t.status === 'in_progress' ? '#fdab3d' : '#c4c4c4',
        backgroundSelectedColor: t.status === 'completed' ? '#00a35f' : t.status === 'in_progress' ? '#e69a35' : '#b0b0b0',
        progressColor: '#ffffff44',
        progressSelectedColor: '#ffffff66',
      }
    }));
  }, [visibleTasks]);

  const handleDragEnd = (result: DropResult) => {
    if (!result.destination) return;
    
    // We only allow dragging of top-level tasks (parents and normal)
    const parentsAndNormal = sortedTasks.filter(t => !t.parentTaskId);
    const draggedTask = visibleTasks[result.source.index];
    
    if (!draggedTask || draggedTask.parentTaskId) return;
    
    const sourceIndex = parentsAndNormal.findIndex(t => t.id === draggedTask.id);
    const destinationTask = visibleTasks[result.destination.index];
    
    let destIndex = parentsAndNormal.length;
    if (destinationTask) {
      destIndex = parentsAndNormal.findIndex(t => t.id === destinationTask.id);
      if (destIndex === -1) {
        // Dropped on a subtask, place it after the parent
        destIndex = parentsAndNormal.findIndex(t => t.id === destinationTask.parentTaskId) + 1;
      }
    }
    
    const [reorderedItem] = parentsAndNormal.splice(sourceIndex, 1);
    parentsAndNormal.splice(destIndex, 0, reorderedItem);
    
    // Create a map of updated display orders
    const orderMap = new Map<string, number>();
    parentsAndNormal.forEach((item, index) => {
      orderMap.set(item.id, index);
    });
    
    // Update displayOrder for all items, keeping subtasks intact
    const updatedItems = tasks.map(item => {
      if (orderMap.has(item.id)) {
        return { ...item, displayOrder: orderMap.get(item.id)! };
      }
      return item;
    });
    
    onReorderTasks(updatedItems);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'bg-[#00c875] text-white';
      case 'in_progress': return 'bg-[#fdab3d] text-white';
      case 'stuck': return 'bg-[#e2445c] text-white';
      case 'todo':
      case 'pending': return 'bg-[#c4c4c4] text-white';
      default: return 'bg-[#c4c4c4] text-white';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'completed': return 'LISTO';
      case 'in_progress': return 'TRABAJANDO';
      case 'stuck': return 'ESTANCADO';
      case 'todo':
      case 'pending': return 'PENDIENTE';
      default: return status?.toUpperCase();
    }
  };

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

  return (
    <div className="flex flex-col h-full bg-white rounded-lg overflow-hidden border border-slate-200 shadow-sm">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-slate-200 bg-white">
        <div className="flex items-center gap-2">
          {onCreateTask && (
            <Button onClick={onCreateTask} size="sm" className="bg-indigo-600 hover:bg-indigo-700 text-white h-8 px-3 mr-2">
              <Plus size={14} className="mr-1.5" />
              Nueva Tarea
            </Button>
          )}
          <div className="flex bg-slate-100 p-1 rounded-md">
            <button 
              onClick={() => setViewMode(ViewMode.Day)}
              className={`px-3 py-1 text-[11px] font-bold rounded transition-all ${viewMode === ViewMode.Day ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}
            >
              DÍA
            </button>
            <button 
              onClick={() => setViewMode(ViewMode.Week)}
              className={`px-3 py-1 text-[11px] font-bold rounded transition-all ${viewMode === ViewMode.Week ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}
            >
              SEMANA
            </button>
            <button 
              onClick={() => setViewMode(ViewMode.Month)}
              className={`px-3 py-1 text-[11px] font-bold rounded transition-all ${viewMode === ViewMode.Month ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}
            >
              MES
            </button>
          </div>
        </div>
        <div className="text-[11px] font-medium text-slate-400">
          {tasks.length} tareas en total
        </div>
      </div>

      <div className="flex border-b border-slate-200 bg-slate-50/30">
        {/* Left side: Task List (Monday Style) */}
        <div className="w-[600px] shrink-0 border-r border-slate-200 flex flex-col">
          <div className="h-10 flex items-center px-4 border-b border-slate-200 text-[10px] font-bold text-slate-400 uppercase tracking-widest bg-white">
            <div className="w-10"></div>
            <div className="flex-1">Tarea</div>
            <div className="w-24 px-2 text-center">Persona</div>
            <div className="w-28 px-2 text-center">Estado</div>
            <div className="w-24 px-2 text-center">Prioridad</div>
            <div className="w-32 px-2 text-center">Cronograma</div>
            <div className="w-28 px-2 text-center">Progreso / Valor</div>
          </div>
          
          <DragDropContext onDragEnd={handleDragEnd}>
            <Droppable droppableId="tasks">
              {(provided) => (
                <div 
                  {...provided.droppableProps} 
                  ref={provided.innerRef}
                  className="flex-1 overflow-y-auto max-h-[600px] scrollbar-thin scrollbar-thumb-slate-200"
                >
                  {visibleTasks.map((task, index) => {
                    const assignedMember = teamMembers.find(m => m.id === task.assignedTo);
                    const startDate = task.startDate?.toDate();
                    const endDate = task.endDate?.toDate();
                    const isQuantitative = task.type === 'quantitative';
                    const isParent = task.isParentTask;
                    const isSubTask = !!task.parentTaskId;
                    const isExpanded = expandedParents[task.id];
                    
                    return (
                      <Draggable key={task.id} draggableId={task.id} index={index} isDragDisabled={isSubTask}>
                        {(provided, snapshot) => (
                          <div
                            ref={provided.innerRef}
                            {...provided.draggableProps}
                            className={`flex items-center h-10 border-b border-slate-100 hover:bg-slate-50 transition-colors group relative ${snapshot.isDragging ? 'bg-white shadow-xl z-50 ring-1 ring-indigo-500/20' : ''} ${isSubTask ? 'bg-slate-50/50' : ''}`}
                          >
                            {/* Monday-style colored left bar */}
                            <div className={`absolute left-0 top-0 bottom-0 w-1.5 ${
                              task.status === 'completed' ? 'bg-[#00c875]' : 
                              task.status === 'in_progress' ? 'bg-[#fdab3d]' : 
                              task.status === 'stuck' ? 'bg-[#e2445c]' :
                              'bg-slate-300'
                            }`} />

                            <div {...provided.dragHandleProps} className={`w-10 flex justify-center text-slate-300 group-hover:text-slate-400 ${isSubTask ? 'invisible' : 'cursor-grab active:cursor-grabbing'}`}>
                              <GripVertical size={14} />
                            </div>
                            
                            <div className={`flex-1 min-w-0 px-2 flex items-center gap-2 ${isSubTask ? 'pl-6' : ''}`}>
                              {isParent && (
                                <button 
                                  onClick={() => toggleParent(task.id)}
                                  className="w-4 h-4 flex items-center justify-center rounded bg-slate-200 text-slate-600 hover:bg-slate-300"
                                >
                                  {isExpanded ? <ChevronLeft className="w-3 h-3 -rotate-90" /> : <ChevronRight className="w-3 h-3" />}
                                </button>
                              )}
                              <span className={`text-sm font-medium truncate ${task.status === 'completed' ? 'text-slate-400 line-through' : 'text-slate-700'}`}>
                                {task.externalWorkflowId ? `[${task.externalWorkflowId}] ` : ''}{task.title}
                              </span>
                              {task.isRateCardTask && (
                                <span className="px-1.5 py-0.5 bg-indigo-50 text-indigo-600 text-[8px] font-bold rounded uppercase tracking-tighter shrink-0 border border-indigo-100 shadow-sm">
                                  RC
                                </span>
                              )}
                              {task.type === 'workflow' && !isSubTask && (
                                <span className="px-1.5 py-0.5 bg-amber-50 text-amber-600 text-[8px] font-bold rounded uppercase tracking-tighter shrink-0 border border-amber-100 shadow-sm">
                                  WF
                                </span>
                              )}
                              {task.requiresDocument && !task.linkedDocumentId && (
                                <span title="Requiere documento">
                                  <AlertCircle size={12} className="text-amber-500 shrink-0" />
                                </span>
                              )}
                            </div>

                            <div className="w-24 px-2 flex justify-center">
                              {assignedMember ? (
                                <div className="flex items-center gap-1.5">
                                  <div className="w-7 h-7 rounded-full bg-indigo-50 border border-indigo-100 flex items-center justify-center overflow-hidden shadow-sm" title={assignedMember.name}>
                                    {assignedMember.photoURL ? (
                                      <Image 
                                        src={assignedMember.photoURL} 
                                        alt={assignedMember.name} 
                                        width={28}
                                        height={28}
                                        className="w-full h-full object-cover" 
                                        referrerPolicy="no-referrer"
                                      />
                                    ) : (
                                      <span className="text-[10px] font-bold text-indigo-600">{assignedMember.name.charAt(0).toUpperCase()}</span>
                                    )}
                                  </div>
                                  <span className="text-[10px] text-slate-500 hidden lg:block truncate max-w-[50px]">{assignedMember.name.split(' ')[0]}</span>
                                </div>
                              ) : (
                                <div className="w-7 h-7 rounded-full border border-dashed border-slate-300 flex items-center justify-center bg-slate-50/50">
                                  <Users size={12} className="text-slate-300" />
                                </div>
                              )}
                            </div>

                            <div className="w-28 h-full relative group/status">
                              <select
                                value={task.status}
                                onChange={(e) => onUpdateTaskStatus(task.id, e.target.value, task)}
                                className={`h-full w-full appearance-none flex items-center justify-center text-[10px] font-bold tracking-tight px-2 cursor-pointer text-center focus:outline-none transition-all hover:brightness-105 ${getStatusColor(task.status)}`}
                              >
                                <option value="todo" className="bg-white text-slate-700">PENDIENTE</option>
                                <option value="in_progress" className="bg-white text-slate-700">TRABAJANDO</option>
                                <option value="stuck" className="bg-white text-slate-700">ESTANCADO</option>
                                <option value="completed" className="bg-white text-slate-700">LISTO</option>
                              </select>
                              <div className="absolute inset-0 pointer-events-none opacity-0 group-hover/status:opacity-100 bg-black/5 transition-opacity" />
                            </div>

                            <div className="w-24 h-full relative group/priority">
                              <select
                                value={task.priority || 'medium'}
                                onChange={(e) => onUpdateTaskStatus(task.id, task.status, { ...task, priority: e.target.value })}
                                className={`h-full w-full appearance-none flex items-center justify-center text-[10px] font-bold tracking-tight px-2 cursor-pointer text-center focus:outline-none transition-all hover:brightness-105 ${
                                  task.priority === 'high' ? 'bg-[#e2445c] text-white' : 
                                  task.priority === 'medium' ? 'bg-[#5559df] text-white' : 
                                  'bg-[#c4c4c4] text-white'
                                }`}
                              >
                                <option value="high" className="bg-white text-slate-700">ALTA</option>
                                <option value="medium" className="bg-white text-slate-700">MEDIA</option>
                                <option value="low" className="bg-white text-slate-700">BAJA</option>
                              </select>
                              <div className="absolute inset-0 pointer-events-none opacity-0 group-hover/priority:opacity-100 bg-black/5 transition-opacity" />
                            </div>

                            <div className="w-32 px-2">
                              <div className={`rounded-md h-7 flex items-center justify-center relative overflow-hidden group/timeline cursor-pointer border ${
                                task.status === 'completed' ? 'bg-[#00c875]/10 border-[#00c875]/20' : 
                                task.status === 'in_progress' ? 'bg-[#fdab3d]/10 border-[#fdab3d]/20' : 
                                'bg-slate-50 border-slate-200'
                              }`}>
                                <div className={`text-[9px] font-bold z-10 flex items-center gap-1 ${
                                  task.status === 'completed' ? 'text-[#00c875]' : 
                                  task.status === 'in_progress' ? 'text-[#fdab3d]' : 
                                  'text-slate-500'
                                }`}>
                                  <Calendar size={10} />
                                  {startDate && endDate ? (
                                    `${format(startDate, 'd MMM', { locale: es })} - ${format(endDate, 'd MMM', { locale: es })}`
                                  ) : '-'}
                                </div>
                                <div className="absolute inset-0 bg-black/5 opacity-0 group-hover/timeline:opacity-100 transition-opacity" />
                              </div>
                            </div>

                            <div className="w-28 px-3 flex flex-col justify-center gap-1">
                              <div className="flex items-center justify-between text-[9px] font-bold">
                                <span className={task.progress === 100 ? 'text-[#00c875]' : 'text-slate-400'}>{task.progress || 0}%</span>
                                {isQuantitative && (
                                  <span className="text-[8px] text-indigo-500 bg-indigo-50 px-1 rounded">
                                    {task.currentValue || 0}/{task.indicatorValue} {task.indicator}
                                  </span>
                                )}
                                {task.type === 'workflow' && task.workflowSteps && (
                                  <span className="text-[8px] text-amber-600 bg-amber-50 px-1 rounded">
                                    Paso {task.currentStepIndex + 1}/{task.workflowSteps.length}
                                  </span>
                                )}
                              </div>
                              <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden shadow-inner">
                                <div 
                                  className={`h-full transition-all duration-700 ease-out ${
                                    task.status === 'completed' ? 'bg-[#00c875]' : 
                                    task.status === 'stuck' ? 'bg-[#e2445c]' :
                                    'bg-indigo-500'
                                  }`} 
                                  style={{ width: `${task.progress || 0}%` }}
                                />
                              </div>
                            </div>

                            <div className="absolute right-2 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
                              {isQuantitative && task.type !== 'workflow' && (
                                <button 
                                  onClick={() => {
                                    const val = prompt('Ingresar nuevo valor actual:', task.currentValue || 0);
                                    if (val !== null) onUpdateTaskValue(task.id, Number(val), task);
                                  }}
                                  className="p-1.5 text-indigo-400 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-colors"
                                  title="Actualizar Valor"
                                >
                                  <RefreshCw size={12} />
                                </button>
                              )}
                              {task.syncExternal && (
                                <button 
                                  onClick={() => onSyncTask(task.id, task)}
                                  className="p-1.5 text-indigo-400 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-colors"
                                  title="Sincronizar"
                                >
                                  <RefreshCw size={12} />
                                </button>
                              )}
                              {onOpenTaskDocs && (
                                <button 
                                  onClick={() => onOpenTaskDocs(task.id, task)}
                                  className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-colors"
                                  title="Documentación / Detalles"
                                >
                                  <FileText size={12} />
                                </button>
                              )}
                              <button 
                                onClick={() => onDeleteTask(task.id)}
                                className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
                                title="Eliminar"
                              >
                                <Trash2 size={12} />
                              </button>
                            </div>
                          </div>
                        )}
                      </Draggable>
                    );
                  })}
                  {provided.placeholder}
                </div>
              )}
            </Droppable>
          </DragDropContext>
        </div>

        {/* Right side: Gantt Chart */}
        <div className="flex-1 overflow-hidden bg-white">
          <div className="h-full overflow-x-auto scrollbar-thin scrollbar-thumb-slate-200">
            <Gantt
              tasks={ganttTasks}
              viewMode={viewMode}
              listCellWidth="0"
              columnWidth={viewMode === ViewMode.Day ? 65 : viewMode === ViewMode.Week ? 150 : 250}
              headerHeight={40}
              rowHeight={40}
              barCornerRadius={4}
              barFill={70}
              handleWidth={8}
              fontSize="11px"
              fontFamily="Inter, sans-serif"
              todayColor="rgba(99, 102, 241, 0.03)"
              onProgressChange={(task) => {
                const originalTask = tasks.find(t => t.id === task.id);
                onUpdateTaskProgress(task.id, task.progress, originalTask);
              }}
              onDateChange={(task) => {
                const originalTask = tasks.find(t => t.id === task.id);
                onUpdateTaskDates(task.id, task.start, task.end, originalTask);
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

