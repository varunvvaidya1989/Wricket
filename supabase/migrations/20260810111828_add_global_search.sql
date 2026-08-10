create or replace function app_private.global_search(
  p_query text,
  p_type text default null,
  p_limit integer default 40
) returns table (
  entity_type text,
  entity_id uuid,
  title text,
  subtitle text,
  image_url text,
  player_id uuid,
  occurred_at timestamptz,
  metadata jsonb,
  relevance integer
)
language plpgsql stable security definer set search_path = public
as $$
declare
  clean_query text := trim(p_query);
  clean_type text := upper(coalesce(p_type, 'ALL'));
  safe_limit integer := least(greatest(p_limit, 1), 50);
begin
  if (select auth.uid()) is null then raise exception 'Authentication is required'; end if;
  if length(clean_query) < 2 then return; end if;
  if clean_type not in ('ALL', 'TOURNAMENT', 'MATCH', 'USER', 'SCORER') then
    raise exception 'Unsupported search type';
  end if;

  return query
  with candidates as (
    select
      'TOURNAMENT'::text as result_type,
      tournament.id as result_id,
      tournament.name as result_title,
      concat_ws(' · ', tournament.format, nullif(tournament.location, '')) as result_subtitle,
      tournament.logo_url as result_image,
      null::uuid as result_player_id,
      coalesce(tournament.start_at, tournament.start_date::timestamptz) as result_date,
      jsonb_build_object('format', tournament.format) as result_metadata,
      case
        when lower(tournament.name) = lower(clean_query) then 0
        when lower(tournament.name) like lower(clean_query) || '%' then 1
        else 2
      end as result_relevance
    from public.tournaments tournament
    where clean_type in ('ALL', 'TOURNAMENT')
      and (tournament.name ilike '%' || clean_query || '%'
        or coalesce(tournament.location, '') ilike '%' || clean_query || '%')

    union all

    select
      'MATCH', match.id,
      team_a.name || ' vs ' || team_b.name,
      concat_ws(' · ', tournament.name, replace(match.status::text, '_', ' '),
        nullif(coalesce(match.venue, match.field_name), '')),
      null, null,
      coalesce(match.scheduled_at, match.created_at),
      jsonb_build_object('status', match.status::text, 'tournament_id', match.tournament_id),
      case
        when lower(team_a.name || ' vs ' || team_b.name) = lower(clean_query) then 0
        when lower(team_a.name) like lower(clean_query) || '%'
          or lower(team_b.name) like lower(clean_query) || '%' then 1
        else 2
      end
    from public.matches match
    join public.teams team_a on team_a.id = match.team_a_id
    join public.teams team_b on team_b.id = match.team_b_id
    left join public.tournaments tournament on tournament.id = match.tournament_id
    where clean_type in ('ALL', 'MATCH')
      and (team_a.name ilike '%' || clean_query || '%'
        or team_b.name ilike '%' || clean_query || '%'
        or coalesce(tournament.name, '') ilike '%' || clean_query || '%'
        or coalesce(match.venue, '') ilike '%' || clean_query || '%'
        or coalesce(match.field_name, '') ilike '%' || clean_query || '%')

    union all

    select
      'USER', profile.id, profile.display_name,
      coalesce(nullif(replace(player.role, 'AR', 'ALL-ROUNDER'), ''), 'WRICKET MEMBER'),
      coalesce(profile.avatar_url, player.image_url), player.id,
      profile.created_at,
      jsonb_build_object('role', coalesce(player.role, 'MEMBER')),
      case
        when lower(profile.display_name) = lower(clean_query) then 0
        when lower(profile.display_name) like lower(clean_query) || '%' then 1
        else 2
      end
    from public.profiles profile
    left join public.players player on player.profile_id = profile.id
    where clean_type in ('ALL', 'USER')
      and profile.display_name ilike '%' || clean_query || '%'

    union all

    select
      'SCORER', profile.id, profile.display_name,
      case scorer.availability_status when 'AVAILABLE' then 'AVAILABLE TO SCORE' else 'SCORER' end,
      coalesce(profile.avatar_url, player.image_url), player.id,
      scorer.created_at,
      jsonb_build_object('availability', scorer.availability_status),
      case
        when lower(profile.display_name) = lower(clean_query) then 0
        when lower(profile.display_name) like lower(clean_query) || '%' then 1
        else 2
      end
    from public.scorers scorer
    join public.profiles profile on profile.id = scorer.profile_id
    left join public.players player on player.profile_id = profile.id
    where clean_type in ('ALL', 'SCORER')
      and profile.display_name ilike '%' || clean_query || '%'
  )
  select result_type, result_id, result_title, result_subtitle, result_image,
    result_player_id, result_date, result_metadata, result_relevance
  from candidates
  order by result_relevance, result_date desc nulls last, result_title
  limit safe_limit;
end;
$$;

create or replace function app_private.get_search_profile(p_profile_id uuid)
returns table (
  account_id uuid,
  display_name text,
  avatar_url text,
  is_scorer boolean,
  availability_status text,
  player_id uuid,
  player_role text
)
language plpgsql stable security definer set search_path = public
as $$
begin
  if (select auth.uid()) is null then raise exception 'Authentication is required'; end if;
  return query
  select profile.id, profile.display_name, coalesce(profile.avatar_url, player.image_url),
    scorer.id is not null, scorer.availability_status, player.id, player.role
  from public.profiles profile
  left join public.scorers scorer on scorer.profile_id = profile.id
  left join public.players player on player.profile_id = profile.id
  where profile.id = p_profile_id;
end;
$$;

create or replace function public.global_search(p_query text, p_type text default null, p_limit integer default 40)
returns table (entity_type text, entity_id uuid, title text, subtitle text, image_url text,
  player_id uuid, occurred_at timestamptz, metadata jsonb, relevance integer)
language sql stable security invoker set search_path = public
as $$ select * from app_private.global_search(p_query, p_type, p_limit) $$;

create or replace function public.get_search_profile(p_profile_id uuid)
returns table (account_id uuid, display_name text, avatar_url text, is_scorer boolean,
  availability_status text, player_id uuid, player_role text)
language sql stable security invoker set search_path = public
as $$ select * from app_private.get_search_profile(p_profile_id) $$;

revoke all on function app_private.global_search(text, text, integer) from public, anon;
revoke all on function app_private.get_search_profile(uuid) from public, anon;
revoke all on function public.global_search(text, text, integer) from public, anon;
revoke all on function public.get_search_profile(uuid) from public, anon;
grant execute on function app_private.global_search(text, text, integer) to authenticated;
grant execute on function app_private.get_search_profile(uuid) to authenticated;
grant execute on function public.global_search(text, text, integer) to authenticated;
grant execute on function public.get_search_profile(uuid) to authenticated;
