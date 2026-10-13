import type { AnalyticsModule } from './types';
export const tableTennisAnalytics: AnalyticsModule = {
  sportId: 'table_tennis', focus: 'Serve impact, opening attacks and counter-play',
  strokes: ['Loop', 'Drive', 'Push', 'Block', 'Flick', 'Chop', 'Smash', 'Serve'],
  zones: ['Close to table', 'Mid-distance', 'Far from table'], shortRally: 3, longRally: 8,
  signature: [{ label: 'Service winners', outcome: 'SERVICE_WINNER' }, { label: 'Loop finishes', stroke: 'Loop' }, { label: 'Flick finishes', stroke: 'Flick' }],
};
