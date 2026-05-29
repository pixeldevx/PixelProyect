"use client"

import React, { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, ClipboardList, CornerDownRight, Loader2, Plus, Settings, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { addDoc, collection, deleteDoc, doc, serverTimestamp, updateDoc } from "@/lib/supabase/document-store";
import { db } from "@/lib/backend";
import {
  CustomForm,
  WorkflowStepFormBuilderModal,
} from "@/components/projects/WorkflowStepFormBuilderModal";
import {
  getWorkflowTemplateScopeData,
  getWorkflowTemplateScopeLabel,
  loadWorkflowTemplatesForScope,
} from "@/lib/workflow-templates";

type WorkflowStepDraft = {
  assignedTo?: string;
  label: string;
  form?: CustomForm;
  rateCardId?: string | null;
  unitsToAdd?: number | null;
  autoAddUnits?: boolean | null;
  assignsNextStep?: boolean | null;
  isQualityGate?: boolean | null;
};

type SubtaskDraft = {
  title: string;
  description: string;
  assignedTo: string;
  priority: string;
  status: string;
  startDate: string;
  endDate: string;
};

interface EditTaskStructureModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  project?: any;
  task: any | null;
  user: any;
  teamMembers: any[];
  subtasks?: any[];
  canEditTaskStructure?: boolean;
  canManageWorkflowTemplates?: boolean;
  userRole?: string | null;
  templateScopeOrganizationIds?: string[];
  onCreateSubtask?: (parentTask: any, subtask: SubtaskDraft) => Promise<void> | void;
  onSave: (updates: {
    title: string;
    workflowSteps?: WorkflowStepDraft[];
  }) => Promise<void> | void;
}

const getTaskTitle = (task: any) => task?.title || task?.name || "";

