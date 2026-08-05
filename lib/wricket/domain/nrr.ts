export function nrrBallsForInnings(
  legalBalls: number,
  wicketsLost: number,
  oversPerInnings: number,
  playersPerSide: number,
): number {
  const isAllOut = playersPerSide > 1 && wicketsLost >= playersPerSide - 1;
  return isAllOut ? oversPerInnings * 6 : legalBalls;
}
