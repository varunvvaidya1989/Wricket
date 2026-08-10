create table public.sport_profiles (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.profiles(id) on delete cascade,
  sport_id uuid not null references public.sports(id) on delete cascade,
  display_name text not null,
  avatar_url text,
  status text not null default 'INCOMPLETE' check (status in ('ACTIVE', 'ARCHIVED', 'INCOMPLETE')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (account_id, sport_id)
);

create index sport_profiles_account_status_idx on public.sport_profiles(account_id, status);
create index sport_profiles_sport_status_idx on public.sport_profiles(sport_id, status);

alter table public.sport_profiles enable row level security;

create policy "sport_profiles_select_own" on public.sport_profiles
for select to authenticated using (account_id = (select auth.uid()));
create policy "sport_profiles_insert_own" on public.sport_profiles
for insert to authenticated with check (account_id = (select auth.uid()));
create policy "sport_profiles_update_own" on public.sport_profiles
for update to authenticated
using (account_id = (select auth.uid())) with check (account_id = (select auth.uid()));
create policy "sport_profiles_delete_own" on public.sport_profiles
for delete to authenticated using (account_id = (select auth.uid()));

create or replace function app_private.sync_account_sport_profile()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare account_name text;
declare account_avatar text;
begin
  if tg_op = 'DELETE' then
    update public.sport_profiles
    set status = 'ARCHIVED', updated_at = now()
    where account_id = old.account_id and sport_id = old.sport_id;
    return old;
  end if;

  select profile.display_name, profile.avatar_url into account_name, account_avatar
  from public.profiles profile where profile.id = new.account_id;

  insert into public.sport_profiles(account_id, sport_id, display_name, avatar_url, status)
  values (
    new.account_id,
    new.sport_id,
    account_name,
    account_avatar,
    case new.access_status when 'ACTIVE' then 'ACTIVE' when 'SUSPENDED' then 'ARCHIVED' else 'INCOMPLETE' end
  )
  on conflict (account_id, sport_id) do update set
    status = excluded.status,
    updated_at = now();
  return new;
end;
$$;

create trigger sync_account_sport_profile_after_write
after insert or update of access_status on public.account_sports
for each row execute function app_private.sync_account_sport_profile();

create trigger archive_account_sport_profile_after_delete
after delete on public.account_sports
for each row execute function app_private.sync_account_sport_profile();

insert into public.sport_profiles(account_id, sport_id, display_name, avatar_url, status)
select account_sport.account_id, account_sport.sport_id, profile.display_name, profile.avatar_url,
  case account_sport.access_status when 'ACTIVE' then 'ACTIVE' when 'SUSPENDED' then 'ARCHIVED' else 'INCOMPLETE' end
from public.account_sports account_sport
join public.profiles profile on profile.id = account_sport.account_id
on conflict (account_id, sport_id) do nothing;

revoke all on public.sport_profiles from anon;
grant select, insert, update, delete on public.sport_profiles to authenticated;
revoke all on function app_private.sync_account_sport_profile() from public, anon, authenticated;
