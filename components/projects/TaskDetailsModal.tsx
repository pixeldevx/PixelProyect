import React, { useState, useEffect } from 'react';
import { X, Save, CheckCircle2, Circle, RotateCcw, BookOpen } from 'lucide-react';
import { doc, updateDoc, serverTimestamp, addDoc, collection, writeBatch, increment } from '@/lib/supabase/document-store';
import { db } from '@/lib/backend';
import { toast } from 'sonner';

interface TaskDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  task: any;
  projectId: string;
  onResetWorkflowTask?: (task: any) => void | Promise<void>;
}

const getTaskTitle = (task: any) => task?.title || task?.name || "Sin título";
const getTaskDate = (value: any) => {
  if (!value) return null;
  if (value.toDate) return value.toDate();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};
const getTaskDisplayTitle = (task: any) => {
  const title = getTaskTitle(task);
  if (!task?.externalWorkflowId || title === task.externalWorkflowId) {
    return title;
  }
  return `[${task.externalWorkflowId}] ${title}`;
};

const getCompletedStatus = (task: any) => {
  const endDate = getTaskDate(task?.endDate || task?.end);
  return endDate && Date.now() > endDate.getTime() ? "completed_late" : "completed";
};

const getStaticRateCardSource = (step: any) => {
  if (step?.rateCardId) return step;
  if (step?.form?.rateCardId) return step.form;
  return null;
};

