import { it, expect, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/svelte';
import type { Editor } from '@tiptap/core';
import RichEditor from '../src/RichEditor.svelte';
import { createRichEditor } from '../src/rich-editor';
import seeds from '../src/seeds.json';
afterEach(cleanup);
function make(markdown: string) { return createRichEditor({ element: document.createElement('div') }, markdown); }
it('roundtrips headings, marks, tasks, tables and fenced code through Markdown', () => {
  const input = '# Heading\n\n**Bold** *italic* ++underline++ ~~strike~~ `code` [link](https://example.com)\n\n- [x] Done\n- [ ] Next\n\n| A | B |\n| --- | --- |\n| One | Two |\n\n```rust\nfn main() {}\n```';
  const editor = make(input);
  const serialized = editor.getMarkdown();
  const reopened = make(serialized);
  expect(reopened.getJSON()).toEqual(editor.getJSON());
  expect(editor.getHTML()).toContain('<table');
  expect(editor.getHTML()).toContain('<u>underline</u>');
  expect(serialized).toContain('```rust');
  expect(serialized).toContain('[x] Done');
  editor.destroy(); reopened.destroy();
});
it('preserves all starter notes when serialized and reopened', () => {
  for (const note of seeds) {
    const editor = make(note.body);
    const reopened = make(editor.getMarkdown());
    expect(reopened.getJSON()).toEqual(editor.getJSON());
    editor.destroy(); reopened.destroy();
  }
});
it('formats selected text, inserts tables, and uses table controls', async () => {
  let saved = '';
  const result = render(RichEditor, { value: 'Select these words', noteId: 'rich-test', onchange: text => { saved = text; }, openUrl: () => {} });
  const node = result.container.querySelector('.tiptap') as HTMLElement & { editor: Editor };
  const editor = node.editor;
  editor.commands.setTextSelection({ from: 1, to: 7 });
  await fireEvent.click(screen.getByRole('button', { name: 'Bold' }));
  expect(node.querySelector('strong')?.textContent).toBe('Select');
  expect(saved).toContain('**Select**');
  await fireEvent.click(screen.getByRole('button', { name: 'Insert table' }));
  await fireEvent.input(screen.getByRole('spinbutton', { name: 'Table rows' }), { target: { value: '2' } });
  await fireEvent.submit(result.container.querySelector('.format-panel')!);
  expect(node.querySelectorAll('tr')).toHaveLength(2);
  await fireEvent.click(await screen.findByRole('button', { name: 'Row below' }));
  expect(node.querySelectorAll('tr')).toHaveLength(3);
  await fireEvent.click(screen.getByRole('button', { name: 'Delete table' }));
  expect(node.querySelector('table')).toBeNull();
  expect(await screen.findByRole('button', { name: 'Undo' })).toHaveProperty('disabled', false);
});
it('does not rewrite a note just by opening formatted mode; switching notes clears undo', async () => {
  const saves: string[] = [];
  const result = render(RichEditor, { value: '# Heading\n\n__bold__\n', noteId: 'one', onchange: text => saves.push(text), openUrl: () => {} });
  expect(saves).toEqual([]);
  const editor = (result.container.querySelector('.tiptap') as HTMLElement & { editor: Editor }).editor;
  editor.commands.insertContent('edited');
  await result.rerender({ value: 'Second note', noteId: 'two', onchange: text => saves.push(text), openUrl: () => {} });
  await waitFor(() => expect(result.container.querySelector('.rich-document')?.textContent).toBe('Second note'));
  expect(screen.getByRole('button', { name: 'Undo' })).toHaveProperty('disabled', true);
});
it('rejects executable link URLs in formatted documents', () => {
  const editor = make('[unsafe](javascript:alert(1))\n\n[safe](https://example.com)');
  expect(editor.getHTML()).not.toContain('href="javascript:');
  expect(editor.getHTML()).toContain('href="https://example.com"');
  editor.destroy();
});
