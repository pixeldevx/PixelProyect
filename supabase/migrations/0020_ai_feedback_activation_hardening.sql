begin;

create or replace function public.create_ai_session_record(
  p_tenant_id uuid,
  p_application_id text,
  p_installation_uuid uuid,
  p_machine_id_hmac text,
  p_app_version text,
  p_platform text,
  p_nonce uuid,
  p_token_sha256 text,
  p_scopes text[],
  p_request_id text,
  p_expires_at timestamptz,
  p_policy_version text,
  p_global_feedback_enabled boolean
)
returns table (
  installation_id uuid,
  feedback_enabled boolean,
  training_scope text,
  policy_version text
)
language plpgsql
security definer
set search_path = public, ai_feedback
as $$
declare
  v_policy ai_feedback.tenant_policies%rowtype;
  v_installation_id uuid;
  v_effective_feedback_enabled boolean;
  v_effective_training_scope text;
begin
  select *
    into v_policy
    from ai_feedback.tenant_policies
   where tenant_id = p_tenant_id
     and application_id = p_application_id;

  if not found then
    insert into ai_feedback.tenant_policies (
      tenant_id,
      application_id,
      feedback_enabled,
      training_scope,
      policy_version,
      changed_by
    )
    values (
      p_tenant_id,
      p_application_id,
      false,
      'none',
      p_policy_version,
      'system:ai-session-default-closed'
    )
    returning * into v_policy;
  end if;

  insert into ai_feedback.installations (
    tenant_id,
    application_id,
    license_id,
    installation_uuid,
    machine_id_hmac,
    app_version,
    platform,
    last_seen_at
  )
  values (
    p_tenant_id,
    p_application_id,
    p_tenant_id,
    p_installation_uuid,
    p_machine_id_hmac,
    p_app_version,
    p_platform,
    now()
  )
  on conflict (tenant_id, application_id, installation_uuid)
  do update set
    machine_id_hmac = excluded.machine_id_hmac,
    app_version = excluded.app_version,
    platform = excluded.platform,
    last_seen_at = now()
  returning id into v_installation_id;

  if p_nonce is not null then
    begin
      insert into ai_feedback.session_nonces (
        tenant_id,
        application_id,
        installation_id,
        nonce,
        expires_at
      )
      values (
        p_tenant_id,
        p_application_id,
        v_installation_id,
        p_nonce,
        p_expires_at
      );
    exception
      when unique_violation then
        raise exception 'AI_NONCE_REPLAY' using errcode = 'P0001';
    end;
  end if;

  insert into ai_feedback.ai_sessions (
    tenant_id,
    application_id,
    license_id,
    installation_id,
    token_sha256,
    scopes,
    request_id,
    expires_at
  )
  values (
    p_tenant_id,
    p_application_id,
    p_tenant_id,
    v_installation_id,
    p_token_sha256,
    p_scopes,
    p_request_id,
    p_expires_at
  );

  v_effective_feedback_enabled :=
    coalesce(p_global_feedback_enabled, false)
    and coalesce(v_policy.feedback_enabled, false)
    and v_policy.training_scope in ('tenant', 'global');
  v_effective_training_scope := case
    when v_effective_feedback_enabled then v_policy.training_scope
    else 'none'
  end;

  return query
  select
    v_installation_id,
    v_effective_feedback_enabled,
    v_effective_training_scope,
    coalesce(v_policy.policy_version, p_policy_version);
end;
$$;

create or replace function public.authenticate_ai_session(
  p_token_sha256 text,
  p_required_scope text
)
returns table (
  session_id uuid,
  tenant_id uuid,
  license_id uuid,
  application_id text,
  installation_id uuid,
  scopes text[]
)
language plpgsql
security definer
set search_path = public, ai_feedback
as $$
begin
  return query
  select
    s.id,
    s.tenant_id,
    s.license_id,
    s.application_id,
    s.installation_id,
    s.scopes
  from ai_feedback.ai_sessions s
  join ai_feedback.installations i on i.id = s.installation_id
  join public.licenses l on l.id = s.license_id
  where s.token_sha256 = p_token_sha256
    and s.revoked_at is null
    and s.expires_at > now()
    and i.disabled_at is null
    and p_required_scope = any(s.scopes)
    and l.active is true
    and (l.expiration_date is null or l.expiration_date >= current_date)
  limit 1;
end;
$$;

