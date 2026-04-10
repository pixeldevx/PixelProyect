import React, { useState } from 'react';
import { X, ListTodo, Plus, ClipboardList, Loader2, Save, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { doc, collection, addDoc, writeBatch, serverTimestamp, increment } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { toast } from 'sonner';
import { WorkflowStepFormBuilderModal, CustomForm } from '@/components/projects/WorkflowStepFormBuilderModal';
import { SaveWorkflowTemplateModal } from './SaveWorkflowTemplateModal';
import { LoadWorkflowTemplateModal } from './LoadWorkflowTemplateModal';

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

export function CreateTaskModal({
  isOpen,
  onClose,
  projectId,
  project,
  user,
  teamMembers,
  rateCards,
  tasksLength
}: CreateTaskModalProps) {
  const [isCreatingTask, setIsCreatingTask] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskDesc, setNewTaskDesc] = useState('');
  const [newTaskStart, setNewTaskStart] = useState('');
  const [newTaskEnd, setNewTaskEnd] = useState('');
  const [newTaskAssignedTo, setNewTaskAssignedTo] = useState('');
  const [newTaskIndicator, setNewTaskIndicator] = useState('');
  const [newTaskIndicatorValue, setNewTaskIndicatorValue] = useState(0);
  const [newTaskProgress, setNewTaskProgress] = useState(0);
  const [newTaskStatus, setNewTaskStatus] = useState('todo');
  const [newTaskType, setNewTaskType] = useState<'quantitative' | 'state' | 'workflow'>('workflow');
  const [workflowSteps, setWorkflowSteps] = useState<{assignedTo: string, label: string, form?: CustomForm, rateCardId?: string, unitsToAdd?: number}[]>([]);
  const [isFormBuilderOpen, setIsFormBuilderOpen] = useState(false);
  const [currentStepIndexForForm, setCurrentStepIndexForForm] = useState<number | null>(null);
  const [isSaveTemplateOpen, setIsSaveTemplateOpen] = useState(false);
  const [isLoadTemplateOpen, setIsLoadTemplateOpen] = useState(false);
  const [workflowCycles, setWorkflowCycles] = useState<number>(1);
  const [newTaskRequiresDoc, setNewTaskRequiresDoc] = useState(false);
  const [newTaskIsRateCard, setNewTaskIsRateCard] = useState(false);
  const [newTaskRateCardId, setNewTaskRateCardId] = useState('');
  const [newTaskUnitsToAdd, setNewTaskUnitsToAdd] = useState(1);
  const [newTaskPriority, setNewTaskPriority] = useState('medium');

  if (!isOpen) return null;

  const resetForm = () => {
    setNewTaskTitle('');
    setNewTaskDesc('');
    setNewTaskStart('');
    setNewTaskEnd('');
    setNewTaskAssignedTo('');
    setNewTaskIndicator('');
    setNewTaskIndicatorValue(0);
    setNewTaskProgress(0);
    setNewTaskStatus('todo');
    setNewTaskPriority('medium');
    setNewTaskType('quantitative');
    setWorkflowSteps([]);
    setWorkflowCycles(1);
    setNewTaskRequiresDoc(false);
    setNewTaskIsRateCard(false);
    setNewTaskRateCardId('');
    setNewTaskUnitsToAdd(1);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !newTaskTitle.trim() || !newTaskStart || !newTaskEnd || !newTaskAssignedTo) {
      toast.warning("Por favor completa todos los campos obligatorios.");
      return;
    }

    setIsCreatingTask(true);

    try {
      const taskData: any = {
        projectId: projectId,
        title: newTaskTitle,
        description: newTaskDesc,
        startDate: new Date(newTaskStart + 'T00:00:00'),
        endDate: new Date(newTaskEnd + 'T00:00:00'),
        assignedTo: newTaskAssignedTo,
        indicator: newTaskType === 'quantitative' ? newTaskIndicator : null,
        indicatorValue: newTaskType === 'quantitative' ? Number(newTaskIndicatorValue) : null,
        status: newTaskType === 'state' ? 'pending' : newTaskStatus,
        progress: newTaskType === 'state' ? 0 : Number(newTaskProgress),
        type: newTaskType,
        requiresDocument: newTaskRequiresDoc,
        linkedDocumentId: null,
        isRateCardTask: newTaskIsRateCard,
        rateCardId: newTaskIsRateCard ? newTaskRateCardId : null,
        unitsToAdd: newTaskIsRateCard ? Number(newTaskUnitsToAdd) : null,
        syncExternal: newTaskIsRateCard ? (rateCards.find(rc => rc.id === newTaskRateCardId)?.syncExternal || false) : false,
        priority: newTaskPriority,
        currentValue: 0,
        displayOrder: tasksLength,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        createdBy: user.uid
      };

      const batch = writeBatch(db);
      const taskRef = doc(collection(db, 'projects', projectId, 'tasks'));
      
      // Handle Rate Card update for initial progress
      if (taskData.isRateCardTask && taskData.rateCardId && taskData.unitsToAdd && taskData.progress > 0 && taskData.type !== 'workflow') {
        const rcRef = doc(db, 'projects', projectId, 'rateCards', taskData.rateCardId);
        const units = (taskData.progress / 100) * taskData.unitsToAdd;
        const updateData: any = {
          currentValue: increment(units)
        };
        if (taskData.assignedTo) {
          updateData[`userStats.${taskData.assignedTo}`] = increment(units);
        }
        batch.update(rcRef, updateData);
      }

      if (newTaskType === 'workflow') {
        taskData.workflowSteps = workflowSteps.map(step => ({
          ...step,
          status: 'not_started'
        }));
        taskData.currentStepIndex = 0;
        taskData.workflowHistory = [];
        taskData.progress = 0;
        taskData.workflowCycles = workflowCycles;
        taskData.currentCycle = 1;

        if (workflowCycles > 1) {
          taskData.isParentTask = true;
          taskData.totalCycles = workflowCycles;
          const parentDocRef = await addDoc(collection(db, 'projects', projectId, 'tasks'), taskData);
          
          for (let i = 1; i <= workflowCycles; i++) {
            const subTaskRef = doc(collection(db, 'projects', projectId, 'tasks'));
            const subTaskData = {
              ...taskData,
              title: newTaskTitle,
              isParentTask: false,
              parentTaskId: parentDocRef.id,
              cycleNumber: i,
              displayOrder: tasksLength + i,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            };
            batch.set(subTaskRef, subTaskData);
          }
          await batch.commit();
        } else {
          batch.set(taskRef, taskData);
          await batch.commit();
        }
      } else {
        batch.set(taskRef, taskData);
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
              <p className="text-xs text-slate-500">Proyecto: {project?.name}</p>
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
              <label className="text-sm font-bold text-slate-700">Título de la Tarea</label>
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
              <label className="text-sm font-bold text-slate-700">Descripción (Opcional)</label>
              <textarea 
                value={newTaskDesc}
                onChange={(e) => setNewTaskDesc(e.target.value)}
                className="w-full min-h-[80px] p-4 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-sm resize-none"
                placeholder="Detalles de la tarea..."
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-bold text-slate-700">Fecha Inicio</label>
                <input 
                  type="date" 
                  value={newTaskStart}
                  onChange={(e) => setNewTaskStart(e.target.value)}
                  className="w-full h-11 px-4 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-sm"
                  required
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-bold text-slate-700">Fecha Fin</label>
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
                <label className="text-sm font-bold text-slate-700">Asignar a</label>
                <select 
                  value={newTaskAssignedTo}
                  onChange={(e) => setNewTaskAssignedTo(e.target.value)}
                  className="w-full h-11 px-4 rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-sm"
                  required
                >
                  <option value="">Seleccionar miembro...</option>
                  {project?.assignedTeamMembers?.map((memberId: string) => {
                    const member = teamMembers.find(m => m.id === memberId);
                    if (!member) return null;
                    return <option key={member.id} value={member.id}>{member.name}</option>;
                  })}
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-bold text-slate-700">Prioridad</label>
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
                <label className="text-sm font-bold text-slate-700">Estado Inicial</label>
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
                  <label className="text-sm font-bold text-slate-700">Tipo de Tarea</label>
                  <span className="text-[9px] font-bold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-100 uppercase tracking-tighter">Workflow</span>
                </div>
                <select 
                  value={newTaskType}
                  onChange={(e) => setNewTaskType(e.target.value as 'quantitative' | 'state' | 'workflow')}
                  className="w-full h-11 px-4 rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-sm"
                >
                  <option value="workflow">Workflow (Flujo)</option>
                  <option value="quantitative">Cuantitativa</option>
                  <option value="state">Por Estado</option>
                </select>
              </div>
            </div>

            {newTaskType === 'workflow' && (
              <div className="space-y-4 p-4 bg-indigo-50/50 rounded-xl border border-indigo-100">
                <div className="space-y-2 mb-4">
                  <label className="text-xs font-bold text-indigo-600 uppercase tracking-wider">Cantidad de Repeticiones (Sub-tareas)</label>
                  <input 
                    type="number" 
                    min="1"
                    value={workflowCycles}
                    onChange={(e) => setWorkflowCycles(Number(e.target.value))}
                    className="w-full h-10 px-3 rounded-lg border border-indigo-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-sm"
                  />
                  <p className="text-[10px] text-indigo-500">Si es mayor a 1, se crearán múltiples subtareas para este flujo.</p>
                </div>

                <div className="flex items-center justify-between border-t border-indigo-100 pt-4">
                  <label className="text-xs font-bold text-indigo-600 uppercase tracking-wider">Pasos del Workflow</label>
                  <div className="flex items-center gap-2">
                    <Button 
                      type="button" 
                      variant="outline" 
                      size="sm" 
                      onClick={() => setIsLoadTemplateOpen(true)}
                      className="h-7 text-[10px] font-bold text-emerald-600 border-emerald-200 hover:bg-emerald-50"
                    >
                      <Download size={12} className="mr-1" /> PLANTILLA
                    </Button>
                    {workflowSteps.length > 0 && (
                      <Button 
                        type="button" 
                        variant="outline" 
                        size="sm" 
                        onClick={() => setIsSaveTemplateOpen(true)}
                        className="h-7 text-[10px] font-bold text-indigo-600 border-indigo-200 hover:bg-indigo-50"
                      >
                        <Save size={12} className="mr-1" /> GUARDAR
                      </Button>
                    )}
                    <Button 
                      type="button" 
                      variant="ghost" 
                      size="sm" 
                      onClick={() => setWorkflowSteps([...workflowSteps, { assignedTo: '', label: '', unitsToAdd: 1 }])}
                      className="h-7 text-[10px] font-bold text-indigo-600 hover:bg-indigo-100"
                    >
                      <Plus size={12} className="mr-1" /> AGREGAR PASO
                    </Button>
                  </div>
                </div>
                
                {workflowSteps.length === 0 ? (
                  <p className="text-[10px] text-slate-400 text-center py-2 italic">No hay pasos definidos. Agrega al menos uno.</p>
                ) : (
                  <div className="space-y-3">
                    {workflowSteps.map((step, idx) => (
                      <div key={idx} className="flex flex-col gap-2 bg-white p-3 rounded-lg border border-indigo-100 shadow-sm">
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
                            className={`p-1.5 rounded-md transition-colors ${step.form ? 'text-indigo-600 bg-indigo-50 hover:bg-indigo-100' : 'text-slate-400 hover:text-indigo-600 hover:bg-slate-100'}`}
                            title={step.form ? "Editar Formulario" : "Agregar Formulario"}
                          >
                            <ClipboardList size={14} />
                          </button>
                          <button 
                            type="button"
                            onClick={() => setWorkflowSteps(workflowSteps.filter((_, i) => i !== idx))}
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
                            {project?.assignedTeamMembers?.map((memberId: string) => {
                              const member = teamMembers.find(m => m.id === memberId);
                              if (!member) return null;
                              return <option key={member.id} value={member.id}>{member.name}</option>;
                            })}
                          </select>

                          <select
                            value={step.rateCardId || ''}
                            onChange={(e) => {
                              const newSteps = [...workflowSteps];
                              newSteps[idx].rateCardId = e.target.value || undefined;
                              setWorkflowSteps(newSteps);
                            }}
                            className="flex-1 h-8 px-2 text-[10px] border border-slate-100 focus:ring-0 bg-slate-50 rounded"
                          >
                            <option value="">Sin Rate Card</option>
                            {rateCards.map(rc => (
                              <option key={rc.id} value={rc.id}>{rc.name}</option>
                            ))}
                          </select>

                          {step.rateCardId && (
                            <input 
                              type="number"
                              min="0.1"
                              step="0.1"
                              value={step.unitsToAdd || 1}
                              onChange={(e) => {
                                const newSteps = [...workflowSteps];
                                newSteps[idx].unitsToAdd = Number(e.target.value);
                                setWorkflowSteps(newSteps);
                              }}
                              className="w-16 h-8 px-2 text-[10px] border border-slate-100 focus:ring-0 bg-slate-50 rounded"
                              placeholder="Unid."
                            />
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {newTaskType === 'quantitative' && (
              <div className="grid grid-cols-2 gap-4 p-4 bg-slate-50 rounded-xl border border-slate-100">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Indicador</label>
                  <input 
                    type="text" 
                    value={newTaskIndicator}
                    onChange={(e) => setNewTaskIndicator(e.target.value)}
                    className="w-full h-10 px-3 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-sm"
                    placeholder="Ej. Horas"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Meta</label>
                  <input 
                    type="number" 
                    value={newTaskIndicatorValue}
                    onChange={(e) => setNewTaskIndicatorValue(Number(e.target.value))}
                    className="w-full h-10 px-3 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-sm"
                  />
                </div>
              </div>
            )}

            <div className="flex items-center gap-3 pt-4 border-t border-slate-100">
              <input 
                type="checkbox" 
                id="isRateCardModal"
                checked={newTaskIsRateCard}
                onChange={(e) => setNewTaskIsRateCard(e.target.checked)}
                className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
              />
              <label htmlFor="isRateCardModal" className="text-sm font-medium text-slate-700 cursor-pointer">
                Vincular a un perfil de Rate Card
              </label>
            </div>

            {newTaskIsRateCard && (
              <div className="grid grid-cols-2 gap-4 p-4 bg-emerald-50 rounded-xl border border-emerald-100 animate-in slide-in-from-top-2 duration-200">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-emerald-600 uppercase tracking-wider">Seleccionar Perfil</label>
                  <select 
                    value={newTaskRateCardId}
                    onChange={(e) => {
                      setNewTaskRateCardId(e.target.value);
                      const rc = rateCards.find(r => r.id === e.target.value);
                      if (rc) setNewTaskIndicator(rc.indicator);
                    }}
                    className="w-full h-11 px-4 rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-sm"
                    required={newTaskIsRateCard}
                  >
                    <option value="">Seleccionar...</option>
                    {rateCards.map(rc => (
                      <option key={rc.id} value={rc.id}>{rc.name}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-emerald-600 uppercase tracking-wider">Unidades a sumar</label>
                  <input 
                    type="number" 
                    step="0.1"
                    min="0.1"
                    value={newTaskUnitsToAdd}
                    onChange={(e) => setNewTaskUnitsToAdd(Number(e.target.value))}
                    className="w-full h-10 px-3 rounded-lg border border-emerald-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 text-sm"
                    required={newTaskIsRateCard}
                  />
                </div>
                <p className="col-span-2 text-[10px] text-emerald-600">
                  {newTaskType === 'workflow' 
                    ? 'Las unidades se sumarán automáticamente al finalizar todo el workflow.' 
                    : 'Las unidades se sumarán proporcionalmente al progreso de la tarea.'}
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
              {isCreatingTask ? <Loader2 className="animate-spin" size={20} /> : 'Crear Tarea'}
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
          stepName={workflowSteps[currentStepIndexForForm]?.label || `Paso ${currentStepIndexForForm + 1}`}
          initialForm={workflowSteps[currentStepIndexForForm]?.form}
          onSave={(form) => {
            const newSteps = [...workflowSteps];
            newSteps[currentStepIndexForForm].form = form;
            setWorkflowSteps(newSteps);
          }}
        />
      )}

      <SaveWorkflowTemplateModal 
        isOpen={isSaveTemplateOpen}
        onClose={() => setIsSaveTemplateOpen(false)}
        workflowSteps={workflowSteps}
        user={user}
      />

      <LoadWorkflowTemplateModal 
        isOpen={isLoadTemplateOpen}
        onClose={() => setIsLoadTemplateOpen(false)}
        onSelectTemplate={(steps) => setWorkflowSteps(steps)}
      />
    </div>
  );
}
