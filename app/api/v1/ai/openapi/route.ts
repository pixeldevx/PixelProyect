import { NextRequest } from 'next/server';
import { aiJson, getAiRequestId } from '@/lib/ai/api';
import { VANTI_TAXONOMY_CHECKSUM } from '@/lib/ai/taxonomy';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const requestId = getAiRequestId(request);

  return aiJson(requestId, {
    openapi: '3.1.0',
    info: {
      title: 'Pixel AI Feedback API',
      version: '2026-08-07',
      description: 'API de sesiones, feedback sanitizado y manifiestos de modelos para VANTI y futuras aplicaciones Pixel.',
    },
    servers: [{ url: 'https://www.pixelprojects.com.co/api/v1/ai' }],
    paths: {
      '/session': {
        post: {
          summary: 'Crea una sesión IA temporal usando una licencia Pixel sin consumir usos.',
          security: [],
        },
      },
      '/feedback/batch': {
        post: {
          summary: 'Recibe un lote idempotente de embeddings CLIP y etiquetas humanas sanitizadas.',
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: 'Idempotency-Key',
              in: 'header',
              required: true,
              schema: { type: 'string' },
            },
          ],
        },
      },
      '/models/manifest': {
        get: {
          summary: 'Devuelve el manifiesto del modelo compatible publicado para la instalación.',
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: 'channel', in: 'query', schema: { type: 'string', enum: ['stable', 'beta'], default: 'stable' } },
            { name: 'platform', in: 'query', schema: { type: 'string' } },
            { name: 'app_version', in: 'query', schema: { type: 'string' } },
            { name: 'If-None-Match', in: 'header', schema: { type: 'string' } },
          ],
        },
      },
      '/openapi': {
        get: {
          summary: 'Contrato público resumido de la API IA.',
          security: [],
        },
      },
    },
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
        },
      },
    },
    'x-pixel-ai': {
      application_id: 'vanti-suite',
      taxonomy_version: 'vanti-domains-1',
      taxonomy_checksum_sha256: VANTI_TAXONOMY_CHECKSUM,
      approved_encoder: 'openai/clip-vit-base-patch32',
      approved_encoder_revision: '3d74acf9a28c67741b2f4f2ea7635f0aaf6f0268',
      approved_preprocess_version: 'clip-default-1',
      media_mode: 'embedding_only',
      excluded_visual_classes: ['BALDIO', 'APARTAMENTO'],
      strict_feedback_schema_version: '1.0',
      feedback_endpoint_requires_idempotency: true,
      feedback_requires_training_scope: ['tenant', 'global'],
    },
  });
}
