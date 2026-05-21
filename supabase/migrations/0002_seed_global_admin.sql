do $$
declare
  admin_email text := 'gerencia.operaciones@realtix.com.co';
  admin_name text := 'Administrador Global';
begin
  insert into public.app_documents (collection_path, doc_id, data)
  values (
    'team_members',
    'bootstrap-global-admin-member',
    jsonb_build_object(
      'email', lower(admin_email),
      'name', admin_name,
      'roleId', 'global_admin',
      'roleName', 'Administrador Global',
      'systemRole', 'admin',
      'isBootstrapAdmin', true,
      'createdAt', now(),
      'updatedAt', now()
    )
  )
  on conflict (collection_path, doc_id) do update
    set data = excluded.data,
        updated_at = now();

  insert into public.app_documents (collection_path, doc_id, data)
  values (
    'users',
    'bootstrap-global-admin-user',
    jsonb_build_object(
      'email', lower(admin_email),
      'displayName', admin_name,
      'role', 'admin',
      'isPreRegistered', true,
      'isBootstrapAdmin', true,
      'createdAt', now(),
      'updatedAt', now()
    )
  )
  on conflict (collection_path, doc_id) do update
    set data = excluded.data,
        updated_at = now();
end $$;
