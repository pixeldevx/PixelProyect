# Pixel AI Feedback API para VANTI

Base pública prevista:

`https://www.pixelprojects.com.co/api/v1/ai`

Esta integración prepara a Pixel para recibir aprendizaje local de VANTI sin subir fotografías ni consumir usos de la licencia. El MVP recibe embeddings CLIP y decisiones humanas saneadas.

## Arquitectura encontrada y adaptación

- Pixel usa Next.js App Router para sus APIs.
- El licenciamiento en nube ya vive en Supabase, en `public.licenses` y `public.license_usage_logs`.
- La API IA reutiliza esa licencia existente y toma `licenses.id` como `tenant_id` inicial. No crea otro backend ni otra tabla de licencias.
- Las tablas nuevas viven en el esquema separado `ai_feedback` y la app accede a ellas por RPC públicas protegidas para `service_role`; no se debe exponer el esquema en la Data API.
- El cliente de escritorio nunca recibe credenciales de Supabase ni de almacenamiento.
- Los endpoints de IA usan sesiones opacas cortas guardadas por hash; no contienen licencia ni `machine_id` crudo.

## Endpoints

### `POST /api/v1/ai/session`

Crea una sesión temporal usando `license_key`, `machine_id`, `installation_id`, `application_id`, versión y plataforma.

No consume usos.

Política de licencias con cero usos: una licencia activa y no vencida puede abrir sesión IA para vaciar feedback pendiente aunque no tenga saldo. La sincronización de feedback sigue dependiendo de `AI_FEEDBACK_ENABLED` y de la política del tenant.

### `POST /api/v1/ai/feedback/batch`

Requiere:

- `Authorization: Bearer <access_token>`
- `Idempotency-Key`
- `Content-Type: application/json`

Recibe únicamente el contrato público saneado. Rechaza campos privados como rutas, nombres de foto, Excel, comentarios libres, `license_key`, `machine_id` o LLAVESIG.

Estados por evento:

- `accepted`
- `accepted_not_trainable`
- `duplicate`
- `rejected`
- `conflict`

Códigos principales:

- `ENCODER_REVISION_REQUIRED`
- `INVALID_SCHEMA_VERSION`
- `INVALID_FIELD_TYPE`
- `EMBEDDING_MISSING`
- `EMBEDDING_INVALID`
- `UNKNOWN_ENCODER`
- `UNKNOWN_TAXONOMY`
- `INVALID_DOMAIN_PAIR`
- `EXCLUDED_CLASS`
- `NO_DETERMINABLE`
- `SUPERSEDED_EVENT_NOT_FOUND`
- `FEEDBACK_ID_REUSED_WITH_DIFFERENT_CONTENT`
- `PRIVATE_FIELD_NOT_ALLOWED`

### `GET /api/v1/ai/models/manifest`

Requiere `Authorization: Bearer <access_token>`.

Devuelve el modelo `stable` o `beta` publicado para el tenant si existe. Si no existe, responde:

```json
{
  "available": false,
  "reason": "no_compatible_model"
}
```

El endpoint soporta `ETag` e `If-None-Match`.

### `GET /api/v1/ai/openapi`

Devuelve el contrato OpenAPI resumido.

## Taxonomía inicial

- `application_id`: `vanti-suite`
- `taxonomy_version`: `vanti-domains-1`
- `taxonomy_checksum_sha256`: `c6ab8f8a168618083e24822acaa68315b6f5357a9c418562d2ad141dcf582813`
- `approved_encoder`: `openai/clip-vit-base-patch32`
- `approved_encoder_revision`: `3d74acf9a28c67741b2f4f2ea7635f0aaf6f0268`
- `approved_preprocess_version`: `clip-default-1`
- clases excluidas para entrenamiento visual: `BALDIO`, `APARTAMENTO`

El commit exacto del encoder debe coincidir con `AI_APPROVED_CLIP_REVISION`. Para VANTI 2.2 el valor aprobado es `3d74acf9a28c67741b2f4f2ea7635f0aaf6f0268`.

## Variables nuevas

```text
AI_FEEDBACK_ENABLED=false
AI_ALLOWED_APPLICATIONS=vanti-suite
AI_SESSION_TTL_SECONDS=900
AI_SESSION_ISSUER=https://www.pixelprojects.com.co
AI_SESSION_AUDIENCE=vanti-ai-api
AI_MACHINE_HMAC_SECRET=<secreto-servidor>
AI_MAX_BATCH_ITEMS=100
AI_MAX_BODY_BYTES=2097152
AI_IDEMPOTENCY_RETENTION_DAYS=30
AI_DEFAULT_TAXONOMY_VERSION=vanti-domains-1
AI_APPROVED_CLIP_MODEL=openai/clip-vit-base-patch32
AI_APPROVED_CLIP_REVISION=3d74acf9a28c67741b2f4f2ea7635f0aaf6f0268
AI_APPROVED_PREPROCESS_VERSION=clip-default-1
AI_MODEL_MANIFEST_TTL_SECONDS=300
AI_MODEL_BUCKET=<bucket-privado>
AI_MODEL_SIGNING_KEY_ID=<id-publico-de-firma>
AI_TRAINING_ENABLED=false
AI_MODEL_PUBLISHING_ENABLED=false
```

## Despliegue sugerido

1. Aplicar las migraciones `0019_ai_feedback_backend.sql` y `0020_ai_feedback_activation_hardening.sql`.
2. Mantener `ai_feedback` fuera de `Project Settings → API → Data API Settings → Exposed schemas`. Las funciones RPC públicas se ejecutan sólo con `service_role`.
3. Desplegar con `AI_FEEDBACK_ENABLED=false` hasta terminar el smoke test.
4. Configurar `AI_MACHINE_HMAC_SECRET`.
5. Configurar `AI_APPROVED_CLIP_REVISION=3d74acf9a28c67741b2f4f2ea7635f0aaf6f0268`.
6. Ejecutar smoke test con una licencia piloto.
7. Activar `AI_FEEDBACK_ENABLED=true` en Vercel y habilitar explícitamente la política del tenant piloto en `ai_feedback.tenant_policies` con `feedback_enabled=true` y `training_scope='tenant'` o `'global'`.
8. Medir aceptados, rechazados, duplicados, conflictos, latencia y distribución por clase.

## Rollback

- Desactivar `AI_FEEDBACK_ENABLED=false` para cortar recepción sin afectar licencias.
- Si se requiere revertir código, los endpoints `/license/verify` y `/license/use` conservan contrato.
- La migración es aditiva; si se decide retirar datos IA, eliminar primero sesiones/modelos/feedback del esquema `ai_feedback` y luego el esquema completo.

## Pendientes para VANTI

- Construir el sincronizador de `feedback.jsonl` por lista blanca.
- Guardar estado de reintentos fuera del JSONL original.
- Enviar `operation_id` persistente en consumos de licencia.
- Pin del encoder CLIP con commit exacto.
- Descargar manifiesto, verificar firma/hash/tamaño y activar modelo de forma atómica.
- No enviar fotos, nombres de archivo, rutas, Excel, comentarios ni LLAVESIG en el MVP.
