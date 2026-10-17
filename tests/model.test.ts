import { describe, it, expect } from 'vitest';
import { filterNotes, SaveQueue, type Note } from '../src/model';
import seeds from '../src/seeds.json';
const note = (body: string): Note => ({ ...seeds[0], body });
describe('note filtering', () => {
  it('searches across content, tags and notebooks while excluding trash', () => {
    expect(filterNotes(seeds, 'All notes', 'phosphor design').map(n => n.id)).toEqual(['project-phosphor']);
    expect(filterNotes(seeds, '#reading', '').map(n => n.id)).toEqual(['reading-list']);
    expect(filterNotes([{ ...seeds[0], trashed: true }], 'All notes', '')).toHaveLength(0);
    expect(filterNotes([{ ...seeds[0], trashed: true }], 'Trash', '')).toHaveLength(1);
  });
});
describe('save queue', () => {
  it('serializes rapid edits and saves the latest edit after an in-flight write', async () => {
    const writes: string[] = [];
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const queue = new SaveQueue(async n => { if (!writes.length) await gate; writes.push(n.body); }, () => {}, 60_000);
    queue.enqueue(note('one'));
    const flush = queue.flush();
    queue.enqueue(note('two'));
    queue.enqueue(note('three'));
    release();
    await flush;
    expect(writes).toEqual(['one', 'three']);
    await queue.flush();
  });
  it('retains unsaved edits after a failed write and retries', async () => {
    let fail = true;
    const writes: string[] = [];
    const statuses: string[] = [];
    const queue = new SaveQueue(async n => { if (fail) throw Error('disk full'); writes.push(n.body); }, state => statuses.push(state), 60_000);
    queue.enqueue(note('keep me'));
    await expect(queue.flush()).rejects.toThrow('disk full');
    expect(statuses.at(-1)).toBe('error');
    fail = false;
    await queue.flush();
    expect(writes).toEqual(['keep me']);
    expect(statuses.at(-1)).toBe('saved');
  });
});
it('invalidates cached search content when a note is edited, including in-place mutations', () => {
  const n = note('original text');
  expect(filterNotes([n], 'All notes', 'original')).toHaveLength(1);
  n.body = 'replacement text';
  expect(filterNotes([n], 'All notes', 'original')).toHaveLength(0);
  expect(filterNotes([n], 'All notes', 'replacement')).toHaveLength(1);
  expect(filterNotes([{ ...n, title: 'new title' }], 'All notes', 'new title')).toHaveLength(1);
});
