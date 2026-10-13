import type { CoinTossResult } from '@/lib/sports/toss';
import type { TossChoice } from '@/lib/wricket/domain/types';

export interface TossState {
  mode: 'MANUAL' | 'VIRTUAL';
  winnerId: string | null;
  choice: TossChoice | null;
  landed?: CoinTossResult;
}
export const initialToss: TossState = { mode: 'MANUAL', winnerId: null, choice: null };
export type TossAction = { type: 'mode'; mode: TossState['mode'] }
  | { type: 'land'; result: CoinTossResult }
  | { type: 'manual'; winnerId: string }
  | { type: 'choice'; choice: TossChoice }
  | { type: 'participantsChanged' }
  | { type: 'restore'; state: TossState };

export function tossReducer(state: TossState, action: TossAction): TossState {
  switch (action.type) {
    case 'participantsChanged': return initialToss;
    case 'restore': return action.state;
    case 'mode': return state.landed || state.mode === action.mode ? state : { ...initialToss, mode: action.mode };
    case 'land': return state.mode !== 'VIRTUAL' || state.landed ? state
      : { ...state, landed: action.result, winnerId: action.result.winnerId, choice: null };
    case 'manual': return state.mode !== 'MANUAL' || state.landed ? state : { ...state, winnerId: action.winnerId, choice: null };
    case 'choice': return state.winnerId ? { ...state, choice: action.choice } : state;
  }
}
