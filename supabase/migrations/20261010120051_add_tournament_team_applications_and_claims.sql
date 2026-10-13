-- Tournament invitations grant either a reviewed team application or a reserved captain claim.
create table public.tournament_entry_invitations (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  kind text not null check (kind in ('TEAM_APPLICATION','CLAIM_CAPTAIN')),
  placeholder_team_id uuid references public.teams(id) on delete cascade,
  target_account_id uuid references public.profiles(id) on delete cascade,
  token_hash bytea not null unique,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  use_count integer not null default 0,
  max_uses integer not null check (max_uses between 1 and 64),
  created_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  check (use_count between 0 and max_uses),
  check ((kind = 'CLAIM_CAPTAIN' and placeholder_team_id is not null and max_uses = 1)
    or (kind = 'TEAM_APPLICATION' and placeholder_team_id is null and target_account_id is null))
);
create index tournament_entry_invites_tournament_idx on public.tournament_entry_invitations(tournament_id);
create index tournament_entry_invites_placeholder_idx on public.tournament_entry_invitations(placeholder_team_id);
create index tournament_entry_invites_target_idx on public.tournament_entry_invitations(target_account_id);
create index tournament_entry_invites_creator_idx on public.tournament_entry_invitations(created_by);

create table public.tournament_team_applications (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  account_id uuid not null references public.profiles(id) on delete cascade,
  source_team_id uuid references public.teams(id) on delete set null,
  team_name_snapshot text not null,
  contact_phone text not null check (length(contact_phone) <= 40),
  applicant_note text not null default '' check (length(applicant_note) <= 1000),
  status text not null default 'PENDING' check (status in ('PENDING','APPROVED','REJECTED','WITHDRAWN')),
  payment_required boolean not null,
  payment_status text not null check (payment_status in ('NOT_REQUIRED','PENDING','DONE')),
  entry_team_id uuid references public.teams(id) on delete set null,
  invitation_id uuid references public.tournament_entry_invitations(id) on delete set null,
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  payment_marked_by uuid references public.profiles(id) on delete set null,
  payment_marked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(tournament_id,source_team_id),
  check ((payment_required and payment_status in ('PENDING','DONE')) or (not payment_required and payment_status = 'NOT_REQUIRED'))
);
create index tournament_team_applications_account_idx on public.tournament_team_applications(account_id);
create index tournament_team_applications_source_idx on public.tournament_team_applications(source_team_id);
create index tournament_team_applications_entry_idx on public.tournament_team_applications(entry_team_id);
create index tournament_team_applications_invite_idx on public.tournament_team_applications(invitation_id);
create index tournament_team_applications_reviewer_idx on public.tournament_team_applications(reviewed_by);
create index tournament_team_applications_payment_actor_idx on public.tournament_team_applications(payment_marked_by);

