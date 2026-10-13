export function authReturnDescription(returnTo?: string): string {
  if (returnTo?.includes('/team/join')) return 'Your team invitation';
  if (returnTo?.includes('/tournament/join')) return 'Your tournament invitation';
  if (returnTo?.endsWith('/match/new') || returnTo === '/start-match') return 'Your match setup';
  if (returnTo?.startsWith('/tournament') || returnTo?.includes('/competition/')) return 'Your tournament';
  if (returnTo?.startsWith('/match')) return 'Your match';
  if (returnTo === '/notifications') return 'Your notifications';
  if (returnTo === '/profile' || returnTo === '/account') return 'Your account';
  if (returnTo === '/explore') return 'Explore';
  return 'Your sports';
}
