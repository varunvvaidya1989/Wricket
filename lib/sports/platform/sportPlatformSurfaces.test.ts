import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(resolve(__dirname, path), 'utf8');
const migration = read('../../../supabase/migrations/20260821064105_integrate_sport_platform_surfaces.sql').toLowerCase();
const rootGate = read('../../../components/providers/RootAccessGate.tsx');
const rootLayout = read('../../../app/_layout.tsx');
const dashboard = read('../../../app/index.tsx');
const liveScreen = read('../../../components/sports/platform/SportStageLiveScreen.tsx');
const liveActivityBadge = read('../../../components/sports/platform/SportLiveActivityBadge.tsx');
const notificationScreen = read('../../../components/sports/platform/SportNotificationCenterScreen.tsx');
const competitionScreen = read('../../../components/sports/scoring/SportCloudCompetitionDetailScreen.tsx');
const profileScreen = read('../../../app/profile.tsx');
const playerCard = read('../../../app/player/[id].tsx');
const authScreen = read('../../../app/auth.tsx');
const authProvider = read('../../../components/providers/AuthProvider.tsx');
const discoveryApi = read('../../../lib/supabase/sportDiscoveryApi.ts');
const cricketFeed = read('../../../app/wricket/match/[id]/live.tsx');
const sportContent = read('./sportLiveContent.ts');
const profileDrawer = read('../../../components/sports/scoring/SportProfileDrawer.tsx');

