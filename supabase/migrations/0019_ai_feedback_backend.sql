begin;

create extension if not exists pgcrypto;

create schema if not exists ai_feedback;

grant usage on schema ai_feedback to service_role;

create table if not exists ai_feedback.tenant_policies (
  tenant_id uuid not null references public.licenses(id) on delete cascade,
  application_id text not null,
  feedback_enabled boolean not null default false,
  training_scope text not null default 'none'
    check (training_scope in ('none', 'tenant', 'global')),
  policy_version text not null default 'ai-data-policy-1',
  embedding_retention_days integer not null default 730
    check (embedding_retention_days between 1 and 3650),
  changed_at timestamptz not null default now(),
  changed_by text,
  primary key (tenant_id, application_id)
);

create table if not exists ai_feedback.taxonomy_versions (
  application_id text not null,
  version text not null,
  definition jsonb not null,
  checksum_sha256 text not null
    check (checksum_sha256 ~ '^[0-9a-f]{64}$'),
  active boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (application_id, version),
  unique (application_id, checksum_sha256)
);

create table if not exists ai_feedback.taxonomy_pairs (
  application_id text not null,
  taxonomy_version text not null,
  uso text not null,
  actividad text not null,
  visual_review_excluded boolean not null default false,
  primary key (application_id, taxonomy_version, uso, actividad),
  foreign key (application_id, taxonomy_version)
    references ai_feedback.taxonomy_versions(application_id, version)
);

create table if not exists ai_feedback.installations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.licenses(id) on delete cascade,
  application_id text not null,
  license_id uuid not null references public.licenses(id) on delete cascade,
  installation_uuid uuid not null,
  machine_id_hmac text not null
    check (machine_id_hmac ~ '^[0-9a-f]{64}$'),
  app_version text not null,
  platform text not null,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  disabled_at timestamptz,
  unique (tenant_id, application_id, installation_uuid),
  unique (tenant_id, application_id, id)
);

create table if not exists ai_feedback.session_nonces (
  tenant_id uuid not null references public.licenses(id) on delete cascade,
  application_id text not null,
  installation_id uuid not null references ai_feedback.installations(id) on delete cascade,
  nonce uuid not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  primary key (tenant_id, application_id, installation_id, nonce)
);

create table if not exists ai_feedback.ai_sessions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.licenses(id) on delete cascade,
  application_id text not null,
  license_id uuid not null references public.licenses(id) on delete cascade,
  installation_id uuid not null references ai_feedback.installations(id) on delete cascade,
  token_sha256 text not null unique
    check (token_sha256 ~ '^[0-9a-f]{64}$'),
  scopes text[] not null,
  request_id text,
  issued_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz
);

create table if not exists ai_feedback.samples (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.licenses(id) on delete cascade,
  application_id text not null,
  photo_sha256 text not null
    check (photo_sha256 ~ '^[0-9a-f]{64}$'),
  group_ref text,
  created_at timestamptz not null default now(),
  unique (tenant_id, application_id, photo_sha256),
  unique (tenant_id, application_id, id)
);

create table if not exists ai_feedback.embeddings (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.licenses(id) on delete cascade,
  application_id text not null,
  sample_id uuid not null references ai_feedback.samples(id) on delete cascade,
  encoder text not null,
  encoder_revision text,
  preprocess_version text not null,
  normalization text not null check (normalization = 'l2'),
  dtype text not null check (dtype = 'float32'),
  dimensions integer not null check (dimensions = 512),
  embedding real[] not null,
  l2_norm double precision not null check (l2_norm between 0.99 and 1.01),
  created_at timestamptz not null default now(),
  check (cardinality(embedding) = dimensions),
  unique (tenant_id, application_id, id)
);

create table if not exists ai_feedback.feedback_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.licenses(id) on delete cascade,
  application_id text not null,
  installation_id uuid not null references ai_feedback.installations(id) on delete cascade,
  sample_id uuid not null references ai_feedback.samples(id) on delete cascade,
  embedding_id uuid references ai_feedback.embeddings(id) on delete set null,
  supersedes_event_id uuid references ai_feedback.feedback_events(id) on delete set null,
  feedback_id text not null check (feedback_id ~ '^[0-9a-f]{64}$'),
  revision_id text not null check (revision_id ~ '^[0-9a-f]{64}$'),
  content_sha256 text not null check (content_sha256 ~ '^[0-9a-f]{64}$'),
  schema_version text not null,
  taxonomy_version text not null,
  app_version text not null,
  excel_uso text not null,
  excel_actividad text not null,
  inference_base_model text not null,
  inference_model_version text not null,
  prompt_version text not null,
  preprocess_version text not null,
  inference_estado text not null,
  predicted_uso text,
  predicted_uso_confidence double precision check (predicted_uso_confidence between 0 and 1),
  predicted_actividad text,
  predicted_actividad_confidence double precision check (predicted_actividad_confidence between 0 and 1),
  client_created_at timestamptz not null,
  received_at timestamptz not null default now(),
  quality_status text not null default 'quarantined'
    check (quality_status in ('quarantined', 'eligible', 'adjudication', 'rejected')),
  unique (tenant_id, application_id, feedback_id),
  unique (tenant_id, application_id, id),
  foreign key (application_id, taxonomy_version, excel_uso, excel_actividad)
    references ai_feedback.taxonomy_pairs(application_id, taxonomy_version, uso, actividad)
);