create table public.tournament_team_application_events (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.tournament_team_applications(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  kind text not null check (kind in ('SUBMITTED','REVIEWED','PAYMENT_MARKED','WITHDRAWN')),
  previous_value text,
  next_value text not null,
  created_at timestamptz not null default now()
);
create index tournament_team_application_events_application_idx on public.tournament_team_application_events(application_id);
create index tournament_team_application_events_actor_idx on public.tournament_team_application_events(actor_id);

alter table public.tournament_entry_invitations enable row level security;
alter table public.tournament_team_applications enable row level security;
alter table public.tournament_team_application_events enable row level security;
revoke all on public.tournament_entry_invitations, public.tournament_team_applications, public.tournament_team_application_events from anon, authenticated;
grant select (id,tournament_id,kind,placeholder_team_id,target_account_id,expires_at,revoked_at,use_count,max_uses,created_by,created_at) on public.tournament_entry_invitations to authenticated;
grant select on public.tournament_team_applications, public.tournament_team_application_events to authenticated;
create policy tournament_entry_invites_owner_read on public.tournament_entry_invitations for select to authenticated using (
  exists(select 1 from public.tournaments t where t.id = tournament_id and t.created_by = (select auth.uid()))
);
create policy tournament_team_applications_private_read on public.tournament_team_applications for select to authenticated using (
  account_id = (select auth.uid()) or exists(select 1 from public.tournaments t where t.id = tournament_id and t.created_by = (select auth.uid()))
);
create policy tournament_team_application_events_private_read on public.tournament_team_application_events for select to authenticated using (
  exists(select 1 from public.tournament_team_applications a where a.id = application_id)
);

-- The settings lock now protects capacity across invitations, approvals and legacy entry APIs.
create or replace function app_private.lock_team_entry_registration_mode()
returns trigger language plpgsql security definer set search_path = '' as $$
declare team_limit integer;
begin
  if new.tournament_id is not null then
    perform 1 from public.tournament_registration_settings where tournament_id = new.tournament_id for update;
    if tg_op = 'INSERT' or new.tournament_id is distinct from old.tournament_id then
      select planned_team_count into team_limit from public.tournaments where id = new.tournament_id;
      if team_limit is not null and (select count(*) from public.teams where tournament_id = new.tournament_id) >= team_limit then
        raise exception 'The tournament has no available team places';
      end if;
    end if;
  end if;
  return new;
end $$;

create or replace function app_private.configure_tournament_registration(
  p_tournament_id uuid, p_entry_mode text, p_published boolean, p_open boolean,
  p_fee_required boolean, p_fee_label text, p_payment_instructions text
) returns void language plpgsql security definer set search_path = '' as $$
declare current_config public.tournament_registration_settings; has_applications boolean;
begin
  if (select auth.uid()) is null or not exists(select 1 from public.tournaments where id = p_tournament_id and created_by = (select auth.uid())) then
    raise exception 'Only the tournament organiser can configure registrations';
  end if;
  select * into current_config from public.tournament_registration_settings where tournament_id = p_tournament_id for update;
  if not found then raise exception 'Registration settings unavailable'; end if;
  if p_entry_mode is null or p_entry_mode not in ('PLAYER_POOL','EXISTING_TEAMS') or p_published is null or p_open is null or p_fee_required is null then raise exception 'Invalid registration configuration'; end if;
  if p_open and not p_published then raise exception 'Publish the tournament before opening registration'; end if;
  has_applications := exists(select 1 from public.tournament_player_registrations where tournament_id = p_tournament_id)
    or exists(select 1 from public.tournament_team_applications where tournament_id = p_tournament_id);
  if p_entry_mode <> current_config.entry_mode and (has_applications or exists(select 1 from public.teams where tournament_id = p_tournament_id)) then raise exception 'Entry mode locks after the first application or team'; end if;
  if has_applications then
    if p_fee_required <> current_config.fee_required then raise exception 'Fee requirement locks after the first application'; end if;
    if not p_published then raise exception 'Close registration instead of unpublishing a tournament with applications'; end if;
  end if;
  if length(coalesce(p_fee_label,'')) > 120 or length(coalesce(p_payment_instructions,'')) > 1000 then raise exception 'Fee details are too long'; end if;
  if p_fee_required and length(trim(coalesce(p_fee_label,''))) = 0 then raise exception 'Describe the registration fee'; end if;
  update public.tournament_registration_settings set entry_mode = p_entry_mode,
    published_at = case when p_published then coalesce(published_at,now()) else null end,
    registration_open = p_open, fee_required = p_fee_required, fee_label = trim(coalesce(p_fee_label,'')),
    payment_instructions = trim(coalesce(p_payment_instructions,'')), updated_at = now() where tournament_id = p_tournament_id;
  if p_published then update public.tournaments set visibility = 'PUBLIC' where id = p_tournament_id; end if;
end $$;

create function app_private.create_tournament_entry_invitation(p_tournament_id uuid, p_placeholder_team_id uuid, p_target_account_id uuid, p_expires_hours integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare config public.tournament_registration_settings; placeholder public.teams; raw_token text; invite_id uuid; expiry timestamptz; invite_kind text;
begin
  if (select auth.uid()) is null or not exists(select 1 from public.tournaments where id = p_tournament_id and created_by = (select auth.uid())) then raise exception 'Only the tournament organiser can create invitations'; end if;
  select * into config from public.tournament_registration_settings where tournament_id = p_tournament_id for update;
  if not found then raise exception 'Registration settings unavailable'; end if;
  if p_expires_hours is null or p_expires_hours not between 1 and 720 then raise exception 'Invite expiry must be between 1 and 720 hours'; end if;
  if p_placeholder_team_id is not null then
    select * into placeholder from public.teams where id = p_placeholder_team_id and tournament_id = p_tournament_id for update;
    if not found or placeholder.source_team_id is not null then raise exception 'Choose an organiser placeholder team'; end if;
    if exists(select 1 from public.team_account_members where team_id = placeholder.id and role = 'CAPTAIN' and status = 'ACTIVE')
      or exists(select 1 from public.team_players where team_id = placeholder.id and is_captain) then raise exception 'This team already has a captain'; end if;
    if p_target_account_id is not null and not exists(select 1 from public.profiles where id = p_target_account_id) then raise exception 'Captain account unavailable'; end if;
    invite_kind := 'CLAIM_CAPTAIN';
    update public.tournament_entry_invitations set revoked_at = now() where placeholder_team_id = placeholder.id and revoked_at is null and use_count = 0;
  else
    if p_target_account_id is not null then raise exception 'A team application link cannot reserve a captain'; end if;
    if config.entry_mode <> 'EXISTING_TEAMS' or config.published_at is null or not config.registration_open then raise exception 'Open team applications before creating an entry link'; end if;
    invite_kind := 'TEAM_APPLICATION';
  end if;
  -- UUID randomness avoids an extension dependency; only the digest persists.
  raw_token := replace(gen_random_uuid()::text,'-','') || left(replace(gen_random_uuid()::text,'-',''),16);
  expiry := now() + make_interval(hours => p_expires_hours);
  insert into public.tournament_entry_invitations(tournament_id,kind,placeholder_team_id,target_account_id,token_hash,expires_at,max_uses,created_by)
  values(p_tournament_id,invite_kind,p_placeholder_team_id,p_target_account_id,sha256(convert_to(raw_token,'UTF8')),expiry,
    case when invite_kind = 'CLAIM_CAPTAIN' then 1 else 64 end,(select auth.uid())) returning id into invite_id;
  return jsonb_build_object('invitation_id',invite_id,'token',raw_token,'expires_at',expiry);
end $$;

create function app_private.preview_tournament_entry_invitation(p_token text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare invite public.tournament_entry_invitations; config public.tournament_registration_settings; tournament_name text; team_name text;
begin
  if (select auth.uid()) is null then raise exception 'Sign in to view this invitation'; end if;
  if p_token is null or p_token !~ '^[a-f0-9]{48}$' then raise exception 'Invitation invalid, expired, revoked or already used'; end if;
  select * into invite from public.tournament_entry_invitations where token_hash = sha256(convert_to(p_token,'UTF8')) and revoked_at is null and expires_at > now() and use_count < max_uses;
  if not found then raise exception 'Invitation invalid, expired, revoked or already used'; end if;
  if invite.target_account_id is not null and invite.target_account_id <> (select auth.uid()) then raise exception 'This invitation is reserved for another captain'; end if;
  select * into config from public.tournament_registration_settings where tournament_id = invite.tournament_id;
  select name into tournament_name from public.tournaments where id = invite.tournament_id;
  if invite.kind = 'CLAIM_CAPTAIN' then
    select name into team_name from public.teams where id = invite.placeholder_team_id and source_team_id is null;
    if not found or exists(select 1 from public.team_account_members where team_id = invite.placeholder_team_id and role = 'CAPTAIN' and status = 'ACTIVE')
      or exists(select 1 from public.team_players where team_id = invite.placeholder_team_id and is_captain) then raise exception 'This placeholder is no longer available'; end if;
  elsif config.published_at is null or not config.registration_open or config.entry_mode <> 'EXISTING_TEAMS' then raise exception 'Team applications are closed'; end if;
  return jsonb_build_object('kind',invite.kind,'tournament_id',invite.tournament_id,'tournament_name',tournament_name,
    'team_id',invite.placeholder_team_id,'team_name',team_name,'expires_at',invite.expires_at,
    'fee_required',config.fee_required,'fee_label',config.fee_label,'payment_instructions',config.payment_instructions);
end $$;

create function app_private.revoke_tournament_entry_invitation(p_invitation_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare tournament_id_value uuid;
begin
  select tournament_id into tournament_id_value from public.tournament_entry_invitations where id = p_invitation_id;
  if (select auth.uid()) is null or not exists(select 1 from public.tournaments where id = tournament_id_value and created_by = (select auth.uid())) then raise exception 'Only the tournament organiser can revoke invitations'; end if;
  perform 1 from public.tournament_registration_settings where tournament_id = tournament_id_value for update;
  update public.tournament_entry_invitations set revoked_at = coalesce(revoked_at,now()) where id = p_invitation_id;
end $$;

create function app_private.claim_tournament_placeholder(p_token text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare invite public.tournament_entry_invitations; tournament_id_value uuid; placeholder public.teams; player_id_value uuid; player_name text; squad_limit integer;
begin
  if (select auth.uid()) is null then raise exception 'Sign in to claim the captain role'; end if;
  if p_token is null or p_token !~ '^[a-f0-9]{48}$' then raise exception 'Invitation invalid, expired, revoked or already used'; end if;
  select tournament_id into tournament_id_value from public.tournament_entry_invitations where token_hash = sha256(convert_to(p_token,'UTF8'));
  perform 1 from public.tournament_registration_settings where tournament_id = tournament_id_value for update;
  select * into invite from public.tournament_entry_invitations where token_hash = sha256(convert_to(p_token,'UTF8')) for update;
  if not found or invite.kind <> 'CLAIM_CAPTAIN' or invite.revoked_at is not null or invite.expires_at <= now() or invite.use_count >= invite.max_uses then raise exception 'Invitation invalid, expired, revoked or already used'; end if;
  if invite.target_account_id is not null and invite.target_account_id <> (select auth.uid()) then raise exception 'This invitation is reserved for another captain'; end if;
  select * into placeholder from public.teams where id = invite.placeholder_team_id and tournament_id = invite.tournament_id for update;
  if not found or placeholder.source_team_id is not null then raise exception 'This placeholder is no longer available'; end if;
  if exists(select 1 from public.team_account_members where team_id = placeholder.id and role = 'CAPTAIN' and status = 'ACTIVE')
    or exists(select 1 from public.team_players where team_id = placeholder.id and is_captain) then raise exception 'This team already has a captain'; end if;
  select display_name into player_name from public.profiles where id = (select auth.uid());
  if not found then raise exception 'Complete your profile before claiming a team'; end if;
  insert into public.players(profile_id,display_name,created_by) values ((select auth.uid()),player_name,(select auth.uid()))
    on conflict (profile_id) where profile_id is not null do nothing;
  select id into player_id_value from public.players where profile_id = (select auth.uid());
  select players_per_team into squad_limit from public.tournaments where id = invite.tournament_id;
  if not exists(select 1 from public.team_players where team_id = placeholder.id and player_id = player_id_value)
    and (select count(*) from public.team_players where team_id = placeholder.id) >= squad_limit then raise exception 'The placeholder roster is full'; end if;
  if exists(select 1 from public.team_players p join public.teams t on t.id = p.team_id where t.tournament_id = invite.tournament_id and t.id <> placeholder.id and p.player_id = player_id_value) then raise exception 'You already play for another team in this tournament'; end if;
  insert into public.team_players(team_id,player_id,is_captain) values(placeholder.id,player_id_value,true)
    on conflict(team_id,player_id) do update set is_captain = true;
  insert into public.team_account_members(team_id,account_id,player_id,role,status)
    values(placeholder.id,(select auth.uid()),player_id_value,'CAPTAIN','ACTIVE')
    on conflict(team_id,account_id) do update set player_id = excluded.player_id,role = 'CAPTAIN',status = 'ACTIVE',updated_at = now();
  update public.tournament_entry_invitations set use_count = use_count + 1 where id = invite.id;
  return placeholder.id;
end $$;

create function app_private.submit_tournament_team_application(p_tournament_id uuid,p_source_team_id uuid,p_phone text,p_note text,p_token text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare config public.tournament_registration_settings; source public.teams; invite public.tournament_entry_invitations; application_id_value uuid; team_limit integer;
begin
  if (select auth.uid()) is null then raise exception 'Sign in to apply with a team'; end if;
  select * into config from public.tournament_registration_settings where tournament_id = p_tournament_id for update;
  if not found or config.entry_mode <> 'EXISTING_TEAMS' or config.published_at is null or not config.registration_open
    or not exists(select 1 from public.tournaments where id = p_tournament_id and visibility = 'PUBLIC') then raise exception 'Team applications are closed'; end if;
  if p_token is not null then
    if p_token !~ '^[a-f0-9]{48}$' then raise exception 'Invitation invalid, expired, revoked or already used'; end if;
    select * into invite from public.tournament_entry_invitations where token_hash = sha256(convert_to(p_token,'UTF8')) for update;
    if not found or invite.kind <> 'TEAM_APPLICATION' or invite.tournament_id <> p_tournament_id or invite.revoked_at is not null or invite.expires_at <= now() or invite.use_count >= invite.max_uses then raise exception 'Invitation invalid, expired, revoked or already used'; end if;
  end if;
  select planned_team_count into team_limit from public.tournaments where id = p_tournament_id;
  if (select count(*) from public.teams where tournament_id = p_tournament_id) >= team_limit then raise exception 'The tournament has no available team places'; end if;
  select * into source from public.teams where id = p_source_team_id and tournament_id is null and source_team_id is null for update;
  if not found then raise exception 'Choose a reusable club team'; end if;
  if not (coalesce(source.entity_owner_id = (select auth.uid()),false) or exists(select 1 from public.team_account_members where team_id = source.id and account_id = (select auth.uid()) and role = 'CAPTAIN' and status = 'ACTIVE')) then raise exception 'Only the team owner or active captain can apply'; end if;
  if p_phone is null or length(p_phone) > 40 or length(regexp_replace(p_phone,'[^0-9]','','g')) not between 7 and 15 then raise exception 'Enter a valid contact number'; end if;
  if length(coalesce(p_note,'')) > 1000 then raise exception 'Keep your note within 1000 characters'; end if;
  if exists(select 1 from public.tournament_team_applications where tournament_id = p_tournament_id and source_team_id = source.id)
    or exists(select 1 from public.teams where tournament_id = p_tournament_id and source_team_id = source.id) then raise exception 'This team already has an application or entry'; end if;
  insert into public.tournament_team_applications(tournament_id,account_id,source_team_id,team_name_snapshot,contact_phone,applicant_note,payment_required,payment_status,invitation_id)
    values(p_tournament_id,(select auth.uid()),source.id,source.name,trim(p_phone),trim(coalesce(p_note,'')),config.fee_required,
      case when config.fee_required then 'PENDING' else 'NOT_REQUIRED' end,invite.id) returning id into application_id_value;
  insert into public.tournament_team_application_events(application_id,actor_id,kind,next_value) values(application_id_value,(select auth.uid()),'SUBMITTED','PENDING');
  if invite.id is not null then update public.tournament_entry_invitations set use_count = use_count + 1 where id = invite.id; end if;
  return application_id_value;
end $$;

create function app_private.review_tournament_team_application(p_application_id uuid,p_status text,p_payment_status text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare application public.tournament_team_applications; config public.tournament_registration_settings; source public.teams;
  tournament_id_value uuid; entry_id uuid; squad_limit integer;
begin
  select tournament_id into tournament_id_value from public.tournament_team_applications where id = p_application_id;
  if (select auth.uid()) is null or not exists(select 1 from public.tournaments where id = tournament_id_value and created_by = (select auth.uid())) then raise exception 'Only the tournament organiser can review team applications'; end if;
  select * into config from public.tournament_registration_settings where tournament_id = tournament_id_value for update;
  select * into application from public.tournament_team_applications where id = p_application_id for update;
  if not found then raise exception 'Application unavailable'; end if;
  entry_id := application.entry_team_id;
  if p_status is not null then
    if p_status not in ('PENDING','APPROVED','REJECTED') or application.status = 'WITHDRAWN' then raise exception 'This application cannot be reviewed'; end if;
    if application.status = 'APPROVED' and p_status <> 'APPROVED' then raise exception 'Remove the approved team through tournament management'; end if;
    if application.status = 'APPROVED' and entry_id is null then raise exception 'This approved team entry was removed'; end if;
    if p_status = 'APPROVED' and application.status <> 'APPROVED' then
      if config.published_at is null or not config.registration_open or config.entry_mode <> 'EXISTING_TEAMS'
        or not exists(select 1 from public.tournaments where id = tournament_id_value and visibility = 'PUBLIC') then raise exception 'Open team applications before approving an entry'; end if;
      select * into source from public.teams where id = application.source_team_id and tournament_id is null and source_team_id is null for update;
      if not found then raise exception 'The source club is no longer available'; end if;
      if not (coalesce(source.entity_owner_id = application.account_id,false) or exists(select 1 from public.team_account_members where team_id = source.id and account_id = application.account_id and role = 'CAPTAIN' and status = 'ACTIVE')) then raise exception 'The applicant no longer manages this team'; end if;
      perform 1 from public.team_players where team_id = source.id for share;
      perform 1 from public.team_account_members where team_id = source.id for share;
      select players_per_team into squad_limit from public.tournaments where id = tournament_id_value;
      if (select count(*) from public.team_players where team_id = source.id) not between 1 and squad_limit then raise exception 'Review the team roster size before approval'; end if;
      if not exists(select 1 from public.team_account_members m join public.team_players p on p.team_id = m.team_id and p.player_id = m.player_id and p.is_captain where m.team_id = source.id and m.role = 'CAPTAIN' and m.status = 'ACTIVE') then raise exception 'Assign an active captain before approval'; end if;
      if exists(select 1 from public.team_players p join public.teams t on t.id = p.team_id where t.tournament_id = tournament_id_value and p.player_id in (select player_id from public.team_players where team_id = source.id)) then raise exception 'A roster player already plays for another tournament team'; end if;
      insert into public.teams(tournament_id,name,short_name,color_hex,logo_url,entity_owner_id,source_team_id)
        values(tournament_id_value,source.name,source.short_name,source.color_hex,source.logo_url,source.entity_owner_id,source.id) returning id into entry_id;
      insert into public.team_players(team_id,player_id,jersey_no,is_captain,is_keeper,created_at)
        select entry_id,player_id,jersey_no,is_captain,is_keeper,now() from public.team_players where team_id = source.id;
      insert into public.team_account_members(team_id,account_id,player_id,role,status,joined_at,updated_at)
        select entry_id,account_id,player_id,role,status,now(),now() from public.team_account_members where team_id = source.id and status = 'ACTIVE';
    end if;
    update public.tournament_team_applications set status = p_status,entry_team_id = entry_id,reviewed_by = (select auth.uid()),reviewed_at = now(),updated_at = now() where id = p_application_id;
    insert into public.tournament_team_application_events(application_id,actor_id,kind,previous_value,next_value) values(p_application_id,(select auth.uid()),'REVIEWED',application.status,p_status);
  end if;
  if p_payment_status is not null then
    if (application.payment_required and p_payment_status not in ('PENDING','DONE')) or (not application.payment_required and p_payment_status <> 'NOT_REQUIRED') then raise exception 'Invalid payment flag for this application'; end if;
    update public.tournament_team_applications set payment_status = p_payment_status,payment_marked_by = (select auth.uid()),payment_marked_at = now(),updated_at = now() where id = p_application_id;
    insert into public.tournament_team_application_events(application_id,actor_id,kind,previous_value,next_value) values(p_application_id,(select auth.uid()),'PAYMENT_MARKED',application.payment_status,p_payment_status);
  end if;
  return entry_id;
end $$;

create function app_private.withdraw_tournament_team_application(p_application_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare application public.tournament_team_applications;
begin
  select * into application from public.tournament_team_applications where id = p_application_id for update;
  if not found or (select auth.uid()) is null or application.account_id <> (select auth.uid()) then raise exception 'Only the applicant can withdraw'; end if;
  if application.status <> 'PENDING' then raise exception 'Only pending team applications can be withdrawn'; end if;
  update public.tournament_team_applications set status = 'WITHDRAWN',updated_at = now() where id = p_application_id;
  insert into public.tournament_team_application_events(application_id,actor_id,kind,previous_value,next_value) values(p_application_id,(select auth.uid()),'WITHDRAWN',application.status,'WITHDRAWN');
end $$;

create function app_private.list_tournament_roster_players(p_tournament_id uuid)
returns table(player_id uuid,account_id uuid,display_name text,playing_role text,team_names text[])
language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null or not exists(select 1 from public.tournaments t join public.tournament_registration_settings c on c.tournament_id = t.id
    where t.id = p_tournament_id and (t.created_by = (select auth.uid()) or (t.visibility = 'PUBLIC' and c.published_at is not null))) then raise exception 'Tournament player directory unavailable'; end if;
  return query select p.id,p.profile_id,p.display_name,case when p.role in ('BAT','BOWL','AR','WK') then p.role else 'AR' end,
    array_agg(distinct t.name order by t.name) from public.teams t join public.team_players r on r.team_id = t.id join public.players p on p.id = r.player_id
    where t.tournament_id = p_tournament_id group by p.id,p.profile_id,p.display_name,p.role order by lower(p.display_name),p.id;
end $$;

create function public.create_tournament_entry_invitation(p_tournament_id uuid,p_placeholder_team_id uuid default null,p_target_account_id uuid default null,p_expires_hours integer default 168)
returns jsonb language sql security invoker set search_path = '' as $$ select app_private.create_tournament_entry_invitation(p_tournament_id,p_placeholder_team_id,p_target_account_id,p_expires_hours) $$;
create function public.preview_tournament_entry_invitation(p_token text)
returns jsonb language sql security invoker set search_path = '' as $$ select app_private.preview_tournament_entry_invitation(p_token) $$;
create function public.revoke_tournament_entry_invitation(p_invitation_id uuid)
returns void language sql security invoker set search_path = '' as $$ select app_private.revoke_tournament_entry_invitation(p_invitation_id) $$;
create function public.claim_tournament_placeholder(p_token text)
returns uuid language sql security invoker set search_path = '' as $$ select app_private.claim_tournament_placeholder(p_token) $$;
create function public.submit_tournament_team_application(p_tournament_id uuid,p_source_team_id uuid,p_phone text,p_note text,p_token text default null)
returns uuid language sql security invoker set search_path = '' as $$ select app_private.submit_tournament_team_application(p_tournament_id,p_source_team_id,p_phone,p_note,p_token) $$;
create function public.review_tournament_team_application(p_application_id uuid,p_status text default null,p_payment_status text default null)
returns uuid language sql security invoker set search_path = '' as $$ select app_private.review_tournament_team_application(p_application_id,p_status,p_payment_status) $$;
create function public.withdraw_tournament_team_application(p_application_id uuid)
returns void language sql security invoker set search_path = '' as $$ select app_private.withdraw_tournament_team_application(p_application_id) $$;
create function public.list_tournament_roster_players(p_tournament_id uuid)
returns table(player_id uuid,account_id uuid,display_name text,playing_role text,team_names text[])
language sql security invoker set search_path = '' as $$ select * from app_private.list_tournament_roster_players(p_tournament_id) $$;

revoke all on function app_private.create_tournament_entry_invitation(uuid,uuid,uuid,integer),public.create_tournament_entry_invitation(uuid,uuid,uuid,integer),
  app_private.preview_tournament_entry_invitation(text),public.preview_tournament_entry_invitation(text),
  app_private.revoke_tournament_entry_invitation(uuid),public.revoke_tournament_entry_invitation(uuid),
  app_private.claim_tournament_placeholder(text),public.claim_tournament_placeholder(text),
  app_private.submit_tournament_team_application(uuid,uuid,text,text,text),public.submit_tournament_team_application(uuid,uuid,text,text,text),
  app_private.review_tournament_team_application(uuid,text,text),public.review_tournament_team_application(uuid,text,text),
  app_private.withdraw_tournament_team_application(uuid),public.withdraw_tournament_team_application(uuid),
  app_private.list_tournament_roster_players(uuid),public.list_tournament_roster_players(uuid) from public,anon;
grant execute on function app_private.create_tournament_entry_invitation(uuid,uuid,uuid,integer),public.create_tournament_entry_invitation(uuid,uuid,uuid,integer),
  app_private.preview_tournament_entry_invitation(text),public.preview_tournament_entry_invitation(text),
  app_private.revoke_tournament_entry_invitation(uuid),public.revoke_tournament_entry_invitation(uuid),
  app_private.claim_tournament_placeholder(text),public.claim_tournament_placeholder(text),
  app_private.submit_tournament_team_application(uuid,uuid,text,text,text),public.submit_tournament_team_application(uuid,uuid,text,text,text),
  app_private.review_tournament_team_application(uuid,text,text),public.review_tournament_team_application(uuid,text,text),
  app_private.withdraw_tournament_team_application(uuid),public.withdraw_tournament_team_application(uuid),
  app_private.list_tournament_roster_players(uuid),public.list_tournament_roster_players(uuid) to authenticated;

notify pgrst, 'reload schema';
