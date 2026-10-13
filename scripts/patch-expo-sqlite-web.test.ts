import { readFileSync } from 'node:fs';
import { URL } from 'node:url';
import vm from 'node:vm';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';

function setup(failPersistent = false) {
  const patch = JSON.parse(readFileSync(new URL('../patches/expo-sqlite-16.0.10-web-memory.json', import.meta.url), 'utf8'));
  const initialize = patch.replacements.find((change: { before: string }) => change.before.startsWith('async function maybeInitAsync')).after;
  const persistent = vi.fn(async () => { if (failPersistent) throw new Error('OPFS unavailable'); return { persistent: true }; });
  const memory = vi.fn(async () => ({ memory: true }));
  const register = vi.fn();
  const createModule = vi.fn(async () => ({}));
  const context = vm.createContext({ WaSQLiteFactory: createModule, wasmModule: 'wasm',
    SQLite: { Factory: () => ({ vfs_register: register }) }, AccessHandlePoolVFS: { create: persistent }, MemoryVFS: { create: memory },
  });
  const source = 'let _sqlite3=null, _sqliteModule=null, _vfs=null, _vfsMemory=null; const VFS_NAME_MEMORY="memory", VFS_NAME_PERSISTENT="persistent"; ' + initialize;
  vm.runInContext(ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context);
  const init = (required = false) => vm.runInContext(`maybeInitAsync(${required})`, context);
  return { init, persistent, memory, register, createModule };
}
describe('reviewed Expo SQLite web memory patch', () => {
  it('opens memory without touching an unavailable private filesystem', async () => {
    const api = setup(true); await api.init(); await api.init();
    expect(api.persistent).not.toHaveBeenCalled(); expect(api.memory).toHaveBeenCalledTimes(1);
    expect(api.createModule).toHaveBeenCalledTimes(1);
  });
  it('initialises persistent storage when explicitly requested after memory', async () => {
    const api = setup(); await api.init(); await api.init(true); await api.init(true);
    expect(api.persistent).toHaveBeenCalledTimes(1); expect(api.memory).toHaveBeenCalledTimes(1);
  });
  it('propagates persistent failures without silently replacing a durable database', async () => {
    const api = setup(true); await expect(api.init(true)).rejects.toThrow('OPFS unavailable');
    await expect(api.init()).resolves.toHaveProperty('vfs', null);
  });
});
