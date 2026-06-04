import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  buildTaskAssignmentEmailHtml,
  buildTaskAssignmentSubject,
  buildTaskAssignmentText,
  DEFAULT_TASK_ASSIGNMENT_EMAIL_INTRO,
  DEFAULT_TASK_ASSIGNMENT_EMAIL_SUBJECT,
} from '@/lib/email/task-assignment-template';
import { sendEmailWithResend } from '@/lib/email/resend';

export const runtime = 'nodejs';

const DOCUMENTS_TABLE = 'app_documents';

type AppDocumentRow = {
  collection_path: string;
  doc_id: string;
  data: Record<string, any>;
};

const json = (body: Record<string, any>, status = 200) =>
  NextResponse.json(body, { status });

const normalizeEmail = (value: unknown) =>
  typeof value === 'string' ? value.trim().toLowerCase() : '';

const getBearerToken = (request: NextRequest) => {
  const header = request.headers.get('authorization') || '';
  const [scheme, token] = header.split(' ');
  return scheme?.toLowerCase() === 'bearer' ? token : '';
};

const getAdminClient = () => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Falta configurar SUPABASE_SERVICE_ROLE_KEY en el entorno de Vercel.');
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
};

const appUrlFromRequest = (request: NextRequest) => {
  const configuredUrl =
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.SITE_URL ||
    process.env.VERCEL_PROJECT_PRODUCTION_URL ||
    '';

  if (configuredUrl) {
    return configuredUrl.startsWith('http')
      ? configuredUrl.replace(/\/$/, '')
      : `https://${configuredUrl.replace(/\/$/, '')}`;
  }

  return new URL(request.url).origin.replace(/\/$/, '');
};

const getDocument = async (supabase: any, collectionPath: string, docId: string) => {
  if (!docId) return null;
  const { data, error } = await supabase
    .from(DOCUMENTS_TABLE)
    .select('collection_path, doc_id, data')
    .eq('collection_path', collectionPath)
    .eq('doc_id', docId)
    .maybeSingle();

  if (error) throw error;
  return (data || null) as AppDocumentRow | null;
};

const findDocumentByEmail = async (supabase: any, collectionPath: string, email: string) => {
  if (!email) return null;
  const { data, error } = await supabase
    .from(DOCUMENTS_TABLE)
    .select('collection_path, doc_id, data')
    .eq('collection_path', collectionPath)
    .eq('data->>email', email)
    .limit(1);

  if (error) throw error;
  return ((data || [])[0] || null) as AppDocumentRow | null;
};

const upsertDocument = async (supabase: any, collectionPath: string, docId: string, data: Record<string, any>) => {
  const { error } = await supabase.from(DOCUMENTS_TABLE).upsert(
    {
      collection_path: collectionPath,
      doc_id: docId,
      data,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'collection_path,doc_id' }
  );

  if (error) throw error;
};

const priorityLabel = (priority: string) => {
  if (priority === 'high') return 'Alta';
  if (priority === 'low') return 'Baja';
  return 'Media';
};

const statusLabel = (status: string) => {
  switch (status) {
    case 'in_progress':
    case 'en_curso':
      return 'En curso';
    case 'reproceso':
      return 'Reproceso';
    case 'detenido':
      return 'Detenido';
    case 'pending':
    case 'todo':
      return 'Pendiente';
    case 'stuck':
      return 'Estancada';
    default:
      return status || 'Pendiente';
  }
};

const dateLabel = (value: unknown) => {
  if (!value) return 'Sin fecha límite';
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return 'Sin fecha límite';
  return new Intl.DateTimeFormat('es-CO', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date);
};

const shouldSendEmail = (preferences: any, projectId: string, organizationId: string) => {
  if (preferences?.taskAssignmentEmailEnabled === false) return false;
  if (Array.isArray(preferences?.disabledProjectIds) && preferences.disabledProjectIds.includes(projectId)) return false;
  if (organizationId && Array.isArray(preferences?.disabledOrganizationIds) && preferences.disabledOrganizationIds.includes(organizationId)) return false;
  return true;
};

const resolveAssignee = async (supabase: any, assigneeId: string) => {
  const teamMember = await getDocument(supabase, 'team_members', assigneeId);
  const teamData = teamMember?.data || {};
  const teamEmail = normalizeEmail(teamData.email);
  const authUserId = typeof teamData.authUserId === 'string' ? teamData.authUserId : '';

  const userById = authUserId
    ? await getDocument(supabase, 'users', authUserId)
    : await getDocument(supabase, 'users', assigneeId);
  const userByEmail = teamEmail ? await findDocumentByEmail(supabase, 'users', teamEmail) : null;
  const profile = userById || userByEmail;
  const profileData = profile?.data || {};
  const email = normalizeEmail(teamEmail || profileData.email);
  const displayName =
    teamData.name ||
    teamData.displayName ||
    profileData.displayName ||
    profileData.name ||
    email.split('@')[0] ||
    'Usuario';

  return {
    email,
    displayName,
    authUserId: profile?.doc_id || authUserId || assigneeId,
    teamMemberId: teamMember?.doc_id || assigneeId,
  };
};

