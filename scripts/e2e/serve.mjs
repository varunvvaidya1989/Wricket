import { spawn } from 'node:child_process';
import { testEnvironment } from './environment.mjs';

const config = testEnvironment(process.env);
const child = spawn(process.execPath, ['node_modules/expo/bin/cli', 'start', '--web', '--port', '4173', '--max-workers', '2'], {
  stdio: 'inherit',
  env: {
    ...process.env,
    CI: '1', EXPO_OFFLINE: '1', EXPO_NO_DOTENV: '1', EXPO_NO_TELEMETRY: '1',
    APP_ENV: 'test', EXPO_PUBLIC_WRICKET_E2E: 'true',
    EXPO_PUBLIC_SUPABASE_URL: config.backendURL,
    EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: config.publishableKey,
  },
});
child.on('error', error => { console.error(error.message); process.exitCode = 1; });
child.on('exit', code => { process.exitCode = code ?? 1; });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
