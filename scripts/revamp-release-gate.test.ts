import { createHash } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { additionalGates, auditReleaseEvidence, releaseCases, releasePlatforms } from './revamp-release-gate.mjs';

let directory: string;
afterEach(async () => { if (directory) await rm(directory, { recursive: true, force: true }); });
async function evidence() {
  directory = await mkdtemp(join(tmpdir(), 'wricket-release-'));
  const content = 'Actual test evidence'; await writeFile(join(directory, 'acceptance.log'), content);
  return { sourceFingerprint: 'source', commit: 'revision', environment: 'isolated test', recordedAt: '2026-10-11',
    checks: [...releaseCases, ...additionalGates].map((id: string) => ({ id, status: 'PASS', verifiedBy: 'tester', recordedAt: '2026-10-11', platforms: [...releasePlatforms], artifacts: [{ path: 'acceptance.log', sha256: createHash('sha256').update(content).digest('hex') }] })),
  };
}
describe('release evidence audit', () => {
  it('blocks incomplete platform, physical, worker and pilot evidence', async () => {
    const result = await auditReleaseEvidence({ checks: [] }, '.', 'source');
    expect(result.status).toBe('BLOCKED'); expect(result.issues).toContain('E28: MISSING');
    expect(result.issues).toContain('cloud-mvp-worker: MISSING'); expect(result.issues).toContain('organiser-scorer-pilot: MISSING');
  });
  it('requires current source, matching artifacts and all platforms', async () => {
    const report = await evidence(); report.checks[0].platforms = ['chromium'];
    await writeFile(join(directory, 'acceptance.log'), 'Changed log');
    const result = await auditReleaseEvidence(report, directory, 'other-source');
    expect(result.status).toBe('BLOCKED'); expect(result.issues.some((issue: string) => issue.includes('fingerprint'))).toBe(true);
    expect(result.issues).toContain('E01: ios evidence is missing.');
    expect(result.issues.some((issue: string) => issue.includes('hash changed'))).toBe(true);
  });
  it('accepts a complete audit and never upgrades paused evidence to passing', async () => {
    const report = await evidence(); expect((await auditReleaseEvidence(report, directory, 'source')).status).toBe('PASS');
    report.checks.find((check: { id: string }) => check.id === 'E09')!.status = 'PAUSED';
    expect((await auditReleaseEvidence(report, directory, 'source')).issues).toContain('E09: PAUSED');
  });
  it('still checks artifact integrity when case coverage is partial', async () => {
    const report = await evidence(); report.checks[0].status = 'PARTIAL';
    await writeFile(join(directory, 'acceptance.log'), 'Changed partial evidence');
    const result = await auditReleaseEvidence(report, directory, 'source');
    expect(result.issues).toContain('E01: PARTIAL');
    expect(result.issues).toContain('E01: artifact hash changed: acceptance.log');
  });
});