export async function POST(request: NextRequest) {
  try {
    const supabase = getAdminClient();
    const token = getBearerToken(request);
    const { data: requesterData, error: requesterError } = await supabase.auth.getUser(token);

    if (requesterError || !requesterData.user) {
      return json({ error: 'Sesión inválida.' }, 401);
    }

    const payload = await request.json();
    const projectId = typeof payload.projectId === 'string' ? payload.projectId.trim() : '';
    const taskId = typeof payload.taskId === 'string' ? payload.taskId.trim() : '';
    const assigneeId = typeof payload.assigneeId === 'string' ? payload.assigneeId.trim() : '';
    const stepIndex = Number.isFinite(Number(payload.stepIndex)) ? Number(payload.stepIndex) : null;
    const eventType = payload.eventType === 'workflow_step_assigned' ? 'workflow_step_assigned' : 'task_assigned';

    if (!projectId || !taskId || !assigneeId || assigneeId === 'DYNAMIC') {
      return json({ skipped: true, reason: 'missing_required_data' });
    }

    const [projectRow, taskRow] = await Promise.all([
      getDocument(supabase, 'projects', projectId),
      getDocument(supabase, `projects/${projectId}/tasks`, taskId),
    ]);

    if (!taskRow) {
      return json({ error: 'Tarea no encontrada.' }, 404);
    }

    const task = taskRow.data || {};
    const project = projectRow?.data || {};
    const currentStep = eventType === 'workflow_step_assigned' && stepIndex !== null
      ? task.workflowSteps?.[stepIndex] || null
      : null;

    const resolvedAssignee = await resolveAssignee(supabase, assigneeId);
    if (!resolvedAssignee.email) {
      return json({ skipped: true, reason: 'assignee_without_email' });
    }

    const eventKey = [
      eventType,
      projectId,
      taskId,
      stepIndex ?? 'task',
      resolvedAssignee.email,
    ].join(':');

    const existingEvent = await getDocument(supabase, 'notification_events', eventKey);
    if (existingEvent) {
      return json({ skipped: true, reason: 'duplicate_event' });
    }

    const organizationId =
      task.organizationId ||
      project.organizationId ||
      (Array.isArray(project.organizationIds) ? project.organizationIds[0] : '') ||
      '';
    const organizationRow = organizationId ? await getDocument(supabase, 'organizations', organizationId) : null;
    const organizationName =
      task.organizationName ||
      project.organizationName ||
      organizationRow?.data?.name ||
      organizationRow?.data?.displayName ||
      'Sin organización';

    const preferenceById = await getDocument(supabase, 'alert_preferences', resolvedAssignee.authUserId);
    const preferenceByEmail = await findDocumentByEmail(supabase, 'alert_preferences', resolvedAssignee.email);
    const preferences = preferenceById?.data || preferenceByEmail?.data || {};
    const emailEnabled = shouldSendEmail(preferences, projectId, organizationId);

    const appUrl = appUrlFromRequest(request);
    const actionUrl = `${appUrl}/workflows`;
    const taskTitle = `${task.externalWorkflowId ? `[${task.externalWorkflowId}] ` : ''}${task.title || task.name || 'Tarea sin nombre'}`;
    const status = currentStep?.status || task.status || 'pending';
    const taskTypeLabel = eventType === 'workflow_step_assigned'
      ? `Workflow · Paso ${stepIndex !== null ? stepIndex + 1 : ''}`
      : 'Tarea asignada';
    const description =
      task.initialObservation ||
      task.description ||
      currentStep?.label ||
      'Tienes una nueva actividad pendiente en tu bandeja.';
    const emailSubjectTemplate =
      typeof preferences.taskAssignmentEmailSubject === 'string' && preferences.taskAssignmentEmailSubject.trim()
        ? preferences.taskAssignmentEmailSubject.trim()
        : DEFAULT_TASK_ASSIGNMENT_EMAIL_SUBJECT;
    const emailIntroTemplate =
      typeof preferences.taskAssignmentEmailIntro === 'string' && preferences.taskAssignmentEmailIntro.trim()
        ? preferences.taskAssignmentEmailIntro.trim()
        : DEFAULT_TASK_ASSIGNMENT_EMAIL_INTRO;

    const emailData = {
      appUrl,
      assigneeName: resolvedAssignee.displayName,
      taskTitle,
      projectName: project.name || project.title || task.projectName || 'Proyecto',
      organizationName,
      priorityLabel: priorityLabel(task.priority || 'medium'),
      statusLabel: statusLabel(status),
      dueDateLabel: dateLabel(task.endDate || task.end),
      taskTypeLabel,
      description,
      actionUrl,
      introTemplate: emailIntroTemplate,
    };

    const now = new Date().toISOString();
    const alertId = `${eventKey}:alert`;
    await upsertDocument(supabase, 'alerts', alertId, {
      userId: resolvedAssignee.authUserId,
      email: resolvedAssignee.email,
      type: 'task_assignment',
      status: 'unread',
      title: 'Nueva tarea en tu bandeja',
      message: `${emailData.taskTitle} · ${emailData.projectName}`,
      projectId,
      taskId,
      organizationId: organizationId || null,
      eventType,
      stepIndex,
      actionUrl,
      createdAt: now,
      updatedAt: now,
    });

    let emailResult: any = { skipped: true, reason: 'disabled_by_preferences' };
    if (emailEnabled) {
      emailResult = await sendEmailWithResend({
        to: resolvedAssignee.email,
        subject: buildTaskAssignmentSubject(emailData, emailSubjectTemplate),
        html: buildTaskAssignmentEmailHtml(emailData),
        text: buildTaskAssignmentText(emailData),
      });
    }

    await upsertDocument(supabase, 'notification_events', eventKey, {
      eventKey,
      eventType,
      projectId,
      taskId,
      assigneeId,
      assigneeEmail: resolvedAssignee.email,
      assigneeUserId: resolvedAssignee.authUserId,
      stepIndex,
      source: payload.source || null,
      emailEnabled,
      emailResult,
      createdAt: now,
      createdBy: requesterData.user.id,
    });

    return json({
      ok: true,
      email: emailResult,
    });
  } catch (error: any) {
    console.error('Error sending task assignment notification:', error);
    return json({ error: error.message || 'No fue posible enviar la notificación.' }, 500);
  }
}
