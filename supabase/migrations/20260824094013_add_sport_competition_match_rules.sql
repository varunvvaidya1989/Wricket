create or replace function app_private.create_sport_competition_with_rules(
  p_sport_code text,
  p_kind public.sport_competition_kind,
  p_name text,
  p_rules jsonb,
  p_match_format text default 'SINGLES',
  p_visibility public.sport_resource_visibility default 'PRIVATE',
  p_timezone text default 'UTC'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_sport text := upper(trim(coalesce(p_sport_code, '')));
  units_to_win integer;
  point_target integer;
  competition_id_value uuid;
begin
  if jsonb_typeof(p_rules) <> 'object' then
    raise exception 'Match rules must be an object';
  end if;
  begin
    units_to_win := (p_rules ->> 'matchUnitsToWin')::integer;
  exception when invalid_text_representation then
    raise exception 'Number of sets or games is invalid';
  end;

  if units_to_win is null then
    raise exception 'Number of sets or games is required';
  elsif normalized_sport = 'TENNIS' and units_to_win not in (1, 2, 3) then
    raise exception 'Tennis matches must be best of 1, 3, or 5 sets';
  elsif normalized_sport = 'PADEL' and units_to_win not in (1, 2) then
    raise exception 'Padel matches must be best of 1 or 3 sets';
  elsif normalized_sport = 'BADMINTON' and units_to_win not in (1, 2) then
    raise exception 'Badminton matches must be best of 1 or 3 games';
  elsif normalized_sport = 'TABLE_TENNIS' and units_to_win not in (1, 2, 3, 4) then
    raise exception 'Table tennis matches must use an odd best-of-games format up to 7';
  elsif normalized_sport = 'PICKLEBALL' then
    if units_to_win not in (1, 2, 3) then raise exception 'Pickleball match format is invalid'; end if;
    begin
      point_target := (p_rules ->> 'gamePointTarget')::integer;
    exception when invalid_text_representation then
      raise exception 'Pickleball game target is invalid';
    end;
    if point_target not in (11, 15, 21) or (point_target <> 11 and units_to_win <> 1) then
      raise exception 'Pickleball games to 15 or 21 must be single-game matches';
    end if;
  else
    if normalized_sport not in ('TENNIS', 'PADEL', 'BADMINTON', 'TABLE_TENNIS', 'PICKLEBALL') then
      raise exception 'Unsupported sport rules';
    end if;
  end if;

  if normalized_sport in ('TENNIS', 'PADEL') then
    if jsonb_typeof(p_rules -> 'setTiebreak') <> 'boolean'
      or (p_rules ->> 'tieBreakPoints')::integer <> 7
      or (p_rules ->> 'setCap')::integer <> (case when (p_rules ->> 'setTiebreak')::boolean then 7 else 0 end) then
      raise exception 'Set tie-break rules are inconsistent';
    end if;
    if normalized_sport = 'TENNIS' and jsonb_typeof(p_rules -> 'noAd') <> 'boolean' then
      raise exception 'Tennis deuce rule is required';
    elsif normalized_sport = 'PADEL' and jsonb_typeof(p_rules -> 'goldenPoint') <> 'boolean' then
      raise exception 'Padel deuce rule is required';
    end if;
  elsif normalized_sport = 'PICKLEBALL' and jsonb_typeof(p_rules -> 'rallyScoring') <> 'boolean' then
    raise exception 'Pickleball scoring method is required';
  end if;

  competition_id_value := app_private.create_sport_competition(
    p_sport_code, p_kind, p_name, p_match_format, null, p_visibility, p_timezone
  );
  update public.sport_competitions
  set rules = p_rules, updated_at = now()
  where id = competition_id_value;
  return competition_id_value;
end;
$$;

create or replace function public.create_sport_competition_with_rules(
  p_sport_code text,
  p_kind public.sport_competition_kind,
  p_name text,
  p_rules jsonb,
  p_match_format text default 'SINGLES',
  p_visibility public.sport_resource_visibility default 'PRIVATE',
  p_timezone text default 'UTC'
)
returns uuid
language sql
security definer
set search_path = public
as $$
  select app_private.create_sport_competition_with_rules(
    p_sport_code, p_kind, p_name, p_rules, p_match_format, p_visibility, p_timezone
  )
$$;

create or replace function app_private.update_sport_competition_match_rules(
  p_competition_id uuid,
  p_rules jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare selected public.sport_competitions%rowtype;
begin
  selected := app_private.require_managed_competition(p_competition_id);
  if jsonb_typeof(p_rules) <> 'object' or not (p_rules ? 'matchUnitsToWin') then
    raise exception 'Complete match rules are required';
  end if;
  if exists (select 1 from public.sport_scoring_matches where competition_id = selected.id) then
    raise exception 'Match rules are locked after scoring starts';
  end if;
  update public.sport_competitions set rules = p_rules, updated_at = now() where id = selected.id;
  perform app_private.write_sport_audit(
    selected.sport_id, 'COMPETITION', selected.id, 'COMPETITION_MATCH_RULES_UPDATED', p_rules
  );
end;
$$;

create or replace function public.update_sport_competition_match_rules(
  p_competition_id uuid,
  p_rules jsonb
)
returns void
language sql
security definer
set search_path = public
as $$ select app_private.update_sport_competition_match_rules(p_competition_id, p_rules) $$;

revoke all on function app_private.create_sport_competition_with_rules(
  text, public.sport_competition_kind, text, jsonb, text, public.sport_resource_visibility, text
) from public, anon, authenticated;
revoke all on function public.create_sport_competition_with_rules(
  text, public.sport_competition_kind, text, jsonb, text, public.sport_resource_visibility, text
) from public, anon;
grant execute on function public.create_sport_competition_with_rules(
  text, public.sport_competition_kind, text, jsonb, text, public.sport_resource_visibility, text
) to authenticated;
revoke all on function app_private.update_sport_competition_match_rules(uuid, jsonb)
  from public, anon, authenticated;
revoke all on function public.update_sport_competition_match_rules(uuid, jsonb)
  from public, anon;
grant execute on function public.update_sport_competition_match_rules(uuid, jsonb)
  to authenticated;

comment on function public.create_sport_competition_with_rules(
  text, public.sport_competition_kind, text, jsonb, text, public.sport_resource_visibility, text
) is 'Creates a non-cricket competition with a validated, immutable-at-match-start sport rules profile.';
