"use client"

import React, { useEffect, useState } from "react";
import { ClipboardList, Loader2, Plus, Settings, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { addDoc, collection, serverTimestamp } from "@/lib/supabase/document-store";
import { db } from "@/lib/backend";
import {
  CustomForm,
  WorkflowStepFormBuilderModal,
} from "@/components/projects/WorkflowStepFormBuilderModal";

type WorkflowStepDraft = {
  assignedTo?: string;
  label: string;
  form?: CustomForm;
  rateCardId?: string | null;
  unitsToAdd?: number | null;
  autoAddUnits?: boolean | null;
  assignsNextStep?: boolean | null;
};

interface EditTaskStructureModalProps {
  isOpen: boolean;
  onClose: () => void;
  task: any | null;
  user: any;
  teamMembers: any[];
  onSave: (updates: {
    title: string;
    workflowSteps?: WorkflowStepDraft[];
  }) => Promise<void> | void;
}

const getTaskTitle = (task: any) => task?.title || task?.name || "";

const toDraftSteps = (steps: any[] = []): WorkflowStepDraft[] =>
  steps.map((step) => ({
    label: step?.label || "",
    assignedTo: step?.assignedTo || "",
    form: step?.form,
    rateCardId: step?.rateCardId ?? null,
    unitsToAdd: step?.unitsToAdd ?? null,
    autoAddUnits: step?.autoAddUnits ?? null,
    assignsNextStep: step?.assignsNextStep ?? null,
  }));

export function EditTaskStructureModal({
  isOpen,
  onClose,
  task,
  user,
  teamMembers,
  onSave,
}: EditTaskStructureModalProps) {
  const [title, setTitle] = useState("");
  const [workflowSteps, setWorkflowSteps] = useState<WorkflowStepDraft[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [isSavingTemplate, setIsSavingTemplate] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [isFormBuilderOpen, setIsFormBuilderOpen] = useState(false);
  const [currentStepIndexForForm, setCurrentStepIndexForForm] = useState<number | null>(null);

  const canEditWorkflow = task?.type === "workflow" || (task?.workflowSteps?.length || 0) > 0;

  useEffect(() => {
    if (!isOpen || !task) return;
    setTitle(getTaskTitle(task));
    setWorkflowSteps(toDraftSteps(task.workflowSteps || []));
    setIsSaving(false);
    setIsSavingTemplate(false);
    setTemplateName("");
    setShowTemplateModal(false);
    setIsFormBuilderOpen(false);
    setCurrentStepIndexForForm(null);
  }, [isOpen, task]);

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
    setWorkflowSteps((currentSteps) => currentSteps.filter((_, stepIndex) => stepIndex !== index));
  };

  const getCleanWorkflowSteps = () =>
    workflowSteps.map((step) => ({
      ...step,
      label: step.label.trim(),
    }));

  const validateWorkflowSteps = () => {
    if (workflowSteps.length === 0) {
      toast.warning("Esta tarea necesita al menos un paso de workflow.");
      return false;
    }

    if (workflowSteps.some((step) => !step.label.trim())) {
      toast.warning("Todos los pasos deben tener nombre.");
      return false;
    }

    return true;
  };

  const handleSaveTemplate = async () => {
    if (!templateName.trim()) {
      toast.warning("Ingresa un nombre para la plantilla.");
      return;
    }

    if (!validateWorkflowSteps()) return;

    setIsSavingTemplate(true);
    try {
      await addDoc(collection(db, "workflow_templates"), {
        name: templateName.trim(),
        steps: getCleanWorkflowSteps(),
        createdAt: serverTimestamp(),
        createdBy: user?.uid || "unknown",
        sourceTaskId: task.id,
      });
      setShowTemplateModal(false);
      setTemplateName("");
      toast.success("Workflow guardado como plantilla.");
    } catch (error: any) {
      console.error("Error saving workflow template:", error);
      toast.error(error?.message || "Error al guardar el workflow.");
    } finally {
      setIsSavingTemplate(false);
    }
  };

  const handleSave = async () => {
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
              <h2 className="text-xl font-bold text-slate-800">Editar tarea y dependientes</h2>
            </div>
            <p className="text-sm text-slate-500 mt-1">
              Los cambios se aplicaran a esta tarea y a todas sus subtareas dependientes.
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

          {canEditWorkflow ? (
            <div>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-sm font-semibold text-slate-800">Pasos del workflow</h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Cambia nombres, responsables y formularios de cada paso.
                  </p>
                </div>
                <div className="flex items-center gap-2">
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
          ) : (
            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
              Esta tarea no tiene pasos de workflow; se actualizara el nombre en sus dependientes.
            </div>
          )}
        </div>

        <div className="p-6 border-t border-slate-100 flex justify-end gap-3 bg-slate-50 rounded-b-2xl">
          <Button variant="outline" onClick={onClose} disabled={isSaving}>
            Cancelar
          </Button>
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
                Se guardarán los pasos y formularios configurados actualmente en esta edición.
              </p>
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
