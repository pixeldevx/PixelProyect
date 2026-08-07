import { NextRequest } from 'next/server';
import {
  AiHttpError,
  aiError,
  aiJson,
  assertNoUnknownKeys,
  getAiRequestId,
  isUuid,
  parseAiJsonBody,
  sanitizeText,
} from '@/lib/ai/api';
import { AI_SCHEMA, getAiConfig } from '@/lib/ai/config';
import {
  createAiAccessToken,
  hashAiToken,
  hmacLicenseFingerprint,
  hmacMachineId,
} from '@/lib/ai/session';
import {
  VANTI_CLIP_MODEL,
  VANTI_PREPROCESS_VERSION,
  VANTI_TAXONOMY_CHECKSUM,
  VANTI_TAXONOMY_VERSION,
} from '@/lib/ai/taxonomy';
import {
  getClientIp,
  getLicenseRejection,
  getServerSupabase,
  LICENSE_TABLE,
  normalizeLicenseKey,
  type LicenseRecord,
} from '@/lib/license-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SESSION_KEYS = [
  'schema_version',
  'application_id',
  'license_key',
  'machine_id',
  'installation_id',
  'app_version',
  'platform',
  'client_time',
  'nonce',
] as const;

export async function POST(request: NextRequest) {
  const requestId = getAiRequestId(request);

  try {
    const config = getAiConfig();
    const { parsed: body } = await parseAiJsonBody<Record<string, unknown>>(request, 64 * 1024);
    assertNoUnknownKeys(body, SESSION_KEYS, 'session');

    const applicationId = sanitizeText(body.application_id, 80);
    const licenseKey = normalizeLicenseKey(body.license_key);
    const machineId = sanitizeText(body.machine_id, 128);
    const installationUuid = sanitizeText(body.installation_id, 64);
    const appVersion = sanitizeText(body.app_version, 32);
    const platform = sanitizeText(body.platform, 40);
    const nonce = body.nonce == null ? '' : sanitizeText(body.nonce, 64);

    if (body.schema_version !== '1.0') {
      throw new AiHttpError(400, 'UNSUPPORTED_SCHEMA_VERSION', 'La sesión IA requiere schema_version 1.0.');
    }

    if (!applicationId || !config.allowedApplications.includes(applicationId)) {
      throw new AiHttpError(403, 'APPLICATION_NOT_ALLOWED', 'La aplicación no está habilitada para IA.');
    }

    if (!licenseKey || !machineId || !isUuid(installationUuid) || !appVersion || !platform) {
      throw new AiHttpError(400, 'SESSION_FIELDS_REQUIRED', 'Debes enviar licencia, máquina, instalación, versión y plataforma.');
    }

    if (nonce && !isUuid(nonce)) {
      throw new AiHttpError(400, 'INVALID_NONCE', 'El nonce debe ser un UUID válido.');
    }

    const supabase = getServerSupabase();
    const { data: licenseData, error: licenseError } = await supabase
      .from(LICENSE_TABLE)
      .select('*')
      .eq('license_key', licenseKey)
      .maybeSingle();

    if (licenseError) throw licenseError;

    const license = (licenseData || null) as LicenseRecord | null;
    const rejection = getLicenseRejection(license, licenseKey, { requireRemainingUses: false });
    if (rejection) {
      throw new AiHttpError(403, 'AI_LICENSE_FORBIDDEN', rejection.body.message || 'La licencia no está habilitada.');
    }

    const tenantId = (license as LicenseRecord).id;
    const machineIdHmac = hmacMachineId(machineId);

    const { data: policyRows, error: policyError } = await supabase
      .schema(AI_SCHEMA)
      .from('tenant_policies')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('application_id', applicationId)
      .limit(1);

    if (policyError) throw policyError;

    const persistedPolicy = Array.isArray(policyRows) && policyRows.length ? policyRows[0] : null;
    const effectiveFeedbackEnabled = config.feedbackEnabled && Boolean(persistedPolicy?.feedback_enabled ?? true);
    const trainingScope = effectiveFeedbackEnabled
      ? String(persistedPolicy?.training_scope || 'tenant')
      : 'none';
    const policyVersion = String(persistedPolicy?.policy_version || config.policyVersion);

    if (!persistedPolicy) {
      const { error: insertPolicyError } = await supabase.schema(AI_SCHEMA).from('tenant_policies').insert({
        tenant_id: tenantId,
        application_id: applicationId,
        feedback_enabled: config.feedbackEnabled,
        training_scope: config.feedbackEnabled ? 'tenant' : 'none',
        policy_version: config.policyVersion,
        changed_by: 'system:ai-session-default',
      });
      if (insertPolicyError && insertPolicyError.code !== '23505') throw insertPolicyError;
    }

    const { data: installation, error: installationError } = await supabase
      .schema(AI_SCHEMA)
      .from('installations')
      .upsert(
        {
          tenant_id: tenantId,
          application_id: applicationId,
          license_id: tenantId,
          installation_uuid: installationUuid,
          machine_id_hmac: machineIdHmac,
          app_version: appVersion,
          platform,
          last_seen_at: new Date().toISOString(),
        },
        { onConflict: 'tenant_id,application_id,installation_uuid' },
      )
      .select('id, disabled_at')
      .single();

    if (installationError) throw installationError;
    if (installation?.disabled_at) {
      throw new AiHttpError(403, 'AI_INSTALLATION_DISABLED', 'La instalación está deshabilitada para IA.');
    }

    if (nonce) {
      const expiresAt = new Date(Date.now() + config.sessionTtlSeconds * 1000).toISOString();
      const { error: nonceError } = await supabase.schema(AI_SCHEMA).from('session_nonces').insert({
        tenant_id: tenantId,
        application_id: applicationId,
        installation_id: installation.id,
        nonce,
        expires_at: expiresAt,
      });

      if (nonceError?.code === '23505') {
        throw new AiHttpError(409, 'NONCE_REPLAY', 'El nonce de sesión ya fue usado.');
      }
      if (nonceError) throw nonceError;
    }

    const accessToken = createAiAccessToken();
    const expiresAt = new Date(Date.now() + config.sessionTtlSeconds * 1000).toISOString();
    const scopes = ['ai.feedback:write', 'ai.model:read'];

    const { error: sessionError } = await supabase.schema(AI_SCHEMA).from('ai_sessions').insert({
      tenant_id: tenantId,
      application_id: applicationId,
      license_id: tenantId,
      installation_id: installation.id,
      token_sha256: hashAiToken(accessToken),
      scopes,
      request_id: requestId,
      expires_at: expiresAt,
    });

    if (sessionError) throw sessionError;

    return aiJson(requestId, {
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: config.sessionTtlSeconds,
      scopes,
      server_time: new Date().toISOString(),
      policy: {
        feedback_enabled: effectiveFeedbackEnabled,
        training_scope: trainingScope,
        policy_version: policyVersion,
        media_mode: 'embedding_only',
        max_batch_items: config.maxBatchItems,
        max_body_bytes: config.maxBodyBytes,
        taxonomy_version: config.defaultTaxonomyVersion,
        taxonomy_checksum_sha256: VANTI_TAXONOMY_CHECKSUM,
        approved_encoder: config.approvedClipModel || VANTI_CLIP_MODEL,
        approved_encoder_revision: config.approvedClipRevision || null,
        approved_preprocess_version: config.approvedPreprocessVersion || VANTI_PREPROCESS_VERSION,
      },
    });
  } catch (error: any) {
    if (error instanceof AiHttpError) {
      return aiError(requestId, error.status, error.code, error.message);
    }

    console.error('AI session error:', {
      requestId,
      clientIp: getClientIp(request),
      licenseFingerprint: hmacLicenseFingerprint('license' in (error || {}) ? String(error.license) : ''),
      message: error?.message,
    });

    return aiError(requestId, 500, 'AI_SESSION_FAILED', 'No se pudo crear la sesión IA.');
  }
}

