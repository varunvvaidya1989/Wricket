import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const creationSource = readFileSync(resolve(
  __dirname, '../../../components/sports/scoring/SportCompetitionsScreen.tsx',
), 'utf8');
const detailSource = readFileSync(resolve(
  __dirname, '../../../components/sports/scoring/SportCloudCompetitionDetailScreen.tsx',
), 'utf8');
const apiSource = readFileSync(resolve(
  __dirname, '../../supabase/sportCompetitionApi.ts',
), 'utf8');

describe('team-tie drafting interface', () => {
  it('does not ask for one format when creating a competition', () => {
    expect(creationSource).not.toContain('MATCH FORMAT');
    expect(creationSource).not.toContain('setMatchFormat');
    expect(creationSource).toContain('how many singles and doubles matches');
  });

  it('lets owners compose and revise ordered tournament matches', () => {
    expect(detailSource).toContain('function TieMatchEditor');
    expect(detailSource).toContain("add('SINGLES')");
    expect(detailSource).toContain("add('DOUBLES')");
    expect(detailSource).toContain('updateTeamTieMatches');
  });

  it('uses the atomic team-tie RPC only when child matches are supplied', () => {
    expect(apiSource).toContain("rpc('schedule_sport_team_tie'");
    expect(apiSource).toContain("rpc('schedule_sport_fixture'");
  });
});
