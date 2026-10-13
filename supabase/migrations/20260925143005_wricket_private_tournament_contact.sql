-- Cricket privacy: safe columns remain readable under existing RLS.
-- Owners retrieve operational contact only through the authorised RPC.
SET check_function_bodies = false;
CREATE OR REPLACE FUNCTION app_private.get_tournament_organizer_contact(p_tournament_id uuid)
 RETURNS TABLE(display_name text, phone text)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select profile.display_name,
    case when tournament.created_by = (select auth.uid()) then tournament.organizer_phone else null end
  from public.tournaments tournament
  join public.profiles profile on profile.id = tournament.created_by
  where tournament.id = p_tournament_id and (select auth.uid()) is not null
$function$;
REVOKE SELECT ON public.tournaments FROM anon;
GRANT SELECT (banner_url, created_at, created_by, description, end_date, format, google_maps_url, google_place_id, id, latitude, location, logo_url, longitude, name, overs_per_match, planned_team_count, players_per_team, points_loss, points_no_result, points_tie, points_win, settings, social_media_url, source_local_id, start_at, start_date, updated_at, visibility) ON public.tournaments TO anon;
REVOKE SELECT ON public.tournaments FROM authenticated;
GRANT SELECT (banner_url, created_at, created_by, description, end_date, format, google_maps_url, google_place_id, id, latitude, location, logo_url, longitude, name, overs_per_match, planned_team_count, players_per_team, points_loss, points_no_result, points_tie, points_win, settings, social_media_url, source_local_id, start_at, start_date, updated_at, visibility) ON public.tournaments TO authenticated;

NOTIFY pgrst, 'reload schema';
