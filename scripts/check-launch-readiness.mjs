import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

// Read-only public checks. Does not build, publish, log in, or change any account.
const root = resolve(import.meta.dirname, '..');
const app = JSON.parse(await readFile(resolve(root, 'app.json'), 'utf8')).expo;
const eas = JSON.parse(await readFile(resolve(root, 'eas.json'), 'utf8'));
const packageName = app.android.package;
const host = app.android.intentFilters?.flatMap(filter => filter.data ?? []).find(data => data.host)?.host;
if (!host) throw new Error('No Android app-link host configured in app.json.');
const origin = `https://${host}`;
const marketingOrigin = 'https://www.sportstageapp.com';
const adPlugin = app.plugins.find(plugin => Array.isArray(plugin) && plugin[0] === 'react-native-google-mobile-ads');
const publisherId = adPlugin?.[1]?.androidAppId?.match(/ca-app-(pub-\d+)~/)?.[1];

async function check(id, url, validate) {
  try {
    const response = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(15000) });
    const body = await response.text();
    const finding = response.ok ? validate(body, response) : `HTTP ${response.status}; verify availability and access restrictions.`;
    return { id, url, httpStatus: response.status, status: finding ? 'REVIEW' : 'PASS', detail: finding || 'Expected public content found.' };
  } catch (error) {
    return { id, url, status: 'UNKNOWN', detail: error.message };
  }
}

const checks = await Promise.all([
  check('app-link-domain', origin, body => /window\.location\.href\s*=\s*["']\/lander/.test(body)
    ? 'Returns a JavaScript /lander placeholder, not the SportStage destination.'
    : !/sportstage/i.test(body) ? 'SportStage content could not be identified.' : undefined),
  check('marketing-home', marketingOrigin, body => !/sportstage/i.test(body) ? 'SportStage content could not be identified.' : undefined),
  check('download-destination', marketingOrigin, body => !body.includes(`play.google.com/store/apps/details?id=${packageName}`)
    ? 'No matching public Google Play link found in the page HTML. Verify the download CTA.' : undefined),
  check('privacy-page', `${marketingOrigin}/privacy`, body => !/privacy/i.test(body) || /window\.location\.href\s*=\s*["']\/lander/.test(body)
    ? 'Expected privacy content missing.' : undefined),
  check('app-ads-apex', `${origin}/app-ads.txt`, validateAds),
  check('app-ads-www', `${marketingOrigin}/app-ads.txt`, validateAds),
  check('android-app-links', `${origin}/.well-known/assetlinks.json`, body => {
    try {
      const links = JSON.parse(body);
      return Array.isArray(links) && links.some(link => link.target?.package_name === packageName
        && link.relation?.includes('delegate_permission/common.handle_all_urls')
        && link.target?.sha256_cert_fingerprints?.length)
        ? undefined : 'No association with a signing fingerprint found for the configured Android package.';
    } catch { return 'Response is not valid assetlinks JSON.'; }
  }),
  check('play-listing-india', `https://play.google.com/store/apps/details?id=${packageName}&hl=en&gl=IN`, body =>
    !/sportstage/i.test(body) ? 'Expected listing content not found; confirm availability in Play Console.' : undefined),
]);

function validateAds(body) {
  if (!publisherId) return 'Android AdMob publisher ID could not be read from app.json.';
  const valid = body.split(/\r?\n/).some(line => {
    const fields = line.trim().split(',').map(field => field.trim());
    return fields[0] === 'google.com' && fields[1] === publisherId && fields[2] === 'DIRECT' && fields[3] === 'f08c47fec0942fa0';
  });
  return valid ? undefined : 'Expected Google DIRECT publisher record not found. Confirm the exact record in AdMob.';
}

const report = {
  checkedAt: new Date().toISOString(),
  scope: 'Public HTTP and repository configuration only; this is not store, privacy, security, or monetization approval.',
  app: { name: app.name, version: app.version, packageName },
  submission: eas.submit?.production?.android,
  checks,
  manualGates: [
    'Run npm run build:check and retain the evidence for the release revision.',
    'Verify production AAB target API, device tests, Play pre-launch report, and testing-track eligibility.',
    'Confirm AdMob account/payment verification, linked store, app-ads verification, and app readiness approval.',
    'Verify Data safety, privacy/consent, age-audience treatment, and account deletion on a test account.',
    'Confirm backend security, backup/restore, multi-device scoring, and production monitoring.',
    'Verify acquisition attribution and activation/retention metrics before buying traffic.',
  ],
};
const outputIndex = process.argv.indexOf('--output');
if (outputIndex !== -1) {
  const destination = process.argv[outputIndex + 1];
  if (!destination || destination.startsWith('--')) throw new Error('--output requires a file path.');
  const path = resolve(destination);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`Saved readiness evidence to ${path}`);
}
for (const item of checks) console.log(`${item.status.padEnd(7)} ${item.id}: ${item.detail}`);
console.log(`Submission configuration: ${report.submission?.track ?? 'unset'} / ${report.submission?.releaseStatus ?? 'unset'}`);
console.log('Manual gates remain required even when every public check passes.');
process.exitCode = checks.some(item => item.status !== 'PASS') ? 1 : 0;
