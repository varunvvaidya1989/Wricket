-- A tournament overview can receive several Realtime callbacks together.
-- Advancing the same completed round concurrently must still create one
-- playable fixture for a given bracket pairing and leg.
alter table public.fixture_matches
add constraint fixture_matches_unique_bracket_pairing
unique (stage_id, round_id, team_a_id, team_b_id, leg);
