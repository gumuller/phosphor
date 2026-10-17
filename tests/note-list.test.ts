import { it, expect, afterEach } from 'vitest';
import { render, fireEvent, cleanup, waitFor } from '@testing-library/svelte';
import NoteList from '../src/NoteList.svelte';
import { noteWindow } from '../src/model';
import seeds from '../src/seeds.json';
afterEach(cleanup);
it('bounds rendered cards and reaches the end of a 10,000-note library by keyboard', async () => {
  const notes = Array.from({length:10_000}, (_,i) => ({...seeds[0], id:String(i), title:`Note ${i}`}));
  let selected = '';
  const result = render(NoteList, { notes, selected:'0', onchoose:id => { selected=id; } });
  expect(result.container.querySelectorAll('.note-card').length).toBeLessThan(20);
  const first=result.container.querySelector('.note-card')!;
  await fireEvent.keyDown(first, {key:'End'});
  expect(selected).toBe('9999');
  await waitFor(() => expect(result.container.querySelector('[data-note-id="9999"]')).toBeTruthy());
  expect(result.container.querySelectorAll('.note-card').length).toBeLessThan(20);
  const last=result.container.querySelector('[data-note-id="9999"]')!;
  await fireEvent.keyDown(last,{key:'ArrowUp'});
  expect(selected).toBe('9998');
});
it('keeps window spacer arithmetic correct at bounds', () => {
  const a=noteWindow(10000,184*500,700);
  expect(a.before+(a.end-a.start)*184+a.after).toBe(184*10000);
  const empty=noteWindow(0,99999,700);
  expect(empty).toEqual({start:0,end:0,before:0,after:0});
});
