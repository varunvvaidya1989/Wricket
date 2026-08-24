alter table public.sport_competitions
  add column logo_url text,
  add column banner_url text,
  add column organizer_phone text,
  add column social_media_url text,
  add column planned_entry_count integer;

alter table public.sport_competitions
  add constraint sport_competitions_organizer_phone_check
    check (organizer_phone is null or length(trim(organizer_phone)) between 7 and 30),
  add constraint sport_competitions_social_media_url_check
    check (social_media_url is null or social_media_url ~* '^https?://[^[:space:]]+$'),
  add constraint sport_competitions_planned_entry_count_check
    check (planned_entry_count is null or planned_entry_count between 2 and 256);

alter table public.sport_competition_venues
  add column latitude double precision,
  add column longitude double precision,
  add column google_place_id text,
  add column google_maps_url text,
  add constraint sport_competition_venues_latitude_check
    check (latitude is null or latitude between -90 and 90),
  add constraint sport_competition_venues_longitude_check
    check (longitude is null or longitude between -180 and 180),
  add constraint sport_competition_venues_coordinate_pair_check
    check ((latitude is null) = (longitude is null));

create or replace function app_private.create_sport_competition_profile(
  p_sport_code text,
  p_kind public.sport_competition_kind,
  p_name text,
  p_rules jsonb,
  p_match_format text default 'SINGLES',
  p_visibility public.sport_resource_visibility default 'PRIVATE',
  p_timezone text default 'UTC',
  p_description text default null,
  p_organizer_phone text default null,
  p_social_media_url text default null,
  p_planned_entry_count integer default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare competition_id_value uuid;
begin
  if p_organizer_phone is not null and length(trim(p_organizer_phone)) not between 7 and 30 then
    raise exception 'Enter a valid organizer phone number';
  end if;
  if p_social_media_url is not null and trim(p_social_media_url) !~* '^https?://[^[:space:]]+$' then
    raise exception 'Social link must begin with http:// or https://';
  end if;
  if p_planned_entry_count is not null and p_planned_entry_count not between 2 and 256 then
    raise exception 'Planned participant count must be between 2 and 256';
  end if;
  competition_id_value := app_private.create_sport_competition_with_rules(
    p_sport_code, p_kind, p_name, p_rules, p_match_format, p_visibility, p_timezone
  );
  update public.sport_competitions set
    description = nullif(trim(p_description), ''),
    organizer_phone = nullif(trim(p_organizer_phone), ''),
    social_media_url = nullif(trim(p_social_media_url), ''),
    planned_entry_count = p_planned_entry_count,
    updated_at = now()
  where id = competition_id_value;
  return competition_id_value;
end;
$$;

create or replace function public.create_sport_competition_profile(
  p_sport_code text,
  p_kind public.sport_competition_kind,
  p_name text,
  p_rules jsonb,
  p_match_format text default 'SINGLES',
  p_visibility public.sport_resource_visibility default 'PRIVATE',
  p_timezone text default 'UTC',
  p_description text default null,
  p_organizer_phone text default null,
  p_social_media_url text default null,
  p_planned_entry_count integer default null
)
returns uuid language sql security definer set search_path = public
as $$ select app_private.create_sport_competition_profile(
  p_sport_code, p_kind, p_name, p_rules, p_match_format, p_visibility, p_timezone,
  p_description, p_organizer_phone, p_social_media_url, p_planned_entry_count
) $$;

create or replace function app_private.update_sport_competition_profile(
  p_competition_id uuid,
  p_organizer_phone text,
  p_social_media_url text,
  p_planned_entry_count integer
)
returns void language plpgsql security definer set search_path = public
as $$
declare selected public.sport_competitions%rowtype;
begin
  selected := app_private.require_managed_competition(p_competition_id);
  if p_organizer_phone is not null and length(trim(p_organizer_phone)) not between 7 and 30 then
    raise exception 'Enter a valid organizer phone number';
  end if;
  if p_social_media_url is not null and trim(p_social_media_url) !~* '^https?://[^[:space:]]+$' then
    raise exception 'Social link must begin with http:// or https://';
  end if;
  if p_planned_entry_count is not null and p_planned_entry_count not between 2 and 256 then
    raise exception 'Planned participant count must be between 2 and 256';
  end if;
  update public.sport_competitions set
    organizer_phone = nullif(trim(p_organizer_phone), ''),
    social_media_url = nullif(trim(p_social_media_url), ''),
    planned_entry_count = p_planned_entry_count,
    updated_at = now()
  where id = selected.id;
end;
$$;

create or replace function public.update_sport_competition_profile(
  p_competition_id uuid, p_organizer_phone text, p_social_media_url text,
  p_planned_entry_count integer
)
returns void language sql security definer set search_path = public
as $$ select app_private.update_sport_competition_profile(
  p_competition_id, p_organizer_phone, p_social_media_url, p_planned_entry_count
) $$;

create or replace function app_private.update_sport_competition_media(
  p_competition_id uuid,
  p_kind text,
  p_url text
)
returns void language plpgsql security definer set search_path = public
as $$
declare selected public.sport_competitions%rowtype;
begin
  selected := app_private.require_managed_competition(p_competition_id);
  if p_kind not in ('logo', 'banner') or nullif(trim(p_url), '') is null then
    raise exception 'Competition media is invalid';
  end if;
  if p_kind = 'logo' then
    update public.sport_competitions set logo_url = trim(p_url), updated_at = now() where id = selected.id;
  else
    update public.sport_competitions set banner_url = trim(p_url), updated_at = now() where id = selected.id;
  end if;
end;
$$;

create or replace function public.update_sport_competition_media(
  p_competition_id uuid, p_kind text, p_url text
)
returns void language sql security definer set search_path = public
as $$ select app_private.update_sport_competition_media(p_competition_id, p_kind, p_url) $$;

create or replace function app_private.set_sport_competition_venue_place(
  p_venue_id uuid, p_name text, p_address text, p_latitude double precision,
  p_longitude double precision, p_google_place_id text, p_google_maps_url text
)
returns void language plpgsql security definer set search_path = public
as $$
declare competition_id_value uuid;
begin
  select competition_id into competition_id_value from public.sport_competition_venues where id = p_venue_id;
  perform app_private.require_managed_competition(competition_id_value);
  if p_latitude not between -90 and 90 or p_longitude not between -180 and 180 then
    raise exception 'Venue coordinates are invalid';
  end if;
  update public.sport_competition_venues set
    name = trim(p_name), address = nullif(trim(p_address), ''), latitude = p_latitude,
    longitude = p_longitude, google_place_id = nullif(trim(p_google_place_id), ''),
    google_maps_url = nullif(trim(p_google_maps_url), ''), updated_at = now()
  where id = p_venue_id;
end;
$$;

create or replace function public.set_sport_competition_venue_place(
  p_venue_id uuid, p_name text, p_address text, p_latitude double precision,
  p_longitude double precision, p_google_place_id text, p_google_maps_url text
)
returns void language sql security definer set search_path = public
as $$ select app_private.set_sport_competition_venue_place(
  p_venue_id, p_name, p_address, p_latitude, p_longitude, p_google_place_id, p_google_maps_url
) $$;

create or replace function app_private.get_sport_competition_owner_contact(p_competition_id uuid)
returns table(display_name text, phone text)
language plpgsql stable security definer set search_path = public
as $$
begin
  if not app_private.can_read_sport_competition(p_competition_id) then
    raise exception 'Competition was not found';
  end if;
  return query
  select coalesce(profile.display_name, 'Competition organizer'), competition.organizer_phone
  from public.sport_competitions competition
  join public.profiles profile on profile.id = competition.owner_account_id
  where competition.id = p_competition_id;
end;
$$;

create or replace function public.get_sport_competition_owner_contact(p_competition_id uuid)
returns table(display_name text, phone text)
language sql stable security definer set search_path = public
as $$ select * from app_private.get_sport_competition_owner_contact(p_competition_id) $$;

revoke all on function app_private.create_sport_competition_profile(text, public.sport_competition_kind, text, jsonb, text, public.sport_resource_visibility, text, text, text, text, integer),
  app_private.update_sport_competition_profile(uuid, text, text, integer),
  app_private.update_sport_competition_media(uuid, text, text),
  app_private.set_sport_competition_venue_place(uuid, text, text, double precision, double precision, text, text),
  app_private.get_sport_competition_owner_contact(uuid)
from public, anon, authenticated;

revoke all on function public.create_sport_competition_profile(text, public.sport_competition_kind, text, jsonb, text, public.sport_resource_visibility, text, text, text, text, integer),
  public.update_sport_competition_profile(uuid, text, text, integer),
  public.update_sport_competition_media(uuid, text, text),
  public.set_sport_competition_venue_place(uuid, text, text, double precision, double precision, text, text),
  public.get_sport_competition_owner_contact(uuid)
from public, anon;

grant execute on function public.create_sport_competition_profile(text, public.sport_competition_kind, text, jsonb, text, public.sport_resource_visibility, text, text, text, text, integer),
  public.update_sport_competition_profile(uuid, text, text, integer),
  public.update_sport_competition_media(uuid, text, text),
  public.set_sport_competition_venue_place(uuid, text, text, double precision, double precision, text, text),
  public.get_sport_competition_owner_contact(uuid)
to authenticated;
