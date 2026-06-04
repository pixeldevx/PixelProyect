"use client"

import { useEffect, useMemo, useState } from 'react';
import { collection, getDocs, onSnapshot, query, where } from '@/lib/supabase/document-store';
import { db } from '@/lib/backend';
import { useAuth } from '@/hooks/useAuth';
import { canLoadProjectForUser } from '@/lib/project-access';

const terminalStatuses = new Set(['completed', 'completed_late', 'listo']);

const isAssignedToCurrentUser = (task: any, assignedIds: string[]) => {
  if (task?.assignedTo && assignedIds.includes(task.assignedTo)) return true;
  if (Array.isArray(task?.assignedUsers) && task.assignedUsers.some((id: string) => assignedIds.includes(id))) return true;
  if (Array.isArray(task?.assignedTeamMembers) && task.assignedTeamMembers.some((id: string) => assignedIds.includes(id))) return true;
  return false;
};

const isWorkflowPendingForUser = (task: any, assignedIds: string[]) => {
  if (task?.type !== 'workflow' || !Array.isArray(task?.workflowSteps)) return false;
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
  if (task?.type === 'workflow' && Array.isArray(task?.workflowSteps)) {
    return isWorkflowPendingForUser(task, assignedIds);
  }
  return isAssignedToCurrentUser(task, assignedIds);
};

export function useInboxPendingCount() {
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
      if (!user?.email) {
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
  }, [user?.email, user?.uid]);

  useEffect(() => {
    if (!user || memberIds.length === 0) {
      return;
    }

    let taskUnsubscribes: Array<() => void> = [];
    const projectCounts = new Map<string, number>();

    const unsubscribeProjects = onSnapshot(
      query(collection(db, 'projects')),
      (projectSnapshot) => {
        taskUnsubscribes.forEach((unsubscribe) => unsubscribe());
        taskUnsubscribes = [];
        projectCounts.clear();

        const projects = projectSnapshot.docs
          .map((projectDoc) => ({ id: projectDoc.id, ...projectDoc.data() }))
          .filter((project) => {
            return canLoadProjectForUser(project, {
              assignedIds: memberIds,
              managedOrganizationIds,
              userId: user.uid,
              userRole,
            });
          });

        if (projects.length === 0) {
          setCount(0);
          return;
        }

        projects.forEach((project: any) => {
          const unsubscribeTasks = onSnapshot(
            query(collection(db, 'projects', project.id, 'tasks')),
            (taskSnapshot) => {
              const projectCount = taskSnapshot.docs
                .map((taskDoc) => taskDoc.data())
                .filter((task) => isTaskPendingForUser(task, memberIds))
                .length;

              projectCounts.set(project.id, projectCount);
              setCount(Array.from(projectCounts.values()).reduce((sum, value) => sum + value, 0));
            },
            (error) => {
              console.error(`Error loading inbox tasks for ${project.id}:`, error);
            }
          );

          taskUnsubscribes.push(unsubscribeTasks);
        });
      },
      (error) => {
        console.error('Error loading inbox projects:', error);
        setCount(0);
      }
    );

    return () => {
      unsubscribeProjects();
      taskUnsubscribes.forEach((unsubscribe) => unsubscribe());
    };
  }, [managedOrganizationIds, memberIds, user, userRole]);

  return user && memberIds.length > 0 ? count : 0;
}
