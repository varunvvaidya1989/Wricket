-- The mobile sync uses INSERT ... ON CONFLICT DO UPDATE ... RETURNING id.
-- Authorise the creator directly so the conflict branch does not depend on
-- the tournament_members row populated by the after-insert trigger.
create policy "tournaments_select_creator"
on public.tournaments for select
to authenticated
using (created_by = (select auth.uid()));

create policy "tournaments_update_creator"
on public.tournaments for update
to authenticated
using (created_by = (select auth.uid()))
with check (created_by = (select auth.uid()));
