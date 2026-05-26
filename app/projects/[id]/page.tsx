"use client"

import React, { useState, useEffect } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ArrowLeft, Upload, File, FileText, Download, Trash2, Clock, AlertCircle, Folder, Users, Plus, X, ListTodo, Calendar, CreditCard, RefreshCw, Loader2, Search, ClipboardList, DollarSign, Link2 } from 'lucide-react';
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
import { ProjectTasksTable } from '@/components/projects/ProjectTasksTable';
import { ProjectDocumentsTree } from '@/components/projects/ProjectDocumentsTree';
import { ProjectDriveRepositories } from '@/components/projects/ProjectDriveRepositories';
import { TaskDetailsModal } from '@/components/projects/TaskDetailsModal';
import { StartWorkflowModal } from '@/components/projects/StartWorkflowModal';
import { CreateTaskModal } from '@/components/projects/modals/CreateTaskModal';
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
import { belongsToAnyOrganization } from '@/lib/organizations';

const getTaskTitle = (task: any) => task?.title || task?.name || 'Tarea';

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

  const [activeTab, setActiveTab] = useState<'documents' | 'drive' | 'tasks' | 'tasksList' | 'rateCards' | 'budget' | 'billing' | 'orgChart'>('documents');

  useEffect(() => {
    const tabParam = searchParams.get('tab');
    if (tabParam && ['documents', 'drive', 'tasks', 'tasksList', 'rateCards', 'budget', 'billing', 'orgChart'].includes(tabParam)) {
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
  const managedOrganizationIds = userOrganizationIds.length > 0 ? userOrganizationIds : userOrganizationId ? [userOrganizationId] : [];


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
  const canAddSubtasks = rolePermissions.taskAddSubtasks;
  const canDeleteTasks = rolePermissions.taskDelete;
  const canEditTaskStructure =
    rolePermissions.taskEditStructure &&
    (userRole !== 'org_admin' || !project?.organizationId || belongsToAnyOrganization(project, managedOrganizationIds));
  const canManageDriveRepositories =
    userRole === 'admin' ||
    (userRole === 'org_admin' && (!project?.organizationId || belongsToAnyOrganization(project, managedOrganizationIds)));

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
    try {
      if (newProgress === 100 && task.requiresDocument && !task.linkedDocumentId) {
        setCompletingTaskId(taskId);
        return;
      }

      let status = 'in_progress';
      if (newProgress === 0) status = 'todo';
      if (newProgress === 100) status = 'completed';

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
          const wasCompleted = task.status === 'completed';
          const isCompleted = status === 'completed';

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

                if (stepWasApproved !== stepIsApproved && step.rateCardId) {
                  const stepRcRef = doc(db, 'projects', projectId, 'rateCards', step.rateCardId);
                  const stepUnits = step.unitsToAdd || 1;
                  const stepUpdateData: any = {
                    currentValue: increment(stepIsApproved ? stepUnits : -stepUnits)
                  };
                  if (step.assignedTo) {
                    stepUpdateData[`userStats.${step.assignedTo}`] = increment(stepIsApproved ? stepUnits : -stepUnits);
                  }
                  batch.update(stepRcRef, stepUpdateData);
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

  const handleUpdateTaskStatus = async (taskId: string, newStatus: string, task: any) => {
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

      if (newStatus === 'completed' && task.requiresDocument && !task.linkedDocumentId) {
        setCompletingTaskId(taskId);
        return;
      }

      // If it's a workflow and moving to in-progress, show the start modal
      if (task.type === 'workflow' && newStatus === 'in_progress' && task.status === 'todo') {
        setSelectedTaskForStartWorkflow(task);
        setIsStartWorkflowModalOpen(true);
        return;
      }

      let progress = 0;
      if (newStatus === 'completed') progress = 100;
      else if (newStatus === 'in_progress') progress = Math.max(task.progress || 0, 10);
      else if (newStatus === 'stuck') progress = task.progress || 0;

      const batch = writeBatch(db);
      const taskRef = doc(db, 'projects', projectId, 'tasks', taskId);

      // Handle Rate Card update
      if (task.isRateCardTask && task.rateCardId && task.unitsToAdd) {
        if (task.type !== 'workflow') {
          // Proportional for non-workflow
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
        } else {
          // For workflow, only if completing the whole task
          const wasCompleted = task.status === 'completed';
          const isCompleted = newStatus === 'completed';

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

                if (stepWasApproved !== stepIsApproved && step.rateCardId) {
                  const stepRcRef = doc(db, 'projects', projectId, 'rateCards', step.rateCardId);
                  const stepUnits = step.unitsToAdd || 1;
                  const stepUpdateData: any = {
                    currentValue: increment(stepIsApproved ? stepUnits : -stepUnits)
                  };
                  if (step.assignedTo) {
                    stepUpdateData[`userStats.${step.assignedTo}`] = increment(stepIsApproved ? stepUnits : -stepUnits);
                  }
                  batch.update(stepRcRef, stepUpdateData);
                }
                return { ...step, status: stepIsApproved ? 'listo' : 'not_started' };
              });

              batch.update(taskRef, { workflowSteps: updatedSteps });
            }
          }
        }
      }

      batch.update(taskRef, {
        status: newStatus,
        progress: progress,
        priority: task.priority || 'medium',
        updatedAt: serverTimestamp()
      });

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
          } else if (t.status === 'completed') {
            const units = t.unitsToAdd || 1;
            const updateData: any = { currentValue: increment(-units) };
            if (t.assignedTo) updateData[`userStats.${t.assignedTo}`] = increment(-units);
            batch.update(rcRef, updateData);
          }
        }

        // Revert step-level rate cards
        if (t.type === 'workflow' && t.workflowSteps) {
          t.workflowSteps.forEach((step: any) => {
            if (step.completed && step.rateCardId) {
              const rcRef = doc(db, 'projects', projectId, 'rateCards', step.rateCardId);
              const units = step.unitsToAdd || 1;
              const updateData: any = { currentValue: increment(-units) };
              if (step.assignedTo) updateData[`userStats.${step.assignedTo}`] = increment(-units);
              batch.update(rcRef, updateData);
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
        snapshot.docs.forEach(d => {
          const subtask = { id: d.id, ...d.data() };
          revertRateCard(subtask);
          batch.delete(d.ref);
        });
        revertRateCard(task);
        batch.delete(doc(db, 'projects', projectId, 'tasks', task.id));
      } else if (task) {
        revertRateCard(task);
        batch.delete(doc(db, 'projects', projectId, 'tasks', task.id));
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
    if (!canEditTaskDetails) {
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

    try {
      const taskRef = doc(db, 'projects', projectId, 'tasks', taskId);
      await updateDoc(taskRef, { assignedTo, updatedAt: serverTimestamp() });
      toast.success('Asignado actualizado');
    } catch (error) {
      console.error('Error updating task assignee:', error);
      toast.error('Error al actualizar el asignado');
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
    const progress = subtask.status === 'completed' ? 100 : subtask.status === 'in_progress' ? 10 : 0;

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
    updates: { title: string; workflowSteps?: any[] }
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

  // Calculate Gantt chart bounds
  const getGanttBounds = () => {
    if (tasks.length === 0) {
      const now = new Date().getTime();
      return { min: now, max: now, totalDays: 1 };
    }

    let minT = Infinity;
    let maxT = -Infinity;

    tasks.forEach(t => {
      if (t.startDate) {
        const start = t.startDate.toDate().getTime();
        if (start < minT) minT = start;
      }
      if (t.endDate) {
        const end = t.endDate.toDate().getTime();
        if (end > maxT) maxT = end;
      }
    });

    if (minT === Infinity || maxT === -Infinity) {
      const now = new Date().getTime();
      return { min: now, max: now, totalDays: 1 };
    }

    // Add some padding (3 days before and after)
    const padding = 3 * 24 * 60 * 60 * 1000;
    minT -= padding;
    maxT += padding;

    const totalDays = Math.max(1, (maxT - minT) / (1000 * 60 * 60 * 24));

    return { min: minT, max: maxT, totalDays };
  };

  const ganttBounds = getGanttBounds();

  return (
    <DashboardLayout>
      <div className="mb-6">
        <Link href="/projects" className="inline-flex items-center text-sm text-slate-500 hover:text-indigo-600 mb-4 transition-colors">
          <ArrowLeft size={16} className="mr-1" /> Volver a Proyectos
        </Link>
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">{project.name}</h1>
            <p className="text-slate-500 mt-1 max-w-3xl">{project.description || 'Sin descripción'}</p>
          </div>
          <span className={`px-3 py-1 rounded-full text-xs font-medium ${
            project.status === 'active' ? 'bg-amber-100 text-amber-800' :
            project.status === 'completed' ? 'bg-emerald-100 text-emerald-800' :
            'bg-slate-100 text-slate-800'
          }`}>
            {project.status === 'active' ? 'Activo' : project.status === 'completed' ? 'Completado' : 'En Pausa'}
          </span>
        </div>
      </div>

      {(!hasContract || !hasProposal) && (
        <div className="mb-8 bg-amber-50 border border-amber-200 rounded-lg p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
          <div>
            <h3 className="text-sm font-medium text-amber-800">Documentación Incompleta</h3>
            <p className="text-sm text-amber-700 mt-1">
              Para que el proyecto esté en regla, debes subir los siguientes documentos obligatorios:
              {!hasContract && <strong className="block mt-1">• Contrato firmado</strong>}
              {!hasProposal && <strong className="block mt-1">• Propuesta técnica/comercial</strong>}
            </p>
          </div>
        </div>
      )}


      <div className="mb-6 border-b border-slate-200">
        <div className="flex gap-6">
          <button
            onClick={() => setActiveTab('documents')}
            className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'documents'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
            }`}
          >
            <div className="flex items-center gap-2">
              <FileText size={16} />
              Documentos
            </div>
          </button>
          <button
            onClick={() => setActiveTab('drive')}
            className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'drive'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
            }`}
          >
            <div className="flex items-center gap-2">
              <Link2 size={16} />
              Drive
            </div>
          </button>
          <button
            onClick={() => setActiveTab('tasks')}
            className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'tasks'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
            }`}
          >
            <div className="flex items-center gap-2">
              <Calendar size={16} />
              Tareas (Gantt)
            </div>
          </button>
          <button
            onClick={() => setActiveTab('tasksList')}
            className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'tasksList'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
            }`}
          >
            <div className="flex items-center gap-2">
              <ListTodo size={16} />
              Tareas (Lista)
            </div>
          </button>
          <button
            onClick={() => setActiveTab('rateCards')}
            className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'rateCards'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
            }`}
          >
            <div className="flex items-center gap-2">
              <CreditCard size={16} />
              Rate Cards
            </div>
          </button>
          <button
            onClick={() => setActiveTab('budget')}
            className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'budget'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
            }`}
          >
            <div className="flex items-center gap-2">
              <DollarSign size={16} />
              Presupuesto
            </div>
          </button>
          <button
            onClick={() => setActiveTab('billing')}
            className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'billing'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
            }`}
          >
            <div className="flex items-center gap-2">
              <FileText size={16} />
              Facturación
            </div>
          </button>
          <button
            onClick={() => setActiveTab('orgChart')}
            className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'orgChart'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
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

      {activeTab === 'tasks' && (
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                <Calendar size={20} className="text-indigo-500" />
                Cronograma de Tareas
              </h2>
              <p className="text-sm text-slate-500 mt-1">Seguimiento y progreso de las tareas del proyecto.</p>
            </div>
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

          {/* Tasks List / Gantt */}
          <Card className="border-slate-200 shadow-sm">
            <CardContent className="p-0">
              <ProjectGantt
                tasks={tasks}
                teamMembers={teamMembers}
                onUpdateTaskProgress={canEditTaskDetails ? handleUpdateTaskProgress : undefined}
                onUpdateTaskValue={canEditTaskDetails ? handleUpdateTaskValue : undefined}
                onUpdateTaskStatus={canEditTaskStatus ? handleUpdateTaskStatus : undefined}
                onUpdateTaskPriority={canEditTaskDetails ? handleUpdateTaskPriority : undefined}
                onDeleteTask={canDeleteTasks ? handleDeleteTask : undefined}
                onSyncTask={canEditTaskDetails ? handleSyncTaskValue : undefined}
                onReorderTasks={canEditTaskDetails ? handleReorderTasks : undefined}
                onUpdateTaskDates={canEditTaskDetails ? handleUpdateTaskDates : undefined}
                onUpdateTaskTitle={canEditTaskDetails ? handleUpdateTaskTitle : undefined}
                onOpenIncrementTask={canEditTaskDetails ? setSelectedTaskForIncrement : undefined}
                canEditTaskDetails={canEditTaskDetails}
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
                onCreateTask={canCreateTasks ? () => setIsCreateTaskModalOpen(true) : undefined}
              />
            </CardContent>
          </Card>
        </div>
      )}

      {activeTab === 'tasksList' && (
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                <ListTodo size={20} className="text-indigo-500" />
                Lista de Tareas
              </h2>
              <p className="text-sm text-slate-500 mt-1">Gestión detallada de tareas del proyecto.</p>
            </div>
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

          <Card className="border-slate-200 shadow-sm">
            <CardContent className="p-0">
              <ProjectTasksTable
                tasks={tasks}
                teamMembers={teamMembers}
                onUpdateTaskProgress={canEditTaskDetails ? handleUpdateTaskProgress : undefined}
                onUpdateTaskStatus={canEditTaskStatus ? handleUpdateTaskStatus : undefined}
                onUpdateTaskPriority={canEditTaskDetails ? handleUpdateTaskPriority : undefined}
                onUpdateTaskAssignee={canEditTaskDetails ? handleUpdateTaskAssignee : undefined}
                onDeleteTask={canDeleteTasks ? handleDeleteTask : undefined}
                canEditTaskDetails={canEditTaskDetails}
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
      />

      {/* Start Workflow Modal */}
      <StartWorkflowModal
        isOpen={isStartWorkflowModalOpen}
        onClose={() => {
          setIsStartWorkflowModalOpen(false);
          setSelectedTaskForStartWorkflow(null);
        }}
        task={selectedTaskForStartWorkflow}
        projectId={projectId}
        userId={user?.uid || ''}
        teamMembers={teamMembers}
      />

      {activeTab === 'rateCards' && (
        <div className="mt-6">
          <ProjectRateCards projectId={projectId} currentUser={user} tasks={tasks} teamMembers={teamMembers} budgetLines={budgetLines} />
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
        teamMembers={teamMembers}
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

      {/* Create Task Modal */}
      {canCreateTasks && (
        <CreateTaskModal
          isOpen={isCreateTaskModalOpen}
          onClose={() => setIsCreateTaskModalOpen(false)}
          projectId={projectId}
          project={project}
          user={user}
          teamMembers={teamMembers}
          rateCards={rateCards}
          tasksLength={tasks.length}
        />
      )}
      <EditTaskStructureModal
        isOpen={!!taskForStructureEdit}
        onClose={() => setTaskForStructureEdit(null)}
        task={taskForStructureEdit}
        user={user}
        teamMembers={teamMembers}
        subtasks={taskForStructureEdit ? tasks.filter((task) => task.parentTaskId === taskForStructureEdit.id) : []}
        canEditTaskStructure={canEditTaskStructure}
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
