"use client";

import React from "react";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  Clock3,
  ListChecks,
  Search,
  Target,
  X,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Button } from "@/components/ui/button";
import { isCompletedTaskStatus } from "@/lib/taskProgress";

type TaskStatusReportModalProps = {
  isOpen: boolean;
  onClose: () => void;
  tasks: any[];
  taskGroups?: any[];
};

const STATUS_COLORS = {
  notStarted: "#94a3b8",
  inProgress: "#f59e0b",
  finished: "#10b981",
  overdue: "#dc2626",
  dueSoon: "#f97316",
  ok: "#14b8a6",
  noDate: "#cbd5e1",
  high: "#e2445c",
  medium: "#5559df",
  low: "#94a3b8",
};

const getTaskTitle = (task: any) => task?.title || task?.name || "Tarea sin nombre";

const getTaskDate = (value: any) => {
  if (!value) return null;
  if (value.toDate) return value.toDate();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const getTaskTimestamp = (value: any) => {
  const date = getTaskDate(value);
  return date ? date.getTime() : 0;
};

const getStatusBucket = (task: any) => {
  const status = task?.status || "todo";
  if (isCompletedTaskStatus(status)) return "finished";
  if (status === "todo" || status === "pending" || status === "not_started") return "notStarted";
  return "inProgress";
};

const getScheduleState = (task: any) => {
  const status = task?.status || "todo";
  if (status === "completed_late") return "completedLate";
  if (isCompletedTaskStatus(status)) return "done";

  const endDate = getTaskDate(task?.endDate || task?.end);
  if (!endDate) return "noDate";

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const endOfDay = new Date(endDate);
  endOfDay.setHours(23, 59, 59, 999);

  if (endOfDay.getTime() < today.getTime()) return "overdue";
  return endOfDay.getTime() - Date.now() <= 2 * 24 * 60 * 60 * 1000 ? "dueSoon" : "ok";
};

const getPercent = (value: number, total: number) => {
  if (!total) return 0;
  return Math.round((value / total) * 100);
};

const getProgressAverage = (tasks: any[]) => {
  if (tasks.length === 0) return 0;
  const total = tasks.reduce((sum, task) => sum + Number(task.progress || 0), 0);
  return Math.round(total / tasks.length);
};

const getTaskOrder = (task: any) => {
  if (typeof task?.displayOrder === "number") return task.displayOrder;
  return getTaskTimestamp(task?.createdAt || task?.updatedAt);
};

export function TaskStatusReportModal({
  isOpen,
  onClose,
  tasks,
  taskGroups = [],
}: TaskStatusReportModalProps) {
  const [selectedRootIds, setSelectedRootIds] = React.useState<string[]>([]);
  const [searchTerm, setSearchTerm] = React.useState("");

  const groupById = React.useMemo(
    () => new Map(taskGroups.map((group) => [group.id, group])),
    [taskGroups]
  );

  const rootTasks = React.useMemo(
    () =>
      tasks
        .filter((task) => !task.parentTaskId)
        .sort((left, right) => getTaskOrder(left) - getTaskOrder(right)),
    [tasks]
  );

  const childrenByParent = React.useMemo(() => {
    const map = new Map<string, any[]>();
    tasks.forEach((task) => {
      if (!task.parentTaskId) return;
      const current = map.get(task.parentTaskId) || [];
      current.push(task);
      map.set(task.parentTaskId, current);
    });

    map.forEach((children) => {
      children.sort((left, right) => getTaskOrder(left) - getTaskOrder(right));
    });

    return map;
  }, [tasks]);

  const collectTaskTree = React.useCallback(
    (rootId: string) => {
      const result: any[] = [];
      const pending = [rootId];
      const visited = new Set<string>();
      const tasksById = new Map(tasks.map((task) => [task.id, task]));

      while (pending.length > 0) {
        const currentId = pending.shift();
        if (!currentId || visited.has(currentId)) continue;

        const task = tasksById.get(currentId);
        if (!task) continue;

        visited.add(currentId);
        result.push(task);
        (childrenByParent.get(currentId) || []).forEach((child) => pending.push(child.id));
      }

      return result;
    },
    [childrenByParent, tasks]
  );

  React.useEffect(() => {
    if (!isOpen) return;
    setSelectedRootIds(rootTasks.map((task) => task.id));
    setSearchTerm("");
  }, [isOpen, rootTasks]);

  if (!isOpen) return null;

  const visibleRootTasks = rootTasks.filter((task) => {
    const query = searchTerm.trim().toLowerCase();
    if (!query) return true;
    const groupName = groupById.get(task.groupId)?.name || "";
    return `${getTaskTitle(task)} ${task.description || ""} ${groupName}`.toLowerCase().includes(query);
  });

  const selectedRootTasks = rootTasks.filter((task) => selectedRootIds.includes(task.id));
  const scopedTasks = selectedRootTasks.flatMap((task) => collectTaskTree(task.id));
  const uniqueScopedTasks = Array.from(new Map(scopedTasks.map((task) => [task.id, task])).values());

  const statusCounts = uniqueScopedTasks.reduce(
    (acc, task) => {
      acc[getStatusBucket(task)] += 1;
      return acc;
    },
    { notStarted: 0, inProgress: 0, finished: 0 }
  );

  const scheduleCounts = uniqueScopedTasks.reduce(
    (acc, task) => {
      const state = getScheduleState(task);
      if (state === "overdue") acc.overdue += 1;
      if (state === "dueSoon") acc.dueSoon += 1;
      if (state === "ok" || state === "done") acc.ok += 1;
      if (state === "completedLate") acc.completedLate += 1;
      if (state === "noDate") acc.noDate += 1;
      return acc;
    },
    { overdue: 0, dueSoon: 0, ok: 0, completedLate: 0, noDate: 0 }
  );

  const priorityCounts = uniqueScopedTasks.reduce(
    (acc, task) => {
      const priority = task.priority || "medium";
      if (priority === "high") acc.high += 1;
      else if (priority === "low") acc.low += 1;
      else acc.medium += 1;
      return acc;
    },
    { high: 0, medium: 0, low: 0 }
  );

  const attentionCount = uniqueScopedTasks.filter((task) =>
    ["stuck", "detenido", "devuelto", "reproceso"].includes(task.status || "")
  ).length;
  const highPriorityOpenCount = uniqueScopedTasks.filter(
    (task) => (task.priority || "medium") === "high" && !isCompletedTaskStatus(task.status)
  ).length;
  const totalTasks = uniqueScopedTasks.length;
  const completionRate = getPercent(statusCounts.finished, totalTasks);
  const averageProgress = getProgressAverage(uniqueScopedTasks);
  const workflowStepCount = uniqueScopedTasks.reduce(
    (sum, task) => sum + (Array.isArray(task.workflowSteps) ? task.workflowSteps.length : 0),
    0
  );

  const statusData = [
    { name: "No iniciadas", value: statusCounts.notStarted, color: STATUS_COLORS.notStarted },
    { name: "Iniciadas", value: statusCounts.inProgress, color: STATUS_COLORS.inProgress },
    { name: "Finalizadas", value: statusCounts.finished, color: STATUS_COLORS.finished },
  ];

  const scheduleData = [
    { name: "Atrasadas", value: scheduleCounts.overdue, color: STATUS_COLORS.overdue },
    { name: "Por vencer", value: scheduleCounts.dueSoon, color: STATUS_COLORS.dueSoon },
    { name: "En fecha", value: scheduleCounts.ok, color: STATUS_COLORS.ok },
    { name: "Con retraso", value: scheduleCounts.completedLate, color: "#ea580c" },
    { name: "Sin fecha", value: scheduleCounts.noDate, color: STATUS_COLORS.noDate },
  ].filter((item) => item.value > 0);

  const priorityData = [
    { name: "Alta", value: priorityCounts.high, color: STATUS_COLORS.high },
    { name: "Media", value: priorityCounts.medium, color: STATUS_COLORS.medium },
    { name: "Baja", value: priorityCounts.low, color: STATUS_COLORS.low },
  ];

  const breakdown = selectedRootTasks.map((rootTask) => {
    const scope = collectTaskTree(rootTask.id);
    const total = scope.length;
    const finished = scope.filter((task) => isCompletedTaskStatus(task.status)).length;
    const inProgress = scope.filter((task) => getStatusBucket(task) === "inProgress").length;
    const notStarted = scope.filter((task) => getStatusBucket(task) === "notStarted").length;
    const overdue = scope.filter((task) => getScheduleState(task) === "overdue").length;
    const dueSoon = scope.filter((task) => getScheduleState(task) === "dueSoon").length;

    return {
      id: rootTask.id,
      title: getTaskTitle(rootTask),
      groupName: groupById.get(rootTask.groupId)?.name || "Sin grupo",
      total,
      notStarted,
      inProgress,
      finished,
      overdue,
      dueSoon,
      progress: getProgressAverage(scope),
      completion: getPercent(finished, total),
    };
  });

  const toggleRootTask = (taskId: string) => {
    setSelectedRootIds((current) =>
      current.includes(taskId)
        ? current.filter((id) => id !== taskId)
        : [...current, taskId]
    );
  };

  const allVisibleSelected =
    visibleRootTasks.length > 0 && visibleRootTasks.every((task) => selectedRootIds.includes(task.id));

  const toggleVisibleTasks = () => {
    if (allVisibleSelected) {
      const visibleIds = new Set(visibleRootTasks.map((task) => task.id));
      setSelectedRootIds((current) => current.filter((id) => !visibleIds.has(id)));
      return;
    }

    setSelectedRootIds((current) => Array.from(new Set([...current, ...visibleRootTasks.map((task) => task.id)])));
  };

  const kpis = [
    {
      label: "Tareas analizadas",
      value: totalTasks,
      detail: `${selectedRootTasks.length} matriz`,
      icon: ListChecks,
      tone: "bg-indigo-50 text-indigo-700",
    },
    {
      label: "Finalización",
      value: `${completionRate}%`,
      detail: `${statusCounts.finished} finalizadas`,
      icon: CheckCircle2,
      tone: "bg-emerald-50 text-emerald-700",
    },
    {
      label: "Avance promedio",
      value: `${averageProgress}%`,
      detail: `${workflowStepCount} pasos de workflow`,
      icon: Activity,
      tone: "bg-sky-50 text-sky-700",
    },
    {
      label: "No iniciadas",
      value: statusCounts.notStarted,
      detail: `${getPercent(statusCounts.notStarted, totalTasks)}% del alcance`,
      icon: Clock3,
      tone: "bg-slate-100 text-slate-700",
    },
    {
      label: "Alta prioridad abiertas",
      value: highPriorityOpenCount,
      detail: `${priorityCounts.high} alta prioridad`,
      icon: Target,
      tone: "bg-red-50 text-red-700",
    },
    {
      label: "Alertas",
      value: scheduleCounts.overdue + scheduleCounts.dueSoon + attentionCount,
      detail: `${scheduleCounts.overdue} vencidas · ${attentionCount} atención`,
      icon: AlertTriangle,
      tone: "bg-orange-50 text-orange-700",
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm">
      <div className="flex max-h-[92vh] w-full max-w-7xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-indigo-600" />
              <h2 className="truncate text-xl font-black text-slate-900">Indicadores de tareas</h2>
            </div>
            <p className="mt-1 text-sm text-slate-500">
              Estado, avance y vencimientos del alcance seleccionado.
            </p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Cerrar reporte">
            <X className="h-5 w-5" />
          </Button>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden lg:grid-cols-[320px_minmax(0,1fr)]">
          <aside className="min-h-0 border-b border-slate-100 bg-slate-50/70 p-4 lg:border-b-0 lg:border-r">
            <div className="mb-3 flex items-center justify-between gap-2">
              <div>
                <p className="text-sm font-black text-slate-900">Tareas matriz</p>
                <p className="text-xs text-slate-500">{selectedRootIds.length} seleccionadas</p>
              </div>
              <button
                type="button"
                onClick={toggleVisibleTasks}
                className="rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-600 transition-colors hover:border-indigo-200 hover:text-indigo-700"
              >
                {allVisibleSelected ? "Quitar visibles" : "Marcar visibles"}
              </button>
            </div>

            <div className="relative mb-3">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Buscar tarea..."
                className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-indigo-500/20"
              />
            </div>

            <div className="max-h-[58vh] space-y-2 overflow-y-auto pr-1">
              {visibleRootTasks.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-200 bg-white p-5 text-center text-sm font-semibold text-slate-500">
                  No hay tareas para mostrar.
                </div>
              ) : (
                visibleRootTasks.map((task) => {
                  const selected = selectedRootIds.includes(task.id);
                  const childCount = collectTaskTree(task.id).length - 1;
                  const group = groupById.get(task.groupId);

                  return (
                    <label
                      key={task.id}
                      className={`flex cursor-pointer gap-3 rounded-xl border p-3 transition-colors ${
                        selected
                          ? "border-indigo-200 bg-white shadow-sm"
                          : "border-slate-200 bg-white/70 hover:bg-white"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={() => toggleRootTask(task.id)}
                        className="mt-1 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-bold text-slate-800">{getTaskTitle(task)}</span>
                        <span className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                          {group && (
                            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-500">{group.name}</span>
                          )}
                          <span>{childCount} dependientes</span>
                        </span>
                      </span>
                    </label>
                  );
                })
              )}
            </div>
          </aside>

          <section className="min-h-0 overflow-y-auto bg-slate-50 p-4">
            {totalTasks === 0 ? (
              <div className="flex min-h-[420px] flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white text-center">
                <BarChart3 className="mb-3 h-10 w-10 text-slate-300" />
                <p className="text-base font-bold text-slate-700">Selecciona al menos una tarea matriz.</p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {kpis.map((kpi) => {
                    const Icon = kpi.icon;

                    return (
                      <div key={kpi.label} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-xs font-bold uppercase tracking-wider text-slate-400">{kpi.label}</p>
                            <p className="mt-2 text-2xl font-black text-slate-900">{kpi.value}</p>
                            <p className="mt-1 text-xs font-medium text-slate-500">{kpi.detail}</p>
                          </div>
                          <span className={`rounded-xl p-2 ${kpi.tone}`}>
                            <Icon className="h-5 w-5" />
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="grid gap-4 xl:grid-cols-[1fr_0.95fr]">
                  <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                    <div className="mb-3 flex items-center justify-between">
                      <h3 className="text-sm font-black text-slate-900">Estados principales</h3>
                      <span className="text-xs font-bold text-slate-400">{totalTasks} tareas</span>
                    </div>
                    <div className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={statusData}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} />
                          <XAxis dataKey="name" tickLine={false} axisLine={false} fontSize={12} />
                          <YAxis allowDecimals={false} tickLine={false} axisLine={false} fontSize={12} />
                          <Tooltip cursor={{ fill: "#f8fafc" }} />
                          <Bar dataKey="value" radius={[8, 8, 0, 0]}>
                            {statusData.map((entry) => (
                              <Cell key={entry.name} fill={entry.color} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                    <div className="mb-3 flex items-center justify-between">
                      <h3 className="text-sm font-black text-slate-900">Cronograma</h3>
                      <span className="text-xs font-bold text-slate-400">vencimientos</span>
                    </div>
                    <div className="h-64">
                      {scheduleData.length === 0 ? (
                        <div className="flex h-full items-center justify-center text-sm font-semibold text-slate-400">
                          Sin datos de cronograma.
                        </div>
                      ) : (
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie data={scheduleData} dataKey="value" nameKey="name" innerRadius={58} outerRadius={86} paddingAngle={3}>
                              {scheduleData.map((entry) => (
                                <Cell key={entry.name} fill={entry.color} />
                              ))}
                            </Pie>
                            <Tooltip />
                            <Legend verticalAlign="bottom" height={34} iconType="circle" />
                          </PieChart>
                        </ResponsiveContainer>
                      )}
                    </div>
                  </div>
                </div>

                <div className="grid gap-4 xl:grid-cols-[0.8fr_1.2fr]">
                  <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                    <h3 className="mb-3 text-sm font-black text-slate-900">Prioridad</h3>
                    <div className="space-y-3">
                      {priorityData.map((item) => (
                        <div key={item.name}>
                          <div className="mb-1 flex items-center justify-between text-xs font-bold text-slate-600">
                            <span>{item.name}</span>
                            <span>{item.value}</span>
                          </div>
                          <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                            <div
                              className="h-full rounded-full"
                              style={{
                                width: `${getPercent(item.value, totalTasks)}%`,
                                backgroundColor: item.color,
                              }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                    <h3 className="mb-3 text-sm font-black text-slate-900">Desglose por tarea matriz</h3>
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[680px] text-left text-xs">
                        <thead>
                          <tr className="border-b border-slate-100 text-[10px] uppercase tracking-wider text-slate-400">
                            <th className="py-2 pr-3">Tarea</th>
                            <th className="px-3 py-2 text-right">Total</th>
                            <th className="px-3 py-2 text-right">No iniciadas</th>
                            <th className="px-3 py-2 text-right">Iniciadas</th>
                            <th className="px-3 py-2 text-right">Finalizadas</th>
                            <th className="px-3 py-2 text-right">Alertas</th>
                            <th className="px-3 py-2 text-right">Avance</th>
                          </tr>
                        </thead>
                        <tbody>
                          {breakdown.map((row) => (
                            <tr key={row.id} className="border-b border-slate-50 last:border-0">
                              <td className="max-w-[260px] py-2 pr-3">
                                <p className="truncate font-bold text-slate-800">{row.title}</p>
                                <p className="truncate text-[10px] font-medium text-slate-400">{row.groupName}</p>
                              </td>
                              <td className="px-3 py-2 text-right font-bold text-slate-700">{row.total}</td>
                              <td className="px-3 py-2 text-right text-slate-600">{row.notStarted}</td>
                              <td className="px-3 py-2 text-right text-amber-600">{row.inProgress}</td>
                              <td className="px-3 py-2 text-right text-emerald-600">{row.finished}</td>
                              <td className="px-3 py-2 text-right text-red-600">{row.overdue + row.dueSoon}</td>
                              <td className="px-3 py-2 text-right">
                                <span className="font-black text-slate-800">{row.progress}%</span>
                                <span className="ml-1 text-slate-400">({row.completion}% fin.)</span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
