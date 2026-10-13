export type ScoringUiVersion = 'revamp-v1' | 'recovery-v1';

export function configuredScoringUiVersion(): ScoringUiVersion {
  return process.env.EXPO_PUBLIC_WRICKET_SCORING_UI === 'recovery-v1' ? 'recovery-v1' : 'revamp-v1';
}

export function pinnedScoringUiVersion(saved: string | undefined, configured: ScoringUiVersion): ScoringUiVersion {
  if (saved === 'revamp-v1' || saved === 'recovery-v1') return saved;
  return configured;
}
