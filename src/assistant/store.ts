import {dataDirectory} from './data-directory.js';
import { mkdir, readFile, writeFile, rename, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { workspaceSchema, type Workspace } from './contracts.js';

/** Single local owner; atomic JSON state, independent of model/chat history. */
export class WorkspaceStore {
  readonly root: string;
  constructor(root = dataDirectory()) { this.root = resolve(root); }
  sessionKey(thread: string) { return createHash('sha256').update(thread).digest('hex'); }
  async read(): Promise<Workspace> {
    try { return workspaceSchema.parse(JSON.parse(await readFile(join(this.root, 'workspace.json'), 'utf8'))); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return workspaceSchema.parse({ version: 1, sessions: {}, profiles: {} });
      throw new Error('Workspace cannot be read or validated. Restore its backup; do not overwrite it.');
    }
  }
  async update<T>(change: (workspace: Workspace) => Promise<T>): Promise<T> {
    await mkdir(this.root, { recursive: true, mode: 0o700 });
    const lock = join(this.root, 'workspace.lock');
    try { await mkdir(lock, { mode: 0o700 }); }
    catch { throw new Error('Workspace is busy. Retry after the current operation; see README for stale-lock recovery.'); }
    const temporary = join(this.root, `${randomUUID()}.tmp`);
    try {
      const workspace = await this.read();
      const result = await change(workspace);
      const encoded = JSON.stringify(workspaceSchema.parse(workspace));
      if (Buffer.byteLength(encoded) > 4_000_000) throw new Error('Workspace exceeds 4 MB. Archive old local sessions before continuing.');
      await writeFile(temporary, encoded, { flag: 'wx', mode: 0o600 });
      await rename(temporary, join(this.root, 'workspace.json'));
      return result;
    } finally { await rm(temporary, { force: true }); await rm(lock, { recursive: true, force: true }); }
  }
}
