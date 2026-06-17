# RealProyect

Aplicativo de gestión de proyectos, tareas, documentos, presupuesto, facturación y equipo.

## Licenciamiento

Pixel Project es software propietario. Su uso, despliegue, copia, reproducción, distribución, modificación o explotación comercial solo está permitido con autorización previa y por escrito del titular de los derechos.

- Términos propietarios: `LICENSE.md`
- Aviso de titularidad: `NOTICE.md`
- Créditos de software libre y dependencias: `THIRD_PARTY_NOTICES.md`

Para regenerar los créditos de dependencias después de agregar o actualizar paquetes:

```bash
npm run notices
```

## Despliegue En Vercel

**Requisitos:** un proyecto en Vercel conectado al repositorio y un proyecto de Supabase.

1. En Supabase, ejecuta las migraciones en orden:
   `supabase/migrations/0001_document_store.sql`,
   `supabase/migrations/0002_seed_global_admin.sql` y
   `supabase/migrations/0003_manual_user_access.sql`,
   `supabase/migrations/0004_seed_functional_defaults.sql`,
   `supabase/migrations/0005_document_collection_views.sql`,
   `supabase/migrations/0006_harden_app_document_privileges.sql`
2. En Vercel, abre el proyecto y configura estas variables en `Settings > Environment Variables`:
   `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET`, `SUPABASE_SERVICE_ROLE_KEY` y `NEXT_PUBLIC_SITE_URL`.
3. Habilita autenticación por correo y contraseña en Supabase Auth.
4. Haz redeploy en Vercel para que el build tome las nuevas variables.

La app usa Supabase Auth, Supabase Storage y la tabla `app_documents` como almacén documental compatible con la estructura anterior del aplicativo.
En el Table Editor verás `app_documents` como tabla principal y vistas `app_*` para inspeccionar proyectos, organizaciones, usuarios, tareas, documentos, presupuesto y facturación sin cambiar el modelo de escritura de la app.
Las políticas RLS permiten acceso al administrador inicial y a correos registrados en `users` o `team_members`.

## Puesta En Marcha Manual

La app no permite autoregistro público desde el login. Los usuarios se habilitan manualmente:

1. Entra con el administrador global.
2. En `Configuración > Organizaciones`, crea la organización inicial.
3. En `Configuración > Cargos`, crea los cargos del equipo si los necesitas.
4. En `Configuración > Usuarios del Sistema`, invita el usuario con su correo, rol de sistema, cargo y organización.
5. El usuario abre el correo de invitación y define su contraseña.
6. Si el usuario ya existía en Supabase Auth, la app enviará un enlace para configurar/restablecer contraseña.
7. Crea los proyectos desde `Proyectos` y asigna el equipo manualmente.

Para este modo de operación, mantén deshabilitado el registro público de usuarios en Supabase.
La `SUPABASE_SERVICE_ROLE_KEY` solo debe existir en Vercel o en un entorno servidor seguro; nunca debe exponerse como variable `NEXT_PUBLIC_*`.
La tabla de usuarios se alimenta desde Supabase Auth, muestra el estado de invitación/confirmación y permite eliminar usuarios desde el administrador global.
Los cargos base y el registro de módulos funcionales se crean en Supabase con `0004_seed_functional_defaults.sql`.
Las vistas de lectura para revisar cada módulo desde Supabase se crean con `0005_document_collection_views.sql`.
Los privilegios de `app_documents` y de las vistas `app_*` se restringen a usuarios autenticados con `0006_harden_app_document_privileges.sql`.

## Administrador Inicial

Para habilitar el acceso inicial de administración global:

1. En Supabase Auth, crea o restablece contraseña para `gerencia.operaciones@realtix.com.co`.
2. Ejecuta en SQL Editor:
   `supabase/migrations/0002_seed_global_admin.sql`
3. Inicia sesión en la app con ese correo y la contraseña configurada en Supabase Auth.

## Recuperación De Contraseña

La app incluye flujo de recuperación con Supabase Auth:

1. En Supabase, ve a `Authentication > URL Configuration`.
2. Configura `Site URL` con el dominio de producción de Vercel.
3. Agrega en `Redirect URLs`:
   `https://TU_DOMINIO/reset-password`
4. En `Authentication > Emails/SMTP`, configura un proveedor SMTP propio para que Supabase pueda enviar correos a usuarios reales.
5. En la pantalla de login, usa `¿Olvidaste tu contraseña?`.
