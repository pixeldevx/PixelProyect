import { supabase } from '@/lib/backend';

export type TaskAssignmentNotificationPayload = {
  projectId: string;
  taskId: string;
  assigneeId?: string | null;
  stepIndex?: number | null;
  eventType?: 'task_assigned' | 'workflow_step_assigned';
  source?: string;
};

export type TaskAssignmentNotificationResult = {
  ok?: boolean;
  skipped?: boolean;
  reason?: string;
  error?: string;
  status?: number;
  email?: any;
  push?: any;
};

export const notifyTaskAssignment = async (payload: TaskAssignmentNotificationPayload) => {
  if (!payload.projectId || !payload.taskId || !payload.assigneeId || payload.assigneeId === 'DYNAMIC') {
    return { skipped: true, reason: 'missing_required_data' } satisfies TaskAssignmentNotificationResult;
  }

  try {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;

    if (!token) {
      return { skipped: true, reason: 'missing_session' } satisfies TaskAssignmentNotificationResult;
    }

    const response = await fetch('/api/notifications/task-assigned', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    const body = await response.json().catch(() => null);

    if (!response.ok) {
      console.warn('Task assignment notification skipped:', body?.error || response.statusText);
      return {
        ...(body || {}),
        ok: false,
        status: response.status,
        error: body?.error || response.statusText,
      } satisfies TaskAssignmentNotificationResult;
    }

    return {
      ...(body || {}),
      ok: true,
      status: response.status,
    } satisfies TaskAssignmentNotificationResult;
  } catch (error) {
    console.warn('Task assignment notification failed:', error);
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'notification_failed',
    } satisfies TaskAssignmentNotificationResult;
  }
};
