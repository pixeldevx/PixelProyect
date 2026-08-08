import { stableStringify, sha256Hex, isLowerSha256 } from '@/lib/ai/api';
import { getAiConfig } from '@/lib/ai/config';
import {
  isExcludedVantiClass,
  isValidVantiPair,
  VANTI_CLIP_MODEL,
  VANTI_PREPROCESS_VERSION,
  VANTI_TAXONOMY_VERSION,
} from '@/lib/ai/taxonomy';

export type FeedbackStatus = 'accepted' | 'accepted_not_trainable' | 'duplicate' | 'rejected' | 'conflict';

export type FeedbackReasonCode =
  | 'INVALID_SCHEMA_VERSION'
  | 'INVALID_FIELD_TYPE'
  | 'ENCODER_REVISION_REQUIRED'
  | 'EMBEDDING_MISSING'
  | 'EMBEDDING_INVALID'
  | 'UNKNOWN_ENCODER'
  | 'UNKNOWN_TAXONOMY'
  | 'INVALID_DOMAIN_PAIR'
  | 'EXCLUDED_CLASS'
  | 'NO_DETERMINABLE'
  | 'SUPERSEDED_EVENT_NOT_FOUND'
  | 'FEEDBACK_ID_REUSED_WITH_DIFFERENT_CONTENT'
  | 'PRIVATE_FIELD_NOT_ALLOWED';

export type ValidatedFeedbackEvent = {
  feedbackId: string;
  revisionId: string;
  supersedesFeedbackId: string | null;
  contentSha256: string;
  schemaVersion: string;
  taxonomyVersion: string;
  appVersion: string;
  clientCreatedAt: string;
  sample: {
    photoSha256: string;
    groupRef: string | null;
  };
  labelsBefore: {
    uso: string;
    actividad: string;
  };
  inference: {
    baseModel: string;
    modelVersion: string;
    promptVersion: string;
    preprocessVersion: string;
    estado: string;
    predictedUso: string | null;
    predictedUsoConfidence: number | null;
    predictedActividad: string | null;
    predictedActividadConfidence: number | null;
  };
  features: {
    encoder: string;
    encoderRevision: string | null;
    preprocessVersion: string;
    normalization: string;
    dtype: string;
    dimensions: number;
    clipEmbedding: number[] | null;
    l2Norm: number | null;
  };
  review: {
    decision: 'excel_confirmado' | 'clasificacion_real' | 'no_determinable';
    usoReal: string | null;
    actividadReal: string | null;
    clientTrainable: boolean;
    reviewedAt: string;
    finalUso: string | null;
    finalActividad: string | null;
  };
  status: FeedbackStatus;
  eligibleForTraining: boolean;
  reasonCode: FeedbackReasonCode | null;
};

const PRIVATE_FIELD_PATHS = new Set([
  'license_key',
  'tenant_id',
  'license_id',
  'installation_id',
  'machine_id',
  'sample.photo_name',
  'sample.local_path',
  'sample.workbook_sha256',
  'sample.sheet',
  'sample.source_row',
  'sample.output_row',
  'sample.llave_sig_hash',
  'review.comment',
  'sync',
]);

const EVENT_KEYS = new Set([
  'feedback_id',
  'revision_id',
  'supersedes_feedback_id',
  'created_at',
  'app_version',
  'taxonomy_version',
  'sample',
  'labels_before',
  'inference',
  'features',
  'review',
  'schema_version',
]);

const SAMPLE_KEYS = new Set(['photo_sha256', 'group_ref']);
const LABEL_KEYS = new Set(['uso', 'actividad']);
const INFERENCE_KEYS = new Set(['base_model', 'model_version', 'prompt_version', 'preprocess_version', 'estado', 'uso', 'actividad']);
const PREDICTION_KEYS = new Set(['label', 'confidence']);
const FEATURES_KEYS = new Set(['encoder', 'encoder_revision', 'preprocess_version', 'normalization', 'dtype', 'dimensions', 'clip_embedding']);
const REVIEW_KEYS = new Set(['decision', 'uso_real', 'actividad_real', 'trainable', 'reviewed_at']);

const normalizeLabel = (value: unknown) => (typeof value === 'string' ? value.trim().toUpperCase() : '');
const normalizeString = (value: unknown, maxLength: number) => (typeof value === 'string' ? value.trim().slice(0, maxLength) : '');

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value));

