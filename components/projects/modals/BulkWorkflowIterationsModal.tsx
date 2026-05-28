import React, { useEffect, useMemo, useState } from "react";
import { ClipboardList, Hash, Loader2, MessageSquare, Play, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { collection, doc, serverTimestamp, writeBatch } from "@/lib/supabase/document-store";
import { db } from "@/lib/backend";
import { toast } from "sonner";

type BulkWorkflowIterationsModalProps = {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  task: any;
  user: any;
  teamMembers: any[];
  tasks: any[];
};

type ParsedIteration = {
  lineNumber: number;
  raw: string;
  externalWorkflowId: string;
  observation: string;
  error?: string;
};

const foldText = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

const getTaskTitle = (task: any) => task?.title || task?.name || "Workflow";

const getTaskDate = (value: any) => {
  if (!value) return null;
  if (value.toDate) return value.toDate();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const toDateInputValue = (value: any) => {
  const date = getTaskDate(value) || new Date();
  return date.toISOString().slice(0, 10);
};

const endOfDate = (date: Date) => {
  const next = new Date(date);
  next.setHours(23, 59, 59, 999);
  return next;
};

const stripWorkflowStepRuntime = (step: any = {}) => {
  const nextStep = { ...step };
  [
    "status",
    "completed",
    "completedAt",
    "completedBy",
    "startedAt",
    "startedBy",
    "formData",
    "returnedAt",
    "returnedBy",
    "stoppedAt",
    "stoppedBy",
    "resumedAt",
    "resumedBy",
  ].forEach((key) => {
    delete nextStep[key];
  });
  return nextStep;
};

const parseIterationLine = (rawLine: string, lineNumber: number): ParsedIteration | null => {
  const raw = rawLine.trim();
  if (!raw) return null;

  const normalized = foldText(raw);
  if (
    lineNumber === 1 &&
    (normalized === "id,observacion" ||
      normalized === "id;observacion" ||
      normalized === "id\tobservacion" ||
      (normalized.includes("id") && normalized.includes("observ")))
  ) {
    return null;
  }

  const separators = ["\t", ";", "|", ","];
  const separator = separators.find((candidate) => raw.includes(candidate)) || "";
  const separatorIndex = separator ? raw.indexOf(separator) : -1;

  const externalWorkflowId =
    separatorIndex >= 0 ? raw.slice(0, separatorIndex).trim() : raw.trim();
  const observation =
    separatorIndex >= 0 ? raw.slice(separatorIndex + separator.length).trim() : "";

  return {
    lineNumber,
    raw,
    externalWorkflowId,
    observation,
    error: externalWorkflowId ? undefined : "Falta el ID",
  };
};

const parseIterations = (value: string, existingIds: Set<string>) => {
  const seenIds = new Set<string>();

  return value
    .split(/\r?\n/)
    .map((line, index) => parseIterationLine(line, index + 1))
    .filter((item): item is ParsedIteration => Boolean(item))
    .map((item) => {
      const normalizedId = foldText(item.externalWorkflowId);
      if (!normalizedId) return item;

      if (seenIds.has(normalizedId)) {
        return { ...item, error: "ID duplicado en el lote" };
      }

      seenIds.add(normalizedId);

      if (existingIds.has(normalizedId)) {
        return { ...item, error: "Ya existe en este flujo" };
      }

      return item;
    });
};

const getExistingWorkflowIdsForTask = (tasks: any[], task: any) =>
  new Set(
    tasks
      .filter((candidate) => candidate.parentTaskId === task?.id)
      .map((candidate) => candidate.externalWorkflowId || candidate.title || candidate.name || "")
      .filter(Boolean)
      .map((value) => foldText(String(value)))
  );

export function BulkWorkflowIterationsModal({
  isOpen,
  onClose,
  projectId,
  task,
  user,
  teamMembers,
  tasks,
}: BulkWorkflowIterationsModalProps) {
  const [rawItems, setRawItems] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [firstStepAssignee, setFirstStepAssignee] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    if (!isOpen || !task) return;

    setRawItems("");
    setStartDate(toDateInputValue(task.startDate || task.start));
    setEndDate(toDateInputValue(task.endDate || task.end));
    setFirstStepAssignee("");
  }, [isOpen, task]);

  const firstStepIsDynamic = task?.workflowSteps?.[0]?.assignedTo === "DYNAMIC";
  const parentStartDate = getTaskDate(task?.startDate || task?.start);
  const parentEndDate = getTaskDate(task?.endDate || task?.end);
  const parentStartValue = parentStartDate ? parentStartDate.toISOString().slice(0, 10) : "";
  const parentEndValue = parentEndDate ? parentEndDate.toISOString().slice(0, 10) : "";
  const existingIds = useMemo(() => getExistingWorkflowIdsForTask(tasks, task), [tasks, task]);
  const parsedIterations = useMemo(() => parseIterations(rawItems, existingIds), [rawItems, existingIds]);
  const validIterations = parsedIterations.filter((item) => !item.error);
  const invalidIterations = parsedIterations.filter((item) => item.error);
  const childTaskCount = useMemo(
    () => tasks.filter((candidate) => candidate.parentTaskId === task?.id).length,
    [task?.id, tasks]
  );

  if (!isOpen || !task) return null;

  const handleClose = () => {
    if (isCreating) return;
    onClose();
  };

  const handleCreateIterations = async () => {
    if (!user?.uid) {
      toast.error("No encontramos la sesión activa.");
      return;
    }

    if (task?.type !== "workflow" || !Array.isArray(task.workflowSteps) || task.workflowSteps.length === 0) {
      toast.warning("Selecciona un workflow con pasos definidos.");
      return;
    }

    if (validIterations.length === 0) {
      toast.warning("Agrega al menos un ID válido para crear iteraciones.");
      return;
    }

    if (invalidIterations.length > 0) {
      toast.warning("Corrige los IDs duplicados o existentes antes de crear las iteraciones.");
      return;
    }

    if (firstStepIsDynamic && !firstStepAssignee) {
      toast.warning("Selecciona el responsable del primer paso para iniciar el lote.");
      return;
    }

    const parsedStartDate = new Date(`${startDate}T00:00:00`);
    const parsedEndDate = new Date(`${endDate}T00:00:00`);
    if (Number.isNaN(parsedStartDate.getTime()) || Number.isNaN(parsedEndDate.getTime())) {
      toast.warning("Define fechas válidas para las iteraciones.");
      return;
    }

    if (parsedStartDate.getTime() > parsedEndDate.getTime()) {
      toast.warning("La fecha de inicio no puede ser posterior a la fecha fin.");
      return;
    }

    if (parentStartDate && parsedStartDate.getTime() < parentStartDate.getTime()) {
      toast.warning("Las iteraciones no pueden iniciar antes que la tarea principal.");
      return;
    }

    if (parentEndDate && endOfDate(parsedEndDate).getTime() > endOfDate(parentEndDate).getTime()) {
      toast.warning("Las iteraciones no pueden terminar después que la tarea principal.");
      return;
    }

    setIsCreating(true);

    try {
      const batch = writeBatch(db);
      const now = new Date();
      const sourceTitle = task.originalTitle || getTaskTitle(task);
      const nextTotalSubtasks = childTaskCount + validIterations.length;

      validIterations.forEach((iteration, index) => {
        const iterationRef = doc(collection(db, "projects", projectId, "tasks"));
        const cleanWorkflowId = iteration.externalWorkflowId.trim();
        const cleanObservation = iteration.observation.trim();
        const workflowSteps = task.workflowSteps.map((step: any, stepIndex: number) => {
          const cleanStep: any = {
            ...stripWorkflowStepRuntime(step),
            status: stepIndex === 0 ? "en_curso" : "not_started",
            completed: false,
          };

          if (stepIndex === 0) {
            cleanStep.startedAt = now.toISOString();
            cleanStep.startedBy = user.uid;
            if (cleanStep.assignedTo === "DYNAMIC" && firstStepAssignee) {
              cleanStep.assignedTo = firstStepAssignee;
            }
          }

          Object.keys(cleanStep).forEach((key) => {
            if (cleanStep[key] === undefined) cleanStep[key] = null;
          });

          return cleanStep;
        });

        batch.set(iterationRef, {
          projectId,
          title: cleanWorkflowId,
          name: cleanWorkflowId,
          originalTitle: sourceTitle,
          description: task.description || "",
          startDate: parsedStartDate,
          endDate: parsedEndDate,
          start: parsedStartDate,
          end: parsedEndDate,
          assignedTo: task.assignedTo || "",
          indicator: null,
          indicatorValue: null,
          status: "in_progress",
          progress: 10,
          type: "workflow",
          requiresDocument: Boolean(task.requiresDocument),
          linkedDocumentId: null,
          isRateCardTask: Boolean(task.isRateCardTask),
          rateCardMode: task.rateCardMode || null,
          dynamicRateCard: Boolean(task.dynamicRateCard),
          dynamicRateCardConfig: task.dynamicRateCardConfig || null,
          rateCardId: task.rateCardId || null,
          unitsToAdd: task.unitsToAdd || null,
          autoAddUnits: task.autoAddUnits !== false,
          syncExternal: Boolean(task.syncExternal),
          priority: task.priority || "medium",
          currentValue: 0,
          parentTaskId: task.id,
          cycleNumber: childTaskCount + index + 1,
          displayOrder: tasks.length + index + 1,
          workflowSteps,
          currentStepIndex: 0,
          workflowHistory: [
            {
              stepIndex: 0,
              userId: user.uid,
              action: "start",
              comment: cleanObservation || "Workflow iniciado por carga masiva",
              timestamp: now.toISOString(),
              workflowId: cleanWorkflowId,
              plannedStartDate: parsedStartDate.toISOString(),
              plannedEndDate: parsedEndDate.toISOString(),
              source: "bulk_iteration",
            },
          ],
          workflowCycles: 1,
          currentCycle: 1,
          externalWorkflowId: cleanWorkflowId,
          initialObservation: cleanObservation,
          startDocumentId: null,
          bulkCreated: true,
          bulkCreatedAt: now.toISOString(),
          bulkSourceTaskId: task.id,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          createdBy: user.uid,
        });
      });

      batch.update(doc(db, "projects", projectId, "tasks", task.id), {
        isParentTask: true,
        totalSubtasks: nextTotalSubtasks,
        totalCycles: Math.max(Number(task.totalCycles || 0), nextTotalSubtasks),
        updatedAt: serverTimestamp(),
      });

      await batch.commit();

      const { updateParentTaskStatus } = await import("@/lib/taskUtils");
      await updateParentTaskStatus(projectId, task.id);

      toast.success(`${validIterations.length} iteraciones iniciadas correctamente.`);
      onClose();
    } catch (error: any) {
      console.error("Error creating bulk workflow iterations:", error);
      toast.error(error?.message || "No se pudieron crear las iteraciones.");
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm">
      <div className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-start justify-between border-b border-slate-100 p-5">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <div className="rounded-lg bg-indigo-50 p-2 text-indigo-600">
                <ClipboardList size={18} />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900">Crear iteraciones masivas</h3>
                <p className="mt-0.5 truncate text-sm text-slate-500">{getTaskTitle(task)}</p>
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="rounded-full p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
            aria-label="Cerrar"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto bg-slate-50 p-5">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1 flex items-center gap-2 text-sm font-semibold text-slate-700">
                <Hash size={15} className="text-slate-400" />
                Fecha inicio
              </label>
              <input
                type="date"
                value={startDate}
                min={parentStartValue || undefined}
                max={parentEndValue || undefined}
                onChange={(event) => setStartDate(event.target.value)}
                className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
              />
            </div>
            <div>
              <label className="mb-1 flex items-center gap-2 text-sm font-semibold text-slate-700">
                <Hash size={15} className="text-slate-400" />
                Fecha fin
              </label>
              <input
                type="date"
                value={endDate}
                min={startDate || parentStartValue || undefined}
                max={parentEndValue || undefined}
                onChange={(event) => setEndDate(event.target.value)}
                className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
              />
            </div>
          </div>

          {parentStartValue && parentEndValue && (
            <div className="rounded-lg border border-indigo-100 bg-indigo-50 px-3 py-2 text-xs text-indigo-700">
              Las iteraciones deben quedar dentro del cronograma de la tarea principal: {parentStartValue} a {parentEndValue}.
            </div>
          )}

          {firstStepIsDynamic && (
            <div>
              <label className="mb-1 block text-sm font-semibold text-slate-700">Responsable del primer paso</label>
              <select
                value={firstStepAssignee}
                onChange={(event) => setFirstStepAssignee(event.target.value)}
                className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
              >
                <option value="">Seleccionar responsable...</option>
                {teamMembers.map((member) => (
                  <option key={member.id} value={member.id}>{member.name || member.email}</option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="mb-1 flex items-center gap-2 text-sm font-semibold text-slate-700">
              <MessageSquare size={15} className="text-slate-400" />
              IDs y observaciones
            </label>
            <textarea
              value={rawItems}
              onChange={(event) => setRawItems(event.target.value)}
              placeholder={"ID-001, Observación de la iteración\nID-002, Segunda observación\nID-003; También puedes usar punto y coma o tabulación"}
              className="min-h-44 w-full resize-y rounded-lg border border-slate-200 bg-white p-3 font-mono text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
            />
            <p className="mt-1 text-xs text-slate-500">
              Usa una línea por iteración. El primer valor será el ID del workflow y el resto de la línea quedará como observación inicial.
            </p>
          </div>

          {parsedIterations.length > 0 && (
            <div className="rounded-xl border border-slate-200 bg-white">
              <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Vista previa</span>
                <div className="flex gap-2 text-xs">
                  <span className="rounded-full bg-emerald-50 px-2 py-1 font-bold text-emerald-700">
                    {validIterations.length} válidas
                  </span>
                  {invalidIterations.length > 0 && (
                    <span className="rounded-full bg-red-50 px-2 py-1 font-bold text-red-700">
                      {invalidIterations.length} por corregir
                    </span>
                  )}
                </div>
              </div>
              <div className="max-h-48 overflow-y-auto">
                {parsedIterations.map((item) => (
                  <div key={`${item.lineNumber}-${item.raw}`} className="grid grid-cols-[88px_1fr] gap-3 border-b border-slate-100 px-3 py-2 last:border-b-0">
                    <div className="min-w-0">
                      <p className="truncate text-xs font-bold text-slate-700">{item.externalWorkflowId || "Sin ID"}</p>
                      <p className="text-[10px] text-slate-400">Línea {item.lineNumber}</p>
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-xs text-slate-600">{item.observation || "Sin observación"}</p>
                      {item.error && <p className="mt-0.5 text-[10px] font-semibold text-red-600">{item.error}</p>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-3 border-t border-slate-100 bg-white p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-xs text-slate-500">
            Se crearán como subtareas en curso y entrarán al primer paso del workflow.
          </div>
          <div className="flex justify-end gap-3">
            <Button type="button" variant="outline" onClick={handleClose} disabled={isCreating}>
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={handleCreateIterations}
              disabled={isCreating || validIterations.length === 0 || invalidIterations.length > 0}
              className="bg-indigo-600 text-white hover:bg-indigo-700"
            >
              {isCreating ? (
                <>
                  <Loader2 size={16} className="mr-2 animate-spin" />
                  Creando...
                </>
              ) : (
                <>
                  <Play size={16} className="mr-2" />
                  Crear e iniciar
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
