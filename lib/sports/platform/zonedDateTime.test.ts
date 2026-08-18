import { describe, expect, it } from 'vitest';

import {
  assertValidTimeZone,
  formatZonedDateTime,
  formatZonedDateTimeLabel,
  parseZonedDateTime,
} from './zonedDateTime';

describe('competition zoned date/time conversion', () => {
  it('round trips UTC wall-clock values', () => {
    const timestamp = parseZonedDateTime('2026-08-20 18:30', 'UTC');
    expect(timestamp).toBe('2026-08-20T18:30:00.000Z');
    expect(formatZonedDateTime(timestamp, 'UTC')).toBe('2026-08-20 18:30');
  });

  it('converts positive fractional offsets without using the device time zone', () => {
    const timestamp = parseZonedDateTime('2026-08-20 18:30', 'Asia/Kolkata');
    expect(timestamp).toBe('2026-08-20T13:00:00.000Z');
    expect(formatZonedDateTime(timestamp, 'Asia/Kolkata')).toBe('2026-08-20 18:30');
  });

  it('converts negative offsets without using the device time zone', () => {
    const timestamp = parseZonedDateTime('2026-01-20 12:00', 'America/New_York');
    expect(timestamp).toBe('2026-01-20T17:00:00.000Z');
    expect(formatZonedDateTime(timestamp, 'America/New_York')).toBe('2026-01-20 12:00');
  });

  it('rejects a nonexistent daylight-saving wall-clock time', () => {
    expect(() => parseZonedDateTime('2026-03-08 02:30', 'America/New_York'))
      .toThrow('does not exist');
  });

  it('rejects an ambiguous daylight-saving wall-clock time', () => {
    expect(() => parseZonedDateTime('2026-11-01 01:30', 'America/New_York'))
      .toThrow('is ambiguous');
  });

  it('rejects invalid calendar dates and time-zone identifiers', () => {
    expect(() => parseZonedDateTime('2026-02-30 12:00', 'UTC')).toThrow('Invalid calendar date');
    expect(() => assertValidTimeZone('Not/A_Real_Zone')).toThrow('Invalid IANA time zone');
  });

  it('includes the competition-zone abbreviation in display labels', () => {
    expect(formatZonedDateTimeLabel('2026-08-20T13:00:00.000Z', 'Asia/Kolkata'))
      .toMatch(/^2026-08-20 18:30 /);
  });
});
