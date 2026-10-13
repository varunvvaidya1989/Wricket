import { mkdir, readFile, writeFile, copyFile, readdir, cp } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const destination = resolve(root, '.e2e/stack/supabase');
await mkdir(join(destination, 'migrations'), { recursive: true });
const source = join(root, 'supabase');
let config = await readFile(join(source, 'config.toml'), 'utf8');
config = config.replace(/^project_id = .+$/m, 'project_id = "wricket-e2e"');
// The original cloud schema predates Supabase's default-privilege opt-in.
// Preserve that platform baseline; the unchanged migrations enforce application RLS.
config = config.replace(/^# auto_expose_new_tables = true$/m, 'auto_expose_new_tables = true');
config = config.replace(/\[db.seed\][\s\S]*?(?=\n\[)/, '[db.seed]\nenabled = false\nsql_paths = []\n');
await writeFile(join(destination, 'config.toml'), config);
await copyFile(join(root, 'scripts/e2e/local-platform.sql'), join(destination, 'roles.sql'));
await cp(join(source, 'templates'), join(destination, 'templates'), { recursive: true });
const migrations = (await readdir(join(source, 'migrations'))).filter(name => name.endsWith('.sql'));
const stale = (await readdir(join(destination, 'migrations'))).filter(name => !migrations.includes(name));
if (stale.length) throw new Error('Isolated migration copy has stale files; review .e2e/stack before proceeding.');
for (const name of migrations) await copyFile(join(source, 'migrations', name), join(destination, 'migrations', name));
console.log(`Prepared isolated wricket-e2e stack with ${migrations.length} unchanged migrations; no remote link or application env copied.`);
