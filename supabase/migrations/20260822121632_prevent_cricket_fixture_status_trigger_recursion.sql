-- Fixture and canonical-match status projections run in both directions.
-- Only propagate an actual status change so their AFTER UPDATE triggers do not recurse.
create or replace function app_private.sync_fixture_status_to_match()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.status is not distinct from new.status then
    return new;
  end if;

  update public.matches
  set
    status = case new.status
      when 'LIVE' then 'IN_PROGRESS'::public.match_status
      when 'COMPLETED' then 'COMPLETED'::public.match_status
      when 'WALKOVER' then 'COMPLETED'::public.match_status
      else 'SCHEDULED'::public.match_status
    end,
    updated_at = now()
  where fixture_match_id = new.id
    and status is distinct from case new.status
      when 'LIVE' then 'IN_PROGRESS'::public.match_status
      when 'COMPLETED' then 'COMPLETED'::public.match_status
      when 'WALKOVER' then 'COMPLETED'::public.match_status
      else 'SCHEDULED'::public.match_status
    end;
  return new;
end;
$$;

create or replace function app_private.sync_match_status_to_fixture()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.fixture_match_id is null
    or old.status is not distinct from new.status then
    return new;
  end if;

  update public.fixture_matches
  set
    status = case new.status
      when 'IN_PROGRESS' then 'LIVE'
      when 'INNINGS_BREAK' then 'LIVE'
      when 'FOLLOW_ON_DECISION' then 'LIVE'
      when 'COMPLETED' then 'COMPLETED'
      when 'ABANDONED' then 'COMPLETED'
      else 'SCHEDULED'
    end,
    updated_at = now()
  where id = new.fixture_match_id
    and status is distinct from case new.status
      when 'IN_PROGRESS' then 'LIVE'
      when 'INNINGS_BREAK' then 'LIVE'
      when 'FOLLOW_ON_DECISION' then 'LIVE'
      when 'COMPLETED' then 'COMPLETED'
      when 'ABANDONED' then 'COMPLETED'
      else 'SCHEDULED'
    end;
  return new;
end;
$$;
