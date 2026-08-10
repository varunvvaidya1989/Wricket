create or replace function app_private.save_my_sports(
  p_display_name text,
  p_sport_codes text[],
  p_primary_sport_code text
) returns void
language plpgsql security definer set search_path = public
as $$
declare
  account_id_value uuid := (select auth.uid());
  clean_codes text[];
  primary_sport public.sports%rowtype;
  requested_count integer;
  matched_count integer;
begin
  if account_id_value is null then raise exception 'Authentication is required'; end if;
  if length(trim(p_display_name)) < 2 then raise exception 'Display name must contain at least 2 characters'; end if;

  select coalesce(array_agg(distinct upper(trim(code))), '{}'::text[])
  into clean_codes
  from unnest(coalesce(p_sport_codes, '{}'::text[])) code
  where length(trim(code)) > 0;

  requested_count := cardinality(clean_codes);
  if requested_count = 0 then raise exception 'Select at least one sport'; end if;
  if not (upper(trim(p_primary_sport_code)) = any(clean_codes)) then
    raise exception 'Primary sport must be one of the selected sports';
  end if;

  select count(*) into matched_count
  from public.sports sport
  where sport.code = any(clean_codes) and sport.availability_status <> 'HIDDEN';
  if matched_count <> requested_count then raise exception 'One or more selected sports are unavailable'; end if;

  select * into primary_sport
  from public.sports sport
  where sport.code = upper(trim(p_primary_sport_code)) and sport.availability_status <> 'HIDDEN';
  if not found then raise exception 'Primary sport is unavailable'; end if;

  insert into public.profiles(id, display_name, primary_sport_id, onboarding_status, onboarding_completed_at, updated_at)
  values (account_id_value, trim(p_display_name), primary_sport.id, 'COMPLETED', now(), now())
  on conflict (id) do update set
    display_name = excluded.display_name,
    primary_sport_id = excluded.primary_sport_id,
    onboarding_status = 'COMPLETED',
    onboarding_completed_at = coalesce(public.profiles.onboarding_completed_at, now()),
    updated_at = now();

  update public.account_sports set is_primary = false, updated_at = now()
  where account_id = account_id_value and is_primary;

  delete from public.account_sports account_sport
  using public.sports sport
  where account_sport.account_id = account_id_value
    and account_sport.sport_id = sport.id
    and not (sport.code = any(clean_codes))
    and account_sport.access_status <> 'SUSPENDED';

  insert into public.account_sports(account_id, sport_id, access_status, is_primary, updated_at)
  select account_id_value, sport.id,
    case when sport.availability_status = 'AVAILABLE' then 'ACTIVE' else 'COMING_SOON' end,
    sport.code = primary_sport.code,
    now()
  from public.sports sport
  where sport.code = any(clean_codes)
  on conflict (account_id, sport_id) do update set
    access_status = case
      when public.account_sports.access_status = 'SUSPENDED' then 'SUSPENDED'
      else excluded.access_status
    end,
    is_primary = excluded.is_primary,
    updated_at = now();
end;
$$;

create or replace function public.save_my_sports(
  p_display_name text,
  p_sport_codes text[],
  p_primary_sport_code text
) returns void
language sql security invoker set search_path = public
as $$ select app_private.save_my_sports(p_display_name, p_sport_codes, p_primary_sport_code) $$;

-- Keep older clients functional without removing sport relationships they do not know about.
create or replace function app_private.complete_sportstage_onboarding(
  p_display_name text,
  p_sport_code text
) returns void
language plpgsql security definer set search_path = public
as $$
declare existing_codes text[];
begin
  select coalesce(array_agg(sport.code), '{}'::text[])
  into existing_codes
  from public.account_sports account_sport
  join public.sports sport on sport.id = account_sport.sport_id
  where account_sport.account_id = (select auth.uid())
    and account_sport.access_status <> 'SUSPENDED';

  perform app_private.save_my_sports(
    p_display_name,
    array_append(existing_codes, upper(trim(p_sport_code))),
    p_sport_code
  );
end;
$$;

revoke all on function app_private.save_my_sports(text, text[], text) from public, anon;
revoke all on function public.save_my_sports(text, text[], text) from public, anon;
grant execute on function app_private.save_my_sports(text, text[], text) to authenticated;
grant execute on function public.save_my_sports(text, text[], text) to authenticated;
