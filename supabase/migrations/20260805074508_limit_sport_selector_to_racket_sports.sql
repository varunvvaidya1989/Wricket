insert into public.sports(code, name, availability_status, app_route, display_order)
values
  ('CRICKET', 'Cricket', 'AVAILABLE', '/wricket', 1),
  ('BADMINTON', 'Badminton', 'COMING_SOON', null, 2),
  ('TENNIS', 'Tennis', 'COMING_SOON', null, 3),
  ('TABLE_TENNIS', 'Table Tennis', 'COMING_SOON', null, 4)
on conflict (code) do update set
  name = excluded.name,
  availability_status = excluded.availability_status,
  app_route = excluded.app_route,
  display_order = excluded.display_order;

-- Keep historical account references valid while removing every other sport
-- from onboarding and account selectors.
update public.sports
set availability_status = 'HIDDEN'
where code not in ('CRICKET', 'BADMINTON', 'TENNIS', 'TABLE_TENNIS');
