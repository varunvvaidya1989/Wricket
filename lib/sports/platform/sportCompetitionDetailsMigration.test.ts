import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(resolve(
  __dirname,
  '../../../supabase/migrations/20260824105036_enrich_sport_competition_details.sql',
), 'utf8');
const listMigration = readFileSync(resolve(
  __dirname,
  '../../../supabase/migrations/20260824112337_add_sport_competition_list_rpc.sql',
), 'utf8');
const overview = readFileSync(resolve(
  __dirname,
  '../../../components/sports/scoring/SportCompetitionOverview.tsx',
), 'utf8');
const creation = readFileSync(resolve(
  __dirname,
  '../../../components/sports/scoring/SportCompetitionsScreen.tsx',
), 'utf8');
const detail = readFileSync(resolve(
  __dirname,
  '../../../components/sports/scoring/SportCloudCompetitionDetailScreen.tsx',
), 'utf8');
const api = readFileSync(resolve(__dirname, '../../supabase/sportCompetitionApi.ts'), 'utf8');

describe('rich non-cricket competition details', () => {
  it('persists managed media, organizer, participation, and Google venue metadata', () => {
    for (const field of ['logo_url', 'banner_url', 'organizer_phone', 'social_media_url', 'planned_entry_count', 'google_place_id', 'google_maps_url']) {
      expect(migration).toContain(field);
    }
    expect(migration).toContain('get_sport_competition_owner_contact');
    expect(migration).toContain('set_sport_competition_venue_place');
    expect(migration).toContain('from public, anon;');
    expect(migration).toContain('to authenticated;');
  });

  it('matches the cricket information hierarchy without leaking cricket laws', () => {
    expect(overview).toContain('competition.bannerUrl');
    expect(overview).toContain('competition.logoUrl');
    expect(overview).toContain('TEAMS / CLUBS');
    expect(overview).toContain('MATCHES');
    expect(overview).toContain('Open venue in Google Maps');
    expect(overview).toContain('WHATSAPP');
    expect(overview).toContain('TOURNAMENT / LEAGUE STATS');
    expect(overview).toContain('sportRulesSummary(sportId');
    expect(overview).not.toContain('OVERS');
  });

  it('collects the rich profile during creation and uploads media through scoped storage', () => {
    expect(creation).toContain('Search primary venue on Google Maps');
    expect(creation).toContain("pickMedia('logo')");
    expect(creation).toContain('plannedEntryCount: planned');
    expect(api).toContain("rpc('create_sport_competition_profile'");
    expect(api).toContain("storage.from('tournament-media').upload");
    expect(api).toContain("rpc('update_sport_competition_media'");
  });

  it('keeps a valid competition visible when secondary reads are unavailable', () => {
    expect(creation).toContain('Promise.allSettled');
    expect(creation).toContain("competitionResult.status === 'rejected'");
    expect(detail).toContain('void sportCompetitionApi.get(id).then');
    expect(detail).toContain('sportResultsApi.listCompetitionPlayerStatistics(id)');
    expect(detail).toContain("playerStatsResult.status === 'fulfilled'");

    const mandatoryDetailResults = api.match(/for \(const result of \[(.*?)\]\)/s)?.[1] ?? '';
    expect(mandatoryDetailResults).not.toContain('ownerContactResult');
    expect(api).toContain("ownerContactResult.error ? 'Competition organizer'");
  });

  it('loads owned drafts through the dedicated authenticated list command', () => {
    expect(listMigration).toContain('app_private.can_read_sport_competition(competition.id)');
    expect(listMigration).toContain('order by competition.updated_at desc');
    expect(listMigration).toContain('grant execute on function public.list_sport_competitions(text)');
    expect(listMigration).toContain('to authenticated;');
    expect(api).toContain("rpc('list_sport_competitions'");
    expect(api).not.toContain('sports!inner(code)');
  });
});
