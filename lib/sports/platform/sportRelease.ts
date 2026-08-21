export const NON_CRICKET_SPORTS_ENABLED =
  process.env.EXPO_PUBLIC_ENABLE_NON_CRICKET_SPORTS === 'true';

export function isSportReleased(
  sportCode: string,
  nonCricketEnabled = NON_CRICKET_SPORTS_ENABLED,
): boolean {
  return sportCode.trim().toUpperCase() === 'CRICKET' || nonCricketEnabled;
}

export function releasedSportCodes(
  sportCodes: readonly string[],
  nonCricketEnabled = NON_CRICKET_SPORTS_ENABLED,
): string[] {
  return sportCodes.filter((code) => isSportReleased(code, nonCricketEnabled));
}
