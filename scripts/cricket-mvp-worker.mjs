import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import ts from 'typescript';
import { processMvpBatch } from './cricket-mvp-batch.mjs';
import { serverClient, startWorkerHealth } from './cricket-mvp-operations.mjs';

// Compile the canonical app algorithm for Node 20. No copied scoring formulas.
export async function loadMvpAlgorithm(output = '.e2e/mvp-worker') {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const target = resolve(root, output);
  const files = ['mvp/calculator', 'mvp/config', 'mvp/cloud-input', 'statistics'];
  for (const file of files) {
    const source = await readFile(resolve(root, 'lib/wricket/domain', `${file}.ts`), 'utf8');
    const compiled = ts.transpileModule(source, { compilerOptions: {
      target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext,
    }, fileName: `${file}.ts` }).outputText.replace(/(from\s+['"])(\.[^'"]+)(['"])/g,
      (_, prefix, path, suffix) => `${prefix}${path.replace(/\.ts$/, '')}.mjs${suffix}`);
    const destination = resolve(target, `${file}.mjs`);
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, compiled);
  }
  const [{ calculateMatchMvp }, { cloudMvpInput }] = await Promise.all([
    import(pathToFileURL(resolve(target, 'mvp/calculator.mjs')).href),
    import(pathToFileURL(resolve(target, 'mvp/cloud-input.mjs')).href),
  ]);
  return { calculateMatchMvp, cloudMvpInput };
}

export { processMvpBatch };

async function main() {
  const local = process.argv.includes('--local');
  if (!local && !process.argv.includes('--production')) throw new Error('Choose --local or --production explicitly.');
  if (local && process.argv.includes('--production')) throw new Error('Choose only one backend.');
  let client;
  if (local) client = (await (await import('./e2e/backend-fixture.mjs')).localClients()).admin;
  else {
    client = serverClient(process.env);
  }
  const algorithm = await loadMvpAlgorithm(process.env.WRICKET_MVP_BUILD_DIR ?? '.e2e/mvp-worker');
  const once = process.argv.includes('--once');
  const health = once ? null : startWorkerHealth({
    port: Number(process.env.WRICKET_MVP_HEALTH_PORT ?? 8088),
    host: process.env.WRICKET_MVP_HEALTH_HOST ?? '127.0.0.1',
  });
  if (health) await health.ready;
  let stopping = false;
  process.on('SIGTERM', () => { stopping = true; });
  process.on('SIGINT', () => { stopping = true; });
  try {
    do {
      const totals = await processMvpBatch(client, algorithm);
      health?.record(totals);
      console.log(JSON.stringify({ event: 'mvp_batch', at: new Date().toISOString(), ...totals }));
      if (once || stopping) { if (totals.failed) process.exitCode = 1; break; }
      await new Promise(resolve => setTimeout(resolve, 3000));
    } while (!stopping);
  } finally { await health?.close(); }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { await main(); } catch {
    // Supabase errors may contain operational data. Keep supervisor logs redacted.
    console.error(JSON.stringify({ event: 'mvp_worker_unavailable', at: new Date().toISOString() }));
    process.exitCode = 1;
  }
}