const hasPrivateOrUnknownField = (value: unknown, allowed: Set<string>, path = ''): boolean => {
  if (!isPlainObject(value)) return true;

  for (const key of Object.keys(value)) {
    const keyPath = path ? `${path}.${key}` : key;
    if (PRIVATE_FIELD_PATHS.has(keyPath) || !allowed.has(key)) return true;
  }

  return false;
};

const confidence = (value: unknown) => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) return null;
  return value;
};

const hasInvalidConfidence = (value: Record<string, unknown>) =>
  Object.prototype.hasOwnProperty.call(value, 'confidence') && confidence(value.confidence) == null;

const parseIsoDate = (value: unknown) => {
  if (typeof value !== 'string') return '';
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return '';
  const date = new Date(timestamp);
  const now = Date.now();
  const maxPast = now - 1000 * 60 * 60 * 24 * 365 * 5;
  const maxFuture = now + 1000 * 60 * 60 * 24 * 2;
  if (date.getTime() < maxPast || date.getTime() > maxFuture) return '';
  return date.toISOString();
};

const embeddingStatus = (
  features: Record<string, unknown>,
): {
  reason: FeedbackReasonCode | null;
  rejected: boolean;
  eligibleByEmbedding: boolean;
  embedding: number[] | null;
  l2Norm: number | null;
} => {
  const embedding = features.clip_embedding;
  const dimensions = typeof features.dimensions === 'number' && Number.isInteger(features.dimensions) ? features.dimensions : null;
  if (!Array.isArray(embedding) || !embedding.length || dimensions === 0) {
    return { reason: 'EMBEDDING_MISSING', rejected: false, eligibleByEmbedding: false, embedding: null, l2Norm: null };
  }

  if (dimensions !== 512 || embedding.length !== 512) {
    return { reason: 'EMBEDDING_INVALID', rejected: true, eligibleByEmbedding: false, embedding: null, l2Norm: null };
  }

  const invalid = embedding.some((item) => typeof item !== 'number' || !Number.isFinite(item) || item < -1.001 || item > 1.001);
  if (invalid) {
    return { reason: 'EMBEDDING_INVALID', rejected: true, eligibleByEmbedding: false, embedding: null, l2Norm: null };
  }

  const numericEmbedding = embedding as number[];
  const norm = Math.sqrt(numericEmbedding.reduce((sum, item) => sum + item * item, 0));
  if (norm < 0.99 || norm > 1.01) {
    return { reason: 'EMBEDDING_INVALID', rejected: true, eligibleByEmbedding: false, embedding: null, l2Norm: norm };
  }

  return { reason: null, rejected: false, eligibleByEmbedding: true, embedding: numericEmbedding, l2Norm: norm };
};

