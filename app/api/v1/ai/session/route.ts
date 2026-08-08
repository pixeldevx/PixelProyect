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
import { getAiConfig } from '@/lib/ai/config';
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
    const accessToken = createAiAccessToken();
    const expiresAt = new Date(Date.now() + config.sessionTtlSeconds * 1000).toISOString();
    const scopes = ['ai.feedback:write', 'ai.model:read'];

    const { data: sessionRows, error: sessionError } = await supabase.rpc('create_ai_session_record', {
      p_tenant_id: tenantId,
      p_application_id: applicationId,
      p_installation_uuid: installationUuid,
      p_machine_id_hmac: machineIdHmac,
      p_app_version: appVersion,
      p_platform: platform,
      p_nonce: nonce || null,
      p_token_sha256: hashAiToken(accessToken),
      p_scopes: scopes,
      p_request_id: requestId,
      p_expires_at: expiresAt,
      p_policy_version: config.policyVersion,
      p_global_feedback_enabled: config.feedbackEnabled,
    });

    if (sessionError?.message?.includes('AI_NONCE_REPLAY')) {
      throw new AiHttpError(409, 'NONCE_REPLAY', 'El nonce de sesión ya fue usado.');
    }
    if (sessionError) throw sessionError;

    const sessionPolicy = Array.isArray(sessionRows) ? sessionRows[0] : sessionRows;
    const effectiveFeedbackEnabled = Boolean(sessionPolicy?.feedback_enabled);
    const trainingScope = String(sessionPolicy?.training_scope || 'none');
    const policyVersion = String(sessionPolicy?.policy_version || config.policyVersion);

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
