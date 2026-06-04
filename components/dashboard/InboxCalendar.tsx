"use client"

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  ArrowRight,
  Briefcase,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock,
  ExternalLink,
  Loader2,
  MapPin,
  Sparkles,
  Video,
} from 'lucide-react';
import { collection, getDocs, onSnapshot, query, where } from '@/lib/supabase/document-store';
import { db } from '@/lib/backend';
import { useAuth } from '@/hooks/useAuth';
import { belongsToAnyOrganization, organizationNameFor } from '@/lib/organizations';
import { getTaskDisplayTitle } from '@/lib/task-title';
import { getTaskDateValue, isCompletedTaskStatus } from '@/lib/taskProgress';
import {
  createGoogleCalendarUrl,
  getMeetingEndDate,
  getMeetingRecurrenceFrequency,
  getMeetingScheduleLabel,
  getMeetingStartDate,
  isMeetingTask,
} from '@/lib/calendar-utils';

type CalendarTask = Record<string, any> & {
  id: string;
  projectId: string;
  projectName: string;
  organizationName?: string;
};

type CalendarEvent = {
  id: string;
  task: CalendarTask;
  taskId: string;
  projectId: string;
  projectName: string;
  organizationName: string;
  title: string;
  subtitle: string;
  type: 'workflow' | 'meeting' | 'task';
  status: string;
  priority: string;
  start: Date;
  end: Date;
  stepLabel?: string;
  stepIndex?: number;
  occurrenceIndex?: number;
};

const DAY_MS = 24 * 60 * 60 * 1000;
const OPEN_WORKFLOW_STEP_STATUSES = new Set(['en_curso', 'reproceso', 'pending', 'detenido', 'no_iniciado', 'not_started']);
const MONTH_LABEL = new Intl.DateTimeFormat('es-CO', { month: 'long', year: 'numeric' });
const DAY_LABEL = new Intl.DateTimeFormat('es-CO', { weekday: 'long', day: 'numeric', month: 'long' });
const SHORT_DATE_LABEL = new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'short' });
const TIME_LABEL = new Intl.DateTimeFormat('es-CO', { hour: 'numeric', minute: '2-digit' });

const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
const endOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
const startOfMonth = (date: Date) => new Date(date.getFullYear(), date.getMonth(), 1);
const endOfMonth = (date: Date) => new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
const addDays = (date: Date, amount: number) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + amount);
const addMonths = (date: Date, amount: number) => new Date(date.getFullYear(), date.getMonth() + amount, 1);

const startOfCalendarWeek = (date: Date) => {
  const day = date.getDay();
  const mondayOffset = (day + 6) % 7;
  return addDays(startOfDay(date), -mondayOffset);
};

const endOfCalendarWeek = (date: Date) => {
  const day = date.getDay();
  const sundayOffset = 6 - ((day + 6) % 7);
  return endOfDay(addDays(date, sundayOffset));
};

const sameDay = (left: Date, right: Date) =>
  left.getFullYear() === right.getFullYear() &&
  left.getMonth() === right.getMonth() &&
  left.getDate() === right.getDate();

const isSameMonth = (left: Date, right: Date) =>
  left.getFullYear() === right.getFullYear() && left.getMonth() === right.getMonth();

const normalizeIds = (ids: any[] = []) =>
  Array.from(new Set(ids.map((id) => String(id || '').trim()).filter(Boolean)));

const isWorkflowTask = (task: any) => task?.type === 'workflow' && Array.isArray(task?.workflowSteps);

const isOpenTask = (task: any) => !isCompletedTaskStatus(task?.status || 'todo');

