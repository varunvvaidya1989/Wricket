alter table public.legacy_player_contacts
  add column email_verified boolean not null default false,
  add column phone_verified boolean not null default false;

create or replace function app_private.resolve_auction_yodha_link(p_display_name text)
returns jsonb
language plpgsql security definer set search_path = public, auth
as $$
declare account_id_value uuid := (select auth.uid());
declare verified_email text;
declare verified_phone text;
declare contact_matches uuid[];
declare candidate_count integer;
declare selected_player_id uuid;
declare method_value text;
declare name_candidates jsonb;
begin
  if account_id_value is null then raise exception 'Authentication is required'; end if;
  if exists (select 1 from public.player_account_links where account_id = account_id_value) then
    return jsonb_build_object('status', 'LINKED', 'player_ids', (
      select coalesce(jsonb_agg(player_id), '[]'::jsonb) from public.player_account_links where account_id = account_id_value
    ));
  end if;

  select case when email_confirmed_at is not null then lower(trim(email)) end,
         case when phone_confirmed_at is not null then regexp_replace(phone, '[^0-9+]', '', 'g') end
  into verified_email, verified_phone from auth.users where id = account_id_value;

  select coalesce(array_agg(distinct contact.player_id), '{}'::uuid[])
  into contact_matches
  from public.legacy_player_contacts contact
  left join public.player_account_links linked on linked.player_id = contact.player_id
  where linked.player_id is null and (
    (contact.email_verified and verified_email is not null and lower(trim(contact.email)) = verified_email)
    or (contact.phone_verified and verified_phone is not null and regexp_replace(contact.phone, '[^0-9+]', '', 'g') = verified_phone)
  );
  candidate_count := cardinality(contact_matches);
  if candidate_count = 1 then
    selected_player_id := contact_matches[1];
    select case
      when contact.email_verified and verified_email is not null and lower(trim(contact.email)) = verified_email
       and contact.phone_verified and verified_phone is not null and regexp_replace(contact.phone, '[^0-9+]', '', 'g') = verified_phone then 'EMAIL_PHONE'
      when contact.email_verified and verified_email is not null and lower(trim(contact.email)) = verified_email then 'EMAIL'
      else 'PHONE'
    end into method_value from public.legacy_player_contacts contact where contact.player_id = selected_player_id;
    perform app_private.attach_player_account(account_id_value, selected_player_id, method_value);
    return jsonb_build_object('status', 'AUTO_LINKED', 'player_id', selected_player_id, 'method', method_value);
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('player_id', candidate.id, 'display_name', candidate.display_name)), '[]'::jsonb)
  into name_candidates from (
    select player.id, player.display_name
    from public.players player
    left join public.player_account_links linked on linked.player_id = player.id
    where player.source_system = 'auction_yodha' and linked.player_id is null
      and lower(regexp_replace(player.display_name, '\s+', ' ', 'g')) = lower(regexp_replace(trim(p_display_name), '\s+', ' ', 'g'))
    order by player.display_name limit 5
  ) candidate;
  return jsonb_build_object(
    'status', case when candidate_count > 1 then 'CONTACT_CONFLICT' when jsonb_array_length(name_candidates) > 0 then 'CANDIDATES' else 'NO_MATCH' end,
    'candidates', name_candidates
  );
end;
$$;
