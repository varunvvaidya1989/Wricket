alter table public.tournaments add column source_local_id text;
alter table public.teams add column source_local_id text;

create unique index tournaments_created_by_source_local_id_key
on public.tournaments (created_by, source_local_id);

create unique index teams_tournament_source_local_id_key
on public.teams (tournament_id, source_local_id);
