import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = fileURLToPath(new URL('../', import.meta.url));
const target = 'supabase/functions/_shared/cricket-mvp-generated';
const sources = ['mvp/calculator', 'mvp/config', 'mvp/cloud-input', 'statistics'];
const outputs = new Map();
const hashes = {};
for (const file of sources) {
  const path = `lib/wricket/domain/${file}.ts`;
  const source = await readFile(resolve(root, path), 'utf8');
  hashes[path] = createHash('sha256').update(source).digest('hex');
  const compiled = ts.transpileModule(source, { compilerOptions: {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext,
  }, fileName: path }).outputText.replace(/(from\s+['"])(\.[^'"]+)(['"])/g,
    (_, prefix, path, suffix) => `${prefix}${path.replace(/\.ts$/, '')}.mjs${suffix}`);
  outputs.set(`${target}/${file}.mjs`, '// Generated from the canonical app source; run npm run mvp:edge:build.\n' + compiled);
}
for (const name of ['cricket-mvp-batch', 'cricket-mvp-queue-health']) {
  const path = `scripts/${name}.mjs`;
  const source = await readFile(resolve(root, path), 'utf8');
  hashes[path] = createHash('sha256').update(source).digest('hex');
  outputs.set(`${target}/${name}.mjs`, '// Generated from the canonical server source; run npm run mvp:edge:build.\n' + source);
}
outputs.set(`${target}/sources.json`, JSON.stringify(hashes, null, 2) + '\n');
for (const [path, content] of outputs) {
  const destination = resolve(root, path);
  if (process.argv.includes('--check')) {
    if ((await readFile(destination, 'utf8')).replaceAll('\r\n', '\n') !== content.replaceAll('\r\n', '\n')) {
      throw new Error(`Edge worker is out of date: ${path}. Run npm run mvp:edge:build.`);
    }
  } else {
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, content);
  }
}
console.log(process.argv.includes('--check') ? 'Edge worker matches canonical sources.' : 'Built Edge worker from canonical sources.');
