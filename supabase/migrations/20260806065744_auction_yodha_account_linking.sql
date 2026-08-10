create table public.legacy_player_contacts (
  player_id uuid primary key references public.players(id) on delete cascade,
  email text,
  phone text,
  source_system text not null default 'auction_yodha',
  imported_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.player_account_links (
  account_id uuid not null references public.profiles(id) on delete cascade,
  player_id uuid not null unique references public.players(id) on delete cascade,
  is_primary boolean not null default false,
  link_method text not null check (link_method in ('EXISTING', 'EMAIL', 'PHONE', 'EMAIL_PHONE', 'MANUAL', 'NEW_ACCOUNT')),
  verified_at timestamptz not null default now(),
  linked_at timestamptz not null default now(),
  primary key (account_id, player_id)
);

create unique index player_account_links_one_primary_idx
on public.player_account_links(account_id) where is_primary;
create index player_account_links_account_idx on public.player_account_links(account_id);
create index legacy_player_contacts_email_idx on public.legacy_player_contacts(lower(email)) where email is not null;
create index legacy_player_contacts_phone_idx on public.legacy_player_contacts(phone) where phone is not null;

create table public.player_link_claims (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.profiles(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  status text not null default 'PENDING' check (status in ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED')),
  requested_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references public.profiles(id) on delete set null,
  unique (account_id, player_id)
);

alter table public.legacy_player_contacts enable row level security;
alter table public.player_account_links enable row level security;
alter table public.player_link_claims enable row level security;

insert into public.legacy_player_contacts(player_id, email, phone)
select
  player.id,
  lower(trim(coalesce(
    player.source_metadata->>'email', player.source_metadata->>'Email',
    player.source_metadata->>'email_address', player.source_metadata->>'Email Address'
  ))),
  regexp_replace(coalesce(
    player.source_metadata->>'phone', player.source_metadata->>'Phone',
    player.source_metadata->>'mobile', player.source_metadata->>'Mobile',
    player.source_metadata->>'phone_number', player.source_metadata->>'Phone Number'
  ), '[^0-9+]', '', 'g')
from public.players player
where player.source_system = 'auction_yodha'
  and coalesce(
    player.source_metadata->>'email', player.source_metadata->>'Email', player.source_metadata->>'email_address',
    player.source_metadata->>'phone', player.source_metadata->>'Phone', player.source_metadata->>'mobile',
    player.source_metadata->>'Mobile', player.source_metadata->>'phone_number'
  ) is not null
on conflict (player_id) do update set email = excluded.email, phone = excluded.phone, updated_at = now();

update public.players
set source_metadata = source_metadata - array[
  'email', 'Email', 'email_address', 'Email Address', 'phone', 'Phone',
  'mobile', 'Mobile', 'phone_number', 'Phone Number'
]
where source_system = 'auction_yodha';

create policy "player_account_links_read_own" on public.player_account_links
for select to authenticated using (account_id = (select auth.uid()));
create policy "player_link_claims_read_own" on public.player_link_claims
for select to authenticated using (account_id = (select auth.uid()));

insert into public.player_account_links(account_id, player_id, is_primary, link_method)
select profile_id, id, true, 'EXISTING'
from public.players
where profile_id is not null
on conflict do nothing;

create or replace function app_private.attach_player_account(
  p_account_id uuid,
  p_player_id uuid,
  p_method text
) returns void
language plpgsql security definer set search_path = public
as $$
declare has_primary boolean;
begin
  if exists (select 1 from public.player_account_links where player_id = p_player_id and account_id <> p_account_id) then
    raise exception 'This player is already connected to another SportStage account';
  end if;
  select exists(select 1 from public.player_account_links where account_id = p_account_id and is_primary) into has_primary;
  insert into public.player_account_links(account_id, player_id, is_primary, link_method)
  values (p_account_id, p_player_id, not has_primary, p_method)
  on conflict (account_id, player_id) do nothing;
  if not exists (select 1 from public.players where profile_id = p_account_id) then
    update public.players set profile_id = p_account_id, updated_at = now()
    where id = p_player_id and profile_id is null;
  end if;
end;
$$;

create or replace function app_private.resolve_auction_yodha_link(p_display_name text)
returns jsonb
language plpgsql security definer set search_path = public, auth
as $$
declare account_id_value uuid := (select auth.uid());
declare verified_email text;
declare verified_phone text;
declare contact_matches uuid[];
declare candidate_count integer;
declare selected_player_id uuid;
declare method_value text;
declare name_candidates jsonb;
begin
  if account_id_value is null then raise exception 'Authentication is required'; end if;
  if exists (select 1 from public.player_account_links where account_id = account_id_value) then
    return jsonb_build_object('status', 'LINKED', 'player_ids', (
      select coalesce(jsonb_agg(player_id), '[]'::jsonb) from public.player_account_links where account_id = account_id_value
    ));
  end if;

  select case when email_confirmed_at is not null then lower(trim(email)) end,
         case when phone_confirmed_at is not null then regexp_replace(phone, '[^0-9+]', '', 'g') end
  into verified_email, verified_phone
  from auth.users where id = account_id_value;

  select coalesce(array_agg(distinct contact.player_id), '{}'::uuid[])
  into contact_matches
  from public.legacy_player_contacts contact
  left join public.player_account_links linked on linked.player_id = contact.player_id
  where linked.player_id is null and (
    (verified_email is not null and lower(trim(contact.email)) = verified_email)
    or (verified_phone is not null and regexp_replace(contact.phone, '[^0-9+]', '', 'g') = verified_phone)
  );
  candidate_count := cardinality(contact_matches);
  if candidate_count = 1 then
    selected_player_id := contact_matches[1];
    select case
      when verified_email is not null and lower(trim(contact.email)) = verified_email
       and verified_phone is not null and regexp_replace(contact.phone, '[^0-9+]', '', 'g') = verified_phone then 'EMAIL_PHONE'
      when verified_email is not null and lower(trim(contact.email)) = verified_email then 'EMAIL'
      else 'PHONE'
    end into method_value from public.legacy_player_contacts contact where contact.player_id = selected_player_id;
    perform app_private.attach_player_account(account_id_value, selected_player_id, method_value);
    return jsonb_build_object('status', 'AUTO_LINKED', 'player_id', selected_player_id, 'method', method_value);
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('player_id', candidate.id, 'display_name', candidate.display_name)), '[]'::jsonb)
  into name_candidates
  from (
    select player.id, player.display_name
    from public.players player
    left join public.player_account_links linked on linked.player_id = player.id
    where player.source_system = 'auction_yodha' and linked.player_id is null
      and lower(regexp_replace(player.display_name, '\s+', ' ', 'g')) = lower(regexp_replace(trim(p_display_name), '\s+', ' ', 'g'))
    order by player.display_name limit 5
  ) candidate;
  return jsonb_build_object(
    'status', case when candidate_count > 1 then 'CONTACT_CONFLICT' when jsonb_array_length(name_candidates) > 0 then 'CANDIDATES' else 'NO_MATCH' end,
    'candidates', name_candidates
  );
end;
$$;

create or replace function app_private.request_player_link(p_player_id uuid)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare claim_id uuid;
begin
  if (select auth.uid()) is null then raise exception 'Authentication is required'; end if;
  if not exists (select 1 from public.players where id = p_player_id and source_system = 'auction_yodha') then
    raise exception 'Migrated player not found';
  end if;
  if exists (select 1 from public.player_account_links where player_id = p_player_id) then
    raise exception 'This player is already connected';
  end if;
  insert into public.player_link_claims(account_id, player_id)
  values ((select auth.uid()), p_player_id)
  on conflict (account_id, player_id) do update set status = 'PENDING', requested_at = now(), reviewed_at = null, reviewed_by = null
  returning id into claim_id;
  return claim_id;
end;
$$;

create or replace function app_private.create_my_player_profile(p_display_name text)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare account_id_value uuid := (select auth.uid());
declare player_id_value uuid;
begin
  if account_id_value is null then raise exception 'Authentication is required'; end if;
  if length(trim(p_display_name)) < 2 then raise exception 'Player name must contain at least 2 characters'; end if;
  select id into player_id_value from public.players where profile_id = account_id_value;
  if player_id_value is null then
    insert into public.players(profile_id, created_by, display_name, role)
    values (account_id_value, account_id_value, trim(p_display_name), 'AR') returning id into player_id_value;
  end if;
  perform app_private.attach_player_account(account_id_value, player_id_value, 'NEW_ACCOUNT');
  return player_id_value;
end;
$$;

create or replace function app_private.approve_player_link_claim(p_claim_id uuid, p_approve boolean)
returns void
language plpgsql security definer set search_path = public
as $$
declare selected_claim public.player_link_claims%rowtype;
begin
  if coalesce((select auth.jwt()->'app_metadata'->>'is_support_admin')::boolean, false) is not true then
    raise exception 'Support administrator access is required';
  end if;
  select * into selected_claim from public.player_link_claims where id = p_claim_id for update;
  if not found or selected_claim.status <> 'PENDING' then raise exception 'Pending claim not found'; end if;
  if p_approve then perform app_private.attach_player_account(selected_claim.account_id, selected_claim.player_id, 'MANUAL'); end if;
  update public.player_link_claims set status = case when p_approve then 'APPROVED' else 'REJECTED' end,
    reviewed_at = now(), reviewed_by = (select auth.uid()) where id = p_claim_id;
end;
$$;

create or replace function public.resolve_auction_yodha_link(p_display_name text)
returns jsonb language sql security invoker set search_path = public
as $$ select app_private.resolve_auction_yodha_link(p_display_name) $$;
create or replace function public.request_player_link(p_player_id uuid)
returns uuid language sql security invoker set search_path = public
as $$ select app_private.request_player_link(p_player_id) $$;
create or replace function public.create_my_player_profile(p_display_name text)
returns uuid language sql security invoker set search_path = public
as $$ select app_private.create_my_player_profile(p_display_name) $$;
create or replace function public.approve_player_link_claim(p_claim_id uuid, p_approve boolean)
returns void language sql security invoker set search_path = public
as $$ select app_private.approve_player_link_claim(p_claim_id, p_approve) $$;

revoke all on public.legacy_player_contacts, public.player_account_links, public.player_link_claims from anon;
grant select on public.player_account_links, public.player_link_claims to authenticated;
revoke all on function app_private.attach_player_account(uuid, uuid, text) from public, anon, authenticated;
revoke all on function app_private.resolve_auction_yodha_link(text) from public, anon;
revoke all on function app_private.request_player_link(uuid) from public, anon;
revoke all on function app_private.approve_player_link_claim(uuid, boolean) from public, anon;
revoke all on function public.resolve_auction_yodha_link(text) from public, anon;
revoke all on function public.request_player_link(uuid) from public, anon;
revoke all on function public.create_my_player_profile(text) from public, anon;
revoke all on function public.approve_player_link_claim(uuid, boolean) from public, anon;
grant execute on function public.resolve_auction_yodha_link(text) to authenticated;
grant execute on function public.request_player_link(uuid) to authenticated;
grant execute on function public.create_my_player_profile(text) to authenticated;
grant execute on function public.approve_player_link_claim(uuid, boolean) to authenticated;
