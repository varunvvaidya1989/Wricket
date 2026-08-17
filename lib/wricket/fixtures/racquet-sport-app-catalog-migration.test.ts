import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(__dirname, '../../../supabase/migrations/20260816090000_launch_racquet_sport_apps.sql'),
  'utf8',
);

describe('racquet sport app catalog launch migration', () => {
  it('launches all five sports with independent app routes', () => {
    expect(migration).toContain("('BADMINTON', 'Badminton', 'AVAILABLE', '/badminton'");
    expect(migration).toContain("('TENNIS', 'Tennis', 'AVAILABLE', '/tennis'");
    expect(migration).toContain("('PADEL', 'Padel', 'AVAILABLE', '/padel'");
    expect(migration).toContain("('TABLE_TENNIS', 'Table Tennis', 'AVAILABLE', '/table-tennis'");
    expect(migration).toContain("('PICKLEBALL', 'Pickleball', 'AVAILABLE', '/pickleball'");
    expect(migration).not.toContain("'/court/");
  });

  it('activates existing coming-soon relationships', () => {
    expect(migration).toContain("set access_status = 'ACTIVE'");
    expect(migration).toContain("account_sport.access_status = 'COMING_SOON'");
  });
});
