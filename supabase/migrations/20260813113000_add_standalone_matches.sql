-- Friendly matches use the same authoritative scoring pipeline as tournament
-- matches, but are owned directly by the account that creates them.

create or replace function app_private.is_standalone_team_eligible(
  p_team_id uuid,
  p_account_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  with selected_team as (
    select id, source_team_id from public.teams where id = p_team_id
  ), family as (
    select team.id
    from public.teams team
    cross join selected_team selected
    where team.id = selected.id
      or team.id = selected.source_team_id
      or team.source_team_id = selected.id
      or (selected.source_team_id is not null and team.source_team_id = selected.source_team_id)
  )
  select exists (
    select 1
    from public.teams team
    where team.id in (select id from family)
      and (
        team.entity_owner_id = p_account_id
        or exists (
          select 1 from public.team_account_members member
          where member.team_id = team.id
            and member.account_id = p_account_id
            and member.status = 'ACTIVE'
        )
      )
  ) or exists (
    select 1
    from public.matches match
    join public.match_xis xi on xi.match_id = match.id
    join public.players player on player.id = xi.player_id
    where match.tournament_id is not null
      and match.status in ('IN_PROGRESS', 'INNINGS_BREAK', 'FOLLOW_ON_DECISION', 'COMPLETED')
      and (match.team_a_id in (select id from family) or match.team_b_id in (select id from family))
      and (player.profile_id = p_account_id or player.created_by = p_account_id)
  );
$$;

create or replace function app_private.can_manage_match(p_match_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.matches match
    where match.id = p_match_id
      and (
        (match.tournament_id is null and match.created_by = (select auth.uid()))
        or exists (
          select 1 from public.tournament_members member
          where member.tournament_id = match.tournament_id
            and member.account_id = (select auth.uid())
            and member.role in ('OWNER', 'ADMIN', 'SCORER')
            and member.status = 'ACTIVE'
        )
      )
  );
$$;

create or replace function app_private.can_access_standalone_match(p_match_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.matches match
    where match.id = p_match_id
      and match.tournament_id is null
      and (
        match.created_by = (select auth.uid())
        or exists (
          select 1 from public.team_account_members member
          where member.team_id in (match.team_a_id, match.team_b_id)
            and member.account_id = (select auth.uid())
            and member.status = 'ACTIVE'
        )
      )
  );
$$;

revoke all on function app_private.is_standalone_team_eligible(uuid, uuid) from public, anon;
revoke all on function app_private.can_manage_match(uuid) from public, anon;
revoke all on function app_private.can_access_standalone_match(uuid) from public, anon;
grant execute on function app_private.is_standalone_team_eligible(uuid, uuid) to authenticated;
grant execute on function app_private.can_manage_match(uuid) to authenticated;
grant execute on function app_private.can_access_standalone_match(uuid) to authenticated;

create or replace function app_private.list_standalone_match_teams()
returns table (
  team_id uuid,
  team_name text,
  short_name text,
  color_hex text,
  logo_url text,
  eligibility_reason text
)
language sql
stable
security definer
set search_path = public
as $$
  with eligible as (
    select team.id,
      coalesce(team.source_team_id, team.id) as canonical_id,
      case
        when team.entity_owner_id = (select auth.uid()) or exists (
          select 1 from public.team_account_members member
          where member.team_id = team.id
            and member.account_id = (select auth.uid())
            and member.status = 'ACTIVE'
        ) then 'MY_TEAM'
        else 'PLAYED_AGAINST'
      end as reason
    from public.teams team
    where app_private.is_standalone_team_eligible(team.id, (select auth.uid()))
  ), ranked as (
    select eligible.*,
      row_number() over (
        partition by canonical_id
        order by case when reason = 'MY_TEAM' then 0 else 1 end, id
      ) as rank
    from eligible
  )
  select canonical.id, canonical.name, canonical.short_name, canonical.color_hex,
    canonical.logo_url, ranked.reason
  from ranked
  join public.teams canonical on canonical.id = ranked.canonical_id
  where ranked.rank = 1
  order by case when ranked.reason = 'MY_TEAM' then 0 else 1 end, lower(canonical.name)
  limit 100;
$$;

create or replace function public.list_standalone_match_teams()
returns table (
  team_id uuid,
  team_name text,
  short_name text,
  color_hex text,
  logo_url text,
  eligibility_reason text
)
language sql
security invoker
set search_path = public
as $$ select * from app_private.list_standalone_match_teams() $$;

revoke all on function app_private.list_standalone_match_teams() from public, anon;
revoke all on function public.list_standalone_match_teams() from public, anon;
grant execute on function app_private.list_standalone_match_teams() to authenticated;
grant execute on function public.list_standalone_match_teams() to authenticated;

drop policy if exists "matches_write_standalone_creator" on public.matches;
create policy "matches_write_standalone_creator"
on public.matches for all
to authenticated
using (
  tournament_id is null
  and created_by = (select auth.uid())
)
with check (
  tournament_id is null
  and created_by = (select auth.uid())
  and app_private.is_standalone_team_eligible(team_a_id, (select auth.uid()))
  and app_private.is_standalone_team_eligible(team_b_id, (select auth.uid()))
);

create policy "match_xis_read_standalone_participant"
on public.match_xis for select to authenticated
using ((select app_private.can_access_standalone_match(match_id)));

create policy "match_innings_read_standalone_participant"
on public.match_innings for select to authenticated
using ((select app_private.can_access_standalone_match(match_id)));

create policy "match_events_read_standalone_participant"
on public.match_events for select to authenticated
using ((select app_private.can_access_standalone_match(match_id)));

create policy "match_snapshots_read_standalone_participant"
on public.match_snapshots for select to authenticated
using ((select app_private.can_access_standalone_match(match_id)));

create or replace function app_private.start_match_setup(
  p_match_id uuid,
  p_team_a_xi jsonb,
  p_team_b_xi jsonb,
  p_toss_winner_team_id uuid,
  p_toss_choice text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  selected_match public.matches%rowtype;
  innings_id uuid;
  batting_team_id uuid;
  bowling_team_id uuid;
begin
  if (select auth.uid()) is null then raise exception 'Authentication is required'; end if;

  select * into selected_match from public.matches where id = p_match_id for update;
  if not found then raise exception 'Match not found'; end if;
  if not app_private.can_manage_match(p_match_id) then
    raise exception 'You are not authorised to start this match';
  end if;

  if selected_match.status = 'IN_PROGRESS' then
    select id into innings_id from public.match_innings
    where match_id = p_match_id and sequence = 1;
    return jsonb_build_object(
      'match_id', selected_match.id,
      'innings_id', innings_id,
      'status', selected_match.status
    );
  end if;
  if selected_match.status not in ('SCHEDULED', 'SETUP') then
    raise exception 'Match cannot be started from status %', selected_match.status;
  end if;
  if p_toss_choice not in ('BAT', 'BOWL') then raise exception 'Invalid toss choice'; end if;
  if p_toss_winner_team_id not in (selected_match.team_a_id, selected_match.team_b_id) then
    raise exception 'Toss winner must be one of the match teams';
  end if;
  if jsonb_typeof(p_team_a_xi) <> 'array'
    or jsonb_typeof(p_team_b_xi) <> 'array'
    or jsonb_array_length(p_team_a_xi) = 0
    or jsonb_array_length(p_team_b_xi) = 0 then
    raise exception 'Both playing XIs are required';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_team_a_xi)
      as player(player_id uuid, batting_order integer, is_captain boolean, is_keeper boolean)
    left join public.team_players membership
      on membership.team_id = selected_match.team_a_id and membership.player_id = player.player_id
    where membership.player_id is null or player.batting_order is null or player.batting_order < 1
  ) or exists (
    select 1
    from jsonb_to_recordset(p_team_b_xi)
      as player(player_id uuid, batting_order integer, is_captain boolean, is_keeper boolean)
    left join public.team_players membership
      on membership.team_id = selected_match.team_b_id and membership.player_id = player.player_id
    where membership.player_id is null or player.batting_order is null or player.batting_order < 1
  ) then
    raise exception 'Every selected player must belong to the corresponding team';
  end if;

  delete from public.match_xis where match_id = p_match_id;
  insert into public.match_xis(match_id, team_id, player_id, batting_order, is_captain, is_keeper)
  select p_match_id, selected_match.team_a_id, player.player_id, player.batting_order,
    coalesce(player.is_captain, false), coalesce(player.is_keeper, false)
  from jsonb_to_recordset(p_team_a_xi)
    as player(player_id uuid, batting_order integer, is_captain boolean, is_keeper boolean);
  insert into public.match_xis(match_id, team_id, player_id, batting_order, is_captain, is_keeper)
  select p_match_id, selected_match.team_b_id, player.player_id, player.batting_order,
    coalesce(player.is_captain, false), coalesce(player.is_keeper, false)
  from jsonb_to_recordset(p_team_b_xi)
    as player(player_id uuid, batting_order integer, is_captain boolean, is_keeper boolean);

  if p_toss_choice = 'BAT' then
    batting_team_id := p_toss_winner_team_id;
  elsif p_toss_winner_team_id = selected_match.team_a_id then
    batting_team_id := selected_match.team_b_id;
  else
    batting_team_id := selected_match.team_a_id;
  end if;
  bowling_team_id := case
    when batting_team_id = selected_match.team_a_id then selected_match.team_b_id
    else selected_match.team_a_id
  end;

  insert into public.match_innings(match_id, sequence, batting_team_id, bowling_team_id, status)
  values (p_match_id, 1, batting_team_id, bowling_team_id, 'IN_PROGRESS')
  on conflict (match_id, sequence) do update set
    batting_team_id = excluded.batting_team_id,
    bowling_team_id = excluded.bowling_team_id,
    status = 'IN_PROGRESS',
    updated_at = now()
  returning id into innings_id;

  update public.matches set toss_winner_team_id = p_toss_winner_team_id,
    toss_choice = p_toss_choice, status = 'IN_PROGRESS', updated_at = now()
  where id = p_match_id;

  insert into public.audit_logs(actor_id, entity_type, entity_id, action, details)
  values ((select auth.uid()), 'MATCH', p_match_id, 'MATCH_STARTED', jsonb_build_object(
    'innings_id', innings_id, 'batting_team_id', batting_team_id, 'bowling_team_id', bowling_team_id
  ));

  return jsonb_build_object(
    'match_id', p_match_id,
    'innings_id', innings_id,
    'status', 'IN_PROGRESS',
    'batting_team_id', batting_team_id,
    'bowling_team_id', bowling_team_id
  );
