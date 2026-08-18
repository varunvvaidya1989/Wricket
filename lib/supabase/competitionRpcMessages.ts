export function normalizeCompetitionRpcMessage(cause: unknown): string {
  const raw = typeof cause === 'string'
    ? cause
    : cause instanceof Error
      ? cause.message
      : cause && typeof cause === 'object' && 'message' in cause && typeof cause.message === 'string'
        ? cause.message
        : '';

  const normalized = raw.toLowerCase();

  if (normalized.includes('only the team owner, manager, or captain')) {
    return 'Only the team owner, manager, or captain can register this squad. Pick a team you manage or captain.';
  }
  if (normalized.includes('registration is not open')) {
    return 'Registration is not open for this competition yet.';
  }
  if (normalized.includes('competition division was not found')) {
    return 'That division is not available in this competition.';
  }
  if (normalized.includes('choose a reusable team for this sport')) {
    return 'Choose a valid team for this sport before registering.';
  }
  if (normalized.includes('choose a team tournament')) {
    return 'Choose a tournament competition to register a team.';
  }
  if (normalized.includes('team does not have enough eligible active players')) {
    return 'This team does not have enough eligible active players for this competition.';
  }
  if (normalized.includes('not a team owner') || normalized.includes('not a captain') || normalized.includes('cannot register this squad')) {
    return 'Only the team owner, manager, or captain can register this squad. Pick a team you manage or captain.';
  }

  return raw || 'Please try again.';
}
