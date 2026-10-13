import type { AnalyticsModule } from './types';
export const padelAnalytics: AnalyticsModule = {
  sportId: 'padel', focus: 'Net control, overhead finishes and defensive transitions',
  strokes: ['Volley', 'Bandeja', 'Vibora', 'Smash', 'Lob', 'Wall return', 'Serve'],
  zones: ['Back court', 'Transition', 'Net'], shortRally: 4, longRally: 12,
  signature: [{ label: 'Bandeja finishes', stroke: 'Bandeja' }, { label: 'Vibora finishes', stroke: 'Vibora' }, { label: 'Wall-return finishes', stroke: 'Wall return' }],
};
