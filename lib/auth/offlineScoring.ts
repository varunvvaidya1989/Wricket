import AsyncStorage from '@react-native-async-storage/async-storage';
import { getMatch } from '@/lib/wricket/db/repo';

export function isOfflineError(message: string | null): boolean {
  return Boolean(message && /network request failed|failed to fetch|fetch failed|networkerror|offline/i.test(message));
}

/** A narrow native fallback, never an offline grant to the rest of the app. */
export async function canResumeOfflineScoring(input: {
  platform: string; segments: readonly string[]; accountId?: string; profileError: string | null;
}): Promise<boolean> {
  const { platform,segments,accountId,profileError } = input;
  if (platform === 'web' || !accountId || !isOfflineError(profileError)
    || segments.length !== 4 || segments[0] !== 'wricket' || segments[1] !== 'match' || segments[3] !== 'score') return false;
  const matchId = segments[2];
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(matchId)) return false;
  if (await AsyncStorage.getItem(`wricket.scoring-access:${accountId}:${matchId}`) !== '1') return false;
  const match = await getMatch(matchId);
  return Boolean(match && ['IN_PROGRESS','INNINGS_BREAK','FOLLOW_ON_DECISION'].includes(match.status));
}