create table if not exists ai_feedback.human_reviews (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.licenses(id) on delete cascade,
  application_id text not null,
  event_id uuid not null references ai_feedback.feedback_events(id) on delete cascade,
  taxonomy_version text not null,
  decision text not null
    check (decision in ('excel_confirmado', 'clasificacion_real', 'no_determinable')),
  final_uso text,
  final_actividad text,
  client_trainable boolean not null,
  eligible_for_training boolean not null,
  eligibility_reason text,
  training_scope text not null
    check (training_scope in ('none', 'tenant', 'global')),
  policy_version text not null,
  client_reviewed_at timestamptz not null,
  received_at timestamptz not null default now(),
  unique (tenant_id, application_id, event_id),
  unique (tenant_id, application_id, id),
  foreign key (application_id, taxonomy_version, final_uso, final_actividad)
    references ai_feedback.taxonomy_pairs(application_id, taxonomy_version, uso, actividad),
  check (
    (
      decision = 'no_determinable'
      and final_uso is null
      and final_actividad is null
    )
    or
    (
      decision in ('excel_confirmado', 'clasificacion_real')
      and final_uso is not null
      and final_actividad is not null
    )
  )
);

create table if not exists ai_feedback.idempotency_keys (
  tenant_id uuid not null references public.licenses(id) on delete cascade,
  application_id text not null,
  installation_id uuid not null references ai_feedback.installations(id) on delete cascade,
  endpoint text not null,
  idempotency_key text not null,
  request_sha256 text not null check (request_sha256 ~ '^[0-9a-f]{64}$'),
  response_status integer,
  response_body jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  expires_at timestamptz not null,
  primary key (tenant_id, application_id, installation_id, endpoint, idempotency_key)
);

create table if not exists ai_feedback.model_versions (
  id uuid primary key default gen_random_uuid(),
  application_id text not null,
  training_scope text not null check (training_scope in ('tenant', 'global')),
  tenant_id uuid references public.licenses(id) on delete cascade,
  model_version text not null,
  manifest_sequence bigint not null check (manifest_sequence > 0),
  channel text not null check (channel in ('beta', 'stable')),
  status text not null check (status in ('candidate', 'published', 'retired', 'revoked')),
  task text not null check (task in ('uso', 'actividad')),
  classifier_type text not null default 'linear_softmax',
  encoder text not null,
  encoder_revision text not null,
  preprocess_version text not null,
  taxonomy_version text not null,
  labels jsonb not null,
  thresholds jsonb not null,
  calibration jsonb not null default '{"type":"temperature","temperature":1.0}'::jsonb,
  metrics jsonb not null default '{}'::jsonb,
  artifact_format text not null check (artifact_format in ('safetensors', 'npz')),
  artifact_key text not null,
  artifact_size_bytes bigint not null check (artifact_size_bytes > 0),
  artifact_sha256 text not null check (artifact_sha256 ~ '^[0-9a-f]{64}$'),
  signature_algorithm text not null,
  signature_base64 text not null,
  signing_key_id text not null,
  min_app_version text not null,
  max_app_version text,
  artifact_download_url text,
  created_at timestamptz not null default now(),
  published_at timestamptz,
  expires_at timestamptz,
  check (
    (training_scope = 'global' and tenant_id is null)
    or
    (training_scope = 'tenant' and tenant_id is not null)
  ),
  unique (application_id, model_version),
  unique (application_id, manifest_sequence)
);

create unique index if not exists ai_one_global_published_model_per_channel
on ai_feedback.model_versions(application_id, channel)
where status = 'published' and training_scope = 'global';

create unique index if not exists ai_one_tenant_published_model_per_channel
on ai_feedback.model_versions(tenant_id, application_id, channel)
where status = 'published' and training_scope = 'tenant';

create index if not exists ai_sessions_token_idx
on ai_feedback.ai_sessions(token_sha256);

create index if not exists ai_feedback_events_training_idx
on ai_feedback.feedback_events(tenant_id, application_id, taxonomy_version, received_at desc);

create index if not exists ai_human_reviews_training_idx
on ai_feedback.human_reviews(tenant_id, application_id, eligible_for_training, training_scope);

