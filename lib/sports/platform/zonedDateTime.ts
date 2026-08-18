const INPUT_PATTERN = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})$/;
const OFFSET_PROBES = [-36, -12, 0, 12, 36] as const;

interface DateTimeParts {
  day: number;
  hour: number;
  minute: number;
  month: number;
  second: number;
  year: number;
}

function formatter(timeZone: string, includeZoneName = false): Intl.DateTimeFormat {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      day: '2-digit',
      hour: '2-digit',
      hourCycle: 'h23',
      minute: '2-digit',
      month: '2-digit',
      second: '2-digit',
      timeZone,
      timeZoneName: includeZoneName ? 'short' : undefined,
      year: 'numeric',
    });
  } catch {
    throw new Error(`Invalid IANA time zone: ${timeZone}`);
  }
}

function partsAt(timestamp: number, timeZone: string): DateTimeParts {
  const values = Object.fromEntries(
    formatter(timeZone).formatToParts(new Date(timestamp)).map(part => [part.type, part.value]),
  );
  return {
    day: Number(values.day),
    hour: Number(values.hour),
    minute: Number(values.minute),
    month: Number(values.month),
    second: Number(values.second),
    year: Number(values.year),
  };
}

function offsetAt(timestamp: number, timeZone: string): number {
  const wholeSecondTimestamp = Math.floor(timestamp / 1000) * 1000;
  const parts = partsAt(wholeSecondTimestamp, timeZone);
  return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second)
    - wholeSecondTimestamp;
}

function sameMinute(left: DateTimeParts, right: DateTimeParts): boolean {
  return left.year === right.year
    && left.month === right.month
    && left.day === right.day
    && left.hour === right.hour
    && left.minute === right.minute;
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

export function assertValidTimeZone(timeZone: string): void {
  if (!timeZone.trim()) throw new Error('Competition time zone is required.');
  formatter(timeZone.trim()).format(new Date(0));
}

export function formatZonedDateTime(isoTimestamp: string | undefined, timeZone: string): string {
  if (!isoTimestamp) return '';
  assertValidTimeZone(timeZone);
  const timestamp = Date.parse(isoTimestamp);
  if (Number.isNaN(timestamp)) throw new Error(`Invalid timestamp: ${isoTimestamp}`);
  const parts = partsAt(timestamp, timeZone);
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)} ${pad(parts.hour)}:${pad(parts.minute)}`;
}

export function formatZonedDateTimeLabel(isoTimestamp: string | undefined, timeZone: string): string {
  if (!isoTimestamp) return 'TIME TBD';
  const timestamp = Date.parse(isoTimestamp);
  if (Number.isNaN(timestamp)) throw new Error(`Invalid timestamp: ${isoTimestamp}`);
  const zoneName = formatter(timeZone, true).formatToParts(new Date(timestamp))
    .find(part => part.type === 'timeZoneName')?.value ?? timeZone;
  return `${formatZonedDateTime(isoTimestamp, timeZone)} ${zoneName}`;
}

export function parseZonedDateTime(input: string, timeZone: string): string | undefined {
  const value = input.trim();
  if (!value) return undefined;
  assertValidTimeZone(timeZone);
  const match = INPUT_PATTERN.exec(value);
  if (!match) throw new Error('Use YYYY-MM-DD HH:mm.');
  const requested: DateTimeParts = {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
    hour: Number(match[4]),
    minute: Number(match[5]),
    second: 0,
  };
  const wallClockAsUtc = Date.UTC(
    requested.year,
    requested.month - 1,
    requested.day,
    requested.hour,
    requested.minute,
  );
  const normalized = new Date(wallClockAsUtc);
  if (normalized.getUTCFullYear() !== requested.year
    || normalized.getUTCMonth() + 1 !== requested.month
    || normalized.getUTCDate() !== requested.day
    || normalized.getUTCHours() !== requested.hour
    || normalized.getUTCMinutes() !== requested.minute) {
    throw new Error(`Invalid calendar date: ${value}`);
  }

  const offsets = new Set(OFFSET_PROBES.map(hours => (
    offsetAt(wallClockAsUtc + hours * 60 * 60 * 1000, timeZone)
  )));
  const candidates = [...offsets]
    .map(offset => wallClockAsUtc - offset)
    .filter(candidate => sameMinute(partsAt(candidate, timeZone), requested));
  const uniqueCandidates = [...new Set(candidates)].sort((left, right) => left - right);
  if (!uniqueCandidates.length) {
    throw new Error(`${value} does not exist in ${timeZone} because of a clock change.`);
  }
  if (uniqueCandidates.length > 1) {
    throw new Error(`${value} is ambiguous in ${timeZone} because of a clock change.`);
  }
  return new Date(uniqueCandidates[0]).toISOString();
}
