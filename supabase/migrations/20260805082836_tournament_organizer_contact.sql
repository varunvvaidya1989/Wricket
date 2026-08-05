create or replace function app_private.get_tournament_organizer_contact(p_tournament_id uuid)
returns table(display_name text, phone text)
language sql security definer set search_path = public
as $$
  select profile.display_name, tournament.organizer_phone
  from public.tournaments tournament
  join public.profiles profile on profile.id = tournament.created_by
  where tournament.id = p_tournament_id
    and (select auth.uid()) is not null
$$;

create or replace function public.get_tournament_organizer_contact(p_tournament_id uuid)
returns table(display_name text, phone text)
language sql security invoker set search_path = public
as $$ select * from app_private.get_tournament_organizer_contact(p_tournament_id) $$;

revoke all on function app_private.get_tournament_organizer_contact(uuid) from public, anon;
revoke all on function public.get_tournament_organizer_contact(uuid) from public, anon;
grant execute on function app_private.get_tournament_organizer_contact(uuid) to authenticated;
grant execute on function public.get_tournament_organizer_contact(uuid) to authenticated;
