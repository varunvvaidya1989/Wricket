-- One sponsorship model for cricket tournaments and every sport competition.
create table public.tournament_sponsors (
  id uuid primary key default gen_random_uuid(),
  cricket_tournament_id uuid references public.tournaments(id) on delete cascade,
  sport_competition_id uuid references public.sport_competitions(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 120),
  label text not null default 'Official sponsor' check (length(btrim(label)) between 1 and 60),
  description text not null default '' check (length(description) <= 600),
  website_url text check (length(website_url) <= 2048 and website_url ~ '^https://[^[:space:]/?#@]+([/?#][^[:space:]]*)?$'),
  logo_path text,
  display_order integer not null default 0 check (display_order between 0 and 9999),
  is_visible boolean not null default true,
  placements text[] not null default array['tournament', 'match', 'share']::text[],
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (num_nonnulls(cricket_tournament_id, sport_competition_id) = 1),
  check (cardinality(placements) between 1 and 3 and placements <@ array['tournament', 'match', 'share']::text[]),
  check (logo_path is null or (
    length(logo_path) <= 250 and logo_path ~ '^(cricket|sport)/[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|png|webp)$'
    and split_part(logo_path, '/', 1) = case when cricket_tournament_id is not null then 'cricket' else 'sport' end
    and split_part(logo_path, '/', 2) = coalesce(cricket_tournament_id, sport_competition_id)::text
  ))
);
create index tournament_sponsors_cricket_idx on public.tournament_sponsors(cricket_tournament_id, display_order, created_at);
create index tournament_sponsors_sport_idx on public.tournament_sponsors(sport_competition_id, display_order, created_at);
create index tournament_sponsors_logo_idx on public.tournament_sponsors(logo_path) where logo_path is not null;
alter table public.tournament_sponsors enable row level security;

create function app_private.can_manage_tournament_sponsors(p_cricket uuid, p_sport uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and case
    when p_cricket is not null and p_sport is null then exists (
      select 1 from public.tournaments where id = p_cricket and created_by = auth.uid()
    )
    when p_sport is not null and p_cricket is null then app_private.can_manage_sport_competition(p_sport)
    else false end
$$;
revoke all on function app_private.can_manage_tournament_sponsors(uuid, uuid) from public, anon;
grant execute on function app_private.can_manage_tournament_sponsors(uuid, uuid) to authenticated;

create policy sponsors_read on public.tournament_sponsors for select to authenticated using (
  app_private.can_manage_tournament_sponsors(cricket_tournament_id, sport_competition_id)
  or (is_visible and (
    (cricket_tournament_id is not null and exists (select 1 from public.tournaments t where t.id = cricket_tournament_id))
    or (sport_competition_id is not null and app_private.can_read_sport_competition(sport_competition_id))
  ))
);
create policy sponsors_insert on public.tournament_sponsors for insert to authenticated
  with check (app_private.can_manage_tournament_sponsors(cricket_tournament_id, sport_competition_id));
create policy sponsors_update on public.tournament_sponsors for update to authenticated
  using (app_private.can_manage_tournament_sponsors(cricket_tournament_id, sport_competition_id))
  with check (app_private.can_manage_tournament_sponsors(cricket_tournament_id, sport_competition_id));
create policy sponsors_delete on public.tournament_sponsors for delete to authenticated
  using (app_private.can_manage_tournament_sponsors(cricket_tournament_id, sport_competition_id));
revoke all on public.tournament_sponsors from anon, authenticated;
grant select, delete on public.tournament_sponsors to authenticated;
grant insert (cricket_tournament_id, sport_competition_id, name, label, description, website_url, logo_path, display_order, is_visible, placements)
  on public.tournament_sponsors to authenticated;
grant update (name, label, description, website_url, logo_path, display_order, is_visible, placements)
  on public.tournament_sponsors to authenticated;

create function app_private.bump_tournament_sponsor_version()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.version := old.version + 1;
  new.updated_at := now();
  return new;
end $$;
revoke all on function app_private.bump_tournament_sponsor_version() from public, anon, authenticated;
create trigger tournament_sponsors_version before update on public.tournament_sponsors
  for each row execute function app_private.bump_tournament_sponsor_version();

-- Private bucket: hidden sponsors/private competitions must not leak branding.
insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('sponsor-logos', 'sponsor-logos', false, 5242880, array['image/jpeg', 'image/png', 'image/webp']);

create function app_private.can_manage_sponsor_logo(p_path text)
returns boolean language plpgsql stable security definer set search_path = '' as $$
begin
  if p_path !~ '^(cricket|sport)/[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|png|webp)$' then return false; end if;
  return app_private.can_manage_tournament_sponsors(
    case when split_part(p_path, '/', 1) = 'cricket' then split_part(p_path, '/', 2)::uuid end,
    case when split_part(p_path, '/', 1) = 'sport' then split_part(p_path, '/', 2)::uuid end
  );
exception when invalid_text_representation then return false;
end $$;
revoke all on function app_private.can_manage_sponsor_logo(text) from public, anon;
grant execute on function app_private.can_manage_sponsor_logo(text) to authenticated;
create policy sponsor_logos_read on storage.objects for select to authenticated using (
  bucket_id = 'sponsor-logos' and (
    app_private.can_manage_sponsor_logo(name)
    or exists (select 1 from public.tournament_sponsors s where s.logo_path = storage.objects.name)
  )
);
create policy sponsor_logos_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'sponsor-logos' and app_private.can_manage_sponsor_logo(name));
create policy sponsor_logos_delete on storage.objects for delete to authenticated
  using (bucket_id = 'sponsor-logos' and app_private.can_manage_sponsor_logo(name)
    and not exists (select 1 from public.tournament_sponsors s where s.logo_path = storage.objects.name));
