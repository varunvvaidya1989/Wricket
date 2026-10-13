-- Display names are social metadata. Do not grant broad profile/contact reads.
create function app_private.list_visible_moment_author_names(p_tournament_id uuid)
returns table(profile_id uuid,display_name text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or not app_private.can_view_tournament_social(p_tournament_id) then
    raise exception 'This tournament is unavailable to your account';
  end if;
  return query select p.id,p.display_name from public.profiles p where p.id in (
    select m.author_id from public.match_moments m where m.tournament_id = p_tournament_id and m.status = 'PUBLISHED'
    union
    select c.author_id from public.moment_comments c join public.match_moments m on m.id = c.moment_id
      where m.tournament_id = p_tournament_id and m.status = 'PUBLISHED' and c.status = 'PUBLISHED'
  );
end $$;
create function public.list_visible_moment_author_names(p_tournament_id uuid)
returns table(profile_id uuid,display_name text)
language sql security invoker set search_path = '' as $$
  select * from app_private.list_visible_moment_author_names(p_tournament_id);
$$;
revoke all on function app_private.list_visible_moment_author_names(uuid),public.list_visible_moment_author_names(uuid) from public,anon;
grant execute on function app_private.list_visible_moment_author_names(uuid),public.list_visible_moment_author_names(uuid) to authenticated;
