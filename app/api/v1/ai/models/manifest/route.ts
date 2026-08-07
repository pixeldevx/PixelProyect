import { NextRequest, NextResponse } from 'next/server';
import { AiHttpError, aiError, aiJson, getAiRequestId, sha256Hex, stableStringify } from '@/lib/ai/api';
import { AI_SCHEMA, getAiConfig } from '@/lib/ai/config';
import { authenticateAiSession } from '@/lib/ai/session';
import { vantiUsoLabels } from '@/lib/ai/taxonomy';
import { getClientIp, getServerSupabase } from '@/lib/license-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const normalizeChannel = (value: string | null) => (value === 'beta' ? 'beta' : 'stable');

export async function GET(request: NextRequest) {
  const requestId = getAiRequestId(request);

  try {
    const config = getAiConfig();
    const session = await authenticateAiSession(request, 'ai.model:read');
    const channel = normalizeChannel(new URL(request.url).searchParams.get('channel'));
    const platform = new URL(request.url).searchParams.get('platform') || null;
    const appVersion = new URL(request.url).searchParams.get('app_version') || null;

    const supabase = getServerSupabase();
    const baseSelect =
      'application_id, training_scope, tenant_id, model_version, manifest_sequence, channel, task, classifier_type, encoder, encoder_revision, preprocess_version, taxonomy_version, labels, thresholds, calibration, metrics, artifact_format, artifact_key, artifact_size_bytes, artifact_sha256, signature_algorithm, signature_base64, signing_key_id, min_app_version, max_app_version, artifact_download_url, published_at, expires_at';

    const { data: tenantModels, error: tenantError } = await supabase
      .schema(AI_SCHEMA)
      .from('model_versions')
      .select(baseSelect)
      .eq('application_id', session.applicationId)
      .eq('tenant_id', session.tenantId)
      .eq('training_scope', 'tenant')
      .eq('channel', channel)
      .eq('status', 'published')
      .order('manifest_sequence', { ascending: false })
      .limit(1);

    if (tenantError) throw tenantError;

    const { data: globalModels, error: globalError } = tenantModels?.length
      ? { data: [], error: null }
      : await supabase
          .schema(AI_SCHEMA)
          .from('model_versions')
          .select(baseSelect)
          .eq('application_id', session.applicationId)
          .is('tenant_id', null)
          .eq('training_scope', 'global')
          .eq('channel', channel)
          .eq('status', 'published')
          .order('manifest_sequence', { ascending: false })
          .limit(1);

    if (globalError) throw globalError;

    const model = tenantModels?.[0] || globalModels?.[0] || null;
    if (!model) {
      const body = { available: false, reason: 'no_compatible_model' };
      const etag = `"${sha256Hex(stableStringify(body))}"`;
      if (request.headers.get('if-none-match') === etag) return new NextResponse(null, { status: 304, headers: { ETag: etag, 'X-Request-Id': requestId } });
      return aiJson(requestId, body, 200, { ETag: etag, 'Cache-Control': `private, max-age=${config.modelManifestTtlSeconds}` });
    }

    const release = {
      manifest_version: '1',
      manifest_sequence: Number(model.manifest_sequence),
      application_id: model.application_id,
      model_version: model.model_version,
      channel: model.channel,
      scope: model.training_scope,
      task: model.task,
      classifier_type: model.classifier_type || 'linear_softmax',
      base_encoder: model.encoder,
      encoder_revision: model.encoder_revision,
      preprocess_version: model.preprocess_version,
      feature_dimensions: 512,
      taxonomy_version: model.taxonomy_version,
      labels: Array.isArray(model.labels) ? model.labels : vantiUsoLabels,
      thresholds: model.thresholds || { minimum_confidence: 0.46, minimum_margin: 0.08 },
      calibration: model.calibration || { type: 'temperature', temperature: 1.0 },
      min_app_version: model.min_app_version,
      max_app_version: model.max_app_version || null,
      published_at: model.published_at,
      expires_at: model.expires_at || null,
      metrics: model.metrics || {},
      artifact: {
        format: model.artifact_format,
        size_bytes: Number(model.artifact_size_bytes),
        sha256: model.artifact_sha256,
      },
    };

    const body = {
      available: true,
      release,
      signature: {
        algorithm: model.signature_algorithm,
        key_id: model.signing_key_id,
        value: model.signature_base64,
      },
      download: model.artifact_download_url
        ? {
            url: model.artifact_download_url,
            expires_at: model.expires_at || null,
          }
        : null,
      compatibility: {
        platform,
        app_version: appVersion,
      },
    };

    const etag = `"${sha256Hex(stableStringify(body))}"`;
    if (request.headers.get('if-none-match') === etag) return new NextResponse(null, { status: 304, headers: { ETag: etag, 'X-Request-Id': requestId } });

    return aiJson(requestId, body, 200, {
      ETag: etag,
      'Cache-Control': `private, max-age=${config.modelManifestTtlSeconds}`,
    });
  } catch (error: any) {
    if (error instanceof AiHttpError) {
      return aiError(requestId, error.status, error.code, error.message);
    }

    console.error('AI manifest error:', {
      requestId,
      clientIp: getClientIp(request),
      message: error?.message,
      code: error?.code,
    });

    return aiError(requestId, 503, 'AI_MODEL_MANIFEST_FAILED', 'No se pudo consultar el manifiesto del modelo.');
  }
}

