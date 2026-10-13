-- Allocation is distinct from approval and from the captain's management role.
create table public.tournament_player_allocations (
  registration_id uuid primary key references public.tournament_player_registrations(id) on delete cascade,
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete restrict,
  team_id uuid not null references public.teams(id) on delete cascade,
  captain_label boolean not null default false,
  icon_label boolean not null default false,
  assigned_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  unique(tournament_id, player_id)
);
create index tournament_allocations_team_idx on public.tournament_player_allocations(team_id);
create index tournament_allocations_actor_idx on public.tournament_player_allocations(assigned_by);
alter table public.tournament_player_allocations enable row level security;
revoke all on public.tournament_player_allocations from anon, authenticated;
grant select on public.tournament_player_allocations to authenticated;
create policy allocation_read on public.tournament_player_allocations for select to authenticated using (
  exists(select 1 from public.tournaments t join public.tournament_registration_settings s on s.tournament_id=t.id
    where t.id=tournament_player_allocations.tournament_id and (t.created_by=(select auth.uid()) or (t.visibility='PUBLIC' and s.published_at is not null)))
  or exists(select 1 from public.tournament_player_registrations r where r.id=registration_id and r.account_id=(select auth.uid()))
);

-- All roster insertion paths share the same lock and constraints, including legacy RPCs.
create function app_private.guard_tournament_roster() returns trigger
language plpgsql security definer set search_path='' as $$
declare tour uuid; mode text; squad integer;
begin
  select tournament_id into tour from public.teams where id=new.team_id;
  if tour is null then return new; end if;
  select entry_mode into mode from public.tournament_registration_settings where tournament_id=tour for update;
  select players_per_team into squad from public.tournaments where id=tour;
  if not exists(select 1 from public.team_players where team_id=new.team_id and player_id=new.player_id)
    and (select count(*) from public.team_players where team_id=new.team_id)>=squad then raise exception 'This tournament roster is full'; end if;
  if exists(select 1 from public.team_players r join public.teams t on t.id=r.team_id
    where t.tournament_id=tour and r.team_id<>new.team_id and r.player_id=new.player_id) then
    raise exception 'Player already belongs to another team in this tournament'; end if;
  if mode='PLAYER_POOL' and not exists(select 1 from public.tournament_player_registrations r
    join public.tournament_player_allocations a on a.registration_id=r.id
    where r.tournament_id=tour and r.player_id=new.player_id and r.status='APPROVED' and a.team_id=new.team_id) then
    raise exception 'Allocate an approved pool player before adding them to this roster'; end if;
  return new;
end $$;
revoke all on function app_private.guard_tournament_roster() from public,anon,authenticated;
create trigger guard_tournament_roster before insert or update of team_id,player_id on public.team_players
for each row execute function app_private.guard_tournament_roster();

create function app_private.clear_removed_player_allocation() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  delete from public.tournament_player_allocations where team_id=old.team_id and player_id=old.player_id;
  return old;
end $$;
revoke all on function app_private.clear_removed_player_allocation() from public,anon,authenticated;
create trigger clear_removed_player_allocation after delete on public.team_players
for each row execute function app_private.clear_removed_player_allocation();

create function app_private.guard_allocated_registration_review() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.status<>'APPROVED' and exists(select 1 from public.tournament_player_allocations where registration_id=new.id) then
    raise exception 'Remove the team allocation before changing approval or withdrawing'; end if;
  return new;
end $$;
revoke all on function app_private.guard_allocated_registration_review() from public,anon,authenticated;
create trigger guard_allocated_registration_review before update of status on public.tournament_player_registrations
for each row execute function app_private.guard_allocated_registration_review();

