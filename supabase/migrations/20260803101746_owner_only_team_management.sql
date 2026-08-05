alter table public.teams add column if not exists logo_url text;

drop policy if exists "teams_write_owner_admin" on public.teams;

create policy "teams_insert_owner_only"
on public.teams for insert
to authenticated
with check (
  exists (
    select 1 from public.tournaments tournament
    where tournament.id = teams.tournament_id
      and tournament.created_by = (select auth.uid())
  )
);

create policy "teams_delete_owner_only"
on public.teams for delete
to authenticated
using (
  exists (
    select 1 from public.tournaments tournament
    where tournament.id = teams.tournament_id
      and tournament.created_by = (select auth.uid())
  )
);
