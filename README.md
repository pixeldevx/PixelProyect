# RealProyect

Aplicativo de gestión de proyectos, tareas, documentos, presupuesto, facturación y equipo.

## Despliegue En Vercel

**Requisitos:** un proyecto en Vercel conectado al repositorio y un proyecto de Supabase.

1. En Supabase, ejecuta la migración:
   `supabase/migrations/0001_document_store.sql`
2. En Vercel, abre el proyecto y configura estas variables en `Settings > Environment Variables`:
   `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` y `NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET`.
3. Habilita autenticación por correo y contraseña en Supabase Auth.
4. Haz redeploy en Vercel para que el build tome las nuevas variables.

La app usa Supabase Auth, Supabase Storage y la tabla `app_documents` como almacén documental compatible con la estructura anterior del aplicativo.
Las políticas RLS permiten acceso al administrador inicial y a correos registrados en `team_members`.
