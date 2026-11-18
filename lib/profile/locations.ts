// Metro uses the CJS client entry's static require-based JSON loaders.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const geo: typeof import('countrycitystatejson/client') = require('countrycitystatejson/client');

export interface LocationChoice { value: string; label: string }
export const profileCountries = (): LocationChoice[] => geo.getCountries()
  .map(country => ({ value: country.shortName, label: country.name ?? country.shortName }))
  .sort((a, b) => a.label.localeCompare(b.label));
export const profileStates = (country: string): LocationChoice[] => (geo.getStatesByShort(country) ?? [])
  .map(name => ({ value: name, label: name })).sort((a, b) => a.label.localeCompare(b.label));
export async function profileCities(country: string, state: string): Promise<LocationChoice[]> {
  if (!country || !state) return [];
  const cities = await geo.getCities(country, state);
  return [...new Set(cities ?? [])].map(name => ({ value: name, label: name })).sort((a, b) => a.label.localeCompare(b.label));
}
