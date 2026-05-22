'use client'

import React, { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, doc, updateDoc, arrayUnion, Timestamp, writeBatch, increment } from '@/lib/supabase/document-store';
import { db, auth } from '@/lib/backend';
import { CheckCircle2, XCircle, MessageSquare, Clock, ArrowRight, ArrowLeft, Loader2, AlertCircle, X, ClipboardList, Play, Pause } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { TaskDocumentsViewer } from '@/components/projects/TaskDocumentsViewer';
import { handleDataError, OperationType } from '@/lib/backend-utils';
import { toast } from 'sonner';

import { useAuth } from '@/hooks/useAuth';

const hasRequiredFormValue = (value: any) => {
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return true;
  return value !== undefined && value !== null && String(value).trim().length > 0;
};

const getMultiSelectValue = (value: any): string[] => {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string' && value.trim()) return [value];
  return [];
};

const toggleMultiSelectValue = (value: any, option: string) => {
  const current = getMultiSelectValue(value);
  return current.includes(option)
    ? current.filter((item) => item !== option)
    : [...current, option];
};

const formatFormValue = (value: any) => {
  if (Array.isArray(value)) return value.length > 0 ? value.join(', ') : 'Sin selección';
  if (typeof value === 'boolean') return value ? 'Sí' : 'No';
  return value || 'Sin respuesta';
};

