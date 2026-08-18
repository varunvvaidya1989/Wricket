-- Phase 3 review correction: public competition visibility must not expose
-- private registration decisions or roster snapshots. Approved entrants remain
-- visible to authenticated competition readers; managers and entry controllers
-- retain access to every state for entries they are authorized to manage.

create or replace function app_private.can_read_sport_entry(p_entry_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.sport_competition_entries entry
    where entry.id = p_entry_id
      and (
        app_private.can_control_sport_entry(entry.id)
        or (
          entry.status = 'APPROVED'
          and app_private.can_read_sport_competition(entry.competition_id)
        )
      )
  )
$$;

drop policy if exists "sport_competition_entries_read_authorized"
on public.sport_competition_entries;
create policy "sport_competition_entries_read_authorized"
on public.sport_competition_entries for select to authenticated
using ((select app_private.can_read_sport_entry(id)));

drop policy if exists "sport_tournament_squads_read_authorized"
on public.sport_tournament_squads;
create policy "sport_tournament_squads_read_authorized"
on public.sport_tournament_squads for select to authenticated
using ((select app_private.can_read_sport_entry(entry_id)));

drop policy if exists "sport_squad_members_read_authorized"
on public.sport_squad_members;
create policy "sport_squad_members_read_authorized"
on public.sport_squad_members for select to authenticated
using ((select app_private.can_read_sport_entry(squad_entry_id)));

drop policy if exists "sport_league_players_read_authorized"
on public.sport_league_players;
create policy "sport_league_players_read_authorized"
on public.sport_league_players for select to authenticated
using ((select app_private.can_read_sport_entry(entry_id)));

revoke all on function app_private.can_read_sport_entry(uuid)
from public, anon, authenticated;
grant execute on function app_private.can_read_sport_entry(uuid) to authenticated;

comment on function app_private.can_read_sport_entry(uuid) is
  'Allows managers and entry controllers to read private registration states while exposing only approved entrants to other authenticated competition readers.';
