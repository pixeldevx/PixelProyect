# RealProyect

Aplicativo de gestión de proyectos, tareas, documentos, presupuesto, facturación y equipo.

## Despliegue En Vercel

**Requisitos:** un proyecto en Vercel conectado al repositorio y un proyecto de Supabase.

1. En Supabase, ejecuta las migraciones en orden:
   `supabase/migrations/0001_document_store.sql`,
   `supabase/migrations/0002_seed_global_admin.sql` y
   `supabase/migrations/0003_manual_user_access.sql`
2. En Vercel, abre el proyecto y configura estas variables en `Settings > Environment Variables`:
   `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` y `NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET`.
3. Habilita autenticación por correo y contraseña en Supabase Auth.
4. Haz redeploy en Vercel para que el build tome las nuevas variables.

La app usa Supabase Auth, Supabase Storage y la tabla `app_documents` como almacén documental compatible con la estructura anterior del aplicativo.
Las políticas RLS permiten acceso al administrador inicial y a correos registrados en `users` o `team_members`.

## Puesta En Marcha Manual

La app no permite autoregistro público desde el login. Los usuarios se habilitan manualmente:

1. Entra con el administrador global.
2. En `Configuración > Organizaciones`, crea la organización inicial.
3. En `Configuración > Cargos`, crea los cargos del equipo si los necesitas.
4. En `Configuración > Usuarios del Sistema`, crea el perfil del usuario con el mismo correo que tendrá en Supabase Auth.
5. En Supabase `Authentication > Users`, crea o confirma ese usuario.
6. El usuario define su contraseña desde `¿Olvidaste tu contraseña?`.
7. Crea los proyectos desde `Proyectos` y asigna el equipo manualmente.

Para este modo de operación, mantén deshabilitado el registro público de usuarios en Supabase.

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
