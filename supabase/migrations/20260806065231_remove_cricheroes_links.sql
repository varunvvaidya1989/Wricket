-- SportStage owns its player profiles and career statistics. Remove links to
-- competing profile providers from migrated player records.
alter table public.players drop column if exists cricheroes_url;
