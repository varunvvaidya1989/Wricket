-- Phase 8: notifications, operations, retention, recovery, and rollout controls.

alter table public.sport_feature_flags
  add column owner_label text,
  add column monitoring_signal text,
  add column rollback_procedure text;

create table public.sport_notifications (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.profiles(id) on delete cascade,
  sport_id uuid references public.sports(id) on delete cascade,
  kind text not null check (kind in ('INVITATION', 'REGISTRATION', 'LINEUP_DEADLINE', 'SCHEDULE_CHANGE', 'OFFICIAL_ASSIGNMENT', 'MATCH_START', 'FINAL_RESULT', 'SYSTEM')),
  title text not null check (length(trim(title)) between 2 and 160),
  body text not null check (length(trim(body)) between 2 and 500),
  deep_link text,
  resource_type text,
  resource_id uuid,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.sport_operational_events (
  id uuid primary key default gen_random_uuid(),
  sport_id uuid references public.sports(id) on delete cascade,
  category text not null check (category in ('COMMAND_FAILURE', 'SYNC_CONFLICT', 'SCORING_LATENCY', 'FEED_FRESHNESS', 'AUTHORIZATION_DENIAL', 'AUDIT')),
  severity text not null default 'INFO' check (severity in ('INFO', 'WARN', 'ERROR')),
  operation text not null,
  duration_ms integer check (duration_ms is null or duration_ms >= 0),
  actor_account_id uuid references public.profiles(id) on delete set null,
  resource_type text,
  resource_id uuid,
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
  occurred_at timestamptz not null default now()
);

create table public.sport_support_actions (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.sport_competitions(id) on delete cascade,
  action text not null check (action in ('REBUILD_PROJECTIONS', 'REFRESH_PUBLIC_SNAPSHOTS', 'RELEASE_SCORING_LEASE', 'CREATE_RECOVERY_CHECKPOINT')),
  reason text not null check (length(trim(reason)) between 3 and 500),
  requested_by uuid not null references public.profiles(id) on delete restrict,
  outcome jsonb not null default '{}'::jsonb check (jsonb_typeof(outcome) = 'object'),
  created_at timestamptz not null default now()
);

create table public.sport_retention_policies (
  sport_id uuid primary key references public.sports(id) on delete cascade,
  scoring_events_days integer not null default 2555 check (scoring_events_days >= 365),
  operational_events_days integer not null default 90 check (operational_events_days between 30 and 365),
  notification_days integer not null default 365 check (notification_days between 30 and 2555),
  archived_competitions_days integer not null default 2555 check (archived_competitions_days >= 365),
  updated_at timestamptz not null default now()
);

create table public.sport_recovery_checkpoints (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.sport_competitions(id) on delete cascade,
  schedule_version integer not null,
  snapshot jsonb not null check (jsonb_typeof(snapshot) = 'object'),
  reason text not null,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now()
);

create table public.sport_rollout_plans (
  feature_key text not null,
  sport_id uuid not null references public.sports(id) on delete cascade,
  owner_label text not null,
  rollout_sequence integer[] not null default array[0, 10, 25, 50, 100],
  monitoring_signal text not null,
  rollback_procedure text not null,
  current_stage integer not null default 0 check (current_stage between 0 and 100),
  validated_web boolean not null default false,
  validated_native boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (feature_key, sport_id)
);

insert into public.sport_retention_policies(sport_id) select id from public.sports on conflict do nothing;
insert into public.sport_rollout_plans(feature_key, sport_id, owner_label, monitoring_signal, rollback_procedure)
select feature.feature_key, sport.id, 'SportStage platform', feature.signal, 'Set the feature flag to disabled with zero rollout, preserve data, and review operational events.'
from public.sports sport cross join (values
  ('cloud_competitions', 'command failure and authorization-denial rate'),
  ('offline_scoring', 'sync conflicts and p95 scoring latency'),
  ('public_live', 'feed freshness and public endpoint error rate'),
  ('follows_and_insights', 'feed error rate and notification delivery rate')
) feature(feature_key, signal) on conflict do nothing;

alter table public.sport_notifications enable row level security;
alter table public.sport_operational_events enable row level security;
alter table public.sport_support_actions enable row level security;
alter table public.sport_retention_policies enable row level security;
alter table public.sport_recovery_checkpoints enable row level security;
alter table public.sport_rollout_plans enable row level security;
create policy "sport_notifications_read_own" on public.sport_notifications for select to authenticated using (account_id = (select auth.uid()));
create policy "sport_support_actions_manager_read" on public.sport_support_actions for select to authenticated using ((select app_private.can_manage_sport_competition(competition_id)));
create policy "sport_recovery_manager_read" on public.sport_recovery_checkpoints for select to authenticated using ((select app_private.can_manage_sport_competition(competition_id)));
create policy "sport_retention_authenticated_read" on public.sport_retention_policies for select to authenticated using (true);
create policy "sport_rollout_authenticated_read" on public.sport_rollout_plans for select to authenticated using (true);
revoke all on public.sport_notifications, public.sport_operational_events, public.sport_support_actions, public.sport_retention_policies, public.sport_recovery_checkpoints, public.sport_rollout_plans from public, anon, authenticated;
grant select on public.sport_notifications, public.sport_support_actions, public.sport_retention_policies, public.sport_recovery_checkpoints, public.sport_rollout_plans to authenticated;

create or replace function app_private.capture_sport_audit_operation()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.sport_operational_events(sport_id, category, operation, actor_account_id, resource_type, resource_id, payload, occurred_at)
  values (new.sport_id, 'AUDIT', new.action, new.actor_account_id, new.resource_type, new.resource_id, new.payload, new.occurred_at);
  if new.payload ? 'account_id' and (new.payload->>'account_id') ~* '^[0-9a-f-]{36}$' then
    insert into public.sport_notifications(account_id, sport_id, kind, title, body, resource_type, resource_id, deep_link)
    values ((new.payload->>'account_id')::uuid, new.sport_id,
      case when new.action like '%INVITED%' then 'INVITATION' when new.action like '%OFFICIAL%' then 'OFFICIAL_ASSIGNMENT' else 'SYSTEM' end,
      replace(initcap(lower(new.action)), '_', ' '), 'Open SportStage to review this update.', new.resource_type, new.resource_id, '/sports');
  end if;
  if new.action in ('TEAM_TIE_STARTED', 'TEAM_TIE_RUBBER_OUTCOME_RECORDED', 'SPORT_SCORING_PREPARED') then
    insert into public.sport_notifications(account_id, sport_id, kind, title, body, resource_type, resource_id, deep_link)
    select distinct squad.captain_account_id, new.sport_id,
      case when new.action = 'TEAM_TIE_STARTED' then 'MATCH_START' when new.action = 'TEAM_TIE_RUBBER_OUTCOME_RECORDED' then 'FINAL_RESULT' else 'SCHEDULE_CHANGE' end,
      replace(initcap(lower(new.action)), '_', ' '), 'Your team competition has a new update.', new.resource_type, new.resource_id, '/sports'
    from public.sport_fixtures fixture join public.sport_tournament_squads squad on squad.entry_id in (fixture.entrant_a_id, fixture.entrant_b_id)
    where fixture.id = new.resource_id and squad.captain_account_id is not null;
  end if;
  return new;
end;
$$;
create trigger sport_audit_capture_operation after insert on public.sport_audit_events for each row execute function app_private.capture_sport_audit_operation();

create or replace function app_private.mark_sport_notification_read(p_notification_id uuid)
returns void language sql security definer set search_path = public as $$
  update public.sport_notifications set read_at = coalesce(read_at, now()) where id = p_notification_id and account_id = (select auth.uid())
$$;

create or replace function app_private.execute_sport_support_action(p_competition_id uuid, p_action text, p_reason text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare competition public.sport_competitions%rowtype; declare outcome_value jsonb := '{}'::jsonb; declare action_value text := upper(trim(p_action));
begin
  competition := app_private.require_managed_competition(p_competition_id);
  if nullif(trim(p_reason), '') is null then raise exception 'A support action reason is required'; end if;
  if action_value = 'REBUILD_PROJECTIONS' then outcome_value := app_private.rebuild_sport_competition_projections(competition.id);
  elsif action_value = 'REFRESH_PUBLIC_SNAPSHOTS' then perform app_private.refresh_sport_public_live_snapshot(match.id) from public.sport_scoring_matches match where match.competition_id = competition.id; outcome_value := jsonb_build_object('refreshed', true);
  elsif action_value = 'RELEASE_SCORING_LEASE' then delete from public.sport_scoring_leases lease using public.sport_scoring_matches match where lease.scoring_match_id = match.id and match.competition_id = competition.id; outcome_value := jsonb_build_object('released', true);
  elsif action_value = 'CREATE_RECOVERY_CHECKPOINT' then insert into public.sport_recovery_checkpoints(competition_id, schedule_version, snapshot, reason, created_by) values (competition.id, competition.schedule_version, jsonb_build_object('competition', to_jsonb(competition), 'fixtures', (select coalesce(jsonb_agg(to_jsonb(fixture)), '[]'::jsonb) from public.sport_fixtures fixture where fixture.competition_id = competition.id), 'standings', (select coalesce(jsonb_agg(to_jsonb(standing)), '[]'::jsonb) from public.sport_competition_standings standing where standing.competition_id = competition.id)), trim(p_reason), (select auth.uid())); outcome_value := jsonb_build_object('checkpoint', true);
  else raise exception 'Unsupported support action'; end if;
  insert into public.sport_support_actions(competition_id, action, reason, requested_by, outcome) values (competition.id, action_value, trim(p_reason), (select auth.uid()), outcome_value);
  perform app_private.write_sport_audit(competition.sport_id, 'COMPETITION', competition.id, 'SUPPORT_ACTION_' || action_value, jsonb_build_object('reason', p_reason));
  return outcome_value;
end;
$$;

create or replace function app_private.prune_sport_operational_data()
returns jsonb language plpgsql security definer set search_path = public as $$
declare events_deleted integer; declare notifications_deleted integer;
begin
  delete from public.sport_operational_events where occurred_at < now() - interval '90 days'; get diagnostics events_deleted = row_count;
  delete from public.sport_notifications where created_at < now() - interval '365 days'; get diagnostics notifications_deleted = row_count;
  delete from app_private.sport_public_rate_limits where window_started_at < now() - interval '1 day';
  return jsonb_build_object('operational_events_deleted', events_deleted, 'notifications_deleted', notifications_deleted);
end;
$$;

create or replace function public.mark_sport_notification_read(p_notification_id uuid) returns void language sql security definer set search_path = public as $$ select app_private.mark_sport_notification_read(p_notification_id) $$;
create or replace function public.execute_sport_support_action(p_competition_id uuid, p_action text, p_reason text) returns jsonb language sql security definer set search_path = public as $$ select app_private.execute_sport_support_action(p_competition_id, p_action, p_reason) $$;
revoke all on function app_private.capture_sport_audit_operation(), app_private.mark_sport_notification_read(uuid), app_private.execute_sport_support_action(uuid, text, text), app_private.prune_sport_operational_data() from public, anon, authenticated;
revoke all on function public.mark_sport_notification_read(uuid), public.execute_sport_support_action(uuid, text, text) from public, anon;
grant execute on function public.mark_sport_notification_read(uuid), public.execute_sport_support_action(uuid, text, text) to authenticated;
