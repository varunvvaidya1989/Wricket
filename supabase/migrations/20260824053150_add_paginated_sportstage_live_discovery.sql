create or replace function public.discover_sportstage_live(
  p_limit integer default 12,
  p_before timestamptz default null,
  p_before_match_id uuid default null
)
returns table (
  scoring_match_id uuid,
  sport_id uuid,
  sport_code text,
  competition_id uuid,
  competition_name text,
  participant_a text,
  participant_b text,
  match_format text,
  status text,
  headline_score text,
  refreshed_at timestamptz,
  stale_after timestamptz,
  share_slug text
)
language sql
stable
security invoker
set search_path = ''
as $$
  with live_snapshots as (
    select
      snapshot.scoring_match_id,
      snapshot.sport_id,
      snapshot.sport_code,
      snapshot.competition_id,
      snapshot.competition_name,
      snapshot.participant_a,
      snapshot.participant_b,
      snapshot.match_format,
      snapshot.status,
      snapshot.headline_score,
      snapshot.refreshed_at,
      snapshot.stale_after,
      snapshot.share_slug
    from public.sport_public_live_snapshots as snapshot
    where snapshot.status = 'LIVE'

    union all

    select
      snapshot.match_id,
      snapshot.sport_id,
      snapshot.sport_code,
      snapshot.competition_id,
      snapshot.competition_name,
      snapshot.participant_a,
      snapshot.participant_b,
      snapshot.match_format,
      snapshot.status,
      snapshot.headline_score,
      snapshot.refreshed_at,
      snapshot.stale_after,
      snapshot.share_slug
    from public.cricket_live_snapshots as snapshot
    where snapshot.status = 'LIVE'
  )
  select snapshot.*
  from live_snapshots as snapshot
  where p_before is null
    or (snapshot.refreshed_at, snapshot.scoring_match_id) < (p_before, p_before_match_id)
  order by snapshot.refreshed_at desc, snapshot.scoring_match_id desc
  limit least(greatest(p_limit, 1), 50)
$$;

revoke all on function public.discover_sportstage_live(integer, timestamptz, uuid)
  from public, anon, authenticated;
grant execute on function public.discover_sportstage_live(integer, timestamptz, uuid)
  to anon, authenticated;
