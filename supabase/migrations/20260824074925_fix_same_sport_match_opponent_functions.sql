create or replace function app_private.search_sport_players(
  p_sport_code text,
  p_query text,
  p_limit integer default 20
)
returns table(
  sport_profile_id uuid,
  account_id uuid,
  display_name text,
  avatar_url text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  requester public.sport_profiles%rowtype;
  clean_query text := pg_catalog.btrim(coalesce(p_query, ''));
begin
  requester := app_private.require_active_sport_profile(p_sport_code);
  if pg_catalog.length(clean_query) = 1 then return; end if;

  return query
  select profile.id, profile.account_id, profile.display_name, profile.avatar_url
  from public.sport_profiles profile
  join public.account_sports account_sport
    on account_sport.account_id = profile.account_id
    and account_sport.sport_id = profile.sport_id
    and account_sport.access_status = 'ACTIVE'
  where profile.sport_id = requester.sport_id
    and profile.status = 'ACTIVE'
    and profile.account_id <> (select auth.uid())
    and (clean_query = '' or profile.display_name ilike '%' || clean_query || '%')
  order by
    case when clean_query = '' then 0
      else extensions.similarity(profile.display_name, clean_query)
    end desc,
    profile.display_name,
    profile.id
  limit least(greatest(coalesce(p_limit, 20), 1), 40);
end;
$$;

create or replace function app_private.create_standalone_sport_scoring_match(
  p_sport_code text,
  p_match_format text,
  p_side_a_profile_ids uuid[],
  p_side_b_profile_ids uuid[],
  p_rules_snapshot jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_sport public.sports%rowtype;
  match_id_value uuid;
  normalized_format text := pg_catalog.upper(pg_catalog.btrim(p_match_format));
  expected_players integer;
  side_a_names jsonb;
  side_b_names jsonb;
begin
  if (select auth.uid()) is null then raise exception 'Authentication is required'; end if;

  select * into selected_sport
  from public.sports
  where code = pg_catalog.upper(pg_catalog.btrim(p_sport_code));
  if not found then raise exception 'Sport was not found'; end if;

  if not exists (
    select 1 from public.account_sports
    where account_id = (select auth.uid())
      and sport_id = selected_sport.id
      and access_status = 'ACTIVE'
  ) then
    raise exception 'This sport is not available to your account';
  end if;

  if normalized_format not in ('SINGLES', 'DOUBLES')
    or pg_catalog.jsonb_typeof(p_rules_snapshot) <> 'object' then
    raise exception 'Invalid sport scoring match setup';
  end if;
  expected_players := case when normalized_format = 'SINGLES' then 1 else 2 end;

  if not exists (
    select 1
    from pg_catalog.unnest(p_side_a_profile_ids || p_side_b_profile_ids) requested(profile_id)
    join public.sport_profiles profile on profile.id = requested.profile_id
    where profile.account_id = (select auth.uid())
      and profile.sport_id = selected_sport.id
      and profile.status = 'ACTIVE'
  ) then
    raise exception 'You must be one of the players in a standalone match';
  end if;

  select pg_catalog.jsonb_agg(profile.display_name order by requested.ordinality)
  into side_a_names
  from pg_catalog.unnest(p_side_a_profile_ids) with ordinality requested(profile_id, ordinality)
  join public.sport_profiles profile on profile.id = requested.profile_id;

  select pg_catalog.jsonb_agg(profile.display_name order by requested.ordinality)
  into side_b_names
  from pg_catalog.unnest(p_side_b_profile_ids) with ordinality requested(profile_id, ordinality)
  join public.sport_profiles profile on profile.id = requested.profile_id;

  insert into public.sport_scoring_matches(
    sport_id, match_format, side_a_players, side_b_players, rules_snapshot, created_by
  ) values (
    selected_sport.id,
    normalized_format,
    coalesce(side_a_names, '[]'::jsonb),
    coalesce(side_b_names, '[]'::jsonb),
    p_rules_snapshot,
    (select auth.uid())
  ) returning id into match_id_value;

  perform app_private.add_sport_scoring_match_players(
    match_id_value,
    selected_sport.id,
    p_side_a_profile_ids,
    p_side_b_profile_ids,
    expected_players
  );
  return match_id_value;
end;
$$;

do $$
begin
  if not has_function_privilege(
    'authenticated',
    'public.search_sport_players(text,text,integer)',
    'EXECUTE'
  ) or not has_function_privilege(
    'authenticated',
    'public.create_standalone_sport_scoring_match(text,text,uuid[],uuid[],jsonb)',
    'EXECUTE'
  ) then
    raise exception 'Same-sport standalone match commands are unavailable';
  end if;
end;
$$;