const isAssignedToCurrentUser = (task: any, assignedIds: string[]) => {
  if (task?.assignedTo && assignedIds.includes(task.assignedTo)) return true;
  if (Array.isArray(task?.assignedUsers) && task.assignedUsers.some((id: string) => assignedIds.includes(id))) return true;
  if (Array.isArray(task?.assignedTeamMembers) && task.assignedTeamMembers.some((id: string) => assignedIds.includes(id))) return true;
  if (Array.isArray(task?.meetingParticipantIds) && task.meetingParticipantIds.some((id: string) => assignedIds.includes(id))) return true;
  if (Array.isArray(task?.meeting?.participantIds) && task.meeting.participantIds.some((id: string) => assignedIds.includes(id))) return true;
  if (Array.isArray(task?.meeting?.attendeeIds) && task.meeting.attendeeIds.some((id: string) => assignedIds.includes(id))) return true;
  return false;
};

const hasMeetingResponseForUser = (task: any, assignedIds: string[]) => {
  const responses = Array.isArray(task?.meetingResponses) ? task.meetingResponses : [];
  return responses.some((response: any) =>
    assignedIds.includes(response?.participantId) ||
    assignedIds.includes(response?.userId) ||
    assignedIds.includes(response?.memberId) ||
    (Array.isArray(response?.userIds) && response.userIds.some((id: string) => assignedIds.includes(id)))
  );
};

const isCalendarTaskForUser = (task: CalendarTask, assignedIds: string[]) => {
  if (isWorkflowTask(task)) {
    const currentStep = task.workflowSteps?.[task.currentStepIndex || 0];
    return Boolean(
      currentStep?.assignedTo &&
      assignedIds.includes(currentStep.assignedTo) &&
      OPEN_WORKFLOW_STEP_STATUSES.has(currentStep?.status || 'pending')
    );
  }

  if (isMeetingTask(task)) {
    return isOpenTask(task) && isAssignedToCurrentUser(task, assignedIds) && !hasMeetingResponseForUser(task, assignedIds);
  }

  return isOpenTask(task) && isAssignedToCurrentUser(task, assignedIds);
};

const getWorkflowStepPlannedStart = (task: any, step: any) =>
  getTaskDateValue(step?.plannedStartAt || step?.plannedStartDate || step?.startDate || step?.start) ||
  getTaskDateValue(task?.startDate || task?.start || task?.createdAt);

const getWorkflowStepPlannedEnd = (task: any, step: any) =>
  getTaskDateValue(step?.plannedEndAt || step?.plannedEndDate || step?.endDate || step?.end || step?.dueDate) ||
  getTaskDateValue(task?.endDate || task?.end || task?.dueDate || task?.startDate || task?.start);

const getTaskStartDate = (task: any) =>
  getTaskDateValue(task?.startDate || task?.start || task?.meetingStartAt || task?.createdAt || task?.endDate || task?.end);

const getTaskEndDate = (task: any) =>
  getTaskDateValue(task?.endDate || task?.end || task?.dueDate || task?.meetingEndAt || task?.startDate || task?.start);

const getPriorityLabel = (priority: string) => {
  if (priority === 'high') return 'Alta';
  if (priority === 'low') return 'Baja';
  return 'Media';
};

const getStatusLabel = (task: any, status: string) => {
  if (isWorkflowTask(task)) {
    if (status === 'en_curso') return 'En curso';
    if (status === 'reproceso') return 'Devuelto';
    if (status === 'detenido') return 'Detenido';
    if (status === 'no_iniciado' || status === 'not_started') return 'No iniciado';
    return 'Pendiente';
  }

  if (status === 'in_progress') return 'Trabajando';
  if (status === 'stuck') return 'Estancada';
  if (status === 'not_started' || status === 'todo' || status === 'pending') return 'Pendiente';
  return status || 'Pendiente';
};

const getDueState = (event: CalendarEvent) => {
  if (isCompletedTaskStatus(event.status)) return 'closed';

  const dueEnd = endOfDay(event.end);
  const today = startOfDay(new Date());
  if (dueEnd.getTime() < today.getTime()) return 'overdue';

  const daysUntil = Math.ceil((dueEnd.getTime() - Date.now()) / DAY_MS);
  if (daysUntil <= 2) return 'due_soon';
  return 'ok';
};

