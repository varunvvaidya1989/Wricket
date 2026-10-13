import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

export const nativePackage = 'com.vcreativestudio.sportstage.e2e';
const serial = process.env.WRICKET_E2E_NATIVE_SERIAL ?? 'emulator-5556';
if (serial !== 'emulator-5556') throw new Error('Native acceptance is restricted to the dedicated Wricket_E2E emulator');
export const adb = (...args) => execFileSync('adb', ['-s', serial, ...args], { encoding: 'utf8', timeout: 60000, maxBuffer: 6 * 1024 * 1024 });
export async function waitForMetro() {
  const deadline = Date.now() + 180000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch('http://127.0.0.1:4173/status', { signal: AbortSignal.timeout(5000) });
      if (response.ok && (await response.text()).includes('packager-status:running')) return;
    } catch { /* Starting the local bundler is retryable. */ }
    await new Promise(resolve => setTimeout(resolve,1000));
  }
  throw new Error('Local native bundler did not become ready');
}
const decode = value => value.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)));
export function nodes() {
  const dumped = adb('shell', 'uiautomator', 'dump', '/sdcard/wricket-e2e-window.xml');
  // Android can return exit 0 with a null root while an Activity starts. It
  // leaves the prior XML file intact; never treat that stale window as ready.
  if (!dumped.includes('dumped to:')) return [];
  const xml = adb('shell', 'cat', '/sdcard/wricket-e2e-window.xml');
  return [...xml.matchAll(/<node\s+([^>]+)>/g)].map(match => Object.fromEntries([...match[1].matchAll(/([\w-]+)="([^"]*)"/g)].map(item => [item[1], decode(item[2])]))).filter(node => {
    // React Native includes clipped descendants in the XML. Their bottom can
    // precede their top; tapping those coordinates hits a different control.
    const bounds = node.bounds?.match(/\[(\d+),(\d+)\]\[(\d+),(\d+)\]/);
    return bounds && Number(bounds[3]) > Number(bounds[1]) && Number(bounds[4]) > Number(bounds[2]);
  });
}
export async function waitFor(label, timeout = 120000) {
  console.info('WAIT native: ' + label);
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const match = nodes().find(node => node.text === label || node['content-desc'] === label);
    if (match) return match;
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  screenshot('native-failed.png');
  throw new Error('Native control not found: ' + label);
}
export function tapNode(node) {
  const bounds = node.bounds?.match(/\[(\d+),(\d+)\]\[(\d+),(\d+)\]/);
  if (!bounds) throw new Error('Native control has no bounds');
  adb('shell', 'input', 'tap', String(Math.floor((Number(bounds[1]) + Number(bounds[3])) / 2)), String(Math.floor((Number(bounds[2]) + Number(bounds[4])) / 2)));
}
export async function tap(label) { tapNode(await waitFor(label)); }
export async function scrollTo(label) {
  for (const direction of ['down','up']) {
    for (let attempt = 0; attempt < 8; attempt++) {
      const match = nodes().find(node => node.text === label || node['content-desc'] === label);
      if (match) return match;
      const start = direction === 'down' ? '1500' : '650';
      const end = direction === 'down' ? '650' : '1500';
      adb('shell', 'input', 'swipe', '540', start, '540', end, '400');
    }
  }
  throw new Error('Native scroll target not found: ' + label);
}
export function type(value) {
  // adb shell joins its arguments; restrict shell metacharacters and never log test credentials.
  if (!/^[a-zA-Z0-9@._+!#% -]+$/.test(value)) throw new Error('Unsupported characters for native text input');
  adb('shell', 'input', 'text', value.replace(/ /g, '%s'));
}
export function hideKeyboard() {
  if (/mInputShown=true|isInputViewShown=true/.test(adb('shell', 'dumpsys', 'input_method'))) adb('shell', 'input', 'keyevent', '4');
}
export function open(route) {
  if (!/^\/wricket(?:\/|$)/.test(route)) throw new Error('Native acceptance only opens Wricket routes');
  adb('shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', 'sportstage-e2e://' + route, '-p', nativePackage);
}
export function openAuth(returnTo) {
  if (!/^\/wricket(?:\/|$)/.test(returnTo)) throw new Error('Native auth return must stay in Wricket');
  adb('shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', 'sportstage-e2e:///auth?returnTo=' + encodeURIComponent(returnTo), '-p', nativePackage);
}
export function screenshot(name) {
  if (!/^[\w-]+\.png$/.test(name)) throw new Error('Invalid screenshot name');
  writeFileSync('.e2e/' + name, execFileSync('adb', ['-s', serial, 'exec-out', 'screencap', '-p'], { timeout: 30000, maxBuffer: 10 * 1024 * 1024 }));
}
