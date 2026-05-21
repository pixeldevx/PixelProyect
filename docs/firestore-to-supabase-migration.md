# Migrar Firestore A Supabase

Este proyecto ya no usa Firebase en runtime. Este proceso usa `firebase-admin` solo como herramienta local temporal para leer la base anterior de Firestore y cargar los documentos en Supabase `app_documents`.

## Qué Migra

El script recorre todas las colecciones raíz de Firestore y sus subcolecciones. Cada documento queda en Supabase así:

- `collection_path`: ruta de la colección, por ejemplo `projects` o `projects/{id}/tasks`
- `doc_id`: ID original del documento
- `data`: datos del documento en JSON

Esto cubre colecciones como `projects`, `users`, `team_members`, `roles`, `organizations`, `alert_rules`, `alerts`, `workflow_templates` y subcolecciones como `documents`, `tasks`, `rateCards`, `budgetLines`, `invoices`, `orgChart` y `activities`.

También puede crear usuarios en Supabase Auth desde los correos encontrados en las colecciones `users` y `team_members`. Esos usuarios se crean confirmados, con una contraseña aleatoria no visible; después deben entrar usando recuperación de contraseña.

## Qué No Migra

- Contraseñas de Firebase Auth. Firebase no permite exportar contraseñas recuperables. Los usuarios deben definir/restablecer contraseña en Supabase.
- Archivos binarios de Firebase Storage. Se migran las referencias/URLs guardadas en Firestore, pero los archivos pueden requerir una migración de Storage aparte.

## Requisitos

1. En Supabase, las migraciones `0001_document_store.sql` y `0002_seed_global_admin.sql` deben estar ejecutadas.
2. Tener una `service_role key` de Supabase. No la subas al repositorio.
3. Tener una credencial Service Account de Firebase con permiso de lectura de Firestore.

## Variables

```bash
export SUPABASE_URL="https://kbcwpzwhnlscogiglthk.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="TU_SUPABASE_SERVICE_ROLE_KEY"
export FIREBASE_SERVICE_ACCOUNT_JSON='{"type":"service_account", "...": "..."}'
```

También puedes usar `GOOGLE_APPLICATION_CREDENTIALS` en vez de `FIREBASE_SERVICE_ACCOUNT_JSON`:

```bash
export GOOGLE_APPLICATION_CREDENTIALS="/ruta/segura/firebase-service-account.json"
```

## Dry Run

Primero instala temporalmente el SDK de administración:

```bash
npm install --no-save firebase-admin
```

Ejecuta una simulación:

```bash
npm run migrate:firestore
```

Opcionalmente guarda el payload que se enviaría a Supabase:

```bash
MIGRATION_OUTPUT="./firestore-migration-preview.json" npm run migrate:firestore
```

## Migración Real

Solo documentos de Firestore:

```bash
MIGRATE_APPLY=true npm run migrate:firestore
```

Documentos de Firestore y usuarios de Supabase Auth:

```bash
MIGRATE_APPLY=true MIGRATE_AUTH_USERS=true npm run migrate:firestore
```

El script usa `upsert`, así que si lo corres más de una vez actualiza documentos existentes con el mismo `collection_path` y `doc_id`.

## Opciones De Usuarios

Por defecto el script busca correos en colecciones llamadas `users` y `team_members`, incluyendo subcolecciones con esos nombres. Puedes ajustar eso así:

```bash
MIGRATION_AUTH_COLLECTIONS="users,team_members,members" npm run migrate:firestore
```

Los campos de correo por defecto son `email`, `correo`, `user.email` y `profile.email`. Puedes cambiarlos así:

```bash
MIGRATION_EMAIL_FIELDS="email,workEmail,profile.email" npm run migrate:firestore
```

## Después De Migrar

1. Entra con el administrador global en la app.
2. Revisa `Settings > Usuarios` y `Projects`.
3. Para cada usuario real, confirma que exista en Supabase Auth y usa recuperación de contraseña.
4. Si hay documentos con URLs de Firebase Storage y se quiere remover Firebase por completo, migra también los archivos a Supabase Storage.
