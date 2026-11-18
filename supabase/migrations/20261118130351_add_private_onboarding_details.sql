-- Private contact/demographic details are never added to public player readers.
create table public.account_details (
  account_id uuid primary key references public.profiles(id) on delete cascade,
  contact_email text,
  contact_phone text,
  age integer check (age between 0 and 120),
  country_code text check (country_code ~ '^[A-Z]{2}$'),
  state_name text check (length(state_name) <= 120),
  city text check (length(city) <= 120),
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  check (state_name is null or country_code is not null),
  check (city is null or state_name is not null)
);
alter table public.account_details enable row level security;
revoke all on public.account_details from public, anon, authenticated;
grant select on public.account_details to authenticated;
create policy account_details_read_own on public.account_details for select to authenticated
  using (account_id = (select auth.uid()));

-- Existing completed users keep their established access. New users must pass
-- the new completion RPC; old clients calling save_my_sports cannot set this marker.
insert into public.account_details(account_id, completed_at)
select id, coalesce(onboarding_completed_at, now()) from public.profiles
where onboarding_status = 'COMPLETED';

create function app_private.complete_my_account_details(
  p_display_name text, p_contact_email text, p_contact_phone text,
  p_sport_codes text[], p_primary_sport_code text,
  p_age integer default null, p_country_code text default null,
  p_state_name text default null, p_city text default null
) returns void language plpgsql security definer set search_path = '' as $$
declare
  account uuid := (select auth.uid());
  email_value text := lower(trim(coalesce(p_contact_email, '')));
  phone_value text := trim(coalesce(p_contact_phone, ''));
  country_value text := nullif(upper(trim(p_country_code)), '');
  state_value text := nullif(trim(p_state_name), '');
  city_value text := nullif(trim(p_city), '');
begin
  if account is null then raise exception 'Sign in before completing your profile'; end if;
  if p_display_name is null or length(trim(p_display_name)) not between 2 and 100 then
    raise exception 'Enter a name between 2 and 100 characters'; end if;
  if length(email_value) > 254 or email_value !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'Enter a valid contact email'; end if;
  if phone_value !~ '^\+[1-9][0-9]{7,14}$' then raise exception 'Enter a contact phone with country code'; end if;
  if p_age is not null and p_age not between 0 and 120 then raise exception 'Enter an age between 0 and 120'; end if;
  if country_value is not null and country_value !~ '^[A-Z]{2}$' then raise exception 'Select a valid country'; end if;
  if state_value is not null and (country_value is null or length(state_value) > 120) then raise exception 'Select a country before its state'; end if;
  if city_value is not null and (state_value is null or length(city_value) > 120) then raise exception 'Select a state before its city'; end if;
  -- One transaction for profile, sports, cricket identity and completion.
  perform app_private.save_my_sports(p_display_name, p_sport_codes, p_primary_sport_code);
  if exists(select 1 from unnest(p_sport_codes) code where upper(trim(code)) = 'CRICKET') then
    perform app_private.create_my_player_profile(p_display_name);
  end if;
  insert into public.account_details(account_id, contact_email, contact_phone, age, country_code, state_name, city, completed_at)
  values(account, email_value, phone_value, p_age, country_value, state_value, city_value, now())
  on conflict(account_id) do update set contact_email=excluded.contact_email,
    contact_phone=excluded.contact_phone, age=excluded.age, country_code=excluded.country_code,
    state_name=excluded.state_name, city=excluded.city,
    completed_at=coalesce(public.account_details.completed_at, excluded.completed_at), updated_at=now();
end $$;

create function public.complete_my_account_details(
  p_display_name text, p_contact_email text, p_contact_phone text,
  p_sport_codes text[], p_primary_sport_code text,
  p_age integer default null, p_country_code text default null,
  p_state_name text default null, p_city text default null
) returns void language sql security invoker set search_path = '' as $$
  select app_private.complete_my_account_details(p_display_name,p_contact_email,p_contact_phone,
    p_sport_codes,p_primary_sport_code,p_age,p_country_code,p_state_name,p_city)
$$;
revoke all on function app_private.complete_my_account_details(text,text,text,text[],text,integer,text,text,text),
  public.complete_my_account_details(text,text,text,text[],text,integer,text,text,text) from public,anon;
grant execute on function app_private.complete_my_account_details(text,text,text,text[],text,integer,text,text,text),
  public.complete_my_account_details(text,text,text,text[],text,integer,text,text,text) to authenticated;
notify pgrst, 'reload schema';
