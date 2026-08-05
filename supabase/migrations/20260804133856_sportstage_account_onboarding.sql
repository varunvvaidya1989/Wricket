create table public.sports (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code = upper(code)),
  name text not null,
  availability_status text not null check (availability_status in ('AVAILABLE', 'COMING_SOON', 'HIDDEN')),
  app_route text,
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((availability_status = 'AVAILABLE' and app_route is not null) or availability_status <> 'AVAILABLE')
);

create table public.account_sports (
  account_id uuid not null references public.profiles(id) on delete cascade,
  sport_id uuid not null references public.sports(id) on delete cascade,
  access_status text not null check (access_status in ('ACTIVE', 'COMING_SOON', 'SUSPENDED')),
  is_primary boolean not null default false,
  granted_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (account_id, sport_id)
);

alter table public.profiles
  add column primary_sport_id uuid references public.sports(id) on delete set null,
  add column onboarding_status text not null default 'SPORT_REQUIRED'
    check (onboarding_status in ('PROFILE_REQUIRED', 'SPORT_REQUIRED', 'COMPLETED')),
  add column onboarding_completed_at timestamptz;

create unique index account_sports_one_primary_idx on public.account_sports(account_id) where is_primary;
create index account_sports_account_status_idx on public.account_sports(account_id, access_status);

insert into public.sports(code, name, availability_status, app_route, display_order) values
  ('CRICKET', 'Cricket', 'AVAILABLE', '/wricket', 1),
  ('FOOTBALL', 'Football', 'COMING_SOON', null, 2),
  ('BADMINTON', 'Badminton', 'COMING_SOON', null, 3),
  ('BASKETBALL', 'Basketball', 'COMING_SOON', null, 4);

insert into public.account_sports(account_id, sport_id, access_status, is_primary)
select profile.id, sport.id, 'ACTIVE', true
from public.profiles profile cross join public.sports sport
where sport.code = 'CRICKET'
on conflict (account_id, sport_id) do nothing;

update public.profiles profile
set primary_sport_id = sport.id,
    onboarding_status = 'COMPLETED',
    onboarding_completed_at = coalesce(profile.onboarding_completed_at, now())
from public.sports sport
where sport.code = 'CRICKET';

alter table public.sports enable row level security;
alter table public.account_sports enable row level security;

create policy "sports_read_public" on public.sports for select to anon, authenticated using (availability_status <> 'HIDDEN');
create policy "account_sports_read_own" on public.account_sports for select to authenticated using (account_id = (select auth.uid()));

create or replace function app_private.complete_sportstage_onboarding(
  p_display_name text,
  p_sport_code text
) returns void
language plpgsql security definer set search_path = public
as $$
declare selected_sport public.sports%rowtype;
declare selected_access_status text;
begin
  if (select auth.uid()) is null then raise exception 'Authentication is required'; end if;
  if length(trim(p_display_name)) < 2 then raise exception 'Display name must contain at least 2 characters'; end if;
  select * into selected_sport from public.sports
  where code = upper(trim(p_sport_code)) and availability_status <> 'HIDDEN';
  if not found then raise exception 'Sport is not available for selection'; end if;
  selected_access_status := case when selected_sport.availability_status = 'AVAILABLE' then 'ACTIVE' else 'COMING_SOON' end;

  insert into public.profiles(id, display_name, primary_sport_id, onboarding_status, onboarding_completed_at, updated_at)
  values ((select auth.uid()), trim(p_display_name), selected_sport.id, 'COMPLETED', now(), now())
  on conflict (id) do update set
    display_name = excluded.display_name,
    primary_sport_id = excluded.primary_sport_id,
    onboarding_status = 'COMPLETED',
    onboarding_completed_at = now(),
    updated_at = now();

  update public.account_sports set is_primary = false, updated_at = now()
  where account_id = (select auth.uid()) and is_primary;
  insert into public.account_sports(account_id, sport_id, access_status, is_primary)
  values ((select auth.uid()), selected_sport.id, selected_access_status, true)
  on conflict (account_id, sport_id) do update set
    access_status = excluded.access_status, is_primary = true, updated_at = now();
end;
$$;

create or replace function public.complete_sportstage_onboarding(p_display_name text, p_sport_code text)
returns void language sql security invoker set search_path = public
as $$ select app_private.complete_sportstage_onboarding(p_display_name, p_sport_code) $$;

revoke all on public.sports, public.account_sports from anon;
grant select on public.sports to anon;
grant select on public.sports, public.account_sports to authenticated;
revoke all on function app_private.complete_sportstage_onboarding(text, text) from public, anon;
revoke all on function public.complete_sportstage_onboarding(text, text) from public, anon;
grant execute on function app_private.complete_sportstage_onboarding(text, text) to authenticated;
grant execute on function public.complete_sportstage_onboarding(text, text) to authenticated;