create function app_private.allocate_tournament_player(p_registration_id uuid,p_team_id uuid,p_captain_label boolean,p_icon_label boolean)
returns void language plpgsql security definer set search_path='' as $$
declare r public.tournament_player_registrations; old_team uuid; tour uuid; mode text;
begin
  select tournament_id into tour from public.tournament_player_registrations where id=p_registration_id;
  if (select auth.uid()) is null or not exists(select 1 from public.tournaments where id=tour and created_by=(select auth.uid())) then
    raise exception 'Only the tournament organiser can allocate players'; end if;
  select entry_mode into mode from public.tournament_registration_settings where tournament_id=tour for update;
  select * into r from public.tournament_player_registrations where id=p_registration_id for update;
  if mode<>'PLAYER_POOL' or r.status<>'APPROVED' then raise exception 'Only approved pool players can be allocated'; end if;
  if p_captain_label is null or p_icon_label is null then raise exception 'Choose valid player labels'; end if;
  select team_id into old_team from public.tournament_player_allocations where registration_id=r.id;
  if p_team_id is not null and not exists(select 1 from public.teams where id=p_team_id and tournament_id=tour) then
    raise exception 'Choose a team in this tournament'; end if;
  if old_team is distinct from p_team_id and old_team is not null then
    if exists(select 1 from public.team_players where team_id=old_team and player_id=r.player_id and is_captain) then
      raise exception 'Remove the actual captain role before moving this player'; end if;
    delete from public.team_players where team_id=old_team and player_id=r.player_id;
    delete from public.team_account_members where team_id=old_team and account_id=r.account_id;
  end if;
  if p_team_id is null then return; end if;
  insert into public.tournament_player_allocations(registration_id,tournament_id,player_id,team_id,captain_label,icon_label,assigned_by)
    values(r.id,tour,r.player_id,p_team_id,p_captain_label,p_icon_label,(select auth.uid()))
    on conflict(registration_id) do update set team_id=excluded.team_id,captain_label=excluded.captain_label,
      icon_label=excluded.icon_label,assigned_by=excluded.assigned_by,updated_at=now();
  insert into public.team_players(team_id,player_id,is_captain) values(p_team_id,r.player_id,false) on conflict do nothing;
  insert into public.team_account_members(team_id,account_id,player_id,role,status)
    values(p_team_id,r.account_id,r.player_id,'PLAYER','ACTIVE')
    on conflict(team_id,account_id) do update set status='ACTIVE',updated_at=now();
end $$;
create function public.allocate_tournament_player(p_registration_id uuid,p_team_id uuid default null,p_captain_label boolean default false,p_icon_label boolean default false)
returns void language sql security invoker set search_path='' as $$
  select app_private.allocate_tournament_player(p_registration_id,p_team_id,p_captain_label,p_icon_label)
$$;
revoke all on function app_private.allocate_tournament_player(uuid,uuid,boolean,boolean),public.allocate_tournament_player(uuid,uuid,boolean,boolean) from public,anon;
grant execute on function app_private.allocate_tournament_player(uuid,uuid,boolean,boolean),public.allocate_tournament_player(uuid,uuid,boolean,boolean) to authenticated;

-- Private custom answers never appear in the Players directory.
create table public.tournament_registration_forms (
  tournament_id uuid primary key references public.tournaments(id) on delete cascade,
  questions jsonb not null default '[]',
  updated_at timestamptz not null default now()
);
alter table public.tournament_registration_forms enable row level security;
revoke all on public.tournament_registration_forms from anon,authenticated;
grant select on public.tournament_registration_forms to authenticated;
create policy registration_form_read on public.tournament_registration_forms for select to authenticated using (
  exists(select 1 from public.tournaments t join public.tournament_registration_settings s on s.tournament_id=t.id
    where t.id=tournament_registration_forms.tournament_id and (t.created_by=(select auth.uid()) or (t.visibility='PUBLIC' and s.published_at is not null)))
);
alter table public.tournament_player_registrations add column custom_answers jsonb not null default '{}';
alter table public.tournament_team_applications add column custom_answers jsonb not null default '{}';

