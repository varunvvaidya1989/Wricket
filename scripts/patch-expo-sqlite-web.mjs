import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

// Expo 16.0.10 eagerly opens OPFS even for :memory:. Keep the workaround
// reproducible on install, and require review when the dependency changes.
const root = fileURLToPath(new URL('../', import.meta.url));
const patch = JSON.parse(await readFile(resolve(root, 'patches/expo-sqlite-16.0.10-web-memory.json'), 'utf8'));
const metadata = JSON.parse(await readFile(resolve(root, 'node_modules/expo-sqlite/package.json'), 'utf8'));
if (metadata.version !== patch.packageVersion) throw new Error('Review the SQLite web-memory patch for the installed dependency version.');
const target = resolve(root, 'node_modules/expo-sqlite/web/worker.ts');
const original = await readFile(target, 'utf8');
const digest = text => createHash('sha256').update(text).digest('hex');
if (digest(original) === patch.patchedSha256) {
  console.log('SQLite web-memory patch already applied.');
} else {
  if (digest(original) !== patch.originalSha256) throw new Error('SQLite worker differs from the reviewed patch input.');
  let output = original;
  for (const { before, after } of patch.replacements) {
    if (output.split(before).length !== 2) throw new Error('SQLite patch context is not unique.');
    output = output.replace(before, after);
  }
  if (digest(output) !== patch.patchedSha256) throw new Error('SQLite patch output checksum mismatch.');
  await writeFile(target, output);
  console.log('Applied reviewed SQLite in-memory web VFS patch; native sources unchanged.');
}
