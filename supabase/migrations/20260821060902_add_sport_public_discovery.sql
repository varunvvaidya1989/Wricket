-- Phase 7: guest-safe discovery and authenticated cross-sport following.

create table public.sport_public_live_snapshots (
  scoring_match_id uuid primary key references public.sport_scoring_matches(id) on delete cascade,
  sport_code text not null,
  competition_id uuid not null references public.sport_competitions(id) on delete cascade,
  competition_name text not null,
  fixture_id uuid not null references public.sport_fixtures(id) on delete cascade,
  participant_a text not null,
  participant_b text not null,
  match_format text not null,
  status text not null,
  headline_score text not null default '0-0',
  scheduled_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  refreshed_at timestamptz not null default now(),
  stale_after timestamptz not null default now() + interval '2 minutes',
  share_slug text not null unique,
  detail_requires_auth boolean not null default true
);

create table public.sport_follows (
  account_id uuid not null references public.profiles(id) on delete cascade,
  resource_type text not null check (resource_type in ('MATCH', 'PLAYER', 'TEAM', 'CLUB', 'COMPETITION')),
  resource_id uuid not null,
  sport_id uuid not null references public.sports(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (account_id, resource_type, resource_id)
);

create table public.sport_public_player_cards (
  sport_profile_id uuid primary key references public.sport_profiles(id) on delete cascade,
  sport_code text not null,
  display_name text not null,
  avatar_url text,
  headline text,
  is_public boolean not null default false,
  updated_at timestamptz not null default now()
);

create table app_private.sport_public_rate_limits (
  client_key_hash text not null,
  window_started_at timestamptz not null,
  request_count integer not null default 1,
  primary key (client_key_hash, window_started_at)
);

alter table public.sport_public_live_snapshots enable row level security;
alter table public.sport_follows enable row level security;
alter table public.sport_public_player_cards enable row level security;
create policy "sport_public_live_guest_read" on public.sport_public_live_snapshots for select to anon, authenticated using (true);
create policy "sport_follows_read_own" on public.sport_follows for select to authenticated using (account_id = (select auth.uid()));
create policy "sport_public_player_cards_guest_read" on public.sport_public_player_cards for select to anon, authenticated using (is_public);
revoke all on public.sport_public_live_snapshots, public.sport_follows, public.sport_public_player_cards from public, anon, authenticated;
grant select on public.sport_public_live_snapshots, public.sport_public_player_cards to anon, authenticated;
grant select on public.sport_follows to authenticated;

create or replace function app_private.refresh_sport_public_live_snapshot(p_scoring_match_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare match public.sport_scoring_matches%rowtype; declare competition public.sport_competitions%rowtype;
declare fixture public.sport_fixtures%rowtype; declare sport_code_value text; declare score_value text;
declare name_a text; declare name_b text;
begin
  select * into match from public.sport_scoring_matches where id = p_scoring_match_id;
  if not found or match.competition_id is null then return; end if;
  select * into competition from public.sport_competitions where id = match.competition_id;
  if competition.visibility <> 'PUBLIC' or competition.lifecycle not in ('PUBLISHED', 'LIVE', 'COMPLETED', 'ARCHIVED') then delete from public.sport_public_live_snapshots where scoring_match_id = match.id; return; end if;
  select * into fixture from public.sport_fixtures where id = match.fixture_id;
  select code into sport_code_value from public.sports where id = match.sport_id;
  select coalesce(squad.name_snapshot, player.display_name_snapshot, entry.snapshot->>'name', 'Entrant') into name_a from public.sport_competition_entries entry left join public.sport_tournament_squads squad on squad.entry_id = entry.id left join public.sport_league_players player on player.entry_id = entry.id where entry.id = match.entrant_a_id;
  select coalesce(squad.name_snapshot, player.display_name_snapshot, entry.snapshot->>'name', 'Entrant') into name_b from public.sport_competition_entries entry left join public.sport_tournament_squads squad on squad.entry_id = entry.id left join public.sport_league_players player on player.entry_id = entry.id where entry.id = match.entrant_b_id;
  select coalesce(payload->>'headline_score', '0-0') into score_value from public.sport_scoring_events where scoring_match_id = match.id order by sequence desc limit 1;
  insert into public.sport_public_live_snapshots(scoring_match_id, sport_code, competition_id, competition_name, fixture_id, participant_a, participant_b, match_format, status, headline_score, scheduled_at, started_at, completed_at, refreshed_at, stale_after, share_slug)
  values (match.id, sport_code_value, competition.id, competition.name, fixture.id, name_a, name_b, match.match_format, match.status, coalesce(score_value, '0-0'), fixture.scheduled_at, case when match.status in ('LIVE','COMPLETED') then match.updated_at end, match.completed_at, now(), now() + interval '2 minutes', lower(sport_code_value) || '-' || replace(match.id::text, '-', ''))
  on conflict (scoring_match_id) do update set status = excluded.status, headline_score = excluded.headline_score, completed_at = excluded.completed_at, refreshed_at = now(), stale_after = now() + interval '2 minutes';
end;
$$;

create or replace function app_private.refresh_sport_public_live_snapshot_trigger()
returns trigger language plpgsql security definer set search_path = public as $$
begin perform app_private.refresh_sport_public_live_snapshot(new.scoring_match_id); return new; end;
$$;
create trigger sport_scoring_event_refresh_public after insert on public.sport_scoring_events for each row execute function app_private.refresh_sport_public_live_snapshot_trigger();

create or replace function app_private.discover_sport_public_live(p_client_key text, p_limit integer default 20, p_before timestamptz default null)
returns setof public.sport_public_live_snapshots language plpgsql security definer set search_path = public as $$
declare key_hash text := md5(coalesce(nullif(trim(p_client_key), ''), 'anonymous')); declare window_value timestamptz := date_trunc('minute', now()); declare count_value integer;
begin
  insert into app_private.sport_public_rate_limits(client_key_hash, window_started_at) values (key_hash, window_value) on conflict (client_key_hash, window_started_at) do update set request_count = app_private.sport_public_rate_limits.request_count + 1 returning request_count into count_value;
  if count_value > 120 then raise exception 'Public discovery rate limit exceeded'; end if;
  return query select snapshot.* from public.sport_public_live_snapshots snapshot where (p_before is null or snapshot.refreshed_at < p_before) order by case snapshot.status when 'LIVE' then 0 else 1 end, snapshot.refreshed_at desc limit least(greatest(p_limit, 1), 50);
end;
$$;

create or replace function app_private.set_sport_follow(p_resource_type text, p_resource_id uuid, p_sport_id uuid, p_follow boolean)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if (select auth.uid()) is null or upper(trim(p_resource_type)) not in ('MATCH', 'PLAYER', 'TEAM', 'CLUB', 'COMPETITION') then raise exception 'Authentication and a supported follow target are required'; end if;
  if p_follow then insert into public.sport_follows(account_id, resource_type, resource_id, sport_id) values ((select auth.uid()), upper(trim(p_resource_type)), p_resource_id, p_sport_id) on conflict do nothing;
  else delete from public.sport_follows where account_id = (select auth.uid()) and resource_type = upper(trim(p_resource_type)) and resource_id = p_resource_id; end if;
  return p_follow;
end;
$$;

create or replace function app_private.list_my_sport_following_feed(p_limit integer default 30, p_before timestamptz default null)
returns setof public.sport_public_live_snapshots language sql stable security definer set search_path = public as $$
  select snapshot.* from public.sport_public_live_snapshots snapshot where (p_before is null or snapshot.refreshed_at < p_before) and (
    exists (select 1 from public.sport_follows follow where follow.account_id = (select auth.uid()) and follow.resource_type = 'MATCH' and follow.resource_id = snapshot.scoring_match_id)
    or exists (select 1 from public.sport_follows follow where follow.account_id = (select auth.uid()) and follow.resource_type = 'COMPETITION' and follow.resource_id = snapshot.competition_id)
  ) order by snapshot.refreshed_at desc limit least(greatest(p_limit, 1), 50)
$$;

create or replace function public.discover_sport_public_live(p_client_key text, p_limit integer default 20, p_before timestamptz default null) returns setof public.sport_public_live_snapshots language sql security definer set search_path = public as $$ select * from app_private.discover_sport_public_live(p_client_key, p_limit, p_before) $$;
create or replace function public.set_sport_follow(p_resource_type text, p_resource_id uuid, p_sport_id uuid, p_follow boolean) returns boolean language sql security definer set search_path = public as $$ select app_private.set_sport_follow(p_resource_type, p_resource_id, p_sport_id, p_follow) $$;
create or replace function public.list_my_sport_following_feed(p_limit integer default 30, p_before timestamptz default null) returns setof public.sport_public_live_snapshots language sql security definer set search_path = public as $$ select * from app_private.list_my_sport_following_feed(p_limit, p_before) $$;
revoke all on function app_private.refresh_sport_public_live_snapshot(uuid), app_private.refresh_sport_public_live_snapshot_trigger(), app_private.discover_sport_public_live(text, integer, timestamptz), app_private.set_sport_follow(text, uuid, uuid, boolean), app_private.list_my_sport_following_feed(integer, timestamptz) from public, anon, authenticated;
revoke all on function public.discover_sport_public_live(text, integer, timestamptz) from public;
grant execute on function public.discover_sport_public_live(text, integer, timestamptz) to anon, authenticated;
revoke all on function public.set_sport_follow(text, uuid, uuid, boolean), public.list_my_sport_following_feed(integer, timestamptz) from public, anon;
grant execute on function public.set_sport_follow(text, uuid, uuid, boolean), public.list_my_sport_following_feed(integer, timestamptz) to authenticated;

create or replace function app_private.set_my_sport_public_player_card(p_sport_profile_id uuid, p_is_public boolean, p_headline text default null)
returns void language plpgsql security definer set search_path = public as $$
declare profile public.sport_profiles%rowtype; declare sport_code_value text;
begin
  select * into profile from public.sport_profiles where id = p_sport_profile_id and account_id = (select auth.uid()) and status = 'ACTIVE';
  if not found then raise exception 'Only the profile owner can change this public card'; end if;
  select code into sport_code_value from public.sports where id = profile.sport_id;
  insert into public.sport_public_player_cards(sport_profile_id, sport_code, display_name, avatar_url, headline, is_public)
  values (profile.id, sport_code_value, profile.display_name, profile.avatar_url, nullif(trim(p_headline), ''), p_is_public)
  on conflict (sport_profile_id) do update set display_name = excluded.display_name, avatar_url = excluded.avatar_url, headline = excluded.headline, is_public = excluded.is_public, updated_at = now();
end;
$$;
create or replace function public.set_my_sport_public_player_card(p_sport_profile_id uuid, p_is_public boolean, p_headline text default null) returns void language sql security definer set search_path = public as $$ select app_private.set_my_sport_public_player_card(p_sport_profile_id, p_is_public, p_headline) $$;
revoke all on function app_private.set_my_sport_public_player_card(uuid, boolean, text) from public, anon, authenticated;
revoke all on function public.set_my_sport_public_player_card(uuid, boolean, text) from public, anon;
grant execute on function public.set_my_sport_public_player_card(uuid, boolean, text) to authenticated;