export const validateFeedbackEvent = (event: unknown): ValidatedFeedbackEvent | { rejected: true; feedbackId: string | null; reasonCode: FeedbackReasonCode } => {
  const { defaultTaxonomyVersion, approvedClipModel, approvedClipRevision, approvedPreprocessVersion } = getAiConfig();

  if (!isPlainObject(event) || hasPrivateOrUnknownField(event, EVENT_KEYS)) {
    return {
      rejected: true,
      feedbackId: isPlainObject(event) && isLowerSha256(event.feedback_id) ? String(event.feedback_id) : null,
      reasonCode: 'PRIVATE_FIELD_NOT_ALLOWED',
    };
  }

  const sample = event.sample as Record<string, unknown>;
  const labelsBefore = event.labels_before as Record<string, unknown>;
  const inference = event.inference as Record<string, unknown>;
  const features = event.features as Record<string, unknown>;
  const review = event.review as Record<string, unknown>;

  if (
    hasPrivateOrUnknownField(sample, SAMPLE_KEYS, 'sample') ||
    hasPrivateOrUnknownField(labelsBefore, LABEL_KEYS, 'labels_before') ||
    hasPrivateOrUnknownField(inference, INFERENCE_KEYS, 'inference') ||
    hasPrivateOrUnknownField(features, FEATURES_KEYS, 'features') ||
    hasPrivateOrUnknownField(review, REVIEW_KEYS, 'review')
  ) {
    return { rejected: true, feedbackId: isLowerSha256(event.feedback_id) ? String(event.feedback_id) : null, reasonCode: 'PRIVATE_FIELD_NOT_ALLOWED' };
  }

  const inferenceUso = isPlainObject(inference.uso) ? inference.uso : {};
  const inferenceActividad = isPlainObject(inference.actividad) ? inference.actividad : {};
  if (hasPrivateOrUnknownField(inferenceUso, PREDICTION_KEYS, 'inference.uso') || hasPrivateOrUnknownField(inferenceActividad, PREDICTION_KEYS, 'inference.actividad')) {
    return { rejected: true, feedbackId: isLowerSha256(event.feedback_id) ? String(event.feedback_id) : null, reasonCode: 'PRIVATE_FIELD_NOT_ALLOWED' };
  }
  if (hasInvalidConfidence(inferenceUso) || hasInvalidConfidence(inferenceActividad)) {
    return { rejected: true, feedbackId: isLowerSha256(event.feedback_id) ? String(event.feedback_id) : null, reasonCode: 'EMBEDDING_INVALID' };
  }

  const feedbackId = isLowerSha256(event.feedback_id) ? String(event.feedback_id) : '';
  const revisionId = isLowerSha256(event.revision_id) ? String(event.revision_id) : '';
  const supersedesFeedbackId = event.supersedes_feedback_id == null ? null : isLowerSha256(event.supersedes_feedback_id) ? String(event.supersedes_feedback_id) : '';
  const photoSha256 = isLowerSha256(sample.photo_sha256) ? String(sample.photo_sha256) : '';
  const clientCreatedAt = parseIsoDate(event.created_at);
  const reviewedAt = parseIsoDate(review.reviewed_at);
  const schemaVersion = event.schema_version === '1.0' ? '1.0' : '';
  const taxonomyVersion = normalizeString(event.taxonomy_version, 80);

  if (!schemaVersion) {
    return { rejected: true, feedbackId: feedbackId || null, reasonCode: 'INVALID_SCHEMA_VERSION' };
  }

  if (!feedbackId || !revisionId || supersedesFeedbackId === '' || !photoSha256 || !clientCreatedAt || !reviewedAt) {
    return { rejected: true, feedbackId: feedbackId || null, reasonCode: 'PRIVATE_FIELD_NOT_ALLOWED' };
  }

  if (taxonomyVersion !== defaultTaxonomyVersion || taxonomyVersion !== VANTI_TAXONOMY_VERSION) {
    return { rejected: true, feedbackId, reasonCode: 'UNKNOWN_TAXONOMY' };
  }

  const excelUso = normalizeLabel(labelsBefore.uso);
  const excelActividad = normalizeLabel(labelsBefore.actividad);
  if (!isValidVantiPair(excelUso, excelActividad)) {
    return { rejected: true, feedbackId, reasonCode: 'INVALID_DOMAIN_PAIR' };
  }

  const decision = normalizeString(review.decision, 40) as ValidatedFeedbackEvent['review']['decision'];
  if (!['excel_confirmado', 'clasificacion_real', 'no_determinable'].includes(decision)) {
    return { rejected: true, feedbackId, reasonCode: 'NO_DETERMINABLE' };
  }

  if (typeof review.trainable !== 'boolean') {
    return { rejected: true, feedbackId, reasonCode: 'INVALID_FIELD_TYPE' };
  }

  const usoReal = normalizeLabel(review.uso_real) || null;
  const actividadReal = normalizeLabel(review.actividad_real) || null;
  const finalUso = decision === 'excel_confirmado' ? excelUso : decision === 'clasificacion_real' ? usoReal : null;
  const finalActividad = decision === 'excel_confirmado' ? excelActividad : decision === 'clasificacion_real' ? actividadReal : null;

  if (decision === 'no_determinable') {
    return {
      feedbackId,
      revisionId,
      supersedesFeedbackId,
      contentSha256: sha256Hex(stableStringify(event)),
      schemaVersion,
      taxonomyVersion,
      appVersion: normalizeString(event.app_version, 32),
      clientCreatedAt,
      sample: { photoSha256, groupRef: normalizeString(sample.group_ref, 128) || null },
      labelsBefore: { uso: excelUso, actividad: excelActividad },
      inference: {
        baseModel: normalizeString(inference.base_model, 120),
        modelVersion: normalizeString(inference.model_version, 120),
        promptVersion: normalizeString(inference.prompt_version, 120),
        preprocessVersion: normalizeString(inference.preprocess_version, 80),
        estado: normalizeString(inference.estado, 40),
        predictedUso: normalizeLabel(inferenceUso.label) || null,
        predictedUsoConfidence: confidence(inferenceUso.confidence),
        predictedActividad: normalizeLabel(inferenceActividad.label) || null,
        predictedActividadConfidence: confidence(inferenceActividad.confidence),
      },
      features: {
        encoder: normalizeString(features.encoder, 120),
        encoderRevision: normalizeString(features.encoder_revision, 120) || null,
        preprocessVersion: normalizeString(features.preprocess_version, 80),
        normalization: normalizeString(features.normalization, 20),
        dtype: normalizeString(features.dtype, 20),
        dimensions: typeof features.dimensions === 'number' && Number.isInteger(features.dimensions) ? features.dimensions : 0,
        clipEmbedding: null,
        l2Norm: null,
      },
      review: {
        decision,
        usoReal,
        actividadReal,
        clientTrainable: review.trainable,
        reviewedAt,
        finalUso,
        finalActividad,
      },
      status: 'accepted_not_trainable',
      eligibleForTraining: false,
      reasonCode: 'NO_DETERMINABLE',
    };
  }

  if (!finalUso || !finalActividad || !isValidVantiPair(finalUso, finalActividad)) {
    return { rejected: true, feedbackId, reasonCode: 'INVALID_DOMAIN_PAIR' };
  }

  if (isExcludedVantiClass(finalUso, finalActividad)) {
    return { rejected: true, feedbackId, reasonCode: 'EXCLUDED_CLASS' };
  }

  const baseModel = normalizeString(inference.base_model, 120);
  const encoder = normalizeString(features.encoder, 120);
  if (![baseModel, encoder].every((model) => model === approvedClipModel && model === VANTI_CLIP_MODEL)) {
    return { rejected: true, feedbackId, reasonCode: 'UNKNOWN_ENCODER' };
  }

  const preprocessVersion = normalizeString(features.preprocess_version, 80);
  const inferencePreprocessVersion = normalizeString(inference.preprocess_version, 80);
  if (preprocessVersion !== approvedPreprocessVersion || preprocessVersion !== VANTI_PREPROCESS_VERSION || inferencePreprocessVersion !== preprocessVersion) {
    return { rejected: true, feedbackId, reasonCode: 'EMBEDDING_INVALID' };
  }

  if (normalizeString(features.normalization, 20) !== 'l2' || normalizeString(features.dtype, 20) !== 'float32') {
    return { rejected: true, feedbackId, reasonCode: 'EMBEDDING_INVALID' };
  }

  const embedding = embeddingStatus(features);
  if (embedding.rejected) {
    return { rejected: true, feedbackId, reasonCode: embedding.reason || 'EMBEDDING_INVALID' };
  }

  const encoderRevision = normalizeString(features.encoder_revision, 120) || null;
  const clientTrainable = review.trainable;
  let eligibleForTraining = clientTrainable && embedding.eligibleByEmbedding;
  let reasonCode: FeedbackReasonCode | null = embedding.reason;
  if (!encoderRevision || !approvedClipRevision || encoderRevision !== approvedClipRevision) {
    eligibleForTraining = false;
    reasonCode = 'ENCODER_REVISION_REQUIRED';
  }

  return {
    feedbackId,
    revisionId,
    supersedesFeedbackId,
    contentSha256: sha256Hex(stableStringify(event)),
    schemaVersion,
    taxonomyVersion,
    appVersion: normalizeString(event.app_version, 32),
    clientCreatedAt,
    sample: { photoSha256, groupRef: normalizeString(sample.group_ref, 128) || null },
    labelsBefore: { uso: excelUso, actividad: excelActividad },
    inference: {
      baseModel,
      modelVersion: normalizeString(inference.model_version, 120),
      promptVersion: normalizeString(inference.prompt_version, 120),
      preprocessVersion: inferencePreprocessVersion,
      estado: normalizeString(inference.estado, 40),
      predictedUso: normalizeLabel(inferenceUso.label) || null,
      predictedUsoConfidence: confidence(inferenceUso.confidence),
      predictedActividad: normalizeLabel(inferenceActividad.label) || null,
      predictedActividadConfidence: confidence(inferenceActividad.confidence),
    },
    features: {
      encoder,
      encoderRevision,
      preprocessVersion,
      normalization: 'l2',
      dtype: 'float32',
      dimensions: typeof features.dimensions === 'number' && Number.isInteger(features.dimensions) ? features.dimensions : 0,
      clipEmbedding: embedding.embedding,
      l2Norm: embedding.l2Norm,
    },
    review: {
      decision,
      usoReal,
      actividadReal,
      clientTrainable,
      reviewedAt,
      finalUso,
      finalActividad,
    },
    status: eligibleForTraining ? 'accepted' : 'accepted_not_trainable',
    eligibleForTraining,
    reasonCode,
  };
};
