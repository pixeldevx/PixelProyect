import { randomUUID } from 'crypto';
import { NextRequest } from 'next/server';
import {
  AiHttpError,
  aiError,
  aiJson,
  assertNoUnknownKeys,
  getAiRequestId,
  parseAiJsonBody,
  sanitizeText,
} from '@/lib/ai/api';
import { AI_SCHEMA, getAiConfig } from '@/lib/ai/config';
import { authenticateAiSession } from '@/lib/ai/session';
import { validateFeedbackEvent, type FeedbackReasonCode, type FeedbackStatus, type ValidatedFeedbackEvent } from '@/lib/ai/validation';
import { getClientIp, getServerSupabase } from '@/lib/license-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const BATCH_KEYS = ['schema_version', 'events'] as const;
const IDEMPOTENCY_PATTERN = /^[a-zA-Z0-9._:-]{8,160}$/;

type BatchResult = {
  feedback_id: string | null;
  status: FeedbackStatus;
  event_id: string | null;
  eligible_for_training: boolean;
  reason_code: FeedbackReasonCode | null;
};

const emptySummary = () => ({
  accepted: 0,
  duplicates: 0,
  accepted_not_trainable: 0,
  rejected: 0,
  conflicts: 0,
});

const addSummary = (summary: ReturnType<typeof emptySummary>, status: FeedbackStatus) => {
  if (status === 'accepted') summary.accepted += 1;
  if (status === 'accepted_not_trainable') summary.accepted_not_trainable += 1;
  if (status === 'duplicate') summary.duplicates += 1;
  if (status === 'rejected') summary.rejected += 1;
  if (status === 'conflict') summary.conflicts += 1;
};

