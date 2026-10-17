import { invoke, isTauri } from '@tauri-apps/api/core';
import type { Note } from './model';
import seeds from './seeds.json';
const KEY = 'phosphor.notes.v1';
export const native = isTauri();
export async function loadNotes(): Promise<Note[]> {
  if (native) return invoke('list_notes');
  const raw = localStorage.getItem(KEY);
  if (raw === null) { localStorage.setItem(KEY, JSON.stringify(seeds)); return structuredClone(seeds); }
  const value: unknown = JSON.parse(raw);
  if (!Array.isArray(value) || !value.every(n => typeof n.id === 'string' && typeof n.body === 'string' && typeof n.title === 'string' && typeof n.tags === 'string' && typeof n.notebook === 'string' && typeof n.starred === 'boolean' && typeof n.trashed === 'boolean' && typeof n.updatedAt === 'number' && typeof n.createdAt === 'number')) throw Error('Local notes could not be read. Your stored data has been left untouched.');
  return value as Note[];
}
export async function saveNote(note: Note) {
  if (native) return invoke('save_note', { note });
  const raw = localStorage.getItem(KEY);
  const notes: Note[] = raw ? JSON.parse(raw) : [];
  const index = notes.findIndex(n => n.id === note.id);
  if (index < 0) notes.push(note); else notes[index] = note;
  localStorage.setItem(KEY, JSON.stringify(notes));
}
export function saveBrowserSnapshot(notes: Note[]) { if (!native) localStorage.setItem(KEY, JSON.stringify(notes)); }