alter table if exists public.license_usage_logs
add column if not exists operation_id uuid,
add column if not exists operation_hash text check (operation_hash is null or operation_hash ~ '^[0-9a-f]{64}$');

create unique index if not exists license_usage_logs_license_operation_idx
on public.license_usage_logs(license_key, operation_id)
where operation_id is not null;

create or replace function public.consume_license_use_v2(
  p_license_key varchar(64),
  p_machine_id varchar(64),
  p_action varchar(100),
  p_items_processed integer default 1,
  p_os_info varchar(100) default null,
  p_client_ip varchar(45) default null,
  p_operation_id uuid default null,
  p_operation_hash text default null
)
returns table (
  license_key varchar(64),
  client_name varchar(255),
  plan_name varchar(100),
  max_uses integer,
  used_count integer,
  remaining_uses integer,
  expiration_date date,
  deduplicated boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_license public.licenses%rowtype;
  v_usage public.license_usage_logs%rowtype;
begin
  select *
    into v_license
    from public.licenses
   where licenses.license_key = upper(trim(p_license_key))
   for update;

  if not found then
    raise exception 'LICENSE_NOT_FOUND' using errcode = 'P0002';
  end if;

  if p_operation_id is not null then
    select *
      into v_usage
      from public.license_usage_logs
     where license_usage_logs.license_key = v_license.license_key
       and license_usage_logs.operation_id = p_operation_id
     for update;

    if found then
      if coalesce(v_usage.operation_hash, '') <> coalesce(p_operation_hash, '') then
        raise exception 'LICENSE_OPERATION_CONFLICT' using errcode = 'P0001';
      end if;

      return query
      select
        v_license.license_key,
        v_license.client_name,
        v_license.plan_name,
        v_license.max_uses,
        v_license.used_count,
        greatest(v_license.max_uses - v_license.used_count, 0),
        v_license.expiration_date,
        true;
      return;
    end if;
  end if;

  if not v_license.active then
    raise exception 'LICENSE_INACTIVE' using errcode = 'P0001';
  end if;

  if v_license.expiration_date is not null and v_license.expiration_date < current_date then
    raise exception 'LICENSE_EXPIRED' using errcode = 'P0001';
  end if;

  if v_license.used_count >= v_license.max_uses then
    raise exception 'LICENSE_EXHAUSTED' using errcode = 'P0001';
  end if;

  update public.licenses
     set used_count = used_count + 1
   where id = v_license.id
   returning * into v_license;

  insert into public.license_usage_logs (
    license_key,
    machine_id,
    action,
    items_processed,
    os_info,
    client_ip,
    timestamp,
    operation_id,
    operation_hash
  )
  values (
    v_license.license_key,
    left(trim(p_machine_id), 64),
    left(trim(p_action), 100),
    greatest(coalesce(p_items_processed, 1), 0),
    nullif(left(trim(coalesce(p_os_info, '')), 100), ''),
    nullif(left(trim(coalesce(p_client_ip, '')), 45), ''),
    current_timestamp,
    p_operation_id,
    p_operation_hash
  );

  return query
  select
    v_license.license_key,
    v_license.client_name,
    v_license.plan_name,
    v_license.max_uses,
    v_license.used_count,
    greatest(v_license.max_uses - v_license.used_count, 0),
    v_license.expiration_date,
    false;
end;
$$;

alter table ai_feedback.tenant_policies enable row level security;
alter table ai_feedback.taxonomy_versions enable row level security;
alter table ai_feedback.taxonomy_pairs enable row level security;
alter table ai_feedback.installations enable row level security;
alter table ai_feedback.session_nonces enable row level security;
alter table ai_feedback.ai_sessions enable row level security;
alter table ai_feedback.samples enable row level security;
alter table ai_feedback.embeddings enable row level security;
alter table ai_feedback.feedback_events enable row level security;
alter table ai_feedback.human_reviews enable row level security;
alter table ai_feedback.idempotency_keys enable row level security;
alter table ai_feedback.model_versions enable row level security;

revoke all privileges on all tables in schema ai_feedback from anon, authenticated, public;
revoke all privileges on all functions in schema ai_feedback from anon, authenticated, public;
revoke all privileges on function public.consume_license_use_v2(varchar, varchar, varchar, integer, varchar, varchar, uuid, text) from anon, authenticated, public;

grant all privileges on all tables in schema ai_feedback to service_role;
grant all privileges on all sequences in schema ai_feedback to service_role;
grant execute on function public.consume_license_use_v2(varchar, varchar, varchar, integer, varchar, varchar, uuid, text) to service_role;

insert into ai_feedback.taxonomy_versions (
  application_id,
  version,
  definition,
  checksum_sha256,
  active
)
values (
  'vanti-suite',
  'vanti-domains-1',
  '{
    "version": "vanti-domains-1",
    "usos": ["RESIDENCIAL", "COMERCIAL", "LOTE", "INSTITUCIONAL", "INDUSTRIAL", "MIXTO"],
    "pairs": {
      "RESIDENCIAL": ["CASA", "APARTAESTUDIO", "APARTAMENTO"],
      "COMERCIAL": ["RESTAURANTE", "PANADERIA", "LAVANDERIA", "EXPENDIO DE COMIDAS", "OFICINAS", "OTROS NEGOCIOS", "HOSTALES"],
      "LOTE": ["EN CONSTRUCCION", "EN PROYECTO", "BALDIO"],
      "INSTITUCIONAL": ["HOTELES", "INSTITUCIONAL", "UNIVERSIDAD", "HOSPITAL"],
      "INDUSTRIAL": ["INDUSTRIAL"],
      "MIXTO": ["RESTAURANTE", "PANADERIA", "LAVANDERIA", "EXPENDIO DE COMIDAS", "HOTELES", "OFICINAS", "OTROS NEGOCIOS", "INDUSTRIAL", "INSTITUCIONAL", "HOSTALES"]
    },
    "visual_review_excluded": ["BALDIO", "APARTAMENTO"]
  }'::jsonb,
  'c6ab8f8a168618083e24822acaa68315b6f5357a9c418562d2ad141dcf582813',
  true
)
on conflict (application_id, version)
do update set active = excluded.active;

