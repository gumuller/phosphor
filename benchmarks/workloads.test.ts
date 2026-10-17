import { it, expect } from 'vitest';
import { performance } from 'node:perf_hooks';
import { writeFileSync } from 'node:fs';
import { filterNotes, type Note } from '../src/model';
import { createRichEditor } from '../src/rich-editor';
import { render, cleanup } from '@testing-library/svelte';
import NoteList from '../src/NoteList.svelte';
function summary(values: number[]) {
  const sorted = [...values].sort((a,b) => a-b);
  return { samples: values.length, p50_ms: +sorted[Math.floor(sorted.length*.5)].toFixed(2), p95_ms: +sorted[Math.floor(sorted.length*.95)].toFixed(2) };
}
it('measures search and long-note editing without touching real notes', () => {
  const notes: Note[] = Array.from({ length: 10_000 }, (_, i) => ({ id: String(i), title: `Research ${i}`, body: (`Phosphor research collection${i % 100} writing ideas, local notes and fast retrieval.\n`).repeat(24), tags: 'research,writing', notebook: 'Inbox', starred: false, trashed: false, createdAt: i, updatedAt: i }));
  let start = performance.now(); filterNotes(notes, 'All notes', 'collection42');
  const coldSearch = performance.now() - start;
  const searchTimes: number[] = [];
  const uncachedTimes: number[] = [];
  function uncachedSearch(query:string) {
    const terms=query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
    return notes.filter(n=>!n.trashed).filter(n=>terms.every(t=>`${n.title}\n${n.body}\n${n.tags}\n${n.notebook}`.toLocaleLowerCase().includes(t))).sort((a,b)=>b.updatedAt-a.updatedAt);
  }
  for (let i=0;i<30;i++) { start = performance.now(); const found = filterNotes(notes, 'All notes', `collection${i % 100}`); searchTimes.push(performance.now()-start); expect(found.length).toBeGreaterThan(0); }
  for (let i=0;i<30;i++) { start=performance.now(); uncachedSearch(`collection${i%100}`); uncachedTimes.push(performance.now()-start); }
  start=performance.now();
  const list=render(NoteList,{ notes, selected:'0', onchoose:()=>{} });
  const listMount=performance.now()-start;
  const renderedCards=list.container.querySelectorAll('.note-card').length;
  expect(renderedCards).toBeLessThan(20);
  cleanup();
  const markdown = Array.from({length: 200}, (_, i) => `## Section ${i}\n\n${'A detailed research note with **formatted text** and practical observations. '.repeat(6)}`).join('\n\n');
  let serialized = '';
  start = performance.now();
  const editor = createRichEditor({ element: document.createElement('div'), onUpdate: ({ editor }) => { serialized = editor.getMarkdown(); } }, markdown);
  const loadTime = performance.now() - start;
  const typingTimes: number[] = [];
  for (let i=0;i<30;i++) { start=performance.now(); editor.commands.insertContentAt(editor.state.doc.content.size-1, 'x'); typingTimes.push(performance.now()-start); }
  expect(serialized).toContain('Section 199');
  editor.destroy();
  const result = { environment: 'Linux, Node.js + jsdom; no native layout, paint or GPU timings', notes: notes.length, corpus_characters: notes.reduce((sum,n) => sum+n.body.length,0), search_cold_ms:+coldSearch.toFixed(2), search:summary(searchTimes), uncached_search_reference:summary(uncachedTimes), rendered_note_cards:renderedCards, note_list_jsdom_mount_ms:+listMount.toFixed(2), long_note_characters:markdown.length, long_note_load_ms:+loadTime.toFixed(2), editor_insert_and_markdown_serialization:summary(typingTimes) };
  console.log(JSON.stringify(result, null, 2));
  writeFileSync(`benchmarks/results/${process.env.BENCH_LABEL || 'latest'}.json`, JSON.stringify(result,null,2)+'\n');
});
