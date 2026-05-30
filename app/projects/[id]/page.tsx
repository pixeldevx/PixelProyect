"use client"

import React, { useState, useEffect } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ArrowLeft, Upload, File, FileText, Download, Trash2, Clock, AlertCircle, Folder, Users, Plus, X, Calendar, CreditCard, RefreshCw, Loader2, Search, ClipboardList, DollarSign, Link2, ShieldCheck, BookOpen, BarChart3 } from 'lucide-react';
import { doc, getDoc, collection, query, where, onSnapshot, addDoc, deleteDoc, serverTimestamp, updateDoc, arrayUnion, arrayRemove, orderBy, writeBatch, getDocs, increment } from '@/lib/supabase/document-store';
import { ref, uploadBytes, getDownloadURL, deleteObject } from '@/lib/supabase/storage-shim';
import { db, storage } from '@/lib/backend';
import { useAuth } from '@/hooks/useAuth';
import { useRolePermissions } from '@/hooks/useRolePermissions';
import Link from 'next/link';
import { ProjectRateCards } from '@/components/projects/ProjectRateCards';
import { ProjectBudget } from '@/components/projects/ProjectBudget';
import ProjectBilling from '@/components/projects/ProjectBilling';
import { ProjectGantt } from '@/components/projects/ProjectGantt';
import { ProjectDocumentsTree } from '@/components/projects/ProjectDocumentsTree';
import { ProjectDriveRepositories } from '@/components/projects/ProjectDriveRepositories';
import { ProjectQuality } from '@/components/projects/ProjectQuality';
import { ProjectLogbook } from '@/components/projects/ProjectLogbook';
import { TaskDetailsModal } from '@/components/projects/TaskDetailsModal';
import { TaskCommentsModal } from '@/components/projects/TaskCommentsModal';
import { TaskStatusReportModal } from '@/components/projects/TaskStatusReportModal';
import { StartWorkflowModal } from '@/components/projects/StartWorkflowModal';
import { CreateTaskModal } from '@/components/projects/modals/CreateTaskModal';
import { BulkWorkflowIterationsModal } from '@/components/projects/modals/BulkWorkflowIterationsModal';
import { EditTaskStructureModal } from '@/components/projects/modals/EditTaskStructureModal';
import { IncrementTaskValueModal } from '@/components/projects/modals/IncrementTaskValueModal';
import { UploadDocumentModal } from '@/components/projects/modals/UploadDocumentModal';
import { AssignMemberModal } from '@/components/projects/modals/AssignMemberModal';
import { RemoveMemberModal } from '@/components/projects/modals/RemoveMemberModal';
import { CompleteTaskModal } from '@/components/projects/modals/CompleteTaskModal';
import { ProjectOrgChart } from '@/components/projects/ProjectOrgChart';
import { handleDataError, OperationType } from '@/lib/backend-utils';
import { toast } from 'sonner';
import Image from 'next/image';
import { belongsToAnyOrganization, getOrganizationIds } from '@/lib/organizations';
import { getProgressForTaskStatus, isCompletedTaskStatus } from '@/lib/taskProgress';
import { notifyTaskAssignment } from '@/lib/notifications';
import { getStaticRateCardAssignee, getStaticRateCardSources } from '@/lib/rate-card-config';

const getTaskTitle = (task: any) => task?.title || task?.name || 'Tarea';
const DEFAULT_TASK_GROUP_ID = '__ungrouped__';
const DEFAULT_TASK_GROUP_NAME = 'Sin grupo';
const DEFAULT_TASK_GROUP_COLOR = '#94a3b8';

const stripWorkflowStepRuntime = (step: any = {}) => {
  const nextStep = { ...step };
  [
    'status',
    'completed',
    'completedAt',
    'completedBy',
    'startedAt',
    'startedBy',
    'formData',
    'returnedAt',
    'returnedBy',
    'stoppedAt',
    'stoppedBy',
    'resumedAt',
    'resumedBy',
  ].forEach((key) => {
    delete nextStep[key];
  });
  return nextStep;
};

const taskReceivesWorkflowStructure = (task: any) =>
  task?.type === 'workflow' || Array.isArray(task?.workflowSteps);

const mergeWorkflowStepStructure = (currentStep: any = {}, structuralStep: any = {}, index: number) => ({
  ...currentStep,
  ...stripWorkflowStepRuntime(structuralStep),
  label: structuralStep.label || currentStep.label || `Paso ${index + 1}`,
  status: currentStep.status || 'not_started',
});

const resetWorkflowStepRuntime = (step: any = {}) => ({
  ...stripWorkflowStepRuntime(step),
  status: 'not_started',
  completed: false,
});

