-- Phase 3 review correction: competition ownership does not grant authority to
-- disclose or snapshot an unrelated team's roster. Only a team controller may
-- submit that team for tournament registration.

create or replace function public.register_sport_tournament_squad(
  p_competition_id uuid,
  p_team_id uuid,
  p_division_key text default 'OPEN'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
begin
  if not app_private.can_manage_sport_team(p_team_id) then
    raise exception 'Only the team owner, manager, or captain can submit this squad';
  end if;

  return app_private.register_sport_tournament_squad(
    p_competition_id,
    p_team_id,
    p_division_key
  );
end;
$$;

revoke all on function public.register_sport_tournament_squad(uuid, uuid, text)
from public, anon;
grant execute on function public.register_sport_tournament_squad(uuid, uuid, text)
to authenticated;

comment on function public.register_sport_tournament_squad(uuid, uuid, text) is
  'Registers a reusable team only when the caller is that team owner, manager, or captain; competition authority alone is insufficient.';
