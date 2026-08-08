import { createHash, createHmac, randomBytes, randomUUID } from 'crypto';
import { NextRequest } from 'next/server';
import { getServerSupabase, getBearerToken } from '@/lib/license-server';
import { AiHttpError, sha256Hex } from '@/lib/ai/api';
import { getAiConfig } from '@/lib/ai/config';

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
  const { data, error } = await supabase.rpc('authenticate_ai_session', {
    p_token_sha256: hashAiToken(token),
    p_required_scope: requiredScope,
  });

  if (error) throw error;
  const session = Array.isArray(data) ? data[0] : data;
  if (!session) {
    throw new AiHttpError(401, 'AI_TOKEN_INVALID', 'La sesión IA no es válida.');
  }

  const scopes = Array.isArray(session.scopes) ? session.scopes.map(String) : [];
  if (!scopes.includes(requiredScope)) {
    throw new AiHttpError(403, 'AI_SCOPE_FORBIDDEN', 'La sesión no tiene permisos para esta operación.');
  }

  return {
    sessionId: String(session.session_id || session.id || randomUUID()),
    tenantId: String(session.tenant_id),
    licenseId: String(session.license_id),
    applicationId: String(session.application_id),
    installationId: String(session.installation_id),
    scopes,
  };
};
