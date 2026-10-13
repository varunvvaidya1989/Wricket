-- Private transaction context keeps whole-tournament deletion compatible with
-- per-fixture history guards. Clients cannot create or retain this context.
create table app_private.cricket_tournament_deletions (
  transaction_id bigint not null,
  tournament_id uuid not null,
  primary key(transaction_id,tournament_id)
);
revoke all on app_private.cricket_tournament_deletions from public,anon,authenticated;
create function app_private.cricket_tournament_deletion_allowed(p_tournament_id uuid)
returns boolean language sql security invoker set search_path = '' as $$
  select exists(select 1 from app_private.cricket_tournament_deletions
    where transaction_id = txid_current() and tournament_id = p_tournament_id);
$$;
revoke all on function app_private.cricket_tournament_deletion_allowed(uuid) from public,anon,authenticated;

alter function app_private.delete_owned_tournament(uuid) rename to delete_owned_tournament_records;
revoke all on function app_private.delete_owned_tournament_records(uuid) from public,anon,authenticated;
create function app_private.delete_owned_tournament(p_tournament_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform 1 from public.tournaments where id = p_tournament_id and created_by = auth.uid() for update;
  if not found then raise exception 'Only the tournament owner can delete this tournament'; end if;
  insert into app_private.cricket_tournament_deletions values(txid_current(),p_tournament_id);
  perform app_private.delete_owned_tournament_records(p_tournament_id);
  delete from app_private.cricket_tournament_deletions where transaction_id = txid_current() and tournament_id = p_tournament_id;
end $$;
revoke all on function app_private.delete_owned_tournament(uuid) from public,anon;
grant execute on function app_private.delete_owned_tournament(uuid) to authenticated;

-- Keep tournament membership references consistent, including direct RLS deletes.
create or replace function app_private.guard_tournament_team_removal()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if old.tournament_id is null or app_private.cricket_tournament_deletion_allowed(old.tournament_id) then return old; end if;
  if exists (select 1 from public.matches where team_a_id = old.id or team_b_id = old.id)
    or exists (select 1 from public.fixture_matches where team_a_id = old.id or team_b_id = old.id)
    or exists (
      select 1 from public.knockout_brackets bracket
      join public.fixture_stages stage on stage.id = bracket.stage_id
      where stage.tournament_id = old.tournament_id
        and bracket.rounds::text like '%"' || old.id::text || '"%'
    ) or exists (
      select 1 from public.fixture_stages stage
      where stage.tournament_id = old.tournament_id
        and stage.config::text like '%"' || old.id::text || '"%'
    ) then
    raise exception 'This team is used in fixtures, a bracket or match history. Remove its unplayed fixtures or reset the unstarted plan first. Recorded matches must be retained.';
  end if;
  delete from public.fixture_tie_resolutions resolution
  using public.fixture_groups fixture_group, public.fixture_stages stage
  where resolution.group_id = fixture_group.id and fixture_group.stage_id = stage.id
    and stage.tournament_id = old.tournament_id
    and (old.id = any(resolution.ordered_team_ids) or old.id = any(fixture_group.team_ids));
  update public.fixture_groups fixture_group
  set team_ids = array_remove(fixture_group.team_ids, old.id)
  from public.fixture_stages stage
  where fixture_group.stage_id = stage.id and stage.tournament_id = old.tournament_id
    and old.id = any(fixture_group.team_ids);
  return old;
end;
$$;
revoke all on function app_private.guard_tournament_team_removal() from public, anon, authenticated;

-- Preserve started match history even when an owner bypasses the UI.
create or replace function app_private.guard_cricket_fixture_deletion()
returns trigger language plpgsql security definer set search_path = '' as $$
declare tournament uuid;
begin
  select tournament_id into tournament from public.fixture_stages where id = old.stage_id;
  -- Stage/tournament cascades are checked by the stage guard before deleting it.
  if tournament is null or app_private.cricket_tournament_deletion_allowed(tournament) or not exists (select 1 from public.tournaments where id = tournament) then return old; end if;
  if old.status <> 'SCHEDULED' or exists (select 1 from public.matches where fixture_match_id = old.id and status::text <> 'SCHEDULED') then
    raise exception 'Only an unstarted fixture can be removed';
  end if;
  return old;
end $$;

create or replace function app_private.guard_cricket_stage_deletion()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if app_private.cricket_tournament_deletion_allowed(old.tournament_id) or not exists (select 1 from public.tournaments where id = old.tournament_id) then return old; end if;
  perform 1 from public.matches m join public.fixture_matches f on f.id = m.fixture_match_id
    where f.stage_id = old.id order by m.id for update of m;
  if exists (select 1 from public.matches m join public.fixture_matches f on f.id = m.fixture_match_id
    where f.stage_id = old.id and m.status::text not in ('SCHEDULED','SETUP','TOSS')) then
    raise exception 'Started match history prevents resetting this stage';
  end if;
  return old;
end $$;

