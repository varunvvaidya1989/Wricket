import { type Href, useRouter } from 'expo-router';
import React from 'react';

import { useAuth } from '@/components/providers/AuthProvider';
import { StageButton, StageIntro, StageList, StageNotice, StagePage, StageRow, StageText } from '@/components/sports/platform/StageUI';
import { useSportMatches } from '@/hooks/useSportMatches';
import { SPORT_CONFIGS, SPORT_PRESENTATION, type ScoringSportId } from '@/lib/sports/scoring';

export function SportShellHome({ sportId }: { sportId: ScoringSportId }) {
  const router = useRouter();
  const auth = useAuth();
  const name = SPORT_CONFIGS[sportId].name;
  const base = `/${SPORT_PRESENTATION[sportId].routeSegment}`;
  const { matches, loading, error, retry } = useSportMatches(sportId);
  const resume = matches.find(match => match.status === 'LIVE' && match.createdBy === auth.session?.user.id);
  const open = (route: string) => router.push(`${base}/${route}` as Href);
  return <StagePage>
    <StageIntro eyebrow={name.toUpperCase()} title="See you on court." description="Your matches and the people you play with." />
    <StageButton primary title="Start a match" onPress={() => open('match/new')} />
    {loading ? <StageNotice>Checking your recent matches…</StageNotice> : null}
    {error ? <StageNotice retry={retry}>{error}</StageNotice> : null}
    {resume ? <StageList><StageRow title="Resume your match" detail={`${resume.participantA} vs ${resume.participantB} · ${resume.headlineScore || 'Ready to score'}`} symbol="↗" onPress={() => open(`match/${resume.id}/score`)} /></StageList> : null}
    <StageText variant="eyebrow" muted>AROUND YOUR SPORT</StageText>
    <StageList>
      <StageRow title="Matches" detail="Your live and completed matches" symbol="↗" onPress={() => open('matches')} />
      <StageRow title="Stats & analytics" detail="Explore your performance, tactics and matchups" symbol="↗" onPress={() => open('stats')} />
      <StageRow title="Competitions" detail="Browse events and manage your entries" symbol="◇" onPress={() => open('competitions')} />
      <StageRow title="Clubs" detail="Find your regular group" symbol="+" onPress={() => open('clubs')} />
    </StageList>
  </StagePage>;
}

export function SportShellHub({ sportId }: { sportId: ScoringSportId }) {
  const router = useRouter();
  const auth = useAuth();
  const base = `/${SPORT_PRESENTATION[sportId].routeSegment}`;
  const { matches, loading, error, retry } = useSportMatches(sportId);
  const scoring = matches.filter(match => match.status === 'LIVE' && match.createdBy === auth.session?.user.id);
  const completed = matches.filter(match => match.status === 'COMPLETED').length;
  const open = (route: string) => router.push(`${base}/${route}` as Href);
  return <StagePage>
    <StageIntro title="Your side of the game." description="Pick up your matches, teams and personal record." />
    {loading ? <StageNotice>Loading your activity…</StageNotice> : null}
    {error ? <StageNotice retry={retry}>{error}</StageNotice> : null}
    <StageList>
      <StageRow title="Matches you’re scoring" detail={loading ? 'Checking your matches…' : error ? 'Activity unavailable' : `${scoring.length} in progress`} symbol="↗" onPress={() => scoring.length === 1 ? open(`match/${scoring[0].id}/score`) : open('matches?status=LIVE')} />
      <StageRow title="My matches" detail={loading ? 'Loading recent results…' : error ? 'Results unavailable' : `${completed} completed in your latest ${matches.length} matches`} symbol={loading || error ? '↗' : String(matches.length)} onPress={() => open('matches')} />
      <StageRow title="My teams & clubs" detail="Your memberships and playing groups" symbol="+" onPress={() => open('clubs')} />
      <StageRow title="Stats & analytics" detail="Explore your performance, tactics and matchups" symbol="↗" onPress={() => open('stats')} />
    </StageList>
  </StagePage>;
}