export const TaskDetailsModal: React.FC<TaskDetailsModalProps> = ({
  isOpen,
  onClose,
  task,
  projectId,
  onResetWorkflowTask,
}) => {
  const [documentation, setDocumentation] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [workflowSteps, setWorkflowSteps] = useState<any[]>([]);
  const [stepUnitPrompt, setStepUnitPrompt] = useState<{
    index: number;
    units: number;
  } | null>(null);
  const [additionalCycles, setAdditionalCycles] = useState(1);
  const [isAddingCycles, setIsAddingCycles] = useState(false);

  useEffect(() => {
    if (task) {
      setDocumentation(task.documentation || "");
      setWorkflowSteps(task.workflowSteps || []);
      setAdditionalCycles(1);
    }
  }, [task]);

  if (!isOpen || !task) return null;

  const canResetWorkflow = Boolean(
    onResetWorkflowTask &&
    task.type === "workflow" &&
    !task.isParentTask &&
    (task.status !== "todo" || (task.progress || 0) > 0 || task.externalWorkflowId)
  );

  const handleAddCycles = async () => {
    if (additionalCycles <= 0) return;
    setIsAddingCycles(true);
    try {
      const batch = writeBatch(db);
      const parentRef = doc(db, "projects", projectId, "tasks", task.id);

      let currentTotalCycles = task.totalCycles || 1;
      const newTotalCycles = currentTotalCycles + additionalCycles;
      const baseTaskTitle = getTaskTitle(task);

      const { id, ...taskWithoutId } = task;

      // If it wasn't a parent task before, we need to convert it and create the first cycle subtask
      if (!task.isParentTask) {
        batch.update(parentRef, {
          isParentTask: true,
          totalCycles: newTotalCycles,
          workflowCycles: newTotalCycles,
          updatedAt: serverTimestamp(),
        });

        // Create Ciclo 1 with the current task's progress and status
        const cycle1Ref = doc(collection(db, "projects", projectId, "tasks"));
        const cycle1Data = {
          ...taskWithoutId,
          title: baseTaskTitle,
          name: baseTaskTitle,
          isParentTask: false,
          parentTaskId: task.id,
          cycleNumber: 1,
          displayOrder: (task.displayOrder || 0) + 1,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        };
        batch.set(cycle1Ref, cycle1Data);
      } else {
        batch.update(parentRef, {
          totalCycles: newTotalCycles,
          workflowCycles: newTotalCycles,
          updatedAt: serverTimestamp(),
        });
      }

      // Add new subtasks for the additional cycles
      for (let i = 1; i <= additionalCycles; i++) {
        const cycleNumber = currentTotalCycles + i;
        const subTaskRef = doc(collection(db, "projects", projectId, "tasks"));

        const subTaskData = {
          ...taskWithoutId,
          title: baseTaskTitle.replace(/ \(Ciclo \d+\)$/, ""),
          name: baseTaskTitle.replace(/ \(Ciclo \d+\)$/, ""),
          isParentTask: false,
          parentTaskId: task.id,
          cycleNumber: cycleNumber,
          displayOrder: (task.displayOrder || 0) + cycleNumber,
          status: "todo",
          progress: 0,
          currentStepIndex: 0,
          workflowHistory: [],
          workflowSteps:
            task.workflowSteps?.map((step: any) => {
              const { formData, ...cleanStep } = step;
              return { ...cleanStep, completed: false, status: "not_started" };
            }) || [],
          startDocumentId: null,
          linkedDocumentId: null,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        };

        batch.set(subTaskRef, subTaskData);
      }

      await batch.commit();

      // Update parent task status and progress based on the new subtasks
      const { updateParentTaskStatus } = await import("@/lib/taskUtils");
      await updateParentTaskStatus(projectId, task.id);

      toast.success(
        `Se agregaron ${additionalCycles} repeticiones exitosamente.`,
      );
      setAdditionalCycles(1);
      onClose();
    } catch (error) {
      console.error("Error adding cycles:", error);
      toast.error("Error al agregar repeticiones.");
    } finally {
      setIsAddingCycles(false);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const batch = writeBatch(db);
      const taskRef = doc(db, "projects", projectId, "tasks", task.id);

      // Calculate progress and status for workflow tasks
      let newProgress = task.progress;
      let newStatus = task.status;

      if (task.type === "workflow" && workflowSteps.length > 0) {
        const approvedCount = workflowSteps.filter(
          (s) => s.status === "listo",
        ).length;
        newProgress = Math.round((approvedCount / workflowSteps.length) * 100);

        if (newProgress === 100) {
          newStatus = getCompletedStatus(task);
        } else if (newProgress > 0) {
          newStatus = "in_progress";
        } else {
          // If the task was already in progress or stuck, don't revert to todo
          if (task.status === "in_progress" || task.status === "stuck") {
            newStatus = task.status;
          } else {
            newStatus = "todo";
          }
        }
      }

      // Handle Rate Card updates
      // 1. Check step-level rate card changes
      const oldSteps = task.workflowSteps || [];
      workflowSteps.forEach((step, idx) => {
        const oldStep = oldSteps[idx];
        const wasApproved = oldStep?.status === "listo";
        const isApproved = step.status === "listo";

        const rateCardSource = getStaticRateCardSource(step);

        if (wasApproved !== isApproved && rateCardSource?.rateCardId) {
          const rcRef = doc(
            db,
            "projects",
            projectId,
            "rateCards",
            rateCardSource.rateCardId,
          );
          const units = rateCardSource.unitsToAdd || 1;
          const updateData: any = {
            currentValue: increment(isApproved ? units : -units),
          };

          if (step.assignedTo) {
            updateData[`userStats.${step.assignedTo}`] = increment(
              isApproved ? units : -units,
            );
          }

          batch.update(rcRef, updateData);
        }
      });

      // 2. Check task-level rate card changes (when whole workflow completes)
      if (task.type === "workflow" && task.isRateCardTask && task.rateCardId) {
        const wasAllApproved =
          oldSteps.length > 0 &&
          oldSteps.every((s: any) => s.status === "listo");
        const isAllApproved =
          workflowSteps.length > 0 &&
          workflowSteps.every((s: any) => s.status === "listo");

        if (wasAllApproved !== isAllApproved) {
          const rcRef = doc(
            db,
            "projects",
            projectId,
            "rateCards",
            task.rateCardId,
          );
          const units = task.unitsToAdd || 1;
          const updateData: any = {
            currentValue: increment(isAllApproved ? units : -units),
          };

          if (task.assignedTo) {
            updateData[`userStats.${task.assignedTo}`] = increment(
              isAllApproved ? units : -units,
            );
          }

          batch.update(rcRef, updateData);
        }
      }

      batch.update(taskRef, {
        documentation,
        workflowSteps,
        progress: newProgress,
        status: newStatus,
        updatedAt: serverTimestamp(),
      });

      await batch.commit();

      if (task.parentTaskId) {
        const { updateParentTaskStatus } = await import("@/lib/taskUtils");
        await updateParentTaskStatus(projectId, task.parentTaskId);
      }

      onClose();
      toast.success("Tarea actualizada correctamente");
    } catch (error) {
      console.error("Error saving task details:", error);
      toast.error("Error al guardar los detalles de la tarea.");
    } finally {
      setIsSaving(false);
    }
  };

  const toggleStep = (index: number) => {
    if (task.isParentTask) {
      toast.info(
        "No puedes modificar los pasos de una tarea madre. Modifica las subtareas.",
      );
      return;
    }
    const newSteps = [...workflowSteps];
    const currentStatus = newSteps[index].status || "not_started";
    const step = newSteps[index];

    if (
      currentStatus !== "listo" &&
      getStaticRateCardSource(step)?.rateCardId &&
      getStaticRateCardSource(step)?.autoAddUnits === false
    ) {
      setStepUnitPrompt({ index, units: getStaticRateCardSource(step)?.unitsToAdd || 1 });
      return;
    }

    newSteps[index] = {
      ...newSteps[index],
      status: currentStatus === "listo" ? "not_started" : "listo",
    };
    setWorkflowSteps(newSteps);
  };

  const confirmStepUnitToggle = () => {
    if (!stepUnitPrompt) return;
    const newSteps = [...workflowSteps];
    const currentStep = newSteps[stepUnitPrompt.index];
    const updates =
      currentStep?.form?.rateCardId && !currentStep?.rateCardId
        ? {
            form: {
              ...currentStep.form,
              unitsToAdd: stepUnitPrompt.units,
            },
          }
        : { unitsToAdd: stepUnitPrompt.units };
    newSteps[stepUnitPrompt.index] = {
      ...currentStep,
      ...updates,
      status: "listo",
    };
    setWorkflowSteps(newSteps);
    setStepUnitPrompt(null);
  };

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between p-6 border-b border-slate-100">
          <div>
            <h2 className="text-xl font-bold text-slate-800">
              {getTaskDisplayTitle(task)}
            </h2>
            <p className="text-sm text-slate-500 mt-1">
              Detalles y Documentación
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-8">
          {task.originLogbook && (
            <div className="rounded-xl border border-indigo-100 bg-indigo-50 p-4">
              <div className="flex items-start gap-3">
                <div className="rounded-lg bg-white p-2 text-indigo-600">
                  <BookOpen size={18} />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-bold uppercase tracking-wider text-indigo-600">
                    Origen en bitácora
                  </p>
                  <p className="mt-1 text-sm font-semibold text-slate-800">
                    {task.originLogbook.entryTitle || "Entrada de bitácora"}
                  </p>
                  {task.originLogbook.candidateText && (
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-600">
                      {task.originLogbook.candidateText}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Workflow Steps */}
          {workflowSteps.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-slate-800 mb-4 uppercase tracking-wider">
                Pasos del Flujo de Trabajo
              </h3>
              <div className="space-y-2">
                {workflowSteps.map((step, index) => {
                  const isApproved = step.status === "listo";
                  return (
                    <div
                      key={index}
                      onClick={() => toggleStep(index)}
                      className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${
                        task.isParentTask
                          ? "cursor-not-allowed opacity-70"
                          : "cursor-pointer"
                      } ${
                        isApproved
                          ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                          : "bg-white border-slate-200 hover:border-indigo-300"
                      }`}
                    >
                      {isApproved ? (
                        <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
                      ) : (
                        <Circle className="w-5 h-5 text-slate-300 shrink-0" />
                      )}
                      <div className="flex-1">
                        <p
                          className={`font-medium ${isApproved ? "line-through opacity-70" : "text-slate-700"}`}
                        >
                          {step.label}
                        </p>
                        {step.assignedTo && (
                          <p className="text-xs opacity-70 mt-0.5">
                            Asignado a: {step.assignedTo}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {canResetWorkflow && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-amber-900">
                    Reiniciar flujo
                  </h3>
                  <p className="mt-1 text-xs text-amber-700">
                    Devuelve esta tarea a pendiente y limpia el radicado, avance y pasos iniciados.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    void onResetWorkflowTask?.(task);
                  }}
                  className="inline-flex h-9 items-center justify-center rounded-lg bg-amber-600 px-3 text-sm font-medium text-white transition-colors hover:bg-amber-700"
                >
                  <RotateCcw size={15} className="mr-2" />
                  Reiniciar
                </button>
              </div>
            </div>
          )}

          {/* Documentation */}
          <div>
            <h3 className="text-sm font-semibold text-slate-800 mb-4 uppercase tracking-wider">
              Documentación
            </h3>
            <textarea
              value={documentation}
              onChange={(e) => setDocumentation(e.target.value)}
              placeholder="Escribe aquí la documentación, notas o resultados de esta tarea..."
              className="w-full h-64 p-4 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 resize-none text-slate-700"
            />
          </div>

          {/* Add Cycles for Workflow Tasks */}
          {(task.isParentTask ||
            (task.type === "workflow" && !task.parentTaskId)) && (
            <div className="pt-6 border-t border-slate-100">
              <h3 className="text-sm font-semibold text-slate-800 mb-4 uppercase tracking-wider">
                Agregar Repeticiones (Sub-tareas)
              </h3>
              <div className="flex items-center gap-4 bg-indigo-50/50 p-4 rounded-xl border border-indigo-100">
                <div className="flex-1">
                  <p className="text-sm text-slate-700 mb-2">
                    Esta tarea tiene actualmente{" "}
                    <strong>{task.totalCycles || 1}</strong> repeticiones.
                    ¿Deseas agregar más?
                  </p>
                  <div className="flex items-center gap-3">
                    <input
                      type="number"
                      min="1"
                      value={additionalCycles}
                      onChange={(e) =>
                        setAdditionalCycles(Number(e.target.value))
                      }
                      className="w-24 h-10 px-3 rounded-lg border border-indigo-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-sm"
                    />
                    <button
                      onClick={handleAddCycles}
                      disabled={isAddingCycles || additionalCycles <= 0}
                      className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50"
                    >
                      {isAddingCycles ? "Agregando..." : "Agregar Repeticiones"}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="p-6 border-t border-slate-100 bg-slate-50 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800 hover:bg-slate-200 rounded-lg transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="flex items-center gap-2 px-6 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50"
          >
            <Save size={16} />
            {isSaving ? "Guardando..." : "Guardar Cambios"}
          </button>
        </div>
      </div>

      {stepUnitPrompt && (
        <div className="fixed inset-0 z-[60] bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-sm">
            <h3 className="text-lg font-bold text-slate-800 mb-2">
              Ingresar Unidades
            </h3>
            <p className="text-sm text-slate-500 mb-4">
              Por favor, confirma la cantidad de unidades que se sumarán al
              completar este paso.
            </p>
            <div className="mb-6">
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Unidades Acumuladas
              </label>
              <input
                type="number"
                min="0.1"
                step="0.1"
                value={stepUnitPrompt.units}
                onChange={(e) =>
                  setStepUnitPrompt({
                    ...stepUnitPrompt,
                    units: Number(e.target.value),
                  })
                }
                className="w-full text-center text-lg h-10 px-3 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                autoFocus
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setStepUnitPrompt(null)}
                className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={confirmStepUnitToggle}
                className="px-4 py-2 text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-700 rounded-lg transition-colors"
              >
                Confirmar y Completar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