end;
$$;

create or replace function app_private.acquire_scoring_lease(
  p_match_id uuid,
  p_device_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  existing_lease public.scoring_leases%rowtype;
  new_token text := gen_random_uuid()::text;
  new_expiry timestamptz := now() + interval '2 minutes';
begin
  if (select auth.uid()) is null then raise exception 'Authentication is required'; end if;
  if nullif(trim(p_device_id), '') is null then raise exception 'Device ID is required'; end if;
  if not app_private.can_manage_match(p_match_id) or not exists (
    select 1 from public.matches match
    where match.id = p_match_id
      and match.status in ('IN_PROGRESS', 'INNINGS_BREAK', 'FOLLOW_ON_DECISION')
  ) then
    raise exception 'You are not authorised to score this match';
  end if;

  select * into existing_lease from public.scoring_leases
  where match_id = p_match_id for update;
  if found and existing_lease.expires_at > now() and (
    existing_lease.account_id <> (select auth.uid())
    or existing_lease.device_id is distinct from p_device_id
  ) then
    raise exception 'Another scorer currently holds this match';
  end if;

  insert into public.scoring_leases(match_id, account_id, lease_token, device_id, expires_at, updated_at)
  values (p_match_id, (select auth.uid()), new_token, p_device_id, new_expiry, now())
  on conflict (match_id) do update set account_id = excluded.account_id,
    lease_token = excluded.lease_token, device_id = excluded.device_id,
    expires_at = excluded.expires_at, updated_at = now();
  return jsonb_build_object('lease_token', new_token, 'expires_at', new_expiry);
end;
$$;

create or replace function app_private.list_eligible_live_matches(
  p_cursor_updated_at timestamptz default null,
  p_cursor_id uuid default null,
  p_limit integer default 8
)
returns table (match_id uuid, eligibility_reason text, match_updated_at timestamptz)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if (select auth.uid()) is null then raise exception 'Authentication is required'; end if;
  return query
  select match.id,
    case
      when match.created_by = (select auth.uid()) then 'OWNER'
      when exists (
        select 1 from public.team_account_members member
        where member.team_id in (match.team_a_id, match.team_b_id)
          and member.account_id = (select auth.uid()) and member.status = 'ACTIVE'
      ) then 'MY_TEAM'
      when exists (
        select 1 from public.tournament_members member
        where member.tournament_id = match.tournament_id
          and member.account_id = (select auth.uid()) and member.status = 'ACTIVE'
      ) then 'TOURNAMENT_MEMBER'
      else 'FOLLOWING'
    end,
    match.updated_at
  from public.matches match
  left join public.tournaments tournament on tournament.id = match.tournament_id
  where match.status in ('IN_PROGRESS', 'INNINGS_BREAK', 'FOLLOW_ON_DECISION')
    and (
      (match.tournament_id is null and (
        match.created_by = (select auth.uid())
        or exists (
          select 1 from public.team_account_members member
          where member.team_id in (match.team_a_id, match.team_b_id)
            and member.account_id = (select auth.uid()) and member.status = 'ACTIVE'
        )
      ))
      or (match.tournament_id is not null and (
        tournament.created_by = (select auth.uid())
        or exists (
          select 1 from public.tournament_members member
          where member.tournament_id = tournament.id
            and member.account_id = (select auth.uid()) and member.status = 'ACTIVE'
        )
        or exists (
          select 1 from public.teams team
          join public.team_account_members member on member.team_id = team.id
          where team.tournament_id = tournament.id
            and member.account_id = (select auth.uid()) and member.status = 'ACTIVE'
        )
        or exists (
          select 1 from public.tournament_follows follow
          where follow.tournament_id = tournament.id
            and follow.account_id = (select auth.uid()) and follow.status = 'ACTIVE'
        )
      ))
    )
    and (p_cursor_updated_at is null or (match.updated_at, match.id) < (p_cursor_updated_at, p_cursor_id))
  order by match.updated_at desc, match.id desc
  limit least(greatest(p_limit, 1), 20);
end;
$$;
