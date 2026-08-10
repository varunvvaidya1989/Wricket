create or replace function app_private.resolve_auction_yodha_link(p_display_name text)
returns jsonb
language plpgsql security definer set search_path = public, auth
as $$
declare account_id_value uuid := (select auth.uid());
declare verified_email text;
declare verified_phone text;
declare contact_matches uuid[];
declare match_candidates jsonb;
declare match_method text;
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
    (
      contact.email_verified and verified_email is not null
      and lower(trim(contact.email)) not like '%@phone.auctionyodha.local'
      and lower(trim(contact.email)) = verified_email
    ) or (
      contact.phone_verified and verified_phone is not null
      and lower(trim(contact.email)) like '%@phone.auctionyodha.local'
      and regexp_replace(contact.phone, '[^0-9+]', '', 'g') = verified_phone
    )
  );

  select coalesce(jsonb_agg(jsonb_build_object('player_id', player.id, 'display_name', player.display_name)), '[]'::jsonb)
  into match_candidates from public.players player where player.id = any(contact_matches);

  if cardinality(contact_matches) > 0 then
    select case
      when lower(trim(contact.email)) like '%@phone.auctionyodha.local' then 'PHONE'
      else 'EMAIL'
    end into match_method
    from public.legacy_player_contacts contact where contact.player_id = contact_matches[1];
  end if;

  if cardinality(contact_matches) = 1 then
    return jsonb_build_object('status', 'VERIFIED_MATCH', 'candidates', match_candidates, 'method', match_method);
  end if;
  if cardinality(contact_matches) > 1 then
    return jsonb_build_object('status', 'CONTACT_CONFLICT', 'candidates', match_candidates, 'method', match_method);
  end if;
  return jsonb_build_object('status', 'NO_MATCH', 'candidates', '[]'::jsonb);
end;
$$;

create or replace function app_private.confirm_auction_yodha_link(p_player_id uuid)
returns void
language plpgsql security definer set search_path = public, auth
as $$
declare account_id_value uuid := (select auth.uid());
declare verified_email text;
declare verified_phone text;
declare ay_email text;
declare ay_phone text;
declare ay_email_verified boolean;
declare ay_phone_verified boolean;
declare link_method text;
begin
  if account_id_value is null then raise exception 'Authentication is required'; end if;
  select case when email_confirmed_at is not null then lower(trim(email)) end,
         case when phone_confirmed_at is not null then regexp_replace(phone, '[^0-9+]', '', 'g') end
  into verified_email, verified_phone from auth.users where id = account_id_value;

  select lower(trim(contact.email)), regexp_replace(contact.phone, '[^0-9+]', '', 'g'),
         contact.email_verified, contact.phone_verified
  into ay_email, ay_phone, ay_email_verified, ay_phone_verified
  from public.legacy_player_contacts contact where contact.player_id = p_player_id;

  if ay_email like '%@phone.auctionyodha.local' then
    if not coalesce(ay_phone_verified, false) then
      raise exception 'The selected AuctionYodha player does not have a verified phone number';
    end if;
    if verified_phone is null then
      raise exception 'Verify your SportStage phone number before linking this AuctionYodha player';
    end if;
    if ay_phone <> verified_phone then
      raise exception 'This AuctionYodha player belongs to a different verified phone account';
    end if;
    link_method := 'PHONE';
  else
    if not coalesce(ay_email_verified, false) then
      raise exception 'The selected AuctionYodha player does not have a verified email';
    end if;
    if verified_email is null then
      raise exception 'Verify your SportStage email before linking this AuctionYodha player';
    end if;
    if ay_email <> verified_email then
      raise exception 'This AuctionYodha player belongs to a different verified email account';
    end if;
    link_method := 'EMAIL';
  end if;

  if exists (
    select 1 from public.player_account_links link
    where link.player_id = p_player_id and link.account_id <> account_id_value
  ) then
    raise exception 'This AuctionYodha player is already linked to another SportStage account';
  end if;
  perform app_private.attach_player_account(account_id_value, p_player_id, link_method);
end;
$$;
