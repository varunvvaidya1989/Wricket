-- Match Moments Phase 1: durable match/tournament conversations with one or
-- more image attachments. Scoring events remain the authoritative score data.

create or replace function app_private.can_view_tournament_social(p_tournament_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.tournaments tournament
    where tournament.id = p_tournament_id
      and (
        tournament.visibility = 'PUBLIC'
        or exists (
          select 1 from public.tournament_members member
          where member.tournament_id = tournament.id
            and member.account_id = (select auth.uid())
            and member.status = 'ACTIVE'
        )
        or app_private.is_team_participant_in_tournament(tournament.id)
      )
  );
$$;

create or replace function app_private.can_post_tournament_social(p_tournament_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select (select auth.uid()) is not null
    and app_private.can_view_tournament_social(p_tournament_id);
$$;

create or replace function app_private.can_moderate_tournament_social(p_tournament_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.tournament_members member
    where member.tournament_id = p_tournament_id
      and member.account_id = (select auth.uid())
      and member.status = 'ACTIVE'
      and member.role in ('OWNER', 'ADMIN')
  );
$$;

revoke all on function app_private.can_view_tournament_social(uuid) from public, anon;
revoke all on function app_private.can_post_tournament_social(uuid) from public, anon;
revoke all on function app_private.can_moderate_tournament_social(uuid) from public, anon;
grant execute on function app_private.can_view_tournament_social(uuid) to authenticated;
grant execute on function app_private.can_post_tournament_social(uuid) to authenticated;
grant execute on function app_private.can_moderate_tournament_social(uuid) to authenticated;

create table public.match_moments (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  match_id uuid references public.matches(id) on delete cascade,
  match_event_id uuid references public.match_events(id) on delete set null,
  author_id uuid not null references public.profiles(id) on delete restrict,
  caption text not null check (char_length(btrim(caption)) between 1 and 1000),
  visibility text not null default 'TOURNAMENT'
    check (visibility in ('PUBLIC', 'TOURNAMENT')),
  status text not null default 'PUBLISHED'
    check (status in ('PUBLISHED', 'REMOVED')),
  pinned_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.moment_media (
  id uuid primary key default gen_random_uuid(),
  moment_id uuid not null references public.match_moments(id) on delete cascade,
  storage_path text not null unique,
  media_type text not null default 'IMAGE' check (media_type = 'IMAGE'),
  mime_type text not null check (mime_type in ('image/jpeg', 'image/png', 'image/webp')),
  byte_size bigint not null check (byte_size between 1 and 8388608),
  width integer,
  height integer,
  processing_status text not null default 'READY'
    check (processing_status in ('UPLOADING', 'READY', 'FAILED', 'REMOVED')),
  created_at timestamptz not null default now()
);

create table public.moment_comments (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  moment_id uuid not null references public.match_moments(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete restrict,
  parent_comment_id uuid references public.moment_comments(id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 500),
  status text not null default 'PUBLISHED'
    check (status in ('PUBLISHED', 'REMOVED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.moment_reactions (
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  moment_id uuid not null references public.match_moments(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  reaction_type text not null default 'LIKE'
    check (reaction_type in ('LIKE', 'FIRE', 'CLAP')),
  created_at timestamptz not null default now(),
  primary key (moment_id, profile_id, reaction_type)
);

create table public.moment_reports (
  id uuid primary key default gen_random_uuid(),
  moment_id uuid references public.match_moments(id) on delete cascade,
  comment_id uuid references public.moment_comments(id) on delete cascade,
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  reason text not null check (char_length(btrim(reason)) between 3 and 500),
  status text not null default 'OPEN' check (status in ('OPEN', 'REVIEWED', 'DISMISSED')),
  created_at timestamptz not null default now(),
  check ((moment_id is not null)::integer + (comment_id is not null)::integer = 1)
);

create index match_moments_tournament_feed_idx
on public.match_moments(tournament_id, created_at desc)
where status = 'PUBLISHED';
create index match_moments_match_feed_idx
on public.match_moments(match_id, created_at desc)
where status = 'PUBLISHED';
create index moment_media_moment_idx on public.moment_media(moment_id);
create index moment_comments_moment_idx on public.moment_comments(tournament_id, moment_id, created_at);
create index moment_reports_open_idx on public.moment_reports(status, created_at);

create or replace function app_private.validate_match_moment_anchor()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if new.match_id is not null and not exists (
    select 1 from public.matches match
    where match.id = new.match_id and match.tournament_id = new.tournament_id
  ) then
    raise exception 'The selected match does not belong to this tournament';
  end if;
  if new.match_event_id is not null and not exists (
    select 1 from public.match_events event
    join public.matches match on match.id = event.match_id
    where event.id = new.match_event_id
      and event.match_id = new.match_id
      and match.tournament_id = new.tournament_id
  ) then
    raise exception 'The selected scoring event does not belong to this match';
  end if;
  return new;
end;
$$;

create trigger validate_match_moment_anchor
before insert or update of tournament_id, match_id, match_event_id
on public.match_moments
for each row execute function app_private.validate_match_moment_anchor();

create or replace function app_private.protect_match_moment_update()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if old.tournament_id is distinct from new.tournament_id
    or old.match_id is distinct from new.match_id
    or old.match_event_id is distinct from new.match_event_id
    or old.author_id is distinct from new.author_id
    or old.created_at is distinct from new.created_at then
    raise exception 'A moment identity and scoring anchor cannot be changed';
  end if;
  if old.pinned_at is distinct from new.pinned_at
    and not app_private.can_moderate_tournament_social(old.tournament_id) then
    raise exception 'Tournament administrator access is required to pin a moment';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger protect_match_moment_update
before update on public.match_moments
for each row execute function app_private.protect_match_moment_update();

create or replace function app_private.validate_moment_child_tournament()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.match_moments moment
    where moment.id = new.moment_id and moment.tournament_id = new.tournament_id
  ) then raise exception 'The moment does not belong to this tournament'; end if;
  return new;
end;
$$;

create trigger validate_moment_comment_tournament
before insert or update of tournament_id, moment_id on public.moment_comments
for each row execute function app_private.validate_moment_child_tournament();
create trigger validate_moment_reaction_tournament
before insert or update of tournament_id, moment_id on public.moment_reactions
for each row execute function app_private.validate_moment_child_tournament();

create or replace function app_private.can_view_match_moment(p_moment_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.match_moments moment
    where moment.id = p_moment_id
      and moment.status = 'PUBLISHED'
      and app_private.can_view_tournament_social(moment.tournament_id)
  );
$$;

revoke all on function app_private.can_view_match_moment(uuid) from public, anon;
grant execute on function app_private.can_view_match_moment(uuid) to authenticated;

alter table public.match_moments enable row level security;
alter table public.moment_media enable row level security;
alter table public.moment_comments enable row level security;
alter table public.moment_reactions enable row level security;
alter table public.moment_reports enable row level security;

create policy "moments_read_visible" on public.match_moments for select to authenticated
using (
  (status = 'PUBLISHED' and (select app_private.can_view_tournament_social(tournament_id)))
  or author_id = (select auth.uid())
  or (select app_private.can_moderate_tournament_social(tournament_id))
);
create policy "moments_create_visible_tournament" on public.match_moments for insert to authenticated
with check (
  author_id = (select auth.uid())
  and status = 'PUBLISHED'
  and pinned_at is null
  and (select app_private.can_post_tournament_social(tournament_id))
);
create policy "moments_update_own_or_moderate" on public.match_moments for update to authenticated
using (
  author_id = (select auth.uid())
  or (select app_private.can_moderate_tournament_social(tournament_id))
)
with check (
  author_id = (select auth.uid())
  or (select app_private.can_moderate_tournament_social(tournament_id))
);

create policy "moment_media_read_visible" on public.moment_media for select to authenticated
using ((select app_private.can_view_match_moment(moment_id)));
create policy "moment_media_create_own" on public.moment_media for insert to authenticated
with check (exists (
  select 1 from public.match_moments moment
  where moment.id = moment_id and moment.author_id = (select auth.uid())
));
create policy "moment_media_delete_own_or_moderate" on public.moment_media for delete to authenticated
using (exists (
  select 1 from public.match_moments moment
  where moment.id = moment_id
    and (
      moment.author_id = (select auth.uid())
      or (select app_private.can_moderate_tournament_social(moment.tournament_id))
    )
));

create policy "moment_comments_read_visible" on public.moment_comments for select to authenticated
using ((select app_private.can_view_match_moment(moment_id)));
create policy "moment_comments_create_visible" on public.moment_comments for insert to authenticated
with check (
  author_id = (select auth.uid())
  and status = 'PUBLISHED'
  and (select app_private.can_view_match_moment(moment_id))
);
create policy "moment_comments_update_own_or_moderate" on public.moment_comments for update to authenticated
using (
  author_id = (select auth.uid())
  or exists (
    select 1 from public.match_moments moment
    where moment.id = moment_id
      and (select app_private.can_moderate_tournament_social(moment.tournament_id))
  )
)
with check (
  author_id = (select auth.uid())
  or exists (
    select 1 from public.match_moments moment
    where moment.id = moment_id
      and (select app_private.can_moderate_tournament_social(moment.tournament_id))
  )
);

create policy "moment_reactions_read_visible" on public.moment_reactions for select to authenticated
using ((select app_private.can_view_match_moment(moment_id)));
create policy "moment_reactions_create_own" on public.moment_reactions for insert to authenticated
with check (
  profile_id = (select auth.uid())
  and (select app_private.can_view_match_moment(moment_id))
);
create policy "moment_reactions_delete_own" on public.moment_reactions for delete to authenticated
using (profile_id = (select auth.uid()));

create policy "moment_reports_create_visible" on public.moment_reports for insert to authenticated
with check (
  reporter_id = (select auth.uid())
  and (
    (moment_id is not null and (select app_private.can_view_match_moment(moment_id)))
    or (comment_id is not null and exists (
      select 1 from public.moment_comments comment
      where comment.id = comment_id
        and (select app_private.can_view_match_moment(comment.moment_id))
    ))
  )
);
create policy "moment_reports_read_reporter_or_moderator" on public.moment_reports for select to authenticated
using (
  reporter_id = (select auth.uid())
  or exists (
    select 1 from public.match_moments moment
    left join public.moment_comments comment on comment.id = comment_id
    where moment.id = coalesce(moment_id, comment.moment_id)
      and (select app_private.can_moderate_tournament_social(moment.tournament_id))
  )
);

grant select, insert, update on public.match_moments to authenticated;
grant select, insert, delete on public.moment_media to authenticated;
grant select, insert, update on public.moment_comments to authenticated;
grant select, insert, delete on public.moment_reactions to authenticated;
grant select, insert on public.moment_reports to authenticated;

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values (
  'match-moments', 'match-moments', false, 8388608,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "moment_objects_insert_own_folder"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'match-moments'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);
create policy "moment_objects_read_visible"
on storage.objects for select to authenticated
using (
  bucket_id = 'match-moments'
  and (
    owner_id = (select auth.uid())::text
    or exists (
      select 1 from public.moment_media media
      where media.storage_path = name
        and (select app_private.can_view_match_moment(media.moment_id))
    )
  )
);
create policy "moment_objects_delete_own"
on storage.objects for delete to authenticated
using (
  bucket_id = 'match-moments'
  and owner_id = (select auth.uid())::text
);

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'match_moments'
  ) then alter publication supabase_realtime add table public.match_moments; end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'moment_comments'
  ) then alter publication supabase_realtime add table public.moment_comments; end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'moment_reactions'
  ) then alter publication supabase_realtime add table public.moment_reactions; end if;
end;
$$;

-- Rollback:
-- drop table public.moment_reports, public.moment_reactions,
--   public.moment_comments, public.moment_media, public.match_moments cascade;
-- delete from storage.buckets where id = 'match-moments';
