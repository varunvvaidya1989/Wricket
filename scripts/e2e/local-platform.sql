-- Local-only platform prerequisite, loaded through the isolated stack's roles.sql.
-- Historical migration 20260722101318 revokes this dashboard-created helper.
-- No application migration is modified or skipped. No event trigger is installed:
-- application RLS must be explicitly enabled by the application's migrations.
create or replace function public.rls_auto_enable()
returns event_trigger language plpgsql security invoker
set search_path = pg_catalog as $$
declare command record;
begin
  for command in select * from pg_event_trigger_ddl_commands()
    where schema_name = 'public'
      and command_tag in ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      and object_type in ('table', 'partitioned table')
  loop
    execute format('alter table %s enable row level security', command.object_identity);
  end loop;
end;
$$;
revoke all on function public.rls_auto_enable() from public, anon, authenticated;
