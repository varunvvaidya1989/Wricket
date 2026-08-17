insert into public.sports(code, name, availability_status, app_route, display_order)
values
  ('BADMINTON', 'Badminton', 'AVAILABLE', '/badminton', 2),
  ('TENNIS', 'Tennis', 'AVAILABLE', '/tennis', 3),
  ('PADEL', 'Padel', 'AVAILABLE', '/padel', 4),
  ('TABLE_TENNIS', 'Table Tennis', 'AVAILABLE', '/table-tennis', 5),
  ('PICKLEBALL', 'Pickleball', 'AVAILABLE', '/pickleball', 6)
on conflict (code) do update set
  name = excluded.name,
  availability_status = excluded.availability_status,
  app_route = excluded.app_route,
  display_order = excluded.display_order,
  updated_at = now();

-- Existing users who reserved one of these sports while it was marked coming
-- soon receive access when the independent sport apps launch.
update public.account_sports account_sport
set access_status = 'ACTIVE', updated_at = now()
from public.sports sport
where sport.id = account_sport.sport_id
  and sport.code in ('BADMINTON', 'TENNIS', 'PADEL', 'TABLE_TENNIS', 'PICKLEBALL')
  and account_sport.access_status = 'COMING_SOON';
