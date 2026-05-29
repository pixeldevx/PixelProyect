"use client"

import React, { useMemo, useState } from 'react';
import Image from 'next/image';
import { Gantt, Task, ViewMode } from 'gantt-task-react';
import "gantt-task-react/dist/index.css";
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import { GripVertical, Trash2, RefreshCw, FileText, ListTodo, Users, Calendar, ChevronLeft, ChevronRight, AlertCircle, Plus, PanelRightClose, PanelRightOpen, Settings, CornerDownRight, MessageSquare, MoreHorizontal, RotateCcw, ClipboardList, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { TaskDateEditorModal } from './TaskDateEditorModal';

type ScheduleFilter = 'overdue' | 'due_soon' | 'completed_late' | null;

type TaskGroup = {
  id: string;
  name: string;
  color?: string;
  order?: number;
};

type VisibleTaskRow =
  | { type: 'group'; id: string; group: TaskGroup; taskCount: number; tasks: any[] }
  | { type: 'task'; id: string; task: any };

interface ProjectGanttProps {
  tasks: any[];
  teamMembers: any[];
  assigneeOptions?: any[];
  taskGroups?: TaskGroup[];
  onUpdateTaskProgress?: (taskId: string, progress: number, task: any) => void;
  onUpdateTaskValue?: (taskId: string, value: number, task: any) => void;
  onUpdateTaskStatus?: (taskId: string, status: string, task: any) => void;
  onUpdateTaskPriority?: (taskId: string, priority: string, task: any) => void;
  onUpdateTaskAssignee?: (taskId: string, assigneeId: string, task: any) => void;
  onUpdateTaskGroup?: (taskId: string, groupId: string, task: any) => void | Promise<void>;
  onDeleteTask?: (taskId: string) => void;
  onSyncTask?: (taskId: string, task: any) => void;
  onReorderTasks?: (newTasks: any[]) => void;
  onUpdateTaskDates?: (taskId: string, start: Date, end: Date, task: any) => void;
  onUpdateTaskTitle?: (taskId: string, title: string, task: any) => void | Promise<void>;
  onCreateTaskGroup?: (name: string, color: string) => void | Promise<void>;
  onUpdateTaskGroupDefinition?: (groupId: string, updates: Partial<TaskGroup>) => void | Promise<void>;
  onDeleteTaskGroup?: (groupId: string) => void | Promise<void>;
  onOpenIncrementTask?: (task: any) => void;
  canEditTaskDetails?: boolean;
  canEditTaskDates?: boolean;
  canEditTaskStatus?: boolean;
  canAddSubtasks?: boolean;
  canEditTaskStructure?: boolean;
  canDeleteTasks?: boolean;
  onEditTaskStructure?: (task: any) => void;
  onAddSubtask?: (task: any) => void;
  onOpenTaskDocs?: (taskId: string, task: any) => void;
  onOpenTaskComments?: (task: any) => void;
  onResetWorkflowTask?: (task: any) => void | Promise<void>;
  onCreateBulkWorkflowIterations?: (task: any) => void;
  onCreateTask?: () => void;
}

const UNGROUPED_GROUP_ID = '__ungrouped__';
const DEFAULT_UNGROUPED_GROUP: TaskGroup = {
  id: UNGROUPED_GROUP_ID,
  name: 'Sin grupo',
  color: '#94a3b8',
  order: -1,
};
const TASK_GROUP_COLORS = ['#579bfc', '#00c875', '#fdab3d', '#e2445c', '#a25ddc', '#00a9ff', '#ffcb00', '#784bd1'];

const getTaskTitle = (task: any) => {
  return task?.title || task?.name || 'Sin título';
};

const getTaskDisplayTitle = (task: any) => {
  const title = getTaskTitle(task);
  if (!task?.externalWorkflowId || title === task.externalWorkflowId) {
    return title;
  }
  return `[${task.externalWorkflowId}] ${title}`;
};

const getTaskDate = (value: any) => {
  if (!value) return null;
  if (value.toDate) return value.toDate();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const getTaskPriority = (task: any) => {
  return task?.priority || task?.originalTask?.priority || 'medium';
};

const getTaskCommentCount = (task: any) => {
  return Number(task?.commentCount || task?.originalTask?.commentCount || 0);
};

const getTaskGroupId = (task: any) => task?.groupId || UNGROUPED_GROUP_ID;

const getTaskGroupColor = (group?: TaskGroup) => group?.color || '#579bfc';

const getTaskTime = (value: any) => {
  const date = getTaskDate(value);
  return date ? date.getTime() : null;
};

const getGroupDateRange = (tasks: any[]) => {
  const starts = tasks
    .map((task) => getTaskTime(task.startDate || task.start))
    .filter((value): value is number => value !== null);
  const ends = tasks
    .map((task) => getTaskTime(task.endDate || task.end))
    .filter((value): value is number => value !== null);
  const fallback = new Date();

  return {
    start: starts.length ? new Date(Math.min(...starts)) : fallback,
    end: ends.length ? new Date(Math.max(...ends)) : fallback,
  };
};

const getGroupProgress = (tasks: any[]) => {
  if (tasks.length === 0) return 0;
  const total = tasks.reduce((sum, task) => sum + Number(task.progress || 0), 0);
  return Math.round(total / tasks.length);
};

const getPriorityColor = (priority: string) => {
  switch (priority) {
    case 'high':
      return 'bg-[#e2445c] text-white';
    case 'medium':
      return 'bg-[#5559df] text-white';
    case 'low':
      return 'bg-[#c4c4c4] text-white';
    default:
      return 'bg-[#5559df] text-white';
  }
};

const getTaskScheduleState = (task: any) => {
  const status = task?.status || 'todo';
  if (status === 'completed_late') return 'completed_late';
  if (status === 'completed' || status === 'listo') return 'completed';

  const endDate = getTaskDate(task?.endDate || task?.end);
  if (!endDate) return 'none';

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const endOfDay = new Date(endDate);
  endOfDay.setHours(23, 59, 59, 999);

  if (endOfDay.getTime() < today.getTime()) return 'overdue';

  const msUntilDue = endOfDay.getTime() - Date.now();
  return msUntilDue <= 2 * 24 * 60 * 60 * 1000 ? 'due_soon' : 'ok';
};

const getScheduleRailColor = (task: any) => {
  const scheduleState = getTaskScheduleState(task);
  if (scheduleState === 'overdue') return 'bg-red-600';
  if (scheduleState === 'due_soon') return 'bg-orange-500';
  if (scheduleState === 'completed_late') return 'bg-orange-600';
  if (scheduleState === 'completed') return 'bg-[#00c875]';
  if (task.status === 'in_progress') return 'bg-[#fdab3d]';
  if (task.status === 'stuck') return 'bg-[#e2445c]';
  return 'bg-slate-300';
};

const getScheduleDateClass = (task: any) => {
  const scheduleState = getTaskScheduleState(task);
  if (scheduleState === 'overdue') return 'bg-red-50 border-red-200 text-red-700';
  if (scheduleState === 'due_soon') return 'bg-orange-50 border-orange-200 text-orange-700';
  if (scheduleState === 'completed_late') return 'bg-orange-50 border-orange-200 text-orange-700';
  if (scheduleState === 'completed') return 'bg-[#00c875]/10 border-[#00c875]/20 text-[#00a35f]';
  if (task.status === 'in_progress') return 'bg-[#fdab3d]/10 border-[#fdab3d]/20 text-[#d97706]';
  return 'bg-slate-50 border-slate-200 text-slate-500';
};

const getScheduleBarColors = (task: any) => {
  const scheduleState = getTaskScheduleState(task);
  if (scheduleState === 'overdue') return { backgroundColor: '#dc2626', backgroundSelectedColor: '#b91c1c' };
  if (scheduleState === 'due_soon') return { backgroundColor: '#f97316', backgroundSelectedColor: '#ea580c' };
  if (scheduleState === 'completed_late') return { backgroundColor: '#f97316', backgroundSelectedColor: '#ea580c' };
  if (scheduleState === 'completed') return { backgroundColor: '#00c875', backgroundSelectedColor: '#00a35f' };
  if (task.status === 'in_progress') return { backgroundColor: '#fdab3d', backgroundSelectedColor: '#e69a35' };
  if (task.status === 'stuck') return { backgroundColor: '#e2445c', backgroundSelectedColor: '#c8374d' };
  return { backgroundColor: '#c4c4c4', backgroundSelectedColor: '#b0b0b0' };
};

const sortChildTasks = (childTasks: any[]) => {
  return [...childTasks].sort((a, b) => {
    const aOrder = a.cycleNumber ?? a.displayOrder ?? 0;
    const bOrder = b.cycleNumber ?? b.displayOrder ?? 0;
    if (aOrder !== bOrder) return aOrder - bOrder;
    return (a.createdAt?.toMillis?.() || 0) - (b.createdAt?.toMillis?.() || 0);
  });
};

export const ProjectGantt: React.FC<ProjectGanttProps> = ({
  tasks,
  teamMembers,
  assigneeOptions,
  taskGroups = [],
  onUpdateTaskProgress,
  onUpdateTaskValue,
  onUpdateTaskStatus,
  onUpdateTaskPriority,
  onUpdateTaskAssignee,
  onUpdateTaskGroup,
  onDeleteTask,
  onSyncTask,
  onReorderTasks,
  onUpdateTaskDates,
  onUpdateTaskTitle,
  onCreateTaskGroup,
  onUpdateTaskGroupDefinition,
  onDeleteTaskGroup,
  onOpenIncrementTask,
  canEditTaskDetails,
  canEditTaskDates,
  canEditTaskStatus,
  canAddSubtasks,
  canEditTaskStructure,
  canDeleteTasks,
  onEditTaskStructure,
  onAddSubtask,
  onOpenTaskDocs,
  onOpenTaskComments,
  onResetWorkflowTask,
  onCreateBulkWorkflowIterations,
  onCreateTask
}) => {
  const [viewMode, setViewMode] = useState<ViewMode>(ViewMode.Day);
  const [expandedParents, setExpandedParents] = useState<Record<string, boolean>>({});
  const [isTimelineCollapsed, setIsTimelineCollapsed] = useState(false);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editingTaskTitle, setEditingTaskTitle] = useState("");
  const [openActionMenuTaskId, setOpenActionMenuTaskId] = useState<string | null>(null);
  const [taskForDateEdit, setTaskForDateEdit] = useState<any>(null);
  const [scheduleFilter, setScheduleFilter] = useState<ScheduleFilter>(null);
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const [isGroupManagerOpen, setIsGroupManagerOpen] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupColor, setNewGroupColor] = useState(TASK_GROUP_COLORS[0]);
  const taskAssigneeOptions = assigneeOptions || teamMembers;
  const canModifyTaskDetails = Boolean(canEditTaskDetails);
  const canModifyTaskDates = Boolean(canEditTaskDates && onUpdateTaskDates);
  const canChangeTaskStatus = Boolean(canEditTaskStatus && onUpdateTaskStatus);
  const canChangeTaskAssignee = Boolean(canModifyTaskDetails && onUpdateTaskAssignee);
  const canCreateSubtasks = Boolean(canAddSubtasks && onAddSubtask);
  const canRemoveTasks = Boolean(canDeleteTasks && onDeleteTask);
  const canManageTaskGroups = Boolean(canModifyTaskDetails && (onCreateTaskGroup || onUpdateTaskGroup || onUpdateTaskGroupDefinition || onDeleteTaskGroup));
  const sortedTaskGroups = useMemo(() => {
    const validGroups = [...taskGroups].filter((group) => group?.id && group?.name);
    const configuredDefaultGroup = validGroups.find((group) => group.id === UNGROUPED_GROUP_ID);
    const defaultGroup = {
      ...DEFAULT_UNGROUPED_GROUP,
      ...configuredDefaultGroup,
      id: UNGROUPED_GROUP_ID,
      name: configuredDefaultGroup?.name?.trim() || DEFAULT_UNGROUPED_GROUP.name,
      color: configuredDefaultGroup?.color || DEFAULT_UNGROUPED_GROUP.color,
      order: configuredDefaultGroup?.order ?? DEFAULT_UNGROUPED_GROUP.order,
    };

    const customGroups = validGroups
      .filter((group) => group.id !== UNGROUPED_GROUP_ID)
      .sort((left, right) => {
        const leftOrder = left.order ?? 0;
        const rightOrder = right.order ?? 0;
        if (leftOrder !== rightOrder) return leftOrder - rightOrder;
        return left.name.localeCompare(right.name);
      });

    return [defaultGroup, ...customGroups];
  }, [taskGroups]);
  const defaultTaskGroup = sortedTaskGroups[0] || DEFAULT_UNGROUPED_GROUP;
  const assignableTaskGroups = sortedTaskGroups.filter((group) => group.id !== UNGROUPED_GROUP_ID);

  const toggleParent = (parentId: string) => {
    setExpandedParents(prev => ({
      ...prev,
      [parentId]: !prev[parentId]
    }));
  };

  const toggleGroup = (groupId: string) => {
    setCollapsedGroups((current) => ({
      ...current,
      [groupId]: !current[groupId],
    }));
  };

  const handleCreateGroup = async () => {
    const cleanName = newGroupName.trim().replace(/\s+/g, ' ');
    if (!cleanName || !onCreateTaskGroup) return;

    await onCreateTaskGroup(cleanName, newGroupColor);
    setNewGroupName("");
    setNewGroupColor(TASK_GROUP_COLORS[0]);
  };

  const startEditingTitle = (task: any) => {
    if (!canModifyTaskDetails || !onUpdateTaskTitle || task.isWorkflowStep) return;
    setEditingTaskId(task.id);
    setEditingTaskTitle(getTaskTitle(task));
  };

  const finishEditingTitle = async (task: any) => {
    if (!editingTaskId) return;

    const nextTitle = editingTaskTitle.trim();
    const currentTitle = getTaskTitle(task);
    setEditingTaskId(null);

    if (!nextTitle || nextTitle === currentTitle || !onUpdateTaskTitle) {
      setEditingTaskTitle("");
      return;
    }

    await onUpdateTaskTitle(task.id, nextTitle, task);
    setEditingTaskTitle("");
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

  const scheduleStats = useMemo(() => {
    const realTasks = sortedTasks.filter((task) => !task.isWorkflowStep);
    return {
      overdue: realTasks.filter((task) => getTaskScheduleState(task) === 'overdue').length,
      dueSoon: realTasks.filter((task) => getTaskScheduleState(task) === 'due_soon').length,
      completedLate: realTasks.filter((task) => getTaskScheduleState(task) === 'completed_late').length,
    };
  }, [sortedTasks]);

  const filteredSortedTasks = useMemo(() => {
    if (!scheduleFilter) return sortedTasks;
    return sortedTasks.filter((task) => getTaskScheduleState(task) === scheduleFilter);
  }, [scheduleFilter, sortedTasks]);

  const shouldShowTaskGroups = sortedTaskGroups.length > 0 || sortedTasks.some((task) => task.groupId);

  const visibleRows = useMemo<VisibleTaskRow[]>(() => {
    const sourceTasks = scheduleFilter ? filteredSortedTasks : sortedTasks;
    const rows: VisibleTaskRow[] = [];

    const appendTaskTree = (task: any) => {
      rows.push({ type: 'task', id: task.id, task });
      const subTasks = sortChildTasks(sourceTasks.filter(t => t.parentTaskId === task.id));
      if (subTasks.length > 0 && expandedParents[task.id]) {
        subTasks.forEach(subTask => {
          rows.push({ type: 'task', id: subTask.id, task: subTask });
          // Generate visual sub-tasks for workflow steps
          if (subTask.type === 'workflow' && subTask.workflowSteps && expandedParents[subTask.id]) {
            subTask.workflowSteps.forEach((step: any, idx: number) => {
              rows.push({ type: 'task', id: `${subTask.id}-step-${idx}`, task: {
                id: `${subTask.id}-step-${idx}`,
                title: `Paso ${idx + 1}: ${step.label}`,
                name: `Paso ${idx + 1}: ${step.label}`,
                parentTaskId: subTask.id,
                isWorkflowStep: true,
                stepIndex: idx,
                status: step.status || 'not_started',
                priority: getTaskPriority(subTask),
                assignedTo: step.assignedTo,
                startDate: subTask.startDate,
                endDate: subTask.endDate,
                progress: step.status === 'listo' ? 100 : (step.status === 'en_curso' || step.status === 'reproceso' ? 50 : 0),
                type: 'workflow_step',
                originalTask: subTask
              }});
            });
          }
        });
      } else if (task.type === 'workflow' && task.workflowSteps && expandedParents[task.id]) {
        // Generate visual sub-tasks for workflow steps (no cycles)
        task.workflowSteps.forEach((step: any, idx: number) => {
          rows.push({ type: 'task', id: `${task.id}-step-${idx}`, task: {
            id: `${task.id}-step-${idx}`,
            title: `Paso ${idx + 1}: ${step.label}`,
            name: `Paso ${idx + 1}: ${step.label}`,
            parentTaskId: task.id,
            isWorkflowStep: true,
            stepIndex: idx,
            status: step.status || 'not_started',
            priority: getTaskPriority(task),
            assignedTo: step.assignedTo,
            startDate: task.startDate,
            endDate: task.endDate,
            progress: step.status === 'listo' ? 100 : (step.status === 'en_curso' || step.status === 'reproceso' ? 50 : 0),
            type: 'workflow_step',
            originalTask: task
          }});
        });
      }
    };

    if (!shouldShowTaskGroups) {
      const parentsAndNormal = scheduleFilter ? sourceTasks : sourceTasks.filter(t => !t.parentTaskId);
      parentsAndNormal.forEach(appendTaskTree);
      return rows;
    }

    const topLevelTasks = scheduleFilter ? sourceTasks : sourceTasks.filter(t => !t.parentTaskId);
    const knownGroupIds = new Set(sortedTaskGroups.map((group) => group.id));
    const groupedTasks = sortedTaskGroups.map((group) => ({
      group,
      tasks: topLevelTasks.filter((task) => {
        const groupId = getTaskGroupId(task);
        if (group.id === UNGROUPED_GROUP_ID) {
          return groupId === UNGROUPED_GROUP_ID || !knownGroupIds.has(groupId);
        }
        return groupId === group.id;
      }),
    }));

    groupedTasks.forEach(({ group, tasks: groupTasks }) => {
      rows.push({
        type: 'group',
        id: `group-${group.id}`,
        group,
        taskCount: groupTasks.length,
        tasks: groupTasks,
      });

      if (!collapsedGroups[group.id]) {
        groupTasks.forEach(appendTaskTree);
      }
    });

    return rows;
  }, [collapsedGroups, expandedParents, filteredSortedTasks, scheduleFilter, shouldShowTaskGroups, sortedTaskGroups, sortedTasks]);

  const visibleTasks = useMemo(
    () => visibleRows.filter((row): row is Extract<VisibleTaskRow, { type: 'task' }> => row.type === 'task').map((row) => row.task),
    [visibleRows]
  );

  // Map Supabase tasks to gantt-task-react tasks
  const ganttTasks: Task[] = useMemo(() => {
    if (visibleRows.length === 0) return [];
    const visibleTaskIds = new Set(visibleTasks.map((task) => task.id));

    return visibleRows.map((row, index) => {
      if (row.type === 'group') {
        const range = getGroupDateRange(row.tasks);
        const groupColor = getTaskGroupColor(row.group);

        return {
          id: row.id,
          name: row.group.name,
          start: range.start,
          end: range.end,
          progress: getGroupProgress(row.tasks),
          type: 'project',
          displayOrder: index + 1,
          styles: {
            backgroundColor: `${groupColor}55`,
            backgroundSelectedColor: `${groupColor}88`,
            progressColor: groupColor,
            progressSelectedColor: groupColor,
          }
        };
      }

      const t = row.task;
      const hasChildren = visibleTasks.some(task => task.parentTaskId === t.id);
      const barColors = getScheduleBarColors(t);

      return {
        id: t.id,
        name: getTaskTitle(t),
        start: getTaskDate(t.startDate) || new Date(),
        end: getTaskDate(t.endDate) || new Date(),
        progress: t.progress || 0,
        type: t.isParentTask || hasChildren ? 'project' : 'task',
        project: t.parentTaskId && visibleTaskIds.has(t.parentTaskId) ? t.parentTaskId : undefined,
        displayOrder: index + 1,
        styles: {
          backgroundColor: barColors.backgroundColor,
          backgroundSelectedColor: barColors.backgroundSelectedColor,
          progressColor: '#ffffff44',
          progressSelectedColor: '#ffffff66',
        }
      };
    });
  }, [visibleRows, visibleTasks]);

  const handleDragEnd = (result: DropResult) => {
    if (!canModifyTaskDetails || !onReorderTasks) return;
    if (scheduleFilter) return;
    if (!result.destination) return;

    const sourceRow = visibleRows[result.source.index];
    const destinationRow = visibleRows[result.destination.index];
    if (!sourceRow || sourceRow.type !== 'task') return;

    // We only allow dragging of top-level tasks (parents and normal)
    const parentsAndNormal = sortedTasks.filter(t => !t.parentTaskId);
    const draggedTask = sourceRow.task;

    if (!draggedTask || draggedTask.parentTaskId) return;

    const sourceIndex = parentsAndNormal.findIndex(t => t.id === draggedTask.id);
    if (sourceIndex === -1) return;

    let destIndex = parentsAndNormal.length;
    let nextGroupId = draggedTask.groupId || '';
    if (destinationRow?.type === 'group') {
      nextGroupId = destinationRow.group.id === UNGROUPED_GROUP_ID ? '' : destinationRow.group.id;
      const firstTaskInGroupIndex = parentsAndNormal.findIndex((task) => getTaskGroupId(task) === (nextGroupId || UNGROUPED_GROUP_ID));
      destIndex = firstTaskInGroupIndex === -1 ? parentsAndNormal.length : firstTaskInGroupIndex;
    } else if (destinationRow?.type === 'task') {
      const destinationTask = destinationRow.task.parentTaskId
        ? parentsAndNormal.find((task) => task.id === destinationRow.task.parentTaskId)
        : destinationRow.task;
      nextGroupId = destinationTask?.groupId || '';
      if (destinationTask) {
        destIndex = parentsAndNormal.findIndex(t => t.id === destinationTask.id);
        if (destIndex === -1) {
          // Dropped on a subtask, place it after the parent
          destIndex = parentsAndNormal.findIndex(t => t.id === destinationTask.parentTaskId) + 1;
        }
      }
    }

    const [reorderedItem] = parentsAndNormal.splice(sourceIndex, 1);
    if (sourceIndex < destIndex) destIndex -= 1;
    parentsAndNormal.splice(Math.max(0, destIndex), 0, {
      ...reorderedItem,
      groupId: nextGroupId || null,
    });

    // Create a map of updated display orders
    const orderMap = new Map<string, number>();
    parentsAndNormal.forEach((item, index) => {
      orderMap.set(item.id, index);
    });

    // Update displayOrder for all items, keeping subtasks intact
    const updatedItems = tasks.map(item => {
      if (orderMap.has(item.id)) {
        const reorderedTask = parentsAndNormal.find((task) => task.id === item.id);
        return {
          ...item,
          displayOrder: orderMap.get(item.id)!,
          groupId: reorderedTask?.groupId || null,
        };
      }
      return item;
    });

    onReorderTasks(updatedItems);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
      case 'listo': return 'bg-[#00c875] text-white';
      case 'completed_late': return 'bg-orange-500 text-white';
      case 'in_progress':
      case 'en_curso': return 'bg-[#fdab3d] text-white';
      case 'stuck':
      case 'detenido': return 'bg-[#e2445c] text-white';
      case 'devuelto': return 'bg-[#ff7575] text-white';
      case 'reproceso': return 'bg-[#f59e0b] text-white';
      case 'todo':
      case 'pending':
      case 'not_started': return 'bg-[#c4c4c4] text-white';
      default: return 'bg-[#c4c4c4] text-white';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'completed': return 'LISTO';
      case 'completed_late': return 'LISTO CON RETRASO';
      case 'in_progress': return 'TRABAJANDO';
      case 'stuck': return 'ESTANCADO';
      case 'todo':
      case 'pending': return 'PENDIENTE';
      case 'en_curso': return 'EN CURSO';
      case 'listo': return 'LISTO';
      case 'devuelto': return 'DEVUELTO';
      case 'reproceso': return 'REPROCESO';
      case 'detenido': return 'DETENIDO';
      case 'not_started': return 'NO INICIADO';
      default: return status?.toUpperCase();
    }
  };

  const toggleScheduleFilter = (filter: Exclude<ScheduleFilter, null>) => {
    setScheduleFilter((current) => current === filter ? null : filter);
  };

  const renderScheduleFilterChip = (
    filter: Exclude<ScheduleFilter, null>,
    count: number,
    label: string,
    inactiveClassName: string,
    activeClassName: string
  ) => {
    const isActive = scheduleFilter === filter;
    return (
      <button
        type="button"
        onClick={() => toggleScheduleFilter(filter)}
        className={`rounded-full px-2.5 py-1 font-bold transition-all focus:outline-none focus:ring-2 focus:ring-indigo-500/20 ${
          isActive ? activeClassName : inactiveClassName
        }`}
        aria-pressed={isActive}
        title={isActive ? 'Quitar filtro' : `Filtrar tareas ${label}`}
      >
        {count} {label}
      </button>
    );
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
    <div translate="no" className="flex flex-col h-full bg-white rounded-lg overflow-hidden border border-slate-200 shadow-sm">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-slate-200 bg-white">
        <div className="flex items-center gap-2">
          {onCreateTask && (
            <Button onClick={onCreateTask} size="sm" className="bg-indigo-600 hover:bg-indigo-700 text-white h-8 px-3 mr-2">
              <Plus size={14} className="mr-1.5" />
              Nueva Tarea
            </Button>
          )}
          {canManageTaskGroups && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsGroupManagerOpen(true)}
              className="h-8 px-3 text-[11px] font-bold border-slate-200 text-slate-600 hover:bg-slate-50"
            >
              <ListTodo size={14} className="mr-1.5" />
              Grupos
            </Button>
          )}
          <div
            aria-hidden={isTimelineCollapsed}
            className={`flex overflow-hidden rounded-md bg-slate-100 transition-all ${
              isTimelineCollapsed ? 'w-0 p-0 opacity-0 pointer-events-none' : 'p-1 opacity-100'
            }`}
          >
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
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setIsTimelineCollapsed((current) => !current)}
            className="h-8 px-3 text-[11px] font-bold border-slate-200 text-slate-600 hover:bg-slate-50"
            title={isTimelineCollapsed ? "Mostrar cronograma" : "Ocultar cronograma"}
          >
            {isTimelineCollapsed ? (
              <PanelRightOpen size={14} className="mr-1.5" />
            ) : (
              <PanelRightClose size={14} className="mr-1.5" />
            )}
            {isTimelineCollapsed ? "Mostrar Gantt" : "Solo tareas"}
          </Button>
        </div>
        <div className="flex items-center gap-2 text-[11px] font-medium text-slate-400">
          {renderScheduleFilterChip(
            'overdue',
            scheduleStats.overdue,
            'atrasadas',
            'bg-red-50 text-red-700 hover:bg-red-100',
            'bg-red-600 text-white shadow-sm ring-2 ring-red-200'
          )}
          {renderScheduleFilterChip(
            'due_soon',
            scheduleStats.dueSoon,
            'por vencer',
            'bg-orange-50 text-orange-700 hover:bg-orange-100',
            'bg-orange-500 text-white shadow-sm ring-2 ring-orange-200'
          )}
          {renderScheduleFilterChip(
            'completed_late',
            scheduleStats.completedLate,
            'con retraso',
            'bg-slate-100 text-slate-600 hover:bg-slate-200',
            'bg-slate-700 text-white shadow-sm ring-2 ring-slate-200'
          )}
          {scheduleFilter && (
            <button
              type="button"
              onClick={() => setScheduleFilter(null)}
              className="rounded-full bg-indigo-50 px-2.5 py-1 font-bold text-indigo-700 transition-colors hover:bg-indigo-100"
            >
              Limpiar filtro
            </button>
          )}
          <span>{scheduleFilter ? `${visibleTasks.length} filtradas` : `${tasks.length} tareas en total`}</span>
        </div>
      </div>

      <div className="flex border-b border-slate-200 bg-slate-50/30">
        {/* Left side: Task List (Monday Style) */}
        <div className={`${isTimelineCollapsed ? 'w-full border-r-0' : 'w-[760px] border-r'} shrink-0 border-slate-200 flex flex-col`}>
          <div className="h-10 flex items-center px-4 border-b border-slate-200 text-[10px] font-bold text-slate-400 uppercase tracking-widest bg-white">
            <div className="w-10"></div>
            <div className="flex-1 min-w-[220px]">Tarea</div>
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
                  {visibleTasks.length === 0 && scheduleFilter && (
                    <div className="flex min-h-[180px] flex-col items-center justify-center border-b border-slate-100 px-4 text-center">
                      <ListTodo className="mb-2 text-slate-300" size={28} />
                      <p className="text-sm font-semibold text-slate-700">No hay tareas con este filtro.</p>
                      <button
                        type="button"
                        onClick={() => setScheduleFilter(null)}
                        className="mt-2 rounded-md bg-indigo-50 px-3 py-1.5 text-xs font-bold text-indigo-700 transition-colors hover:bg-indigo-100"
                      >
                        Ver todas las tareas
                      </button>
                    </div>
                  )}
                  {visibleRows.map((row, rowIndex) => {
                    if (row.type === 'group') {
                      const groupColor = getTaskGroupColor(row.group);
                      const isCollapsed = Boolean(collapsedGroups[row.group.id]);

                      return (
                        <Draggable
                          key={row.id}
                          draggableId={row.id}
                          index={rowIndex}
                          isDragDisabled
                        >
                          {(provided) => (
                            <div
                              ref={provided.innerRef}
                              {...provided.draggableProps}
                              className={`flex h-10 items-center border-b border-slate-200 bg-white px-4 shadow-[inset_0_-1px_0_rgba(226,232,240,0.55)] ${
                                row.taskCount === 0 ? 'bg-slate-50/80' : ''
                              }`}
                              style={{ borderLeft: `6px solid ${groupColor}` }}
                            >
                              <button
                                type="button"
                                onClick={() => toggleGroup(row.group.id)}
                                className="mr-2 flex h-5 w-5 items-center justify-center rounded bg-slate-100 text-slate-500 transition-colors hover:bg-slate-200"
                                title={isCollapsed ? 'Expandir grupo' : 'Contraer grupo'}
                              >
                                {isCollapsed ? <ChevronRight size={13} /> : <ChevronLeft size={13} className="-rotate-90" />}
                              </button>
                              <span className="mr-2 h-2.5 w-2.5 rounded-full" style={{ backgroundColor: groupColor }} />
                              <span className="min-w-0 truncate text-sm font-black text-slate-800">{row.group.name}</span>
                              <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">
                                {row.taskCount} tarea{row.taskCount === 1 ? '' : 's'}
                              </span>
                              {row.taskCount === 0 && (
                                <span className="ml-3 hidden text-[11px] font-semibold text-slate-400 md:inline">
                                  Arrastra una tarea hasta este grupo
                                </span>
                              )}
                              {canManageTaskGroups && (
                                <button
                                  type="button"
                                  onClick={() => setIsGroupManagerOpen(true)}
                                  className="ml-auto rounded-md p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-indigo-600"
                                  title="Editar grupos"
                                >
                                  <Settings size={14} />
                                </button>
                              )}
                            </div>
                          )}
                        </Draggable>
                      );
                    }

                    const task = row.task;
                    const index = rowIndex;
                    const assignedMember = teamMembers.find(m => m.id === task.assignedTo);
                    const taskTitle = getTaskTitle(task);
                    const taskDisplayTitle = getTaskDisplayTitle(task);
                    const startDate = getTaskDate(task.startDate);
                    const endDate = getTaskDate(task.endDate);
                    const scheduleState = getTaskScheduleState(task);
                    const isQuantitative = task.type === 'quantitative';
                    const isParent = task.isParentTask || sortedTasks.some(t => t.parentTaskId === task.id);
                    const isSubTask = !!task.parentTaskId;
                    const isExpanded = expandedParents[task.id];
                    const isEditingTitle = editingTaskId === task.id;
                    const taskPriority = getTaskPriority(task);
                    const commentCount = getTaskCommentCount(task);
                    const canEditThisTaskDates = Boolean(canModifyTaskDates && !task.isWorkflowStep);
                    const canEditThisTaskAssignee = Boolean(canChangeTaskAssignee && !task.isWorkflowStep && task.assignedTo !== 'DYNAMIC');
                    const isWorkflowTask = task.type === 'workflow' && !task.isWorkflowStep;
                    const canUseStatusSelect = Boolean(canChangeTaskStatus && (!isWorkflowTask || (task.status || 'todo') === 'todo'));
                    const canAddSubtask = Boolean(canCreateSubtasks && task.type === 'state' && !task.parentTaskId && !task.isWorkflowStep);
                    const canResetWorkflow = Boolean(
                      canModifyTaskDetails &&
                      onResetWorkflowTask &&
                      task.type === 'workflow' &&
                      !task.isParentTask &&
                      (task.status !== 'todo' || (task.progress || 0) > 0 || task.externalWorkflowId)
                    );
                    const canCreateBulkWorkflowIterations = Boolean(
                      canCreateSubtasks &&
                      onCreateBulkWorkflowIterations &&
                      task.type === 'workflow' &&
                      !task.isWorkflowStep
                    );
                    const hasActionItems = Boolean(
                      !task.isWorkflowStep &&
                      (
                        (canModifyTaskDetails && onUpdateTaskTitle) ||
                        onOpenTaskDocs ||
                        (canEditTaskStructure && onEditTaskStructure) ||
                        canAddSubtask ||
                        (canModifyTaskDetails && isQuantitative) ||
                        (canModifyTaskDetails && task.syncExternal && onSyncTask) ||
                        canCreateBulkWorkflowIterations ||
                        canResetWorkflow ||
                        (canManageTaskGroups && onUpdateTaskGroup && assignableTaskGroups.length > 0) ||
                        canRemoveTasks
                      )
                    );

                    return (
                      <Draggable key={task.id} draggableId={task.id} index={index} isDragDisabled={Boolean(scheduleFilter) || !canModifyTaskDetails || isSubTask || isEditingTitle}>
                        {(provided, snapshot) => (
                          <div
                            ref={provided.innerRef}
                            {...provided.draggableProps}
                            className={`flex items-center h-10 border-b transition-colors group relative ${snapshot.isDragging ? 'bg-white shadow-xl z-50 ring-1 ring-indigo-500/20' : ''} ${isSubTask ? 'bg-indigo-50/30 border-indigo-100 hover:bg-indigo-50/60' : 'border-slate-100 hover:bg-slate-50'}`}
                          >
                            {/* Monday-style colored left bar */}
                            <div className={`absolute left-0 top-0 bottom-0 w-1.5 ${getScheduleRailColor(task)}`} />

                            {isSubTask && (
                              <>
                                <div className="absolute left-5 top-0 bottom-0 w-px bg-indigo-100" />
                                <div className="absolute left-5 top-1/2 h-px w-6 bg-indigo-200" />
                              </>
                            )}

                            <div {...provided.dragHandleProps} className={`w-10 flex justify-center text-slate-300 group-hover:text-slate-400 ${isSubTask ? 'invisible' : 'cursor-grab active:cursor-grabbing'}`}>
                              <GripVertical size={14} />
                            </div>

                            <div className={`flex-1 min-w-[220px] px-2 flex items-center gap-2 ${task.isWorkflowStep ? 'pl-10' : isSubTask ? 'pl-6' : ''}`}>
                              {isSubTask && <CornerDownRight size={14} className="shrink-0 text-indigo-300" />}
                              {(isParent || task.type === 'workflow') && !task.isWorkflowStep && (
                                <button
                                  onClick={() => toggleParent(task.id)}
                                  className="w-4 h-4 flex items-center justify-center rounded bg-slate-200 text-slate-600 hover:bg-slate-300"
                                >
                                  {isExpanded ? <ChevronLeft className="w-3 h-3 -rotate-90" /> : <ChevronRight className="w-3 h-3" />}
                                </button>
                              )}
                              {isEditingTitle ? (
                                <input
                                  autoFocus
                                  value={editingTaskTitle}
                                  onChange={(event) => setEditingTaskTitle(event.target.value)}
                                  onBlur={() => void finishEditingTitle(task)}
                                  onKeyDown={(event) => {
                                    if (event.key === 'Enter') {
                                      event.currentTarget.blur();
                                    }
                                    if (event.key === 'Escape') {
                                      setEditingTaskId(null);
                                      setEditingTaskTitle("");
                                    }
                                  }}
                                  onClick={(event) => event.stopPropagation()}
                                  className="h-7 min-w-0 flex-1 rounded-md border border-indigo-200 bg-white px-2 text-sm font-medium text-slate-800 outline-none ring-2 ring-indigo-500/10"
                                />
                              ) : (
                                <>
                                  <button
                                    type="button"
                                    onDoubleClick={() => startEditingTitle(task)}
                                    className={`min-w-0 flex-1 truncate text-left text-sm font-medium ${task.status === 'completed' || task.status === 'completed_late' || task.status === 'listo' ? 'text-slate-400 line-through' : isSubTask ? 'text-slate-600' : 'text-slate-700'}`}
                                    title={taskTitle}
                                  >
                                    {taskDisplayTitle}
                                  </button>
                                  {onOpenTaskComments && !task.isWorkflowStep && (
                                    <button
                                      type="button"
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        onOpenTaskComments(task);
                                      }}
                                      className="relative shrink-0 rounded-md p-1 text-slate-400 transition-colors hover:bg-indigo-50 hover:text-indigo-600"
                                      title="Comentarios"
                                    >
                                      <MessageSquare size={14} />
                                      {commentCount > 0 && (
                                        <span className="absolute -right-1 -top-1 min-w-4 rounded-full bg-indigo-600 px-1 text-center text-[9px] font-bold leading-4 text-white">
                                          {commentCount > 99 ? '99+' : commentCount}
                                        </span>
                                      )}
                                    </button>
                                  )}
                                </>
                              )}
                              {isSubTask && (
                                <span className="shrink-0 rounded bg-indigo-50 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-tight text-indigo-500 border border-indigo-100">
                                  Subtarea
                                </span>
                              )}
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
                              <div
                                className={`relative flex max-w-full items-center justify-center rounded-md ${
                                  canEditThisTaskAssignee ? 'cursor-pointer hover:bg-indigo-50/70' : ''
                                }`}
                                title={canEditThisTaskAssignee ? 'Cambiar responsable' : assignedMember?.name || 'Sin asignar'}
                              >
                                {task.assignedTo === 'DYNAMIC' ? (
                                  <div className="flex items-center gap-1.5">
                                    <div className="w-7 h-7 rounded-full bg-orange-50 border border-orange-200 flex items-center justify-center shadow-sm" title="Asignación Dinámica">
                                      <span className="text-[10px] font-bold text-orange-600">?</span>
                                    </div>
                                    <span className="text-[10px] text-slate-500 hidden lg:block truncate max-w-[50px]">Dinámica</span>
                                  </div>
                                ) : assignedMember ? (
                                  <div className="flex items-center gap-1.5 px-1 py-0.5">
                                    <div className={`w-7 h-7 rounded-full bg-indigo-50 border flex items-center justify-center overflow-hidden shadow-sm ${
                                      canEditThisTaskAssignee ? 'border-indigo-300 ring-2 ring-indigo-100' : 'border-indigo-100'
                                    }`}>
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
                                  <div className={`w-7 h-7 rounded-full border border-dashed flex items-center justify-center bg-slate-50/50 ${
                                    canEditThisTaskAssignee ? 'border-indigo-300 text-indigo-500 ring-2 ring-indigo-100' : 'border-slate-300 text-slate-300'
                                  }`}>
                                    <Users size={12} className={canEditThisTaskAssignee ? 'text-indigo-500' : 'text-slate-300'} />
                                  </div>
                                )}

                                {canEditThisTaskAssignee && (
                                  <select
                                    value={task.assignedTo || ''}
                                    onMouseDown={(event) => event.stopPropagation()}
                                    onClick={(event) => event.stopPropagation()}
                                    onChange={(event) => {
                                      event.stopPropagation();
                                      onUpdateTaskAssignee?.(task.id, event.target.value, task);
                                    }}
                                    className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                                    aria-label={`Cambiar responsable de ${taskTitle}`}
                                  >
                                    <option value="">Sin asignar</option>
                                    {taskAssigneeOptions.map((member) => (
                                      <option key={member.id} value={member.id}>
                                        {member.name || member.email}
                                      </option>
                                    ))}
                                  </select>
                                )}
                              </div>
                            </div>

                            <div className="w-28 h-full relative group/status">
                              {task.isWorkflowStep ? (
                                <select
                                  value={task.status || 'not_started'}
                                  onChange={(e) => {
                                    // Update the specific step status in the parent task
                                    const newStatus = e.target.value;
                                    const parentTask = task.originalTask;
                                    const updatedSteps = [...parentTask.workflowSteps];
                                    updatedSteps[task.stepIndex].status = newStatus;
                                    onUpdateTaskStatus?.(parentTask.id, parentTask.status, { ...parentTask, workflowSteps: updatedSteps });
                                  }}
                                  disabled={!canChangeTaskStatus}
                                  className={`h-full w-full appearance-none flex items-center justify-center text-[10px] font-bold tracking-tight px-2 text-center focus:outline-none transition-all hover:brightness-105 ${canChangeTaskStatus ? 'cursor-pointer' : 'cursor-default'} ${getStatusColor(task.status)}`}
                                >
                                  <option value="not_started" className="bg-white text-slate-700" disabled>NO INICIADO</option>
                                  <option value="en_curso" className="bg-white text-slate-700" disabled>EN CURSO</option>
                                  <option value="listo" className="bg-white text-slate-700" disabled>LISTO</option>
                                  <option value="devuelto" className="bg-white text-slate-700" disabled>DEVUELTO</option>
                                  <option value="reproceso" className="bg-white text-slate-700" disabled>REPROCESO</option>
                                  <option value="detenido" className="bg-white text-slate-700">DETENIDO</option>
                                  {/* Allow changing back to en_curso if it was manually stopped */}
                                  {task.status === 'detenido' && <option value="en_curso" className="bg-white text-slate-700">REANUDAR (EN CURSO)</option>}
                                </select>
                              ) : (
                                <select
                                  value={task.status || 'todo'}
                                  onChange={(e) => onUpdateTaskStatus?.(task.id, e.target.value, task)}
                                  disabled={!canUseStatusSelect}
                                  title={isWorkflowTask ? 'Los workflows solo se inician desde Trabajando; se finalizan por sus pasos.' : undefined}
                                  className={`h-full w-full appearance-none flex items-center justify-center text-[10px] font-bold tracking-tight px-2 text-center focus:outline-none transition-all hover:brightness-105 ${canUseStatusSelect ? 'cursor-pointer' : 'cursor-default'} ${getStatusColor(task.status)}`}
                                >
                                  {isWorkflowTask ? (
                                    <>
                                      {task.status !== 'in_progress' && (
                                        <option value={task.status || 'todo'} className="bg-white text-slate-700" disabled>
                                          {getStatusLabel(task.status || 'todo')}
                                        </option>
                                      )}
                                      <option value="in_progress" className="bg-white text-slate-700">TRABAJANDO</option>
                                    </>
                                  ) : (
                                    <>
                                      <option value="todo" className="bg-white text-slate-700">PENDIENTE</option>
                                      <option value="in_progress" className="bg-white text-slate-700">TRABAJANDO</option>
                                      <option value="stuck" className="bg-white text-slate-700">ESTANCADO</option>
                                      <option value="completed" className="bg-white text-slate-700">LISTO</option>
                                      {task.status === 'completed_late' && <option value="completed_late" className="bg-white text-slate-700">LISTO CON RETRASO</option>}
                                    </>
                                  )}
                                </select>
                              )}
                              <div className="absolute inset-0 pointer-events-none opacity-0 group-hover/status:opacity-100 bg-black/5 transition-opacity" />
                            </div>

                            <div className="w-24 h-full relative group/priority">
                              {canModifyTaskDetails && onUpdateTaskPriority ? (
                                <select
                                  value={taskPriority}
                                  onChange={(e) => onUpdateTaskPriority(task.id, e.target.value, task)}
                                  className={`h-full w-full appearance-none flex items-center justify-center text-[10px] font-bold tracking-tight px-2 cursor-pointer text-center focus:outline-none transition-all hover:brightness-105 ${getPriorityColor(taskPriority)}`}
                                >
                                  <option value="high" className="bg-white text-slate-700">ALTA</option>
                                  <option value="medium" className="bg-white text-slate-700">MEDIA</option>
                                  <option value="low" className="bg-white text-slate-700">BAJA</option>
                                </select>
                              ) : (
                                <div className={`flex h-full w-full items-center justify-center text-[10px] font-bold tracking-tight ${getPriorityColor(taskPriority)}`}>
                                  {taskPriority === 'high' ? 'ALTA' : taskPriority === 'low' ? 'BAJA' : 'MEDIA'}
                                </div>
                              )}
                              <div className="absolute inset-0 pointer-events-none opacity-0 group-hover/priority:opacity-100 bg-black/5 transition-opacity" />
                            </div>

                            <div className="w-32 px-2">
                              <button
                                type="button"
                                onClick={(event) => {
                                  if (!canEditThisTaskDates) return;
                                  event.stopPropagation();
                                  setTaskForDateEdit(task);
                                }}
                                disabled={!canEditThisTaskDates}
                                className={`rounded-md h-7 w-full flex items-center justify-center relative overflow-hidden group/timeline border ${
                                  canEditThisTaskDates ? 'cursor-pointer hover:ring-2 hover:ring-indigo-500/10' : 'cursor-default'
                                } ${getScheduleDateClass(task)}`}
                                title={`${canEditThisTaskDates ? 'Editar fechas' : 'Sin permiso para editar fechas'}${scheduleState === 'overdue' ? ' · Atrasada' : scheduleState === 'due_soon' ? ' · Por vencer' : scheduleState === 'completed_late' ? ' · Finalizada con retraso' : ''}`}
                              >
                                <div className="z-10 flex items-center gap-1 text-[9px] font-bold">
                                  <Calendar size={10} />
                                  {startDate && endDate ? (
                                    `${format(startDate, 'd MMM', { locale: es })} - ${format(endDate, 'd MMM', { locale: es })}`
                                  ) : '-'}
                                </div>
                                <div className="absolute inset-0 bg-black/5 opacity-0 group-hover/timeline:opacity-100 transition-opacity" />
                              </button>
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
                                    scheduleState === 'overdue' ? 'bg-red-600' :
                                    scheduleState === 'due_soon' ? 'bg-orange-500' :
                                    task.status === 'completed_late' ? 'bg-orange-500' :
                                    task.status === 'completed' ? 'bg-[#00c875]' :
                                    task.status === 'stuck' ? 'bg-[#e2445c]' :
                                    'bg-indigo-500'
                                  }`}
                                  style={{ width: `${task.progress || 0}%` }}
                                />
                              </div>
                            </div>

                            {hasActionItems && (
                              <div className="absolute right-2 flex items-center">
                                <button
                                  type="button"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    setOpenActionMenuTaskId((currentId) => currentId === task.id ? null : task.id);
                                  }}
                                  className="rounded-md bg-white/90 p-1.5 text-slate-400 opacity-0 shadow-sm ring-1 ring-slate-200 transition-colors hover:bg-indigo-50 hover:text-indigo-600 group-hover:opacity-100"
                                  title="Acciones de tarea"
                                  aria-label={`Acciones de ${taskTitle}`}
                                >
                                  <MoreHorizontal size={15} />
                                </button>

                                {openActionMenuTaskId === task.id && (
                                  <div className="absolute right-0 top-8 z-40 w-56 overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-xl">
                                    {canManageTaskGroups && onUpdateTaskGroup && assignableTaskGroups.length > 0 && !task.parentTaskId && !task.isWorkflowStep && (
                                      <div className="border-b border-slate-100 px-3 py-2">
                                        <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-400">
                                          Grupo
                                        </label>
                                        <select
                                          value={task.groupId || ''}
                                          onMouseDown={(event) => event.stopPropagation()}
                                          onClick={(event) => event.stopPropagation()}
                                          onChange={(event) => {
                                            event.stopPropagation();
                                            void onUpdateTaskGroup(task.id, event.target.value, task);
                                            setOpenActionMenuTaskId(null);
                                          }}
                                          className="h-8 w-full rounded-md border border-slate-200 bg-white px-2 text-xs font-medium text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500/20"
                                        >
                                          <option value="">{defaultTaskGroup.name}</option>
                                          {assignableTaskGroups.map((group) => (
                                            <option key={group.id} value={group.id}>
                                              {group.name}
                                            </option>
                                          ))}
                                        </select>
                                      </div>
                                    )}
                                    {canModifyTaskDetails && onUpdateTaskTitle && (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setOpenActionMenuTaskId(null);
                                          startEditingTitle(task);
                                        }}
                                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                                      >
                                        <Settings size={14} />
                                        Editar nombre
                                      </button>
                                    )}
                                    {onOpenTaskDocs && (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setOpenActionMenuTaskId(null);
                                          onOpenTaskDocs(task.id, task);
                                        }}
                                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                                      >
                                        <FileText size={14} />
                                        Detalles e iteraciones
                                      </button>
                                    )}
                                    {canEditTaskStructure && onEditTaskStructure && (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setOpenActionMenuTaskId(null);
                                          onEditTaskStructure(task);
                                        }}
                                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                                      >
                                        <Settings size={14} />
                                        Estructura y subtareas
                                      </button>
                                    )}
                                    {canAddSubtask && (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setOpenActionMenuTaskId(null);
                                          onAddSubtask?.(task);
                                        }}
                                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                                      >
                                        <Plus size={14} />
                                        Agregar subtarea
                                      </button>
                                    )}
                                    {canCreateBulkWorkflowIterations && (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setOpenActionMenuTaskId(null);
                                          onCreateBulkWorkflowIterations?.(task);
                                        }}
                                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                                      >
                                        <ClipboardList size={14} />
                                        Iteraciones masivas
                                      </button>
                                    )}
                                    {canModifyTaskDetails && isQuantitative && task.type !== 'workflow' && (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setOpenActionMenuTaskId(null);
                                          if (onOpenIncrementTask) {
                                            onOpenIncrementTask(task);
                                            return;
                                          }
                                          const val = prompt('Ingresar nuevo valor actual:', task.currentValue || 0);
                                          if (val !== null) onUpdateTaskValue?.(task.id, Number(val), task);
                                        }}
                                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                                      >
                                        <Plus size={14} />
                                        Registrar incremento
                                      </button>
                                    )}
                                    {canModifyTaskDetails && task.syncExternal && onSyncTask && (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setOpenActionMenuTaskId(null);
                                          onSyncTask(task.id, task);
                                        }}
                                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                                      >
                                        <RefreshCw size={14} />
                                        Sincronizar
                                      </button>
                                    )}
                                    {canResetWorkflow && (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setOpenActionMenuTaskId(null);
                                          void onResetWorkflowTask?.(task);
                                        }}
                                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium text-amber-700 hover:bg-amber-50"
                                      >
                                        <RotateCcw size={14} />
                                        Reiniciar flujo
                                      </button>
                                    )}
                                    {canRemoveTasks && (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setOpenActionMenuTaskId(null);
                                          onDeleteTask?.(task.id);
                                        }}
                                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium text-red-600 hover:bg-red-50"
                                      >
                                        <Trash2 size={14} />
                                        Eliminar
                                      </button>
                                    )}
                                  </div>
                                )}
                              </div>
                            )}
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

        <div
          aria-hidden={isTimelineCollapsed}
          className={`overflow-hidden bg-white transition-[flex-basis,width,opacity] ${
            isTimelineCollapsed
              ? 'w-0 min-w-0 basis-0 grow-0 shrink opacity-0 pointer-events-none'
              : 'flex-1 opacity-100'
          }`}
        >
          <div className="project-gantt-timeline-only h-full overflow-x-auto scrollbar-thin scrollbar-thumb-slate-200">
            {ganttTasks.length > 0 ? (
              <Gantt
                tasks={ganttTasks}
                viewMode={viewMode}
                listCellWidth=""
                columnWidth={viewMode === ViewMode.Day ? 65 : viewMode === ViewMode.Week ? 150 : 250}
                headerHeight={40}
                rowHeight={40}
                barCornerRadius={4}
                barFill={70}
                handleWidth={8}
                fontSize="11px"
                fontFamily="Inter, sans-serif"
                todayColor="rgba(99, 102, 241, 0.03)"
                onProgressChange={canModifyTaskDetails && onUpdateTaskProgress ? (task) => {
                  const originalTask = tasks.find(t => t.id === task.id);
                  if (!originalTask) return;
                  onUpdateTaskProgress(task.id, task.progress, originalTask);
                } : undefined}
                onDateChange={canModifyTaskDates ? (task) => {
                  const originalTask = tasks.find(t => t.id === task.id);
                  if (!originalTask) return;
                  onUpdateTaskDates?.(task.id, task.start, task.end, originalTask);
                } : undefined}
              />
            ) : (
              <div className="flex h-full min-h-[180px] items-center justify-center text-sm font-medium text-slate-400">
                Sin tareas para mostrar en el cronograma.
              </div>
            )}
          </div>
        </div>
      </div>
      {isGroupManagerOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <div>
                <h3 className="text-base font-black text-slate-900">Grupos de tareas</h3>
                <p className="text-xs text-slate-500">
                  1 grupo predeterminado · {assignableTaskGroups.length} personalizado{assignableTaskGroups.length === 1 ? '' : 's'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsGroupManagerOpen(false)}
                className="rounded-full p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
                aria-label="Cerrar"
              >
                <X size={18} />
              </button>
            </div>

            <div className="max-h-[70vh] space-y-4 overflow-y-auto bg-slate-50 p-5">
              {onCreateTaskGroup && (
                <div className="rounded-xl border border-slate-200 bg-white p-3">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newGroupName}
                      onChange={(event) => setNewGroupName(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.preventDefault();
                          void handleCreateGroup();
                        }
                      }}
                      placeholder="Nombre del grupo"
                      className="h-9 min-w-0 flex-1 rounded-lg border border-slate-200 px-3 text-sm outline-none focus:ring-2 focus:ring-indigo-500/20"
                    />
                    <Button
                      type="button"
                      onClick={() => void handleCreateGroup()}
                      disabled={!newGroupName.trim()}
                      className="h-9 bg-indigo-600 px-3 text-white hover:bg-indigo-700"
                    >
                      <Plus size={14} className="mr-1" />
                      Crear
                    </Button>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {TASK_GROUP_COLORS.map((color) => (
                      <button
                        key={color}
                        type="button"
                        onClick={() => setNewGroupColor(color)}
                        className={`h-6 w-6 rounded-full border-2 transition-transform ${
                          newGroupColor === color ? 'scale-110 border-slate-900' : 'border-white ring-1 ring-slate-200'
                        }`}
                        style={{ backgroundColor: color }}
                        aria-label={`Color ${color}`}
                      />
                    ))}
                  </div>
                </div>
              )}

              <div className="space-y-2">
                {sortedTaskGroups.map((group) => {
                    const knownGroupIds = new Set(sortedTaskGroups.map((candidate) => candidate.id));
                    const groupTaskCount = sortedTasks.filter((task) => {
                      if (task.parentTaskId) return false;
                      const groupId = getTaskGroupId(task);
                      if (group.id === UNGROUPED_GROUP_ID) {
                        return groupId === UNGROUPED_GROUP_ID || !knownGroupIds.has(groupId);
                      }
                      return groupId === group.id;
                    }).length;
                    const isDefaultGroup = group.id === UNGROUPED_GROUP_ID;

                    return (
                      <div key={group.id} className="rounded-xl border border-slate-200 bg-white p-3">
                        <div className="flex items-center gap-2">
                          <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: getTaskGroupColor(group) }} />
                          <input
                            defaultValue={group.name}
                            onBlur={(event) => {
                              const nextName = event.target.value.trim().replace(/\s+/g, ' ');
                              if (!nextName) {
                                event.target.value = group.name;
                                return;
                              }
                              if (nextName && nextName !== group.name) {
                                void onUpdateTaskGroupDefinition?.(group.id, { name: nextName });
                              }
                            }}
                            className="h-8 min-w-0 flex-1 rounded-md border border-transparent px-2 text-sm font-bold text-slate-800 outline-none transition-colors hover:border-slate-200 focus:border-indigo-200 focus:ring-2 focus:ring-indigo-500/10"
                          />
                          {isDefaultGroup && (
                            <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-bold text-indigo-600">
                              Predeterminado
                            </span>
                          )}
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">
                            {groupTaskCount}
                          </span>
                          {onDeleteTaskGroup && !isDefaultGroup && (
                            <button
                              type="button"
                              onClick={() => void onDeleteTaskGroup(group.id)}
                              className="rounded-md p-1.5 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600"
                              title="Eliminar grupo"
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                        </div>
                        <div className="mt-2 flex flex-wrap gap-2 pl-5">
                          {TASK_GROUP_COLORS.map((color) => (
                            <button
                              key={`${group.id}-${color}`}
                              type="button"
                              onClick={() => void onUpdateTaskGroupDefinition?.(group.id, { color })}
                              className={`h-5 w-5 rounded-full border-2 ${
                                getTaskGroupColor(group) === color ? 'border-slate-900' : 'border-white ring-1 ring-slate-200'
                              }`}
                              style={{ backgroundColor: color }}
                              aria-label={`Color ${color}`}
                            />
                          ))}
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          </div>
        </div>
      )}
      <TaskDateEditorModal
        isOpen={!!taskForDateEdit}
        task={taskForDateEdit}
        onClose={() => setTaskForDateEdit(null)}
        onSave={(taskId, start, end, task) => onUpdateTaskDates?.(taskId, start, end, task)}
      />
    </div>
  );
};
