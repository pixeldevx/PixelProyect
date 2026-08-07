export const AI_SCHEMA = 'ai_feedback';

const toBoolean = (value: string | undefined, fallback = false) => {
  if (value == null || value === '') return fallback;
  return ['1', 'true', 'yes', 'on', 'si', 'sí'].includes(value.trim().toLowerCase());
};

const toInteger = (value: string | undefined, fallback: number, min: number, max: number) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(Math.floor(parsed), min), max);
};

const splitCsv = (value: string | undefined, fallback: string[]) => {
  const parsed = (value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  return parsed.length ? parsed : fallback;
};

export const getAiConfig = () => {
  const sessionTtlSeconds = toInteger(process.env.AI_SESSION_TTL_SECONDS, 900, 60, 900);
  const maxBatchItems = toInteger(process.env.AI_MAX_BATCH_ITEMS, 100, 1, 100);
  const maxBodyBytes = toInteger(process.env.AI_MAX_BODY_BYTES, 2_097_152, 1_024, 5_242_880);
  const idempotencyRetentionDays = toInteger(process.env.AI_IDEMPOTENCY_RETENTION_DAYS, 30, 1, 365);

  return {
    feedbackEnabled: toBoolean(process.env.AI_FEEDBACK_ENABLED, false),
    trainingEnabled: toBoolean(process.env.AI_TRAINING_ENABLED, false),
    publishingEnabled: toBoolean(process.env.AI_MODEL_PUBLISHING_ENABLED, false),
    allowedApplications: splitCsv(process.env.AI_ALLOWED_APPLICATIONS, ['vanti-suite']),
    sessionTtlSeconds,
    maxBatchItems,
    maxBodyBytes,
    idempotencyRetentionDays,
    sessionIssuer: process.env.AI_SESSION_ISSUER || 'https://www.pixelprojects.com.co',
    sessionAudience: process.env.AI_SESSION_AUDIENCE || 'vanti-ai-api',
    machineHmacSecret: process.env.AI_MACHINE_HMAC_SECRET || '',
    defaultTaxonomyVersion: process.env.AI_DEFAULT_TAXONOMY_VERSION || 'vanti-domains-1',
    approvedClipModel: process.env.AI_APPROVED_CLIP_MODEL || 'openai/clip-vit-base-patch32',
    approvedClipRevision: process.env.AI_APPROVED_CLIP_REVISION || '',
    approvedPreprocessVersion: process.env.AI_APPROVED_PREPROCESS_VERSION || 'clip-default-1',
    policyVersion: process.env.AI_DATA_POLICY_VERSION || 'ai-data-policy-1',
    modelManifestTtlSeconds: toInteger(process.env.AI_MODEL_MANIFEST_TTL_SECONDS, 300, 60, 86_400),
  };
};

