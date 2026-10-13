import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { resolve, dirname, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

// Execute the actual application API/domain code against the isolated backend.
// Replace only its Expo client factory; never substitute fixture or score results.
export async function loadDomainApi(name, client) {
  if (!['fixturesApi', 'personalStatsApi', 'tournamentStatsApi', 'mvpApi'].includes(name)) throw new Error('Unsupported acceptance API');
  const root = fileURLToPath(new URL('../../', import.meta.url));
  const output = resolve(root, '.e2e/domain-api');
  const visited = new Set();
  globalThis.__wricketAcceptanceClient = client;
  async function compile(file) {
    if (visited.has(file)) return;
    visited.add(file);
    const destination = resolve(output, relative(root, file).replace(/\.ts$/, '.mjs'));
    await mkdir(dirname(destination), { recursive: true });
    if (file === resolve(root, 'lib/supabase/client.ts')) {
      await writeFile(destination, 'export const getSupabaseClient = () => globalThis.__wricketAcceptanceClient;\n');
      return;
    }
    const source = ts.transpileModule(await readFile(file, 'utf8'), { compilerOptions: {
      target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext,
    }, fileName: file }).outputText;
    let compiled = source;
    for (const match of source.matchAll(/(?:from|import)\s*['"]([^'"]+)['"]/g)) {
      const imported = match[1];
      if (!imported.startsWith('.') && !imported.startsWith('@/')) continue;
      const base = imported.startsWith('@/') ? resolve(root, imported.slice(2)) : resolve(dirname(file), imported);
      let dependency;
      for (const candidate of [base + '.ts', resolve(base, 'index.ts')]) {
        if (await stat(candidate).then(value => value.isFile()).catch(() => false)) { dependency = candidate; break; }
      }
      if (!dependency) throw new Error('Acceptance dependency missing: ' + imported);
      await compile(dependency);
      const target = resolve(output, relative(root, dependency).replace(/\.ts$/, '.mjs'));
      const path = relative(dirname(destination), target).replaceAll('\\', '/');
      compiled = compiled.replaceAll(`'${imported}'`, `'./${path}'`).replaceAll(`"${imported}"`, `"./${path}"`);
    }
    await writeFile(destination, compiled);
  }
  const entry = resolve(root, `lib/supabase/${name}.ts`);
  await compile(entry);
  return (await import(pathToFileURL(resolve(output, `lib/supabase/${name}.mjs`)).href))[name];
}
