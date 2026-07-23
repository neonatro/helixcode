import fs from 'node:fs/promises';
import fssync from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { getMode, getWorkspaceRoot } from './state';
import type { FileNode, ToolResult } from '../shared/types';

const exec = promisify(execFile);
const ignored = new Set(['node_modules', '.git', 'dist', 'release']);

async function realOrResolved(target: string, mustExist = true) {
  const resolved = path.resolve(target);
  if (!mustExist) {
    let existing = path.dirname(resolved);
    while (!fssync.existsSync(existing)) {
      const next = path.dirname(existing);
      if (next === existing) throw new Error('Cannot resolve a safe parent directory.');
      existing = next;
    }
    return path.join(await fs.realpath(existing), path.relative(existing, resolved));
  }
  return fs.realpath(resolved);
}
export async function assertAllowed(target: string, write = false) {
  const root = getWorkspaceRoot();
  const candidate = path.isAbsolute(target) ? target : path.join(root || process.cwd(), target);
  const resolved = await realOrResolved(candidate, !write || fssync.existsSync(candidate));
  if (getMode() === 'extended') return resolved;
  if (!root) throw new Error('Open a project folder first.');
  const realRoot = await fs.realpath(root);
  if (resolved !== realRoot && !resolved.startsWith(realRoot + path.sep)) throw new Error('Blocked: path is outside the open project.');
  return resolved;
}
export async function tree(dir = getWorkspaceRoot()): Promise<FileNode[]> {
  if (!dir) return [];
  const safe = await assertAllowed(dir);
  const entries = await fs.readdir(safe, { withFileTypes: true });
  const out = await Promise.all(entries.filter(e => !ignored.has(e.name)).sort((a,b) => Number(b.isDirectory()) - Number(a.isDirectory()) || a.name.localeCompare(b.name)).map(async e => {
    const full = path.join(safe, e.name);
    if (e.isDirectory()) return { name: e.name, path: full, type: 'directory' as const };
    return { name: e.name, path: full, type: 'file' as const };
  }));
  return out;
}
export async function readFile(target: string) { return fs.readFile(await assertAllowed(target), 'utf8'); }
export async function writeFile(target: string, content: string) { const safe = await assertAllowed(target, true); const existed = fssync.existsSync(safe); await fs.mkdir(path.dirname(safe), { recursive: true }); await fs.writeFile(safe, content, 'utf8'); return existed ? 'modified' : 'created'; }
export async function createPath(target: string, directory: boolean) { const safe = await assertAllowed(target, true); if (directory) await fs.mkdir(safe); else { await fs.mkdir(path.dirname(safe), { recursive: true }); await fs.writeFile(safe, '', { flag: 'wx' }); } }
export async function renamePath(oldPath: string, newPath: string) { await fs.rename(await assertAllowed(oldPath), await assertAllowed(newPath, true)); }
export async function deletePath(target: string) { await fs.rm(await assertAllowed(target), { recursive: true, force: false }); }
export async function searchInFiles(query: string, start?: string): Promise<string> {
  const base = await assertAllowed(start || getWorkspaceRoot()!); const results: string[] = [];
  async function walk(dir: string) { for (const e of await fs.readdir(dir, { withFileTypes: true })) { if (ignored.has(e.name)) continue; const full = path.join(dir, e.name); if (e.isDirectory()) await walk(full); else { try { const content = await fs.readFile(full, 'utf8'); content.split(/\r?\n/).forEach((line, i) => { if (line.toLowerCase().includes(query.toLowerCase())) results.push(`${full}:${i + 1}: ${line.trim().slice(0, 240)}`); }); } catch {} if (results.length > 150) return; } } }
  await walk(base); return results.join('\n') || 'No matches.';
}
export async function applyPatch(target: string, patch: string): Promise<string> {
  const current = await readFile(target); const match = patch.match(/^<<<<<<<.*?\n([\s\S]*?)^=======\n([\s\S]*?)^>>>>>>>.*?$/m);
  if (!match) throw new Error('Use a single conflict-style patch with <<<<<<<, =======, >>>>>>> markers.');
  const before = match[1].replace(/\n$/, ''); const after = match[2].replace(/\n$/, '');
  if (!current.includes(before)) throw new Error('Patch context was not found in the current file.');
  await writeFile(target, current.replace(before, after)); return 'Patch applied.';
}
export async function runCommand(cmd: string, cwd?: string): Promise<ToolResult> {
  const dir = await assertAllowed(cwd || getWorkspaceRoot()!); const shell = process.platform === 'win32' ? 'cmd.exe' : '/bin/sh'; const args = process.platform === 'win32' ? ['/d', '/s', '/c', cmd] : ['-lc', cmd];
  try { const { stdout, stderr } = await exec(shell, args, { cwd: dir, timeout: 120000, maxBuffer: 1024 * 1024 }); return { content: `${stdout}${stderr ? `\nSTDERR:\n${stderr}` : ''}`.slice(0, 100000) }; }
  catch (error: any) { return { content: `${error.stdout ?? ''}\n${error.stderr ?? error.message}`, error: true }; }
}
