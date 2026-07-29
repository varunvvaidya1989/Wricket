alter table public.tournaments
  add column latitude double precision,
  add column longitude double precision,
  add column google_place_id text,
  add column google_maps_url text;

alter table public.tournaments
  add constraint tournaments_valid_geotag
  check (
    (latitude is null and longitude is null)
    or
    (latitude between -90 and 90 and longitude between -180 and 180)
  );
