-- Keep fixture metadata, canonical participants and bracket templates in one transaction.
-- Public RPCs are invokers; authenticated ownership is checked inside private helpers.
alter table public.fixture_stages add column creation_request_hash text;
create or replace function app_private.project_manual_cricket_bracket(p_stage_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare rounds_value jsonb; team_count integer; bracket_count integer;
begin
  if not exists(select 1 from public.fixture_stages where id = p_stage_id and type = 'KNOCKOUT' and config->>'manual' = 'true') then return; end if;
  select jsonb_agg(jsonb_build_object('id', round_id, 'name', round_id, 'matches', matches, 'slotMap', '[]'::jsonb) order by round_order)
    into rounds_value from (
      select round_id, min(round) round_order, jsonb_agg(jsonb_build_object(
        'id', id, 'stageId', stage_id, 'roundId', round_id, 'teamA', team_a_id, 'teamB', team_b_id,
        'round', round, 'leg', leg, 'status', status) order by id) matches
      from public.fixture_matches where stage_id = p_stage_id group by round_id
    ) round_rows;
  if rounds_value is null then delete from public.knockout_brackets where stage_id = p_stage_id; return; end if;
  select count(distinct team_id) into team_count from (
    select team_a_id team_id from public.fixture_matches where stage_id = p_stage_id
    union select team_b_id from public.fixture_matches where stage_id = p_stage_id
  ) teams where team_id is not null;
  bracket_count := power(2,ceil(log(2,greatest(2,team_count))))::integer;
  insert into public.knockout_brackets(stage_id,rounds,seeding_source,bracket_size,byes)
    values(p_stage_id,rounds_value,'MANUAL',bracket_count,greatest(0,bracket_count-team_count))
    on conflict(stage_id) do update set rounds = excluded.rounds, bracket_size = excluded.bracket_size, byes = excluded.byes, updated_at = now();
end $$;

create or replace function app_private.guard_manual_cricket_fixture()
returns trigger language plpgsql security definer set search_path = '' as $$
declare s public.fixture_stages%rowtype;
begin
  if tg_op = 'UPDATE' then
    if (new.team_a_id,new.team_b_id,new.group_id,new.round,new.round_id) is not distinct from
      (old.team_a_id,old.team_b_id,old.group_id,old.round,old.round_id) then return new; end if;
  end if;
  select * into s from public.fixture_stages where id = new.stage_id;
  if s.config->>'manual' <> 'true' or s.config->>'manual' is null then return new; end if;
  perform 1 from public.tournaments where id = s.tournament_id for update;
  if new.team_b_id is null or not exists(select 1 from public.teams where id = new.team_a_id and tournament_id = s.tournament_id)
    or not exists(select 1 from public.teams where id = new.team_b_id and tournament_id = s.tournament_id) then raise exception 'Choose two tournament teams'; end if;
  if s.type = 'GROUP' and not exists(select 1 from public.fixture_groups where id = new.group_id and stage_id = s.id and new.team_a_id = any(team_ids) and new.team_b_id = any(team_ids)) then raise exception 'Both teams must belong to the selected group'; end if;
  if exists(select 1 from public.fixture_matches where stage_id = s.id and id <> new.id and round = new.round
    and (team_a_id in (new.team_a_id,new.team_b_id) or team_b_id in (new.team_a_id,new.team_b_id))
    and not (team_a_id = new.team_a_id and team_b_id = new.team_b_id and round_id = new.round_id and leg = new.leg)) then
    raise exception 'A selected team already has a fixture in this round.';
  end if;
  if s.type = 'KNOCKOUT' and exists(select 1 from public.fixture_matches where stage_id = s.id and id <> new.id
    and ((round = new.round and round_id <> new.round_id) or (round_id = new.round_id and round <> new.round))) then
    raise exception 'Use one round order for each knockout round name.';
  end if;
  return new;
end $$;
create trigger guard_manual_cricket_fixture before insert or update on public.fixture_matches for each row execute function app_private.guard_manual_cricket_fixture();

create or replace function app_private.refresh_manual_cricket_bracket()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform app_private.project_manual_cricket_bracket(case when tg_op = 'DELETE' then old.stage_id else new.stage_id end);
  return coalesce(new,old);
end $$;
create trigger refresh_manual_cricket_bracket after insert or update or delete on public.fixture_matches for each row execute function app_private.refresh_manual_cricket_bracket();
revoke all on function app_private.project_manual_cricket_bracket(uuid), app_private.guard_manual_cricket_fixture(), app_private.refresh_manual_cricket_bracket() from public, anon, authenticated;

create or replace function app_private.edit_owned_cricket_fixture(
  p_fixture_id uuid, p_input jsonb, p_manual boolean default false
) returns void language plpgsql security definer set search_path = '' as $$
declare
  f public.fixture_matches%rowtype;
  s public.fixture_stages%rowtype;
  m public.matches%rowtype;
  a uuid := (p_input->>'team_a_id')::uuid;
  b uuid := (p_input->>'team_b_id')::uuid;
  g uuid := nullif(p_input->>'group_id', '')::uuid;
  r integer;
  rn text;
begin
  select stage.* into s from public.fixture_stages stage
    join public.fixture_matches fixture on fixture.stage_id = stage.id where fixture.id = p_fixture_id;
  if s.id is null or auth.uid() is null then raise exception 'Fixture is unavailable'; end if;
  perform 1 from public.tournaments where id = s.tournament_id and created_by = auth.uid() for update;
  if not found then raise exception 'Only the tournament owner can edit fixtures'; end if;
  -- Match setup/scoring also locks the canonical row. Whichever wins is observed here.
  select * into m from public.matches where fixture_match_id = p_fixture_id for update;
  select * into f from public.fixture_matches where id = p_fixture_id for update;
  if f.status <> 'SCHEDULED' or (m.id is not null and m.status::text <> 'SCHEDULED') then
    raise exception 'Only an unstarted fixture can be edited.';
  end if;
  if a is null or a = b then raise exception 'Select two different tournament teams'; end if;
  if not exists (select 1 from public.teams where id = a and tournament_id = s.tournament_id)
    or (b is not null and not exists (select 1 from public.teams where id = b and tournament_id = s.tournament_id)) then
    raise exception 'Both teams must belong to this tournament';
  end if;
  if p_manual then
    if not coalesce((s.config->>'manual')::boolean, false) then raise exception 'Only manual fixtures can be edited here.'; end if;
    r := (p_input->>'round')::integer;
    rn := coalesce(nullif(trim(p_input->>'round_id'), ''), 'MANUAL_R' || r);
    if r is null or r < 1 or b is null then raise exception 'Choose both teams and a valid round'; end if;
    if s.type = 'GROUP' and not exists (select 1 from public.fixture_groups where id = g and stage_id = s.id and a = any(team_ids) and b = any(team_ids)) then
      raise exception 'Both teams must belong to the selected group';
    end if;
    if exists (select 1 from public.fixture_matches where stage_id = s.id and id <> f.id and round = r
      and (team_a_id in (a,b) or team_b_id in (a,b))) then
      raise exception 'A selected team already has a fixture in this round.';
    end if;
    if s.type = 'KNOCKOUT' and exists (select 1 from public.fixture_matches where stage_id = s.id and id <> f.id
      and ((round = r and round_id <> rn) or (round_id = rn and round <> r))) then
      raise exception 'Use one round order for each knockout round name.';
    end if;
  else
    r := f.round; rn := f.round_id; g := f.group_id;
    if a is distinct from f.team_a_id or b is distinct from f.team_b_id then
      raise exception 'Change pairings through the manual fixture editor';
    end if;
  end if;
  update public.matches set team_a_id = a, team_b_id = b,
    scheduled_at = case when p_manual then scheduled_at else (p_input->>'scheduled_at')::timestamptz end,
    venue = case when p_manual then venue else nullif(trim(p_input->>'venue'), '') end, updated_at = now()
    where id = m.id;
  update public.fixture_matches set team_a_id = a, team_b_id = b,
    group_id = case when s.type = 'GROUP' then g else null end, round = r, round_id = rn, updated_at = now()
    where id = f.id;
end $$;

create or replace function app_private.reset_owned_cricket_fixtures(p_tournament_id uuid, p_knockout_only boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare selected_ids uuid[];
begin
  perform 1 from public.tournaments where id = p_tournament_id and created_by = auth.uid() for update;
  if not found then raise exception 'Only the tournament owner can reset fixtures'; end if;
  select array_agg(id) into selected_ids from public.fixture_stages where tournament_id = p_tournament_id
    and (not p_knockout_only or type = 'KNOCKOUT');
  if selected_ids is null then return; end if;
  perform 1 from public.matches where fixture_match_id in (select id from public.fixture_matches where stage_id = any(selected_ids)) order by id for update;
  if exists (select 1 from public.matches where fixture_match_id in (select id from public.fixture_matches where stage_id = any(selected_ids))
    and status::text not in ('SCHEDULED','SETUP','TOSS')) then
    raise exception 'Fixtures cannot be reset after a match has started or been completed.';
  end if;
  delete from public.fixture_stages where id = any(selected_ids);
end $$;

create or replace function app_private.commit_owned_cricket_bracket(p_stage_id uuid, p_bracket jsonb, p_matches jsonb, p_config jsonb default '{}')
returns void language plpgsql security definer set search_path = '' as $$
declare s public.fixture_stages%rowtype; row_value jsonb;
begin
  select * into s from public.fixture_stages where id = p_stage_id;
  perform 1 from public.tournaments where id = s.tournament_id and created_by = auth.uid() for update;
  if not found then raise exception 'Only the tournament owner can generate a bracket'; end if;
  if s.type <> 'KNOCKOUT' or jsonb_typeof(p_bracket->'rounds') <> 'array' or jsonb_array_length(p_bracket->'rounds') > 16 then raise exception 'Invalid knockout bracket'; end if;
  -- Concurrent refreshes must agree on participants; canonical IDs already exist on retry.
  for row_value in select value from jsonb_array_elements(p_matches) loop
    if exists (select 1 from public.fixture_matches where stage_id = s.id and round_id = row_value->>'round_id'
      and round = (row_value->>'round')::integer)
      and not exists (select 1 from public.fixture_matches where stage_id = s.id and round_id = row_value->>'round_id'
        and team_a_id = (row_value->>'team_a_id')::uuid and team_b_id is not distinct from (row_value->>'team_b_id')::uuid) then
      raise exception 'Bracket changed on another device. Reload before continuing.';
    end if;
  end loop;
  perform app_private.upsert_owned_fixture_matches(s.id, p_matches);
  insert into public.knockout_brackets(stage_id, rounds, seeding_source, bracket_size, byes)
    values(s.id, p_bracket->'rounds', p_bracket->>'seedingSource', (p_bracket->>'bracketSize')::integer, coalesce((p_bracket->>'byes')::integer,0))
    on conflict(stage_id) do update set rounds = excluded.rounds, updated_at = now();
  update public.fixture_stages set config = config || coalesce(p_config,'{}'), status = case when status = 'COMPLETED' then status else 'IN_PROGRESS' end where id = s.id;
end $$;

create or replace function public.edit_owned_cricket_fixture(p_fixture_id uuid, p_input jsonb, p_manual boolean default false)
returns void language sql security invoker set search_path = '' as $$ select app_private.edit_owned_cricket_fixture(p_fixture_id, p_input, p_manual) $$;
create or replace function public.reset_owned_cricket_fixtures(p_tournament_id uuid, p_knockout_only boolean default false)
returns void language sql security invoker set search_path = '' as $$ select app_private.reset_owned_cricket_fixtures(p_tournament_id, p_knockout_only) $$;
create or replace function public.commit_owned_cricket_bracket(p_stage_id uuid, p_bracket jsonb, p_matches jsonb, p_config jsonb default '{}')
returns void language sql security invoker set search_path = '' as $$ select app_private.commit_owned_cricket_bracket(p_stage_id, p_bracket, p_matches, p_config) $$;
revoke all on function app_private.edit_owned_cricket_fixture(uuid,jsonb,boolean), public.edit_owned_cricket_fixture(uuid,jsonb,boolean),
  app_private.reset_owned_cricket_fixtures(uuid,boolean), public.reset_owned_cricket_fixtures(uuid,boolean),
  app_private.commit_owned_cricket_bracket(uuid,jsonb,jsonb,jsonb), public.commit_owned_cricket_bracket(uuid,jsonb,jsonb,jsonb) from public, anon;
grant execute on function app_private.edit_owned_cricket_fixture(uuid,jsonb,boolean), public.edit_owned_cricket_fixture(uuid,jsonb,boolean),
  app_private.reset_owned_cricket_fixtures(uuid,boolean), public.reset_owned_cricket_fixtures(uuid,boolean),
  app_private.commit_owned_cricket_bracket(uuid,jsonb,jsonb,jsonb), public.commit_owned_cricket_bracket(uuid,jsonb,jsonb,jsonb) to authenticated;

create or replace function app_private.commit_owned_cricket_fixture_plan(p_tournament_id uuid, p_plan jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare
  stage_value jsonb := p_plan->'stage';
  stage_id_value uuid := (stage_value->>'id')::uuid;
  old_stage public.fixture_stages%rowtype;
  group_value jsonb;
  group_ids uuid[] := '{}';
  requested_team_ids uuid[];
  assigned_team_ids uuid[] := '{}';
  parent_id uuid := nullif(stage_value->>'depends_on_stage_id','')::uuid;
  plan_hash text := md5(p_plan::text);
begin
  if jsonb_typeof(p_plan) is distinct from 'object' or jsonb_typeof(p_plan->'stage') is distinct from 'object'
    or jsonb_typeof(p_plan->'groups') is distinct from 'array' or jsonb_typeof(p_plan->'matches') is distinct from 'array'
    or jsonb_typeof(p_plan->'teamIds') is distinct from 'array' then raise exception 'Invalid fixture plan'; end if;
  perform 1 from public.tournaments where id = p_tournament_id and created_by = auth.uid() for update;
  if not found then raise exception 'Only the tournament owner can generate fixtures'; end if;
  select * into old_stage from public.fixture_stages where id = stage_id_value;
  if old_stage.id is not null and old_stage.tournament_id <> p_tournament_id then raise exception 'Stage belongs to another tournament'; end if;
  if old_stage.id is not null and old_stage.creation_request_hash is not null then
    if old_stage.tournament_id <> p_tournament_id or old_stage.creation_request_hash <> plan_hash then raise exception 'Fixture request ID was reused with different details'; end if;
    return;
  end if;
  select array_agg(value::uuid) into requested_team_ids from jsonb_array_elements_text(p_plan->'teamIds');
  if cardinality(requested_team_ids) < 2 or cardinality(requested_team_ids) > 128
    or cardinality(requested_team_ids) <> (select count(distinct id) from unnest(requested_team_ids) id)
    or exists(select 1 from unnest(requested_team_ids) requested(id) where not exists(select 1 from public.teams where teams.id = requested.id and tournament_id = p_tournament_id)) then
    raise exception 'Select eligible tournament teams';
  end if;
  if parent_id is null then
    if exists(select 1 from public.fixture_stages where tournament_id = p_tournament_id) then raise exception 'Fixtures have already been generated for this tournament'; end if;
    if exists(select 1 from public.teams where tournament_id = p_tournament_id and not id = any(requested_team_ids)) then raise exception 'The tournament team list changed. Reload before generating.'; end if;
  else
    if not exists(select 1 from public.fixture_stages where id = parent_id and tournament_id = p_tournament_id and type = 'GROUP') then raise exception 'Generate group fixtures first'; end if;
    if not exists(select 1 from public.fixture_matches where stage_id = parent_id) or exists(
      select 1 from public.fixture_matches f left join public.matches m on m.fixture_match_id = f.id where f.stage_id = parent_id
        and (f.status not in ('COMPLETED','WALKOVER') or (m.id is not null and m.status::text not in ('COMPLETED','ABANDONED')))
    ) then raise exception 'Every group match must be completed before generating knockouts'; end if;
    if old_stage.id is not null and (old_stage.tournament_id <> p_tournament_id or old_stage.type <> 'KNOCKOUT'
      or exists(select 1 from public.fixture_matches where stage_id = old_stage.id)
      or exists(select 1 from public.knockout_brackets where stage_id = old_stage.id)) then raise exception 'Knockout fixtures have already been generated'; end if;
  end if;
  if old_stage.id is null then
    insert into public.fixture_stages(id,tournament_id,stage_order,type,config,depends_on_stage_id,creation_request_hash)
      values(stage_id_value,p_tournament_id,(stage_value->>'stage_order')::integer,stage_value->>'type',stage_value->'config',parent_id,plan_hash);
  else
    update public.fixture_stages set config = stage_value->'config', depends_on_stage_id = parent_id, creation_request_hash = plan_hash where id = stage_id_value;
  end if;
  if jsonb_typeof(p_plan->'groups') <> 'array' or jsonb_array_length(p_plan->'groups') > 128 then raise exception 'Invalid group plan'; end if;
  for group_value in select value from jsonb_array_elements(p_plan->'groups') loop
    if stage_value->>'type' <> 'GROUP' or exists(select 1 from jsonb_array_elements_text(group_value->'team_ids') id
      where not id::uuid = any(requested_team_ids) or id::uuid = any(assigned_team_ids)) then raise exception 'Invalid or duplicate group assignment'; end if;
    select assigned_team_ids || coalesce(array_agg(value::uuid),'{}') into assigned_team_ids from jsonb_array_elements_text(group_value->'team_ids');
    insert into public.fixture_groups(id,stage_id,name,team_ids) values((group_value->>'id')::uuid,stage_id_value,group_value->>'name',array(select value::uuid from jsonb_array_elements_text(group_value->'team_ids')));
    group_ids := array_append(group_ids,(group_value->>'id')::uuid);
  end loop;
  if stage_value->>'type' = 'GROUP' and (cardinality(assigned_team_ids) <> cardinality(requested_team_ids)
    or cardinality(assigned_team_ids) <> (select count(distinct id) from unnest(assigned_team_ids) id)) then raise exception 'Assign every team to a group'; end if;
  if jsonb_typeof(p_plan->'matches') <> 'array' or jsonb_array_length(p_plan->'matches') > 10000 then raise exception 'Invalid fixture plan'; end if;
  if exists(select 1 from jsonb_array_elements(p_plan->'matches') fixture where
    (stage_value->>'type' = 'GROUP' and not exists(select 1 from public.fixture_groups where id = (fixture->>'group_id')::uuid and stage_id = stage_id_value
      and (fixture->>'team_a_id')::uuid = any(team_ids) and (fixture->>'team_b_id')::uuid = any(team_ids)))
    or (fixture->>'status' <> 'SCHEDULED' and not (fixture->>'status' = 'WALKOVER' and fixture->>'team_b_id' is null))
  ) then raise exception 'Fixture plan must contain eligible unstarted pairings'; end if;
  if p_plan->'bracket' is not null and p_plan->'bracket' <> 'null'::jsonb then
    perform app_private.commit_owned_cricket_bracket(stage_id_value,p_plan->'bracket',p_plan->'matches',stage_value->'config');
  else
    perform app_private.upsert_owned_fixture_matches(stage_id_value,p_plan->'matches');
    update public.fixture_stages set status = 'IN_PROGRESS' where id = stage_id_value;
  end if;
  if parent_id is not null then update public.fixture_stages set status = 'COMPLETED' where id = parent_id; end if;
end $$;
create or replace function public.commit_owned_cricket_fixture_plan(p_tournament_id uuid,p_plan jsonb)
returns void language sql security invoker set search_path = '' as $$ select app_private.commit_owned_cricket_fixture_plan(p_tournament_id,p_plan) $$;
revoke all on function app_private.commit_owned_cricket_fixture_plan(uuid,jsonb), public.commit_owned_cricket_fixture_plan(uuid,jsonb) from public, anon;
grant execute on function app_private.commit_owned_cricket_fixture_plan(uuid,jsonb), public.commit_owned_cricket_fixture_plan(uuid,jsonb) to authenticated;
