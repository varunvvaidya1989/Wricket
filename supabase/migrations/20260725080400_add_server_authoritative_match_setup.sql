alter table public.matches
add column toss_winner_team_id uuid references public.teams(id) on delete restrict,
add column toss_choice text check (toss_choice in ('BAT', 'BOWL'));

create table public.match_xis (
  match_id uuid not null references public.matches(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete restrict,
  player_id uuid not null references public.players(id) on delete restrict,
  batting_order integer not null check (batting_order > 0),
  is_captain boolean not null default false,
  is_keeper boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (match_id, team_id, player_id),
  unique (match_id, team_id, batting_order)
);

create table public.match_innings (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on delete cascade,
  sequence integer not null check (sequence between 1 and 4),
  batting_team_id uuid not null references public.teams(id) on delete restrict,
  bowling_team_id uuid not null references public.teams(id) on delete restrict,
  status text not null default 'IN_PROGRESS'
    check (status in ('PENDING', 'IN_PROGRESS', 'COMPLETED')),
  target integer check (target is null or target >= 0),
  is_follow_on boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (match_id, sequence),
  check (batting_team_id <> bowling_team_id)
);

create index match_xis_match_team_idx on public.match_xis(match_id, team_id);
create index match_innings_match_sequence_idx on public.match_innings(match_id, sequence);

alter table public.match_xis enable row level security;
alter table public.match_innings enable row level security;

create policy "match_xis_read_allowed_match"
on public.match_xis for select
to authenticated
using (
  exists (
    select 1 from public.matches match
    where match.id = match_xis.match_id
      and (
        match.visibility = 'PUBLIC'
        or exists (
          select 1 from public.tournament_members member
          where member.tournament_id = match.tournament_id
            and member.account_id = (select auth.uid())
            and member.status = 'ACTIVE'
        )
      )
  )
);

create policy "match_innings_read_allowed_match"
on public.match_innings for select
to authenticated
using (
  exists (
    select 1 from public.matches match
    where match.id = match_innings.match_id
      and (
        match.visibility = 'PUBLIC'
        or exists (
          select 1 from public.tournament_members member
          where member.tournament_id = match.tournament_id
            and member.account_id = (select auth.uid())
            and member.status = 'ACTIVE'
        )
      )
  )
);

grant select on public.match_xis, public.match_innings to authenticated;
revoke insert, update, delete on public.match_xis, public.match_innings from anon, authenticated;

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
  if (select auth.uid()) is null then
    raise exception 'Authentication is required';
  end if;

  select *
  into selected_match
  from public.matches
  where id = p_match_id
  for update;

  if not found then
    raise exception 'Match not found';
  end if;

  if not exists (
    select 1
    from public.tournament_members member
    where member.tournament_id = selected_match.tournament_id
      and member.account_id = (select auth.uid())
      and member.role in ('OWNER', 'ADMIN', 'SCORER')
      and member.status = 'ACTIVE'
  ) then
    raise exception 'You are not authorised to start this match';
  end if;

  if selected_match.status = 'IN_PROGRESS' then
    select id into innings_id
    from public.match_innings
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

  if p_toss_choice not in ('BAT', 'BOWL') then
    raise exception 'Invalid toss choice';
  end if;

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
      on membership.team_id = selected_match.team_a_id
      and membership.player_id = player.player_id
    where membership.player_id is null
      or player.batting_order is null
      or player.batting_order < 1
  ) or exists (
    select 1
    from jsonb_to_recordset(p_team_b_xi)
      as player(player_id uuid, batting_order integer, is_captain boolean, is_keeper boolean)
    left join public.team_players membership
      on membership.team_id = selected_match.team_b_id
      and membership.player_id = player.player_id
    where membership.player_id is null
      or player.batting_order is null
      or player.batting_order < 1
  ) then
    raise exception 'Every selected player must belong to the corresponding team';
  end if;

  delete from public.match_xis where match_id = p_match_id;

  insert into public.match_xis (
    match_id, team_id, player_id, batting_order, is_captain, is_keeper
  )
  select
    p_match_id,
    selected_match.team_a_id,
    player.player_id,
    player.batting_order,
    coalesce(player.is_captain, false),
    coalesce(player.is_keeper, false)
  from jsonb_to_recordset(p_team_a_xi)
    as player(player_id uuid, batting_order integer, is_captain boolean, is_keeper boolean);

  insert into public.match_xis (
    match_id, team_id, player_id, batting_order, is_captain, is_keeper
  )
  select
    p_match_id,
    selected_match.team_b_id,
    player.player_id,
    player.batting_order,
    coalesce(player.is_captain, false),
    coalesce(player.is_keeper, false)
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

  insert into public.match_innings (
    match_id, sequence, batting_team_id, bowling_team_id, status
  )
  values (p_match_id, 1, batting_team_id, bowling_team_id, 'IN_PROGRESS')
  on conflict (match_id, sequence) do update
  set
    batting_team_id = excluded.batting_team_id,
    bowling_team_id = excluded.bowling_team_id,
    status = 'IN_PROGRESS',
    updated_at = now()
  returning id into innings_id;

  update public.matches
  set
    toss_winner_team_id = p_toss_winner_team_id,
    toss_choice = p_toss_choice,
    status = 'IN_PROGRESS',
    updated_at = now()
  where id = p_match_id;

  insert into public.audit_logs(actor_id, entity_type, entity_id, action, details)
  values (
    (select auth.uid()),
    'MATCH',
    p_match_id,
    'MATCH_STARTED',
    jsonb_build_object(
      'innings_id', innings_id,
      'batting_team_id', batting_team_id,
      'bowling_team_id', bowling_team_id
    )
  );

  return jsonb_build_object(
    'match_id', p_match_id,
    'innings_id', innings_id,
    'status', 'IN_PROGRESS',
    'batting_team_id', batting_team_id,
    'bowling_team_id', bowling_team_id
  );
end;
$$;

revoke all on function app_private.start_match_setup(uuid, jsonb, jsonb, uuid, text)
from public, anon;
grant execute on function app_private.start_match_setup(uuid, jsonb, jsonb, uuid, text)
to authenticated;

create or replace function public.start_match_setup(
  p_match_id uuid,
  p_team_a_xi jsonb,
  p_team_b_xi jsonb,
  p_toss_winner_team_id uuid,
  p_toss_choice text
)
returns jsonb
language sql
security invoker
set search_path = public
as $$
  select app_private.start_match_setup(
    p_match_id,
    p_team_a_xi,
    p_team_b_xi,
    p_toss_winner_team_id,
    p_toss_choice
  );
$$;

revoke all on function public.start_match_setup(uuid, jsonb, jsonb, uuid, text)
from public, anon;
grant execute on function public.start_match_setup(uuid, jsonb, jsonb, uuid, text)
to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'match_innings'
  ) then
    alter publication supabase_realtime add table public.match_innings;
  end if;
end;
$$;
