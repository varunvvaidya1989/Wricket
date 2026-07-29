-- Public security-invoker wrappers resolve explicitly qualified functions in
-- app_private. PostgreSQL requires schema USAGE in addition to function
-- EXECUTE, but USAGE does not expose app_private through the Data API.
revoke all on schema app_private from public, anon;
grant usage on schema app_private to authenticated;
revoke create on schema app_private from authenticated;

alter default privileges in schema app_private
revoke execute on functions from public, anon;
