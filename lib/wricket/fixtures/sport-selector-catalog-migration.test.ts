import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(__dirname, '../../../supabase/migrations/20260805074508_limit_sport_selector_to_racket_sports.sql'),
  'utf8',
);

describe('sport selector catalog migration', () => {
  it('offers only the four requested sports', () => {
    expect(migration).toContain("('CRICKET', 'Cricket'");
    expect(migration).toContain("('BADMINTON', 'Badminton'");
    expect(migration).toContain("('TENNIS', 'Tennis'");
    expect(migration).toContain("('TABLE_TENNIS', 'Table Tennis'");
    expect(migration).toContain("where code not in ('CRICKET', 'BADMINTON', 'TENNIS', 'TABLE_TENNIS')");
    expect(migration).toContain("set availability_status = 'HIDDEN'");
  });
});
