import React, { useState, useEffect } from 'react';
import { X, Save, CheckCircle2, Circle } from 'lucide-react';
import { doc, updateDoc, serverTimestamp, addDoc, collection, writeBatch, increment } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { toast } from 'sonner';

interface TaskDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  task: any;
  projectId: string;
}

export const TaskDetailsModal: React.FC<TaskDetailsModalProps> = ({
  isOpen,
  onClose,
  task,
  projectId
}) => {
  const [documentation, setDocumentation] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [workflowSteps, setWorkflowSteps] = useState<any[]>([]);
  const [additionalCycles, setAdditionalCycles] = useState(1);
  const [isAddingCycles, setIsAddingCycles] = useState(false);

  useEffect(() => {
    if (task) {
      setDocumentation(task.documentation || '');
      setWorkflowSteps(task.workflowSteps || []);
      setAdditionalCycles(1);
    }
  }, [task]);

  if (!isOpen || !task) return null;

  const handleAddCycles = async () => {
    if (additionalCycles <= 0) return;
    setIsAddingCycles(true);
    try {
      const batch = writeBatch(db);
      const parentRef = doc(db, 'projects', projectId, 'tasks', task.id);
      
      let currentTotalCycles = task.totalCycles || 1;
      const newTotalCycles = currentTotalCycles + additionalCycles;
      
      const { id, ...taskWithoutId } = task;

      // If it wasn't a parent task before, we need to convert it and create the first cycle subtask
      if (!task.isParentTask) {
        batch.update(parentRef, {
          isParentTask: true,
          totalCycles: newTotalCycles,
          workflowCycles: newTotalCycles,
          updatedAt: serverTimestamp()
        });

        // Create Ciclo 1 with the current task's progress and status
        const cycle1Ref = doc(collection(db, 'projects', projectId, 'tasks'));
        const cycle1Data = {
          ...taskWithoutId,
          title: task.title,
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
          updatedAt: serverTimestamp()
        });
      }

      // Add new subtasks for the additional cycles
      for (let i = 1; i <= additionalCycles; i++) {
        const cycleNumber = currentTotalCycles + i;
        const subTaskRef = doc(collection(db, 'projects', projectId, 'tasks'));
        
        const subTaskData = {
          ...taskWithoutId,
          title: task.title.replace(/ \(Ciclo \d+\)$/, ''),
          isParentTask: false,
          parentTaskId: task.id,
          cycleNumber: cycleNumber,
          displayOrder: (task.displayOrder || 0) + cycleNumber,
          status: 'todo',
          progress: 0,
          currentStepIndex: 0,
          workflowHistory: [],
          workflowSteps: task.workflowSteps?.map((step: any) => {
            const { formData, ...cleanStep } = step;
            return { ...cleanStep, completed: false, status: 'not_started' };
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
      const { updateParentTaskStatus } = await import('@/lib/taskUtils');
      await updateParentTaskStatus(projectId, task.id);
      
      toast.success(`Se agregaron ${additionalCycles} repeticiones exitosamente.`);
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
      const taskRef = doc(db, 'projects', projectId, 'tasks', task.id);
      
      // Calculate progress and status for workflow tasks
      let newProgress = task.progress;
      let newStatus = task.status;
      
      if (task.type === 'workflow' && workflowSteps.length > 0) {
        const approvedCount = workflowSteps.filter(s => s.status === 'listo').length;
        newProgress = Math.round((approvedCount / workflowSteps.length) * 100);
        
        if (newProgress === 100) {
          newStatus = 'completed';
        } else if (newProgress > 0) {
          newStatus = 'in_progress';
        } else {
          newStatus = 'todo';
        }
      }

      // Handle Rate Card updates
      // 1. Check step-level rate card changes
      const oldSteps = task.workflowSteps || [];
      workflowSteps.forEach((step, idx) => {
        const oldStep = oldSteps[idx];
        const wasApproved = oldStep?.status === 'listo';
        const isApproved = step.status === 'listo';
        
        if (wasApproved !== isApproved && step.rateCardId) {
          const rcRef = doc(db, 'projects', projectId, 'rateCards', step.rateCardId);
          const units = step.unitsToAdd || 1;
          const updateData: any = {
            currentValue: increment(isApproved ? units : -units)
          };
          
          if (step.assignedTo) {
            updateData[`userStats.${step.assignedTo}`] = increment(isApproved ? units : -units);
          }
          
          batch.update(rcRef, updateData);
        }
      });

      // 2. Check task-level rate card changes (when whole workflow completes)
      if (task.type === 'workflow' && task.isRateCardTask && task.rateCardId) {
        const wasAllApproved = oldSteps.length > 0 && oldSteps.every((s: any) => s.status === 'listo');
        const isAllApproved = workflowSteps.length > 0 && workflowSteps.every((s: any) => s.status === 'listo');
        
        if (wasAllApproved !== isAllApproved) {
          const rcRef = doc(db, 'projects', projectId, 'rateCards', task.rateCardId);
          const units = task.unitsToAdd || 1;
          const updateData: any = {
            currentValue: increment(isAllApproved ? units : -units)
          };
          
          if (task.assignedTo) {
            updateData[`userStats.${task.assignedTo}`] = increment(isAllApproved ? units : -units);
          }
          
          batch.update(rcRef, updateData);
        }
      }

      batch.update(taskRef, {
        documentation,
        workflowSteps,
        progress: newProgress,
        status: newStatus,
        updatedAt: serverTimestamp()
      });

      await batch.commit();

      if (task.parentTaskId) {
        const { updateParentTaskStatus } = await import('@/lib/taskUtils');
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
      toast.info("No puedes modificar los pasos de una tarea madre. Modifica las subtareas.");
      return;
    }
    const newSteps = [...workflowSteps];
    const currentStatus = newSteps[index].status || 'not_started';
    newSteps[index] = {
      ...newSteps[index],
      status: currentStatus === 'listo' ? 'not_started' : 'listo'
    };
    setWorkflowSteps(newSteps);
  };

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between p-6 border-b border-slate-100">
          <div>
            <h2 className="text-xl font-bold text-slate-800">
              {task.externalWorkflowId ? `[${task.externalWorkflowId}] ` : ''}{task.title}
            </h2>
            <p className="text-sm text-slate-500 mt-1">Detalles y Documentación</p>
          </div>
          <button 
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-8">
          {/* Workflow Steps */}
          {workflowSteps.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-slate-800 mb-4 uppercase tracking-wider">Pasos del Flujo de Trabajo</h3>
              <div className="space-y-2">
                {workflowSteps.map((step, index) => {
                  const isApproved = step.status === 'listo';
                  return (
                    <div 
                      key={index}
                      onClick={() => toggleStep(index)}
                      className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${
                        task.isParentTask ? 'cursor-not-allowed opacity-70' : 'cursor-pointer'
                      } ${
                        isApproved 
                          ? 'bg-emerald-50 border-emerald-200 text-emerald-700' 
                          : 'bg-white border-slate-200 hover:border-indigo-300'
                      }`}
                    >
                      {isApproved ? (
                        <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
                      ) : (
                        <Circle className="w-5 h-5 text-slate-300 shrink-0" />
                      )}
                      <div className="flex-1">
                        <p className={`font-medium ${isApproved ? 'line-through opacity-70' : 'text-slate-700'}`}>
                          {step.label}
                        </p>
                        {step.assignedTo && (
                          <p className="text-xs opacity-70 mt-0.5">Asignado a: {step.assignedTo}</p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Documentation */}
          <div>
            <h3 className="text-sm font-semibold text-slate-800 mb-4 uppercase tracking-wider">Documentación</h3>
            <textarea
              value={documentation}
              onChange={(e) => setDocumentation(e.target.value)}
              placeholder="Escribe aquí la documentación, notas o resultados de esta tarea..."
              className="w-full h-64 p-4 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 resize-none text-slate-700"
            />
          </div>

          {/* Add Cycles for Workflow Tasks */}
          {(task.isParentTask || (task.type === 'workflow' && !task.parentTaskId)) && (
            <div className="pt-6 border-t border-slate-100">
              <h3 className="text-sm font-semibold text-slate-800 mb-4 uppercase tracking-wider">Agregar Repeticiones (Sub-tareas)</h3>
              <div className="flex items-center gap-4 bg-indigo-50/50 p-4 rounded-xl border border-indigo-100">
                <div className="flex-1">
                  <p className="text-sm text-slate-700 mb-2">
                    Esta tarea tiene actualmente <strong>{task.totalCycles || 1}</strong> repeticiones. ¿Deseas agregar más?
                  </p>
                  <div className="flex items-center gap-3">
                    <input
                      type="number"
                      min="1"
                      value={additionalCycles}
                      onChange={(e) => setAdditionalCycles(Number(e.target.value))}
                      className="w-24 h-10 px-3 rounded-lg border border-indigo-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-sm"
                    />
                    <button
                      onClick={handleAddCycles}
                      disabled={isAddingCycles || additionalCycles <= 0}
                      className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50"
                    >
                      {isAddingCycles ? 'Agregando...' : 'Agregar Repeticiones'}
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
            {isSaving ? 'Guardando...' : 'Guardar Cambios'}
          </button>
        </div>
      </div>
    </div>
  );
};