const getDueStyles = (dueState: string) => {
  if (dueState === 'overdue') {
    return {
      cell: 'border-red-300 bg-red-50 text-red-900',
      dot: 'bg-red-600',
      badge: 'bg-red-600 text-white',
      rail: 'bg-red-600',
    };
  }

  if (dueState === 'due_soon') {
    return {
      cell: 'border-orange-300 bg-orange-50 text-orange-900',
      dot: 'bg-orange-500',
      badge: 'bg-orange-500 text-white',
      rail: 'bg-orange-500',
    };
  }

  return {
    cell: 'border-emerald-200 bg-emerald-50 text-emerald-900',
    dot: 'bg-emerald-500',
    badge: 'bg-emerald-100 text-emerald-700',
    rail: 'bg-emerald-500',
  };
};

const getDueText = (event: CalendarEvent) => {
  const dueState = getDueState(event);
  if (dueState === 'overdue') return `Vencida ${SHORT_DATE_LABEL.format(event.end)}`;
  if (dueState === 'due_soon') return `Por vencer ${SHORT_DATE_LABEL.format(event.end)}`;
  return `Cierre ${SHORT_DATE_LABEL.format(event.end)}`;
};

const getDateRangeLabel = (event: CalendarEvent) => {
  if (isMeetingTask(event.task)) return getMeetingScheduleLabel(event.task);
  if (sameDay(event.start, event.end)) return SHORT_DATE_LABEL.format(event.start);
  return `${SHORT_DATE_LABEL.format(event.start)} - ${SHORT_DATE_LABEL.format(event.end)}`;
};

const getCalendarWindow = (monthDate: Date) => {
  const visibleStart = startOfCalendarWeek(startOfMonth(monthDate));
  const visibleEnd = endOfCalendarWeek(endOfMonth(monthDate));
  const days: Date[] = [];
  let cursor = visibleStart;

  while (cursor.getTime() <= visibleEnd.getTime()) {
    days.push(cursor);
    cursor = addDays(cursor, 1);
  }

  return { visibleStart, visibleEnd, days };
};

const buildBaseEvent = (task: CalendarTask): CalendarEvent | null => {
  const taskIsWorkflow = isWorkflowTask(task);
  const taskIsMeeting = isMeetingTask(task);
  const currentStepIndex = task.currentStepIndex || 0;
  const currentStep = taskIsWorkflow ? task.workflowSteps?.[currentStepIndex] : null;

  const start =
    taskIsMeeting
      ? getMeetingStartDate(task)
      : taskIsWorkflow
        ? getWorkflowStepPlannedStart(task, currentStep)
        : getTaskStartDate(task);
  const end =
    taskIsMeeting
      ? getMeetingEndDate(task)
      : taskIsWorkflow
        ? getWorkflowStepPlannedEnd(task, currentStep)
        : getTaskEndDate(task);

  const normalizedStart = start || end;
  const normalizedEnd = end || start;
  if (!normalizedStart || !normalizedEnd) return null;

  const title = getTaskDisplayTitle(task, 'Tarea sin nombre');
  const stepLabel = currentStep?.label || currentStep?.name || (taskIsWorkflow ? `Paso ${currentStepIndex + 1}` : undefined);

  return {
    id: task.id,
    task,
    taskId: task.id,
    projectId: task.projectId,
    projectName: task.projectName || 'Proyecto',
    organizationName: task.organizationName || 'Sin organización',
    title,
    subtitle: taskIsWorkflow && stepLabel ? stepLabel : task.description || task.objective || 'Actividad asignada',
    type: taskIsMeeting ? 'meeting' : taskIsWorkflow ? 'workflow' : 'task',
    status: taskIsWorkflow ? currentStep?.status || 'pending' : task.status || 'todo',
    priority: task.priority || 'medium',
    start: normalizedStart,
    end: normalizedEnd,
    stepLabel,
    stepIndex: taskIsWorkflow ? currentStepIndex : undefined,
  };
};