const insertFeedbackEvent = async (
  supabase: any,
  session: Awaited<ReturnType<typeof authenticateAiSession>>,
  event: ValidatedFeedbackEvent,
  trainingScope: 'none' | 'tenant' | 'global',
  policyVersion: string,
): Promise<BatchResult> => {
  const { data: existing, error: existingError } = await supabase
    .schema(AI_SCHEMA)
    .from('feedback_events')
    .select('id, content_sha256')
    .eq('tenant_id', session.tenantId)
    .eq('application_id', session.applicationId)
    .eq('feedback_id', event.feedbackId)
    .maybeSingle();

  if (existingError) throw existingError;
  if (existing) {
    return {
      feedback_id: event.feedbackId,
      status: existing.content_sha256 === event.contentSha256 ? 'duplicate' : 'conflict',
      event_id: existing.id,
      eligible_for_training: false,
      reason_code: existing.content_sha256 === event.contentSha256 ? null : 'FEEDBACK_ID_REUSED_WITH_DIFFERENT_CONTENT',
    };
  }

  let supersedesEventId: string | null = null;
  if (event.supersedesFeedbackId) {
    const { data: superseded, error: supersededError } = await supabase
      .schema(AI_SCHEMA)
      .from('feedback_events')
      .select('id')
      .eq('tenant_id', session.tenantId)
      .eq('application_id', session.applicationId)
      .eq('installation_id', session.installationId)
      .eq('feedback_id', event.supersedesFeedbackId)
      .maybeSingle();

    if (supersededError) throw supersededError;
    if (!superseded) {
      return {
        feedback_id: event.feedbackId,
        status: 'rejected',
        event_id: null,
        eligible_for_training: false,
        reason_code: 'SUPERSEDED_EVENT_NOT_FOUND',
      };
    }
    supersedesEventId = superseded.id;
  }

  const { data: sample, error: sampleError } = await supabase
    .schema(AI_SCHEMA)
    .from('samples')
    .upsert(
      {
        tenant_id: session.tenantId,
        application_id: session.applicationId,
        photo_sha256: event.sample.photoSha256,
        group_ref: event.sample.groupRef,
      },
      { onConflict: 'tenant_id,application_id,photo_sha256' },
    )
    .select('id')
    .single();

  if (sampleError) throw sampleError;

  let embeddingId: string | null = null;
  if (event.features.clipEmbedding && event.features.l2Norm != null) {
    const { data: embedding, error: embeddingError } = await supabase
      .schema(AI_SCHEMA)
      .from('embeddings')
      .insert({
        tenant_id: session.tenantId,
        application_id: session.applicationId,
        sample_id: sample.id,
        encoder: event.features.encoder,
        encoder_revision: event.features.encoderRevision,
        preprocess_version: event.features.preprocessVersion,
        normalization: event.features.normalization,
        dtype: event.features.dtype,
        dimensions: event.features.dimensions,
        embedding: event.features.clipEmbedding,
        l2_norm: event.features.l2Norm,
      })
      .select('id')
      .single();

    if (embeddingError) throw embeddingError;
    embeddingId = embedding.id;
  }

  const { data: feedbackEvent, error: eventError } = await supabase
    .schema(AI_SCHEMA)
    .from('feedback_events')
    .insert({
      tenant_id: session.tenantId,
      application_id: session.applicationId,
      installation_id: session.installationId,
      sample_id: sample.id,
      embedding_id: embeddingId,
      supersedes_event_id: supersedesEventId,
      feedback_id: event.feedbackId,
      revision_id: event.revisionId,
      content_sha256: event.contentSha256,
      schema_version: event.schemaVersion,
      taxonomy_version: event.taxonomyVersion,
      app_version: event.appVersion,
      excel_uso: event.labelsBefore.uso,
      excel_actividad: event.labelsBefore.actividad,
      inference_base_model: event.inference.baseModel,
      inference_model_version: event.inference.modelVersion,
      prompt_version: event.inference.promptVersion,
      preprocess_version: event.inference.preprocessVersion,
      inference_estado: event.inference.estado,
      predicted_uso: event.inference.predictedUso,
      predicted_uso_confidence: event.inference.predictedUsoConfidence,
      predicted_actividad: event.inference.predictedActividad,
      predicted_actividad_confidence: event.inference.predictedActividadConfidence,
      client_created_at: event.clientCreatedAt,
      quality_status: event.eligibleForTraining ? 'eligible' : 'quarantined',
    })
    .select('id')
    .single();

  if (eventError?.code === '23505') {
    return {
      feedback_id: event.feedbackId,
      status: 'duplicate',
      event_id: null,
      eligible_for_training: false,
      reason_code: null,
    };
  }
  if (eventError) throw eventError;

  const { error: reviewError } = await supabase.schema(AI_SCHEMA).from('human_reviews').insert({
    tenant_id: session.tenantId,
    application_id: session.applicationId,
    event_id: feedbackEvent.id,
    taxonomy_version: event.taxonomyVersion,
    decision: event.review.decision,
    final_uso: event.review.finalUso,
    final_actividad: event.review.finalActividad,
    client_trainable: event.review.clientTrainable,
    eligible_for_training: event.eligibleForTraining,
    eligibility_reason: event.reasonCode,
    training_scope: event.eligibleForTraining ? trainingScope : 'none',
    policy_version: policyVersion,
    client_reviewed_at: event.review.reviewedAt,
  });

  if (reviewError) throw reviewError;

  return {
    feedback_id: event.feedbackId,
    status: event.status,
    event_id: feedbackEvent.id,
    eligible_for_training: event.eligibleForTraining,
    reason_code: event.reasonCode,
  };
};

