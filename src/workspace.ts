import { strToU8, zipSync } from 'fflate';
import type { Note } from './model';
export interface Workspace { notes: Note[]; notebooks: string[] }
export interface Backup { version: 1; createdAt: number; workspace: Workspace }
export interface BackupInfo { id: string; createdAt: number; notes: number; kind: string }
export interface SearchOptions { query: string; notebook: string | null; tag: string | null; trashed: boolean; starred: boolean; sort: string }
export interface SearchHit { id: string; snippet: string }
export function normalizeTags(value: string) {
  const seen = new Set<string>();
  return value.split(',').map(t => t.trim()).filter(t => t && !seen.has(t.toLocaleLowerCase()) && seen.add(t.toLocaleLowerCase())).join(', ');
}
export function validateWorkspace(value: unknown): asserts value is Workspace {
  const w = value as Workspace;
  if (!w || !Array.isArray(w.notes) || !Array.isArray(w.notebooks) || !w.notebooks.includes('Inbox') || w.notebooks.some(n => typeof n !== 'string' || !n.trim()) || new Set(w.notebooks.map(n => n.toLowerCase())).size !== w.notebooks.length || new Set(w.notes.map(n => n?.id)).size !== w.notes.length || !w.notes.every(n => n && typeof n.id === 'string' && n.id && typeof n.body === 'string' && typeof n.title === 'string' && typeof n.tags === 'string' && w.notebooks.includes(n.notebook) && typeof n.starred === 'boolean' && typeof n.trashed === 'boolean' && Number.isFinite(n.updatedAt) && Number.isFinite(n.createdAt))) throw Error('Invalid workspace. Stored data has been left untouched.');
}
export function highlightParts(text: string, query: string): { text: string; match: boolean }[] {
  // Render text nodes, never HTML. Native snippets use ASCII marker delimiters.
  if (text.includes('\x01')) return text.split(/(\x01[^\x02]*\x02)/).filter(Boolean).map(t => ({ text: t.replace(/[\x01\x02]/g, ''), match: t.startsWith('\x01') }));
  const tokens = query.match(/[\p{L}\p{N}]+/gu) ?? [];
  if (!tokens.length) return [{ text, match: false }];
  const re = new RegExp(`(${tokens.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'ig');
  return text.split(re).map((t, i) => ({ text: t, match: i % 2 === 1 })).filter(p => p.text);
}
function safeName(value: string) { return value.replace(/[^\p{L}\p{N} _-]/gu, '_').trim().slice(0, 70) || 'Untitled'; }
export function markdownArchive(workspace: Workspace): Uint8Array {
  validateWorkspace(workspace);
  const files: Record<string, Uint8Array> = {};
  // Numeric prefixes prevent collisions even for path-like IDs/names or Unicode normalization.
  workspace.notes.forEach((note, i) => {
    const notebookIndex = workspace.notebooks.indexOf(note.notebook);
    const folder = `${note.trashed ? 'Trash/' : ''}${notebookIndex + 1}-${safeName(note.notebook)}`;
    files[`${folder}/${i + 1}-${safeName(note.title)}.md`] = strToU8(`# ${note.title || 'Untitled note'}\n\n${note.body}\n`);
  });
  files['phosphor-backup.json'] = strToU8(JSON.stringify({ version: 1, createdAt: Date.now(), workspace } satisfies Backup, null, 2));
  files['README.txt'] = strToU8('Phosphor Markdown export. Includes active and trashed notes. The JSON manifest preserves IDs, notebooks, tags, timestamps and favorites. Store a copy on another device for protection against disk failure.\n');
  return zipSync(files);
}
export function sortNotes(notes: Note[], sort: string) {
  return [...notes].sort((a,b) => sort === 'title' ? a.title.localeCompare(b.title) || a.id.localeCompare(b.id) : sort === 'created' ? b.createdAt-a.createdAt || a.id.localeCompare(b.id) : b.updatedAt-a.updatedAt || a.id.localeCompare(b.id));
}