export default function WorkflowTray() {
  const { user } = useAuth();
  const [workflows, setWorkflows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'pending' | 'reviewed'>('pending');
  const [memberId, setMemberId] = useState<string | null>(null);
  
  const [actionModal, setActionModal] = useState<{ isOpen: boolean, task: any, type: 'approve' | 'return' | 'stop' | 'resume' }>({ isOpen: false, task: null, type: 'approve' });
  const [overrideUnits, setOverrideUnits] = useState<number | ''>('');
  const [actionComment, setActionComment] = useState('');
  const [formData, setFormData] = useState<Record<string, any>>({});
  const [nextStepAssignee, setNextStepAssignee] = useState<string>('');
  const [projectTeamMembers, setProjectTeamMembers] = useState<any[]>([]);
  const [docsModalTask, setDocsModalTask] = useState<any>(null);
  const [historyModalTask, setHistoryModalTask] = useState<any>(null);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    let unsubscribeProjects: (() => void) | null = null;
    let taskUnsubscribes: (() => void)[] = [];

    const unsubscribeAuth = auth.onAuthStateChanged(async (user) => {
      if (!user) {
        setWorkflows([]);
        setLoading(false);
        return;
      }

      // First, get the current user's team_member ID
      const fetchUserTeamMemberId = async () => {
        try {
          const { getDocs } = await import('@/lib/supabase/document-store');
          const qTeam = query(collection(db, 'team_members'), where('email', '==', user.email));
          const querySnapshot = await getDocs(qTeam);
          
          let mId = user.uid; // Fallback to uid (e.g., for admin)
          if (!querySnapshot.empty) {
            mId = querySnapshot.docs[0].id;
          }
          setMemberId(mId || null);

          // Now fetch projects and tasks
          const q = query(
            collection(db, 'projects'),
          );

          unsubscribeProjects = onSnapshot(q, (snapshot) => {
            const projectIds = snapshot.docs.map(doc => doc.id);
            
            const allPending: any[] = [];
            let projectsProcessed = 0;

            // Clean up previous task listeners if projects change
            taskUnsubscribes.forEach(unsub => unsub());
            taskUnsubscribes = [];

            if (projectIds.length === 0) {
              setLoading(false);
              return;
            }

            projectIds.forEach(projectId => {
              const tasksQ = query(
                collection(db, 'projects', projectId, 'tasks'),
                where('type', '==', 'workflow'),
                where('status', '!=', 'completed')
              );

              const unsubTask = onSnapshot(tasksQ, (taskSnapshot) => {
                const projectWorkflows = taskSnapshot.docs
                  .map(doc => ({ ...doc.data(), id: doc.id, projectId }))
                  .filter((task: any) => {
                    const currentStep = task.workflowSteps?.[task.currentStepIndex || 0];
                    const isAssigned = currentStep?.assignedTo === mId || currentStep?.assignedTo === user.uid;
                    const isPending = currentStep?.status === 'en_curso' || currentStep?.status === 'reproceso' || currentStep?.status === 'pending' || currentStep?.status === 'detenido';
                    const hasInteracted = task.workflowHistory?.some((h: any) => h.userId === user.uid);
                    
                    return (isAssigned && isPending) || hasInteracted;
                  });

                // Update the list
                setWorkflows(prev => {
                  const otherProjects = prev.filter(p => p.projectId !== projectId);
                  return [...otherProjects, ...projectWorkflows];
                });
                
                projectsProcessed++;
                if (projectsProcessed === projectIds.length) {
                  setLoading(false);
                }
              }, (error) => {
                handleDataError(error, OperationType.GET, `projects/${projectId}/tasks`);
              });
              
              taskUnsubscribes.push(unsubTask);
            });
          }, (error) => {
            handleDataError(error, OperationType.LIST, 'projects');
            setLoading(false);
          });

        } catch (error) {
          console.error("Error fetching user team member ID:", error);
          setLoading(false);
        }
      };

      fetchUserTeamMemberId();
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribeProjects) unsubscribeProjects();
      taskUnsubscribes.forEach(unsub => unsub());
    };
  }, []);

  const confirmAction = async () => {
    if (!user || !actionModal.task) return;
    
    if (!actionComment.trim()) {
      toast.warning("Las observaciones son obligatorias.");
      return;
    }

    const task = actionModal.task;
    const action = actionModal.type;
    const currentIndex = task.currentStepIndex || 0;
    const currentStep = task.workflowSteps[currentIndex];

    // Validate form data if approving and form exists
    if (action === 'approve' && currentStep?.form?.fields) {
      const missingRequired = currentStep.form.fields.some((f: any) => f.required && !hasRequiredFormValue(formData[f.id]));
      if (missingRequired) {
        toast.warning("Por favor complete todos los campos obligatorios del formulario.");
        return;
      }
    }
    
    setProcessingId(task.id);

    try {
      const batch = writeBatch(db);
      const taskRef = doc(db, 'projects', task.projectId, 'tasks', task.id);
      const steps = [...task.workflowSteps];
      
      let nextIndex = currentIndex;
      let newStatus = task.status;
      let progress = task.progress || 0;

      const hasBeenActedUpon = task.workflowHistory?.some((h: any) => h.stepIndex === currentIndex && (h.action === 'approve' || h.action === 'return'));

      // Rate Card Update for the current step (whether approved or returned)
      if (currentStep.rateCardId && (action === 'approve' || action === 'return')) {
        const rcRef = doc(db, 'projects', task.projectId, 'rateCards', currentStep.rateCardId);
        const units = (currentStep.autoAddUnits === false && overrideUnits !== '') ? Number(overrideUnits) : (currentStep.unitsToAdd || 1);
        const assignedUser = currentStep.assignedTo || user?.uid;
        
        const updateData: any = {};
        if (!hasBeenActedUpon) {
          // First attempt: Normal Rate
          updateData.currentValue = increment(units);
          if (assignedUser) {
            updateData[`userStats.${assignedUser}`] = increment(units);
          }
        } else {
          // Second attempt or more: Rework Rate
          updateData.reworkValue = increment(units);
          if (assignedUser) {
            updateData[`userReworkStats.${assignedUser}`] = increment(units);
          }
        }
        batch.update(rcRef, updateData);
      }

      if (action === 'approve') {
        steps[currentIndex].status = 'listo';
        // Save form data to the step
        if (Object.keys(formData).length > 0) {
          steps[currentIndex].formData = formData;
        }

        if (currentIndex < steps.length - 1) {
          nextIndex = currentIndex + 1;
          steps[nextIndex].status = 'en_curso';
          newStatus = 'in_progress';
          
          // Apply dynamic assignee if configured
          if (currentStep.assignsNextStep && nextStepAssignee) {
            steps[nextIndex].assignedTo = nextStepAssignee;
          }
        } else {
          // Last step approved
          newStatus = 'completed';
          
          // Task-level rate card update if whole workflow completes
          if (task.isRateCardTask && task.rateCardId) {
            const rcRef = doc(db, 'projects', task.projectId, 'rateCards', task.rateCardId);
            const units = task.unitsToAdd || 1;
            const assignedUser = task.assignedTo || user?.uid;
            
            // Check if the task was already completed before (i.e., this is a rework of the final step)
            const taskWasCompletedBefore = task.workflowHistory?.some((h: any) => h.stepIndex === steps.length - 1 && h.action === 'approve');
            
            const updateData: any = {};
            if (!taskWasCompletedBefore) {
              updateData.currentValue = increment(units);
              if (assignedUser) {
                updateData[`userStats.${assignedUser}`] = increment(units);
              }
            } else {
              updateData.reworkValue = increment(units);
              if (assignedUser) {
                updateData[`userReworkStats.${assignedUser}`] = increment(units);
              }
            }
            batch.update(rcRef, updateData);
          }
        }
      } else if (action === 'return') {
        // Return
        steps[currentIndex].status = 'devuelto';
        
        if (currentIndex > 0) {
          nextIndex = currentIndex - 1;
          steps[nextIndex].status = 'reproceso';
        }
      } else if (action === 'stop') {
        steps[currentIndex].status = 'detenido';
      } else if (action === 'resume') {
        // Find if it was reproceso before, or just en_curso
        const wasReproceso = task.workflowHistory?.some((h: any) => h.stepIndex === currentIndex && h.action === 'return');
        steps[currentIndex].status = wasReproceso ? 'reproceso' : 'en_curso';
      }

      progress = Math.round((nextIndex / steps.length) * 100);
      if (newStatus === 'completed') progress = 100;

      batch.update(taskRef, {
        workflowSteps: steps,
        currentStepIndex: nextIndex,
        status: newStatus,
        progress: progress,
        updatedAt: Timestamp.now(),
        workflowHistory: arrayUnion({
          stepIndex: currentIndex,
          userId: user.uid,
          userName: user.displayName || user.email || 'Usuario',
          action: action,
          comment: actionComment,
          formData: action === 'approve' ? formData : null,
          nextStepAssignee: action === 'approve' && currentStep.assignsNextStep ? nextStepAssignee : null,
          timestamp: Timestamp.now()
        })
      });

      await batch.commit();

      if (task.parentTaskId) {
        const { updateParentTaskStatus } = await import('@/lib/taskUtils');
        await updateParentTaskStatus(task.projectId, task.parentTaskId);
      }

      setActionModal({ isOpen: false, task: null, type: 'approve' });
      setActionComment('');
      setFormData({});
    } catch (error) {
      console.error('Error updating workflow:', error);
    } finally {
      setProcessingId(null);
    }
  };

  const openActionModal = async (task: any, type: 'approve' | 'return' | 'stop' | 'resume') => {
    setActionModal({ isOpen: true, task, type });
    setActionComment('');
    setFormData({});
    setNextStepAssignee('');
    
    const currentStep = task.workflowSteps?.[task.currentStepIndex || 0];
    setOverrideUnits(currentStep?.unitsToAdd || 1);

    if (type === 'approve' && currentStep?.assignsNextStep) {
      try {
        const { getDoc } = await import('@/lib/supabase/document-store');
        const projectRef = doc(db, 'projects', task.projectId);
        const projectSnap = await getDoc(projectRef);
        
        if (projectSnap.exists()) {
          const projectData = projectSnap.data();
          const assignedMemberIds = projectData.assignedTeamMembers || [];
          
          if (assignedMemberIds.length > 0) {
            const { getDocs } = await import('@/lib/supabase/document-store');
            const teamQ = query(collection(db, 'team_members'), where('__name__', 'in', assignedMemberIds));
            const teamSnap = await getDocs(teamQ);
            const members = teamSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setProjectTeamMembers(members);
          } else {
            setProjectTeamMembers([]);
          }
        }
      } catch (error) {
        console.error('Error fetching team members:', error);
      }
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  const filteredWorkflows = workflows.filter(task => {
    const searchLower = searchTerm.toLowerCase();
    const externalId = (task.externalWorkflowId || '').toLowerCase();
    const taskId = (task.id || '').toLowerCase();
    const title = (task.title || '').toLowerCase();
    const currentStepStatus = (task.workflowSteps?.[task.currentStepIndex]?.status || '').toLowerCase();
    
    // Filter by tab
    const currentStep = task.workflowSteps?.[task.currentStepIndex || 0];
    
    // We need to re-evaluate isPending for the current user
    // Let's use a more robust check
    const isPendingForMe = (currentStep?.assignedTo === user?.uid || currentStep?.assignedTo === memberId) && 
                           (currentStep?.status === 'en_curso' || currentStep?.status === 'reproceso' || currentStep?.status === 'pending' || currentStep?.status === 'detenido');
    const hasInteracted = task.workflowHistory?.some((h: any) => h.userId === user?.uid);

    if (activeTab === 'pending') {
      if (!isPendingForMe) return false;
    } else {
      // Reviewed: I have interacted AND it's not currently pending for me
      if (!hasInteracted || isPendingForMe) return false;
    }

    return externalId.includes(searchLower) || 
           taskId.includes(searchLower) || 
           title.includes(searchLower) ||
           currentStepStatus.includes(searchLower);
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <h2 className="text-2xl font-bold text-slate-900">Bandeja de Workflows</h2>
          <div className="flex bg-slate-100 p-1 rounded-lg">
            <button
              onClick={() => setActiveTab('pending')}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                activeTab === 'pending'
                  ? 'bg-white text-indigo-600 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              Pendientes
            </button>
            <button
              onClick={() => setActiveTab('reviewed')}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                activeTab === 'reviewed'
                  ? 'bg-white text-indigo-600 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              Revisados
            </button>
          </div>
        </div>
        <div className="w-full sm:w-72">
          <input
            type="text"
            placeholder="Buscar por ID, título o estado..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
          />
        </div>
      </div>

      {filteredWorkflows.length === 0 ? (
        <div className="bg-white rounded-xl border border-dashed border-slate-300 p-12 text-center">
          <CheckCircle2 className="w-12 h-12 text-slate-200 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-slate-900">
            {searchTerm ? 'No se encontraron resultados' : '¡Todo al día!'}
          </h3>
          <p className="text-slate-500">
            {searchTerm ? 'Intenta con otros términos de búsqueda.' : 'No tienes workflows pendientes de aprobación.'}
          </p>
        </div>
      ) : (
        <div className="grid gap-4">
          {filteredWorkflows.map((task) => {
            const isReturned = task.workflowSteps[task.currentStepIndex]?.status === 'devuelto' || task.workflowSteps[task.currentStepIndex]?.status === 'returned';
            return (
            <div key={task.id} className={`bg-white rounded-xl border shadow-sm overflow-hidden hover:shadow-md transition-shadow ${isReturned ? 'border-red-300' : 'border-slate-200'}`}>
              <div className="p-5">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`px-2 py-0.5 text-[10px] font-bold rounded uppercase tracking-wider ${isReturned || task.workflowSteps[task.currentStepIndex]?.status === 'detenido' ? 'bg-red-50 text-red-600' : 'bg-indigo-50 text-indigo-600'}`}>
                        Workflow {isReturned && '- Devuelto'} {task.workflowSteps[task.currentStepIndex]?.status === 'detenido' && '- Detenido'}
                      </span>
                      <span className="text-xs text-slate-400">
                        Paso {task.currentStepIndex + 1} de {task.workflowSteps.length}
                      </span>
                    </div>
                    <h3 className="text-lg font-bold text-slate-900">
                      {task.externalWorkflowId ? `[${task.externalWorkflowId}] ` : ''}{task.title}
                    </h3>
                    <p className="text-sm text-slate-500 mt-1">{task.description}</p>
                  </div>
                  <div className="text-right">
                    <div className="flex items-center gap-1 text-xs text-slate-400 mb-1">
                      <Clock size={12} />
                      <span>Iniciado {format(task.createdAt.toDate(), 'd MMM', { locale: es })}</span>
                    </div>
                  </div>
                </div>

                <div className={`rounded-lg p-4 mb-4 ${isReturned ? 'bg-red-50' : 'bg-slate-50'}`}>
                  <div className="flex items-center gap-3 mb-4">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold ${isReturned ? 'bg-red-600' : 'bg-indigo-600'}`}>
                      {task.currentStepIndex + 1}
                    </div>
                    <div>
                      <p className={`text-xs font-bold uppercase tracking-wider ${isReturned ? 'text-red-400' : 'text-slate-400'}`}>Paso Actual</p>
                      <p className={`text-sm font-medium ${isReturned ? 'text-red-700' : 'text-slate-700'}`}>{task.workflowSteps[task.currentStepIndex].label}</p>
                    </div>
                  </div>
                  
                  {/* Visual Stepper */}
                  <div className="relative pt-2 pb-4">
                    <div className="absolute top-5 left-0 w-full h-0.5 bg-slate-200" />
                    <div className="relative flex justify-between">
                      {task.workflowSteps.map((step: any, index: number) => {
                        let stepStatus = 'pending'; // gray
                        if (index < task.currentStepIndex) stepStatus = 'completed'; // green
                        if (index === task.currentStepIndex) {
                          stepStatus = isReturned ? 'returned' : 'current'; // red or indigo
                        }
                        if (task.workflowSteps[index].status === 'detenido') {
                          stepStatus = 'stopped';
                        }

                        let bgColor = 'bg-slate-200';
                        let borderColor = 'border-slate-200';
                        let textColor = 'text-slate-400';

                        if (stepStatus === 'completed') {
                          bgColor = 'bg-emerald-500';
                          borderColor = 'border-emerald-500';
                          textColor = 'text-emerald-700';
                        } else if (stepStatus === 'current') {
                          bgColor = 'bg-white';
                          borderColor = 'border-indigo-600';
                          textColor = 'text-indigo-700';
                        } else if (stepStatus === 'returned') {
                          bgColor = 'bg-white';
                          borderColor = 'border-red-500';
                          textColor = 'text-red-600';
                        } else if (stepStatus === 'stopped') {
                          bgColor = 'bg-white';
                          borderColor = 'border-red-500';
                          textColor = 'text-red-600';
                        }

                        return (
                          <div key={index} className="flex flex-col items-center relative z-10" style={{ width: `${100 / task.workflowSteps.length}%` }}>
                            <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center mb-2 bg-white ${borderColor}`}>
                              {stepStatus === 'completed' ? (
                                <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                              ) : stepStatus === 'returned' ? (
                                <XCircle className="w-3 h-3 text-red-500" />
                              ) : stepStatus === 'stopped' ? (
                                <AlertCircle className="w-3 h-3 text-red-500" />
                              ) : (
                                <span className={`text-[10px] font-bold ${stepStatus === 'current' ? 'text-indigo-600' : 'text-slate-400'}`}>
                                  {index + 1}
                                </span>
                              )}
                            </div>
                            <span className={`text-[10px] font-medium text-center px-1 leading-tight ${textColor} line-clamp-2`}>
                              {step.label}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {isReturned && (
                    <div className="mt-3 flex items-start gap-2 text-sm text-red-600 bg-red-100/50 p-3 rounded-md">
                      <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                      <p>Esta tarea ha sido devuelta. Por favor revise las observaciones en el historial.</p>
                    </div>
                  )}
                  {task.workflowSteps[task.currentStepIndex]?.status === 'detenido' && (
                    <div className="mt-3 flex items-start gap-2 text-sm text-orange-600 bg-orange-100/50 p-3 rounded-md">
                      <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                      <p>Este workflow ha sido detenido manualmente. Debe reanudarlo para poder continuar con el flujo.</p>
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    {activeTab === 'pending' && (
                      <>
                        {task.workflowSteps[task.currentStepIndex]?.status === 'detenido' ? (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openActionModal(task, 'resume')}
                            disabled={processingId === task.id}
                            className="text-blue-600 border-blue-100 hover:bg-blue-50"
                          >
                            <Play className="w-4 h-4 mr-2" />
                            Reanudar
                          </Button>
                        ) : (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openActionModal(task, 'stop')}
                            disabled={processingId === task.id}
                            className="text-orange-600 border-orange-100 hover:bg-orange-50"
                          >
                            <Pause className="w-4 h-4 mr-2" />
                            Detener
                          </Button>
                        )}
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openActionModal(task, 'return')}
                          disabled={processingId === task.id || task.currentStepIndex === 0 || task.workflowSteps[task.currentStepIndex]?.status === 'detenido'}
                          className="text-red-600 border-red-100 hover:bg-red-50"
                        >
                          <ArrowLeft className="w-4 h-4 mr-2" />
                          Devolver
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => openActionModal(task, 'approve')}
                          disabled={processingId === task.id || task.workflowSteps[task.currentStepIndex]?.status === 'detenido'}
                          className="bg-emerald-600 hover:bg-emerald-700 text-white"
                        >
                          {task.currentStepIndex === task.workflowSteps.length - 1 ? (
                            <>
                              <CheckCircle2 className="w-4 h-4 mr-2" />
                              Finalizar Workflow
                            </>
                          ) : (
                            <>
                              <ArrowRight className="w-4 h-4 mr-2" />
                              Aprobar y Continuar
                            </>
                          )}
                        </Button>
                      </>
                    )}
                    {activeTab === 'reviewed' && (
                      <span className="text-xs font-medium text-slate-400 italic bg-slate-50 px-3 py-1.5 rounded-md border border-slate-100">
                        Solo lectura (Ya revisado por usted)
                      </span>
                    )}
                  </div>
                  
                  <div className="flex items-center gap-3">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setDocsModalTask(task)}
                      className="text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50"
                    >
                      Ver Documentos
                    </Button>
                    {task.workflowHistory && task.workflowHistory.length > 0 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setHistoryModalTask(task)}
                        className="flex items-center gap-1 text-slate-500 hover:text-slate-700 hover:bg-slate-100"
                      >
                        <MessageSquare size={14} />
                        <span className="text-xs">{task.workflowHistory.length} interacciones</span>
                      </Button>
                    )}
                  </div>
                </div>
              </div>
              
              {/* Progress bar at the bottom */}
              <div className="h-1 w-full bg-slate-100">
                <div 
                  className={`h-full transition-all duration-500 ${isReturned ? 'bg-red-500' : 'bg-indigo-600'}`}
                  style={{ width: `${((task.currentStepIndex) / task.workflowSteps.length) * 100}%` }}
                />
              </div>
            </div>
          )})}
        </div>
      )}

      {/* Action Modal */}
      {actionModal.isOpen && actionModal.task && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="p-6 border-b border-slate-100">
              <h2 className="text-xl font-bold text-slate-800">
                {actionModal.type === 'approve' ? 'Aprobar y Continuar' : 
                 actionModal.type === 'return' ? 'Devolver Tarea' :
                 actionModal.type === 'stop' ? 'Detener Workflow' : 'Reanudar Workflow'}
              </h2>
              <p className="text-sm text-slate-500 mt-1">
                ¿Está seguro de {actionModal.type === 'approve' ? 'remitir' : 
                                 actionModal.type === 'return' ? 'devolver' :
                                 actionModal.type === 'stop' ? 'detener' : 'reanudar'} la tarea &quot;{actionModal.task.title}&quot;?
              </p>
            </div>
            
            <div className="p-6 space-y-4 bg-slate-50 max-h-[60vh] overflow-y-auto">
              {actionModal.type === 'approve' && actionModal.task.workflowSteps[actionModal.task.currentStepIndex || 0]?.form && (
                <div className="space-y-4 mb-6 pb-6 border-b border-slate-200">
                  <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                    <ClipboardList size={16} className="text-indigo-600" />
                    {actionModal.task.workflowSteps[actionModal.task.currentStepIndex || 0].form.title}
                  </h3>
                  
                  {actionModal.task.workflowSteps[actionModal.task.currentStepIndex || 0].form.fields.map((field: any) => (
                    <div key={field.id}>
                      <label className="block text-sm font-medium text-slate-700 mb-1">
                        {field.label} {field.required && <span className="text-red-500">*</span>}
                      </label>
                      
                      {field.type === 'text' && (
                        <input
                          type="text"
                          value={formData[field.id] || ''}
                          onChange={(e) => setFormData({...formData, [field.id]: e.target.value})}
                          className="w-full bg-white border border-slate-200 rounded-lg p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                          required={field.required}
                        />
                      )}
                      
                      {field.type === 'number' && (
                        <input
                          type="number"
                          value={formData[field.id] || ''}
                          onChange={(e) => setFormData({...formData, [field.id]: e.target.value})}
                          className="w-full bg-white border border-slate-200 rounded-lg p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                          required={field.required}
                        />
                      )}
                      
                      {field.type === 'date' && (
                        <input
                          type="date"
                          value={formData[field.id] || ''}
                          onChange={(e) => setFormData({...formData, [field.id]: e.target.value})}
                          className="w-full bg-white border border-slate-200 rounded-lg p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                          required={field.required}
                        />
                      )}
                      
                      {field.type === 'select' && (
                        <div className="rounded-lg border border-slate-200 bg-white p-3">
                          {field.options?.length ? (
                            field.selectionMode === 'single' ? (
                              <select
                                value={Array.isArray(formData[field.id]) ? (formData[field.id][0] || '') : (formData[field.id] || '')}
                                onChange={(e) => setFormData({...formData, [field.id]: e.target.value})}
                                className="w-full bg-white border border-slate-200 rounded-lg p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                                required={field.required}
                              >
                                <option value="">Selecciona una opción</option>
                                {field.options.map((opt: string, idx: number) => (
                                  <option key={idx} value={opt}>
                                    {opt}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <div className="space-y-2">
                                {field.options.map((opt: string, idx: number) => {
                                  const selectedValues = getMultiSelectValue(formData[field.id]);
                                  return (
                                    <label key={idx} className="flex items-center gap-2 text-sm text-slate-700">
                                      <input
                                        type="checkbox"
                                        checked={selectedValues.includes(opt)}
                                        onChange={() =>
                                          setFormData({
                                            ...formData,
                                            [field.id]: toggleMultiSelectValue(formData[field.id], opt),
                                          })
                                        }
                                        className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 w-4 h-4"
                                      />
                                      {opt}
                                    </label>
                                  );
                                })}
                              </div>
                            )
                          ) : (
                            <p className="text-xs text-amber-600">
                              Este campo no tiene opciones configuradas.
                            </p>
                          )}
                          <p className="text-[10px] text-slate-400">
                            {field.selectionMode === 'single'
                              ? 'Selecciona una sola opción.'
                              : 'Puedes seleccionar una o varias opciones.'}
                          </p>
                        </div>
                      )}
                      
                      {field.type === 'checkbox' && (
                        <div className="flex items-center gap-2 mt-2">
                          <input
                            type="checkbox"
                            id={`cb-${field.id}`}
                            checked={formData[field.id] || false}
                            onChange={(e) => setFormData({...formData, [field.id]: e.target.checked})}
                            className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 w-4 h-4"
                            required={field.required}
                          />
                          <label htmlFor={`cb-${field.id}`} className="text-sm text-slate-600 cursor-pointer">
                            Confirmar
                          </label>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {actionModal.type === 'approve' && actionModal.task.workflowSteps[actionModal.task.currentStepIndex || 0]?.assignsNextStep && (
                <div className="mb-4">
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Asignar siguiente paso a <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={nextStepAssignee}
                    onChange={(e) => setNextStepAssignee(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-lg p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                    required
                  >
                    <option value="">Seleccione un responsable...</option>
                    {projectTeamMembers.map(member => (
                      <option key={member.id} value={member.id}>{member.name}</option>
                    ))}
                  </select>
                </div>
              )}

              {actionModal.task.workflowSteps[actionModal.task.currentStepIndex || 0]?.rateCardId && 
               actionModal.task.workflowSteps[actionModal.task.currentStepIndex || 0]?.autoAddUnits === false && (
                <div className="mb-4">
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Unidades a sumar para este paso <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    min="0.1"
                    step="0.1"
                    value={overrideUnits}
                    onChange={(e) => setOverrideUnits(e.target.value === '' ? '' : Number(e.target.value))}
                    className="w-full bg-white border border-slate-200 rounded-lg p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                    required
                  />
                  <p className="text-[10px] text-slate-500 mt-1">Este paso requiere confirmación manual de las unidades a sumar al Rate Card.</p>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Observaciones <span className="text-red-500">*</span>
                </label>
                <textarea
                  placeholder="Ingrese sus observaciones (obligatorio)..."
                  value={actionComment}
                  onChange={(e) => setActionComment(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-lg p-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 resize-none h-24"
                  required
                />
              </div>
            </div>

            <div className="p-6 border-t border-slate-100 flex items-center justify-end gap-3">
              <Button
                variant="outline"
                onClick={() => setActionModal({ isOpen: false, task: null, type: 'approve' })}
              >
                Cancelar
              </Button>
              <Button
                onClick={confirmAction}
                disabled={!actionComment.trim() || processingId === actionModal.task.id || (actionModal.type === 'approve' && actionModal.task.workflowSteps[actionModal.task.currentStepIndex || 0]?.assignsNextStep && !nextStepAssignee) || (actionModal.task.workflowSteps[actionModal.task.currentStepIndex || 0]?.rateCardId && actionModal.task.workflowSteps[actionModal.task.currentStepIndex || 0]?.autoAddUnits === false && overrideUnits === '')}
                className={
                  actionModal.type === 'approve' ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : 
                  actionModal.type === 'return' ? 'bg-red-600 hover:bg-red-700 text-white' :
                  actionModal.type === 'stop' ? 'bg-orange-600 hover:bg-orange-700 text-white' :
                  'bg-blue-600 hover:bg-blue-700 text-white'
                }
              >
                {processingId === actionModal.task.id ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : actionModal.type === 'approve' ? (
                  <CheckCircle2 className="w-4 h-4 mr-2" />
                ) : actionModal.type === 'return' ? (
                  <ArrowLeft className="w-4 h-4 mr-2" />
                ) : actionModal.type === 'stop' ? (
                  <Pause className="w-4 h-4 mr-2" />
                ) : (
                  <Play className="w-4 h-4 mr-2" />
                )}
                {actionModal.type === 'approve' ? 'Confirmar y Remitir' : 
                 actionModal.type === 'return' ? 'Confirmar Devolución' :
                 actionModal.type === 'stop' ? 'Confirmar Detención' : 'Confirmar Reanudación'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* History Modal */}
      {historyModalTask && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden max-h-[90vh] flex flex-col">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between shrink-0">
              <div>
                <h2 className="text-xl font-bold text-slate-800">Historial de Interacciones</h2>
                <p className="text-sm text-slate-500 mt-1">
                  {historyModalTask.externalWorkflowId ? `[${historyModalTask.externalWorkflowId}] ` : ''}{historyModalTask.title}
                </p>
              </div>
              <Button variant="ghost" size="icon" onClick={() => setHistoryModalTask(null)}>
                <X className="w-5 h-5 text-slate-400" />
              </Button>
            </div>
            
            <div className="p-6 overflow-y-auto bg-slate-50 flex-1">
              <div className="space-y-6">
                {historyModalTask.workflowHistory?.slice().reverse().map((history: any, index: number) => (
                  <div key={index} className="flex gap-4">
                    <div className="shrink-0 mt-1">
                      {history.action === 'approve' ? (
                        <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600">
                          <CheckCircle2 size={16} />
                        </div>
                      ) : history.action === 'return' ? (
                        <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center text-red-600">
                          <ArrowLeft size={16} />
                        </div>
                      ) : history.action === 'stop' ? (
                        <div className="w-8 h-8 rounded-full bg-orange-100 flex items-center justify-center text-orange-600">
                          <Pause size={16} />
                        </div>
                      ) : history.action === 'resume' ? (
                        <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600">
                          <Play size={16} />
                        </div>
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600">
                          <MessageSquare size={16} />
                        </div>
                      )}
                    </div>
                    <div className="flex-1 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <p className="text-sm font-bold text-slate-900">
                            {history.userName || 'Usuario'}
                          </p>
                          <p className="text-xs text-slate-500">
                            Paso {history.stepIndex + 1}: {historyModalTask.workflowSteps[history.stepIndex]?.label || 'Desconocido'}
                          </p>
                        </div>
                        <div className="text-right">
                          <span className={`text-xs font-medium px-2 py-1 rounded-full ${
                            history.action === 'approve' ? 'bg-emerald-50 text-emerald-700' :
                            history.action === 'return' ? 'bg-red-50 text-red-700' :
                            history.action === 'stop' ? 'bg-orange-50 text-orange-700' :
                            history.action === 'resume' ? 'bg-blue-50 text-blue-700' :
                            'bg-slate-100 text-slate-700'
                          }`}>
                            {history.action === 'approve' ? 'Aprobado' : 
                             history.action === 'return' ? 'Devuelto' : 
                             history.action === 'stop' ? 'Detenido' :
                             history.action === 'resume' ? 'Reanudado' : 'Comentario'}
                          </span>
                          <p className="text-[10px] text-slate-400 mt-1">
                            {history.timestamp?.toDate ? format(history.timestamp.toDate(), "d MMM yyyy, h:mm a", { locale: es }) : 'Fecha desconocida'}
                          </p>
                        </div>
                      </div>
                      {history.comment && (
                        <div className="mt-3 text-sm text-slate-700 bg-slate-50 p-3 rounded-lg border border-slate-100">
                          {history.comment}
                        </div>
                      )}
                      
                      {history.formData && Object.keys(history.formData).length > 0 && (
                        <div className="mt-3 p-3 bg-indigo-50 border border-indigo-100 rounded-lg">
                          <p className="text-[10px] font-bold text-indigo-600 uppercase tracking-wider mb-2">Datos del Formulario</p>
                          <div className="grid grid-cols-1 gap-2">
                            {Object.entries(history.formData).map(([fieldId, value]: [string, any]) => {
                              const step = historyModalTask.workflowSteps[history.stepIndex];
                              const field = step?.form?.fields?.find((f: any) => f.id === fieldId);
                              return (
                                <div key={fieldId} className="flex justify-between items-start border-b border-indigo-100/50 pb-1 last:border-0">
                                  <span className="text-xs font-medium text-slate-600">{field?.label || fieldId}:</span>
                                  <span className="text-xs font-bold text-slate-800 text-right">
                                    {formatFormValue(value)}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                
                {(!historyModalTask.workflowHistory || historyModalTask.workflowHistory.length === 0) && (
                  <div className="text-center py-8 text-slate-500">
                    <MessageSquare className="w-12 h-12 mx-auto text-slate-200 mb-3" />
                    <p>No hay interacciones registradas aún.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Documents Modal */}
      <TaskDocumentsViewer
        isOpen={!!docsModalTask}
        onClose={() => setDocsModalTask(null)}
        task={docsModalTask}
        userId={user?.uid || ''}
      />
    </div>
  );
}
