// Expo Router resolves a route-to-route import only when its extension is explicit.
// @ts-expect-error TypeScript route imports do not enable allowImportingTsExtensions.
import SportStageDashboard from './index.tsx';

export default SportStageDashboard;
