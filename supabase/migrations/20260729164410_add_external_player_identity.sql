alter table public.players
  add column source_system text,
  add column source_player_id text,
  add column source_metadata jsonb not null default '{}'::jsonb,
  add column image_url text,
  add column cricheroes_url text;

alter table public.players
  add constraint players_external_identity_complete
  check (
    (source_system is null and source_player_id is null)
    or
    (source_system is not null and source_player_id is not null)
  );

create unique index players_external_identity_idx
on public.players(source_system, source_player_id);

create index players_external_name_search_idx
on public.players using gin (to_tsvector('simple', display_name));
