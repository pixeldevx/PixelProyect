import { createHash, createHmac, randomBytes, randomUUID } from 'crypto';
import { NextRequest } from 'next/server';
import {
  getLicenseRejection,
  getServerSupabase,
  getBearerToken,
  LICENSE_TABLE,
  type LicenseRecord,
} from '@/lib/license-server';
import { AiHttpError, sha256Hex } from '@/lib/ai/api';
import { AI_SCHEMA, getAiConfig } from '@/lib/ai/config';

export type AiSessionContext = {
  sessionId: string;
  tenantId: string;
  licenseId: string;
  applicationId: string;
  installationId: string;
  scopes: string[];
};

export const hashAiToken = (token: string) => sha256Hex(token);

export const createAiAccessToken = () => `pxai_${randomBytes(32).toString('base64url')}`;

export const hmacMachineId = (machineId: string) => {
  const { machineHmacSecret } = getAiConfig();
  if (!machineHmacSecret) {
    throw new AiHttpError(503, 'AI_MACHINE_HMAC_SECRET_MISSING', 'Falta configurar el secreto de protección de instalaciones IA.');
  }
  return createHmac('sha256', machineHmacSecret).update(machineId).digest('hex');
};

export const hmacLicenseFingerprint = (licenseKey: string) => {
  const { machineHmacSecret } = getAiConfig();
  if (!machineHmacSecret) return createHash('sha256').update(licenseKey).digest('hex');
  return createHmac('sha256', machineHmacSecret).update(licenseKey).digest('hex');
};

export const authenticateAiSession = async (
  request: NextRequest,
  requiredScope: 'ai.feedback:write' | 'ai.model:read',
): Promise<AiSessionContext> => {
  const token = getBearerToken(request);
  if (!token) {
    throw new AiHttpError(401, 'AI_TOKEN_REQUIRED', 'Debes enviar Authorization: Bearer.');
  }

  const supabase = getServerSupabase();
  const { data: session, error } = await supabase
    .schema(AI_SCHEMA)
    .from('ai_sessions')
    .select('id, tenant_id, license_id, application_id, installation_id, scopes, expires_at, revoked_at')
    .eq('token_sha256', hashAiToken(token))
    .maybeSingle();

  if (error) throw error;
  if (!session || session.revoked_at) {
    throw new AiHttpError(401, 'AI_TOKEN_INVALID', 'La sesión IA no es válida.');
  }

  if (new Date(session.expires_at).getTime() <= Date.now()) {
    throw new AiHttpError(401, 'AI_TOKEN_EXPIRED', 'La sesión IA está vencida.');
  }

  const scopes = Array.isArray(session.scopes) ? session.scopes.map(String) : [];
  if (!scopes.includes(requiredScope)) {
    throw new AiHttpError(403, 'AI_SCOPE_FORBIDDEN', 'La sesión no tiene permisos para esta operación.');
  }

  const { data: installation, error: installationError } = await supabase
    .schema(AI_SCHEMA)
    .from('installations')
    .select('disabled_at')
    .eq('id', session.installation_id)
    .maybeSingle();

  if (installationError) throw installationError;
  if (!installation || installation.disabled_at) {
    throw new AiHttpError(403, 'AI_INSTALLATION_DISABLED', 'La instalación no está habilitada para IA.');
  }

  const { data: license, error: licenseError } = await supabase
    .from(LICENSE_TABLE)
    .select('*')
    .eq('id', session.license_id)
    .maybeSingle();

  if (licenseError) throw licenseError;
  const rejection = getLicenseRejection((license || null) as LicenseRecord | null, '', {
    requireRemainingUses: false,
  });
  if (rejection) {
    throw new AiHttpError(403, 'AI_LICENSE_FORBIDDEN', rejection.body.message || 'La licencia no está habilitada.');
  }

  return {
    sessionId: String(session.id || randomUUID()),
    tenantId: String(session.tenant_id),
    licenseId: String(session.license_id),
    applicationId: String(session.application_id),
    installationId: String(session.installation_id),
    scopes,
  };
};

