import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(__dirname, '../../../supabase/migrations/20260806065231_remove_cricheroes_links.sql'),
  'utf8',
);
const importer = readFileSync(resolve(__dirname, '../../../scripts/migrate-auction-yodha-players.mjs'), 'utf8');

describe('competitor profile link removal', () => {
  it('removes the legacy URL column and prevents future imports', () => {
    expect(migration).toContain('drop column if exists cricheroes_url');
    expect(importer.toLowerCase()).not.toContain('cricheroes');
  });
});
