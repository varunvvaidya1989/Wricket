import { readFile } from 'node:fs/promises';
import { manifestPath } from './backend-fixture.mjs';
const fixture = JSON.parse(await readFile(manifestPath, 'utf8'));
process.env.WRICKET_E2E_BACKEND_URL = fixture.backendURL;
process.env.WRICKET_E2E_PUBLISHABLE_KEY = fixture.publishableKey;
await import('./serve.mjs');
