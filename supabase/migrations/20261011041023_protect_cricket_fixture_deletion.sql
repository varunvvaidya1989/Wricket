-- Preserve started match history even when an owner bypasses the UI.
create or replace function app_private.guard_cricket_fixture_deletion()
returns trigger language plpgsql security definer set search_path = '' as $$
declare tournament uuid;
begin
  select tournament_id into tournament from public.fixture_stages where id = old.stage_id;
  -- Stage/tournament cascades are checked by the stage guard before deleting it.
  if tournament is null or not exists (select 1 from public.tournaments where id = tournament) then return old; end if;
  if old.status <> 'SCHEDULED' or exists (select 1 from public.matches where fixture_match_id = old.id and status::text <> 'SCHEDULED') then
    raise exception 'Only an unstarted fixture can be removed';
  end if;
  return old;
end $$;

create or replace function app_private.guard_cricket_stage_deletion()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.tournaments where id = old.tournament_id) then return old; end if;
  perform 1 from public.matches m join public.fixture_matches f on f.id = m.fixture_match_id
    where f.stage_id = old.id order by m.id for update of m;
  if exists (select 1 from public.matches m join public.fixture_matches f on f.id = m.fixture_match_id
    where f.stage_id = old.id and m.status::text not in ('SCHEDULED','SETUP','TOSS')) then
    raise exception 'Started match history prevents resetting this stage';
  end if;
  return old;
end $$;

create trigger cricket_fixture_deletion_guard before delete on public.fixture_matches
for each row execute function app_private.guard_cricket_fixture_deletion();
create trigger cricket_stage_deletion_guard before delete on public.fixture_stages
for each row execute function app_private.guard_cricket_stage_deletion();

create or replace function app_private.delete_owned_cricket_fixture(p_fixture_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare tournament uuid;
begin
  select s.tournament_id into tournament from public.fixture_stages s
    join public.fixture_matches f on f.stage_id = s.id where f.id = p_fixture_id;
  if tournament is null then return; end if;
  perform 1 from public.tournaments where id = tournament and created_by = auth.uid() for update;
  if not found then raise exception 'Only the tournament owner can remove fixtures'; end if;
  -- Match before fixture: same lock order as scoring and fixture edits.
  perform 1 from public.matches where fixture_match_id = p_fixture_id for update;
  delete from public.fixture_matches where id = p_fixture_id;
end $$;

create or replace function public.delete_owned_cricket_fixture(p_fixture_id uuid)
returns void language sql security invoker set search_path = '' as $$
  select app_private.delete_owned_cricket_fixture(p_fixture_id);
$$;
revoke all on function app_private.guard_cricket_fixture_deletion(), app_private.guard_cricket_stage_deletion() from public, anon, authenticated;
revoke all on function app_private.delete_owned_cricket_fixture(uuid), public.delete_owned_cricket_fixture(uuid) from public, anon;
grant execute on function app_private.delete_owned_cricket_fixture(uuid), public.delete_owned_cricket_fixture(uuid) to authenticated;