create function app_private.configure_tournament_registration_form(p_tournament_id uuid,p_questions jsonb)
returns void language plpgsql security definer set search_path='' as $$
declare q jsonb;
begin
  if (select auth.uid()) is null or not exists(select 1 from public.tournaments where id=p_tournament_id and created_by=(select auth.uid())) then
    raise exception 'Only the tournament organiser can configure the form'; end if;
  perform 1 from public.tournament_registration_settings where tournament_id=p_tournament_id for update;
  if exists(select 1 from public.tournament_player_registrations where tournament_id=p_tournament_id)
    or exists(select 1 from public.tournament_team_applications where tournament_id=p_tournament_id) then
    raise exception 'The form locks after the first application'; end if;
  if p_questions is null or jsonb_typeof(p_questions)<>'array' then raise exception 'Choose a valid question list'; end if;
  if length(p_questions::text)>16000 then raise exception 'Keep the form within its size limit'; end if;
  if jsonb_array_length(p_questions)>8 then raise exception 'Use at most eight questions'; end if;
  for q in select value from jsonb_array_elements(p_questions) loop
    if jsonb_typeof(q)<>'object' or coalesce(q->>'id','')!~'^[a-zA-Z0-9_-]{1,64}$'
      or length(trim(coalesce(q->>'label',''))) not between 1 and 120
      or coalesce(q->>'type','') not in ('TEXT','CHOICE') or jsonb_typeof(q->'required') is distinct from 'boolean' then
      raise exception 'Each question needs an id, label, type and required flag'; end if;
    if q->>'type'='CHOICE' then
      if jsonb_typeof(q->'options') is distinct from 'array' then raise exception 'Choice questions need options'; end if;
      if jsonb_array_length(q->'options') not between 2 and 8 or exists(select 1 from jsonb_array_elements(q->'options') o
        where jsonb_typeof(o)<>'string' or length(trim(o#>>'{}')) not between 1 and 80)
        or (select count(*) from jsonb_array_elements(q->'options'))<>(select count(distinct value) from jsonb_array_elements(q->'options')) then
        raise exception 'Use two to eight distinct choice options'; end if;
    end if;
  end loop;
  if (select count(*) from jsonb_array_elements(p_questions))<>(select count(distinct value->>'id') from jsonb_array_elements(p_questions)) then
    raise exception 'Question ids must be unique'; end if;
  insert into public.tournament_registration_forms(tournament_id,questions) values(p_tournament_id,p_questions)
    on conflict(tournament_id) do update set questions=excluded.questions,updated_at=now();
end $$;

create function app_private.validate_tournament_answers(p_tournament_id uuid,p_answers jsonb)
returns void language plpgsql security definer set search_path='' as $$
declare questions jsonb; q jsonb; answer text;
begin
  select coalesce(f.questions,'[]') into questions from public.tournament_registration_forms f where f.tournament_id=p_tournament_id;
  questions:=coalesce(questions,'[]');
  if p_answers is null or jsonb_typeof(p_answers)<>'object' then raise exception 'Choose valid form answers'; end if;
  if exists(select 1 from jsonb_object_keys(p_answers) k where not exists(select 1 from jsonb_array_elements(questions) answer_question where answer_question->>'id'=k)) then
    raise exception 'Unknown form question'; end if;
  for q in select value from jsonb_array_elements(questions) loop
    if p_answers ? (q->>'id') and jsonb_typeof(p_answers->(q->>'id'))<>'string' then raise exception 'Form answers must be text'; end if;
    answer:=trim(coalesce(p_answers->>(q->>'id'),''));
    if (q->>'required')::boolean and length(answer)=0 then raise exception 'Answer: %',q->>'label'; end if;
    if length(answer)>500 then raise exception 'Keep answers within 500 characters'; end if;
    if q->>'type'='CHOICE' and answer<>'' and not (q->'options' ? answer) then raise exception 'Choose a listed option for %',q->>'label'; end if;
  end loop;
end $$;
revoke all on function app_private.validate_tournament_answers(uuid,jsonb) from public,anon,authenticated;
create function public.configure_tournament_registration_form(p_tournament_id uuid,p_questions jsonb)
returns void language sql security invoker set search_path='' as $$ select app_private.configure_tournament_registration_form(p_tournament_id,p_questions) $$;
revoke all on function app_private.configure_tournament_registration_form(uuid,jsonb),public.configure_tournament_registration_form(uuid,jsonb) from public,anon;
grant execute on function app_private.configure_tournament_registration_form(uuid,jsonb),public.configure_tournament_registration_form(uuid,jsonb) to authenticated;

create function app_private.submit_tournament_player_form(p_tournament_id uuid, p_role text, p_phone text, p_note text,p_answers jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare config public.tournament_registration_settings; player_id_value uuid; registration_id_value uuid; player_name text;
begin
  if (select auth.uid()) is null then raise exception 'Sign in to register'; end if;
  select * into config from public.tournament_registration_settings where tournament_id = p_tournament_id for update;
  if not found or config.published_at is null or not config.registration_open or not exists (
    select 1 from public.tournaments where id = p_tournament_id and visibility = 'PUBLIC'
  ) then raise exception 'Registration is closed'; end if;
  if config.entry_mode <> 'PLAYER_POOL' then raise exception 'Players join this tournament through their team'; end if;
  perform app_private.validate_tournament_answers(p_tournament_id,p_answers);
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
  insert into public.tournament_player_registrations(tournament_id, account_id, player_id, playing_role, contact_phone, applicant_note, payment_status, payment_required, custom_answers)
  values (p_tournament_id, (select auth.uid()), player_id_value, p_role, trim(p_phone), trim(coalesce(p_note,'')),
    case when config.fee_required then 'PENDING' else 'NOT_REQUIRED' end, config.fee_required, p_answers)
  returning id into registration_id_value;
  insert into public.tournament_registration_events(registration_id, actor_id, kind, next_value)
  values (registration_id_value, (select auth.uid()), 'SUBMITTED', 'PENDING');
  return registration_id_value;
end $$;
create function app_private.submit_tournament_team_form(p_tournament_id uuid,p_source_team_id uuid,p_phone text,p_note text,p_token text,p_answers jsonb)
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
  perform app_private.validate_tournament_answers(p_tournament_id,p_answers);
  if p_phone is null or length(p_phone) > 40 or length(regexp_replace(p_phone,'[^0-9]','','g')) not between 7 and 15 then raise exception 'Enter a valid contact number'; end if;
  if length(coalesce(p_note,'')) > 1000 then raise exception 'Keep your note within 1000 characters'; end if;
  if exists(select 1 from public.tournament_team_applications where tournament_id = p_tournament_id and source_team_id = source.id)
    or exists(select 1 from public.teams where tournament_id = p_tournament_id and source_team_id = source.id) then raise exception 'This team already has an application or entry'; end if;
  insert into public.tournament_team_applications(tournament_id,account_id,source_team_id,team_name_snapshot,contact_phone,applicant_note,payment_required,payment_status,invitation_id,custom_answers)
    values(p_tournament_id,(select auth.uid()),source.id,source.name,trim(p_phone),trim(coalesce(p_note,'')),config.fee_required,
      case when config.fee_required then 'PENDING' else 'NOT_REQUIRED' end,invite.id,p_answers) returning id into application_id_value;
  insert into public.tournament_team_application_events(application_id,actor_id,kind,next_value) values(application_id_value,(select auth.uid()),'SUBMITTED','PENDING');
  if invite.id is not null then update public.tournament_entry_invitations set use_count = use_count + 1 where id = invite.id; end if;
  return application_id_value;
end $$;
create or replace function app_private.submit_tournament_player_registration(p_tournament_id uuid,p_role text,p_phone text,p_note text)
returns uuid language sql security definer set search_path='' as $$ select app_private.submit_tournament_player_form(p_tournament_id,p_role,p_phone,p_note,'{}') $$;
create or replace function app_private.submit_tournament_team_application(p_tournament_id uuid,p_source_team_id uuid,p_phone text,p_note text,p_token text)
returns uuid language sql security definer set search_path='' as $$ select app_private.submit_tournament_team_form(p_tournament_id,p_source_team_id,p_phone,p_note,p_token,'{}') $$;
create function public.submit_tournament_player_form(p_tournament_id uuid,p_role text,p_phone text,p_note text,p_answers jsonb default '{}')
returns uuid language sql security invoker set search_path='' as $$ select app_private.submit_tournament_player_form(p_tournament_id,p_role,p_phone,p_note,p_answers) $$;
create function public.submit_tournament_team_form(p_tournament_id uuid,p_source_team_id uuid,p_phone text,p_note text,p_token text default null,p_answers jsonb default '{}')
returns uuid language sql security invoker set search_path='' as $$ select app_private.submit_tournament_team_form(p_tournament_id,p_source_team_id,p_phone,p_note,p_token,p_answers) $$;
revoke all on function app_private.submit_tournament_player_form(uuid,text,text,text,jsonb),public.submit_tournament_player_form(uuid,text,text,text,jsonb),
  app_private.submit_tournament_team_form(uuid,uuid,text,text,text,jsonb),public.submit_tournament_team_form(uuid,uuid,text,text,text,jsonb) from public,anon;
grant execute on function app_private.submit_tournament_player_form(uuid,text,text,text,jsonb),public.submit_tournament_player_form(uuid,text,text,text,jsonb),
  app_private.submit_tournament_team_form(uuid,uuid,text,text,text,jsonb),public.submit_tournament_team_form(uuid,uuid,text,text,text,jsonb) to authenticated;
notify pgrst,'reload schema';
