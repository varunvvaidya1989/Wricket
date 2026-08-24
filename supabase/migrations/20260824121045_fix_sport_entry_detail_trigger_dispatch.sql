create or replace function app_private.validate_sport_entry_detail()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare selected_entry public.sport_competition_entries%rowtype;
declare selected_competition public.sport_competitions%rowtype;
declare selected_entry_id uuid;
declare squad_count integer;
declare player_count integer;
begin
  if tg_table_name = 'sport_competition_entries' then
    selected_entry_id := coalesce(new.id, old.id);
  elsif tg_table_name in ('sport_tournament_squads', 'sport_league_players') then
    selected_entry_id := coalesce(new.entry_id, old.entry_id);
  else
    raise exception 'Unsupported sport entry detail table: %', tg_table_name;
  end if;

  select * into selected_entry
  from public.sport_competition_entries entry where entry.id = selected_entry_id;
  if not found then return null; end if;

  select * into selected_competition
  from public.sport_competitions competition where competition.id = selected_entry.competition_id;
  select count(*) into squad_count
  from public.sport_tournament_squads squad where squad.entry_id = selected_entry.id;
  select count(*) into player_count
  from public.sport_league_players player where player.entry_id = selected_entry.id;

  if selected_competition.kind = 'TOURNAMENT'
    and (selected_entry.entry_kind <> 'SQUAD' or squad_count <> 1 or player_count <> 0) then
    raise exception 'Tournament entries must contain exactly one squad';
  end if;
  if squad_count = 1 and exists (
    select 1
    from public.sport_tournament_squads squad
    join public.sport_teams team on team.id = squad.source_team_id
    join public.sport_clubs club on club.id = team.club_id
    where squad.entry_id = selected_entry.id
      and (
        squad.competition_id <> selected_entry.competition_id
        or squad.division_key <> selected_entry.division_key
        or club.sport_id <> selected_competition.sport_id
      )
  ) then
    raise exception 'Tournament squad must match the entry division and competition sport';
  end if;
  if selected_competition.kind = 'LEAGUE'
    and (selected_entry.entry_kind <> 'PLAYER' or player_count <> 1 or squad_count <> 0) then
    raise exception 'League entries must contain exactly one player';
  end if;
  if player_count = 1 and exists (
    select 1
    from public.sport_league_players player
    where player.entry_id = selected_entry.id
      and (
        player.competition_id <> selected_entry.competition_id
        or player.division_key <> selected_entry.division_key
      )
  ) then
    raise exception 'League player must match the entry division';
  end if;
  return null;
end;
$$;

revoke all on function app_private.validate_sport_entry_detail()
from public, anon, authenticated;

comment on function app_private.validate_sport_entry_detail() is
  'Validates deferred tournament and league entry detail using table-specific trigger row fields.';
