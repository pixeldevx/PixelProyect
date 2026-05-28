'use client'

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { collection, query, where, onSnapshot, doc, arrayUnion, Timestamp, writeBatch, increment, getDoc, getDocs } from '@/lib/supabase/document-store';
import { db, auth } from '@/lib/backend';
import { CheckCircle2, MessageSquare, Clock, ArrowRight, ArrowLeft, Loader2, X, ClipboardList, Play, Pause, FolderOpen, ShieldCheck, FileText, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { TaskDocumentsViewer } from '@/components/projects/TaskDocumentsViewer';
import { TaskCommentsModal } from '@/components/projects/TaskCommentsModal';
import { handleDataError, OperationType } from '@/lib/backend-utils';
import { toast } from 'sonner';
import { getProgressForTaskStatus, isCompletedTaskStatus } from '@/lib/taskProgress';

import { useAuth } from '@/hooks/useAuth';
import { belongsToAnyOrganization, organizationNameFor } from '@/lib/organizations';

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

const renderHistoryFormValue = (value: any) => {
  const formattedValue = String(formatFormValue(value));
  const isUrl = /^https?:\/\//i.test(formattedValue.trim());

  if (isUrl) {
    return (
      <a
        href={formattedValue}
        target="_blank"
        rel="noreferrer"
        className="min-w-0 break-all text-xs font-bold text-indigo-700 underline decoration-indigo-300 underline-offset-2 [overflow-wrap:anywhere] hover:text-indigo-900"
      >
        {formattedValue}
      </a>
    );
  }

  return (
    <span className="min-w-0 whitespace-pre-wrap break-words text-xs font-bold text-slate-800 [overflow-wrap:anywhere]">
      {formattedValue}
    </span>
  );
};

const isWorkflowItem = (task: any) =>
  task?.trayItemType === 'workflow' || (task?.type === 'workflow' && Array.isArray(task?.workflowSteps));

const isAssignedToCurrentUser = (task: any, assignedIds: string[]) => {
  if (task?.assignedTo && assignedIds.includes(task.assignedTo)) return true;
  if (Array.isArray(task?.assignedUsers) && task.assignedUsers.some((id: string) => assignedIds.includes(id))) return true;
  if (Array.isArray(task?.assignedTeamMembers) && task.assignedTeamMembers.some((id: string) => assignedIds.includes(id))) return true;
  return false;
};

const isOpenTask = (task: any) => {
  const status = task?.status || 'todo';
  return status !== 'completed' && status !== 'completed_late' && status !== 'listo';
};

const getTaskStatusLabel = (status: string) => {
  switch (status) {
    case 'completed':
      return 'Finalizada';
    case 'completed_late':
      return 'Finalizada con retraso';
    case 'in_progress':
      return 'Trabajando';
    case 'stuck':
      return 'Estancada';
    case 'pending':
    case 'todo':
      return 'Pendiente';
    default:
      return status || 'Pendiente';
  }
};

const getTaskStatusClass = (status: string) => {
  switch (status) {
    case 'completed':
      return 'bg-emerald-50 text-emerald-700';
    case 'completed_late':
      return 'bg-orange-50 text-orange-700';
    case 'in_progress':
      return 'bg-amber-50 text-amber-700';
    case 'stuck':
      return 'bg-red-50 text-red-700';
    case 'pending':
    case 'todo':
      return 'bg-slate-100 text-slate-700';
    default:
      return 'bg-slate-100 text-slate-700';
  }
};

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

const isAfterTaskDeadline = (task: any, date = new Date()) => {
  const endDate = getTaskDate(task?.endDate || task?.end);
  if (!endDate) return false;
  return date.getTime() > endDate.getTime();
};

const normalizeCompletionStatus = (nextStatus: string, task: any) => {
  if (nextStatus !== 'completed') return nextStatus;
  return isAfterTaskDeadline(task) ? 'completed_late' : 'completed';
};

const isDynamicRateCardEnabled = (source: any) =>
  Boolean(source?.dynamicRateCard || source?.rateCardMode === 'dynamic' || source?.dynamicRateCardConfig);

const getDynamicRateCardUnits = (source: any) =>
  Number(source?.dynamicRateCardConfig?.defaultUnits || source?.unitsToAdd || 1);

const shouldRequestDynamicRateCardUnits = (source: any) =>
  source?.autoAddUnits === false || source?.dynamicRateCardConfig?.promptForUnits === true;

const getDateKeys = (date = new Date()) => {
  const year = date.getFullYear();
  const dateKey = date.toISOString().slice(0, 10);
  const monthKey = `${year}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  const startOfYear = new Date(year, 0, 1);
  const dayOfYear = Math.floor((date.getTime() - startOfYear.getTime()) / 86400000) + 1;
  const weekKey = `${year}-W${String(Math.ceil(dayOfYear / 7)).padStart(2, '0')}`;

  return { dateKey, weekKey, monthKey };
};

const getWorkflowDynamicRateCardSource = (task: any, action: string) => {
  const currentIndex = task?.currentStepIndex || 0;
  const currentStep = task?.workflowSteps?.[currentIndex];

  if ((action === 'approve' || action === 'return') && isDynamicRateCardEnabled(currentStep)) {
    return {
      source: 'workflow_step',
      sourceConfig: currentStep,
      stepIndex: currentIndex,
    };
  }

  if (
    action === 'approve' &&
    Array.isArray(task?.workflowSteps) &&
    currentIndex === task.workflowSteps.length - 1 &&
    isDynamicRateCardEnabled(task)
  ) {
    return {
      source: 'workflow_task',
      sourceConfig: task,
      stepIndex: currentIndex,
    };
  }

  return null;
};

const isQualityGateStep = (step: any) =>
  Boolean(step?.isQualityGate || step?.type === 'quality_gate' || step?.taskType === 'quality_gate');

const getQualityParticipantIds = (task: any, currentIndex: number, currentStep: any, reviewerId: string | null, userId?: string) => {
  const previousStep = currentIndex > 0 ? task.workflowSteps?.[currentIndex - 1] : null;
  const professionalId =
    (previousStep?.assignedTo && previousStep.assignedTo !== 'DYNAMIC' ? previousStep.assignedTo : null) ||
    task.assignedTo ||
    task.assignedTeamMembers?.[0] ||
    task.assignedUsers?.[0] ||
    userId ||
    null;

  const qualityReviewerId =
    (currentStep?.assignedTo && currentStep.assignedTo !== 'DYNAMIC' ? currentStep.assignedTo : null) ||
    reviewerId ||
    userId ||
    null;

  return { professionalId, reviewerId: qualityReviewerId };
};

const getDueState = (task: any) => {
  const status = task?.status || 'todo';
  if (status === 'completed' || status === 'completed_late' || status === 'listo') return 'closed';

  const endDate = getTaskDate(task?.endDate || task?.end);
  if (!endDate) return 'none';

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const endOfDay = new Date(endDate);
  endOfDay.setHours(23, 59, 59, 999);

  if (endOfDay.getTime() < today.getTime()) return 'overdue';

  const msUntilDue = endOfDay.getTime() - Date.now();
  return msUntilDue <= 2 * 24 * 60 * 60 * 1000 ? 'due_soon' : 'ok';
};

const getInboxUrgencyStyles = (dueState: string) => {
  switch (dueState) {
    case 'overdue':
      return {
        row: 'border-red-200 bg-red-50 hover:bg-red-100/80',
        rail: 'bg-red-600',
        due: 'bg-red-600 text-white shadow-sm',
        text: 'text-red-700',
        progress: 'bg-red-600',
      };
    case 'due_soon':
      return {
        row: 'border-orange-200 bg-orange-50 hover:bg-orange-100/80',
        rail: 'bg-orange-500',
        due: 'bg-orange-500 text-white shadow-sm',
        text: 'text-orange-700',
        progress: 'bg-orange-500',
      };
    case 'ok':
      return {
        row: 'border-emerald-200 bg-emerald-50/70 hover:bg-emerald-100/70',
        rail: 'bg-emerald-500',
        due: 'bg-emerald-100 text-emerald-700',
        text: 'text-emerald-700',
        progress: 'bg-emerald-500',
      };
    default:
      return {
        row: 'border-slate-200 bg-white hover:bg-slate-50',
        rail: 'bg-slate-300',
        due: 'bg-slate-100 text-slate-600',
        text: 'text-slate-500',
        progress: 'bg-indigo-600',
      };
  }
};

const getDueLabel = (dueState: string) => {
  if (dueState === 'overdue') return 'Vencida';
  if (dueState === 'due_soon') return 'Por vencer';
  return 'En fecha';
};

const getPriorityLabel = (priority: string) => {
  if (priority === 'high') return 'Alta';
  if (priority === 'low') return 'Baja';
  return 'Media';
};

const getPriorityClass = (priority: string) => {
  if (priority === 'high') return 'bg-red-600 text-white shadow-sm ring-1 ring-red-700/20';
  if (priority === 'low') return 'bg-slate-100 text-slate-600';
  return 'bg-amber-100 text-amber-800';
};

const getWorkflowStepStatusLabel = (status: string) => {
  switch (status) {
    case 'listo':
      return 'Listo';
    case 'en_curso':
      return 'En curso';
    case 'devuelto':
    case 'returned':
      return 'Devuelto';
    case 'detenido':
      return 'Detenido';
    default:
      return 'Pendiente';
  }
};

const getWorkflowStepStatusClass = (status: string) => {
  switch (status) {
    case 'listo':
      return 'bg-emerald-100 text-emerald-700';
    case 'en_curso':
      return 'bg-indigo-100 text-indigo-700';
    case 'devuelto':
    case 'returned':
      return 'bg-red-100 text-red-700';
    case 'detenido':
      return 'bg-orange-100 text-orange-700';
    default:
      return 'bg-slate-100 text-slate-600';
  }
};

export default function WorkflowTray() {
  const { user, userRole, userOrganizationId, userOrganizationIds } = useAuth();
  const [workflows, setWorkflows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'pending' | 'reviewed'>('pending');
  const [memberId, setMemberId] = useState<string | null>(null);
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [organizations, setOrganizations] = useState<any[]>([]);
  const managedOrganizationIds = React.useMemo(
    () => (userOrganizationIds.length > 0 ? userOrganizationIds : userOrganizationId ? [userOrganizationId] : []),
    [userOrganizationId, userOrganizationIds]
  );
  
  const [actionModal, setActionModal] = useState<{ isOpen: boolean, task: any, type: 'approve' | 'return' | 'stop' | 'resume' }>({ isOpen: false, task: null, type: 'approve' });
  const [overrideUnits, setOverrideUnits] = useState<number | ''>('');
  const [actionComment, setActionComment] = useState('');
  const [formData, setFormData] = useState<Record<string, any>>({});
  const [nextStepAssignee, setNextStepAssignee] = useState<string>('');
  const [projectTeamMembers, setProjectTeamMembers] = useState<any[]>([]);
  const [projectRateCards, setProjectRateCards] = useState<any[]>([]);
  const [projectQualityCauses, setProjectQualityCauses] = useState<any[]>([]);
  const [qualityCauseId, setQualityCauseId] = useState('');
  const [dynamicRateCardAssignee, setDynamicRateCardAssignee] = useState('');
  const [dynamicRateCardId, setDynamicRateCardId] = useState('');
  const [dynamicRateCardUnits, setDynamicRateCardUnits] = useState<number | ''>(1);
  const [dynamicRateCardModal, setDynamicRateCardModal] = useState<{
    isOpen: boolean;
    task: any;
    nextStatus: string;
  }>({ isOpen: false, task: null, nextStatus: 'completed' });
  const [dynamicRateCardComment, setDynamicRateCardComment] = useState('');
  const [docsModalTask, setDocsModalTask] = useState<any>(null);
  const [detailsModalTask, setDetailsModalTask] = useState<any>(null);
  const [historyModalTask, setHistoryModalTask] = useState<any>(null);
  const [commentsModalTask, setCommentsModalTask] = useState<any>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [projectFilter, setProjectFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  useEffect(() => {
    const unsubscribe = onSnapshot(query(collection(db, 'organizations')), (snapshot) => {
      setOrganizations(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
    });

    return () => unsubscribe();
  }, []);

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
          const allMemberIds = [user.uid];
          if (!querySnapshot.empty) {
            mId = querySnapshot.docs[0].id;
            querySnapshot.docs.forEach((docSnap) => {
              allMemberIds.push(docSnap.id);
            });
          }
          setMemberId(mId || null);
          setMemberIds(Array.from(new Set(allMemberIds.filter(Boolean))));

          // Now fetch projects and tasks
          const q = query(
            collection(db, 'projects'),
          );

          unsubscribeProjects = onSnapshot(q, (snapshot) => {
            const projectDocs = snapshot.docs
              .map(doc => ({ id: doc.id, ...doc.data() }))
              .filter((project) => {
                if (userRole !== 'org_admin') return true;
                return managedOrganizationIds.length === 0 || belongsToAnyOrganization(project, managedOrganizationIds);
              });
            const projectsById = new Map(projectDocs.map((project) => [project.id, project]));
            const projectIds = projectDocs.map(project => project.id);
            
            let projectsProcessed = 0;

            // Clean up previous task listeners if projects change
            taskUnsubscribes.forEach(unsub => unsub());
            taskUnsubscribes = [];

            if (projectIds.length === 0) {
              setLoading(false);
              return;
            }

            projectIds.forEach(projectId => {
              const project = projectsById.get(projectId);
              const tasksQ = query(
                collection(db, 'projects', projectId, 'tasks'),
                where('status', '!=', 'completed')
              );

              const unsubTask = onSnapshot(tasksQ, (taskSnapshot) => {
                const projectItems = taskSnapshot.docs
                  .map(doc => {
                    const taskData = doc.data();
                    const taskIsWorkflow = taskData.type === 'workflow' && Array.isArray(taskData.workflowSteps);
                    return {
                      ...taskData,
                      id: doc.id,
                      projectId,
                      trayItemType: taskIsWorkflow ? 'workflow' : 'assigned_task',
                      projectName: project?.name || 'Proyecto',
                      organizationId: project?.organizationId || null,
                      organizationIds: project ? [project.organizationId].filter(Boolean) : [],
                      organizationName: project ? organizationNameFor(project, organizations) : 'Sin organización',
                    };
                  })
                  .filter((task: any) => {
                    if (!isWorkflowItem(task)) {
                      return isOpenTask(task) && isAssignedToCurrentUser(task, allMemberIds);
                    }

                    const currentStep = task.workflowSteps?.[task.currentStepIndex || 0];
                    const isAssigned = currentStep?.assignedTo && allMemberIds.includes(currentStep.assignedTo);
                    const isPending = currentStep?.status === 'en_curso' || currentStep?.status === 'reproceso' || currentStep?.status === 'pending' || currentStep?.status === 'detenido';
                    const hasInteracted = task.workflowHistory?.some((h: any) => h.userId === user.uid);
                    
                    return (isAssigned && isPending) || hasInteracted;
                  });

                // Update the list
                setWorkflows(prev => {
                  const otherProjects = prev.filter(p => p.projectId !== projectId);
                  return [...otherProjects, ...projectItems];
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
  }, [userRole, managedOrganizationIds, organizations]);

  const loadProjectRateCardContext = async (projectId: string) => {
    try {
      const projectSnap = await getDoc(doc(db, 'projects', projectId));
      const projectData = projectSnap.exists() ? projectSnap.data() : {};
      const assignedMemberIds = projectData?.assignedTeamMembers || [];

      if (assignedMemberIds.length > 0) {
        const teamQ = query(collection(db, 'team_members'), where('__name__', 'in', assignedMemberIds));
        const teamSnap = await getDocs(teamQ);
        setProjectTeamMembers(teamSnap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() })));
      } else {
        setProjectTeamMembers([]);
      }

      const rateCardsSnap = await getDocs(query(collection(db, 'projects', projectId, 'rateCards')));
      setProjectRateCards(
        rateCardsSnap.docs
          .map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }))
          .sort((left: any, right: any) => String(left.name || '').localeCompare(String(right.name || ''))),
      );

      const qualityCausesSnap = await getDocs(query(collection(db, 'projects', projectId, 'qualityCauses')));
      setProjectQualityCauses(
        qualityCausesSnap.docs
          .map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }))
          .filter((cause: any) => cause.active !== false)
          .sort((left: any, right: any) => String(left.name || left.label || '').localeCompare(String(right.name || right.label || ''))),
      );
    } catch (error) {
      console.error('Error loading rate card context:', error);
      toast.error('No se pudieron cargar las personas, rate cards o causales del proyecto.');
    }
  };

  const resetDynamicRateCardFields = (source: any = null, defaultAssignee = '') => {
    setDynamicRateCardAssignee(defaultAssignee);
    setDynamicRateCardId('');
    setDynamicRateCardUnits(getDynamicRateCardUnits(source));
    setDynamicRateCardComment('');
  };

  const addDynamicRateCardChargeToBatch = (
    batch: ReturnType<typeof writeBatch>,
    params: {
      projectId: string;
      task: any;
      rateCardId: string;
      assigneeId: string;
      units: number;
      source: string;
      stepIndex?: number | null;
      comment?: string | null;
      isRework?: boolean;
      reversal?: boolean;
    },
  ) => {
    const amount = Number(params.units);
    if (!params.rateCardId || !params.assigneeId || !amount) return null;

    const rcRef = doc(db, 'projects', params.projectId, 'rateCards', params.rateCardId);
    const statsField = params.isRework ? 'userReworkStats' : 'userStats';
    batch.update(rcRef, {
      [params.isRework ? 'reworkValue' : 'currentValue']: increment(amount),
      [`${statsField}.${params.assigneeId}`]: increment(amount),
    });

    const entryRef = doc(collection(db, 'projects', params.projectId, 'rateCardEntries'));
    const now = new Date();
    batch.set(entryRef, {
      projectId: params.projectId,
      taskId: params.task.id,
      taskTitle: params.task.title || params.task.name || 'Tarea',
      rateCardId: params.rateCardId,
      assignedTo: params.assigneeId,
      units: amount,
      source: params.source,
      stepIndex: params.stepIndex ?? null,
      comment: params.comment || null,
      isRework: Boolean(params.isRework),
      reversal: Boolean(params.reversal),
      ...getDateKeys(now),
      createdAt: Timestamp.now(),
      createdBy: user?.uid || null,
      createdByEmail: user?.email || null,
    });

    return {
      entryId: entryRef.id,
      rateCardId: params.rateCardId,
      assignedTo: params.assigneeId,
      units: amount,
      source: params.source,
      stepIndex: params.stepIndex ?? null,
      reversal: Boolean(params.reversal),
      createdAt: now.toISOString(),
    };
  };

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
    const currentStepIsQualityGate = isQualityGateStep(currentStep);
    const selectedQualityCause = projectQualityCauses.find((cause) => cause.id === qualityCauseId);
    const workflowDynamicRateCardSource = getWorkflowDynamicRateCardSource(task, action);
    const workflowDynamicRateCardRequestsUnits = workflowDynamicRateCardSource
      ? shouldRequestDynamicRateCardUnits(workflowDynamicRateCardSource.sourceConfig)
      : false;

    // Validate form data if approving and form exists
    if (action === 'approve' && currentStep?.form?.fields) {
      const missingRequired = currentStep.form.fields.some((f: any) => f.required && !hasRequiredFormValue(formData[f.id]));
      if (missingRequired) {
        toast.warning("Por favor complete todos los campos obligatorios del formulario.");
        return;
      }
    }

    if (workflowDynamicRateCardSource) {
      if (
        !dynamicRateCardAssignee ||
        !dynamicRateCardId ||
        (workflowDynamicRateCardRequestsUnits && (dynamicRateCardUnits === '' || Number(dynamicRateCardUnits) <= 0))
      ) {
        toast.warning("Completa la persona, el perfil y las unidades del Rate Card dinámico.");
        return;
      }
    }

    if (currentStepIsQualityGate && action === 'return' && !qualityCauseId) {
      toast.warning("Selecciona la causal de devolución de calidad.");
      return;
    }

    if (currentStepIsQualityGate && currentIndex === 0 && (action === 'approve' || action === 'return')) {
      toast.error("Este control de calidad no tiene un paso anterior. Edita el workflow y mueve calidad después del paso que envía a revisión.");
      return;
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

      let dynamicRateCardCharge: any = null;
      if (workflowDynamicRateCardSource) {
        const taskWasCompletedBefore = task.workflowHistory?.some((h: any) => h.stepIndex === task.workflowSteps.length - 1 && h.action === 'approve');
        dynamicRateCardCharge = addDynamicRateCardChargeToBatch(batch, {
          projectId: task.projectId,
          task,
          rateCardId: dynamicRateCardId,
          assigneeId: dynamicRateCardAssignee,
          units: workflowDynamicRateCardRequestsUnits
            ? Number(dynamicRateCardUnits)
            : getDynamicRateCardUnits(workflowDynamicRateCardSource.sourceConfig),
          source: workflowDynamicRateCardSource.source,
          stepIndex: workflowDynamicRateCardSource.stepIndex,
          comment: actionComment,
          isRework: workflowDynamicRateCardSource.source === 'workflow_step' ? hasBeenActedUpon : taskWasCompletedBefore,
        });
      }

      let qualityEvent: any = null;
      if (currentStepIsQualityGate && (action === 'approve' || action === 'return')) {
        const eventRef = doc(collection(db, 'projects', task.projectId, 'qualityEvents'));
        const now = new Date();
        const participants = getQualityParticipantIds(task, currentIndex, currentStep, memberId, user.uid);
        const result = action === 'approve' ? 'accepted' : 'rejected';
        qualityEvent = {
          id: eventRef.id,
          projectId: task.projectId,
          taskId: task.id,
          taskTitle: task.title || task.name || 'Tarea',
          stepIndex: currentIndex,
          stepLabel: currentStep?.label || `Paso ${currentIndex + 1}`,
          result,
          action: result,
          professionalId: participants.professionalId,
          reviewerId: participants.reviewerId,
          causeId: result === 'rejected' ? (selectedQualityCause?.id || qualityCauseId || null) : null,
          causeLabel: result === 'rejected' ? (selectedQualityCause?.name || selectedQualityCause?.label || 'Sin causal') : null,
          comment: actionComment.trim(),
          ...getDateKeys(now),
          createdAt: Timestamp.now(),
          createdBy: user.uid,
          createdByEmail: user.email || null,
        };
        batch.set(eventRef, qualityEvent);
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
          newStatus = normalizeCompletionStatus('completed', task);
          
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
      if (newStatus === 'completed' || newStatus === 'completed_late') progress = 100;

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
          dynamicRateCard: dynamicRateCardCharge,
          qualityEvent,
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
      setQualityCauseId('');
      resetDynamicRateCardFields();
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
    setQualityCauseId('');
    
    const currentStep = task.workflowSteps?.[task.currentStepIndex || 0];
    setOverrideUnits(currentStep?.unitsToAdd || 1);
    const dynamicSource = getWorkflowDynamicRateCardSource(task, type);
    resetDynamicRateCardFields(dynamicSource?.sourceConfig, currentStep?.assignedTo || task.assignedTo || memberId || user?.uid || '');

    if ((type === 'approve' && currentStep?.assignsNextStep) || dynamicSource || isQualityGateStep(currentStep)) {
      await loadProjectRateCardContext(task.projectId);
    }
  };

  const updateAssignedTaskStatus = async (task: any, nextStatus: string, dynamicCharge?: {
    assigneeId: string;
    rateCardId: string;
    units: number;
    comment?: string | null;
  }) => {
    if (!user || !task?.id || isWorkflowItem(task)) return;

    const finalStatus = normalizeCompletionStatus(nextStatus, task);
    const progress = getProgressForTaskStatus(finalStatus, task.progress);
    const taskHasDynamicRateCard = isDynamicRateCardEnabled(task);
    const wasCompleted = isCompletedTaskStatus(task.status);
    const isCompleted = isCompletedTaskStatus(finalStatus);

    if (taskHasDynamicRateCard && isCompleted && !wasCompleted && !dynamicCharge) {
      setDynamicRateCardModal({ isOpen: true, task, nextStatus });
      resetDynamicRateCardFields(task, task.assignedTo || memberId || user?.uid || '');
      await loadProjectRateCardContext(task.projectId);
      return;
    }

    setProcessingId(task.id);

    try {
      const batch = writeBatch(db);
      const taskRef = doc(db, 'projects', task.projectId, 'tasks', task.id);
      let dynamicRateCardCharge: any = null;

      if (task.isRateCardTask && task.rateCardId && task.unitsToAdd) {
        const oldProgress = task.progress || 0;
        const deltaProgress = progress - oldProgress;
        const unitsDelta = (deltaProgress / 100) * task.unitsToAdd;

        if (unitsDelta !== 0) {
          const rcRef = doc(db, 'projects', task.projectId, 'rateCards', task.rateCardId);
          const updateData: any = {
            currentValue: increment(unitsDelta),
          };
          if (task.assignedTo) {
            updateData[`userStats.${task.assignedTo}`] = increment(unitsDelta);
          }
          batch.update(rcRef, updateData);
        }
      }

      if (taskHasDynamicRateCard && isCompleted && !wasCompleted && dynamicCharge) {
        dynamicRateCardCharge = addDynamicRateCardChargeToBatch(batch, {
          projectId: task.projectId,
          task,
          rateCardId: dynamicCharge.rateCardId,
          assigneeId: dynamicCharge.assigneeId,
          units: dynamicCharge.units,
          source: 'assigned_task',
          comment: dynamicCharge.comment || null,
        });
      }

      if (taskHasDynamicRateCard && wasCompleted && !isCompleted && task.dynamicRateCardLastCharge) {
        const lastCharge = task.dynamicRateCardLastCharge;
        dynamicRateCardCharge = addDynamicRateCardChargeToBatch(batch, {
          projectId: task.projectId,
          task,
          rateCardId: lastCharge.rateCardId,
          assigneeId: lastCharge.assignedTo,
          units: -Math.abs(Number(lastCharge.units || 0)),
          source: 'assigned_task_reversal',
          comment: 'Reverso automático por cambio de estado desde finalizada.',
          reversal: true,
        });
      }

      const taskUpdate: any = {
        status: finalStatus,
        progress,
        updatedAt: Timestamp.now(),
        statusHistory: arrayUnion({
          status: finalStatus,
          changedBy: user.uid,
          changedByEmail: user.email || null,
          timestamp: Timestamp.now(),
          source: 'inbox',
          dynamicRateCard: dynamicRateCardCharge,
        }),
      };

      if (dynamicRateCardCharge && !dynamicRateCardCharge.reversal && dynamicCharge) {
        taskUpdate.dynamicRateCardLastCharge = dynamicRateCardCharge;
      } else if (taskHasDynamicRateCard && wasCompleted && !isCompleted) {
        taskUpdate.dynamicRateCardLastCharge = null;
      }

      batch.update(taskRef, taskUpdate);

      await batch.commit();

      if (task.parentTaskId) {
        const { updateParentTaskStatus } = await import('@/lib/taskUtils');
        await updateParentTaskStatus(task.projectId, task.parentTaskId);
      }

      toast.success(finalStatus === 'completed_late' ? 'Tarea finalizada con retraso.' : 'Estado actualizado.');
    } catch (error: any) {
      console.error('Error updating assigned task status:', error);
      toast.error(error?.message || 'No se pudo actualizar la tarea.');
    } finally {
      setProcessingId(null);
    }
  };

  const confirmAssignedTaskDynamicRateCard = async () => {
    const task = dynamicRateCardModal.task;
    if (!task) return;
    const taskRequestsUnits = shouldRequestDynamicRateCardUnits(task);

    if (
      !dynamicRateCardAssignee ||
      !dynamicRateCardId ||
      (taskRequestsUnits && (dynamicRateCardUnits === '' || Number(dynamicRateCardUnits) <= 0))
    ) {
      toast.warning("Completa la persona, el perfil y las unidades del Rate Card dinámico.");
      return;
    }

    await updateAssignedTaskStatus(task, dynamicRateCardModal.nextStatus, {
      assigneeId: dynamicRateCardAssignee,
      rateCardId: dynamicRateCardId,
      units: taskRequestsUnits ? Number(dynamicRateCardUnits) : getDynamicRateCardUnits(task),
      comment: dynamicRateCardComment.trim() || null,
    });

    setDynamicRateCardModal({ isOpen: false, task: null, nextStatus: 'completed' });
    resetDynamicRateCardFields();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  const assignedIdsForInbox = memberIds.length > 0 ? memberIds : [user?.uid, memberId].filter(Boolean);

  const isPendingTaskForMe = (task: any) => {
    const taskIsWorkflow = isWorkflowItem(task);
    const currentStep = taskIsWorkflow ? task.workflowSteps?.[task.currentStepIndex || 0] : null;
    return taskIsWorkflow
      ? currentStep?.assignedTo && assignedIdsForInbox.includes(currentStep.assignedTo) &&
        (currentStep?.status === 'en_curso' || currentStep?.status === 'reproceso' || currentStep?.status === 'pending' || currentStep?.status === 'detenido')
      : isOpenTask(task) && isAssignedToCurrentUser(task, assignedIdsForInbox as string[]);
  };

  const isReviewedTaskForMe = (task: any) => {
    if (!isWorkflowItem(task)) return false;
    const hasInteracted = task.workflowHistory?.some((h: any) => h.userId === user?.uid);
    return Boolean(hasInteracted && !isPendingTaskForMe(task));
  };

  const isInActiveInboxTab = (task: any) =>
    activeTab === 'pending' ? isPendingTaskForMe(task) : isReviewedTaskForMe(task);

  const pendingInboxCount = workflows.filter(isPendingTaskForMe).length;

  const projectOptions = Array.from(
    new Map(workflows.map((task) => [task.projectId, task.projectName || 'Proyecto'])).entries()
  ).filter(([projectId]) => Boolean(projectId)).sort((a, b) => a[1].localeCompare(b[1]));

  const mailboxCounts = workflows.reduce((counts, task) => {
    if (!isInActiveInboxTab(task) || !task.projectId) return counts;
    counts.set(task.projectId, (counts.get(task.projectId) || 0) + 1);
    return counts;
  }, new Map<string, number>());
  const allMailboxCount = workflows.filter(isInActiveInboxTab).length;

  const filteredWorkflows = workflows.filter(task => {
    const searchLower = searchTerm.toLowerCase();
    const taskIsWorkflow = isWorkflowItem(task);
    const externalId = (task.externalWorkflowId || '').toLowerCase();
    const taskId = (task.id || '').toLowerCase();
    const title = (task.title || '').toLowerCase();
    const organizationName = (task.organizationName || '').toLowerCase();
    const projectName = (task.projectName || '').toLowerCase();
    const currentStepStatus = taskIsWorkflow
      ? (task.workflowSteps?.[task.currentStepIndex]?.status || '').toLowerCase()
      : (task.status || 'todo').toLowerCase();
    
    if (!isInActiveInboxTab(task)) return false;

    if (projectFilter !== 'all' && task.projectId !== projectFilter) return false;

    if (statusFilter !== 'all') {
      const dueState = getDueState(task);
      if (statusFilter === 'workflow' && !taskIsWorkflow) return false;
      if (statusFilter === 'assigned_task' && taskIsWorkflow) return false;
      if (statusFilter === 'overdue' && dueState !== 'overdue') return false;
      if (statusFilter === 'due_soon' && dueState !== 'due_soon') return false;
      if (!['workflow', 'assigned_task', 'overdue', 'due_soon'].includes(statusFilter) && currentStepStatus !== statusFilter) return false;
    }

    return externalId.includes(searchLower) || 
           taskId.includes(searchLower) || 
           title.includes(searchLower) ||
           organizationName.includes(searchLower) ||
           projectName.includes(searchLower) ||
           currentStepStatus.includes(searchLower);
  }).sort((a, b) => {
    const bTime = getTaskTimestamp(b.createdAt) || getTaskTimestamp(b.updatedAt);
    const aTime = getTaskTimestamp(a.createdAt) || getTaskTimestamp(a.updatedAt);
    return bTime - aTime;
  });
  const activeDynamicRateCardSource = actionModal.isOpen
    ? getWorkflowDynamicRateCardSource(actionModal.task, actionModal.type)
    : null;
  const activeDynamicRateCardRequestsUnits = activeDynamicRateCardSource
    ? shouldRequestDynamicRateCardUnits(activeDynamicRateCardSource.sourceConfig)
    : false;
  const activeQualityGateStep = actionModal.isOpen
    ? actionModal.task?.workflowSteps?.[actionModal.task.currentStepIndex || 0]
    : null;
  const activeQualityGateRequiresCause =
    isQualityGateStep(activeQualityGateStep) && actionModal.type === 'return';
  const assignedTaskDynamicRateCardRequestsUnits = dynamicRateCardModal.task
    ? shouldRequestDynamicRateCardUnits(dynamicRateCardModal.task)
    : false;

  const renderUtilityButton = (
    label: string,
    icon: React.ReactNode,
    onClick: () => void,
    extraClassName = 'text-slate-500 hover:bg-slate-100 hover:text-slate-800',
    badge?: number,
  ) => (
    <button
      type="button"
      onClick={onClick}
      className={`relative inline-flex h-7 w-7 items-center justify-center rounded-md transition-colors ${extraClassName}`}
      title={label}
      aria-label={label}
    >
      {icon}
      {Boolean(badge) && (
        <span className="absolute -right-1 -top-1 min-w-4 rounded-full bg-indigo-600 px-1 text-center text-[9px] font-bold leading-4 text-white">
          {badge! > 99 ? '99+' : badge}
        </span>
      )}
    </button>
  );

  const renderInboxItem = (task: any) => {
    const taskIsWorkflow = isWorkflowItem(task);
    const dueState = getDueState(task);
    const urgencyStyles = getInboxUrgencyStyles(dueState);
    const endDate = getTaskDate(task.endDate || task.end);
    const dueText = endDate
      ? `Vence ${format(endDate, 'd MMM', { locale: es })}`
      : `Creada ${format(getTaskDate(task.createdAt) || new Date(), 'd MMM', { locale: es })}`;
    const dueLabel = dueState === 'none' ? 'Sin fecha' : getDueLabel(dueState);
    const commentCount = Number(task.commentCount || 0);
    const title = `${task.externalWorkflowId ? `[${task.externalWorkflowId}] ` : ''}${task.title || task.name || 'Tarea sin nombre'}`;
    const description = task.initialObservation || task.description || 'Sin descripción';
    const priority = task.priority || 'medium';

    if (!taskIsWorkflow) {
      const progress = Math.min(100, Math.max(0, Number(task.progress || 0)));
      const status = task.status || 'todo';

      return (
        <article
          key={`${task.projectId}-${task.id}`}
          className={`relative grid min-h-[54px] gap-2 px-3 py-1.5 transition-colors lg:grid-cols-[minmax(0,1fr)_auto] ${urgencyStyles.row}`}
        >
          <span className={`absolute bottom-0 left-0 top-0 w-1 ${urgencyStyles.rail}`} />
          <div className="min-w-0 pl-2.5">
            <div className="flex min-w-0 items-center gap-1.5">
              <span className="shrink-0 rounded bg-sky-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-sky-700">
                {task.parentTaskId ? 'Subtarea' : 'Tarea'}
              </span>
              <h3 className="min-w-0 flex-1 truncate text-sm font-bold text-slate-900">{title}</h3>
              <span className={`hidden shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider sm:inline-flex ${getTaskStatusClass(status)}`}>
                {getTaskStatusLabel(status)}
              </span>
              <span className={`inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-black uppercase tracking-wider ${urgencyStyles.due}`}>
                <Clock size={11} />
                {dueState === 'ok' ? 'A tiempo' : dueLabel}
              </span>
              <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-black uppercase tracking-wider ${getPriorityClass(priority)}`}>
                {getPriorityLabel(priority)}
              </span>
            </div>

            <div className="mt-1 flex min-w-0 items-center gap-2 text-xs text-slate-600">
              <span className={`shrink-0 font-bold ${urgencyStyles.text}`}>
                {task.organizationName || 'Sin organización'}
              </span>
              <span className="truncate">
                {task.projectName ? `${task.projectName} · ` : ''}{description}
              </span>
              <span className="hidden shrink-0 text-slate-400 sm:inline">{dueText}</span>
              <div className="ml-auto hidden shrink-0 items-center gap-2 md:flex">
                <div className="h-1.5 w-20 overflow-hidden rounded-full bg-white/80">
                  <div
                    className={`h-full ${status === 'stuck' ? 'bg-red-600' : status === 'in_progress' ? 'bg-orange-500' : urgencyStyles.progress}`}
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <span className="w-8 text-right text-[11px] font-bold text-slate-600">{progress}%</span>
                {task.type === 'quantitative' && (
                  <span className="max-w-[120px] truncate text-[11px] text-slate-500">
                    {task.currentValue || 0}/{task.indicatorValue || 0} {task.indicator || ''}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1 pl-2 lg:justify-end lg:pl-0">
            {activeTab === 'pending' && (
              <select
                value={status}
                onChange={(event) => void updateAssignedTaskStatus(task, event.target.value)}
                disabled={processingId === task.id}
                className="h-7 w-[126px] rounded-md border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500/20 disabled:opacity-60"
                title="Cambiar estado"
              >
                <option value="todo">Pendiente</option>
                <option value="in_progress">Trabajando</option>
                <option value="stuck">Estancada</option>
                <option value="completed">Finalizar</option>
                {status === 'completed_late' && <option value="completed_late">Finalizada con retraso</option>}
              </select>
            )}
            {renderUtilityButton('Detalles', <Eye size={14} />, () => setDetailsModalTask(task), 'text-slate-600 hover:bg-white/80 hover:text-indigo-700')}
            {renderUtilityButton('Comentarios', <MessageSquare size={14} />, () => setCommentsModalTask(task), 'text-slate-600 hover:bg-white/80 hover:text-indigo-700', commentCount)}
            {renderUtilityButton('Documentos', <FileText size={14} />, () => setDocsModalTask(task), 'text-indigo-600 hover:bg-white/80 hover:text-indigo-700')}
            <Link
              href={`/projects/${task.projectId}?tab=tasks`}
              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-600 transition-colors hover:bg-white/80 hover:text-slate-900"
              title="Abrir proyecto"
              aria-label="Abrir proyecto"
            >
              <FolderOpen size={14} />
            </Link>
          </div>
        </article>
      );
    }

    const currentIndex = task.currentStepIndex || 0;
    const workflowSteps = task.workflowSteps || [];
    const currentWorkflowStep = workflowSteps[currentIndex] || {};
    const stepStatus = currentWorkflowStep?.status;
    const isReturned = stepStatus === 'devuelto' || stepStatus === 'returned';
    const isStopped = stepStatus === 'detenido';
    const workflowUrgencyStyles = isReturned ? getInboxUrgencyStyles('overdue') : urgencyStyles;

    return (
      <article
        key={`${task.projectId}-${task.id}`}
        className={`relative grid min-h-[54px] gap-2 px-3 py-1.5 transition-colors lg:grid-cols-[minmax(0,1fr)_auto] ${workflowUrgencyStyles.row}`}
      >
        <span className={`absolute bottom-0 left-0 top-0 w-1 ${workflowUrgencyStyles.rail}`} />
        <div className="min-w-0 pl-2.5">
          <div className="flex min-w-0 items-center gap-1.5">
            <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${isReturned || isStopped ? 'bg-red-600 text-white' : 'bg-indigo-100 text-indigo-700'}`}>
              {isStopped ? 'Detenido' : isReturned ? 'Devuelto' : 'Workflow'}
            </span>
            <h3 className="min-w-0 flex-1 truncate text-sm font-bold text-slate-900">{title}</h3>
            <span className="hidden shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-600 sm:inline-flex">
              Paso {currentIndex + 1}/{workflowSteps.length || 1}
            </span>
            {isQualityGateStep(currentWorkflowStep) && (
              <span className="hidden shrink-0 items-center gap-1 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-800 sm:inline-flex">
                <ShieldCheck size={11} />
                Calidad
              </span>
            )}
            <span className={`inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-black uppercase tracking-wider ${workflowUrgencyStyles.due}`}>
              <Clock size={11} />
              {dueState === 'ok' ? 'A tiempo' : dueLabel}
            </span>
            <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-black uppercase tracking-wider ${getPriorityClass(priority)}`}>
              {getPriorityLabel(priority)}
            </span>
          </div>

          <div className="mt-1 flex min-w-0 items-center gap-2 text-xs text-slate-600">
            <span className={`shrink-0 font-bold ${workflowUrgencyStyles.text}`}>
              {task.organizationName || 'Sin organización'}
            </span>
            <span className="truncate">
              {task.projectName ? `${task.projectName} · ` : ''}{description}
            </span>
            <span className="hidden shrink-0 text-slate-400 sm:inline">{dueText}</span>
          </div>
        </div>

        <div className="flex items-center gap-1 pl-2 lg:justify-end lg:pl-0">
          {activeTab === 'pending' ? (
            <>
              {isStopped ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => openActionModal(task, 'resume')}
                  disabled={processingId === task.id}
                  className="h-7 px-2 text-blue-600 hover:bg-white/80"
                  title="Reanudar workflow"
                >
                  <Play className="h-3.5 w-3.5" />
                </Button>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => openActionModal(task, 'stop')}
                  disabled={processingId === task.id}
                  className="h-7 px-2 text-orange-600 hover:bg-white/80"
                  title="Detener workflow"
                >
                  <Pause className="h-3.5 w-3.5" />
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => openActionModal(task, 'return')}
                disabled={processingId === task.id || currentIndex === 0 || isStopped}
                className="h-7 px-2 text-red-600 hover:bg-white/80"
                title="Devolver"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
              </Button>
              <Button
                size="sm"
                onClick={() => openActionModal(task, 'approve')}
                disabled={processingId === task.id || isStopped}
                className="h-7 bg-emerald-600 px-2.5 text-white hover:bg-emerald-700"
              >
                {currentIndex === workflowSteps.length - 1 ? (
                  <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
                ) : (
                  <ArrowRight className="mr-1 h-3.5 w-3.5" />
                )}
                <span className="text-xs font-bold">
                  {currentIndex === workflowSteps.length - 1 ? 'Finalizar' : 'Aprobar'}
                </span>
              </Button>
            </>
          ) : (
            <span className="rounded-md border border-slate-100 bg-white/70 px-2 py-1 text-xs font-semibold text-slate-500">
              Revisado
            </span>
          )}
          {renderUtilityButton('Detalles', <Eye size={14} />, () => setDetailsModalTask(task), 'text-slate-600 hover:bg-white/80 hover:text-indigo-700')}
          {renderUtilityButton('Documentos', <FileText size={14} />, () => setDocsModalTask(task), 'text-indigo-600 hover:bg-white/80 hover:text-indigo-700')}
          {renderUtilityButton('Comentarios', <MessageSquare size={14} />, () => setCommentsModalTask(task), 'text-slate-600 hover:bg-white/80 hover:text-indigo-700', commentCount)}
          {task.workflowHistory?.length > 0 &&
            renderUtilityButton('Interacciones', <MessageSquare size={14} />, () => setHistoryModalTask(task), 'text-slate-600 hover:bg-white/80 hover:text-slate-900', task.workflowHistory.length)}
        </div>
      </article>
    );
  };

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-slate-200 bg-white p-2.5 shadow-sm">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-bold text-slate-900">Recibidos</h2>
              <span className="inline-flex items-center rounded-full bg-indigo-600 px-2.5 py-0.5 text-xs font-bold text-white">
                {pendingInboxCount} pendiente{pendingInboxCount === 1 ? '' : 's'}
              </span>
            </div>
          </div>

          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <div className="flex rounded-lg bg-slate-100 p-1">
            <button
              onClick={() => setActiveTab('pending')}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                activeTab === 'pending'
                  ? 'bg-white text-indigo-600 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              Pendientes
            </button>
            <button
              onClick={() => setActiveTab('reviewed')}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                activeTab === 'reviewed'
                  ? 'bg-white text-indigo-600 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              Revisados
            </button>
            </div>
          </div>
        </div>

        <div className="mt-2 border-t border-slate-100 pt-2">
          <div className="flex gap-2 overflow-x-auto pb-1">
            <button
              type="button"
              onClick={() => setProjectFilter('all')}
              className={`inline-flex h-8 shrink-0 items-center gap-2 rounded-lg border px-3 text-xs font-bold transition-colors ${
                projectFilter === 'all'
                  ? 'border-indigo-200 bg-indigo-600 text-white shadow-sm'
                  : 'border-slate-200 bg-white text-slate-600 hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700'
              }`}
            >
              Todo
              <span className={`rounded-full px-1.5 py-0.5 text-[10px] ${
                projectFilter === 'all' ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'
              }`}>
                {allMailboxCount}
              </span>
            </button>
            {projectOptions.map(([projectId, projectName]) => {
              const isActiveMailbox = projectFilter === projectId;
              return (
                <button
                  key={projectId}
                  type="button"
                  onClick={() => setProjectFilter(projectId)}
                  className={`inline-flex h-8 max-w-[240px] shrink-0 items-center gap-2 rounded-lg border px-3 text-xs font-bold transition-colors ${
                    isActiveMailbox
                      ? 'border-indigo-200 bg-indigo-600 text-white shadow-sm'
                      : 'border-slate-200 bg-white text-slate-600 hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700'
                  }`}
                  title={projectName}
                >
                  <span className="truncate">{projectName}</span>
                  <span className={`rounded-full px-1.5 py-0.5 text-[10px] ${
                    isActiveMailbox ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'
                  }`}>
                    {mailboxCounts.get(projectId) || 0}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-2 grid grid-cols-1 gap-2 lg:grid-cols-[1fr_220px]">
          <input
            type="text"
            placeholder="Buscar por ID, título, proyecto, organización o estado..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="h-8 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
          />
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            className="h-8 rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
          >
            <option value="all">Todos los estados</option>
            <option value="todo">Pendiente</option>
            <option value="in_progress">Trabajando</option>
            <option value="stuck">Estancada</option>
            <option value="en_curso">Workflow en curso</option>
            <option value="detenido">Workflow detenido</option>
            <option value="overdue">Vencidas</option>
            <option value="due_soon">Por vencer</option>
            <option value="assigned_task">Solo tareas</option>
            <option value="workflow">Solo workflows</option>
          </select>
        </div>
      </div>

      {filteredWorkflows.length === 0 ? (
        <div className="bg-white rounded-xl border border-dashed border-slate-300 p-12 text-center">
          <CheckCircle2 className="w-12 h-12 text-slate-200 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-slate-900">
            {searchTerm ? 'No se encontraron resultados' : '¡Todo al día!'}
          </h3>
          <p className="text-slate-500">
            {searchTerm ? 'Intenta con otros términos de búsqueda.' : 'No tienes workflows ni tareas pendientes asignadas.'}
          </p>
        </div>
      ) : (
        <>
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="divide-y divide-slate-100">
            {filteredWorkflows.map(renderInboxItem)}
          </div>
        </div>
        </>
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

              {isQualityGateStep(activeQualityGateStep) && (
                <div className="mb-4 rounded-xl border border-amber-100 bg-amber-50 p-4">
                  <p className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-amber-700">
                    <ShieldCheck size={14} />
                    Control de calidad
                  </p>
                  {actionModal.type === 'return' ? (
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-700">
                        Causal de devolución <span className="text-red-500">*</span>
                      </label>
                      <select
                        value={qualityCauseId}
                        onChange={(e) => setQualityCauseId(e.target.value)}
                        className="w-full rounded-lg border border-amber-100 bg-white p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                      >
                        <option value="">Seleccionar causal...</option>
                        {projectQualityCauses.map((cause) => (
                          <option key={cause.id} value={cause.id}>
                            {cause.name || cause.label}
                          </option>
                        ))}
                      </select>
                      {projectQualityCauses.length === 0 && (
                        <p className="mt-2 text-xs text-amber-700">
                          Configura primero las causales en la pestaña Gestión de calidad del proyecto.
                        </p>
                      )}
                    </div>
                  ) : (
                    <p className="text-xs text-amber-700">
                      Al aprobar este paso se registrará un acierto para el profesional y una revisión para el revisor de calidad.
                    </p>
                  )}
                </div>
              )}

              {activeDynamicRateCardSource && (
                <div className="mb-4 rounded-xl border border-emerald-100 bg-emerald-50 p-4">
                  <p className="mb-3 text-xs font-bold uppercase tracking-wider text-emerald-700">
                    Rate Card dinámico
                  </p>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-600">
                        Persona <span className="text-red-500">*</span>
                      </label>
                      <select
                        value={dynamicRateCardAssignee}
                        onChange={(e) => setDynamicRateCardAssignee(e.target.value)}
                        className="w-full rounded-lg border border-emerald-100 bg-white p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                      >
                        <option value="">Seleccionar...</option>
                        {dynamicRateCardAssignee && !projectTeamMembers.some((member) => member.id === dynamicRateCardAssignee) && (
                          <option value={dynamicRateCardAssignee}>Responsable actual</option>
                        )}
                        {projectTeamMembers.map((member) => (
                          <option key={member.id} value={member.id}>{member.name}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-600">
                        Perfil <span className="text-red-500">*</span>
                      </label>
                      <select
                        value={dynamicRateCardId}
                        onChange={(e) => setDynamicRateCardId(e.target.value)}
                        className="w-full rounded-lg border border-emerald-100 bg-white p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                      >
                        <option value="">Seleccionar...</option>
                        {projectRateCards.map((rateCard) => (
                          <option key={rateCard.id} value={rateCard.id}>{rateCard.name}</option>
                        ))}
                      </select>
                    </div>
                    {activeDynamicRateCardRequestsUnits ? (
                      <div className="md:col-span-2">
                        <label className="mb-1 block text-xs font-medium text-slate-600">
                          Unidades <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="number"
                          min="0.1"
                          step="0.1"
                          value={dynamicRateCardUnits}
                          onChange={(e) => setDynamicRateCardUnits(e.target.value === '' ? '' : Number(e.target.value))}
                          className="w-full rounded-lg border border-emerald-100 bg-white p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                        />
                      </div>
                    ) : (
                      <div className="md:col-span-2 rounded-lg border border-emerald-100 bg-white px-3 py-2 text-xs text-emerald-700">
                        Auto suma: se cargarán <strong>{getDynamicRateCardUnits(activeDynamicRateCardSource.sourceConfig)}</strong> unidades configuradas.
                      </div>
                    )}
                  </div>
                  <p className="mt-2 text-[10px] text-emerald-700">
                    Este cargo quedará registrado por persona, día, semana y mes.
                  </p>
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
                disabled={!actionComment.trim() || processingId === actionModal.task.id || (actionModal.type === 'approve' && actionModal.task.workflowSteps[actionModal.task.currentStepIndex || 0]?.assignsNextStep && !nextStepAssignee) || activeQualityGateRequiresCause && !qualityCauseId || (actionModal.task.workflowSteps[actionModal.task.currentStepIndex || 0]?.rateCardId && actionModal.task.workflowSteps[actionModal.task.currentStepIndex || 0]?.autoAddUnits === false && overrideUnits === '') || (Boolean(activeDynamicRateCardSource) && (!dynamicRateCardAssignee || !dynamicRateCardId || (activeDynamicRateCardRequestsUnits && (dynamicRateCardUnits === '' || Number(dynamicRateCardUnits) <= 0))))}
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

      {dynamicRateCardModal.isOpen && dynamicRateCardModal.task && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-slate-800">Asignar Rate Card</h2>
                <p className="text-sm text-slate-500 mt-1">
                  {dynamicRateCardModal.task.title || dynamicRateCardModal.task.name || 'Tarea'}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => {
                  setDynamicRateCardModal({ isOpen: false, task: null, nextStatus: 'completed' });
                  resetDynamicRateCardFields();
                }}
              >
                <X className="w-5 h-5 text-slate-400" />
              </Button>
            </div>

            <div className="p-6 space-y-4 bg-slate-50">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">
                    Persona que aporta <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={dynamicRateCardAssignee}
                    onChange={(e) => setDynamicRateCardAssignee(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 bg-white p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                  >
                    <option value="">Seleccionar...</option>
                    {dynamicRateCardAssignee && !projectTeamMembers.some((member) => member.id === dynamicRateCardAssignee) && (
                      <option value={dynamicRateCardAssignee}>Responsable actual</option>
                    )}
                    {projectTeamMembers.map((member) => (
                      <option key={member.id} value={member.id}>{member.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">
                    Perfil de Rate Card <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={dynamicRateCardId}
                    onChange={(e) => setDynamicRateCardId(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 bg-white p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                  >
                    <option value="">Seleccionar...</option>
                    {projectRateCards.map((rateCard) => (
                      <option key={rateCard.id} value={rateCard.id}>{rateCard.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              {assignedTaskDynamicRateCardRequestsUnits ? (
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">
                    Unidades <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    min="0.1"
                    step="0.1"
                    value={dynamicRateCardUnits}
                    onChange={(e) => setDynamicRateCardUnits(e.target.value === '' ? '' : Number(e.target.value))}
                    className="w-full rounded-lg border border-slate-200 bg-white p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                  />
                </div>
              ) : (
                <div className="rounded-lg border border-emerald-100 bg-white px-3 py-2 text-sm text-emerald-700">
                  Auto suma: se cargarán <strong>{getDynamicRateCardUnits(dynamicRateCardModal.task)}</strong> unidades configuradas.
                </div>
              )}

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Comentario
                </label>
                <textarea
                  value={dynamicRateCardComment}
                  onChange={(e) => setDynamicRateCardComment(e.target.value)}
                  className="h-20 w-full resize-none rounded-lg border border-slate-200 bg-white p-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                  placeholder="Detalle opcional del aporte..."
                />
              </div>
            </div>

            <div className="p-6 border-t border-slate-100 flex items-center justify-end gap-3">
              <Button
                variant="outline"
                onClick={() => {
                  setDynamicRateCardModal({ isOpen: false, task: null, nextStatus: 'completed' });
                  resetDynamicRateCardFields();
                }}
              >
                Cancelar
              </Button>
              <Button
                onClick={confirmAssignedTaskDynamicRateCard}
                disabled={processingId === dynamicRateCardModal.task.id || !dynamicRateCardAssignee || !dynamicRateCardId || (assignedTaskDynamicRateCardRequestsUnits && (dynamicRateCardUnits === '' || Number(dynamicRateCardUnits) <= 0))}
                className="bg-emerald-600 text-white hover:bg-emerald-700"
              >
                {processingId === dynamicRateCardModal.task.id && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                Guardar y finalizar
              </Button>
            </div>
          </div>
        </div>
      )}

      {detailsModalTask && (() => {
        const detailTask = detailsModalTask;
        const taskIsWorkflow = isWorkflowItem(detailTask);
        const detailDueState = getDueState(detailTask);
        const detailUrgencyStyles = getInboxUrgencyStyles(detailDueState);
        const detailEndDate = getTaskDate(detailTask.endDate || detailTask.end);
        const detailTitle = `${detailTask.externalWorkflowId ? `[${detailTask.externalWorkflowId}] ` : ''}${detailTask.title || detailTask.name || 'Tarea sin nombre'}`;
        const detailProgress = Math.min(100, Math.max(0, Number(detailTask.progress || 0)));
        const detailWorkflowSteps = detailTask.workflowSteps || [];
        const detailCurrentIndex = detailTask.currentStepIndex || 0;

        return (
          <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden max-h-[90vh] flex flex-col">
              <div className="p-5 border-b border-slate-100 flex items-start justify-between gap-4 shrink-0">
                <div className="min-w-0">
                  <div className="mb-2 flex flex-wrap items-center gap-1.5">
                    <span className="rounded bg-indigo-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-indigo-700">
                      {taskIsWorkflow ? 'Workflow' : detailTask.parentTaskId ? 'Subtarea' : 'Tarea'}
                    </span>
                    <span className={`rounded px-2 py-0.5 text-[10px] font-black uppercase tracking-wider ${detailUrgencyStyles.due}`}>
                      {detailDueState === 'ok' ? 'A tiempo' : detailDueState === 'none' ? 'Sin fecha' : getDueLabel(detailDueState)}
                    </span>
                    <span className={`rounded px-2 py-0.5 text-[10px] font-black uppercase tracking-wider ${getPriorityClass(detailTask.priority || 'medium')}`}>
                      {getPriorityLabel(detailTask.priority || 'medium')}
                    </span>
                  </div>
                  <h2 className="truncate text-lg font-bold text-slate-900">{detailTitle}</h2>
                  <p className="mt-1 truncate text-sm text-slate-500">
                    {detailTask.organizationName || 'Sin organización'} · {detailTask.projectName || 'Sin proyecto'}
                    {detailEndDate ? ` · Vence ${format(detailEndDate, 'd MMM yyyy', { locale: es })}` : ''}
                  </p>
                </div>
                <Button variant="ghost" size="icon" onClick={() => setDetailsModalTask(null)} className="shrink-0">
                  <X className="w-5 h-5 text-slate-400" />
                </Button>
              </div>

              <div className="flex-1 overflow-y-auto bg-slate-50 p-5">
                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <p className="text-sm text-slate-700">
                    {detailTask.initialObservation || detailTask.description || 'Sin descripción'}
                  </p>

                  {taskIsWorkflow ? (
                    <div className="mt-4 space-y-2">
                      {detailWorkflowSteps.map((step: any, index: number) => {
                        const isCurrent = index === detailCurrentIndex;
                        const stepStatus = step?.status || (isCurrent ? 'en_curso' : 'pendiente');

                        return (
                          <div
                            key={step.id || step.label || index}
                            className={`flex items-center gap-3 rounded-lg border px-3 py-2 ${isCurrent ? 'border-indigo-200 bg-indigo-50' : 'border-slate-100 bg-slate-50'}`}
                          >
                            <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${isCurrent ? 'bg-indigo-600 text-white' : 'bg-white text-slate-500 ring-1 ring-slate-200'}`}>
                              {index + 1}
                            </span>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-semibold text-slate-900">
                                {step.label || `Paso ${index + 1}`}
                              </p>
                              <p className="truncate text-xs text-slate-500">
                                {step.assignedToName || step.assigneeName || step.assignedRole || 'Sin responsable visible'}
                              </p>
                            </div>
                            <span className={`shrink-0 rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${getWorkflowStepStatusClass(stepStatus)}`}>
                              {getWorkflowStepStatusLabel(stepStatus)}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="mt-4 rounded-lg bg-slate-50 p-3">
                      <div className="flex items-center justify-between text-xs font-semibold text-slate-600">
                        <span>{getTaskStatusLabel(detailTask.status || 'todo')}</span>
                        <span>{detailProgress}%</span>
                      </div>
                      <div className="mt-2 h-2 overflow-hidden rounded-full bg-white">
                        <div className={`h-full ${detailUrgencyStyles.progress}`} style={{ width: `${detailProgress}%` }} />
                      </div>
                      {detailTask.type === 'quantitative' && (
                        <p className="mt-2 text-xs text-slate-500">
                          Avance: {detailTask.currentValue || 0}/{detailTask.indicatorValue || 0} {detailTask.indicator || ''}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 p-4">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setCommentsModalTask(detailTask);
                    setDetailsModalTask(null);
                  }}
                >
                  <MessageSquare className="mr-2 h-4 w-4" />
                  Comentarios
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setDocsModalTask(detailTask);
                    setDetailsModalTask(null);
                  }}
                >
                  <FileText className="mr-2 h-4 w-4" />
                  Documentos
                </Button>
                <Link
                  href={`/projects/${detailTask.projectId}?tab=tasks`}
                  onClick={() => setDetailsModalTask(null)}
                  className="inline-flex h-9 items-center justify-center rounded-md bg-slate-900 px-3 text-sm font-semibold text-white transition-colors hover:bg-slate-800"
                >
                  <FolderOpen className="mr-2 h-4 w-4" />
                  Abrir proyecto
                </Link>
              </div>
            </div>
          </div>
        );
      })()}

      {/* History Modal */}
      {historyModalTask && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl overflow-hidden max-h-[90vh] flex flex-col">
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
                  <div key={index} className="flex min-w-0 gap-3 sm:gap-4">
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
                    <div className="min-w-0 flex-1 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                      <div className="mb-2 flex min-w-0 flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-bold text-slate-900">
                            {history.userName || 'Usuario'}
                          </p>
                          <p className="break-words text-xs text-slate-500 [overflow-wrap:anywhere]">
                            Paso {history.stepIndex + 1}: {historyModalTask.workflowSteps[history.stepIndex]?.label || 'Desconocido'}
                          </p>
                        </div>
                        <div className="shrink-0 text-left sm:text-right">
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
                        <div className="mt-3 whitespace-pre-wrap break-words text-sm text-slate-700 bg-slate-50 p-3 rounded-lg border border-slate-100 [overflow-wrap:anywhere]">
                          {history.comment}
                        </div>
                      )}
                      
                      {history.formData && Object.keys(history.formData).length > 0 && (
                        <div className="mt-3 p-3 bg-indigo-50 border border-indigo-100 rounded-lg">
                          <p className="text-[10px] font-bold text-indigo-600 uppercase tracking-wider mb-2">Datos del Formulario</p>
                          <div className="space-y-2">
                            {Object.entries(history.formData).map(([fieldId, value]: [string, any]) => {
                              const step = historyModalTask.workflowSteps[history.stepIndex];
                              const field = step?.form?.fields?.find((f: any) => f.id === fieldId);
                              return (
                                <div
                                  key={fieldId}
                                  className="grid min-w-0 gap-1 rounded-md border border-indigo-100/60 bg-white/55 p-2 sm:grid-cols-[180px_minmax(0,1fr)] sm:gap-3"
                                >
                                  <span className="min-w-0 break-words text-[11px] font-bold uppercase tracking-wide text-slate-600 [overflow-wrap:anywhere]">
                                    {field?.label || fieldId}
                                  </span>
                                  {renderHistoryFormValue(value)}
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

      <TaskCommentsModal
        isOpen={!!commentsModalTask}
        onClose={() => setCommentsModalTask(null)}
        projectId={commentsModalTask?.projectId || ''}
        task={commentsModalTask}
        currentUser={user}
        teamMembers={projectTeamMembers}
      />
    </div>
  );
}
