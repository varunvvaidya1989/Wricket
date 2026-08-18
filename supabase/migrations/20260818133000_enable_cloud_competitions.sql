-- Phase 3 review corrections and application validation have passed. Enable
-- cloud competitions for every supported non-cricket sport, including viewers
-- without a stable account identifier.

update public.sport_feature_flags
set enabled = true, rollout_percentage = 100, updated_at = now()
where feature_key = 'cloud_competitions'
  and sport_id in (
    select id from public.sports
    where code in ('TENNIS', 'BADMINTON', 'PADEL', 'TABLE_TENNIS', 'PICKLEBALL')
  );

do $$
begin
  if (
    select count(*)
    from public.sport_feature_flags flag
    join public.sports sport on sport.id = flag.sport_id
    where flag.feature_key = 'cloud_competitions'
      and sport.code in ('TENNIS', 'BADMINTON', 'PADEL', 'TABLE_TENNIS', 'PICKLEBALL')
      and flag.enabled
      and flag.rollout_percentage = 100
  ) <> 5 then
    raise exception 'Cloud competition flags are missing for one or more supported sports';
  end if;
end;
$$;
