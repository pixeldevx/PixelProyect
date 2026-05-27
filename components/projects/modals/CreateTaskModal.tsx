import React, { useState } from 'react';
import { X, ListTodo, Plus, ClipboardList, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { doc, collection, addDoc, writeBatch, serverTimestamp, increment, query, where, getDocs } from '@/lib/supabase/document-store';
import { db } from '@/lib/backend';
import { toast } from 'sonner';
import { WorkflowStepFormBuilderModal, CustomForm } from '@/components/projects/WorkflowStepFormBuilderModal';

interface CreateTaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  project: any;
  user: any;
  teamMembers: any[];
  rateCards: any[];
  tasksLength: number;
}

type DraftSubtask = {
  id: string;
  title: string;
  description: string;
  assignedTo: string;
  startDate: string;
  endDate: string;
  priority: string;
  status: string;
};

const createDraftSubtask = (
  defaults: Partial<DraftSubtask> = {},
): DraftSubtask => ({
  id: `subtask_${Date.now()}_${Math.random().toString(36).slice(2)}`,
  title: "",
  description: "",
  assignedTo: defaults.assignedTo || "",
  startDate: defaults.startDate || "",
  endDate: defaults.endDate || "",
  priority: defaults.priority || "medium",
  status: defaults.status || "todo",
  ...defaults,
});

