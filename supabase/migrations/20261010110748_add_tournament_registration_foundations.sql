-- Registrations are account-bound applications, independent of team membership.
create table public.tournament_registration_settings (
  tournament_id uuid primary key references public.tournaments(id) on delete cascade,
  entry_mode text not null default 'EXISTING_TEAMS' check (entry_mode in ('PLAYER_POOL', 'EXISTING_TEAMS')),
  published_at timestamptz,
  registration_open boolean not null default false,
  fee_required boolean not null default false,
  fee_label text not null default '' check (length(fee_label) <= 120),
  payment_instructions text not null default '' check (length(payment_instructions) <= 1000),
  updated_at timestamptz not null default now(),
  check (not registration_open or published_at is not null)
);

create table public.tournament_player_registrations (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  account_id uuid not null references public.profiles(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete restrict,
  playing_role text not null check (playing_role in ('BAT', 'BOWL', 'AR', 'WK')),
  contact_phone text not null check (length(contact_phone) <= 40),
  applicant_note text not null default '' check (length(applicant_note) <= 1000),
  status text not null default 'PENDING' check (status in ('PENDING', 'APPROVED', 'REJECTED', 'WITHDRAWN')),
  payment_status text not null check (payment_status in ('NOT_REQUIRED', 'PENDING', 'DONE')),
  payment_required boolean not null,
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  payment_marked_by uuid references public.profiles(id) on delete set null,
  payment_marked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(tournament_id, account_id),
  check ((payment_required and payment_status in ('PENDING','DONE')) or (not payment_required and payment_status = 'NOT_REQUIRED'))
);
create index tournament_registrations_account_idx on public.tournament_player_registrations(account_id);
create index tournament_registrations_directory_idx on public.tournament_player_registrations(tournament_id, status, created_at);
create index tournament_registrations_player_idx on public.tournament_player_registrations(player_id);

create table public.tournament_registration_events (
  id uuid primary key default gen_random_uuid(),
  registration_id uuid not null references public.tournament_player_registrations(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  kind text not null check (kind in ('SUBMITTED','REVIEWED','PAYMENT_MARKED','WITHDRAWN')),
  previous_value text,
  next_value text not null,
  created_at timestamptz not null default now()
);
create index tournament_registration_events_registration_idx on public.tournament_registration_events(registration_id);
create index tournament_registration_events_actor_idx on public.tournament_registration_events(actor_id);

alter table public.tournament_registration_settings enable row level security;
alter table public.tournament_player_registrations enable row level security;
alter table public.tournament_registration_events enable row level security;
revoke all on public.tournament_registration_settings, public.tournament_player_registrations, public.tournament_registration_events from anon, authenticated;
grant select on public.tournament_registration_settings, public.tournament_player_registrations, public.tournament_registration_events to authenticated;

create policy registration_settings_read on public.tournament_registration_settings for select to authenticated using (
  exists (select 1 from public.tournaments t where t.id = tournament_id and
    (t.created_by = (select auth.uid()) or (t.visibility = 'PUBLIC' and published_at is not null)))
);
create policy registration_private_read on public.tournament_player_registrations for select to authenticated using (
  account_id = (select auth.uid()) or exists (
    select 1 from public.tournaments t where t.id = tournament_id and t.created_by = (select auth.uid())
  )
);
create policy registration_events_private_read on public.tournament_registration_events for select to authenticated using (
  exists (select 1 from public.tournament_player_registrations r where r.id = registration_id)
);

create function app_private.initialize_tournament_registration_settings()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.tournament_registration_settings(tournament_id, entry_mode)
  values (new.id, coalesce(new.settings->>'entryMode', 'EXISTING_TEAMS'));
  return new;
end $$;
revoke all on function app_private.initialize_tournament_registration_settings() from public, anon, authenticated;
create trigger initialize_tournament_registration_settings after insert on public.tournaments
for each row execute function app_private.initialize_tournament_registration_settings();
insert into public.tournament_registration_settings(tournament_id) select id from public.tournaments;

-- Serialize new team entries against entry-mode changes, including existing team APIs.
create function app_private.lock_team_entry_registration_mode()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.tournament_id is not null then
    perform 1 from public.tournament_registration_settings where tournament_id = new.tournament_id for update;
  end if;
  return new;
end $$;
revoke all on function app_private.lock_team_entry_registration_mode() from public, anon, authenticated;
create trigger lock_team_entry_registration_mode before insert or update of tournament_id on public.teams
for each row execute function app_private.lock_team_entry_registration_mode();

create function app_private.configure_tournament_registration(
  p_tournament_id uuid, p_entry_mode text, p_published boolean, p_open boolean,
  p_fee_required boolean, p_fee_label text, p_payment_instructions text
) returns void language plpgsql security definer set search_path = '' as $$
declare current_config public.tournament_registration_settings;
begin
  if (select auth.uid()) is null or not exists (select 1 from public.tournaments where id = p_tournament_id and created_by = (select auth.uid())) then
    raise exception 'Only the tournament organiser can configure registrations';
  end if;
  select * into current_config from public.tournament_registration_settings where tournament_id = p_tournament_id for update;
  if not found then raise exception 'Registration settings unavailable'; end if;
  if p_entry_mode is null or p_entry_mode not in ('PLAYER_POOL','EXISTING_TEAMS') or p_published is null or p_open is null or p_fee_required is null then
    raise exception 'Invalid registration configuration';
  end if;
  if p_open and not p_published then raise exception 'Publish the tournament before opening registration'; end if;
  if p_open and p_entry_mode = 'EXISTING_TEAMS' then raise exception 'Existing teams are managed through team entries'; end if;
  if p_entry_mode <> current_config.entry_mode and (
    exists(select 1 from public.tournament_player_registrations where tournament_id = p_tournament_id)
    or exists(select 1 from public.teams where tournament_id = p_tournament_id)
  ) then raise exception 'Entry mode locks after the first application or team'; end if;
  if exists(select 1 from public.tournament_player_registrations where tournament_id = p_tournament_id) then
    if p_fee_required <> current_config.fee_required then raise exception 'Fee requirement locks after the first application'; end if;
    if not p_published then raise exception 'Close registration instead of unpublishing a tournament with applications'; end if;
  end if;
  if length(coalesce(p_fee_label,'')) > 120 or length(coalesce(p_payment_instructions,'')) > 1000 then raise exception 'Fee details are too long'; end if;
  if p_fee_required and length(trim(coalesce(p_fee_label,''))) = 0 then raise exception 'Describe the registration fee'; end if;
  update public.tournament_registration_settings set
    entry_mode = p_entry_mode, published_at = case when p_published then coalesce(published_at, now()) else null end,
    registration_open = p_open, fee_required = p_fee_required, fee_label = trim(coalesce(p_fee_label,'')),
    payment_instructions = trim(coalesce(p_payment_instructions,'')), updated_at = now()
  where tournament_id = p_tournament_id;
  -- Preserve legacy public visibility when saving an unpublished registration configuration.
  if p_published then update public.tournaments set visibility = 'PUBLIC' where id = p_tournament_id; end if;
end $$;

create function app_private.submit_tournament_player_registration(p_tournament_id uuid, p_role text, p_phone text, p_note text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare config public.tournament_registration_settings; player_id_value uuid; registration_id_value uuid; player_name text;
begin
  if (select auth.uid()) is null then raise exception 'Sign in to register'; end if;
  select * into config from public.tournament_registration_settings where tournament_id = p_tournament_id for update;
  if not found or config.published_at is null or not config.registration_open or not exists (
    select 1 from public.tournaments where id = p_tournament_id and visibility = 'PUBLIC'
  ) then raise exception 'Registration is closed'; end if;
  if config.entry_mode <> 'PLAYER_POOL' then raise exception 'Players join this tournament through their team'; end if;
  if p_role is null or p_role not in ('BAT','BOWL','AR','WK') then raise exception 'Choose a valid playing role'; end if;
  if p_phone is null or length(p_phone) > 40 or length(regexp_replace(p_phone, '[^0-9]', '', 'g')) < 7 or length(regexp_replace(p_phone, '[^0-9]', '', 'g')) > 15 then
    raise exception 'Enter a valid contact number';
  end if;
  if length(coalesce(p_note,'')) > 1000 then raise exception 'Keep your note within 1000 characters'; end if;
  if exists(select 1 from public.tournament_player_registrations where tournament_id = p_tournament_id and account_id = (select auth.uid())) then
    raise exception 'You already have an application for this tournament';
  end if;
  select display_name into player_name from public.profiles where id = (select auth.uid());
  if not found then raise exception 'Complete your profile before registering'; end if;
  -- Concurrent applications to different tournaments share the existing canonical account identity.
  insert into public.players(profile_id, display_name, created_by)
  values ((select auth.uid()), player_name, (select auth.uid()))
  on conflict (profile_id) where profile_id is not null do nothing;
  select id into player_id_value from public.players where profile_id = (select auth.uid());
  insert into public.tournament_player_registrations(tournament_id, account_id, player_id, playing_role, contact_phone, applicant_note, payment_status, payment_required)
  values (p_tournament_id, (select auth.uid()), player_id_value, p_role, trim(p_phone), trim(coalesce(p_note,'')),
    case when config.fee_required then 'PENDING' else 'NOT_REQUIRED' end, config.fee_required)
  returning id into registration_id_value;
  insert into public.tournament_registration_events(registration_id, actor_id, kind, next_value)
  values (registration_id_value, (select auth.uid()), 'SUBMITTED', 'PENDING');
  return registration_id_value;
end $$;

create function app_private.review_tournament_player_registration(p_registration_id uuid, p_status text, p_payment_status text)
returns void language plpgsql security definer set search_path = '' as $$
declare application public.tournament_player_registrations;
begin
  select * into application from public.tournament_player_registrations where id = p_registration_id for update;
  if not found or (select auth.uid()) is null or not exists(select 1 from public.tournaments where id = application.tournament_id and created_by = (select auth.uid())) then
    raise exception 'Only the tournament organiser can review registrations';
  end if;
  if p_status is not null then
    if p_status not in ('PENDING','APPROVED','REJECTED') or application.status = 'WITHDRAWN' then raise exception 'This application cannot be reviewed'; end if;
    update public.tournament_player_registrations set status = p_status, reviewed_by = (select auth.uid()), reviewed_at = now(), updated_at = now() where id = p_registration_id;
    insert into public.tournament_registration_events(registration_id, actor_id, kind, previous_value, next_value)
    values (p_registration_id, (select auth.uid()), 'REVIEWED', application.status, p_status);
  end if;
  if p_payment_status is not null then
    if (application.payment_required and p_payment_status not in ('PENDING','DONE')) or (not application.payment_required and p_payment_status <> 'NOT_REQUIRED') then
      raise exception 'Invalid payment flag for this application';
    end if;
    update public.tournament_player_registrations set payment_status = p_payment_status, payment_marked_by = (select auth.uid()), payment_marked_at = now(), updated_at = now() where id = p_registration_id;
    insert into public.tournament_registration_events(registration_id, actor_id, kind, previous_value, next_value)
    values (p_registration_id, (select auth.uid()), 'PAYMENT_MARKED', application.payment_status, p_payment_status);
  end if;
end $$;

create function app_private.withdraw_tournament_player_registration(p_registration_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare application public.tournament_player_registrations;
begin
  select * into application from public.tournament_player_registrations where id = p_registration_id for update;
  if not found or (select auth.uid()) is null or application.account_id <> (select auth.uid()) then raise exception 'Only the applicant can withdraw'; end if;
  if application.status not in ('PENDING','APPROVED') then raise exception 'This application cannot be withdrawn'; end if;
  update public.tournament_player_registrations set status = 'WITHDRAWN', updated_at = now() where id = p_registration_id;
  insert into public.tournament_registration_events(registration_id, actor_id, kind, previous_value, next_value)
  values (p_registration_id, (select auth.uid()), 'WITHDRAWN', application.status, 'WITHDRAWN');
end $$;

-- A safe directory projection never returns application contact, answers or payment fields.
create function app_private.list_registered_tournament_players(p_tournament_id uuid)
returns table(registration_id uuid, player_id uuid, account_id uuid, display_name text, playing_role text, registered_at timestamptz)
language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null or not exists (
    select 1 from public.tournaments t join public.tournament_registration_settings c on c.tournament_id = t.id
    where t.id = p_tournament_id and (t.created_by = (select auth.uid()) or (t.visibility = 'PUBLIC' and c.published_at is not null))
  ) then raise exception 'Tournament registration directory is unavailable'; end if;
  return query select r.id, r.player_id, r.account_id, p.display_name, r.playing_role, r.created_at
    from public.tournament_player_registrations r join public.players p on p.id = r.player_id
    where r.tournament_id = p_tournament_id and r.status = 'APPROVED' order by lower(p.display_name), r.id;
end $$;

create function public.configure_tournament_registration(p_tournament_id uuid, p_entry_mode text, p_published boolean, p_open boolean, p_fee_required boolean, p_fee_label text, p_payment_instructions text)
returns void language sql security invoker set search_path = '' as $$ select app_private.configure_tournament_registration(p_tournament_id,p_entry_mode,p_published,p_open,p_fee_required,p_fee_label,p_payment_instructions) $$;
create function public.submit_tournament_player_registration(p_tournament_id uuid, p_role text, p_phone text, p_note text)
returns uuid language sql security invoker set search_path = '' as $$ select app_private.submit_tournament_player_registration(p_tournament_id,p_role,p_phone,p_note) $$;
create function public.review_tournament_player_registration(p_registration_id uuid, p_status text default null, p_payment_status text default null)
returns void language sql security invoker set search_path = '' as $$ select app_private.review_tournament_player_registration(p_registration_id,p_status,p_payment_status) $$;
create function public.withdraw_tournament_player_registration(p_registration_id uuid)
returns void language sql security invoker set search_path = '' as $$ select app_private.withdraw_tournament_player_registration(p_registration_id) $$;
create function public.list_registered_tournament_players(p_tournament_id uuid)
returns table(registration_id uuid, player_id uuid, account_id uuid, display_name text, playing_role text, registered_at timestamptz)
language sql security invoker set search_path = '' as $$ select * from app_private.list_registered_tournament_players(p_tournament_id) $$;

revoke all on function app_private.configure_tournament_registration(uuid,text,boolean,boolean,boolean,text,text), public.configure_tournament_registration(uuid,text,boolean,boolean,boolean,text,text),
  app_private.submit_tournament_player_registration(uuid,text,text,text), public.submit_tournament_player_registration(uuid,text,text,text),
  app_private.review_tournament_player_registration(uuid,text,text), public.review_tournament_player_registration(uuid,text,text),
  app_private.withdraw_tournament_player_registration(uuid), public.withdraw_tournament_player_registration(uuid),
  app_private.list_registered_tournament_players(uuid), public.list_registered_tournament_players(uuid) from public, anon;
grant execute on function app_private.configure_tournament_registration(uuid,text,boolean,boolean,boolean,text,text), public.configure_tournament_registration(uuid,text,boolean,boolean,boolean,text,text),
  app_private.submit_tournament_player_registration(uuid,text,text,text), public.submit_tournament_player_registration(uuid,text,text,text),
  app_private.review_tournament_player_registration(uuid,text,text), public.review_tournament_player_registration(uuid,text,text),
  app_private.withdraw_tournament_player_registration(uuid), public.withdraw_tournament_player_registration(uuid),
  app_private.list_registered_tournament_players(uuid), public.list_registered_tournament_players(uuid) to authenticated;

notify pgrst, 'reload schema';
