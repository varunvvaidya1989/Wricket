alter table public.matches
add column setup_request_id uuid,
add column setup_request_fingerprint text;

create unique index matches_creator_setup_request_uidx
on public.matches(created_by, setup_request_id)
where setup_request_id is not null;

create or replace function app_private.create_owned_match_idempotent(
  p_request_id uuid,
  p_tournament_id uuid,
  p_team_a_id uuid,
  p_team_b_id uuid,
  p_format text,
  p_rules jsonb default '{}'::jsonb,
  p_scheduled_at timestamptz default null,
  p_venue text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  existing_match public.matches%rowtype;
  match_id_value uuid;
  request_fingerprint text := md5(jsonb_build_object(
    'tournament_id', p_tournament_id,
    'team_a_id', p_team_a_id,
    'team_b_id', p_team_b_id,
    'format', p_format,
    'rules', coalesce(p_rules, '{}'::jsonb),
    'scheduled_at', p_scheduled_at,
    'venue', nullif(trim(p_venue), '')
  )::text);
begin
  if actor_id is null then raise exception 'Authentication is required to create a match'; end if;
  if p_request_id is null then raise exception 'A setup request ID is required'; end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(actor_id::text || ':' || p_request_id::text, 0)
  );

  select * into existing_match
  from public.matches
  where created_by = actor_id and setup_request_id = p_request_id;
  if found then
    if existing_match.setup_request_fingerprint is distinct from request_fingerprint then
      raise exception 'This setup request ID was already used with different match details';
    end if;
    return existing_match.id;
  end if;

  match_id_value := app_private.create_owned_match(
    p_tournament_id, p_team_a_id, p_team_b_id, p_format,
    coalesce(p_rules, '{}'::jsonb), p_scheduled_at, p_venue
  );
  update public.matches set
    setup_request_id = p_request_id,
    setup_request_fingerprint = request_fingerprint
  where id = match_id_value and created_by = actor_id;
  return match_id_value;
end;
$$;

create or replace function public.create_owned_match_idempotent(
  p_request_id uuid,
  p_tournament_id uuid,
  p_team_a_id uuid,
  p_team_b_id uuid,
  p_format text,
  p_rules jsonb default '{}'::jsonb,
  p_scheduled_at timestamptz default null,
  p_venue text default null
)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select app_private.create_owned_match_idempotent(
    p_request_id, p_tournament_id, p_team_a_id, p_team_b_id,
    p_format, p_rules, p_scheduled_at, p_venue
  )
$$;

revoke all on function app_private.create_owned_match_idempotent(uuid, uuid, uuid, uuid, text, jsonb, timestamptz, text)
from public, anon;
revoke all on function public.create_owned_match_idempotent(uuid, uuid, uuid, uuid, text, jsonb, timestamptz, text)
from public, anon;
grant execute on function app_private.create_owned_match_idempotent(uuid, uuid, uuid, uuid, text, jsonb, timestamptz, text)
to authenticated;
grant execute on function public.create_owned_match_idempotent(uuid, uuid, uuid, uuid, text, jsonb, timestamptz, text)
to authenticated;
