-- Derived rankings are replaced only by a trusted worker with a current lease.
alter table public.match_mvp_calculations
  add column lease_token uuid,
  add column attempts integer not null default 0;

create or replace function app_private.claim_cricket_mvp_work(p_limit integer default 10)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare job public.match_mvp_calculations%rowtype; jobs jsonb := '[]'; snapshot jsonb;
begin
  for job in select * from public.match_mvp_calculations
    where status = 'PENDING' or (status = 'CALCULATING' and updated_at < now() - interval '5 minutes')
      or (status = 'FAILED' and attempts < 3 and updated_at < now() - interval '30 seconds')
    order by requested_at, match_id limit greatest(1, least(p_limit, 50)) for update skip locked
  loop
    update public.match_mvp_calculations set status = 'CALCULATING', lease_token = gen_random_uuid(),
      attempts = attempts + 1, updated_at = now(), error = null where match_id = job.match_id returning * into job;
    select jsonb_build_object(
      'match', to_jsonb(m),
      'xis', coalesce((select jsonb_agg(to_jsonb(x) order by x.team_id,x.batting_order) from public.match_xis x where x.match_id = m.id),'[]'),
      'innings', coalesce((select jsonb_agg(to_jsonb(i) order by i.sequence) from public.match_innings i where i.match_id = m.id),'[]'),
      'events', coalesce((select jsonb_agg(to_jsonb(e) order by e.sequence,e.id) from public.match_events e where e.match_id = m.id),'[]')
    ) into snapshot from public.matches m where m.id = job.match_id;
    jobs := jobs || jsonb_build_array(jsonb_build_object('matchId',job.match_id,'leaseToken',job.lease_token,'snapshot',snapshot));
  end loop;
  return jobs;
end $$;

create or replace function app_private.finish_cricket_mvp_work(p_match_id uuid, p_lease_token uuid, p_result jsonb, p_error text default null)
returns boolean language plpgsql security definer set search_path = '' as $$
declare m public.matches%rowtype; job public.match_mvp_calculations%rowtype; entry jsonb;
begin
  -- Result changes acquire this same order: canonical match, then calculation.
  select * into m from public.matches where id = p_match_id for update;
  select * into job from public.match_mvp_calculations where match_id = p_match_id for update;
  if job.status is distinct from 'CALCULATING' or job.lease_token is distinct from p_lease_token then return false; end if;
  if p_error is not null then
    update public.match_mvp_calculations set status='FAILED', error=left(p_error,1000), lease_token=null,updated_at=now() where match_id=p_match_id;
    return true;
  end if;
  if p_result->>'matchId' is distinct from p_match_id::text or p_result->>'algorithmVersion' is distinct from 'wricket-mvp-v1'
    or jsonb_typeof(p_result->'rankings') is distinct from 'array' then raise exception 'Invalid MVP result'; end if;
  delete from public.match_mvp_results where match_id=p_match_id;
  if m.status::text = 'COMPLETED' and coalesce(m.result->>'kind',m.result->>'result_kind','') not in ('NO_RESULT','CANCELLED') then
    for entry in select value from jsonb_array_elements(p_result->'rankings') loop
      if not exists (select 1 from public.match_xis where match_id=p_match_id and player_id=(entry->>'playerId')::uuid and team_id=(entry->>'teamId')::uuid) then raise exception 'MVP participant is not in the playing side'; end if;
      insert into public.match_mvp_results(match_id,player_id,team_id,algorithm_version,batting_points,bowling_points,fielding_points,total_points,rank,deterministic_order,is_player_of_match,is_fighter_of_match,batting_breakdown,bowling_breakdown,fielding_breakdown,explanations,calculated_at)
      values(p_match_id,(entry->>'playerId')::uuid,(entry->>'teamId')::uuid,'wricket-mvp-v1',
        (entry->>'battingPoints')::numeric,(entry->>'bowlingPoints')::numeric,(entry->>'fieldingPoints')::numeric,(entry->>'totalPoints')::numeric,
        (entry->>'rank')::integer,(entry->>'order')::integer,(entry->>'isPlayerOfTheMatch')::boolean,(entry->>'isFighterOfTheMatch')::boolean,
        entry->'battingBreakdown',entry->'bowlingBreakdown',entry->'fieldingBreakdown',entry->'explanations',(p_result->>'calculatedAt')::timestamptz);
    end loop;
  end if;
  update public.match_mvp_calculations set status='COMPLETED',calculated_at=now(),lease_token=null,error=null,updated_at=now() where match_id=p_match_id;
  return true;
end $$;

create or replace function app_private.invalidate_completed_cricket_mvp()
returns trigger language plpgsql security definer set search_path = '' as $$
declare match uuid := coalesce(new.match_id,old.match_id);
begin
  if exists (select 1 from public.matches where id=match and status::text='COMPLETED') then
    insert into public.match_mvp_calculations(match_id,algorithm_version,status,requested_at,updated_at)
      values(match,'wricket-mvp-v1','PENDING',now(),now())
    on conflict(match_id) do update set status='PENDING',lease_token=null,error=null,requested_at=now(),updated_at=now();
    -- Readers must not display stale totals while replacement is pending.
    delete from public.match_mvp_results where match_id=match;
  end if;
  return coalesce(new,old);
end $$;
create trigger invalidate_completed_cricket_mvp after insert or update or delete on public.match_events
for each row execute function app_private.invalidate_completed_cricket_mvp();

create or replace function public.claim_cricket_mvp_work(p_limit integer default 10)
returns jsonb language sql security invoker set search_path = '' as $$ select app_private.claim_cricket_mvp_work(p_limit); $$;
create or replace function public.finish_cricket_mvp_work(p_match_id uuid,p_lease_token uuid,p_result jsonb,p_error text default null)
returns boolean language sql security invoker set search_path = '' as $$ select app_private.finish_cricket_mvp_work(p_match_id,p_lease_token,p_result,p_error); $$;
revoke all on function app_private.claim_cricket_mvp_work(integer), public.claim_cricket_mvp_work(integer), app_private.finish_cricket_mvp_work(uuid,uuid,jsonb,text),public.finish_cricket_mvp_work(uuid,uuid,jsonb,text) from public,anon,authenticated;
grant execute on function app_private.claim_cricket_mvp_work(integer), public.claim_cricket_mvp_work(integer), app_private.finish_cricket_mvp_work(uuid,uuid,jsonb,text),public.finish_cricket_mvp_work(uuid,uuid,jsonb,text) to service_role;
revoke all on function app_private.invalidate_completed_cricket_mvp() from public,anon,authenticated;

create or replace function app_private.enqueue_match_mvp_after_result_change()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.status is distinct from new.status or old.result is distinct from new.result then
    delete from public.match_mvp_results where match_id = new.id;
    if new.status::text = 'COMPLETED' then
      insert into public.match_mvp_calculations(match_id,algorithm_version,status,requested_at,updated_at)
        values(new.id,'wricket-mvp-v1','PENDING',now(),now())
      on conflict(match_id) do update set status='PENDING',lease_token=null,attempts=0,error=null,requested_at=now(),updated_at=now();
    else
      delete from public.match_mvp_calculations where match_id=new.id;
    end if;
  end if;
  return new;
end $$;

-- The public request wrapper is invoker-based; the private function performs
-- its own tournament administrator check before creating work.
grant execute on function app_private.request_match_mvp_recalculation(uuid) to authenticated;
