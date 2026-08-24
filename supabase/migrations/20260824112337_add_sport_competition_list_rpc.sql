create or replace function app_private.list_sport_competitions(p_sport_code text)
returns setof public.sport_competitions
language sql
stable
security definer
set search_path = public
as $$
  select competition.*
  from public.sport_competitions competition
  join public.sports sport on sport.id = competition.sport_id
  where sport.code = upper(trim(p_sport_code))
    and app_private.can_read_sport_competition(competition.id)
  order by competition.updated_at desc, competition.created_at desc
$$;

create or replace function public.list_sport_competitions(p_sport_code text)
returns setof public.sport_competitions
language sql
stable
security definer
set search_path = public
as $$
  select * from app_private.list_sport_competitions(p_sport_code)
$$;

revoke all on function app_private.list_sport_competitions(text)
  from public, anon, authenticated;
revoke all on function public.list_sport_competitions(text)
  from public, anon;
grant execute on function public.list_sport_competitions(text)
  to authenticated;

comment on function public.list_sport_competitions(text) is
  'Lists competitions visible to the signed-in account for one sport, including owned drafts.';
