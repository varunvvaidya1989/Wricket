import { useRouter } from 'expo-router';
import { StageButton } from './StageUI';

// Preserve this shared entry point for existing home and profile consumers.
export function MatchLauncher({ compact: _compact = false }: { compact?: boolean }) {
  const router = useRouter();
  return <StageButton title="Start a match" onPress={() => router.push('/start-match')} />;
}
