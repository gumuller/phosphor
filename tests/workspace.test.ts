import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/svelte';
import { unzipSync, strFromU8 } from 'fflate';
import App from '../src/App.svelte';
import { loadWorkspace, createNotebook, changeNotebook, changeTag, saveNote, createBackup, restoreBackup, listBackups } from '../src/storage';
import { markdownArchive, highlightParts, normalizeTags, sortNotes } from '../src/workspace';
beforeEach(() => localStorage.clear());
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
it('exports all notes without path traversal/collisions and preserves metadata', async () => {
  const workspace = await loadWorkspace();
  workspace.notes[0] = { ...workspace.notes[0], id: '../../escape', title: '../Same', trashed: true };
  workspace.notes[1] = { ...workspace.notes[1], title: '../Same' };
  const files = unzipSync(markdownArchive(workspace));
  const paths = Object.keys(files);
  expect(paths.filter(p => p.endsWith('.md'))).toHaveLength(workspace.notes.length);
  expect(paths.some(p => p.startsWith('Trash/'))).toBe(true);
  expect(paths.every(p => !p.split('/').includes('..'))).toBe(true);
  expect(JSON.parse(strFromU8(files['phosphor-backup.json'])).workspace).toEqual(workspace);
  expect(Object.values(files).map(bytes => strFromU8(bytes)).some(s => s.includes('Welcome to Phosphor'))).toBe(true);
});
it('highlights native markers and literal queries safely without treating input as markup', () => {
  expect(highlightParts('hello \x01world\x02 <script>', 'world')).toEqual([{ text: 'hello ', match: false }, { text: 'world', match: true }, { text: ' <script>', match: false }]);
  expect(highlightParts('World hello', 'world')[0]).toEqual({ text: 'World', match: true });
  expect(normalizeTags(' work, Work, homework, ,ideas ')).toBe('work, homework, ideas');
});
it('sorts titles and timestamps deterministically', async () => {
  const { notes } = await loadWorkspace();
  expect(sortNotes(notes, 'created').map(n => n.createdAt)).toEqual(notes.map(n => n.createdAt).sort((a,b) => b-a));
  expect(sortNotes(notes, 'title').map(n => n.title)).toEqual(notes.map(n => n.title).sort((a,b) => a.localeCompare(b)));
});
it('browser preview persists empty notebooks, merges tags and restores with a recovery copy', async () => {
  await createNotebook('Research');
  const before = await loadWorkspace();
  await saveNote({ ...before.notes[0], notebook: 'Research', tags: 'alpha, beta' });
  const snapshot = await createBackup();
  await changeNotebook('Research', 'Writing');
  await changeTag('alpha', 'beta');
  expect((await loadWorkspace()).notes[0].tags).toBe('beta');
  await changeNotebook('Writing', null);
  expect((await loadWorkspace()).notes[0].notebook).toBe('Inbox');
  await restoreBackup(snapshot.id);
  expect((await loadWorkspace()).notebooks).toContain('Research');
  expect((await loadWorkspace()).notes[0].tags).toBe('alpha, beta');
  expect((await listBackups()).some(b => b.kind === 'recovery')).toBe(true);
});
it('leaves stored data untouched if a malformed browser workspace is loaded', async () => {
  const raw = '{"notes":[],"notebooks":[]}'; localStorage.setItem('phosphor.workspace.v2', raw);
  await expect(loadWorkspace()).rejects.toThrow('Invalid workspace');
  expect(localStorage.getItem('phosphor.workspace.v2')).toBe(raw);
});
it('manages notebooks and restores snapshots through the interface', async () => {
  render(App);
  await screen.findByDisplayValue('A place for your thoughts');
  await fireEvent.click(screen.getByRole('button', { name: 'Manage notebooks' }));
  await fireEvent.input(screen.getByRole('textbox', { name: 'New notebook name' }), { target: { value: 'Research' } });
  await fireEvent.click(screen.getByRole('button', { name: 'Create notebook' }));
  await screen.findByText('Notebook created.');
  await fireEvent.change(screen.getByRole('combobox', { name: 'Manage notebook' }), { target: { value: 'Research' } });
  await fireEvent.input(screen.getByRole('textbox', { name: 'Notebook name' }), { target: { value: 'Writing' } });
  await fireEvent.click(screen.getByRole('button', { name: 'Rename notebook' }));
  await screen.findByText('Notebook renamed.');
  expect((await loadWorkspace()).notebooks).toContain('Writing');
  await fireEvent.click(screen.getByRole('tab', { name: 'Backups' }));
  await fireEvent.click(screen.getByRole('button', { name: 'Create snapshot' }));
  await screen.findByText('Snapshot created.');
  const snapshot = (await listBackups()).find(b => b.kind === 'manual')!;
  await fireEvent.click(screen.getByRole('button', { name: `Restore ${snapshot.id}` }));
  expect(screen.getByText('Restore snapshot?')).toBeTruthy();
  await fireEvent.click(screen.getByRole('button', { name: 'Confirm restore' }));
  await screen.findByText('Workspace restored. A recovery snapshot contains your previous notes.');
  expect((await listBackups()).some(b => b.kind === 'recovery')).toBe(true);
  await fireEvent.click(screen.getByRole('button', { name: 'Close workspace tools' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
});
it('reports a snapshot write failure without a success message or changing notes', async () => {
  render(App); await screen.findByDisplayValue('A place for your thoughts');
  await fireEvent.click(screen.getByRole('button', { name: 'Backups & export' }));
  const before = await loadWorkspace();
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw Error('Quota exceeded'); });
  await fireEvent.click(screen.getByRole('button', { name: 'Create snapshot' }));
  await screen.findByText(/Quota exceeded/);
  expect(screen.queryByText('Snapshot created.')).toBeNull();
  expect(await loadWorkspace()).toEqual(before);
});
it('validates portable backup restoration before writing a recovery copy', async () => {
  const { restoreBackupFile } = await import('../src/storage');
  const before = await loadWorkspace();
  await expect(restoreBackupFile({ version: 1, createdAt: 0, workspace: { ...before, notes: [...before.notes, before.notes[0]] } })).rejects.toThrow('Invalid workspace');
  expect(await loadWorkspace()).toEqual(before);
  expect(await listBackups()).toHaveLength(0);
  await restoreBackupFile({ version: 1, createdAt: 0, workspace: before });
  expect((await listBackups())[0].kind).toBe('recovery');
});

it('reads the migrated workspace independently of an obsolete legacy key', async () => {
  const expected = await loadWorkspace();
  localStorage.setItem('phosphor.notes.v1', 'obsolete invalid JSON');
  expect(await loadWorkspace()).toEqual(expected);
});
