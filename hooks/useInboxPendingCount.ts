"use client"

import { useEffect, useMemo, useState } from 'react';
import { collection, collectionGroup, getDocs, onSnapshot, query, where } from '@/lib/supabase/document-store';
import { db } from '@/lib/backend';
import { useAuth } from '@/hooks/useAuth';
import { canLoadProjectForUser } from '@/lib/project-access';
import { isWorkflowTaskType } from '@/lib/workflow-routing';

const terminalStatuses = new Set(['completed', 'completed_late', 'listo']);

const isAssignedToCurrentUser = (task: any, assignedIds: string[]) => {
  if (task?.assignedTo && assignedIds.includes(task.assignedTo)) return true;
  if (Array.isArray(task?.assignedUsers) && task.assignedUsers.some((id: string) => assignedIds.includes(id))) return true;
  if (Array.isArray(task?.assignedTeamMembers) && task.assignedTeamMembers.some((id: string) => assignedIds.includes(id))) return true;
  return false;
};

const isWorkflowPendingForUser = (task: any, assignedIds: string[]) => {
  if (!isWorkflowTaskType(task?.type) || !Array.isArray(task?.workflowSteps)) return false;
  const currentStep = task.workflowSteps[task.currentStepIndex || 0];
  return Boolean(
    currentStep?.assignedTo &&
    assignedIds.includes(currentStep.assignedTo) &&
    ['en_curso', 'reproceso', 'pending', 'detenido'].includes(currentStep.status)
  );
};

const isTaskPendingForUser = (task: any, assignedIds: string[]) => {
  const status = task?.status || 'todo';
  if (terminalStatuses.has(status)) return false;
  if (isWorkflowTaskType(task?.type) && Array.isArray(task?.workflowSteps)) {
    return isWorkflowPendingForUser(task, assignedIds);
  }
  return isAssignedToCurrentUser(task, assignedIds);
};

export function useInboxPendingCount(enabled = true) {
  const { user, userRole, userOrganizationId, userOrganizationIds } = useAuth();
  const [count, setCount] = useState(0);
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const managedOrganizationIds = useMemo(
    () => (userOrganizationIds.length > 0 ? userOrganizationIds : userOrganizationId ? [userOrganizationId] : []),
    [userOrganizationId, userOrganizationIds]
  );

  useEffect(() => {
    let cancelled = false;

    const loadMemberIds = async () => {
      if (!enabled || !user?.email) {
        setMemberIds([]);
        return;
      }

      const nextIds = [user.uid].filter(Boolean);
      const teamQuery = query(collection(db, 'team_members'), where('email', '==', user.email));
      const teamSnapshot = await getDocs(teamQuery);
      teamSnapshot.docs.forEach((teamDoc) => nextIds.push(teamDoc.id));

      if (!cancelled) {
        setMemberIds(Array.from(new Set(nextIds)));
      }
    };

    loadMemberIds().catch((error) => {
      console.error('Error loading inbox member ids:', error);
      if (!cancelled) setMemberIds(user?.uid ? [user.uid] : []);
    });

    return () => {
      cancelled = true;
    };
  }, [enabled, user?.email, user?.uid]);

  useEffect(() => {
    if (!enabled || !user || memberIds.length === 0) {
      return;
    }

    let accessibleProjectIds = new Set<string>();
    let allTasks: Array<{ projectId: string; task: any }> = [];

    const updateCount = () => {
      const nextCount = allTasks
        .filter(({ projectId }) => accessibleProjectIds.has(projectId))
        .filter(({ task }) => isTaskPendingForUser(task, memberIds))
        .length;
      setCount(nextCount);
    };

    const unsubscribeProjects = onSnapshot(
      query(collection(db, 'projects')),
      (projectSnapshot) => {
        accessibleProjectIds = new Set(projectSnapshot.docs
          .map((projectDoc) => ({ id: projectDoc.id, ...projectDoc.data() }))
          .filter((project) => {
            return canLoadProjectForUser(project, {
              assignedIds: memberIds,
              managedOrganizationIds,
              userId: user.uid,
              userRole,
            });
          })
          .map(project => project.id));
        updateCount();
      },
      (error) => {
        console.error('Error loading inbox projects:', error);
        setCount(0);
      }
    );

    const unsubscribeTasks = onSnapshot(
      query(collectionGroup(db, 'tasks')),
      (taskSnapshot) => {
        allTasks = taskSnapshot.docs.map((taskDoc) => ({
          projectId: taskDoc.ref.parent.parent?.id || '',
          task: taskDoc.data(),
        }));
        updateCount();
      },
      (error) => {
        console.error('Error loading inbox tasks:', error);
        setCount(0);
      },
    );

    return () => {
      unsubscribeProjects();
      unsubscribeTasks();
    };
  }, [enabled, managedOrganizationIds, memberIds, user, userRole]);

  return enabled && user && memberIds.length > 0 ? count : 0;
}
