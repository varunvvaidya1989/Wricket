-- Phase 3 remains in progress. Keep cloud competitions unavailable until its
-- acceptance criteria pass and the controlled rollout is explicitly approved.

update public.sport_feature_flags
set enabled = false, rollout_percentage = 0, updated_at = now()
where feature_key = 'cloud_competitions'
  and sport_id in (
    select id from public.sports
    where code in ('TENNIS', 'BADMINTON', 'PADEL', 'TABLE_TENNIS', 'PICKLEBALL')
  );