const getTaskDate = (value: any) => {
  if (!value) return null;
  if (value.toDate) return value.toDate();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const toDateInputValue = (value: any) => {
  const date = getTaskDate(value);
  if (!date) return "";
  return date.toISOString().slice(0, 10);
};

const getStatusLabel = (status: string) => {
  switch (status) {
    case "completed":
      return "Listo";
    case "in_progress":
      return "En curso";
    case "stuck":
      return "Estancado";
    case "todo":
    case "pending":
      return "Pendiente";
    default:
      return status || "Pendiente";
  }
};

const toDraftSteps = (steps: any[] = []): WorkflowStepDraft[] =>
  steps.map((step, index) => ({
    label: step?.label || "",
    assignedTo: step?.assignedTo || "",
    form: step?.form,
    rateCardId: step?.rateCardId ?? null,
    unitsToAdd: step?.unitsToAdd ?? null,
    autoAddUnits: step?.autoAddUnits ?? null,
    assignsNextStep: step?.assignsNextStep ?? null,
    isQualityGate: index === 0 ? false : step?.isQualityGate ?? null,
  }));

export function EditTaskStructureModal({
  isOpen,
  onClose,
  projectId,
  project,
  task,
  user,
  teamMembers,
  subtasks = [],
  canEditTaskStructure = true,
  canManageWorkflowTemplates = false,
  userRole,
  templateScopeOrganizationIds = [],
  onCreateSubtask,
  onSave,
}: EditTaskStructureModalProps) {
  const [title, setTitle] = useState("");
  const [workflowSteps, setWorkflowSteps] = useState<WorkflowStepDraft[]>([]);
  const [subtaskDraft, setSubtaskDraft] = useState<SubtaskDraft>({
    title: "",
    description: "",
    assignedTo: "",
    priority: "medium",
    status: "todo",
    startDate: "",
    endDate: "",
  });
  const [isSaving, setIsSaving] = useState(false);
  const [isCreatingSubtask, setIsCreatingSubtask] = useState(false);
  const [isSavingTemplate, setIsSavingTemplate] = useState(false);
  const [workflowTemplates, setWorkflowTemplates] = useState<any[]>([]);
  const [templateName, setTemplateName] = useState("");
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [isFormBuilderOpen, setIsFormBuilderOpen] = useState(false);
  const [currentStepIndexForForm, setCurrentStepIndexForForm] = useState<number | null>(null);
  const templateScopeOrganizationKey = templateScopeOrganizationIds.join("|");

  const canEditWorkflow = Boolean(canEditTaskStructure && (task?.type === "workflow" || (task?.workflowSteps?.length || 0) > 0));
  const canManageSubtasks = Boolean(task?.type === "state" && !task?.parentTaskId && onCreateSubtask);

  useEffect(() => {
    if (!isOpen || !task) return;
    setTitle(getTaskTitle(task));
    setWorkflowSteps(toDraftSteps(task.workflowSteps || []));
    setSubtaskDraft({
      title: "",
      description: "",
      assignedTo: task.assignedTo || "",
      priority: task.priority || "medium",
      status: "todo",
      startDate: toDateInputValue(task.startDate),
      endDate: toDateInputValue(task.endDate),
    });
    setIsSaving(false);
    setIsCreatingSubtask(false);
    setIsSavingTemplate(false);
    setTemplateName("");
    setShowTemplateModal(false);
    setIsFormBuilderOpen(false);
    setCurrentStepIndexForForm(null);
  }, [isOpen, task]);

  useEffect(() => {
    if (!isOpen || !projectId) return;

    const fetchTemplates = async () => {
      try {
        const templates = await loadWorkflowTemplatesForScope({
          projectId,
          project,
          userRole,
          organizationIds: templateScopeOrganizationKey ? templateScopeOrganizationKey.split("|") : [],
        });
        setWorkflowTemplates(templates);
      } catch (error) {
        console.error("Error loading workflow templates:", error);
      }
    };

    void fetchTemplates();
  }, [isOpen, projectId, project, userRole, templateScopeOrganizationKey]);

  const currentProjectWorkflowTemplates = React.useMemo(
    () => workflowTemplates.filter((template) => template.projectId === projectId),
    [projectId, workflowTemplates]
  );
  const sharedWorkflowTemplates = React.useMemo(
    () => workflowTemplates.filter((template) => template.projectId !== projectId),
    [projectId, workflowTemplates]
  );

  if (!isOpen || !task) return null;

  const updateStep = (index: number, updates: Partial<WorkflowStepDraft>) => {
    setWorkflowSteps((currentSteps) =>
      currentSteps.map((step, stepIndex) =>
        stepIndex === index ? { ...step, ...updates } : step
      )
    );
  };

  const addStep = () => {
    setWorkflowSteps((currentSteps) => [
      ...currentSteps,
      {
        label: `Paso ${currentSteps.length + 1}`,
        assignedTo: "",
        unitsToAdd: 1,
        autoAddUnits: true,
      },
    ]);
  };

  const removeStep = (index: number) => {
    if (index === 0 && workflowSteps[1]?.isQualityGate) {
      toast.warning("No puedes dejar un paso de calidad como primer paso. Mueve o desmarca ese control antes de borrar.");
      return;
    }

    setWorkflowSteps((currentSteps) => currentSteps.filter((_, stepIndex) => stepIndex !== index));
  };

  const moveStep = (index: number, direction: -1 | 1) => {
    if (direction === -1 && index === 1 && workflowSteps[index]?.isQualityGate) {
      toast.warning("El control de calidad necesita un paso anterior y no puede quedar primero.");
      return;
    }

    if (direction === 1 && index === 0 && workflowSteps[1]?.isQualityGate) {
      toast.warning("El control de calidad necesita un paso anterior y no puede quedar primero.");
      return;
    }

    setWorkflowSteps((currentSteps) => {
      const targetIndex = index + direction;
      if (targetIndex < 0 || targetIndex >= currentSteps.length) return currentSteps;

      const nextSteps = [...currentSteps];
      const [movedStep] = nextSteps.splice(index, 1);
      nextSteps.splice(targetIndex, 0, movedStep);
      return nextSteps;
    });
  };

  const updateSubtaskDraft = (updates: Partial<SubtaskDraft>) => {
    setSubtaskDraft((currentDraft) => ({ ...currentDraft, ...updates }));
  };

  const resetSubtaskDraft = () => {
    setSubtaskDraft({
      title: "",
      description: "",
      assignedTo: task.assignedTo || "",
      priority: task.priority || "medium",
      status: "todo",
      startDate: toDateInputValue(task.startDate),
      endDate: toDateInputValue(task.endDate),
    });
  };

  const handleCreateSubtask = async () => {
    if (!canManageSubtasks || !onCreateSubtask) return;

    if (!subtaskDraft.title.trim()) {
      toast.warning("Ingresa el nombre de la subtarea.");
      return;
    }

    if (!subtaskDraft.startDate || !subtaskDraft.endDate) {
      toast.warning("Define fecha de inicio y fin para la subtarea.");
      return;
    }

    setIsCreatingSubtask(true);
    try {
      await onCreateSubtask(task, {
        ...subtaskDraft,
        title: subtaskDraft.title.trim(),
        description: subtaskDraft.description.trim(),
      });
      resetSubtaskDraft();
    } catch (error: any) {
      console.error("Error creating subtask:", error);
      toast.error(error?.message || "No se pudo crear la subtarea.");
    } finally {
      setIsCreatingSubtask(false);
    }
  };

  const getCleanWorkflowSteps = () =>
    workflowSteps.map((step, index) => ({
      ...step,
      isQualityGate: index === 0 ? false : step.isQualityGate,
      label: step.label.trim(),
    }));

  const normalizeTemplateName = (name: string) => name.trim().replace(/\s+/g, " ").toLowerCase();

  const validateWorkflowSteps = () => {
    if (workflowSteps.length === 0) {
      toast.warning("Esta tarea necesita al menos un paso de workflow.");
      return false;
    }

    if (workflowSteps.some((step) => !step.label.trim())) {
      toast.warning("Todos los pasos deben tener nombre.");
      return false;
    }

    if (workflowSteps[0]?.isQualityGate) {
      toast.warning("El primer paso no puede ser control de calidad; debe existir un paso anterior que envíe a revisión.");
      return false;
    }

    return true;
  };

  const handleSaveTemplate = async () => {
    const cleanTemplateName = templateName.trim().replace(/\s+/g, " ");
    if (!cleanTemplateName) {
      toast.warning("Ingresa un nombre para la plantilla.");
      return;
    }

    if (!validateWorkflowSteps()) return;

    setIsSavingTemplate(true);
    try {
      const existingTemplate = currentProjectWorkflowTemplates.find(
        (template) => normalizeTemplateName(template.name || "") === normalizeTemplateName(cleanTemplateName)
      );
      const templateData = {
        name: cleanTemplateName,
        ...getWorkflowTemplateScopeData(projectId, project),
        steps: getCleanWorkflowSteps(),
        updatedAt: serverTimestamp(),
        updatedBy: user?.uid || "unknown",
        sourceTaskId: task.id,
      };

      if (existingTemplate) {
        const confirmed = window.confirm(`Ya existe la plantilla "${existingTemplate.name}". ¿Quieres reescribirla con este workflow?`);
        if (!confirmed) return;

        await updateDoc(doc(db, "workflow_templates", existingTemplate.id), templateData);
        setWorkflowTemplates((currentTemplates) =>
          currentTemplates
            .map((template) =>
              template.id === existingTemplate.id
                ? { ...template, ...templateData }
                : template
            )
            .sort((left: any, right: any) => String(left.name || "").localeCompare(String(right.name || "")))
        );
        toast.success("Plantilla reescrita correctamente.");
      } else {
        const templateToCreate = {
          ...templateData,
          createdAt: serverTimestamp(),
          createdBy: user?.uid || "unknown",
        };
        const docRef = await addDoc(collection(db, "workflow_templates"), templateToCreate);
        setWorkflowTemplates((currentTemplates) =>
          [
            ...currentTemplates,
            { id: docRef.id, ...templateToCreate },
          ].sort((left: any, right: any) => String(left.name || "").localeCompare(String(right.name || "")))
        );
        toast.success("Workflow guardado como plantilla.");
      }

      setShowTemplateModal(false);
      setTemplateName("");
    } catch (error: any) {
      console.error("Error saving workflow template:", error);
      toast.error(error?.message || "Error al guardar el workflow.");
    } finally {
      setIsSavingTemplate(false);
    }
  };

  const handleDeleteTemplate = async (templateId: string, name: string) => {
    if (!canManageWorkflowTemplates) {
      toast.error("No tienes permisos para eliminar plantillas.");
      return;
    }

    const confirmed = window.confirm(`¿Eliminar la plantilla "${name}"? Esta acción no se puede deshacer.`);
    if (!confirmed) return;

    try {
      await deleteDoc(doc(db, "workflow_templates", templateId));
      setWorkflowTemplates((currentTemplates) => currentTemplates.filter((template) => template.id !== templateId));
      toast.success("Plantilla eliminada.");
    } catch (error: any) {
      console.error("Error deleting workflow template:", error);
      toast.error(error?.message || "No se pudo eliminar la plantilla.");
    }
  };

  const handleLoadTemplate = (templateId: string) => {
    if (!templateId) return;

    const template = workflowTemplates.find((candidate) => candidate.id === templateId);
    if (!template?.steps) return;

    setWorkflowSteps(toDraftSteps(template.steps));
    if (template.steps[0]?.isQualityGate) {
      toast.warning("Se desmarco calidad del primer paso porque necesita un paso anterior.");
    }
    toast.success("Plantilla cargada.");
  };

  const handleSave = async () => {
    if (!canEditTaskStructure) {
      toast.error("No tienes permisos para editar la estructura de esta tarea.");
      return;
    }

    const cleanTitle = title.trim();
    if (!cleanTitle) {
      toast.warning("El nombre de la tarea no puede estar vacio.");
      return;
    }

    if (canEditWorkflow) {
      if (!validateWorkflowSteps()) return;
    }

    setIsSaving(true);
    try {
      await onSave({
        title: cleanTitle,
        workflowSteps: canEditWorkflow
          ? getCleanWorkflowSteps()
          : undefined,
      });
      onClose();
    } catch (error: any) {
      console.error("Error updating task structure:", error);
      toast.error(error?.message || "No se pudo actualizar la estructura de la tarea.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl flex flex-col max-h-[90vh]">
        <div className="flex items-start justify-between p-6 border-b border-slate-100">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Settings size={20} className="text-indigo-600" />
              <h2 className="text-xl font-bold text-slate-800">
                {canEditWorkflow
                  ? "Editar tarea y dependientes"
                  : canEditTaskStructure
                    ? "Editar tarea"
                    : "Administrar subtareas"}
              </h2>
            </div>
            <p className="text-sm text-slate-500 mt-1">
              {canEditWorkflow
                ? "Los cambios se aplicaran a esta tarea y a todas sus subtareas dependientes."
                : canEditTaskStructure
                  ? "Ajusta la tarea por estado y administra sus subtareas."
                  : "Crea y revisa subtareas sin cambiar la estructura principal."}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors"
            disabled={isSaving}
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-6 overflow-y-auto flex-1 space-y-6">
          {canEditTaskStructure ? (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Nombre de la tarea
              </label>
              <input
                type="text"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                placeholder="Nombre visible de la tarea"
              />
            </div>
          ) : (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Tarea</p>
              <p className="mt-1 text-sm font-semibold text-slate-800">{getTaskTitle(task)}</p>
            </div>
          )}

          {canEditWorkflow ? (
            <div>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-sm font-semibold text-slate-800">Pasos del workflow</h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Cambia nombres, responsables y formularios de cada paso.
                  </p>
                </div>
                <div className="flex flex-wrap items-center justify-end gap-2">
                  {workflowTemplates.length > 0 && (
                    <select
                      className="h-8 rounded-lg border border-indigo-200 bg-white px-2 text-xs text-slate-700"
                      onChange={(event) => handleLoadTemplate(event.target.value)}
                      defaultValue=""
                    >
                      <option value="" disabled>
                        Cargar plantilla...
                      </option>
                      {currentProjectWorkflowTemplates.length > 0 && (
                        <optgroup label="Este proyecto">
                          {currentProjectWorkflowTemplates.map((template) => (
                            <option key={template.id} value={template.id}>
                              {template.name || "Plantilla sin nombre"}
                            </option>
                          ))}
                        </optgroup>
                      )}
                      {sharedWorkflowTemplates.length > 0 && (
                        <optgroup label="Organizaciones asignadas">
                          {sharedWorkflowTemplates.map((template) => (
                            <option key={template.id} value={template.id}>
                              {template.name || "Plantilla sin nombre"} · {getWorkflowTemplateScopeLabel(template, projectId)}
                            </option>
                          ))}
                        </optgroup>
                      )}
                    </select>
                  )}
                  {workflowSteps.length > 0 && (
                    <Button
                      type="button"
                      onClick={() => setShowTemplateModal(true)}
                      size="sm"
                      variant="outline"
                      className="h-8 text-xs text-indigo-600 border-indigo-200 hover:bg-indigo-50"
                    >
                      <ClipboardList size={14} className="mr-1" />
                      Guardar workflow
                    </Button>
                  )}
                  <Button
                    type="button"
                    onClick={addStep}
                    size="sm"
                    variant="outline"
                    className="h-8 text-xs"
                  >
                    <Plus size={14} className="mr-1" />
                    Agregar paso
                  </Button>
                </div>
              </div>

              <div className="space-y-3">
                {workflowSteps.map((step, index) => (
                  <div
                    key={`workflow-step-${index}`}
                    className="p-4 border border-slate-200 rounded-xl bg-slate-50/60"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-7 h-7 rounded-full bg-indigo-600 flex items-center justify-center text-white text-xs font-bold shrink-0">
                        {index + 1}
                      </div>
                      <div className="flex shrink-0 flex-col gap-1">
                        <button
                          type="button"
                          onClick={() => moveStep(index, -1)}
                          disabled={index === 0 || (index === 1 && Boolean(step.isQualityGate))}
                          className="flex h-4 w-7 items-center justify-center rounded border border-slate-200 bg-white text-slate-400 transition-colors hover:text-indigo-600 disabled:cursor-not-allowed disabled:opacity-30"
                          title="Mover paso arriba"
                          aria-label={`Mover paso ${index + 1} arriba`}
                        >
                          <ArrowUp size={12} />
                        </button>
                        <button
                          type="button"
                          onClick={() => moveStep(index, 1)}
                          disabled={index === workflowSteps.length - 1 || (index === 0 && Boolean(workflowSteps[1]?.isQualityGate))}
                          className="flex h-4 w-7 items-center justify-center rounded border border-slate-200 bg-white text-slate-400 transition-colors hover:text-indigo-600 disabled:cursor-not-allowed disabled:opacity-30"
                          title="Mover paso abajo"
                          aria-label={`Mover paso ${index + 1} abajo`}
                        >
                          <ArrowDown size={12} />
                        </button>
                      </div>
                      <input
                        type="text"
                        value={step.label}
                        onChange={(event) => updateStep(index, { label: event.target.value })}
                        className="flex-1 h-9 px-3 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white"
                        placeholder="Nombre del paso"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          setCurrentStepIndexForForm(index);
                          setIsFormBuilderOpen(true);
                        }}
                        className={`p-2 rounded-lg transition-colors ${
                          step.form
                            ? "text-indigo-600 bg-indigo-50 hover:bg-indigo-100"
                            : "text-slate-400 hover:text-indigo-600 hover:bg-white"
                        }`}
                        title={step.form ? "Editar formulario" : "Agregar formulario"}
                      >
                        <ClipboardList size={16} />
                      </button>
                      <button
                        type="button"
                        onClick={() => removeStep(index)}
                        className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        title="Eliminar paso"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3 pl-10">
                      <select
                        value={step.assignedTo || ""}
                        onChange={(event) => updateStep(index, { assignedTo: event.target.value })}
                        className="h-9 px-3 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white"
                      >
                        <option value="">Sin responsable fijo</option>
                        <option value="DYNAMIC">Asignacion dinamica</option>
                        {teamMembers.map((member) => (
                          <option key={member.id} value={member.id}>
                            {member.name || member.email}
                          </option>
                        ))}
                      </select>

                      {index < workflowSteps.length - 1 ? (
                        <label className="h-9 px-3 flex items-center gap-2 text-xs text-slate-600 border border-slate-200 rounded-lg bg-white cursor-pointer">
                          <input
                            type="checkbox"
                            checked={Boolean(step.assignsNextStep)}
                            onChange={(event) => {
                              updateStep(index, { assignsNextStep: event.target.checked });
                              if (event.target.checked) {
                                updateStep(index + 1, { assignedTo: "DYNAMIC" });
                              }
                            }}
                            className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                          />
                          Este paso decide el responsable siguiente
                        </label>
                      ) : (
                        <div className="h-9 px-3 flex items-center text-xs text-slate-400 border border-dashed border-slate-200 rounded-lg bg-white">
                          Ultimo paso del workflow
                        </div>
                      )}

                      <label className={`md:col-span-2 h-9 px-3 flex items-center gap-2 text-xs border rounded-lg ${
                        index === 0
                          ? "cursor-not-allowed border-slate-200 bg-slate-50 text-slate-400"
                          : "cursor-pointer border-amber-100 bg-amber-50 text-amber-800"
                      }`}>
                        <input
                          type="checkbox"
                          checked={index === 0 ? false : Boolean(step.isQualityGate)}
                          disabled={index === 0}
                          onChange={(event) => {
                            if (index === 0) return;
                            updateStep(index, { isQualityGate: event.target.checked });
                          }}
                          className="rounded border-amber-300 text-amber-600 focus:ring-amber-500"
                        />
                        {index === 0 ? "El primer paso no puede ser control de calidad" : "Paso de control de calidad"}
                      </label>
                    </div>

                    {step.form && (
                      <div className="mt-3 ml-10 text-xs text-indigo-700 bg-indigo-50 border border-indigo-100 rounded-lg px-3 py-2">
                        Formulario: {step.form.title || "Sin titulo"} - {step.form.fields?.length || 0} campos
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ) : canManageSubtasks ? (
            <div className="space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-slate-800">Subtareas</h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Crea y revisa entregables secundarios bajo esta tarea por estado.
                  </p>
                </div>
                <span className="rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-bold text-indigo-600 border border-indigo-100">
                  {subtasks.length} subtareas
                </span>
              </div>

              {subtasks.length > 0 ? (
                <div className="space-y-2">
                  {subtasks.map((subtask) => {
                    const assignee = teamMembers.find((member) => member.id === subtask.assignedTo);
                    return (
                      <div
                        key={subtask.id}
                        className="flex items-center gap-3 rounded-xl border border-indigo-100 bg-indigo-50/30 px-3 py-2"
                      >
                        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white text-indigo-500 border border-indigo-100">
                          <CornerDownRight size={14} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-slate-700">
                            {getTaskTitle(subtask)}
                          </p>
                          <p className="text-[11px] text-slate-500">
                            {assignee?.name || "Sin responsable"} · {getStatusLabel(subtask.status)}
                          </p>
                        </div>
                        <span className="rounded bg-white px-2 py-1 text-[10px] font-bold uppercase text-indigo-500 border border-indigo-100">
                          Subtarea
                        </span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
                  Esta tarea todavía no tiene subtareas.
                </div>
              )}

              <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h4 className="text-sm font-semibold text-slate-800">Nueva subtarea</h4>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Se guardará como tarea por estado dependiente de esta tarea.
                    </p>
                  </div>
                </div>

                <input
                  type="text"
                  value={subtaskDraft.title}
                  onChange={(event) => updateSubtaskDraft({ title: event.target.value })}
                  className="w-full h-10 px-3 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-sm"
                  placeholder="Nombre de la subtarea"
                />

                <textarea
                  value={subtaskDraft.description}
                  onChange={(event) => updateSubtaskDraft({ description: event.target.value })}
                  className="w-full min-h-[68px] p-3 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-xs resize-none"
                  placeholder="Descripción opcional"
                />

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <select
                    value={subtaskDraft.assignedTo}
                    onChange={(event) => updateSubtaskDraft({ assignedTo: event.target.value })}
                    className="h-9 px-3 rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-xs"
                  >
                    <option value="">Sin responsable</option>
                    {teamMembers.map((member) => (
                      <option key={member.id} value={member.id}>
                        {member.name || member.email}
                      </option>
                    ))}
                  </select>

                  <select
                    value={subtaskDraft.priority}
                    onChange={(event) => updateSubtaskDraft({ priority: event.target.value })}
                    className="h-9 px-3 rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-xs"
                  >
                    <option value="high">Prioridad alta</option>
                    <option value="medium">Prioridad media</option>
                    <option value="low">Prioridad baja</option>
                  </select>

                  <select
                    value={subtaskDraft.status}
                    onChange={(event) => updateSubtaskDraft({ status: event.target.value })}
                    className="h-9 px-3 rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-xs"
                  >
                    <option value="todo">Pendiente</option>
                    <option value="in_progress">En curso</option>
                    <option value="stuck">Estancado</option>
                    <option value="completed">Listo</option>
                  </select>

                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="date"
                      value={subtaskDraft.startDate}
                      onChange={(event) => updateSubtaskDraft({ startDate: event.target.value })}
                      className="h-9 px-3 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-xs"
                    />
                    <input
                      type="date"
                      value={subtaskDraft.endDate}
                      onChange={(event) => updateSubtaskDraft({ endDate: event.target.value })}
                      className="h-9 px-3 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-xs"
                    />
                  </div>
                </div>

                <div className="flex justify-end">
                  <Button
                    type="button"
                    onClick={handleCreateSubtask}
                    disabled={isCreatingSubtask}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white"
                  >
                    {isCreatingSubtask ? (
                      <>
                        <Loader2 size={16} className="mr-2 animate-spin" />
                        Creando...
                      </>
                    ) : (
                      <>
                        <Plus size={16} className="mr-2" />
                        Crear subtarea
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
              Esta tarea no tiene pasos de workflow.
            </div>
          )}
        </div>

        <div className="p-6 border-t border-slate-100 flex justify-end gap-3 bg-slate-50 rounded-b-2xl">
          <Button variant="outline" onClick={onClose} disabled={isSaving}>
            {canEditTaskStructure ? "Cancelar" : "Cerrar"}
          </Button>
          {canEditTaskStructure && (
            <Button
              onClick={handleSave}
              disabled={isSaving}
              className="bg-indigo-600 hover:bg-indigo-700 text-white min-w-[150px]"
            >
              {isSaving ? (
                <>
                  <Loader2 size={16} className="mr-2 animate-spin" />
                  Guardando...
                </>
              ) : (
                "Guardar cambios"
              )}
            </Button>
          )}
        </div>
      </div>

      {isFormBuilderOpen && currentStepIndexForForm !== null && (
        <WorkflowStepFormBuilderModal
          isOpen={isFormBuilderOpen}
          onClose={() => {
            setIsFormBuilderOpen(false);
            setCurrentStepIndexForForm(null);
          }}
          stepName={workflowSteps[currentStepIndexForForm]?.label || `Paso ${currentStepIndexForForm + 1}`}
          initialForm={workflowSteps[currentStepIndexForForm]?.form}
          onSave={(form) => {
            if (currentStepIndexForForm === null) return;
            updateStep(currentStepIndexForForm, { form });
          }}
        />
      )}

      {showTemplateModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden flex flex-col">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                <ClipboardList className="text-indigo-600" size={24} />
                Guardar Workflow
              </h2>
              <button
                onClick={() => setShowTemplateModal(false)}
                className="text-slate-400 hover:text-slate-600 transition-colors"
                disabled={isSavingTemplate}
              >
                <X size={24} />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="text-sm font-bold text-slate-700 mb-1 block">
                  Nombre de la plantilla
                </label>
                <input
                  type="text"
                  value={templateName}
                  onChange={(event) => setTemplateName(event.target.value)}
                  placeholder="Ej. Flujo de aprobación estándar"
                  className="w-full h-11 px-4 rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-sm"
                  autoFocus
                />
              </div>
              <p className="text-xs text-slate-500">
                Si usas el nombre de una plantilla existente, se pedirá confirmación para reescribirla.
              </p>
              {canManageWorkflowTemplates && currentProjectWorkflowTemplates.length > 0 && (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <p className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500">
                    Plantillas del proyecto
                  </p>
                  <div className="max-h-44 space-y-2 overflow-y-auto pr-1">
                    {currentProjectWorkflowTemplates.map((template) => (
                      <div key={template.id} className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2">
                        <button
                          type="button"
                          onClick={() => setTemplateName(template.name || "")}
                          className="min-w-0 truncate text-left text-sm font-medium text-slate-700 hover:text-indigo-700"
                          title={template.name || "Plantilla"}
                        >
                          {template.name || "Plantilla sin nombre"}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteTemplate(template.id, template.name || "Plantilla")}
                          className="shrink-0 rounded-md p-1.5 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600"
                          aria-label={`Eliminar plantilla ${template.name || ""}`}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="p-6 border-t border-slate-100 bg-slate-50 flex justify-end gap-3">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setShowTemplateModal(false)}
                className="text-slate-600 hover:bg-slate-200 rounded-xl"
                disabled={isSavingTemplate}
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
                    <Loader2 size={16} className="animate-spin mr-2" />
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