const addRecurringInterval = (date: Date, frequency: string, interval: number) => {
  if (frequency === 'daily') return addDays(date, interval);
  if (frequency === 'weekly') return addDays(date, interval * 7);
  return new Date(date.getFullYear(), date.getMonth() + interval, date.getDate(), date.getHours(), date.getMinutes(), date.getSeconds(), date.getMilliseconds());
};

const expandRecurringMeeting = (event: CalendarEvent, visibleStart: Date, visibleEnd: Date) => {
  if (!isMeetingTask(event.task)) return [event];

  const frequency = getMeetingRecurrenceFrequency(event.task);
  if (frequency === 'none') return [event];

  const recurrence = event.task?.meeting?.recurrence || {};
  const interval = Math.max(1, Number(recurrence.interval || event.task?.meetingRecurrenceInterval || 1));
  const count = Math.max(0, Number(recurrence.count || event.task?.meetingRecurrenceCount || 0));
  const until =
    getTaskDateValue(recurrence.until || event.task?.meetingRecurrenceUntil) ||
    getTaskDateValue(event.task?.endDate || event.task?.end) ||
    visibleEnd;
  const duration = Math.max(30 * 60 * 1000, event.end.getTime() - event.start.getTime());
  const occurrences: CalendarEvent[] = [];
  let occurrenceStart = event.start;
  let occurrenceIndex = 0;

  while (occurrenceStart.getTime() <= visibleEnd.getTime() && occurrenceIndex < 370) {
    if (count > 0 && occurrenceIndex >= count) break;
    if (until && startOfDay(occurrenceStart).getTime() > endOfDay(until).getTime()) break;

    const occurrenceEnd = new Date(occurrenceStart.getTime() + duration);
    if (occurrenceEnd.getTime() >= visibleStart.getTime() && occurrenceStart.getTime() <= visibleEnd.getTime()) {
      occurrences.push({
        ...event,
        id: `${event.id}-occurrence-${occurrenceIndex}`,
        start: occurrenceStart,
        end: occurrenceEnd,
        occurrenceIndex,
      });
    }

    occurrenceStart = addRecurringInterval(occurrenceStart, frequency, interval);
    occurrenceIndex += 1;
  }

  return occurrences;
};

const eventIntersectsDay = (event: CalendarEvent, date: Date) =>
  event.start.getTime() <= endOfDay(date).getTime() && event.end.getTime() >= startOfDay(date).getTime();

const eventSort = (left: CalendarEvent, right: CalendarEvent) => {
  if (left.start.getTime() !== right.start.getTime()) return left.start.getTime() - right.start.getTime();
  return left.title.localeCompare(right.title);
};

const getTaskTypeLabel = (event: CalendarEvent) => {
  if (event.type === 'workflow') return 'Workflow';
  if (event.type === 'meeting') return 'Reunión';
  return event.task.parentTaskId ? 'Subtarea' : 'Tarea';
};

