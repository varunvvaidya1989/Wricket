import type { Href } from 'expo-router';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';

import { StageButton, StageIntro, StageNotice, StagePage } from '@/components/sports/platform/StageUI';
import { SPORT_CONFIGS, SPORT_PRESENTATION, listSportCompetitions, type ScoringSportId } from '@/lib/sports/scoring';

export function SportCloudCompetitionUnavailable({ loading, sportId }: { loading: boolean; sportId: ScoringSportId }) {
  const router = useRouter();
  const config = SPORT_CONFIGS[sportId];
  const presentation = SPORT_PRESENTATION[sportId];
  const [legacyCount, setLegacyCount] = useState<number>();
  const [archiveError, setArchiveError] = useState(false);
  useEffect(() => {
    let active = true;
    setLegacyCount(undefined);
    setArchiveError(false);
    void listSportCompetitions(sportId).then(items => { if (active) setLegacyCount(items.length); }).catch(() => { if (active) setArchiveError(true); });
    return () => { active = false; };
  }, [sportId]);
  return <StagePage focused title="Competitions" eyebrow={config.name.toUpperCase()}>
    {loading ? <StageNotice>Checking {config.name} competitions…</StageNotice> : <>
      <StageIntro title="Competitions are unavailable" description={`The ${config.name} competition workspace cannot be opened right now.`} />
      <StageNotice>Return to your sport, or browse the read-only records saved on this device.</StageNotice>
      {archiveError ? <StageNotice>The archive could not be checked. Open it to try again.</StageNotice> : null}
      <StageButton title={legacyCount ? `Open ${legacyCount} archived competition${legacyCount === 1 ? '' : 's'}` : 'Browse competition archive'} onPress={() => router.push(`/${presentation.routeSegment}/legacy-competitions` as Href)} />
      <StageButton title={`Back to ${config.name}`} onPress={() => router.replace(`/${presentation.routeSegment}` as Href)} />
    </>}
  </StagePage>;
}