describe('complete sport platform surfaces', () => {
  it('allows guests to reach only the safe public live route', () => {
    expect(rootGate).toContain("root === 'live'");
    expect(rootGate).toContain("router.replace('/live')");
    expect(rootGate).not.toContain("if (!publicAuthRoute) router.replace('/auth')");
    expect(rootGate).not.toContain("root === 'feed' || root === 'live'");
    expect(rootLayout).toContain('<Stack.Screen name="live"');
    expect(rootGate).toContain("root === 'player'");
  });

  it('exposes live, following, and notification navigation', () => {
    expect(rootLayout).toContain('<Stack.Screen name="feed"');
    expect(rootLayout).toContain('<Stack.Screen name="notifications"');
    expect(dashboard).toContain("router.push('/live')");
    expect(dashboard).toContain("router.push('/notifications')");
  });

  it('renders one authentication-aware discovery skeleton', () => {
    expect(liveScreen).toContain('sportDiscoveryApi.discover');
    expect(discoveryApi).toContain("client.rpc('discover_cricket_live'");
    expect(liveScreen).toContain('Every sport, One Stage');
    expect(liveScreen).not.toMatch(/Guest-safe|active public|public match/);
    expect(liveScreen).toContain('sportDiscoveryApi.feed');
    expect(liveScreen).toContain('sportDiscoveryApi.upcoming');
    expect(liveScreen).toContain("router.push('/auth')");
    expect(liveScreen).toContain('Sign in to follow every match.');
    expect(liveScreen).toContain('Good ${timeOfDay()}, ${firstName}');
    expect(liveScreen).toContain('<SportAvatarButton compact />');
    expect(liveScreen).not.toMatch(/UPDATING|Sign in for feed|choose your apps/i);
  });

  it('keeps all sport implementations resident while showing only released sports', () => {
    for (const code of ['CRICKET', 'TENNIS', 'BADMINTON', 'PADEL', 'TABLE_TENNIS', 'PICKLEBALL']) {
      expect(sportContent).toContain(`code: '${code}'`);
    }
    expect(liveScreen).toContain('RELEASED_SPORTSTAGE_SPORTS.map');
    expect(liveScreen).toContain('<SportLiveActivityBadge count={count} />');
    expect(liveActivityBadge).toContain("`\\u25CF ${liveCount} live`");
    expect(liveScreen).toContain('<Text style={styles.teamName}>{snapshot.participantA}</Text>');
    expect(liveScreen).toContain('<Text style={styles.teamName}>{snapshot.participantB}</Text>');
    expect(liveScreen).not.toMatch(/participant[AB].*numberOfLines/);
  });

  it('uses one live label and sport-specific access descriptions', () => {
    expect(liveScreen).toContain('<Text style={styles.liveStatusText}>LIVE</Text>');
    expect(liveScreen).toContain('content.guestDetailLabel');
    expect(liveScreen).toContain('Open live scorecard');
    expect(sportContent).toContain('Ball-by-ball commentary');
    expect(sportContent).toContain('Point-by-point match feed');
    expect(sportContent).toContain('Rally-by-rally match feed');
  });

  it('implements personalized ordering and every requested empty state', () => {
    expect(liveScreen.indexOf('YOUR SPORTS \\u00B7 LIVE NOW')).toBeLessThan(liveScreen.indexOf('ELSEWHERE ON SPORTSTAGE'));
    expect(liveScreen).toContain('Make this stage yours');
    expect(liveScreen).toContain("Nothing live right now - here's what's next.");
    expect(liveScreen).toContain('No start times announced');
    expect(liveActivityBadge).toContain("'\\u2014 none'");
  });

  it('reuses the existing profile drawer and keeps the sport launcher available', () => {
    expect(rootLayout).toContain('<SportProfileDrawerProvider>');
    expect(profileDrawer).toContain("'SPORTSTAGE PROFILE'");
    expect(profileDrawer).toContain("navigate('/apps', true)");
    expect(dashboard).toContain('<Redirect href="/live" />');
    expect(rootLayout).toContain('<Stack.Screen name="apps"');
  });

  it('renders standings and unified cloud statistics from result APIs', () => {
    expect(competitionScreen).toContain('sportResultsApi.listStandings');
    expect(competitionScreen).toContain("tab === 'standings'");
    expect(competitionScreen).toContain('sportResultsApi.rebuild');
    expect(profileScreen).toContain('sportResultsApi.listMine');
    expect(profileScreen).toContain('CROSS-SPORT MATCH RECORD');
    expect(competitionScreen).toContain('sportOperationsApi.supportAction');
    expect(competitionScreen).toContain('CREATE_RECOVERY_CHECKPOINT');
  });

  it('renders and acknowledges deep-linked notifications', () => {
    expect(notificationScreen).toContain('sportOperationsApi.notifications');
    expect(notificationScreen).toContain('sportOperationsApi.markRead');
    expect(notificationScreen).toContain('router.push(item.deepLink as Href)');
  });

  it('renders only opt-in public player cards with shareable links', () => {
    expect(playerCard).toContain('sportDiscoveryApi.publicPlayerCard');
    expect(playerCard).toContain('SHARED SPORTSTAGE PROFILE');
    expect(playerCard).toContain("Linking.createURL(`player/${card.sportProfileId}`)");
  });

  it('supports returning from login and waits for the profile before exposing a session', () => {
    expect(authScreen).toContain('Back to live scores');
    expect(authScreen).toContain("router.replace('/live')");
    expect(authProvider.indexOf('setProfile(nextProfile)')).toBeLessThan(authProvider.indexOf('setSession(nextSession)'));
  });

  it('opens each selected sport in a real detailed match route', () => {
    expect(cricketFeed).toContain('CloudLiveMatchScreen');
    for (const sport of ['tennis', 'badminton', 'padel', 'table-tennis', 'pickleball']) {
      const route = read(`../../../app/${sport}/match/[id]/feed.tsx`);
      expect(route).toContain('SportCloudMatchFeedScreen');
    }
  });

  it('integrates safe follow IDs, real routes, and distinct authoritative stats', () => {
    expect(migration).toContain('add column sport_id uuid');
    expect(migration).toContain("notification.deep_link = '/sports'");
    expect(migration).toContain('select coalesce(app_route');
    expect(migration).toContain('list_my_sport_statistics');
    expect(migration).toContain('count(distinct mine.id)');
    expect(migration).toContain('revised_winner_entry_id');
  });
});
