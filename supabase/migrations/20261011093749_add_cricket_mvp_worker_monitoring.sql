-- Operational heartbeat is private; clients cannot read or forge worker health.
create table app_private.cricket_mvp_worker_health (
  singleton boolean primary key default true check (singleton),
  last_success timestamptz not null,
  counts jsonb not null
);
alter table app_private.cricket_mvp_worker_health enable row level security;
revoke all on app_private.cricket_mvp_worker_health from public,anon,authenticated,service_role;

create function app_private.record_cricket_mvp_worker_heartbeat(p_counts jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare counts jsonb; claimed integer; completed integer; superseded integer; failed integer;
begin
  claimed := (p_counts->>'claimed')::integer;
  completed := (p_counts->>'completed')::integer;
  superseded := (p_counts->>'superseded')::integer;
  failed := (p_counts->>'failed')::integer;
  if claimed is null or completed is null or superseded is null or failed is null
    or claimed not between 0 and 50 or least(completed,superseded,failed) < 0
    or completed+superseded+failed <> claimed then raise exception 'Invalid worker counts'; end if;
  counts := jsonb_build_object('claimed',claimed,'completed',completed,'superseded',superseded,'failed',failed);
  insert into app_private.cricket_mvp_worker_health(singleton,last_success,counts)
    values(true,now(),counts) on conflict(singleton) do update set last_success=excluded.last_success,counts=excluded.counts;
end $$;

create function app_private.get_cricket_mvp_worker_heartbeat()
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce((select jsonb_build_object('lastSuccess',last_success,
    'ageSeconds',greatest(0,extract(epoch from now()-last_success)), 'counts',counts)
    from app_private.cricket_mvp_worker_health where singleton), '{}'::jsonb);
$$;

create function public.record_cricket_mvp_worker_heartbeat(p_counts jsonb)
returns void language sql security invoker set search_path = '' as $$
  select app_private.record_cricket_mvp_worker_heartbeat(p_counts);
$$;
create function public.get_cricket_mvp_worker_heartbeat()
returns jsonb language sql stable security invoker set search_path = '' as $$
  select app_private.get_cricket_mvp_worker_heartbeat();
$$;
revoke all on function app_private.record_cricket_mvp_worker_heartbeat(jsonb),
  app_private.get_cricket_mvp_worker_heartbeat(),public.record_cricket_mvp_worker_heartbeat(jsonb),
  public.get_cricket_mvp_worker_heartbeat() from public,anon,authenticated;
grant execute on function app_private.record_cricket_mvp_worker_heartbeat(jsonb),
  app_private.get_cricket_mvp_worker_heartbeat(),public.record_cricket_mvp_worker_heartbeat(jsonb),
  public.get_cricket_mvp_worker_heartbeat() to service_role;