const getDateValue = (value: any) => {
  if (!value) return null;
  if (value.toDate) return value.toDate();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const normalizeCompletedTaskStatus = (status: string, task: any) => {
  if (status !== 'completed') return status;
  const endDate = getDateValue(task?.endDate || task?.end);
  if (!endDate) return status;
  return Date.now() > endDate.getTime() ? 'completed_late' : 'completed';
};

const isWorkflowManualCompletionStatus = (status: string) =>
  status === 'completed' || status === 'completed_late' || status === 'listo';

const isDynamicRateCardEnabled = (source: any) =>
  Boolean(source?.dynamicRateCard || source?.rateCardMode === 'dynamic' || source?.dynamicRateCardConfig);

const isManualStaticRateCardEnabled = (source: any) =>
  Boolean(source?.isRateCardTask && source?.rateCardId && source?.autoAddUnits === false && !isDynamicRateCardEnabled(source));

const getDynamicRateCardUnits = (source: any) =>
  Number(source?.dynamicRateCardConfig?.defaultUnits || source?.unitsToAdd || 1);

const shouldRequestDynamicRateCardUnits = (source: any) =>
  source?.autoAddUnits === false || source?.dynamicRateCardConfig?.promptForUnits === true;

const normalizeEmailAddress = (value: unknown) =>
  typeof value === 'string' ? value.trim().toLowerCase() : '';

const getRateCardDateKeys = (date = new Date()) => {
  const year = date.getFullYear();
  const dateKey = date.toISOString().slice(0, 10);
  const monthKey = `${year}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  const startOfYear = new Date(year, 0, 1);
  const dayOfYear = Math.floor((date.getTime() - startOfYear.getTime()) / 86400000) + 1;
  const weekKey = `${year}-W${String(Math.ceil(dayOfYear / 7)).padStart(2, '0')}`;

  return { dateKey, weekKey, monthKey };
};

export default function ProjectDetailsPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const projectId = params.id as string;
  const { user, userRole, userOrganizationId, userOrganizationIds } = useAuth();
  const { permissions: rolePermissions } = useRolePermissions(userRole);

  const [project, setProject] = useState<any>(null);
  const [documents, setDocuments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [documentSearchQuery, setDocumentSearchQuery] = useState('');

  const [documentToDelete, setDocumentToDelete] = useState<{id: string, storagePath: string, name: string} | null>(null);
  const [taskToDelete, setTaskToDelete] = useState<{id: string, title: string} | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const [teamMembers, setTeamMembers] = useState<any[]>([]);
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);

  const [activeTab, setActiveTab] = useState<'documents' | 'drive' | 'tasks' | 'logbook' | 'quality' | 'rateCards' | 'budget' | 'billing' | 'orgChart'>('tasks');
  const [showDocumentIssueAlert, setShowDocumentIssueAlert] = useState(false);

  useEffect(() => {
    const tabParam = searchParams.get('tab');
    if (tabParam === 'tasksList') {
      setActiveTab('tasks');
      return;
    }
    if (tabParam && ['documents', 'drive', 'tasks', 'logbook', 'quality', 'rateCards', 'budget', 'billing', 'orgChart'].includes(tabParam)) {
      setActiveTab(tabParam as any);
    }
  }, [searchParams]);
  const [tasks, setTasks] = useState<any[]>([]);
  const [rateCards, setRateCards] = useState<any[]>([]);
  const [budgetLines, setBudgetLines] = useState<any[]>([]);
  const [isCreateTaskModalOpen, setIsCreateTaskModalOpen] = useState(false);
  const [completingTaskId, setCompletingTaskId] = useState<string | null>(null);
  const [isTaskDocsModalOpen, setIsTaskDocsModalOpen] = useState(false);
  const [selectedTaskForDocs, setSelectedTaskForDocs] = useState<any>(null);
  const [isStartWorkflowModalOpen, setIsStartWorkflowModalOpen] = useState(false);
  const [selectedTaskForStartWorkflow, setSelectedTaskForStartWorkflow] = useState<any>(null);
  const [taskForStructureEdit, setTaskForStructureEdit] = useState<any>(null);
  const [selectedTaskForIncrement, setSelectedTaskForIncrement] = useState<any>(null);
  const [selectedTaskForComments, setSelectedTaskForComments] = useState<any>(null);
  const [taskForBulkIterations, setTaskForBulkIterations] = useState<any>(null);
  const [isTaskStatusReportOpen, setIsTaskStatusReportOpen] = useState(false);
  const [dynamicRateCardStatusChange, setDynamicRateCardStatusChange] = useState<{
    taskId: string;
    newStatus: string;
    task: any;
  } | null>(null);
  const [dynamicRateCardAssignee, setDynamicRateCardAssignee] = useState('');
  const [dynamicRateCardId, setDynamicRateCardId] = useState('');
  const [dynamicRateCardUnits, setDynamicRateCardUnits] = useState<number | ''>(1);
  const [dynamicRateCardComment, setDynamicRateCardComment] = useState('');
  const managedOrganizationIds = React.useMemo(
    () => (userOrganizationIds.length > 0 ? userOrganizationIds : userOrganizationId ? [userOrganizationId] : []),
    [userOrganizationId, userOrganizationIds]
  );
  const currentGlobalAdminAssignee = React.useMemo(() => {
    if (!user || userRole !== 'admin') return null;

    const currentEmail = normalizeEmailAddress(user.email);
    const existingMember = teamMembers.find((member) =>
      member.id === user.uid ||
      member.authUserId === user.uid ||
      normalizeEmailAddress(member.email) === currentEmail
    );

    if (existingMember) {
      return {
        ...existingMember,
        authUserId: existingMember.authUserId || user.uid,
        roleName: existingMember.roleName || 'Administrador Global',
        systemRole: existingMember.systemRole || 'admin',
      };
    }

    return {
      id: user.uid,
      authUserId: user.uid,
      email: user.email || '',
      name: user.displayName || user.email?.split('@')[0] || 'Administrador Global',
      displayName: user.displayName || user.email?.split('@')[0] || 'Administrador Global',
      photoURL: user.photoURL || null,
      roleName: 'Administrador Global',
      systemRole: 'admin',
      organizationId: null,
      organizationIds: [],
    };
  }, [teamMembers, user, userRole]);

  const teamMembersForAssignment = React.useMemo(() => {
    if (!currentGlobalAdminAssignee) return teamMembers;
    if (teamMembers.some((member) => member.id === currentGlobalAdminAssignee.id)) return teamMembers;
    return [currentGlobalAdminAssignee, ...teamMembers];
  }, [currentGlobalAdminAssignee, teamMembers]);


  useEffect(() => {
    if (!user || !projectId) return;

    // Fetch project details (realtime)
    const docRef = doc(db, 'projects', projectId);
    const unsubscribeProject = onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists()) {
        setProject({ id: docSnap.id, ...docSnap.data() });
      } else {
        router.push('/projects');
      }
    }, (error) => {
      handleDataError(error, OperationType.GET, `projects/${projectId}`);
    });

    // Listen to documents
    const q = query(collection(db, 'projects', projectId, 'documents'));
    const unsubscribeDocs = onSnapshot(q, (snapshot) => {
      const docsData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setDocuments(docsData);
      setLoading(false);
    }, (error) => {
      handleDataError(error, OperationType.LIST, `projects/${projectId}/documents`);
      setLoading(false);
    });

    // Listen to tasks
    const qTasks = query(collection(db, 'projects', projectId, 'tasks'), orderBy('createdAt', 'desc'));
    const unsubscribeTasks = onSnapshot(qTasks, (snapshot) => {
      const tasksData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setTasks(tasksData);
    }, (error) => {
      handleDataError(error, OperationType.LIST, `projects/${projectId}/tasks`);
    });

    // Fetch all team members
    const qTeam = query(collection(db, 'team_members'));
    const unsubscribeTeam = onSnapshot(qTeam, (snapshot) => {
      const teamData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setTeamMembers(teamData);
    }, (error) => {
      handleDataError(error, OperationType.LIST, 'team_members');
    });

    // Listen to rate cards
    const qRateCards = query(collection(db, 'projects', projectId, 'rateCards'));
    const unsubscribeRateCards = onSnapshot(qRateCards, (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setRateCards(data);
    }, (error) => {
      handleDataError(error, OperationType.LIST, `projects/${projectId}/rateCards`);
    });

    // Listen to budget lines
    const qBudgetLines = query(collection(db, 'projects', projectId, 'budgetLines'));
    const unsubscribeBudgetLines = onSnapshot(qBudgetLines, (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setBudgetLines(data);
    }, (error) => {
      handleDataError(error, OperationType.LIST, `projects/${projectId}/budgetLines`);
    });

    return () => {
      unsubscribeProject();
      unsubscribeDocs();
      unsubscribeTasks();
      unsubscribeTeam();
      unsubscribeRateCards();
      unsubscribeBudgetLines();
    };
  }, [user, projectId, router]);

  const confirmDeleteDocument = (docId: string, storagePath: string, name: string) => {
    setDocumentToDelete({ id: docId, storagePath, name });
  };

  const executeDeleteDocument = async () => {
    if (!documentToDelete) return;

    setIsDeleting(true);
    try {
      // Delete from Storage
      if (documentToDelete.storagePath) {
        const fileRef = ref(storage, documentToDelete.storagePath);
        await deleteObject(fileRef);
      }

      // Delete from Supabase
      await deleteDoc(doc(db, 'projects', projectId, 'documents', documentToDelete.id));

      setDocumentToDelete(null);
    } catch (error: any) {
      console.error("Error deleting document:", error);
      toast.error(`Error al eliminar el documento: ${error.message || 'Error desconocido'}`);
    } finally {
      setIsDeleting(false);
    }
  };

  const [memberToRemove, setMemberToRemove] = useState<{id: string, name: string} | null>(null);

  const handleRemoveMember = (memberId: string) => {
    const member = teamMembers.find(m => m.id === memberId);
    if (member) {
      setMemberToRemove({ id: memberId, name: member.name || member.email });
    }
  };

  const canManageProject = userRole === 'admin' || userRole === 'coordinador' || project?.ownerId === user?.uid;
  const canCreateTasks = rolePermissions.taskCreate;
  const canEditTaskStatus = rolePermissions.taskEditStatus;
  const canEditTaskDetails = rolePermissions.taskEditDetails;
  const canEditTaskDates = rolePermissions.taskEditDates;
  const canAddSubtasks = rolePermissions.taskAddSubtasks;
  const canDeleteTasks = rolePermissions.taskDelete;
  const canEditTaskStructure =
    rolePermissions.taskEditStructure &&
    (userRole !== 'org_admin' || !project?.organizationId || belongsToAnyOrganization(project, managedOrganizationIds));
  const canManageDriveRepositories =
    userRole === 'admin' ||
    (userRole === 'org_admin' && (!project?.organizationId || belongsToAnyOrganization(project, managedOrganizationIds)));
  const canManageWorkflowTemplates =
    userRole === 'admin' ||
    (userRole === 'org_admin' && (!project?.organizationId || belongsToAnyOrganization(project, managedOrganizationIds)));
  const taskGroups = React.useMemo(
    () =>
      Array.isArray(project?.taskGroups)
        ? [...project.taskGroups].sort((left: any, right: any) => {
            const leftOrder = left.order ?? 0;
            const rightOrder = right.order ?? 0;
            if (leftOrder !== rightOrder) return leftOrder - rightOrder;
            return String(left.name || '').localeCompare(String(right.name || ''));
          })
        : [],
    [project?.taskGroups]
  );

  const currentGlobalAdminAssigneeId = currentGlobalAdminAssignee?.id || '';
  const projectOrganizationIds = getOrganizationIds(project);
  const organizationTeamMembers = teamMembersForAssignment.filter((member) => {
    if (member.id === currentGlobalAdminAssigneeId) return true;
    if (projectOrganizationIds.length === 0) return true;
    const memberOrganizationIds = getOrganizationIds(member);
    return memberOrganizationIds.some((organizationId) => projectOrganizationIds.includes(organizationId));
  });
  const projectAssignableTeamMembers = organizationTeamMembers.filter((member) => {
    if (member.id === currentGlobalAdminAssigneeId) return true;
    return (project?.assignedTeamMembers || []).includes(member.id);
  });

  const collectDependentTaskIds = (taskId: string) => {
    const taskIds = new Set<string>([taskId]);
    let foundNewDependent = true;

    while (foundNewDependent) {
      foundNewDependent = false;
      tasks.forEach((currentTask) => {
        if (currentTask.parentTaskId && taskIds.has(currentTask.parentTaskId) && !taskIds.has(currentTask.id)) {
          taskIds.add(currentTask.id);
          foundNewDependent = true;
        }
      });
    }

    return taskIds;
  };

  const handleUpdateTaskProgress = async (taskId: string, newProgress: number, task: any) => {
    if (!task) return;
    if (!canEditTaskDetails) {
      toast.error('No tienes permisos para editar los detalles de tareas.');
      return;
    }
    if (task.type === 'workflow' && newProgress >= 100) {
      toast.warning('Los workflows se finalizan aprobando sus pasos. Desde la tarea general solo se pueden iniciar en Trabajando.');
      return;
    }
    try {
      if (newProgress === 100 && task.requiresDocument && !task.linkedDocumentId) {
        setCompletingTaskId(taskId);
        return;
      }

      let status = 'in_progress';
      if (newProgress === 0) status = 'todo';
      if (newProgress === 100) status = 'completed';
      status = normalizeCompletedTaskStatus(status, task);

      const batch = writeBatch(db);
      const taskRef = doc(db, 'projects', projectId, 'tasks', taskId);

      // Handle Rate Card update
      if (task.isRateCardTask && task.rateCardId && task.unitsToAdd) {
        if (task.type !== 'workflow') {
          // Proportional for non-workflow
          const oldProgress = task.progress || 0;
          const deltaProgress = newProgress - oldProgress;
          const unitsDelta = (deltaProgress / 100) * task.unitsToAdd;

          if (unitsDelta !== 0) {
            const rcRef = doc(db, 'projects', projectId, 'rateCards', task.rateCardId);
            const updateData: any = {
              currentValue: increment(unitsDelta)
            };
            if (task.assignedTo) {
              updateData[`userStats.${task.assignedTo}`] = increment(unitsDelta);
            }
            batch.update(rcRef, updateData);
          }
        } else {
          // For workflow, only if completing/reverting the whole task
          const wasCompleted = task.status === 'completed' || task.status === 'completed_late';
          const isCompleted = status === 'completed' || status === 'completed_late';

          if (wasCompleted !== isCompleted) {
            const rcRef = doc(db, 'projects', projectId, 'rateCards', task.rateCardId);
            const units = task.unitsToAdd || 1;
            const updateData: any = {
              currentValue: increment(isCompleted ? units : -units)
            };
            if (task.assignedTo) {
              updateData[`userStats.${task.assignedTo}`] = increment(isCompleted ? units : -units);
            }
            batch.update(rcRef, updateData);

            // Also update all steps if completing/reverting the whole task
            if (task.workflowSteps) {
              const updatedSteps = task.workflowSteps.map((step: any) => {
                const stepWasApproved = step.status === 'listo';
                const stepIsApproved = isCompleted;

                const stepRateCardSources = getStaticRateCardSources(step);
                if (stepWasApproved !== stepIsApproved && stepRateCardSources.length > 0) {
                  stepRateCardSources.forEach((stepRateCardSource) => {
                    const stepRcRef = doc(db, 'projects', projectId, 'rateCards', stepRateCardSource.rateCardId);
                    const stepUnits = stepRateCardSource.unitsToAdd || 1;
                    const stepUpdateData: any = {
                      currentValue: increment(stepIsApproved ? stepUnits : -stepUnits)
                    };
                    const stepAssignee = getStaticRateCardAssignee(stepRateCardSource, step.assignedTo);
                    if (stepAssignee) {
                      stepUpdateData[`userStats.${stepAssignee}`] = increment(stepIsApproved ? stepUnits : -stepUnits);
                    }
                    batch.update(stepRcRef, stepUpdateData);
                  });
                }
                return { ...step, status: stepIsApproved ? 'listo' : 'not_started' };
              });

              batch.update(taskRef, { workflowSteps: updatedSteps });
            }
          }
        }
      }

      batch.update(taskRef, {
        progress: newProgress,
        status: status,
        updatedAt: serverTimestamp()
      });

      await batch.commit();
    } catch (error: any) {
      console.error("Error updating task:", error);
      toast.error(`Error al actualizar la tarea: ${error.message}`);
    }
  };

  const handleUpdateTaskValue = async (taskId: string, newValue: number, task: any) => {
    if (!task || !task.indicatorValue) return;
    if (!canEditTaskDetails) {
      toast.error('No tienes permisos para editar los detalles de tareas.');
      return;
    }
    try {
      const targetValue = Number(task.indicatorValue);
      const safeValue = Math.min(Math.max(Number(newValue) || 0, 0), targetValue);
      const progress = Math.min(100, Math.round((safeValue / targetValue) * 100));
      const requiresCompletionDocument = progress === 100 && task.requiresDocument && !task.linkedDocumentId;

      let status = 'in_progress';
      if (progress === 0) status = 'todo';
      if (progress === 100) status = requiresCompletionDocument ? 'in_progress' : 'completed';

      const batch = writeBatch(db);
      const taskRef = doc(db, 'projects', projectId, 'tasks', taskId);

      // Handle Rate Card update for non-workflow tasks
      if (task.type !== 'workflow' && task.isRateCardTask && task.rateCardId && task.unitsToAdd) {
        const oldProgress = task.progress || 0;
        const deltaProgress = progress - oldProgress;
        const unitsDelta = (deltaProgress / 100) * task.unitsToAdd;

        if (unitsDelta !== 0) {
          const rcRef = doc(db, 'projects', projectId, 'rateCards', task.rateCardId);
          const updateData: any = {
            currentValue: increment(unitsDelta)
          };
          if (task.assignedTo) {
            updateData[`userStats.${task.assignedTo}`] = increment(unitsDelta);
          }
          batch.update(rcRef, updateData);
        }
      }

      if (task.incrementForm?.rateCardId) {
        const units = Number(task.incrementForm.unitsToAdd || 1);
        const rcRef = doc(db, 'projects', projectId, 'rateCards', task.incrementForm.rateCardId);
        const updateData: any = {
          currentValue: increment(units),
        };
        if (task.assignedTo) {
          updateData[`userStats.${task.assignedTo}`] = increment(units);
        }
        batch.update(rcRef, updateData);
      }

      batch.update(taskRef, {
        currentValue: safeValue,
        progress: progress,
        status: status,
        updatedAt: serverTimestamp()
      });

      await batch.commit();

      if (requiresCompletionDocument) {
        setCompletingTaskId(taskId);
        toast.info('La tarea llegó a la meta. Adjunta el documento requerido para completarla.');
      }
    } catch (error: any) {
      console.error("Error updating task value:", error);
      toast.error(`Error al actualizar el valor de la tarea: ${error.message}`);
    }
  };

  const handleIncrementTaskValue = async (
    task: any,
    amount: number,
    formData: Record<string, any>,
    comment: string
  ) => {
    if (!canEditTaskDetails) {
      toast.error('No tienes permisos para registrar incrementos en tareas.');
      return;
    }

    if (!task || !task.indicatorValue) {
      toast.warning('Esta tarea no tiene una meta válida configurada.');
      return;
    }

    const incrementAmount = Number(amount);
    const targetValue = Number(task.indicatorValue);
    const currentValue = Number(task.currentValue || 0);

    if (!incrementAmount || incrementAmount <= 0) {
      toast.warning('Ingresa un incremento mayor a cero.');
      return;
    }

    if (!targetValue || targetValue <= 0) {
      toast.warning('Esta tarea no tiene una meta válida configurada.');
      return;
    }

    const nextValue = Math.min(targetValue, currentValue + incrementAmount);
    const appliedAmount = nextValue - currentValue;

    if (appliedAmount <= 0) {
      toast.info('La tarea ya alcanzó la meta.');
      return;
    }

    try {
      const progress = Math.min(100, Math.round((nextValue / targetValue) * 100));
      const requiresCompletionDocument = progress === 100 && task.requiresDocument && !task.linkedDocumentId;
      let status = 'in_progress';
      if (progress === 0) status = 'todo';
      if (progress === 100) status = requiresCompletionDocument ? 'in_progress' : 'completed';

      const batch = writeBatch(db);
      const taskRef = doc(db, 'projects', projectId, 'tasks', task.id);

      if (task.type !== 'workflow' && task.isRateCardTask && task.rateCardId && task.unitsToAdd) {
        const oldProgress = task.progress || 0;
        const deltaProgress = progress - oldProgress;
        const unitsDelta = (deltaProgress / 100) * task.unitsToAdd;

        if (unitsDelta !== 0) {
          const rcRef = doc(db, 'projects', projectId, 'rateCards', task.rateCardId);
          const updateData: any = {
            currentValue: increment(unitsDelta)
          };
          if (task.assignedTo) {
            updateData[`userStats.${task.assignedTo}`] = increment(unitsDelta);
          }
          batch.update(rcRef, updateData);
        }
      }

      batch.update(taskRef, {
        currentValue: nextValue,
        progress,
        status,
        updatedAt: serverTimestamp(),
        incrementHistory: arrayUnion({
          id: `${Date.now()}_${Math.random().toString(36).slice(2)}`,
          amount: appliedAmount,
          requestedAmount: incrementAmount,
          previousValue: currentValue,
          nextValue,
          indicator: task.indicator || '',
          formData: Object.keys(formData || {}).length > 0 ? formData : null,
          comment: comment.trim() || null,
          createdAt: new Date().toISOString(),
          createdBy: user?.uid || 'unknown',
        }),
      });

      await batch.commit();

      if (task.parentTaskId) {
        const { updateParentTaskStatus } = await import('@/lib/taskUtils');
        await updateParentTaskStatus(projectId, task.parentTaskId);
      }

      if (requiresCompletionDocument) {
        setCompletingTaskId(task.id);
        toast.info('La tarea llegó a la meta. Adjunta el documento requerido para completarla.');
      } else {
        toast.success(`Incremento registrado: ${nextValue}/${targetValue} ${task.indicator || ''}`.trim());
      }
    } catch (error: any) {
      console.error("Error incrementing task value:", error);
      throw error;
    }
  };

  const handleSyncTaskValue = async (taskId: string, task: any) => {
    if (!task || !task.syncExternal) return;
    if (!canEditTaskDetails) {
      toast.error('No tienes permisos para sincronizar tareas.');
      return;
    }

    try {
      // Simulate external DB sync
      // In a real scenario, this would be a fetch to an API
      const simulatedValue = (task.currentValue || 0) + Math.floor(Math.random() * 5) + 1;
      const finalValue = Math.min(simulatedValue, task.indicatorValue);

      await handleUpdateTaskValue(taskId, finalValue, task);
      toast.success(`Sincronizado con éxito. Nuevo valor: ${finalValue} ${task.indicator}`);
    } catch (error: any) {
      console.error("Error syncing task:", error);
      toast.error(`Error al sincronizar: ${error.message}`);
    }
  };

  const resetDynamicRateCardFields = (task: any = null) => {
    setDynamicRateCardAssignee(task?.assignedTo || '');
    setDynamicRateCardId(task?.rateCardId || '');
    setDynamicRateCardUnits(getDynamicRateCardUnits(task));
    setDynamicRateCardComment('');
  };

  const addDynamicRateCardChargeToBatch = (
    batch: ReturnType<typeof writeBatch>,
    params: {
      task: any;
      rateCardId: string;
      assigneeId: string;
      units: number;
      source: string;
      comment?: string | null;
      reversal?: boolean;
    },
  ) => {
    const amount = Number(params.units);
    if (!params.rateCardId || !params.assigneeId || !amount) return null;

    const rcRef = doc(db, 'projects', projectId, 'rateCards', params.rateCardId);
    batch.update(rcRef, {
      currentValue: increment(amount),
      [`userStats.${params.assigneeId}`]: increment(amount),
    });

    const entryRef = doc(collection(db, 'projects', projectId, 'rateCardEntries'));
    const now = new Date();
    batch.set(entryRef, {
      projectId,
      taskId: params.task.id,
      taskTitle: params.task.title || params.task.name || 'Tarea',
      rateCardId: params.rateCardId,
      assignedTo: params.assigneeId,
      units: amount,
      source: params.source,
      comment: params.comment || null,
      reversal: Boolean(params.reversal),
      ...getRateCardDateKeys(now),
      createdAt: serverTimestamp(),
      createdBy: user?.uid || null,
      createdByEmail: user?.email || null,
    });

    return {
      entryId: entryRef.id,
      rateCardId: params.rateCardId,
      assignedTo: params.assigneeId,
      units: amount,
      source: params.source,
      reversal: Boolean(params.reversal),
      createdAt: now.toISOString(),
    };
  };

  const handleUpdateTaskStatus = async (taskId: string, newStatus: string, task: any, dynamicCharge?: {
    assigneeId: string;
    rateCardId: string;
    units: number;
    comment?: string | null;
  }) => {
    if (!task) return;
    if (!canEditTaskStatus) {
      toast.error('No tienes permisos para cambiar el estado de tareas.');
      return;
    }
    try {
      if (task.isParentTask) {
        toast.info("El estado de esta tarea madre se actualiza automáticamente según sus subtareas.");
        return;
      }

      if (task.type === 'workflow' && isWorkflowManualCompletionStatus(newStatus)) {
        toast.warning('Un workflow no se puede marcar como Listo manualmente. Debe completarse aprobando todos sus pasos.');
        return;
      }

      if (task.type === 'workflow' && newStatus !== 'in_progress' && newStatus !== task.status) {
        toast.warning('Desde el estado general solo puedes pasar el workflow a Trabajando para iniciarlo.');
        return;
      }

      if (newStatus === 'completed' && task.requiresDocument && !task.linkedDocumentId) {
        setCompletingTaskId(taskId);
        return;
      }

      const finalStatus = normalizeCompletedTaskStatus(newStatus, task);

      // If it's a workflow and moving to in-progress, show the start modal
      if (task.type === 'workflow' && finalStatus === 'in_progress' && task.status === 'todo') {
        setSelectedTaskForStartWorkflow(task);
        setIsStartWorkflowModalOpen(true);
        return;
      }

      const progress = getProgressForTaskStatus(finalStatus, task.progress);
      const taskHasDynamicRateCard = isDynamicRateCardEnabled(task);
      const taskHasManualStaticRateCard = isManualStaticRateCardEnabled(task);
      const taskNeedsCompletionRateCardCharge = taskHasDynamicRateCard || taskHasManualStaticRateCard;
      const wasCompleted = isCompletedTaskStatus(task.status);
      const isCompleted = isCompletedTaskStatus(finalStatus);

      if (taskNeedsCompletionRateCardCharge && isCompleted && !wasCompleted && !dynamicCharge) {
        setDynamicRateCardStatusChange({ taskId, newStatus, task });
        resetDynamicRateCardFields(task);
        return;
      }

      const batch = writeBatch(db);
      const taskRef = doc(db, 'projects', projectId, 'tasks', taskId);
      let dynamicRateCardCharge: any = null;

      // Handle Rate Card update
      if (task.isRateCardTask && task.rateCardId && task.unitsToAdd) {
        if (task.type !== 'workflow') {
          if (!taskHasManualStaticRateCard) {
            // Proportional for non-workflow tasks with automatic units.
            const oldProgress = task.progress || 0;
            const deltaProgress = progress - oldProgress;
            const unitsDelta = (deltaProgress / 100) * task.unitsToAdd;

            if (unitsDelta !== 0) {
              const rcRef = doc(db, 'projects', projectId, 'rateCards', task.rateCardId);
              const updateData: any = {
                currentValue: increment(unitsDelta)
              };
              if (task.assignedTo) {
                updateData[`userStats.${task.assignedTo}`] = increment(unitsDelta);
              }
              batch.update(rcRef, updateData);
            }
          }
        } else {
          // For workflow, only if completing the whole task
          const wasCompleted = task.status === 'completed' || task.status === 'completed_late';
          const isCompleted = finalStatus === 'completed' || finalStatus === 'completed_late';

          if (wasCompleted !== isCompleted) {
            const rcRef = doc(db, 'projects', projectId, 'rateCards', task.rateCardId);
            const units = task.unitsToAdd || 1;
            const updateData: any = {
              currentValue: increment(isCompleted ? units : -units)
            };
            if (task.assignedTo) {
              updateData[`userStats.${task.assignedTo}`] = increment(isCompleted ? units : -units);
            }
            batch.update(rcRef, updateData);

            // Also update all steps if completing/reverting the whole task
            if (task.workflowSteps) {
              const updatedSteps = task.workflowSteps.map((step: any) => {
                const stepWasApproved = step.status === 'listo';
                const stepIsApproved = isCompleted;

                const stepRateCardSources = getStaticRateCardSources(step);
                if (stepWasApproved !== stepIsApproved && stepRateCardSources.length > 0) {
                  stepRateCardSources.forEach((stepRateCardSource) => {
                    const stepRcRef = doc(db, 'projects', projectId, 'rateCards', stepRateCardSource.rateCardId);
                    const stepUnits = stepRateCardSource.unitsToAdd || 1;
                    const stepUpdateData: any = {
                      currentValue: increment(stepIsApproved ? stepUnits : -stepUnits)
                    };
                    const stepAssignee = getStaticRateCardAssignee(stepRateCardSource, step.assignedTo);
                    if (stepAssignee) {
                      stepUpdateData[`userStats.${stepAssignee}`] = increment(stepIsApproved ? stepUnits : -stepUnits);
                    }
                    batch.update(stepRcRef, stepUpdateData);
                  });
                }
                return { ...step, status: stepIsApproved ? 'listo' : 'not_started' };
              });

              batch.update(taskRef, { workflowSteps: updatedSteps });
            }
          }
        }
      }

      if (taskNeedsCompletionRateCardCharge && isCompleted && !wasCompleted && dynamicCharge) {
        dynamicRateCardCharge = addDynamicRateCardChargeToBatch(batch, {
          task,
          rateCardId: taskHasManualStaticRateCard ? task.rateCardId : dynamicCharge.rateCardId,
          assigneeId: taskHasManualStaticRateCard ? (task.assignedTo || dynamicCharge.assigneeId) : dynamicCharge.assigneeId,
          units: dynamicCharge.units,
          source: taskHasManualStaticRateCard ? 'project_task_status_manual_units' : 'project_task_status',
          comment: dynamicCharge.comment || null,
        });
      }

      if (taskNeedsCompletionRateCardCharge && wasCompleted && !isCompleted && task.dynamicRateCardLastCharge) {
        const lastCharge = task.dynamicRateCardLastCharge;
        dynamicRateCardCharge = addDynamicRateCardChargeToBatch(batch, {
          task,
          rateCardId: lastCharge.rateCardId,
          assigneeId: lastCharge.assignedTo,
          units: -Math.abs(Number(lastCharge.units || 0)),
          source: 'project_task_status_reversal',
          comment: 'Reverso automático por cambio de estado desde finalizada.',
          reversal: true,
        });
      }

      const taskUpdate: any = {
        status: finalStatus,
        progress: progress,
        priority: task.priority || 'medium',
        updatedAt: serverTimestamp()
      };

      if (dynamicRateCardCharge && !dynamicRateCardCharge.reversal && dynamicCharge) {
        taskUpdate.dynamicRateCardLastCharge = dynamicRateCardCharge;
      } else if (taskNeedsCompletionRateCardCharge && wasCompleted && !isCompleted) {
        taskUpdate.dynamicRateCardLastCharge = null;
      }

      batch.update(taskRef, taskUpdate);

      await batch.commit();

      if (task.parentTaskId) {
        const { updateParentTaskStatus } = await import('@/lib/taskUtils');
        await updateParentTaskStatus(projectId, task.parentTaskId);
      }
    } catch (error: any) {
      console.error("Error updating task status:", error);
      toast.error(`Error al actualizar el estado de la tarea: ${error.message}`);
    }
  };

  const confirmDynamicRateCardStatusChange = async () => {
    if (!dynamicRateCardStatusChange) return;
    const taskRequestsUnits = shouldRequestDynamicRateCardUnits(dynamicRateCardStatusChange.task);

    if (
      !dynamicRateCardAssignee ||
      !dynamicRateCardId ||
      (taskRequestsUnits && (dynamicRateCardUnits === '' || Number(dynamicRateCardUnits) <= 0))
    ) {
      toast.warning('Completa la persona, el perfil y las unidades del Rate Card.');
      return;
    }
    if (!projectAssignableTeamMembers.some((member) => member.id === dynamicRateCardAssignee)) {
      toast.warning('La persona seleccionada debe pertenecer a la organización y al proyecto.');
      return;
    }

    await handleUpdateTaskStatus(
      dynamicRateCardStatusChange.taskId,
      dynamicRateCardStatusChange.newStatus,
      dynamicRateCardStatusChange.task,
      {
        assigneeId: dynamicRateCardAssignee,
        rateCardId: dynamicRateCardId,
        units: taskRequestsUnits
          ? Number(dynamicRateCardUnits)
          : getDynamicRateCardUnits(dynamicRateCardStatusChange.task),
        comment: dynamicRateCardComment.trim() || null,
      },
    );

    setDynamicRateCardStatusChange(null);
    resetDynamicRateCardFields();
  };


  const handleDeleteTask = (taskId: string) => {
    if (!canDeleteTasks) {
      toast.error('No tienes permisos para eliminar tareas.');
      return;
    }

    const task = tasks.find(t => t.id === taskId);
    if (task) {
      setTaskToDelete({ id: taskId, title: getTaskTitle(task) });
    }
  };

  const executeDeleteTask = async () => {
    if (!taskToDelete) return;
    setIsDeleting(true);
    try {
      const task = tasks.find(t => t.id === taskToDelete.id);
      const batch = writeBatch(db);

      const deleteTaskLinkedData = async (taskId: string) => {
        const [qualitySnapshot, commentsSnapshot] = await Promise.all([
          getDocs(query(collection(db, 'projects', projectId, 'qualityEvents'), where('taskId', '==', taskId))),
          getDocs(query(collection(db, 'projects', projectId, 'tasks', taskId, 'comments'))),
        ]);

        qualitySnapshot.docs.forEach((docSnap) => batch.delete(docSnap.ref));
        commentsSnapshot.docs.forEach((docSnap) => batch.delete(docSnap.ref));
      };

      const revertRateCard = (t: any) => {
        if (t.isRateCardTask && t.rateCardId && t.unitsToAdd) {
          const rcRef = doc(db, 'projects', projectId, 'rateCards', t.rateCardId);
          if (t.type !== 'workflow') {
            const units = (t.progress / 100) * t.unitsToAdd;
            if (units !== 0) {
              const updateData: any = { currentValue: increment(-units) };
              if (t.assignedTo) updateData[`userStats.${t.assignedTo}`] = increment(-units);
              batch.update(rcRef, updateData);
            }
          } else if (t.status === 'completed' || t.status === 'completed_late') {
            const units = t.unitsToAdd || 1;
            const updateData: any = { currentValue: increment(-units) };
            if (t.assignedTo) updateData[`userStats.${t.assignedTo}`] = increment(-units);
            batch.update(rcRef, updateData);
          }
        }

        // Revert step-level rate cards
        if (t.type === 'workflow' && t.workflowSteps) {
          t.workflowSteps.forEach((step: any) => {
            const stepRateCardSources = getStaticRateCardSources(step);
            if (step.completed && stepRateCardSources.length > 0) {
              stepRateCardSources.forEach((stepRateCardSource) => {
                const rcRef = doc(db, 'projects', projectId, 'rateCards', stepRateCardSource.rateCardId);
                const units = stepRateCardSource.unitsToAdd || 1;
                const updateData: any = { currentValue: increment(-units) };
                const stepAssignee = getStaticRateCardAssignee(stepRateCardSource, step.assignedTo);
                if (stepAssignee) updateData[`userStats.${stepAssignee}`] = increment(-units);
                batch.update(rcRef, updateData);
              });
            }
          });
        }
      };

      if (task?.isParentTask) {
        const subtasksQuery = query(
          collection(db, 'projects', projectId, 'tasks'),
          where('parentTaskId', '==', task.id)
        );
        const snapshot = await getDocs(subtasksQuery);
        const taskIdsToDelete: string[] = [task.id];
        snapshot.docs.forEach(d => {
          const subtask = { id: d.id, ...d.data() };
          revertRateCard(subtask);
          taskIdsToDelete.push(d.id);
          batch.delete(d.ref);
        });
        revertRateCard(task);
        batch.delete(doc(db, 'projects', projectId, 'tasks', task.id));
        await Promise.all(taskIdsToDelete.map(deleteTaskLinkedData));
      } else if (task) {
        revertRateCard(task);
        batch.delete(doc(db, 'projects', projectId, 'tasks', task.id));
        await deleteTaskLinkedData(task.id);
      }

      await batch.commit();

      if (task?.parentTaskId) {
        const { updateParentTaskStatus } = await import('@/lib/taskUtils');
        await updateParentTaskStatus(projectId, task.parentTaskId);
      }

      setTaskToDelete(null);
      toast.success("Tarea eliminada correctamente");
    } catch (error: any) {
      console.error("Error deleting task:", error);
      toast.error(`Error al eliminar la tarea: ${error.message}`);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleReorderTasks = async (newTasks: any[]) => {
    if (!canEditTaskDetails) {
      toast.error('No tienes permisos para reordenar tareas.');
      return;
    }

    try {
      // Update local state first for immediate feedback
      setTasks(newTasks);

      // Update Supabase for each task that changed its order
      const promises = newTasks.map((task) => {
        return updateDoc(doc(db, 'projects', projectId, 'tasks', task.id), {
          displayOrder: task.displayOrder,
          groupId: task.groupId || null,
          updatedAt: serverTimestamp()
        });
      });

      await Promise.all(promises);
    } catch (error: any) {
      console.error("Error reordering tasks:", error);
    }
  };

  const handleUpdateTaskDates = async (taskId: string, start: Date, end: Date, task: any) => {
    if (!task) return;
    if (!canEditTaskDates) {
      toast.error('No tienes permisos para editar fechas de tareas.');
      return;
    }
    try {
      await updateDoc(doc(db, 'projects', projectId, 'tasks', taskId), {
        startDate: start,
        endDate: end,
        start,
        end,
        updatedAt: serverTimestamp()
      });
    } catch (error: any) {
      console.error("Error updating task dates:", error);
      toast.error(`Error al actualizar las fechas de la tarea: ${error.message}`);
    }
  };

  const handleUpdateTaskTitle = async (taskId: string, title: string, task: any) => {
    if (!task) return;
    if (!canEditTaskDetails && !canEditTaskStructure) {
      toast.error('No tienes permisos para editar el nombre de tareas.');
      return;
    }
    const cleanTitle = title.trim();
    if (!cleanTitle) {
      toast.warning('El nombre de la tarea no puede estar vacío.');
      return;
    }

    try {
      await updateDoc(doc(db, 'projects', projectId, 'tasks', taskId), {
        title: cleanTitle,
        name: cleanTitle,
        updatedAt: serverTimestamp()
      });
      setTasks((currentTasks) =>
        currentTasks.map((currentTask) =>
          currentTask.id === taskId
            ? { ...currentTask, title: cleanTitle, name: cleanTitle }
            : currentTask
        )
      );
      toast.success('Nombre de la tarea actualizado');
    } catch (error: any) {
      console.error("Error updating task title:", error);
      toast.error(`Error al actualizar el nombre: ${error.message}`);
    }
  };

  const handleUpdateTaskPriority = async (taskId: string, priority: string, task: any) => {
    if (!task) return;
    if (!canEditTaskDetails) {
      toast.error('No tienes permisos para editar la prioridad de tareas.');
      return;
    }

    try {
      const taskRef = doc(db, 'projects', projectId, 'tasks', taskId);
      await updateDoc(taskRef, { priority, updatedAt: serverTimestamp() });
      toast.success('Prioridad actualizada');
    } catch (error) {
      console.error('Error updating task priority:', error);
      toast.error('Error al actualizar la prioridad');
    }
  };

  const handleUpdateTaskAssignee = async (taskId: string, assignedTo: string, task: any) => {
    if (!task) return;
    if (!canEditTaskDetails) {
      toast.error('No tienes permisos para editar el responsable de tareas.');
      return;
    }
    if (assignedTo && !projectAssignableTeamMembers.some((member) => member.id === assignedTo)) {
      toast.error('Solo puedes asignar personas que pertenezcan a la organización y al proyecto.');
      return;
    }

    try {
      const taskRef = doc(db, 'projects', projectId, 'tasks', taskId);
      await updateDoc(taskRef, { assignedTo, updatedAt: serverTimestamp() });
      if (assignedTo && assignedTo !== task.assignedTo && !isCompletedTaskStatus(task.status)) {
        void notifyTaskAssignment({
          projectId,
          taskId,
          assigneeId: assignedTo,
          eventType: 'task_assigned',
          source: 'task_assignee_changed',
        });
      }
      toast.success('Asignado actualizado');
    } catch (error) {
      console.error('Error updating task assignee:', error);
      toast.error('Error al actualizar el asignado');
    }
  };

  const handleCreateTaskGroup = async (name: string, color: string) => {
    if (!project) return;
    if (!canEditTaskDetails) {
      toast.error('No tienes permisos para administrar grupos.');
      return;
    }

    const cleanName = name.trim().replace(/\s+/g, ' ');
    if (!cleanName) {
      toast.warning('Ingresa el nombre del grupo.');
      return;
    }

    try {
      const nextGroups = [
        ...taskGroups,
        {
          id: `task_group_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          name: cleanName,
          color,
          order: taskGroups.length,
          createdAt: new Date().toISOString(),
          createdBy: user?.uid || null,
        },
      ];

      await updateDoc(doc(db, 'projects', projectId), {
        taskGroups: nextGroups,
        updatedAt: serverTimestamp(),
      });
      toast.success('Grupo creado.');
    } catch (error: any) {
      console.error('Error creating task group:', error);
      toast.error(error?.message || 'No se pudo crear el grupo.');
    }
  };

  const handleUpdateTaskGroupDefinition = async (groupId: string, updates: any) => {
    if (!project) return;
    if (!canEditTaskDetails) {
      toast.error('No tienes permisos para administrar grupos.');
      return;
    }

    const requestedName =
      typeof updates.name === 'string'
        ? updates.name.trim().replace(/\s+/g, ' ')
        : undefined;
    const existingGroup = taskGroups.find((group: any) => group.id === groupId);
    const now = new Date().toISOString();
    const nextGroups = existingGroup
      ? taskGroups.map((group: any) =>
          group.id === groupId
            ? {
                ...group,
                ...updates,
                name: requestedName || group.name,
                updatedAt: now,
              }
            : group
        )
      : [
          ...taskGroups,
          {
            id: groupId,
            name: requestedName || (groupId === DEFAULT_TASK_GROUP_ID ? DEFAULT_TASK_GROUP_NAME : 'Nuevo grupo'),
            color: updates.color || (groupId === DEFAULT_TASK_GROUP_ID ? DEFAULT_TASK_GROUP_COLOR : '#579bfc'),
            order: groupId === DEFAULT_TASK_GROUP_ID ? -1 : taskGroups.length,
            createdAt: now,
            createdBy: user?.uid || null,
            updatedAt: now,
          },
        ];

    try {
      await updateDoc(doc(db, 'projects', projectId), {
        taskGroups: nextGroups,
        updatedAt: serverTimestamp(),
      });
    } catch (error: any) {
      console.error('Error updating task group:', error);
      toast.error(error?.message || 'No se pudo actualizar el grupo.');
    }
  };

  const handleDeleteTaskGroup = async (groupId: string) => {
    if (!project) return;
    if (!canEditTaskDetails) {
      toast.error('No tienes permisos para administrar grupos.');
      return;
    }
    if (groupId === DEFAULT_TASK_GROUP_ID) {
      toast.warning('El grupo predeterminado no se puede eliminar, solo renombrar o cambiar de color.');
      return;
    }

    const group = taskGroups.find((candidate: any) => candidate.id === groupId);
    if (!group) return;

    const confirmed = window.confirm(`¿Eliminar el grupo "${group.name}"? Las tareas quedarán sin grupo.`);
    if (!confirmed) return;

    try {
      const batch = writeBatch(db);
      batch.update(doc(db, 'projects', projectId), {
        taskGroups: taskGroups.filter((candidate: any) => candidate.id !== groupId),
        updatedAt: serverTimestamp(),
      });

      tasks
        .filter((task) => task.groupId === groupId)
        .forEach((task) => {
          batch.update(doc(db, 'projects', projectId, 'tasks', task.id), {
            groupId: null,
            updatedAt: serverTimestamp(),
          });
        });

      await batch.commit();
      toast.success('Grupo eliminado.');
    } catch (error: any) {
      console.error('Error deleting task group:', error);
      toast.error(error?.message || 'No se pudo eliminar el grupo.');
    }
  };

  const handleUpdateTaskGroup = async (taskId: string, groupId: string, task: any) => {
    if (!task) return;
    if (!canEditTaskDetails) {
      toast.error('No tienes permisos para editar grupos de tareas.');
      return;
    }
    const normalizedGroupId = groupId === DEFAULT_TASK_GROUP_ID ? '' : groupId;
    if (normalizedGroupId && !taskGroups.some((group: any) => group.id === normalizedGroupId)) {
      toast.error('El grupo seleccionado no existe.');
      return;
    }

    try {
      await updateDoc(doc(db, 'projects', projectId, 'tasks', taskId), {
        groupId: normalizedGroupId || null,
        updatedAt: serverTimestamp(),
      });
      setTasks((currentTasks) =>
        currentTasks.map((currentTask) =>
          currentTask.id === taskId ? { ...currentTask, groupId: normalizedGroupId || null } : currentTask
        )
      );
      toast.success(normalizedGroupId ? 'Tarea agregada al grupo.' : 'Tarea agregada al grupo predeterminado.');
    } catch (error: any) {
      console.error('Error updating task group assignment:', error);
      toast.error(error?.message || 'No se pudo actualizar el grupo de la tarea.');
    }
  };

  const handleCreateSubtask = async (
    parentTask: any,
    subtask: {
      title: string;
      description: string;
      assignedTo: string;
      priority: string;
      status: string;
      startDate: string;
      endDate: string;
    }
  ) => {
    if (!user || !parentTask) return;
    if (!canAddSubtasks) {
      toast.error('No tienes permisos para crear subtareas.');
      return;
    }

    const cleanTitle = subtask.title.trim();
    if (!cleanTitle) {
      toast.warning('Ingresa el nombre de la subtarea.');
      return;
    }

    const subtaskStartDate = new Date(`${subtask.startDate}T00:00:00`);
    const subtaskEndDate = new Date(`${subtask.endDate}T00:00:00`);
    if (Number.isNaN(subtaskStartDate.getTime()) || Number.isNaN(subtaskEndDate.getTime())) {
      toast.warning('Define fechas válidas para la subtarea.');
      return;
    }

    const currentSubtasks = tasks.filter((candidate) => candidate.parentTaskId === parentTask.id);
    const batch = writeBatch(db);
    const subtaskRef = doc(collection(db, 'projects', projectId, 'tasks'));
    const progress = subtask.status === 'completed' || subtask.status === 'completed_late' ? 100 : subtask.status === 'in_progress' ? 10 : 0;

    try {
      batch.set(subtaskRef, {
        projectId,
        title: cleanTitle,
        name: cleanTitle,
        description: subtask.description.trim(),
        startDate: subtaskStartDate,
        endDate: subtaskEndDate,
        start: subtaskStartDate,
        end: subtaskEndDate,
        assignedTo: subtask.assignedTo || parentTask.assignedTo || '',
        indicator: null,
        indicatorValue: null,
        status: subtask.status || 'todo',
        progress,
        type: 'state',
        requiresDocument: false,
        linkedDocumentId: null,
        isRateCardTask: false,
        rateCardId: null,
        unitsToAdd: null,
        syncExternal: false,
        priority: subtask.priority || parentTask.priority || 'medium',
        groupId: parentTask.groupId || null,
        currentValue: 0,
        parentTaskId: parentTask.id,
        displayOrder: tasks.length + currentSubtasks.length + 1,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        createdBy: user.uid,
      });

      batch.update(doc(db, 'projects', projectId, 'tasks', parentTask.id), {
        isParentTask: true,
        totalSubtasks: currentSubtasks.length + 1,
        updatedAt: serverTimestamp(),
      });

      await batch.commit();

      const { updateParentTaskStatus } = await import('@/lib/taskUtils');
      await updateParentTaskStatus(projectId, parentTask.id);

      toast.success('Subtarea creada correctamente.');
    } catch (error: any) {
      console.error("Error creating subtask:", error);
      toast.error(`Error al crear la subtarea: ${error.message}`);
      throw error;
    }
  };

  const handleUpdateTaskStructure = async (
    task: any,
    updates: { title: string; workflowSteps?: any[]; rateCard?: any }
  ) => {
    if (!task) return;

    if (!canEditTaskStructure) {
      toast.error('No tienes permisos para editar la estructura de tareas.');
      return;
    }

    const cleanTitle = updates.title.trim();
    if (!cleanTitle) {
      toast.warning('El nombre de la tarea no puede estar vacío.');
      return;
    }

    const shouldUpdateWorkflow = Array.isArray(updates.workflowSteps);
    const structuralSteps = shouldUpdateWorkflow
      ? updates.workflowSteps!.map(stripWorkflowStepRuntime)
      : [];
    const dependentTaskIds = shouldUpdateWorkflow ? collectDependentTaskIds(task.id) : new Set<string>([task.id]);

    try {
      const batch = writeBatch(db);

      dependentTaskIds.forEach((taskId) => {
        const currentTask = tasks.find((candidate) => candidate.id === taskId);
        if (!currentTask) return;

        const updateData: any = {
          title: cleanTitle,
          name: cleanTitle,
          updatedAt: serverTimestamp(),
        };

        if (shouldUpdateWorkflow && taskReceivesWorkflowStructure(currentTask)) {
          const updatedSteps = structuralSteps.map((step, index) =>
            mergeWorkflowStepStructure(currentTask.workflowSteps?.[index], step, index)
          );
          updateData.workflowSteps = updatedSteps;
          updateData.currentStepIndex =
            updatedSteps.length > 0
              ? Math.min(currentTask.currentStepIndex || 0, updatedSteps.length - 1)
              : 0;
        }

        if (updates.rateCard) {
          updateData.isRateCardTask = updates.rateCard.isRateCardTask;
          updateData.rateCardMode = updates.rateCard.rateCardMode;
          updateData.dynamicRateCard = updates.rateCard.dynamicRateCard;
          updateData.dynamicRateCardConfig = updates.rateCard.dynamicRateCardConfig;
          updateData.rateCardId = updates.rateCard.rateCardId;
          updateData.unitsToAdd = updates.rateCard.unitsToAdd;
          updateData.autoAddUnits = updates.rateCard.autoAddUnits;
          updateData.syncExternal = updates.rateCard.rateCardId
            ? Boolean(rateCards.find((rateCard) => rateCard.id === updates.rateCard.rateCardId)?.syncExternal)
            : false;
        }

        batch.update(doc(db, 'projects', projectId, 'tasks', taskId), updateData);
      });

      await batch.commit();

      setTasks((currentTasks) =>
        currentTasks.map((currentTask) => {
          if (!dependentTaskIds.has(currentTask.id)) return currentTask;

          const updatedTask: any = {
            ...currentTask,
            title: cleanTitle,
            name: cleanTitle,
          };

          if (shouldUpdateWorkflow && taskReceivesWorkflowStructure(currentTask)) {
            const updatedSteps = structuralSteps.map((step, index) =>
              mergeWorkflowStepStructure(currentTask.workflowSteps?.[index], step, index)
            );
            updatedTask.workflowSteps = updatedSteps;
            updatedTask.currentStepIndex =
              updatedSteps.length > 0
                ? Math.min(currentTask.currentStepIndex || 0, updatedSteps.length - 1)
                : 0;
          }

          if (updates.rateCard) {
            updatedTask.isRateCardTask = updates.rateCard.isRateCardTask;
            updatedTask.rateCardMode = updates.rateCard.rateCardMode;
            updatedTask.dynamicRateCard = updates.rateCard.dynamicRateCard;
            updatedTask.dynamicRateCardConfig = updates.rateCard.dynamicRateCardConfig;
            updatedTask.rateCardId = updates.rateCard.rateCardId;
            updatedTask.unitsToAdd = updates.rateCard.unitsToAdd;
            updatedTask.autoAddUnits = updates.rateCard.autoAddUnits;
            updatedTask.syncExternal = updates.rateCard.rateCardId
              ? Boolean(rateCards.find((rateCard) => rateCard.id === updates.rateCard.rateCardId)?.syncExternal)
              : false;
          }

          return updatedTask;
        })
      );

      toast.success(
        dependentTaskIds.size === 1
          ? 'Estructura de tarea actualizada.'
          : `Estructura replicada en ${dependentTaskIds.size} tareas dependientes.`
      );
    } catch (error: any) {
      console.error("Error updating task structure:", error);
      toast.error(`Error al actualizar la estructura: ${error.message}`);
      throw error;
    }
  };

  const handleResetWorkflowTask = async (task: any) => {
    if (!task || task.type !== 'workflow') return;

    if (!canEditTaskDetails) {
      toast.error('No tienes permisos para reiniciar workflows.');
      return;
    }

    const confirmed = window.confirm(
      `¿Reiniciar el flujo "${getTaskTitle(task)}"? La tarea volverá a Pendiente y se limpiará el avance actual.`
    );
    if (!confirmed) return;

    try {
      const batch = writeBatch(db);
      const taskRef = doc(db, 'projects', projectId, 'tasks', task.id);

      (task.workflowSteps || []).forEach((step: any) => {
        const stepRateCardSources = getStaticRateCardSources(step);
        if (step.status === 'listo' && stepRateCardSources.length > 0) {
          stepRateCardSources.forEach((stepRateCardSource) => {
            const stepRcRef = doc(db, 'projects', projectId, 'rateCards', stepRateCardSource.rateCardId);
            const stepUnits = Number(stepRateCardSource.unitsToAdd || 1);
            const updateData: any = {
              currentValue: increment(-stepUnits),
            };
            const stepAssignee = getStaticRateCardAssignee(stepRateCardSource, step.assignedTo);
            if (stepAssignee) {
              updateData[`userStats.${stepAssignee}`] = increment(-stepUnits);
            }
            batch.update(stepRcRef, updateData);
          });
        }
      });

      if ((task.status === 'completed' || task.status === 'completed_late') && task.isRateCardTask && task.rateCardId) {
        const taskRcRef = doc(db, 'projects', projectId, 'rateCards', task.rateCardId);
        const taskUnits = Number(task.unitsToAdd || 1);
        const updateData: any = {
          currentValue: increment(-taskUnits),
        };
        if (task.assignedTo) {
          updateData[`userStats.${task.assignedTo}`] = increment(-taskUnits);
        }
        batch.update(taskRcRef, updateData);
      }

      const resetTitle = task.originalTitle || getTaskTitle(task);
      const resetHistoryEntry = {
        action: 'reset',
        comment: 'Workflow reiniciado',
        userId: user?.uid || null,
        timestamp: new Date().toISOString(),
      };

      batch.update(taskRef, {
        title: resetTitle,
        name: resetTitle,
        status: 'todo',
        progress: 0,
        currentStepIndex: 0,
        workflowSteps: (task.workflowSteps || []).map(resetWorkflowStepRuntime),
        workflowHistory: [resetHistoryEntry, ...(task.workflowHistory || [])],
        externalWorkflowId: null,
        initialObservation: null,
        startDocumentId: null,
        linkedDocumentId: null,
        updatedAt: serverTimestamp(),
      });

      await batch.commit();

      if (task.parentTaskId) {
        const { updateParentTaskStatus } = await import('@/lib/taskUtils');
        await updateParentTaskStatus(projectId, task.parentTaskId);
      }

      toast.success('Workflow reiniciado correctamente.');
    } catch (error: any) {
      console.error('Error resetting workflow task:', error);
      toast.error(error?.message || 'No se pudo reiniciar el workflow.');
      throw error;
    }
  };

  const getDocTypeBadge = (type: string) => {
    switch (type) {
      case 'contract': return <span className="bg-indigo-50 text-indigo-700 px-2 py-1 rounded-md text-xs font-medium">Contrato</span>;
      case 'proposal': return <span className="bg-emerald-50 text-emerald-700 px-2 py-1 rounded-md text-xs font-medium">Propuesta</span>;
      case 'other': return <span className="bg-slate-100 text-slate-700 px-2 py-1 rounded-md text-xs font-medium">Otro</span>;
      default: return <span className="bg-slate-100 text-slate-700 px-2 py-1 rounded-md text-xs font-medium">{type}</span>;
    }
  };

  if (loading || !project) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64 text-slate-500">
          Cargando detalles del proyecto...
        </div>
      </DashboardLayout>
    );
  }

  // Check if minimum required documents are present
  const hasContract = documents.some(d => d.type === 'contract');
  const hasProposal = documents.some(d => d.type === 'proposal');
  const missingRequiredDocuments = [
    !hasContract ? 'Contrato firmado' : null,
    !hasProposal ? 'Propuesta técnica/comercial' : null,
  ].filter(Boolean) as string[];
  const pendingRateCardTask = dynamicRateCardStatusChange?.task || null;
  const pendingManualStaticRateCard = pendingRateCardTask ? isManualStaticRateCardEnabled(pendingRateCardTask) : false;
  const lockPendingRateCardAssignee = Boolean(pendingManualStaticRateCard && pendingRateCardTask?.assignedTo);
  const lockPendingRateCardProfile = Boolean(pendingManualStaticRateCard && pendingRateCardTask?.rateCardId);
  const pendingRateCardRequestsUnits = pendingRateCardTask ? shouldRequestDynamicRateCardUnits(pendingRateCardTask) : false;

  return (
    <DashboardLayout>
      <div className="mb-4">
        <Link href="/projects" className="inline-flex items-center text-sm text-slate-500 hover:text-indigo-600 mb-3 transition-colors">
          <ArrowLeft size={16} className="mr-1" /> Volver a Proyectos
        </Link>
        <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm md:flex-row md:items-center md:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-xl font-bold tracking-tight text-slate-900">{project.name}</h1>
              <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                project.status === 'active' ? 'bg-amber-100 text-amber-800' :
                project.status === 'completed' ? 'bg-emerald-100 text-emerald-800' :
                'bg-slate-100 text-slate-800'
              }`}>
                {project.status === 'active' ? 'Activo' : project.status === 'completed' ? 'Completado' : 'En Pausa'}
              </span>
            </div>
            <p className="mt-1 max-w-3xl truncate text-sm text-slate-500">{project.description || 'Sin descripción'}</p>
          </div>
          <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
            <span className="rounded-md bg-slate-50 px-2.5 py-1">{tasks.length} tareas</span>
            {missingRequiredDocuments.length > 0 && (
              <button
                type="button"
                onClick={() => setShowDocumentIssueAlert(true)}
                className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-2.5 py-1 font-semibold text-amber-700 transition-colors hover:bg-amber-100"
              >
                <AlertCircle size={13} />
                {missingRequiredDocuments.length} alerta{missingRequiredDocuments.length > 1 ? 's' : ''}
              </button>
            )}
          </div>
        </div>
      </div>

      {missingRequiredDocuments.length > 0 && showDocumentIssueAlert && (
        <div className="fixed right-5 top-20 z-40 w-[min(360px,calc(100vw-2.5rem))] rounded-xl border border-amber-200 bg-white p-4 shadow-2xl">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 rounded-full bg-amber-50 p-2 text-amber-600">
              <AlertCircle size={18} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Documentación pendiente</h3>
                  <p className="mt-1 text-xs text-slate-500">Faltan documentos obligatorios del proyecto.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowDocumentIssueAlert(false)}
                  className="rounded-full p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
                  aria-label="Cerrar alerta"
                >
                  <X size={15} />
                </button>
              </div>
              <div className="mt-3 space-y-1">
                {missingRequiredDocuments.map((documentName) => (
                  <div key={documentName} className="rounded-md bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-800">
                    {documentName}
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={() => {
                  setActiveTab('documents');
                  setShowDocumentIssueAlert(false);
                }}
                className="mt-3 inline-flex h-8 items-center rounded-md bg-indigo-600 px-3 text-xs font-semibold text-white transition-colors hover:bg-indigo-700"
              >
                Ir a Documentos
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="mb-5 rounded-xl border border-slate-200 bg-white px-2 shadow-sm">
        <div className="flex gap-1 overflow-x-auto">
          <button
            onClick={() => setActiveTab('tasks')}
            className={`min-h-11 whitespace-nowrap rounded-lg px-3 text-sm font-semibold transition-colors ${
              activeTab === 'tasks'
                ? 'bg-indigo-50 text-indigo-700'
                : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'
            }`}
          >
            <div className="flex items-center gap-2">
              <Calendar size={16} />
              Tareas
            </div>
          </button>
          <button
            onClick={() => setActiveTab('documents')}
            className={`min-h-11 whitespace-nowrap rounded-lg px-3 text-sm font-semibold transition-colors ${
              activeTab === 'documents'
                ? 'bg-indigo-50 text-indigo-700'
                : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'
            }`}
          >
            <div className="flex items-center gap-2">
              <FileText size={16} />
              Documentos
            </div>
          </button>
          <button
            onClick={() => setActiveTab('drive')}
            className={`min-h-11 whitespace-nowrap rounded-lg px-3 text-sm font-semibold transition-colors ${
              activeTab === 'drive'
                ? 'bg-indigo-50 text-indigo-700'
                : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'
            }`}
          >
            <div className="flex items-center gap-2">
              <Link2 size={16} />
              Drive
            </div>
          </button>
          <button
            onClick={() => setActiveTab('logbook')}
            className={`min-h-11 whitespace-nowrap rounded-lg px-3 text-sm font-semibold transition-colors ${
              activeTab === 'logbook'
                ? 'bg-indigo-50 text-indigo-700'
                : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'
            }`}
          >
            <div className="flex items-center gap-2">
              <BookOpen size={16} />
              Bitácora
            </div>
          </button>
          <button
            onClick={() => setActiveTab('quality')}
            className={`min-h-11 whitespace-nowrap rounded-lg px-3 text-sm font-semibold transition-colors ${
              activeTab === 'quality'
                ? 'bg-indigo-50 text-indigo-700'
                : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'
            }`}
          >
            <div className="flex items-center gap-2">
              <ShieldCheck size={16} />
              Gestión de calidad
            </div>
          </button>
          <button
            onClick={() => setActiveTab('rateCards')}
            className={`min-h-11 whitespace-nowrap rounded-lg px-3 text-sm font-semibold transition-colors ${
              activeTab === 'rateCards'
                ? 'bg-indigo-50 text-indigo-700'
                : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'
            }`}
          >
            <div className="flex items-center gap-2">
              <CreditCard size={16} />
              Rate Cards
            </div>
          </button>
          <button
            onClick={() => setActiveTab('budget')}
            className={`min-h-11 whitespace-nowrap rounded-lg px-3 text-sm font-semibold transition-colors ${
              activeTab === 'budget'
                ? 'bg-indigo-50 text-indigo-700'
                : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'
            }`}
          >
            <div className="flex items-center gap-2">
              <DollarSign size={16} />
              Presupuesto
            </div>
          </button>
          <button
            onClick={() => setActiveTab('billing')}
            className={`min-h-11 whitespace-nowrap rounded-lg px-3 text-sm font-semibold transition-colors ${
              activeTab === 'billing'
                ? 'bg-indigo-50 text-indigo-700'
                : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'
            }`}
          >
            <div className="flex items-center gap-2">
              <FileText size={16} />
              Facturación
            </div>
          </button>
          <button
            onClick={() => setActiveTab('orgChart')}
            className={`min-h-11 whitespace-nowrap rounded-lg px-3 text-sm font-semibold transition-colors ${
              activeTab === 'orgChart'
                ? 'bg-indigo-50 text-indigo-700'
                : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'
            }`}
          >
            <div className="flex items-center gap-2">
              <Users size={16} />
              Organigrama
            </div>
          </button>
        </div>
      </div>

      {activeTab === 'documents' && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <div className="relative w-full sm:w-96">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
              <input
                type="text"
                placeholder="Buscar por nombre o ID de tarea..."
                value={documentSearchQuery}
                onChange={(e) => setDocumentSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
              />
            </div>
            <Button
              onClick={() => setIsUploadModalOpen(true)}
              className="bg-indigo-600 hover:bg-indigo-700 text-white w-full sm:w-auto"
            >
              <Upload size={16} className="mr-2" />
              Subir Documento
            </Button>
          </div>

          <Card className="border-slate-200 shadow-sm">
            <CardHeader className="pb-4 border-b border-slate-100 bg-slate-50/50">
              <CardTitle className="text-lg font-semibold text-slate-900 flex items-center gap-2">
                <Folder size={18} className="text-indigo-500" />
                Documentos del Proyecto
              </CardTitle>
              <CardDescription className="text-sm text-slate-500">
                Listado de todos los archivos asociados a este proyecto.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-4">
              <ProjectDocumentsTree
                documents={documents}
                tasks={tasks}
                onDeleteDocument={confirmDeleteDocument}
                searchQuery={documentSearchQuery}
              />
            </CardContent>
          </Card>
        </div>
      )}

      {activeTab === 'drive' && (
        <ProjectDriveRepositories
          projectId={projectId}
          project={project}
          teamMembers={teamMembers}
          currentUser={user}
          canManage={canManageDriveRepositories}
        />
      )}

      {activeTab === 'logbook' && (
        <ProjectLogbook
          projectId={projectId}
          project={project}
          tasks={tasks}
          teamMembers={projectAssignableTeamMembers}
          currentUser={user}
          canCreateTasks={canCreateTasks}
          canAddSubtasks={canAddSubtasks}
        />
      )}

      {activeTab === 'quality' && (
        <ProjectQuality
          projectId={projectId}
          teamMembers={projectAssignableTeamMembers}
          currentUser={user}
          canManage={canEditTaskStructure}
        />
      )}

      {activeTab === 'tasks' && (
        <div className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                <Calendar size={20} className="text-indigo-500" />
                Tareas
              </h2>
              <p className="text-sm text-slate-500 mt-1">Seguimiento y progreso de las tareas del proyecto.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                onClick={() => setIsTaskStatusReportOpen(true)}
                disabled={tasks.length === 0}
                className="border-indigo-100 text-indigo-700 hover:bg-indigo-50"
              >
                <BarChart3 size={16} className="mr-2" />
                Indicadores
              </Button>
              {canCreateTasks && (
                <Button
                  onClick={() => setIsCreateTaskModalOpen(true)}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white"
                >
                  <Plus size={16} className="mr-2" />
                  Nueva Tarea
                </Button>
              )}
            </div>
          </div>

          {/* Tasks List / Gantt */}
          <Card className="border-slate-200 shadow-sm">
            <CardContent className="p-0">
              <ProjectGantt
                tasks={tasks}
                teamMembers={teamMembersForAssignment}
                assigneeOptions={projectAssignableTeamMembers}
                taskGroups={taskGroups}
                onUpdateTaskProgress={canEditTaskDetails ? handleUpdateTaskProgress : undefined}
                onUpdateTaskValue={canEditTaskDetails ? handleUpdateTaskValue : undefined}
                onUpdateTaskStatus={canEditTaskStatus ? handleUpdateTaskStatus : undefined}
                onUpdateTaskPriority={canEditTaskDetails ? handleUpdateTaskPriority : undefined}
                onUpdateTaskAssignee={canEditTaskDetails ? handleUpdateTaskAssignee : undefined}
                onUpdateTaskGroup={canEditTaskDetails ? handleUpdateTaskGroup : undefined}
                onDeleteTask={canDeleteTasks ? handleDeleteTask : undefined}
                onSyncTask={canEditTaskDetails ? handleSyncTaskValue : undefined}
                onReorderTasks={canEditTaskDetails ? handleReorderTasks : undefined}
                onUpdateTaskDates={canEditTaskDates ? handleUpdateTaskDates : undefined}
                onUpdateTaskTitle={canEditTaskDetails ? handleUpdateTaskTitle : undefined}
                onCreateTaskGroup={canEditTaskDetails ? handleCreateTaskGroup : undefined}
                onUpdateTaskGroupDefinition={canEditTaskDetails ? handleUpdateTaskGroupDefinition : undefined}
                onDeleteTaskGroup={canEditTaskDetails ? handleDeleteTaskGroup : undefined}
                onOpenIncrementTask={canEditTaskDetails ? setSelectedTaskForIncrement : undefined}
                canEditTaskDetails={canEditTaskDetails}
                canEditTaskDates={canEditTaskDates}
                canEditTaskStatus={canEditTaskStatus}
                canAddSubtasks={canAddSubtasks}
                canEditTaskStructure={canEditTaskStructure}
                canDeleteTasks={canDeleteTasks}
                onEditTaskStructure={setTaskForStructureEdit}
                onAddSubtask={canAddSubtasks ? setTaskForStructureEdit : undefined}
                onOpenTaskDocs={(taskId, task) => {
                  setSelectedTaskForDocs(task);
                  setIsTaskDocsModalOpen(true);
                }}
                onOpenTaskComments={setSelectedTaskForComments}
                onResetWorkflowTask={canEditTaskDetails ? handleResetWorkflowTask : undefined}
                onCreateBulkWorkflowIterations={canCreateTasks && canAddSubtasks ? setTaskForBulkIterations : undefined}
                onCreateTask={canCreateTasks ? () => setIsCreateTaskModalOpen(true) : undefined}
              />
            </CardContent>
          </Card>
        </div>
      )}

      {/* Task Details Modal */}
      <TaskDetailsModal
        isOpen={isTaskDocsModalOpen}
        onClose={() => {
          setIsTaskDocsModalOpen(false);
          setSelectedTaskForDocs(null);
        }}
        task={selectedTaskForDocs}
        projectId={projectId}
        teamMembers={projectAssignableTeamMembers}
        onResetWorkflowTask={canEditTaskDetails ? handleResetWorkflowTask : undefined}
      />

      <TaskCommentsModal
        isOpen={!!selectedTaskForComments}
        onClose={() => setSelectedTaskForComments(null)}
        projectId={projectId}
        task={selectedTaskForComments}
        currentUser={user}
        teamMembers={teamMembersForAssignment}
      />

      <TaskStatusReportModal
        isOpen={isTaskStatusReportOpen}
        onClose={() => setIsTaskStatusReportOpen(false)}
        tasks={tasks}
        taskGroups={taskGroups}
      />

      {/* Start Workflow Modal */}
      <StartWorkflowModal
        isOpen={isStartWorkflowModalOpen}
        onClose={() => {
          setIsStartWorkflowModalOpen(false);
          setSelectedTaskForStartWorkflow(null);
        }}
        task={selectedTaskForStartWorkflow}
        parentTask={selectedTaskForStartWorkflow?.parentTaskId ? tasks.find((task) => task.id === selectedTaskForStartWorkflow.parentTaskId) : null}
        projectId={projectId}
        userId={user?.uid || ''}
        teamMembers={projectAssignableTeamMembers}
      />

      {activeTab === 'rateCards' && (
        <div className="mt-6">
          <ProjectRateCards projectId={projectId} currentUser={user} tasks={tasks} teamMembers={teamMembersForAssignment} budgetLines={budgetLines} />
        </div>
      )}

      {activeTab === 'budget' && (
        <div className="mt-6">
          <ProjectBudget projectId={projectId} rateCards={rateCards} tasks={tasks} />
        </div>
      )}

      {activeTab === 'billing' && (
        <div className="mt-6">
          <ProjectBilling
            projectId={projectId}
            rateCards={rateCards}
            tasks={tasks}
          />
        </div>
      )}

      {activeTab === 'orgChart' && (
        <div className="mt-6">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                <Users size={20} className="text-indigo-500" />
                Organigrama del Proyecto
              </h2>
              <p className="text-sm text-slate-500 mt-1">Visualiza y edita la estructura organizacional del equipo.</p>
            </div>
          </div>
          <ProjectOrgChart projectId={projectId} teamMembers={teamMembers} />
        </div>
      )}

      {/* Team Members Section Moved to Bottom */}
      <div className="mt-12 grid grid-cols-1 lg:grid-cols-3 gap-8 mb-8">
        <Card className="lg:col-span-3 border-slate-200 shadow-sm">
          <CardHeader className="pb-4 border-b border-slate-100 bg-slate-50/50 flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-lg font-semibold text-slate-900 flex items-center gap-2">
                <Users size={18} className="text-indigo-500" />
                Equipo del Proyecto
              </CardTitle>
              <CardDescription className="text-sm text-slate-500">
                Miembros asignados a este proyecto.
              </CardDescription>
            </div>
            {canManageProject && (
              <Button onClick={() => setIsAssignModalOpen(true)} variant="outline" size="sm" className="h-8">
                <Plus size={16} className="mr-1" /> Asignar Miembro
              </Button>
            )}
          </CardHeader>
          <CardContent className="pt-6">
            {(!project.assignedTeamMembers || project.assignedTeamMembers.length === 0) ? (
              <div className="text-center py-6 text-slate-500 text-sm">
                No hay miembros asignados a este proyecto.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {project.assignedTeamMembers.map((memberId: string) => {
                  const member = teamMembers.find(m => m.id === memberId);
                  if (!member) return null;

                  return (
                    <div key={memberId} className="flex items-center justify-between p-3 border border-slate-200 rounded-lg bg-white">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold text-sm overflow-hidden relative">
                          {member.photoURL ? (
                            <Image src={member.photoURL} alt={member.name} fill className="object-cover" referrerPolicy="no-referrer" />
                          ) : (
                            member.name.charAt(0).toUpperCase()
                          )}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-slate-900">{member.name}</p>
                          <p className="text-xs text-slate-500">{member.roleName}</p>
                        </div>
                      </div>
                      {canManageProject && (
                        <button
                          onClick={() => handleRemoveMember(memberId)}
                          className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors"
                          title="Remover"
                        >
                          <X size={16} />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Delete Confirmation Modal */}
      {documentToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 m-4 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center gap-3 text-red-600 mb-4">
              <div className="p-2 bg-red-100 rounded-full">
                <AlertCircle className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-semibold text-slate-900">Eliminar Documento</h3>
            </div>

            <p className="text-slate-600 mb-6">
              ¿Estás seguro de que deseas eliminar el documento <strong className="text-slate-900">&quot;{documentToDelete.name}&quot;</strong>?
              Esta acción no se puede deshacer y el archivo será borrado permanentemente.
            </p>

            <div className="flex justify-end gap-3">
              <Button
                variant="outline"
                onClick={() => setDocumentToDelete(null)}
                disabled={isDeleting}
                className="border-slate-200 text-slate-700 hover:bg-slate-50"
              >
                Cancelar
              </Button>
              <Button
                onClick={executeDeleteDocument}
                disabled={isDeleting}
                className="bg-red-600 hover:bg-red-700 text-white"
              >
                {isDeleting ? 'Eliminando...' : 'Sí, eliminar documento'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Task Modal */}
      {taskToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 m-4 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center gap-3 text-red-600 mb-4">
              <div className="p-2 bg-red-100 rounded-full">
                <AlertCircle className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-semibold text-slate-900">Eliminar Tarea</h3>
            </div>

            <p className="text-slate-600 mb-6">
              ¿Estás seguro de que deseas eliminar la tarea <strong className="text-slate-900">&quot;{taskToDelete.title}&quot;</strong>?
              Esta acción no se puede deshacer.
            </p>

            <div className="flex justify-end gap-3">
              <Button
                variant="outline"
                onClick={() => setTaskToDelete(null)}
                disabled={isDeleting}
                className="border-slate-200 text-slate-700 hover:bg-slate-50"
              >
                Cancelar
              </Button>
              <Button
                onClick={executeDeleteTask}
                disabled={isDeleting}
                className="bg-red-600 hover:bg-red-700 text-white"
              >
                {isDeleting ? 'Eliminando...' : 'Sí, eliminar tarea'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Remove Member Modal */}
      <RemoveMemberModal
        memberToRemove={memberToRemove}
        onClose={() => setMemberToRemove(null)}
        projectId={projectId}
        teamMembers={teamMembers}
      />
      {/* Assign Team Member Modal */}
      <AssignMemberModal
        isOpen={isAssignModalOpen}
        onClose={() => setIsAssignModalOpen(false)}
        projectId={projectId}
        teamMembers={organizationTeamMembers}
        project={project}
      />

      {/* Task Completion Modal with Document Upload */}
      <CompleteTaskModal
        isOpen={!!completingTaskId}
        onClose={() => setCompletingTaskId(null)}
        projectId={projectId}
        taskId={completingTaskId}
        task={tasks.find(t => t.id === completingTaskId) || null}
        user={user}
      />

      <IncrementTaskValueModal
        isOpen={!!selectedTaskForIncrement}
        onClose={() => setSelectedTaskForIncrement(null)}
        task={selectedTaskForIncrement}
        onSubmit={handleIncrementTaskValue}
      />

      {dynamicRateCardStatusChange && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 p-6">
              <div>
                <h3 className="text-lg font-bold text-slate-900">
                  {pendingManualStaticRateCard ? 'Registrar unidades de Rate Card' : 'Asignar Rate Card'}
                </h3>
                <p className="mt-1 text-sm text-slate-500">
                  {dynamicRateCardStatusChange.task.title || dynamicRateCardStatusChange.task.name || 'Tarea'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setDynamicRateCardStatusChange(null);
                  resetDynamicRateCardFields();
                }}
                className="rounded-full p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
              >
                <X size={20} />
              </button>
            </div>

            <div className="space-y-4 bg-slate-50 p-6">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">
                    Persona que aporta <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={dynamicRateCardAssignee}
                    onChange={(e) => setDynamicRateCardAssignee(e.target.value)}
                    disabled={lockPendingRateCardAssignee}
                    className="w-full rounded-lg border border-slate-200 bg-white p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 disabled:bg-slate-100 disabled:text-slate-500"
                  >
                    <option value="">Seleccionar...</option>
                    {projectAssignableTeamMembers.map((member) => (
                      <option key={member.id} value={member.id}>{member.name || member.email}</option>
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
                    disabled={lockPendingRateCardProfile}
                    className="w-full rounded-lg border border-slate-200 bg-white p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 disabled:bg-slate-100 disabled:text-slate-500"
                  >
                    <option value="">Seleccionar...</option>
                    {rateCards.map((rateCard) => (
                      <option key={rateCard.id} value={rateCard.id}>{rateCard.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              {pendingRateCardRequestsUnits ? (
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
                  Auto suma: se cargarán <strong>{getDynamicRateCardUnits(dynamicRateCardStatusChange.task)}</strong> unidades configuradas.
                </div>
              )}

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Comentario</label>
                <textarea
                  value={dynamicRateCardComment}
                  onChange={(e) => setDynamicRateCardComment(e.target.value)}
                  className="h-20 w-full resize-none rounded-lg border border-slate-200 bg-white p-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                  placeholder="Detalle opcional del aporte..."
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 border-t border-slate-100 p-6">
              <Button
                variant="outline"
                onClick={() => {
                  setDynamicRateCardStatusChange(null);
                  resetDynamicRateCardFields();
                }}
              >
                Cancelar
              </Button>
              <Button
                onClick={confirmDynamicRateCardStatusChange}
                disabled={!dynamicRateCardAssignee || !dynamicRateCardId || (pendingRateCardRequestsUnits && (dynamicRateCardUnits === '' || Number(dynamicRateCardUnits) <= 0))}
                className="bg-emerald-600 text-white hover:bg-emerald-700"
              >
                Guardar y finalizar
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Create Task Modal */}
      {canCreateTasks && (
        <CreateTaskModal
          isOpen={isCreateTaskModalOpen}
          onClose={() => setIsCreateTaskModalOpen(false)}
          projectId={projectId}
          project={project}
          user={user}
          teamMembers={projectAssignableTeamMembers}
          rateCards={rateCards}
          taskGroups={taskGroups}
          tasksLength={tasks.length}
          canManageWorkflowTemplates={canManageWorkflowTemplates}
          userRole={userRole}
          templateScopeOrganizationIds={managedOrganizationIds}
        />
      )}
      {canCreateTasks && canAddSubtasks && (
        <BulkWorkflowIterationsModal
          isOpen={!!taskForBulkIterations}
          onClose={() => setTaskForBulkIterations(null)}
          projectId={projectId}
          task={taskForBulkIterations}
          user={user}
          teamMembers={projectAssignableTeamMembers}
          tasks={tasks}
        />
      )}
      <EditTaskStructureModal
        isOpen={!!taskForStructureEdit}
        onClose={() => setTaskForStructureEdit(null)}
        projectId={projectId}
        task={taskForStructureEdit}
        user={user}
        teamMembers={projectAssignableTeamMembers}
        rateCards={rateCards}
        project={project}
        subtasks={taskForStructureEdit ? tasks.filter((task) => task.parentTaskId === taskForStructureEdit.id) : []}
        canEditTaskStructure={canEditTaskStructure}
        canManageWorkflowTemplates={canManageWorkflowTemplates}
        userRole={userRole}
        templateScopeOrganizationIds={managedOrganizationIds}
        onCreateSubtask={canAddSubtasks ? handleCreateSubtask : undefined}
        onSave={async (updates) => {
          if (!taskForStructureEdit) return;
          await handleUpdateTaskStructure(taskForStructureEdit, updates);
        }}
      />
      <UploadDocumentModal
        isOpen={isUploadModalOpen}
        onClose={() => setIsUploadModalOpen(false)}
        projectId={projectId}
        user={user}
      />

    </DashboardLayout>
  );
}
