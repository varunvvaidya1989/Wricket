export type ScoringInputMode = 'numbers' | 'gestures';
export const SCORING_INPUT_KEY = 'wricket:scoring-input:v1';
export const NUMERIC_RUNS = [0, 1, 2, 3, 4, 6] as const;

export function restoredInputMode(value: string | null): ScoringInputMode {
  return value === 'gestures' ? 'gestures' : 'numbers';
}

// A time-based debounce would swallow two intentional, identical deliveries.
// Only the command that is currently awaiting persistence owns the gate.
export function createScoringGate() {
  let busy = false;
  return {
    get busy() { return busy; },
    async run<T>(command: () => Promise<T>): Promise<{ accepted: false } | { accepted: true; value: T }> {
      if (busy) return { accepted: false };
      busy = true;
      try { return { accepted: true, value: await command() }; }
      finally { busy = false; }
    },
  };
}
