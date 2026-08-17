-- Harden account-backed membership and registration invariants after the
-- initial non-cricket foundation migration.

alter table public.sport_team_memberships
drop constraint sport_team_memberships_club_membership_id_fkey;

alter table public.sport_team_memberships
alter column club_membership_id set not null,
add constraint sport_team_memberships_club_membership_id_fkey
  foreign key (club_membership_id)
  references public.sport_club_memberships(id)
  on delete restrict;

create or replace function app_private.enforce_account_backed_sport_participant()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare selected_competition_id uuid;
declare selected_division_key text;
declare selected_team_id uuid;
begin
  if tg_op = 'INSERT' and new.sport_profile_id is null then
    raise exception 'Every sport participant must have a SportStage account';
  end if;
  -- ON DELETE SET NULL preserves historical snapshots when an account is
  -- deleted. Authenticated clients have no direct mutation grants.
  if new.sport_profile_id is null then return new; end if;

  if tg_table_name = 'sport_team_memberships' then
    if not exists (
      select 1
      from public.sport_club_memberships club_member
      join public.sport_teams team on team.club_id = club_member.club_id
      where club_member.id = new.club_membership_id
        and team.id = new.team_id
        and club_member.sport_profile_id = new.sport_profile_id
        and club_member.status = 'ACTIVE'
    ) then
      raise exception 'Team membership requires accepted membership in the same club';
    end if;
  elsif tg_table_name = 'sport_squad_members' then
    select squad.competition_id, squad.division_key, squad.source_team_id
      into selected_competition_id, selected_division_key, selected_team_id
    from public.sport_tournament_squads squad
    where squad.entry_id = new.squad_entry_id;

    if not exists (
      select 1
      from public.sport_team_memberships team_member
      where team_member.team_id = selected_team_id
        and team_member.sport_profile_id = new.sport_profile_id
        and team_member.status = 'ACTIVE'
    ) then
      raise exception 'Squad registration requires active reusable-team membership';
    end if;

    perform pg_advisory_xact_lock(hashtextextended(
      selected_competition_id::text || ':' || selected_division_key || ':' || new.sport_profile_id::text,
      0
    ));
  end if;

  return new;
end;
$$;

create trigger sport_club_memberships_account_backed
before insert or update of sport_profile_id on public.sport_club_memberships
for each row execute function app_private.enforce_account_backed_sport_participant();
create trigger sport_team_memberships_account_backed
before insert or update of team_id, sport_profile_id, club_membership_id on public.sport_team_memberships
for each row execute function app_private.enforce_account_backed_sport_participant();
create trigger sport_squad_members_account_backed
before insert or update of squad_entry_id, sport_profile_id on public.sport_squad_members
for each row execute function app_private.enforce_account_backed_sport_participant();
create trigger sport_league_players_account_backed
before insert or update of sport_profile_id on public.sport_league_players
for each row execute function app_private.enforce_account_backed_sport_participant();

revoke all on function app_private.enforce_account_backed_sport_participant()
from public, anon, authenticated;