export async function POST(request: NextRequest) {
  const requestId = getAiRequestId(request);
  const config = getAiConfig();

  try {
    const session = await authenticateAiSession(request, 'ai.feedback:write');
    const idempotencyKey = sanitizeText(request.headers.get('idempotency-key'), 160);
    if (!IDEMPOTENCY_PATTERN.test(idempotencyKey)) {
      throw new AiHttpError(400, 'IDEMPOTENCY_KEY_REQUIRED', 'Debes enviar Idempotency-Key válido.');
    }

    const { parsed: body, canonicalSha256 } = await parseAiJsonBody<Record<string, unknown>>(request, config.maxBodyBytes);
    assertNoUnknownKeys(body, BATCH_KEYS, 'feedback_batch');

    if (body.schema_version !== '1.0' || !Array.isArray(body.events)) {
      throw new AiHttpError(400, 'INVALID_BATCH_SCHEMA', 'El lote debe usar schema_version 1.0 e incluir events.');
    }

    if (body.events.length < 1 || body.events.length > config.maxBatchItems) {
      throw new AiHttpError(400, 'BATCH_SIZE_INVALID', `El lote debe tener entre 1 y ${config.maxBatchItems} eventos.`);
    }

    const supabase = getServerSupabase();

    const { data: policy, error: policyError } = await supabase
      .schema(AI_SCHEMA)
      .from('tenant_policies')
      .select('feedback_enabled, training_scope, policy_version')
      .eq('tenant_id', session.tenantId)
      .eq('application_id', session.applicationId)
      .maybeSingle();

    if (policyError) throw policyError;
    const feedbackEnabled = config.feedbackEnabled && Boolean(policy?.feedback_enabled ?? true);
    if (!feedbackEnabled) {
      throw new AiHttpError(403, 'AI_FEEDBACK_DISABLED', 'La recepción de feedback IA no está activa para esta licencia.');
    }

    const trainingScope = String(policy?.training_scope || 'tenant') as 'none' | 'tenant' | 'global';
    const policyVersion = String(policy?.policy_version || config.policyVersion);

    const { data: previous, error: previousError } = await supabase
      .schema(AI_SCHEMA)
      .from('idempotency_keys')
      .select('request_sha256, response_status, response_body, completed_at')
      .eq('tenant_id', session.tenantId)
      .eq('application_id', session.applicationId)
      .eq('installation_id', session.installationId)
      .eq('endpoint', '/api/v1/ai/feedback/batch')
      .eq('idempotency_key', idempotencyKey)
      .maybeSingle();

    if (previousError) throw previousError;
    if (previous) {
      if (previous.request_sha256 !== canonicalSha256) {
        throw new AiHttpError(409, 'IDEMPOTENCY_MISMATCH', 'La clave de idempotencia ya fue usada con otro cuerpo.');
      }
      if (previous.completed_at && previous.response_body) {
        return aiJson(requestId, previous.response_body, Number(previous.response_status || 200));
      }
      throw new AiHttpError(503, 'IDEMPOTENCY_IN_PROGRESS', 'El lote anterior todavía se está cerrando. Reintenta en unos segundos.');
    }

    const expiresAt = new Date(Date.now() + config.idempotencyRetentionDays * 24 * 60 * 60 * 1000).toISOString();
    const { error: idemInsertError } = await supabase.schema(AI_SCHEMA).from('idempotency_keys').insert({
      tenant_id: session.tenantId,
      application_id: session.applicationId,
      installation_id: session.installationId,
      endpoint: '/api/v1/ai/feedback/batch',
      idempotency_key: idempotencyKey,
      request_sha256: canonicalSha256,
      expires_at: expiresAt,
    });

    if (idemInsertError?.code === '23505') {
      throw new AiHttpError(503, 'IDEMPOTENCY_IN_PROGRESS', 'El lote anterior todavía se está cerrando. Reintenta en unos segundos.');
    }
    if (idemInsertError) throw idemInsertError;

    const batchId = randomUUID();
    const results: BatchResult[] = [];
    const summary = emptySummary();

    for (const event of body.events) {
      const validated = validateFeedbackEvent(event);
      if ('rejected' in validated) {
        const result: BatchResult = {
          feedback_id: validated.feedbackId,
          status: 'rejected',
          event_id: null,
          eligible_for_training: false,
          reason_code: validated.reasonCode,
        };
        results.push(result);
        addSummary(summary, result.status);
        continue;
      }

      const result = await insertFeedbackEvent(supabase, session, validated, trainingScope, policyVersion);
      results.push(result);
      addSummary(summary, result.status);
    }

    const responseBody = {
      batch_id: batchId,
      received_at: new Date().toISOString(),
      results,
      summary,
    };

    const { error: idemUpdateError } = await supabase
      .schema(AI_SCHEMA)
      .from('idempotency_keys')
      .update({
        response_status: 200,
        response_body: responseBody,
        completed_at: new Date().toISOString(),
      })
      .eq('tenant_id', session.tenantId)
      .eq('application_id', session.applicationId)
      .eq('installation_id', session.installationId)
      .eq('endpoint', '/api/v1/ai/feedback/batch')
      .eq('idempotency_key', idempotencyKey);

    if (idemUpdateError) throw idemUpdateError;

    return aiJson(requestId, responseBody);
  } catch (error: any) {
    if (error instanceof AiHttpError) {
      return aiError(requestId, error.status, error.code, error.message, error.status === 503 ? { 'Retry-After': '3' } : undefined);
    }

    console.error('AI feedback batch error:', {
      requestId,
      clientIp: getClientIp(request),
      message: error?.message,
      code: error?.code,
    });

    return aiError(requestId, 503, 'AI_FEEDBACK_TRANSIENT_FAILURE', 'No se pudo registrar el lote. Puedes reintentarlo con la misma clave.', {
      'Retry-After': '10',
    });
  }
}