insert into ai_feedback.taxonomy_pairs (
  application_id,
  taxonomy_version,
  uso,
  actividad,
  visual_review_excluded
)
values
  ('vanti-suite', 'vanti-domains-1', 'RESIDENCIAL', 'CASA', false),
  ('vanti-suite', 'vanti-domains-1', 'RESIDENCIAL', 'APARTAESTUDIO', false),
  ('vanti-suite', 'vanti-domains-1', 'RESIDENCIAL', 'APARTAMENTO', true),
  ('vanti-suite', 'vanti-domains-1', 'COMERCIAL', 'RESTAURANTE', false),
  ('vanti-suite', 'vanti-domains-1', 'COMERCIAL', 'PANADERIA', false),
  ('vanti-suite', 'vanti-domains-1', 'COMERCIAL', 'LAVANDERIA', false),
  ('vanti-suite', 'vanti-domains-1', 'COMERCIAL', 'EXPENDIO DE COMIDAS', false),
  ('vanti-suite', 'vanti-domains-1', 'COMERCIAL', 'OFICINAS', false),
  ('vanti-suite', 'vanti-domains-1', 'COMERCIAL', 'OTROS NEGOCIOS', false),
  ('vanti-suite', 'vanti-domains-1', 'COMERCIAL', 'HOSTALES', false),
  ('vanti-suite', 'vanti-domains-1', 'LOTE', 'EN CONSTRUCCION', false),
  ('vanti-suite', 'vanti-domains-1', 'LOTE', 'EN PROYECTO', false),
  ('vanti-suite', 'vanti-domains-1', 'LOTE', 'BALDIO', true),
  ('vanti-suite', 'vanti-domains-1', 'INSTITUCIONAL', 'HOTELES', false),
  ('vanti-suite', 'vanti-domains-1', 'INSTITUCIONAL', 'INSTITUCIONAL', false),
  ('vanti-suite', 'vanti-domains-1', 'INSTITUCIONAL', 'UNIVERSIDAD', false),
  ('vanti-suite', 'vanti-domains-1', 'INSTITUCIONAL', 'HOSPITAL', false),
  ('vanti-suite', 'vanti-domains-1', 'INDUSTRIAL', 'INDUSTRIAL', false),
  ('vanti-suite', 'vanti-domains-1', 'MIXTO', 'RESTAURANTE', false),
  ('vanti-suite', 'vanti-domains-1', 'MIXTO', 'PANADERIA', false),
  ('vanti-suite', 'vanti-domains-1', 'MIXTO', 'LAVANDERIA', false),
  ('vanti-suite', 'vanti-domains-1', 'MIXTO', 'EXPENDIO DE COMIDAS', false),
  ('vanti-suite', 'vanti-domains-1', 'MIXTO', 'HOTELES', false),
  ('vanti-suite', 'vanti-domains-1', 'MIXTO', 'OFICINAS', false),
  ('vanti-suite', 'vanti-domains-1', 'MIXTO', 'OTROS NEGOCIOS', false),
  ('vanti-suite', 'vanti-domains-1', 'MIXTO', 'INDUSTRIAL', false),
  ('vanti-suite', 'vanti-domains-1', 'MIXTO', 'INSTITUCIONAL', false),
  ('vanti-suite', 'vanti-domains-1', 'MIXTO', 'HOSTALES', false)
on conflict (application_id, taxonomy_version, uso, actividad)
do update set visual_review_excluded = excluded.visual_review_excluded;

commit;
