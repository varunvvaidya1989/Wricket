-- Retry only records now supported by the explicit legacy `rules.overs` field.
-- Empty or invalid limits remain failed and visible to monitoring; do not invent limits.
update public.match_mvp_calculations calculation
set status='PENDING',attempts=0,error=null,lease_token=null,requested_at=now(),updated_at=now()
from public.matches match
where match.id=calculation.match_id and calculation.status='FAILED'
  and calculation.error='Completed match has no valid innings limit'
  and not (match.rules ? 'oversPerInnings')
  and jsonb_typeof(match.rules->'overs')='number'
  and (match.rules->>'overs')::numeric > 0;

-- An explicit authorised recalculation starts a new retry budget and invalidates old leases.
create or replace function app_private.request_match_mvp_recalculation(p_match_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null then raise exception 'Authentication is required'; end if;
  if not exists (
    select 1 from public.matches match join public.tournament_members member on member.tournament_id=match.tournament_id
    where match.id=p_match_id and member.account_id=(select auth.uid())
      and member.status='ACTIVE' and member.role in ('OWNER','ADMIN')
  ) then raise exception 'Tournament administrator access is required'; end if;
  insert into public.match_mvp_calculations(match_id,algorithm_version,status,requested_by,requested_at,error,updated_at)
    values(p_match_id,'wricket-mvp-v1','PENDING',(select auth.uid()),now(),null,now())
  on conflict(match_id) do update set algorithm_version=excluded.algorithm_version,status='PENDING',
    requested_by=excluded.requested_by,requested_at=excluded.requested_at,error=null,updated_at=now(),lease_token=null,attempts=0;
  return jsonb_build_object('matchId',p_match_id,'status','PENDING');
end $$;
