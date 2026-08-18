-- Owner-defined stages, divisions, and venues all have explicit manual order.

alter table public.sport_competition_venues add column display_order integer;
with ordered as (
  select id, row_number() over (partition by competition_id order by name, id) - 1 as position
  from public.sport_competition_venues
)
update public.sport_competition_venues venue set display_order = ordered.position
from ordered where ordered.id = venue.id;
alter table public.sport_competition_venues
  alter column display_order set not null,
  add constraint sport_competition_venues_display_order_check check (display_order >= 0),
  add constraint sport_competition_venues_competition_display_order_key unique (competition_id, display_order);

create or replace function app_private.add_sport_competition_venue(
  p_competition_id uuid, p_name text, p_address text default null, p_court_count integer default null
)
returns uuid language plpgsql security definer set search_path = public
as $$
declare selected public.sport_competitions%rowtype;
declare venue_id_value uuid;
declare next_order integer;
begin
  selected := app_private.require_managed_competition(p_competition_id);
  if selected.lifecycle in ('COMPLETED', 'CANCELLED', 'ARCHIVED') then raise exception 'Venues are locked'; end if;
  select coalesce(max(display_order), -1) + 1 into next_order
  from public.sport_competition_venues where competition_id = selected.id;
  insert into public.sport_competition_venues(
    competition_id, name, address, court_count, display_order
  ) values (selected.id, trim(p_name), nullif(trim(p_address), ''), p_court_count, next_order)
  returning id into venue_id_value;
  perform app_private.write_sport_audit(selected.sport_id, 'COMPETITION', selected.id,
    'VENUE_ADDED', jsonb_build_object('venue_id', venue_id_value));
  return venue_id_value;
end;
$$;

create or replace function app_private.reorder_sport_competition_resources(
  p_competition_id uuid, p_resource_type text, p_resource_ids uuid[]
)
returns void language plpgsql security definer set search_path = public
as $$
declare selected public.sport_competitions%rowtype;
declare clean_type text := upper(trim(p_resource_type));
declare resource_count integer;
declare distinct_count integer;
declare temporary_offset integer;
begin
  selected := app_private.require_managed_competition(p_competition_id);
  if selected.lifecycle not in ('DRAFT', 'REGISTRATION_OPEN') then raise exception 'Competition structure is locked'; end if;
  if clean_type = 'STAGE' then
    select count(*), coalesce(max(display_order), 0) + count(*) + 1 into resource_count, temporary_offset
    from public.sport_competition_stages where competition_id = selected.id;
  elsif clean_type = 'DIVISION' then
    select count(*), coalesce(max(display_order), 0) + count(*) + 1 into resource_count, temporary_offset
    from public.sport_competition_divisions where competition_id = selected.id;
  elsif clean_type = 'VENUE' then
    select count(*), coalesce(max(display_order), 0) + count(*) + 1 into resource_count, temporary_offset
    from public.sport_competition_venues where competition_id = selected.id;
  else raise exception 'Unsupported competition resource type'; end if;
  select count(distinct ordered.id) into distinct_count from unnest(p_resource_ids) as ordered(id);
  if cardinality(p_resource_ids) <> resource_count or distinct_count <> resource_count then
    raise exception 'Resource order must contain every resource exactly once';
  end if;
  if clean_type = 'STAGE' then
    if exists (select 1 from unnest(p_resource_ids) as ordered(id) where not exists (select 1 from public.sport_competition_stages item where item.id = ordered.id and item.competition_id = selected.id)) then raise exception 'Resource order contains an unknown stage'; end if;
    update public.sport_competition_stages set display_order = display_order + temporary_offset where competition_id = selected.id;
    update public.sport_competition_stages item set display_order = (ordered.ordinality - 1)::integer, updated_at = now() from unnest(p_resource_ids) with ordinality ordered(id, ordinality) where item.id = ordered.id;
  elsif clean_type = 'DIVISION' then
    if exists (select 1 from unnest(p_resource_ids) as ordered(id) where not exists (select 1 from public.sport_competition_divisions item where item.id = ordered.id and item.competition_id = selected.id)) then raise exception 'Resource order contains an unknown division'; end if;
    update public.sport_competition_divisions set display_order = display_order + temporary_offset where competition_id = selected.id;
    update public.sport_competition_divisions item set display_order = (ordered.ordinality - 1)::integer, updated_at = now() from unnest(p_resource_ids) with ordinality ordered(id, ordinality) where item.id = ordered.id;
  else
    if exists (select 1 from unnest(p_resource_ids) as ordered(id) where not exists (select 1 from public.sport_competition_venues item where item.id = ordered.id and item.competition_id = selected.id)) then raise exception 'Resource order contains an unknown venue'; end if;
    update public.sport_competition_venues set display_order = display_order + temporary_offset where competition_id = selected.id;
    update public.sport_competition_venues item set display_order = (ordered.ordinality - 1)::integer, updated_at = now() from unnest(p_resource_ids) with ordinality ordered(id, ordinality) where item.id = ordered.id;
  end if;
  perform app_private.write_sport_audit(selected.sport_id, 'COMPETITION', selected.id,
    clean_type || 'S_REORDERED', '{}'::jsonb);
end;
$$;

create or replace function public.reorder_sport_competition_resources(p_competition_id uuid, p_resource_type text, p_resource_ids uuid[])
returns void language sql security definer set search_path = public
as $$ select app_private.reorder_sport_competition_resources(p_competition_id, p_resource_type, p_resource_ids) $$;
revoke all on function app_private.reorder_sport_competition_resources(uuid, text, uuid[]) from public, anon, authenticated;
revoke all on function public.reorder_sport_competition_resources(uuid, text, uuid[]) from public, anon;
grant execute on function public.reorder_sport_competition_resources(uuid, text, uuid[]) to authenticated;
