alter table public.players add column source_local_id text;
alter table public.players add column role text;

create unique index players_created_by_source_local_id_key
on public.players (created_by, source_local_id);
