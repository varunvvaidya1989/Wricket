const TOURNAMENT_RETURN_PATH = /^\/tournament\?id=[A-Za-z0-9_-]+$/;
const MATCH_RETURN_PATH = /^\/match\?id=[A-Za-z0-9_-]+$/;
const TEAM_INVITE_RETURN_PATH = /^\/wricket\/team\/join\?token=[a-f0-9]{48}$/;
const TOURNAMENT_INVITE_RETURN_PATH = /^\/wricket\/tournament\/join\?token=[a-f0-9]{48}$/;
const SPORT_HOME_RETURN_PATH = /^\/(wricket|tennis|badminton|padel|table-tennis|pickleball)$/;
const SPORT_COMPETITION_RETURN_PATH = /^\/(tennis|badminton|padel|table-tennis|pickleball)\/competition\/[A-Za-z0-9_-]+(?:\?(?:mode=view|section=(?:overview|matches|entries|standings|rules|manage|entrants|schedule|points|officials|resources|publish|advanced|recovery|organizers)))?$/;
const SPORT_SETUP_RETURN_PATH = /^\/(wricket|tennis|badminton|padel|table-tennis|pickleball)\/match\/new$/;
const PLATFORM_RETURN_PATHS = new Set(['/live', '/apps', '/explore', '/start-match', '/switch-sport', '/profile', '/account', '/feed', '/notifications']);

export function safeAuthReturnTo(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  try {
    const decoded = decodeURIComponent(value).trim();
    return TOURNAMENT_RETURN_PATH.test(decoded)
      || MATCH_RETURN_PATH.test(decoded)
      || TEAM_INVITE_RETURN_PATH.test(decoded)
      || TOURNAMENT_INVITE_RETURN_PATH.test(decoded)
      || SPORT_HOME_RETURN_PATH.test(decoded)
      || SPORT_COMPETITION_RETURN_PATH.test(decoded)
      || SPORT_SETUP_RETURN_PATH.test(decoded)
      || PLATFORM_RETURN_PATHS.has(decoded)
      ? decoded
      : undefined;
  } catch {
    return undefined;
  }
}
