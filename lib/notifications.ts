import { supabase } from '@/lib/backend';

export type TaskAssignmentNotificationPayload = {
  projectId: string;
  taskId: string;
  assigneeId?: string | null;
  stepIndex?: number | null;
  eventType?: 'task_assigned' | 'workflow_step_assigned';
  source?: string;
};

export const notifyTaskAssignment = async (payload: TaskAssignmentNotificationPayload) => {
  if (!payload.projectId || !payload.taskId || !payload.assigneeId || payload.assigneeId === 'DYNAMIC') {
    return;
  }

  try {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;

    if (!token) return;

    const response = await fetch('/api/notifications/task-assigned', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const body = await response.json().catch(() => null);
      console.warn('Task assignment notification skipped:', body?.error || response.statusText);
    }
  } catch (error) {
    console.warn('Task assignment notification failed:', error);
  }
};
