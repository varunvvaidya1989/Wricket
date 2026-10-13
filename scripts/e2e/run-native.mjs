import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { manifestPath } from './backend-fixture.mjs';
import { testEnvironment } from './environment.mjs';

const fixture = JSON.parse(await readFile(manifestPath, 'utf8'));
const config = testEnvironment({ ...process.env, WRICKET_E2E_BACKEND_URL: fixture.backendURL, WRICKET_E2E_PUBLISHABLE_KEY: fixture.publishableKey });
const child = spawn(process.execPath, ['node_modules/expo/bin/cli', 'run:android', '--no-bundler', '--no-install', '--device', 'Pixel_7'], {
  stdio: 'inherit', env: { ...process.env, CI: '1', EXPO_NO_DOTENV: '1', EXPO_NO_TELEMETRY: '1', APP_ENV: 'test', EXPO_PUBLIC_WRICKET_E2E: 'true',
    EXPO_PUBLIC_SUPABASE_URL: config.backendURL, EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: config.publishableKey },
});
child.on('error', error => { console.error(error.message); process.exitCode = 1; });
child.on('exit', code => { process.exitCode = code ?? 1; });