create or replace function public.record_ai_feedback_batch(
  p_tenant_id uuid,
  p_application_id text,
  p_installation_id uuid,
  p_endpoint text,
  p_idempotency_key text,
  p_request_sha256 text,
  p_expires_at timestamptz,
  p_batch_id uuid,
  p_received_at timestamptz,
  p_events jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, ai_feedback
as $$
declare
  v_policy ai_feedback.tenant_policies%rowtype;
  v_idempotency ai_feedback.idempotency_keys%rowtype;
  v_training_scope text;
  v_policy_version text;
  v_event jsonb;
  v_existing ai_feedback.feedback_events%rowtype;
  v_superseded_id uuid := null;
  v_sample_id uuid;
  v_embedding_id uuid;
  v_event_id uuid;
  v_embedding real[];
  v_result jsonb;
  v_results jsonb := '[]'::jsonb;
  v_summary jsonb := jsonb_build_object(
    'accepted', 0,
    'duplicates', 0,
    'accepted_not_trainable', 0,
    'rejected', 0,
    'conflicts', 0
  );
  v_response_body jsonb;
  v_status text;
  v_reason text;
begin
  select *
    into v_policy
    from ai_feedback.tenant_policies
   where tenant_id = p_tenant_id
     and application_id = p_application_id;

  if not found
     or coalesce(v_policy.feedback_enabled, false) is false
     or v_policy.training_scope not in ('tenant', 'global') then
    raise exception 'AI_FEEDBACK_DISABLED' using errcode = 'P0001';
  end if;

  v_training_scope := v_policy.training_scope;
  v_policy_version := coalesce(v_policy.policy_version, 'ai-data-policy-1');

  select *
    into v_idempotency
    from ai_feedback.idempotency_keys
   where tenant_id = p_tenant_id
     and application_id = p_application_id
     and installation_id = p_installation_id
     and endpoint = p_endpoint
     and idempotency_key = p_idempotency_key
   for update;

  if found then
    if v_idempotency.request_sha256 <> p_request_sha256 then
      return jsonb_build_object(
        'status', 409,
        'body', jsonb_build_object(
          'error', jsonb_build_object(
            'code', 'IDEMPOTENCY_MISMATCH',
            'message', 'La clave de idempotencia ya fue usada con otro cuerpo.'
          )
        )
      );
    end if;

    if v_idempotency.completed_at is not null and v_idempotency.response_body is not null then
      return jsonb_build_object(
        'status', coalesce(v_idempotency.response_status, 200),
        'body', v_idempotency.response_body
      );
    end if;

    if v_idempotency.created_at > now() - interval '15 minutes' then
      return jsonb_build_object(
        'status', 503,
        'body', jsonb_build_object(
          'error', jsonb_build_object(
            'code', 'IDEMPOTENCY_IN_PROGRESS',
            'message', 'El lote anterior todavía se está cerrando. Reintenta en unos segundos.'
          )
        )
      );
    end if;
  else
    insert into ai_feedback.idempotency_keys (
      tenant_id,
      application_id,
      installation_id,
      endpoint,
      idempotency_key,
      request_sha256,
      expires_at
    )
    values (
      p_tenant_id,
      p_application_id,
      p_installation_id,
      p_endpoint,
      p_idempotency_key,
      p_request_sha256,
      p_expires_at
    );
  end if;

  for v_event in select value from jsonb_array_elements(p_events)
  loop
    v_status := coalesce(v_event->>'status', 'rejected');
    v_reason := v_event->>'reason_code';
    v_event_id := null;

    if v_status = 'rejected' then
      v_result := jsonb_build_object(
        'feedback_id', v_event->>'feedback_id',
        'status', 'rejected',
        'event_id', null,
        'eligible_for_training', false,
        'reason_code', v_reason
      );
    else
      select *
        into v_existing
        from ai_feedback.feedback_events
       where tenant_id = p_tenant_id
         and application_id = p_application_id
         and feedback_id = v_event->>'feedback_id';

      if found then
        if v_existing.content_sha256 = v_event->>'content_sha256' then
          v_result := jsonb_build_object(
            'feedback_id', v_event->>'feedback_id',
            'status', 'duplicate',
            'event_id', v_existing.id,
            'eligible_for_training', false,
            'reason_code', null
          );
        else
          v_result := jsonb_build_object(
            'feedback_id', v_event->>'feedback_id',
            'status', 'conflict',
            'event_id', v_existing.id,
            'eligible_for_training', false,
            'reason_code', 'FEEDBACK_ID_REUSED_WITH_DIFFERENT_CONTENT'
          );
        end if;
      else
        v_superseded_id := null;
        if nullif(v_event->>'supersedes_feedback_id', '') is not null then
          select id
            into v_superseded_id
            from ai_feedback.feedback_events
           where tenant_id = p_tenant_id
             and application_id = p_application_id
             and installation_id = p_installation_id
             and feedback_id = v_event->>'supersedes_feedback_id'
             and revision_id = v_event->>'revision_id';

          if not found then
            v_result := jsonb_build_object(
              'feedback_id', v_event->>'feedback_id',
              'status', 'rejected',
              'event_id', null,
              'eligible_for_training', false,
              'reason_code', 'SUPERSEDED_EVENT_NOT_FOUND'
            );
            v_results := v_results || jsonb_build_array(v_result);
            v_summary := jsonb_set(v_summary, '{rejected}', to_jsonb((v_summary->>'rejected')::integer + 1), true);
            continue;
          end if;
        end if;

        insert into ai_feedback.samples (
          tenant_id,
          application_id,
          photo_sha256,
          group_ref
        )
        values (
          p_tenant_id,
          p_application_id,
          v_event#>>'{sample,photo_sha256}',
          nullif(v_event#>>'{sample,group_ref}', '')
        )
        on conflict (tenant_id, application_id, photo_sha256)
        do update set
          group_ref = coalesce(excluded.group_ref, ai_feedback.samples.group_ref)
        returning id into v_sample_id;

        v_embedding_id := null;
        if jsonb_typeof(v_event#>'{features,clip_embedding}') = 'array'
           and (v_event#>>'{features,l2_norm}') is not null then
          select array_agg(value::real)
            into v_embedding
            from jsonb_array_elements_text(v_event#>'{features,clip_embedding}') as value;

          insert into ai_feedback.embeddings (
            tenant_id,
            application_id,
            sample_id,
            encoder,
            encoder_revision,
            preprocess_version,
            normalization,
            dtype,
            dimensions,
            embedding,
            l2_norm
          )
          values (
            p_tenant_id,
            p_application_id,
            v_sample_id,
            v_event#>>'{features,encoder}',
            nullif(v_event#>>'{features,encoder_revision}', ''),
            v_event#>>'{features,preprocess_version}',
            v_event#>>'{features,normalization}',
            v_event#>>'{features,dtype}',
            (v_event#>>'{features,dimensions}')::integer,
            v_embedding,
            (v_event#>>'{features,l2_norm}')::double precision
          )
          returning id into v_embedding_id;
        end if;

        insert into ai_feedback.feedback_events (
          tenant_id,
          application_id,
          installation_id,
          sample_id,
          embedding_id,
          supersedes_event_id,
          feedback_id,
          revision_id,
          content_sha256,
          schema_version,
          taxonomy_version,
          app_version,
          excel_uso,
          excel_actividad,
          inference_base_model,
          inference_model_version,
          prompt_version,
          preprocess_version,
          inference_estado,
          predicted_uso,
          predicted_uso_confidence,
          predicted_actividad,
          predicted_actividad_confidence,
          client_created_at,
          received_at,
          quality_status
        )
        values (
          p_tenant_id,
          p_application_id,
          p_installation_id,
          v_sample_id,
          v_embedding_id,
          v_superseded_id,
          v_event->>'feedback_id',
          v_event->>'revision_id',
          v_event->>'content_sha256',
          v_event->>'schema_version',
          v_event->>'taxonomy_version',
          v_event->>'app_version',
          v_event#>>'{labels_before,uso}',
          v_event#>>'{labels_before,actividad}',
          v_event#>>'{inference,base_model}',
          v_event#>>'{inference,model_version}',
          v_event#>>'{inference,prompt_version}',
          v_event#>>'{inference,preprocess_version}',
          v_event#>>'{inference,estado}',
          nullif(v_event#>>'{inference,predicted_uso}', ''),
          nullif(v_event#>>'{inference,predicted_uso_confidence}', '')::double precision,
          nullif(v_event#>>'{inference,predicted_actividad}', ''),
          nullif(v_event#>>'{inference,predicted_actividad_confidence}', '')::double precision,
          (v_event->>'client_created_at')::timestamptz,
          p_received_at,
          case when (v_event->>'eligible_for_training')::boolean then 'eligible' else 'quarantined' end
        )
        returning id into v_event_id;

        insert into ai_feedback.human_reviews (
          tenant_id,
          application_id,
          event_id,
          taxonomy_version,
          decision,
          final_uso,
          final_actividad,
          client_trainable,
          eligible_for_training,
          eligibility_reason,
          training_scope,
          policy_version,
          client_reviewed_at,
          received_at
        )
        values (
          p_tenant_id,
          p_application_id,
          v_event_id,
          v_event->>'taxonomy_version',
          v_event#>>'{review,decision}',
          nullif(v_event#>>'{review,final_uso}', ''),
          nullif(v_event#>>'{review,final_actividad}', ''),
          (v_event#>>'{review,client_trainable}')::boolean,
          (v_event->>'eligible_for_training')::boolean,
          nullif(v_event->>'reason_code', ''),
          case when (v_event->>'eligible_for_training')::boolean then v_training_scope else 'none' end,
          v_policy_version,
          (v_event#>>'{review,reviewed_at}')::timestamptz,
          p_received_at
        );

        v_result := jsonb_build_object(
          'feedback_id', v_event->>'feedback_id',
          'status', v_event->>'status',
          'event_id', v_event_id,
          'eligible_for_training', (v_event->>'eligible_for_training')::boolean,
          'reason_code', case when nullif(v_event->>'reason_code', '') is null then null else v_event->>'reason_code' end
        );
      end if;
    end if;

    v_results := v_results || jsonb_build_array(v_result);
    if v_result->>'status' = 'accepted' then
      v_summary := jsonb_set(v_summary, '{accepted}', to_jsonb((v_summary->>'accepted')::integer + 1), true);
    elsif v_result->>'status' = 'accepted_not_trainable' then
      v_summary := jsonb_set(v_summary, '{accepted_not_trainable}', to_jsonb((v_summary->>'accepted_not_trainable')::integer + 1), true);
    elsif v_result->>'status' = 'duplicate' then
      v_summary := jsonb_set(v_summary, '{duplicates}', to_jsonb((v_summary->>'duplicates')::integer + 1), true);
    elsif v_result->>'status' = 'conflict' then
      v_summary := jsonb_set(v_summary, '{conflicts}', to_jsonb((v_summary->>'conflicts')::integer + 1), true);
    else
      v_summary := jsonb_set(v_summary, '{rejected}', to_jsonb((v_summary->>'rejected')::integer + 1), true);
    end if;
  end loop;

  v_response_body := jsonb_build_object(
    'batch_id', p_batch_id,
    'received_at', p_received_at,
    'results', v_results,
    'summary', v_summary
  );

  update ai_feedback.idempotency_keys
     set response_status = 200,
         response_body = v_response_body,
         completed_at = now(),
         expires_at = p_expires_at
   where tenant_id = p_tenant_id
     and application_id = p_application_id
     and installation_id = p_installation_id
     and endpoint = p_endpoint
     and idempotency_key = p_idempotency_key;

  return jsonb_build_object('status', 200, 'body', v_response_body);
end;
$$;

create or replace function public.get_ai_model_manifest(
  p_tenant_id uuid,
  p_application_id text,
  p_channel text
)
returns jsonb
language plpgsql
security definer
set search_path = public, ai_feedback
as $$
declare
  v_model ai_feedback.model_versions%rowtype;
begin
  select *
    into v_model
    from ai_feedback.model_versions
   where application_id = p_application_id
     and tenant_id = p_tenant_id
     and training_scope = 'tenant'
     and channel = p_channel
     and status = 'published'
   order by manifest_sequence desc
   limit 1;

  if not found then
    select *
      into v_model
      from ai_feedback.model_versions
     where application_id = p_application_id
       and tenant_id is null
       and training_scope = 'global'
       and channel = p_channel
       and status = 'published'
     order by manifest_sequence desc
     limit 1;
  end if;

  if not found then
    return null;
  end if;

  return to_jsonb(v_model);
end;
$$;

revoke all privileges on function public.create_ai_session_record(uuid, text, uuid, text, text, text, uuid, text, text[], text, timestamptz, text, boolean) from anon, authenticated, public;
revoke all privileges on function public.authenticate_ai_session(text, text) from anon, authenticated, public;
revoke all privileges on function public.record_ai_feedback_batch(uuid, text, uuid, text, text, text, timestamptz, uuid, timestamptz, jsonb) from anon, authenticated, public;
revoke all privileges on function public.get_ai_model_manifest(uuid, text, text) from anon, authenticated, public;

grant execute on function public.create_ai_session_record(uuid, text, uuid, text, text, text, uuid, text, text[], text, timestamptz, text, boolean) to service_role;
grant execute on function public.authenticate_ai_session(text, text) to service_role;
grant execute on function public.record_ai_feedback_batch(uuid, text, uuid, text, text, text, timestamptz, uuid, timestamptz, jsonb) to service_role;
grant execute on function public.get_ai_model_manifest(uuid, text, text) to service_role;

commit;
