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
import { getAiConfig } from '@/lib/ai/config';
import { authenticateAiSession } from '@/lib/ai/session';
import { validateFeedbackEvent, type ValidatedFeedbackEvent } from '@/lib/ai/validation';
import { getClientIp, getServerSupabase } from '@/lib/license-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const BATCH_KEYS = ['schema_version', 'events'] as const;
const IDEMPOTENCY_PATTERN = /^[a-zA-Z0-9._:-]{8,160}$/;

const rejectedPayload = (validated: { feedbackId: string | null; reasonCode: string }) => ({
  feedback_id: validated.feedbackId,
  status: 'rejected',
  event_id: null,
  eligible_for_training: false,
  reason_code: validated.reasonCode,
});

const eventPayload = (event: ValidatedFeedbackEvent) => ({
  feedback_id: event.feedbackId,
  revision_id: event.revisionId,
  supersedes_feedback_id: event.supersedesFeedbackId,
  content_sha256: event.contentSha256,
  schema_version: event.schemaVersion,
  taxonomy_version: event.taxonomyVersion,
  app_version: event.appVersion,
  client_created_at: event.clientCreatedAt,
  sample: {
    photo_sha256: event.sample.photoSha256,
    group_ref: event.sample.groupRef,
  },
  labels_before: {
    uso: event.labelsBefore.uso,
    actividad: event.labelsBefore.actividad,
  },
  inference: {
    base_model: event.inference.baseModel,
    model_version: event.inference.modelVersion,
    prompt_version: event.inference.promptVersion,
    preprocess_version: event.inference.preprocessVersion,
    estado: event.inference.estado,
    predicted_uso: event.inference.predictedUso,
    predicted_uso_confidence: event.inference.predictedUsoConfidence,
    predicted_actividad: event.inference.predictedActividad,
    predicted_actividad_confidence: event.inference.predictedActividadConfidence,
  },
  features: {
    encoder: event.features.encoder,
    encoder_revision: event.features.encoderRevision,
    preprocess_version: event.features.preprocessVersion,
    normalization: event.features.normalization,
    dtype: event.features.dtype,
    dimensions: event.features.dimensions,
    clip_embedding: event.features.clipEmbedding,
    l2_norm: event.features.l2Norm,
  },
  review: {
    decision: event.review.decision,
    final_uso: event.review.finalUso,
    final_actividad: event.review.finalActividad,
    client_trainable: event.review.clientTrainable,
    reviewed_at: event.review.reviewedAt,
  },
  status: event.status,
  eligible_for_training: event.eligibleForTraining,
  reason_code: event.reasonCode,
});

const rpcError = (message = '') => {
  if (message.includes('AI_FEEDBACK_DISABLED')) {
    return new AiHttpError(403, 'AI_FEEDBACK_DISABLED', 'La recepción de feedback IA no está activa para esta licencia.');
  }
  return new AiHttpError(503, 'AI_FEEDBACK_TRANSIENT_FAILURE', 'No se pudo registrar el lote. Puedes reintentarlo con la misma clave.');
};

export async function POST(request: NextRequest) {
  const requestId = getAiRequestId(request);
  const config = getAiConfig();

  try {
    if (!config.feedbackEnabled) {
      throw new AiHttpError(403, 'AI_FEEDBACK_DISABLED', 'La recepción de feedback IA no está activa globalmente.');
    }

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

    const events = body.events.map((event) => {
      const validated = validateFeedbackEvent(event);
      return 'rejected' in validated ? rejectedPayload(validated) : eventPayload(validated);
    });

    const batchId = randomUUID();
    const receivedAt = new Date().toISOString();
    const expiresAt = new Date(Date.now() + config.idempotencyRetentionDays * 24 * 60 * 60 * 1000).toISOString();
    const supabase = getServerSupabase();
    const { data: rpcResult, error } = await supabase.rpc('record_ai_feedback_batch', {
      p_tenant_id: session.tenantId,
      p_application_id: session.applicationId,
      p_installation_id: session.installationId,
      p_endpoint: '/api/v1/ai/feedback/batch',
      p_idempotency_key: idempotencyKey,
      p_request_sha256: canonicalSha256,
      p_expires_at: expiresAt,
      p_batch_id: batchId,
      p_received_at: receivedAt,
      p_events: events,
    });

    if (error) throw rpcError(error.message);

    const status = Number(rpcResult?.status || 200);
    const responseBody = rpcResult?.body || rpcResult || {
      batch_id: batchId,
      received_at: receivedAt,
      results: [],
      summary: { accepted: 0, duplicates: 0, accepted_not_trainable: 0, rejected: 0, conflicts: 0 },
    };

    return aiJson(requestId, responseBody, status, status === 503 ? { 'Retry-After': '3' } : undefined);
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