export function CreateTaskModal({
  isOpen,
  onClose,
  projectId,
  project,
  user,
  teamMembers,
  rateCards,
  tasksLength,
}: CreateTaskModalProps) {
  const [isCreatingTask, setIsCreatingTask] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskDesc, setNewTaskDesc] = useState("");
  const [newTaskStart, setNewTaskStart] = useState("");
  const [newTaskEnd, setNewTaskEnd] = useState("");
  const [newTaskAssignedTo, setNewTaskAssignedTo] = useState("");
  const [newTaskIndicator, setNewTaskIndicator] = useState("");
  const [newTaskIndicatorValue, setNewTaskIndicatorValue] = useState(0);
  const [newTaskProgress, setNewTaskProgress] = useState(0);
  const [newTaskStatus, setNewTaskStatus] = useState("todo");
  const [newTaskType, setNewTaskType] = useState<
    "quantitative" | "state" | "workflow"
  >("workflow");
  const [workflowSteps, setWorkflowSteps] = useState<
    {
      assignedTo: string;
      label: string;
      form?: CustomForm;
      rateCardMode?: "static" | "dynamic";
      dynamicRateCard?: boolean;
      dynamicRateCardConfig?: {
        defaultUnits: number;
        requirePerson: boolean;
        requireRateCard: boolean;
      } | null;
      rateCardId?: string;
      unitsToAdd?: number;
      autoAddUnits?: boolean;
      assignsNextStep?: boolean;
    }[]
  >([]);
  const [isFormBuilderOpen, setIsFormBuilderOpen] = useState(false);
  const [currentStepIndexForForm, setCurrentStepIndexForForm] = useState<
    number | null
  >(null);
  const [workflowCycles, setWorkflowCycles] = useState<number>(1);
  const [newTaskRequiresDoc, setNewTaskRequiresDoc] = useState(false);
  const [newTaskIsRateCard, setNewTaskIsRateCard] = useState(false);
  const [newTaskRateCardMode, setNewTaskRateCardMode] = useState<
    "static" | "dynamic"
  >("static");
  const [newTaskRateCardId, setNewTaskRateCardId] = useState("");
  const [newTaskUnitsToAdd, setNewTaskUnitsToAdd] = useState(1);
  const [newTaskPriority, setNewTaskPriority] = useState("medium");
  const [draftSubtasks, setDraftSubtasks] = useState<DraftSubtask[]>([]);
  const [incrementForm, setIncrementForm] = useState<CustomForm | undefined>(
    undefined,
  );
  const [isIncrementFormBuilderOpen, setIsIncrementFormBuilderOpen] =
    useState(false);

  const [workflowTemplates, setWorkflowTemplates] = useState<any[]>([]);
  const [isSavingTemplate, setIsSavingTemplate] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [showTemplateModal, setShowTemplateModal] = useState(false);

  React.useEffect(() => {
    if (isOpen) {
      const fetchTemplates = async () => {
        try {
          const q = query(
            collection(db, "workflow_templates"),
            where("projectId", "==", projectId),
          );
          const snap = await getDocs(q);
          const templates = snap.docs.map((doc) => ({
            id: doc.id,
            ...doc.data(),
          }));
          setWorkflowTemplates(templates);
        } catch (error) {
          console.error("Error fetching templates:", error);
        }
      };
      fetchTemplates();
    }
  }, [isOpen, projectId]);

  if (!isOpen) return null;

  const resetForm = () => {
    setNewTaskTitle("");
    setNewTaskDesc("");
    setNewTaskStart("");
    setNewTaskEnd("");
    setNewTaskAssignedTo("");
    setNewTaskIndicator("");
    setNewTaskIndicatorValue(0);
    setNewTaskProgress(0);
    setNewTaskStatus("todo");
    setNewTaskPriority("medium");
    setNewTaskType("quantitative");
    setWorkflowSteps([]);
    setWorkflowCycles(1);
    setNewTaskRequiresDoc(false);
    setNewTaskIsRateCard(false);
    setNewTaskRateCardMode("static");
    setNewTaskRateCardId("");
    setNewTaskUnitsToAdd(1);
    setDraftSubtasks([]);
    setIncrementForm(undefined);
    setIsIncrementFormBuilderOpen(false);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const handleSaveTemplate = async () => {
    if (!templateName.trim() || workflowSteps.length === 0) {
      toast.warning("Ingresa un nombre y asegúrate de tener pasos definidos.");
      return;
    }
    setIsSavingTemplate(true);
    try {
      const newTemplate = {
        name: templateName,
        projectId,
        steps: workflowSteps,
        createdAt: serverTimestamp(),
        createdBy: user?.uid || "unknown",
      };
      const docRef = await addDoc(
        collection(db, "workflow_templates"),
        newTemplate,
      );
      setWorkflowTemplates([
        ...workflowTemplates,
        { id: docRef.id, ...newTemplate },
      ]);
      setShowTemplateModal(false);
      setTemplateName("");
      toast.success("Plantilla guardada correctamente.");
    } catch (error: any) {
      console.error("Error saving template:", error);
      toast.error("Error al guardar la plantilla.");
    } finally {
      setIsSavingTemplate(false);
    }
  };

  const handleLoadTemplate = (templateId: string) => {
    if (!templateId) return;
    const template = workflowTemplates.find((t) => t.id === templateId);
    if (template && template.steps) {
      setWorkflowSteps(template.steps);
      toast.success("Plantilla cargada.");
    }
  };

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (
      !user ||
      !newTaskTitle.trim() ||
      !newTaskStart ||
      !newTaskEnd ||
      !newTaskAssignedTo
    ) {
      toast.warning("Por favor completa todos los campos obligatorios.");
      return;
    }

    if (draftSubtasks.some((subtask) => !subtask.title.trim())) {
      toast.warning("Completa el nombre de cada subtarea o elimínala.");
      return;
    }

    if (newTaskType === "quantitative" && Number(newTaskIndicatorValue) <= 0) {
      toast.warning("Define una meta mayor a cero para la tarea cuantitativa.");
      return;
    }

    if (newTaskIsRateCard && newTaskRateCardMode === "static" && !newTaskRateCardId) {
      toast.warning("Selecciona el perfil de Rate Card que se va a afectar.");
      return;
    }

    if (newTaskIsRateCard && Number(newTaskUnitsToAdd) <= 0) {
      toast.warning("Define unidades de Rate Card mayores a cero.");
      return;
    }

    setIsCreatingTask(true);

    try {
      const taskTitle = newTaskTitle.trim();
      const parentStartDate = new Date(newTaskStart + "T00:00:00");
      const parentEndDate = new Date(newTaskEnd + "T00:00:00");
      const usesStaticRateCard =
        newTaskIsRateCard && newTaskRateCardMode === "static";
      const usesDynamicRateCard =
        newTaskIsRateCard && newTaskRateCardMode === "dynamic";
      const taskData: any = {
        projectId: projectId,
        title: taskTitle,
        name: taskTitle,
        description: newTaskDesc,
        startDate: parentStartDate,
        endDate: parentEndDate,
        start: parentStartDate,
        end: parentEndDate,
        assignedTo: newTaskAssignedTo,
        indicator: newTaskType === "quantitative" ? newTaskIndicator : null,
        indicatorValue:
          newTaskType === "quantitative" ? Number(newTaskIndicatorValue) : null,
        status: newTaskType === "state" ? "pending" : newTaskStatus,
        progress: newTaskType === "state" ? 0 : Number(newTaskProgress),
        type: newTaskType,
        requiresDocument: newTaskRequiresDoc,
        linkedDocumentId: null,
        isRateCardTask: newTaskIsRateCard,
        rateCardMode: newTaskIsRateCard ? newTaskRateCardMode : null,
        dynamicRateCard: usesDynamicRateCard,
        dynamicRateCardConfig: usesDynamicRateCard
          ? {
              defaultUnits: Number(newTaskUnitsToAdd) || 1,
              requirePerson: true,
              requireRateCard: true,
            }
          : null,
        rateCardId: usesStaticRateCard ? newTaskRateCardId : null,
        unitsToAdd: newTaskIsRateCard ? Number(newTaskUnitsToAdd) : null,
        syncExternal: usesStaticRateCard
          ? rateCards.find((rc) => rc.id === newTaskRateCardId)?.syncExternal ||
            false
          : false,
        priority: newTaskPriority,
        currentValue: 0,
        incrementForm:
          newTaskType === "quantitative" ? incrementForm || null : null,
        incrementHistory: newTaskType === "quantitative" ? [] : null,
        displayOrder: tasksLength,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        createdBy: user.uid,
      };

      const batch = writeBatch(db);
      const taskRef = doc(collection(db, "projects", projectId, "tasks"));
      const addManualSubtasksToBatch = (
        parentTaskId: string,
        displayOrderOffset: number,
      ) => {
        draftSubtasks.forEach((subtask, index) => {
          const subtaskTitle = subtask.title.trim();
          const startValue = subtask.startDate || newTaskStart;
          const endValue = subtask.endDate || newTaskEnd;
          const subtaskStartDate = new Date(startValue + "T00:00:00");
          const subtaskEndDate = new Date(endValue + "T00:00:00");
          const subtaskRef = doc(
            collection(db, "projects", projectId, "tasks"),
          );

          batch.set(subtaskRef, {
            projectId,
            title: subtaskTitle,
            name: subtaskTitle,
            description: subtask.description.trim(),
            startDate: subtaskStartDate,
            endDate: subtaskEndDate,
            start: subtaskStartDate,
            end: subtaskEndDate,
            assignedTo: subtask.assignedTo || newTaskAssignedTo,
            indicator: null,
            indicatorValue: null,
            status: subtask.status,
            progress: subtask.status === "completed" ? 100 : 0,
            type: "state",
            requiresDocument: false,
            linkedDocumentId: null,
            isRateCardTask: false,
            rateCardId: null,
            unitsToAdd: null,
            syncExternal: false,
            priority: subtask.priority,
            currentValue: 0,
            parentTaskId,
            displayOrder: displayOrderOffset + index,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
            createdBy: user.uid,
          });
        });
      };

      if (draftSubtasks.length > 0) {
        taskData.isParentTask = true;
        taskData.totalSubtasks = draftSubtasks.length;
      }

      // Handle Rate Card update for initial progress
      if (
        taskData.isRateCardTask &&
        taskData.rateCardId &&
        taskData.unitsToAdd &&
        taskData.progress > 0 &&
        taskData.type !== "workflow"
      ) {
        const rcRef = doc(
          db,
          "projects",
          projectId,
          "rateCards",
          taskData.rateCardId,
        );
        const units = (taskData.progress / 100) * taskData.unitsToAdd;
        const updateData: any = {
          currentValue: increment(units),
        };
        if (taskData.assignedTo) {
          updateData[`userStats.${taskData.assignedTo}`] = increment(units);
        }
        batch.update(rcRef, updateData);
      }

      if (newTaskType === "workflow") {
        taskData.workflowSteps = workflowSteps.map((step) => {
          const cleanStep: any = {
            ...step,
            status: "not_started",
          };
          // Firestore doesn't support undefined values
          Object.keys(cleanStep).forEach((key) => {
            if (cleanStep[key] === undefined) {
              cleanStep[key] = null;
            }
          });
          return cleanStep;
        });
        taskData.currentStepIndex = 0;
        taskData.workflowHistory = [];
        taskData.progress = 0;
        taskData.workflowCycles = workflowCycles;
        taskData.currentCycle = 1;

        if (workflowCycles > 1) {
          taskData.isParentTask = true;
          taskData.totalCycles = workflowCycles;
          const parentDocRef = await addDoc(
            collection(db, "projects", projectId, "tasks"),
            taskData,
          );

          for (let i = 1; i <= workflowCycles; i++) {
            const subTaskRef = doc(
              collection(db, "projects", projectId, "tasks"),
            );
            const subTaskData = {
              ...taskData,
              title: taskTitle,
              name: taskTitle,
              isParentTask: false,
              parentTaskId: parentDocRef.id,
              cycleNumber: i,
              displayOrder: tasksLength + i,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            };
            batch.set(subTaskRef, subTaskData);
          }
          addManualSubtasksToBatch(parentDocRef.id, tasksLength + workflowCycles + 1);
          await batch.commit();
        } else {
          batch.set(taskRef, taskData);
          addManualSubtasksToBatch(taskRef.id, tasksLength + 1);
          await batch.commit();
        }
      } else {
        batch.set(taskRef, taskData);
        addManualSubtasksToBatch(taskRef.id, tasksLength + 1);
        await batch.commit();
      }

      toast.success("Tarea creada exitosamente");
      handleClose();
    } catch (error: any) {
      console.error("Error creating task:", error);
      toast.error(`Error al crear la tarea: ${error.message}`);
    } finally {
      setIsCreatingTask(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between p-6 border-b border-slate-100 sticky top-0 bg-white z-10">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-50 rounded-lg text-indigo-600">
              <ListTodo size={20} />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900">Nueva Tarea</h3>
              <p className="text-xs text-slate-500">
                Proyecto: {project?.name}
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleCreateTask} className="p-6 space-y-6">
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-bold text-slate-700">
                Título de la Tarea
              </label>
              <input
                type="text"
                value={newTaskTitle}
                onChange={(e) => setNewTaskTitle(e.target.value)}
                className="w-full h-11 px-4 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-sm"
                placeholder="Ej. Diseño de Interfaz"
                required
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-bold text-slate-700">
                Descripción (Opcional)
              </label>
              <textarea
                value={newTaskDesc}
                onChange={(e) => setNewTaskDesc(e.target.value)}
                className="w-full min-h-[80px] p-4 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-sm resize-none"
                placeholder="Detalles de la tarea..."
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-bold text-slate-700">
                  Fecha Inicio
                </label>
                <input
                  type="date"
                  value={newTaskStart}
                  onChange={(e) => setNewTaskStart(e.target.value)}
                  className="w-full h-11 px-4 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-sm"
                  required
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-bold text-slate-700">
                  Fecha Fin
                </label>
                <input
                  type="date"
                  value={newTaskEnd}
                  onChange={(e) => setNewTaskEnd(e.target.value)}
                  className="w-full h-11 px-4 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-sm"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-bold text-slate-700">
                  Asignar a
                </label>
                <select
                  value={newTaskAssignedTo}
                  onChange={(e) => setNewTaskAssignedTo(e.target.value)}
                  className="w-full h-11 px-4 rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-sm"
                  required
                >
                  <option value="">Seleccionar miembro...</option>
                  {project?.assignedTeamMembers?.map((memberId: string) => {
                    const member = teamMembers.find((m) => m.id === memberId);
                    if (!member) return null;
                    return (
                      <option key={member.id} value={member.id}>
                        {member.name}
                      </option>
                    );
                  })}
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-bold text-slate-700">
                  Prioridad
                </label>
                <select
                  value={newTaskPriority}
                  onChange={(e) => setNewTaskPriority(e.target.value)}
                  className="w-full h-11 px-4 rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-sm"
                >
                  <option value="high">Alta</option>
                  <option value="medium">Media</option>
                  <option value="low">Baja</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-bold text-slate-700">
                  Estado Inicial
                </label>
                <select
                  value={newTaskStatus}
                  onChange={(e) => setNewTaskStatus(e.target.value)}
                  className="w-full h-11 px-4 rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-sm"
                >
                  <option value="todo">Pendiente</option>
                  <option value="in_progress">Trabajando</option>
                  <option value="stuck">Estancado</option>
                  <option value="completed">Listo</option>
                </select>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-bold text-slate-700">
                    Tipo de Tarea
                  </label>
                  <span className="text-[9px] font-bold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-100 uppercase tracking-tighter">
                    Workflow
                  </span>
                </div>
                <select
                  value={newTaskType}
                  onChange={(e) =>
                    setNewTaskType(
                      e.target.value as "quantitative" | "state" | "workflow",
                    )
                  }
                  className="w-full h-11 px-4 rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-sm"
                >
                  <option value="workflow">Workflow (Flujo)</option>
                  <option value="quantitative">Cuantitativa</option>
                  <option value="state">Por Estado</option>
                </select>
              </div>
            </div>

            {newTaskType === "workflow" && (
              <div className="space-y-4 p-4 bg-indigo-50/50 rounded-xl border border-indigo-100">
                <div className="space-y-2 mb-4">
                  <label className="text-xs font-bold text-indigo-600 uppercase tracking-wider">
                    Cantidad de Repeticiones (Sub-tareas)
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={workflowCycles}
                    onChange={(e) => setWorkflowCycles(Number(e.target.value))}
                    className="w-full h-10 px-3 rounded-lg border border-indigo-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-sm"
                  />
                  <p className="text-[10px] text-indigo-500">
                    Si es mayor a 1, se crearán múltiples subtareas para este
                    flujo.
                  </p>
                </div>

                <div className="flex items-center justify-between border-t border-indigo-100 pt-4">
                  <label className="text-xs font-bold text-indigo-600 uppercase tracking-wider">
                    Pasos del Workflow
                  </label>
                  <div className="flex items-center gap-2">
                    {workflowTemplates.length > 0 && (
                      <select
                        className="h-7 text-[10px] rounded border border-indigo-200 px-2 bg-white"
                        onChange={(e) => handleLoadTemplate(e.target.value)}
                        defaultValue=""
                      >
                        <option value="" disabled>
                          Plantillas del proyecto...
                        </option>
                        {workflowTemplates.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name}
                          </option>
                        ))}
                      </select>
                    )}
                    {workflowSteps.length > 0 && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setShowTemplateModal(true)}
                        className="h-7 text-[10px] font-bold text-indigo-600 border-indigo-200 hover:bg-indigo-50"
                      >
                        GUARDAR PLANTILLA
                      </Button>
                    )}
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        setWorkflowSteps([
                          ...workflowSteps,
                          { assignedTo: "", label: "", unitsToAdd: 1 },
                        ])
                      }
                      className="h-7 text-[10px] font-bold text-indigo-600 hover:bg-indigo-100"
                    >
                      <Plus size={12} className="mr-1" /> AGREGAR PASO
                    </Button>
                  </div>
                </div>

                {workflowSteps.length === 0 ? (
                  <p className="text-[10px] text-slate-400 text-center py-2 italic">
                    No hay pasos definidos. Agrega al menos uno.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {workflowSteps.map((step, idx) => (
                      <div
                        key={idx}
                        className="flex flex-col gap-2 bg-white p-3 rounded-lg border border-indigo-100 shadow-sm"
                      >
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full bg-indigo-600 flex items-center justify-center text-white text-[10px] font-bold shrink-0">
                            {idx + 1}
                          </div>
                          <input
                            type="text"
                            placeholder="Nombre del paso (ej. Aprobación Técnica)"
                            value={step.label}
                            onChange={(e) => {
                              const newSteps = [...workflowSteps];
                              newSteps[idx].label = e.target.value;
                              setWorkflowSteps(newSteps);
                            }}
                            className="flex-1 h-8 px-2 text-xs border-none focus:ring-0 font-medium"
                            required
                          />
                          <button
                            type="button"
                            onClick={() => {
                              setCurrentStepIndexForForm(idx);
                              setIsFormBuilderOpen(true);
                            }}
                            className={`p-1.5 rounded-md transition-colors ${step.form ? "text-indigo-600 bg-indigo-50 hover:bg-indigo-100" : "text-slate-400 hover:text-indigo-600 hover:bg-slate-100"}`}
                            title={
                              step.form
                                ? "Editar Formulario"
                                : "Agregar Formulario"
                            }
                          >
                            <ClipboardList size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setWorkflowSteps(
                                workflowSteps.filter((_, i) => i !== idx),
                              )
                            }
                            className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-md transition-colors"
                          >
                            <X size={14} />
                          </button>
                        </div>

                        <div className="flex items-center gap-2 pl-8">
                          <select
                            value={step.assignedTo}
                            onChange={(e) => {
                              const newSteps = [...workflowSteps];
                              newSteps[idx].assignedTo = e.target.value;
                              setWorkflowSteps(newSteps);
                            }}
                            className="flex-1 h-8 px-2 text-[10px] border border-slate-100 focus:ring-0 bg-slate-50 rounded"
                            required
                          >
                            <option value="">Asignar a...</option>
                            <option value="DYNAMIC">
                              Asignación dinámica (por paso anterior)
                            </option>
                            {project?.assignedTeamMembers?.map(
                              (memberId: string) => {
                                const member = teamMembers.find(
                                  (m) => m.id === memberId,
                                );
                                if (!member) return null;
                                return (
                                  <option key={member.id} value={member.id}>
                                    {member.name}
                                  </option>
                                );
                              },
                            )}
                          </select>

                          <select
                            value={step.dynamicRateCard ? "__dynamic__" : step.rateCardId || ""}
                            onChange={(e) => {
                              const newSteps = [...workflowSteps];
                              if (e.target.value === "__dynamic__") {
                                newSteps[idx].rateCardMode = "dynamic";
                                newSteps[idx].dynamicRateCard = true;
                                newSteps[idx].dynamicRateCardConfig = {
                                  defaultUnits: newSteps[idx].unitsToAdd || 1,
                                  requirePerson: true,
                                  requireRateCard: true,
                                };
                                newSteps[idx].rateCardId = undefined;
                                newSteps[idx].autoAddUnits = false;
                              } else {
                                newSteps[idx].rateCardMode = e.target.value ? "static" : undefined;
                                newSteps[idx].dynamicRateCard = false;
                                newSteps[idx].dynamicRateCardConfig = null;
                                newSteps[idx].rateCardId =
                                  e.target.value || undefined;
                              }
                              setWorkflowSteps(newSteps);
                            }}
                            className="flex-1 h-8 px-2 text-[10px] border border-slate-100 focus:ring-0 bg-slate-50 rounded"
                          >
                            <option value="">Sin Rate Card</option>
                            <option value="__dynamic__">Rate Card dinámico</option>
                            {rateCards.map((rc) => (
                              <option key={rc.id} value={rc.id}>
                                {rc.name}
                              </option>
                            ))}
                          </select>

                          {step.dynamicRateCard && (
                            <div className="flex flex-col gap-1 items-end">
                              <input
                                type="number"
                                min="0.1"
                                step="0.1"
                                value={step.unitsToAdd || 1}
                                onChange={(e) => {
                                  const newSteps = [...workflowSteps];
                                  const units = Number(e.target.value);
                                  newSteps[idx].unitsToAdd = units;
                                  newSteps[idx].dynamicRateCardConfig = {
                                    defaultUnits: units || 1,
                                    requirePerson: true,
                                    requireRateCard: true,
                                  };
                                  setWorkflowSteps(newSteps);
                                }}
                                className="w-16 h-8 px-2 text-[10px] border border-slate-100 focus:ring-0 bg-slate-50 rounded"
                                placeholder="Unid."
                              />
                              <span className="text-[9px] text-emerald-600 text-right">
                                Pedirá persona y perfil al aprobar.
                              </span>
                            </div>
                          )}

                          {step.rateCardId && !step.dynamicRateCard && (
                            <div className="flex flex-col gap-1 items-end">
                              <div className="flex items-center gap-1">
                                <label
                                  className="flex items-center gap-1 text-[10px] text-slate-500 cursor-pointer"
                                  title="Si se desmarca, se le preguntará al usuario las unidades al completar el paso."
                                >
                                  <input
                                    type="checkbox"
                                    checked={step.autoAddUnits !== false}
                                    onChange={(e) => {
                                      const newSteps = [...workflowSteps];
                                      newSteps[idx].autoAddUnits =
                                        e.target.checked;
                                      setWorkflowSteps(newSteps);
                                    }}
                                    className="w-3 h-3 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500"
                                  />
                                  Sumar auto.
                                </label>
                              </div>
                              {step.autoAddUnits !== false && (
                                <input
                                  type="number"
                                  min="0.1"
                                  step="0.1"
                                  value={step.unitsToAdd || 1}
                                  onChange={(e) => {
                                    const newSteps = [...workflowSteps];
                                    newSteps[idx].unitsToAdd = Number(
                                      e.target.value,
                                    );
                                    setWorkflowSteps(newSteps);
                                  }}
                                  className="w-16 h-8 px-2 text-[10px] border border-slate-100 focus:ring-0 bg-slate-50 rounded"
                                  placeholder="Unid."
                                />
                              )}
                            </div>
                          )}
                        </div>

                        {idx < workflowSteps.length - 1 && (
                          <div className="flex items-center gap-2 pl-8 mt-1">
                            <label className="flex items-center gap-2 text-[10px] text-slate-500 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={step.assignsNextStep || false}
                                onChange={(e) => {
                                  const newSteps = [...workflowSteps];
                                  newSteps[idx].assignsNextStep =
                                    e.target.checked;
                                  if (e.target.checked) {
                                    newSteps[idx + 1].assignedTo = "DYNAMIC";
                                  } else if (
                                    newSteps[idx + 1].assignedTo === "DYNAMIC"
                                  ) {
                                    newSteps[idx + 1].assignedTo = "";
                                  }
                                  setWorkflowSteps(newSteps);
                                }}
                                className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 w-3 h-3"
                              />
                              Este paso decide el responsable del siguiente paso
                            </label>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {newTaskType === "quantitative" && (
              <div className="space-y-4 p-4 bg-slate-50 rounded-xl border border-slate-100">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                      Indicador
                    </label>
                    <input
                      type="text"
                      value={newTaskIndicator}
                      onChange={(e) => setNewTaskIndicator(e.target.value)}
                      className="w-full h-10 px-3 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-sm"
                      placeholder="Ej. Horas"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                      Meta
                    </label>
                    <input
                      type="number"
                      value={newTaskIndicatorValue}
                      onChange={(e) =>
                        setNewTaskIndicatorValue(Number(e.target.value))
                      }
                      className="w-full h-10 px-3 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-sm"
                    />
                  </div>
                </div>

                <div className="rounded-xl border border-dashed border-indigo-200 bg-white p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                        Formulario de incremento
                      </label>
                      <p className="mt-1 text-xs text-slate-500">
                        Define los datos que se pedirán cada vez que se sume al contador.
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setIsIncrementFormBuilderOpen(true)}
                      className="h-9 text-xs font-bold border-indigo-200 text-indigo-600 hover:bg-indigo-50"
                    >
                      <ClipboardList size={14} className="mr-1" />
                      {incrementForm ? "Editar formulario" : "Configurar"}
                    </Button>
                  </div>
                  <p className="mt-3 text-xs text-slate-500">
                    {incrementForm?.fields?.length
                      ? `${incrementForm.fields.length} campo(s) configurado(s).`
                      : "Sin formulario personalizado: al incrementar solo se pedirá cantidad y comentario."}
                  </p>
                </div>
              </div>
            )}

            <div className="space-y-3 p-4 bg-slate-50 rounded-xl border border-slate-100">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                    Subtareas
                  </label>
                  <p className="text-[10px] text-slate-500 mt-1">
                    Crea entregables secundarios bajo esta tarea.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setDraftSubtasks([
                      ...draftSubtasks,
                      createDraftSubtask({
                        assignedTo: newTaskAssignedTo,
                        startDate: newTaskStart,
                        endDate: newTaskEnd,
                        priority: newTaskPriority,
                      }),
                    ])
                  }
                  className="h-8 text-xs font-bold border-slate-200 bg-white"
                >
                  <Plus size={14} className="mr-1" />
                  Agregar
                </Button>
              </div>

              {draftSubtasks.length === 0 ? (
                <p className="text-xs text-slate-400 italic">
                  Sin subtareas agregadas.
                </p>
              ) : (
                <div className="space-y-3">
                  {draftSubtasks.map((subtask, index) => (
                    <div
                      key={subtask.id}
                      className="rounded-xl border border-slate-200 bg-white p-3 space-y-3"
                    >
                      <div className="flex items-center gap-2">
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-50 text-[11px] font-bold text-indigo-600">
                          {index + 1}
                        </span>
                        <input
                          type="text"
                          value={subtask.title}
                          onChange={(e) => {
                            const next = [...draftSubtasks];
                            next[index] = { ...subtask, title: e.target.value };
                            setDraftSubtasks(next);
                          }}
                          className="flex-1 h-9 px-3 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-sm"
                          placeholder="Nombre de la subtarea"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            setDraftSubtasks(
                              draftSubtasks.filter((item) => item.id !== subtask.id),
                            )
                          }
                          className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                          title="Eliminar subtarea"
                        >
                          <X size={16} />
                        </button>
                      </div>

                      <textarea
                        value={subtask.description}
                        onChange={(e) => {
                          const next = [...draftSubtasks];
                          next[index] = {
                            ...subtask,
                            description: e.target.value,
                          };
                          setDraftSubtasks(next);
                        }}
                        className="w-full min-h-[64px] p-3 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-xs resize-none"
                        placeholder="Descripción opcional"
                      />

                      <div className="grid grid-cols-2 gap-3">
                        <select
                          value={subtask.assignedTo}
                          onChange={(e) => {
                            const next = [...draftSubtasks];
                            next[index] = {
                              ...subtask,
                              assignedTo: e.target.value,
                            };
                            setDraftSubtasks(next);
                          }}
                          className="h-9 px-3 rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-xs"
                        >
                          <option value="">Mismo responsable</option>
                          {project?.assignedTeamMembers?.map((memberId: string) => {
                            const member = teamMembers.find((m) => m.id === memberId);
                            if (!member) return null;
                            return (
                              <option key={member.id} value={member.id}>
                                {member.name}
                              </option>
                            );
                          })}
                        </select>
                        <select
                          value={subtask.priority}
                          onChange={(e) => {
                            const next = [...draftSubtasks];
                            next[index] = {
                              ...subtask,
                              priority: e.target.value,
                            };
                            setDraftSubtasks(next);
                          }}
                          className="h-9 px-3 rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-xs"
                        >
                          <option value="high">Alta</option>
                          <option value="medium">Media</option>
                          <option value="low">Baja</option>
                        </select>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <input
                          type="date"
                          value={subtask.startDate}
                          onChange={(e) => {
                            const next = [...draftSubtasks];
                            next[index] = {
                              ...subtask,
                              startDate: e.target.value,
                            };
                            setDraftSubtasks(next);
                          }}
                          className="h-9 px-3 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-xs"
                        />
                        <input
                          type="date"
                          value={subtask.endDate}
                          onChange={(e) => {
                            const next = [...draftSubtasks];
                            next[index] = { ...subtask, endDate: e.target.value };
                            setDraftSubtasks(next);
                          }}
                          className="h-9 px-3 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-xs"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex items-center gap-3 pt-4 border-t border-slate-100">
              <input
                type="checkbox"
                id="isRateCardModal"
                checked={newTaskIsRateCard}
                onChange={(e) => setNewTaskIsRateCard(e.target.checked)}
                className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
              />
              <label
                htmlFor="isRateCardModal"
                className="text-sm font-medium text-slate-700 cursor-pointer"
              >
                Vincular a un perfil de Rate Card
              </label>
            </div>

            {newTaskIsRateCard && (
              <div className="grid grid-cols-2 gap-4 p-4 bg-emerald-50 rounded-xl border border-emerald-100 animate-in slide-in-from-top-2 duration-200">
                <div className="col-span-2 space-y-2">
                  <label className="text-xs font-bold text-emerald-600 uppercase tracking-wider">
                    Tipo de asignación
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <label className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-xs font-bold ${newTaskRateCardMode === "static" ? "border-emerald-400 bg-white text-emerald-700" : "border-emerald-100 bg-emerald-50/60 text-slate-500"}`}>
                      <input
                        type="radio"
                        name="taskRateCardMode"
                        value="static"
                        checked={newTaskRateCardMode === "static"}
                        onChange={() => setNewTaskRateCardMode("static")}
                        className="h-3.5 w-3.5 text-emerald-600"
                      />
                      Rate Card fijo
                    </label>
                    <label className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-xs font-bold ${newTaskRateCardMode === "dynamic" ? "border-emerald-400 bg-white text-emerald-700" : "border-emerald-100 bg-emerald-50/60 text-slate-500"}`}>
                      <input
                        type="radio"
                        name="taskRateCardMode"
                        value="dynamic"
                        checked={newTaskRateCardMode === "dynamic"}
                        onChange={() => setNewTaskRateCardMode("dynamic")}
                        className="h-3.5 w-3.5 text-emerald-600"
                      />
                      Dinámico al completar
                    </label>
                  </div>
                </div>

                {newTaskRateCardMode === "static" && (
                <div className="space-y-2">
                  <label className="text-xs font-bold text-emerald-600 uppercase tracking-wider">
                    Seleccionar Perfil
                  </label>
                  <select
                    value={newTaskRateCardId}
                    onChange={(e) => {
                      setNewTaskRateCardId(e.target.value);
                      const rc = rateCards.find((r) => r.id === e.target.value);
                      if (rc) setNewTaskIndicator(rc.indicator);
                    }}
                    className="w-full h-11 px-4 rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-sm"
                    required={newTaskIsRateCard && newTaskRateCardMode === "static"}
                  >
                    <option value="">Seleccionar...</option>
                    {rateCards.map((rc) => (
                      <option key={rc.id} value={rc.id}>
                        {rc.name}
                      </option>
                    ))}
                  </select>
                </div>
                )}
                <div className="space-y-2">
                  <label className="text-xs font-bold text-emerald-600 uppercase tracking-wider">
                    {newTaskRateCardMode === "dynamic" ? "Unidades sugeridas" : "Unidades a sumar"}
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    min="0.1"
                    value={newTaskUnitsToAdd}
                    onChange={(e) =>
                      setNewTaskUnitsToAdd(Number(e.target.value))
                    }
                    className="w-full h-10 px-3 rounded-lg border border-emerald-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 text-sm"
                    required={newTaskIsRateCard}
                  />
                </div>
                {newTaskRateCardMode === "dynamic" && (
                  <p className="col-span-2 text-[10px] text-emerald-600">
                    Al finalizar la tarea se solicitará qué persona aporta las unidades y qué perfil de Rate Card se cargará.
                  </p>
                )}
                <p className="col-span-2 text-[10px] text-emerald-600">
                  {newTaskRateCardMode === "dynamic"
                    ? "El cargo se guardará en un historial por persona, día, semana y mes para reportes."
                    : newTaskType === "workflow"
                    ? "Las unidades se sumarán automáticamente al finalizar todo el workflow."
                    : "Las unidades se sumarán proporcionalmente al progreso de la tarea."}
                </p>
              </div>
            )}
          </div>

          <div className="flex gap-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              className="flex-1 h-12 rounded-xl border-slate-200 text-slate-600 hover:bg-slate-50"
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={isCreatingTask}
              className="flex-1 h-12 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold"
            >
              {isCreatingTask ? (
                <Loader2 className="animate-spin" size={20} />
              ) : (
                "Crear Tarea"
              )}
            </Button>
          </div>
        </form>
      </div>

      {isFormBuilderOpen && currentStepIndexForForm !== null && (
        <WorkflowStepFormBuilderModal
          isOpen={isFormBuilderOpen}
          onClose={() => {
            setIsFormBuilderOpen(false);
            setCurrentStepIndexForForm(null);
          }}
          stepName={
            workflowSteps[currentStepIndexForForm]?.label ||
            `Paso ${currentStepIndexForForm + 1}`
          }
          initialForm={workflowSteps[currentStepIndexForForm]?.form}
          onSave={(form) => {
            const newSteps = [...workflowSteps];
            newSteps[currentStepIndexForForm].form = form;
            setWorkflowSteps(newSteps);
          }}
        />
      )}

      {isIncrementFormBuilderOpen && (
        <WorkflowStepFormBuilderModal
          isOpen={isIncrementFormBuilderOpen}
          onClose={() => setIsIncrementFormBuilderOpen(false)}
          stepName={newTaskTitle || "Incremento de contador"}
          initialForm={incrementForm}
          onSave={(form) => setIncrementForm(form)}
        />
      )}

      {/* Save Template Modal */}
      {showTemplateModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden flex flex-col">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                <ClipboardList className="text-indigo-600" size={24} />
                Guardar Plantilla
              </h2>
              <button
                onClick={() => setShowTemplateModal(false)}
                className="text-slate-400 hover:text-slate-600 transition-colors"
              >
                <X size={24} />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="text-sm font-bold text-slate-700 mb-1 block">
                  Nombre de la Plantilla
                </label>
                <input
                  type="text"
                  value={templateName}
                  onChange={(e) => setTemplateName(e.target.value)}
                  placeholder="Ej. Flujo de Aprobación Estándar"
                  className="w-full h-11 px-4 rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-sm"
                />
                <p className="mt-2 text-xs text-slate-500">
                  Esta plantilla quedará disponible solo dentro de este proyecto.
                </p>
              </div>
            </div>
            <div className="p-6 border-t border-slate-100 bg-slate-50 flex justify-end gap-3">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setShowTemplateModal(false)}
                className="text-slate-600 hover:bg-slate-200 rounded-xl"
              >
                Cancelar
              </Button>
              <Button
                type="button"
                onClick={handleSaveTemplate}
                disabled={isSavingTemplate || !templateName.trim()}
                className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow-md shadow-indigo-200"
              >
                {isSavingTemplate ? (
                  <>
                    <Loader2 size={16} className="animate-spin mr-2" />{" "}
                    Guardando...
                  </>
                ) : (
                  "Guardar"
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
