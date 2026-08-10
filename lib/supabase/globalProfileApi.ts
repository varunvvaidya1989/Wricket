import { CloudProfile, CloudSport, getCloudProfile } from './profiles';
import { personalStatsApi } from './personalStatsApi';

export interface SportSummary {
  sport: CloudSport;
  headlineStats: { label: string; value: string | number }[];
  matches?: number;
  available: boolean;
}

export interface GlobalProfileData {
  profile: CloudProfile;
  activeSports: number;
  totalMatches: number;
  achievements: number;
  sports: SportSummary[];
  partial: boolean;
}

export const globalProfileApi = {
  async get(accountId: string): Promise<GlobalProfileData> {
    const profile = await getCloudProfile(accountId);
    if (!profile) throw new Error('Complete your SportStage profile first');

    let partial = false;
    let cricketStats: Awaited<ReturnType<typeof personalStatsApi.get>> | undefined;
    const cricket = profile.connectedSports.find(sport => sport.code === 'CRICKET' && sport.accessStatus === 'ACTIVE');
    if (cricket) {
      try { cricketStats = await personalStatsApi.get(accountId); }
      catch { partial = true; }
    }

    const sports = profile.connectedSports
      .filter(sport => sport.accessStatus !== 'SUSPENDED')
      .map<SportSummary>(sport => {
        if (sport.code === 'CRICKET' && cricketStats) return {
          sport,
          available: true,
          matches: cricketStats.matches,
          headlineStats: [
            { label: 'MATCHES', value: cricketStats.matches },
            { label: 'RUNS', value: cricketStats.runs },
            { label: 'WICKETS', value: cricketStats.wickets },
          ],
        };
        return { sport, available: sport.accessStatus === 'ACTIVE', headlineStats: [] };
      });

    return {
      profile,
      activeSports: sports.length,
      totalMatches: sports.reduce((total, sport) => total + (sport.matches ?? 0), 0),
      achievements: cricketStats?.history.filter(match => match.standout).length ?? 0,
      sports,
      partial,
    };
  },
};
