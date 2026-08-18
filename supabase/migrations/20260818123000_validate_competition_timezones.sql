-- Phase 3 review correction: competition wall-clock values are interpreted in
-- an IANA time zone. Guard the table itself so every trusted command and future
-- service integration shares the same validation boundary.

create or replace function app_private.enforce_sport_competition_timezone()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  new.timezone := trim(new.timezone);
  if not exists (
    select 1 from pg_catalog.pg_timezone_names zone
    where zone.name = new.timezone
  ) then
    raise exception 'Invalid IANA time zone: %', new.timezone;
  end if;
  return new;
end;
$$;

do $$
begin
  if exists (
    select 1
    from public.sport_competitions competition
    where not exists (
      select 1 from pg_catalog.pg_timezone_names zone
      where zone.name = trim(competition.timezone)
    )
  ) then
    raise exception 'Existing sport competition has an invalid IANA time zone';
  end if;
end;
$$;

drop trigger if exists sport_competitions_validate_timezone
on public.sport_competitions;
create trigger sport_competitions_validate_timezone
before insert or update of timezone on public.sport_competitions
for each row execute function app_private.enforce_sport_competition_timezone();

revoke all on function app_private.enforce_sport_competition_timezone()
from public, anon, authenticated;

comment on function app_private.enforce_sport_competition_timezone() is
  'Rejects competition time zones absent from the PostgreSQL IANA time-zone catalog.';