export default function InboxCalendar() {
  const { user, userRole, userOrganizationId, userOrganizationIds } = useAuth();
  const [loading, setLoading] = useState(true);
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [organizations, setOrganizations] = useState<any[]>([]);
  const [tasks, setTasks] = useState<CalendarTask[]>([]);
  const [monthDate, setMonthDate] = useState(() => startOfMonth(new Date()));
  const [selectedDate, setSelectedDate] = useState(() => startOfDay(new Date()));

  const managedOrganizationIds = useMemo(
    () => (userOrganizationIds.length > 0 ? userOrganizationIds : userOrganizationId ? [userOrganizationId] : []),
    [userOrganizationId, userOrganizationIds],
  );
  const calendarWindow = useMemo(() => getCalendarWindow(monthDate), [monthDate]);

  useEffect(() => {
    const unsubscribe = onSnapshot(query(collection(db, 'organizations')), (snapshot) => {
      setOrganizations(snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() })));
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadMemberIds = async () => {
      if (!user?.email) {
        setMemberIds([]);
        return;
      }

      const nextIds = normalizeIds([user.uid]);
      const teamQuery = query(collection(db, 'team_members'), where('email', '==', user.email));
      const teamSnapshot = await getDocs(teamQuery);
      teamSnapshot.docs.forEach((teamDoc) => nextIds.push(teamDoc.id));

      if (!cancelled) setMemberIds(normalizeIds(nextIds));
    };

    loadMemberIds().catch((error) => {
      console.error('Error loading calendar member ids:', error);
      if (!cancelled) setMemberIds(user?.uid ? [user.uid] : []);
    });

    return () => {
      cancelled = true;
    };
  }, [user?.email, user?.uid]);

  useEffect(() => {
    if (!user || memberIds.length === 0) {
      queueMicrotask(() => {
        setTasks([]);
        setLoading(false);
      });
      return;
    }

    queueMicrotask(() => setLoading(true));
    const projectTasks = new Map<string, CalendarTask[]>();
    let taskUnsubscribes: Array<() => void> = [];

    const unsubscribeProjects = onSnapshot(
      query(collection(db, 'projects')),
      (projectSnapshot) => {
        taskUnsubscribes.forEach((unsubscribe) => unsubscribe());
        taskUnsubscribes = [];
        projectTasks.clear();

        const projectDocs = projectSnapshot.docs
          .map((projectDoc) => ({ id: projectDoc.id, ...projectDoc.data() }))
          .filter((project) => {
            if (userRole !== 'org_admin') return true;
            return managedOrganizationIds.length === 0 || belongsToAnyOrganization(project, managedOrganizationIds);
          });

        if (projectDocs.length === 0) {
          setTasks([]);
          setLoading(false);
          return;
        }

        let loadedProjects = 0;
        projectDocs.forEach((project: any) => {
          const unsubscribeTasks = onSnapshot(
            query(collection(db, 'projects', project.id, 'tasks')),
            (taskSnapshot) => {
              const nextProjectTasks = taskSnapshot.docs
                .map((taskDoc) => ({
                  ...taskDoc.data(),
                  id: taskDoc.id,
                  projectId: project.id,
                  projectName: project.name || 'Proyecto',
                  organizationId: project.organizationId || null,
                  organizationName: organizationNameFor(project, organizations),
                }))
                .filter((task) => isCalendarTaskForUser(task as CalendarTask, memberIds));

              projectTasks.set(project.id, nextProjectTasks as CalendarTask[]);
              setTasks(Array.from(projectTasks.values()).flat());
              loadedProjects += 1;
              if (loadedProjects >= projectDocs.length) setLoading(false);
            },
            (error) => {
              console.error(`Error loading calendar tasks for ${project.id}:`, error);
              loadedProjects += 1;
              if (loadedProjects >= projectDocs.length) setLoading(false);
            },
          );

          taskUnsubscribes.push(unsubscribeTasks);
        });
      },
      (error) => {
        console.error('Error loading calendar projects:', error);
        setTasks([]);
        setLoading(false);
      },
    );

    return () => {
      unsubscribeProjects();
      taskUnsubscribes.forEach((unsubscribe) => unsubscribe());
    };
  }, [managedOrganizationIds, memberIds, organizations, user, userRole]);

  const events = useMemo(() => {
    return tasks
      .map(buildBaseEvent)
      .filter((event): event is CalendarEvent => Boolean(event))
      .flatMap((event) => expandRecurringMeeting(event, calendarWindow.visibleStart, calendarWindow.visibleEnd))
      .filter((event) => event.end.getTime() >= calendarWindow.visibleStart.getTime() && event.start.getTime() <= calendarWindow.visibleEnd.getTime())
      .sort(eventSort);
  }, [calendarWindow.visibleEnd, calendarWindow.visibleStart, tasks]);

  const eventsByDay = useMemo(() => {
    const next = new Map<string, CalendarEvent[]>();
    calendarWindow.days.forEach((day) => {
      const key = day.toISOString().slice(0, 10);
      next.set(key, events.filter((event) => eventIntersectsDay(event, day)).sort(eventSort));
    });
    return next;
  }, [calendarWindow.days, events]);

  const selectedEvents = useMemo(
    () => events.filter((event) => eventIntersectsDay(event, selectedDate)).sort(eventSort),
    [events, selectedDate],
  );

  const noDateCount = useMemo(() => tasks.filter((task) => !buildBaseEvent(task)).length, [tasks]);
  const todayEventsCount = useMemo(() => events.filter((event) => eventIntersectsDay(event, new Date())).length, [events]);
  const overdueEventsCount = useMemo(() => events.filter((event) => getDueState(event) === 'overdue').length, [events]);
  const upcomingEventsCount = useMemo(() => {
    const today = startOfDay(new Date());
    const nextWeek = endOfDay(addDays(today, 7));
    return events.filter((event) => event.start.getTime() <= nextWeek.getTime() && event.end.getTime() >= today.getTime()).length;
  }, [events]);

  const moveMonth = (amount: number) => {
    const nextMonth = addMonths(monthDate, amount);
    setMonthDate(nextMonth);
    setSelectedDate((current) => (isSameMonth(current, nextMonth) ? current : startOfMonth(nextMonth)));
  };

  const goToToday = () => {
    const today = startOfDay(new Date());
    setMonthDate(startOfMonth(today));
    setSelectedDate(today);
  };

  if (loading) {
    return (
      <div className="flex min-h-[320px] items-center justify-center rounded-2xl border border-slate-200 bg-white shadow-sm">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 bg-[radial-gradient(circle_at_top_left,_rgba(79,70,229,0.12),_transparent_28%),linear-gradient(135deg,_#ffffff,_#f8fafc)] p-4">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div className="min-w-0">
              <div className="inline-flex items-center gap-2 rounded-full bg-indigo-50 px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] text-indigo-700">
                <Sparkles size={13} />
                Agenda personal
              </div>
              <h2 className="mt-2 flex items-center gap-2 text-xl font-black text-slate-950">
                <CalendarDays className="text-indigo-600" size={22} />
                Calendario
              </h2>
              <p className="mt-1 max-w-2xl text-sm font-medium text-slate-500">
                Vista diaria de tus tareas activas, workflows en curso y reuniones programadas.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={goToToday}
                className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700 shadow-sm transition-colors hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700"
              >
                Hoy
              </button>
              <div className="flex items-center overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
                <button
                  type="button"
                  onClick={() => moveMonth(-1)}
                  className="grid h-9 w-9 place-items-center text-slate-500 transition-colors hover:bg-slate-50 hover:text-indigo-700"
                  aria-label="Mes anterior"
                >
                  <ChevronLeft size={17} />
                </button>
                <div className="min-w-[180px] px-3 text-center text-sm font-black capitalize text-slate-900">
                  {MONTH_LABEL.format(monthDate)}
                </div>
                <button
                  type="button"
                  onClick={() => moveMonth(1)}
                  className="grid h-9 w-9 place-items-center text-slate-500 transition-colors hover:bg-slate-50 hover:text-indigo-700"
                  aria-label="Mes siguiente"
                >
                  <ChevronRight size={17} />
                </button>
              </div>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2 lg:grid-cols-4">
            <div className="rounded-xl border border-indigo-100 bg-white/90 p-3">
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Asignadas</p>
              <p className="mt-1 text-2xl font-black text-slate-950">{tasks.length}</p>
            </div>
            <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-3">
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-emerald-600">Hoy</p>
              <p className="mt-1 text-2xl font-black text-emerald-700">{todayEventsCount}</p>
            </div>
            <div className="rounded-xl border border-orange-100 bg-orange-50 p-3">
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-orange-600">Próximas</p>
              <p className="mt-1 text-2xl font-black text-orange-700">{upcomingEventsCount}</p>
            </div>
            <div className="rounded-xl border border-red-100 bg-red-50 p-3">
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-red-600">Vencidas</p>
              <p className="mt-1 text-2xl font-black text-red-700">{overdueEventsCount}</p>
            </div>
          </div>
        </div>

        <div className="grid gap-0 xl:grid-cols-[minmax(0,1fr)_380px]">
          <div className="min-w-0 border-b border-slate-100 xl:border-b-0 xl:border-r">
            <div className="grid grid-cols-7 border-b border-slate-100 bg-slate-50">
              {['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map((day) => (
                <div key={day} className="px-2 py-2 text-center text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">
                  {day}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7 bg-slate-100 gap-px">
              {calendarWindow.days.map((day) => {
                const key = day.toISOString().slice(0, 10);
                const dayEvents = eventsByDay.get(key) || [];
                const isSelected = sameDay(day, selectedDate);
                const isToday = sameDay(day, new Date());

                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => {
                      setSelectedDate(day);
                      if (!isSameMonth(day, monthDate)) setMonthDate(startOfMonth(day));
                    }}
                    className={`min-h-[96px] min-w-0 bg-white p-2 text-left transition-all md:min-h-[126px] ${
                      isSelected ? 'relative z-[1] ring-2 ring-inset ring-indigo-500' : 'hover:bg-indigo-50/40'
                    } ${!isSameMonth(day, monthDate) ? 'bg-slate-50 text-slate-300' : ''}`}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span
                        className={`grid h-6 w-6 place-items-center rounded-full text-xs font-black ${
                          isToday ? 'bg-indigo-600 text-white' : isSelected ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600'
                        }`}
                      >
                        {day.getDate()}
                      </span>
                      {dayEvents.length > 0 && (
                        <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-black text-slate-500">
                          {dayEvents.length}
                        </span>
                      )}
                    </div>

                    <div className="mt-2 space-y-1">
                      {dayEvents.slice(0, 3).map((event) => {
                        const dueStyles = getDueStyles(getDueState(event));
                        return (
                          <div
                            key={event.id}
                            className={`min-w-0 rounded-md border px-1.5 py-1 ${dueStyles.cell}`}
                            title={`${event.title} · ${event.projectName}`}
                          >
                            <div className="flex min-w-0 items-center gap-1">
                              <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${dueStyles.dot}`} />
                              <span className="truncate text-[10px] font-black leading-none">
                                {event.title}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                      {dayEvents.length > 3 && (
                        <div className="rounded-md bg-slate-100 px-1.5 py-1 text-[10px] font-black text-slate-500">
                          +{dayEvents.length - 3} más
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <aside className="min-w-0 bg-white">
            <div className="border-b border-slate-100 p-4">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-600">Agenda del día</p>
              <h3 className="mt-1 text-lg font-black capitalize text-slate-950">{DAY_LABEL.format(selectedDate)}</h3>
              <p className="mt-1 text-xs font-semibold text-slate-500">
                {selectedEvents.length} actividad{selectedEvents.length === 1 ? '' : 'es'} programada{selectedEvents.length === 1 ? '' : 's'}
                {noDateCount > 0 ? ` · ${noDateCount} sin fecha` : ''}
              </p>
            </div>

            <div className="max-h-[740px] space-y-3 overflow-y-auto p-4">
              {selectedEvents.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center">
                  <CalendarDays className="mx-auto mb-3 h-9 w-9 text-slate-300" />
                  <p className="text-sm font-black text-slate-800">Día despejado</p>
                  <p className="mt-1 text-xs font-medium text-slate-500">No tienes tareas activas programadas para esta fecha.</p>
                </div>
              ) : (
                selectedEvents.map((event) => {
                  const dueState = getDueState(event);
                  const dueStyles = getDueStyles(dueState);
                  const googleCalendarUrl = event.type === 'meeting' ? createGoogleCalendarUrl(event.task) : '';

                  return (
                    <article key={event.id} className={`relative overflow-hidden rounded-2xl border bg-white p-4 shadow-sm ${dueStyles.cell}`}>
                      <div className={`absolute inset-y-0 left-0 w-1 ${dueStyles.rail}`} />
                      <div className="min-w-0 pl-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-md bg-white/80 px-2 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-indigo-700">
                            {getTaskTypeLabel(event)}
                          </span>
                          <span className={`rounded-md px-2 py-1 text-[10px] font-black uppercase tracking-[0.08em] ${dueStyles.badge}`}>
                            {getDueText(event)}
                          </span>
                          {event.priority === 'high' && (
                            <span className="rounded-md bg-red-600 px-2 py-1 text-[10px] font-black uppercase tracking-[0.08em] text-white">
                              Alta
                            </span>
                          )}
                        </div>

                        <h4 className="mt-3 min-w-0 text-base font-black leading-tight text-slate-950">
                          {event.title}
                        </h4>
                        <p className="mt-1 min-w-0 text-xs font-bold text-slate-600">
                          {event.subtitle}
                        </p>

                        <div className="mt-3 grid gap-2 text-xs font-semibold text-slate-600">
                          <div className="flex min-w-0 items-center gap-2">
                            <Briefcase size={14} className="shrink-0 text-slate-400" />
                            <span className="truncate">{event.organizationName} · {event.projectName}</span>
                          </div>
                          <div className="flex min-w-0 items-center gap-2">
                            <Clock size={14} className="shrink-0 text-slate-400" />
                            <span className="truncate">{getDateRangeLabel(event)}</span>
                          </div>
                          {event.task.workflowMunicipality || event.task.municipality ? (
                            <div className="flex min-w-0 items-center gap-2">
                              <MapPin size={14} className="shrink-0 text-slate-400" />
                              <span className="truncate">{event.task.workflowMunicipality || event.task.municipality}</span>
                            </div>
                          ) : null}
                        </div>

                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          <span className="rounded-lg bg-white/80 px-2.5 py-1 text-xs font-black text-slate-700">
                            {getStatusLabel(event.task, event.status)}
                          </span>
                          <span className="rounded-lg bg-white/80 px-2.5 py-1 text-xs font-black text-slate-700">
                            Prioridad {getPriorityLabel(event.priority)}
                          </span>
                        </div>

                        <div className="mt-4 flex flex-wrap items-center gap-2">
                          <Link
                            href={`/projects/${event.projectId}`}
                            className="inline-flex h-9 items-center gap-2 rounded-lg bg-indigo-600 px-3 text-xs font-black text-white shadow-sm transition-colors hover:bg-indigo-700"
                          >
                            Abrir proyecto
                            <ArrowRight size={14} />
                          </Link>
                          {googleCalendarUrl && (
                            <a
                              href={googleCalendarUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-black text-slate-700 transition-colors hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700"
                            >
                              <Video size={14} />
                              Google
                              <ExternalLink size={12} />
                            </a>
                          )}
                        </div>
                      </div>
                    </article>
                  );
                })
              )}

              {overdueEventsCount > 0 && (
                <div className="rounded-2xl border border-red-100 bg-red-50 p-4">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
                    <div>
                      <p className="text-sm font-black text-red-900">Hay tareas vencidas en tu agenda.</p>
                      <p className="mt-1 text-xs font-semibold text-red-700">Las tarjetas rojas priorizan lo que necesita atención inmediata.</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </aside>
        </div>
      </section>
    </div>
  );
}
