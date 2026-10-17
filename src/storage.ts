import { invoke, isTauri } from '@tauri-apps/api/core';
import { notebooks, type Note } from './model';
import { normalizeTags, validateWorkspace, type Workspace, type BackupInfo, type Backup, type SearchOptions, type SearchHit } from './workspace';
import seeds from './seeds.json';
const KEY = 'phosphor.workspace.v2';
const BACKUPS = 'phosphor.backups.v1';
export const native = isTauri();
export async function loadWorkspace(): Promise<Workspace> {
  if (native) return invoke('load_workspace');
  const raw = localStorage.getItem(KEY);
  let workspace: unknown;
  if (raw === null) {
    const old = localStorage.getItem('phosphor.notes.v1');
    const notes: Note[] = old === null ? structuredClone(seeds) : JSON.parse(old);
    if (!Array.isArray(notes)) throw Error('Invalid legacy notes. Stored data has been left untouched.');
    workspace = { notes, notebooks: [...new Set([...notebooks, ...notes.map(n => n.notebook)])] };
  } else workspace = JSON.parse(raw);
  validateWorkspace(workspace);
  if (raw === null) writeWorkspace(workspace);
  return workspace;
}
export async function loadNotes(): Promise<Note[]> { return (await loadWorkspace()).notes; }
function writeWorkspace(workspace: Workspace) { validateWorkspace(workspace); localStorage.setItem(KEY, JSON.stringify(workspace)); }
export async function saveNote(note: Note) {
  if (native) return invoke('save_note', { note });
  const workspace = await loadWorkspace();
  const value = { ...note, tags: normalizeTags(note.tags) };
  const index = workspace.notes.findIndex(n => n.id === note.id);
  if (index < 0) workspace.notes.push(value); else workspace.notes[index] = value;
  writeWorkspace(workspace);
}
export function saveBrowserSnapshot(notes: Note[]) {
  if (!native) {
    const raw = localStorage.getItem(KEY);
    if (raw) { const workspace = JSON.parse(raw) as Workspace; writeWorkspace({ ...workspace, notes }); }
  }
}
function validName(value: string, notebook = false) {
  const name = value.trim();
  if (!name || name.length > 80 || /[\x00-\x1f\x7f]/.test(name) || (notebook ? /^(All notes|Favorites|Trash)$/i.test(name) || name.startsWith('#') : name.includes(','))) throw Error('Choose a valid, unique name (1–80 characters).');
  return name;
}
export async function createNotebook(name: string): Promise<Workspace> {
  if (native) return invoke('create_notebook', { name });
  const w = await loadWorkspace(); name = validName(name, true);
  if (w.notebooks.some(n => n.toLowerCase() === name.toLowerCase())) throw Error('A notebook with that name already exists.');
  w.notebooks.push(name); writeWorkspace(w); return w;
}
export async function changeNotebook(old: string, replacement: string | null): Promise<Workspace> {
  if (native) return invoke('change_notebook', { old, replacement });
  const w = await loadWorkspace();
  if (old === 'Inbox' || !w.notebooks.includes(old)) throw Error('Inbox cannot be changed, or notebook no longer exists.');
  const target = replacement === null ? 'Inbox' : validName(replacement, true);
  if (replacement !== null && w.notebooks.some(n => n !== old && n.toLowerCase() === target.toLowerCase())) throw Error('A notebook with that name already exists.');
  w.notebooks = w.notebooks.flatMap(n => n === old ? replacement === null ? [] : [target] : [n]);
  w.notes = w.notes.map(n => n.notebook === old ? { ...n, notebook: target } : n);
  writeWorkspace(w); return w;
}
export async function changeTag(old: string, replacement: string | null): Promise<Workspace> {
  if (native) return invoke('change_tag', { old, replacement });
  const w = await loadWorkspace();
  const name = replacement === null ? null : validName(replacement);
  w.notes = w.notes.map(n => ({ ...n, tags: normalizeTags(n.tags.split(',').map(t => t.trim()).flatMap(t => t.toLowerCase() === old.toLowerCase() ? name === null ? [] : [name] : [t]).join(',')) }));
  writeWorkspace(w); return w;
}
function browserBackups(): Record<string, Backup> { return JSON.parse(localStorage.getItem(BACKUPS) ?? '{}'); }
export async function listBackups(): Promise<BackupInfo[]> {
  if (native) return invoke('list_backups');
  return Object.entries(browserBackups()).map(([id, b]) => ({ id, createdAt: b.createdAt, notes: b.workspace.notes.length, kind: id.split('-')[0] })).sort((a,b) => b.createdAt-a.createdAt);
}
export async function createBackup(kind = 'manual'): Promise<BackupInfo> {
  if (native) return invoke('create_backup');
  const backup: Backup = { version: 1, createdAt: Date.now(), workspace: await loadWorkspace() };
  const id = `${kind}-${crypto.randomUUID()}.json`; const backups = browserBackups(); backups[id] = backup;
  const automatic = Object.keys(backups).filter(k => k.startsWith('auto-')).sort((a,b) => backups[b].createdAt-backups[a].createdAt);
  automatic.slice(20).forEach(k => delete backups[k]);
  localStorage.setItem(BACKUPS, JSON.stringify(backups));
  return { id, createdAt: backup.createdAt, notes: backup.workspace.notes.length, kind };
}
export async function autoBackup() {
  if (native) return invoke('auto_backup');
  const latest = (await listBackups()).find(b => b.kind === 'auto');
  if (!latest || Date.now() - latest.createdAt >= 15 * 60 * 1000) await createBackup('auto');
}
export async function restoreBackup(id: string): Promise<Workspace> {
  if (native) return invoke('restore_backup', { id });
  const backup = browserBackups()[id];
  if (!backup || backup.version !== 1) throw Error('Invalid snapshot');
  validateWorkspace(backup.workspace);
  await createBackup('recovery'); writeWorkspace(backup.workspace); return backup.workspace;
}
export async function restoreBackupFile(backup: Backup): Promise<Workspace> {
  if (backup.version !== 1) throw Error('Unsupported backup version');
  validateWorkspace(backup.workspace);
  if (native) return invoke('restore_backup_file', { backup });
  await createBackup('recovery'); writeWorkspace(backup.workspace); return backup.workspace;
}
export async function searchNotes(options: SearchOptions): Promise<SearchHit[]> {
  if (native) return invoke('search_notes', { options });
  const tokens = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  const terms = tokens(options.query);
  if (!terms.length) return [];
  return (await loadNotes()).filter(n => n.trashed === options.trashed && (!options.starred || n.starred) && (!options.notebook || n.notebook === options.notebook) && (!options.tag || n.tags.split(',').some(t => t.trim().toLowerCase() === options.tag!.toLowerCase()))).filter(n => {
    const words = tokens(`${n.title} ${n.body} ${n.tags} ${n.notebook}`);
    return terms.every(t => words.some(w => w.startsWith(t)));
  }).map(n => {
    const first = terms.map(t => n.body.toLowerCase().indexOf(t)).filter(i => i >= 0).sort((a,b) => a-b)[0] ?? 0;
    return { id: n.id, snippet: (first > 40 ? '…' : '') + n.body.slice(Math.max(0, first-40), first+160) };
  });
}
