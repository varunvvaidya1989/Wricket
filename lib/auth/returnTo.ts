const TOURNAMENT_RETURN_PATH = /^\/tournament\?id=[A-Za-z0-9_-]+$/;
const SPORT_HOME_RETURN_PATH = /^\/(wricket|tennis|badminton|padel|table-tennis|pickleball)$/;
const SPORT_COMPETITION_RETURN_PATH = /^\/(tennis|badminton|padel|table-tennis|pickleball)\/competition\/[A-Za-z0-9_-]+\?mode=view$/;

export function safeAuthReturnTo(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  try {
    const decoded = decodeURIComponent(value).trim();
    return TOURNAMENT_RETURN_PATH.test(decoded)
      || SPORT_HOME_RETURN_PATH.test(decoded)
      || SPORT_COMPETITION_RETURN_PATH.test(decoded)
      ? decoded
      : undefined;
  } catch {
    return undefined;
  }
}
