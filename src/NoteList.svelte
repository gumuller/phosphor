<script lang="ts">
  import { onMount, tick } from 'svelte';
  import Highlight from './Highlight.svelte';
  import { Star } from '@lucide/svelte';
  import { noteWindow, type Note } from './model';
  let { notes, selected, onchoose, query = '', snippets = {} }: { notes: Note[]; selected: string; onchoose: (id: string) => void; query?: string; snippets?: Record<string, string> } = $props();
  let viewport: HTMLDivElement;
  let top = $state(0);
  let height = $state(700);
  const rowHeight = 184;
  const range = $derived(noteWindow(notes.length, top, height, rowHeight));
  const displayed = $derived(notes.slice(range.start, range.end));
  const selectedVisible = $derived(displayed.some(n => n.id === selected));
  const first = $derived(notes[0]?.id);
  $effect(() => { first; if (viewport) { viewport.scrollTop = 0; top = 0; } });
  onMount(() => {
    const observer = new ResizeObserver(() => { height = viewport.clientHeight || 700; });
    observer.observe(viewport);
    height = viewport.clientHeight || 700;
    return () => observer.disconnect();
  });
  async function keyboard(event: KeyboardEvent) {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End', 'PageDown', 'PageUp'].includes(event.key) || event.altKey || event.ctrlKey || event.metaKey) return;
    event.preventDefault();
    const focusedId = (event.target as Element).closest<HTMLButtonElement>('[data-note-id]')?.dataset.noteId || selected;
    const current = Math.max(0, notes.findIndex(n => n.id === focusedId));
    const page = Math.max(1, Math.floor(height / rowHeight));
    const index = Math.max(0, Math.min(notes.length - 1, event.key === 'Home' ? 0 : event.key === 'End' ? notes.length - 1 : current + (event.key === 'ArrowUp' ? -1 : event.key === 'ArrowDown' ? 1 : event.key === 'PageUp' ? -page : page)));
    const note = notes[index];
    if (!note) return;
    onchoose(note.id);
    if (index * rowHeight < viewport.scrollTop) viewport.scrollTop = index * rowHeight;
    else if ((index+1)*rowHeight > viewport.scrollTop+height) viewport.scrollTop = (index+1)*rowHeight-height;
    top = viewport.scrollTop;
    await tick();
    Array.from(viewport.querySelectorAll<HTMLButtonElement>('[data-note-id]')).find(button => button.dataset.noteId === note.id)?.focus({ preventScroll: true });
  }
  function excerpt(body: string) { return body.slice(0, 900).replace(/[#>*`\[\]_-]/g, '').replace(/\s+/g, ' ').trim().slice(0, 110) || 'A little room for a new thought…'; }
  function date(time: number) { return new Date(time).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); }
</script>
<div class="note-cards virtual-notes" role="list" aria-label="Note list" bind:this={viewport} onscroll={() => top = viewport.scrollTop}>
  <div aria-hidden="true" style={`height:${range.before}px`}></div>
  {#each displayed as note, index (note.id)}
    <div role="listitem" aria-setsize={notes.length} aria-posinset={range.start + index + 1}>
      <button class="note-card" class:selected={selected === note.id} data-note-id={note.id} onclick={() => onchoose(note.id)} aria-pressed={selected === note.id} onkeydown={keyboard} tabindex={selected === note.id || (!selectedVisible && index === 0) ? 0 : -1}>
        <div class="card-top"><span>{note.notebook}</span>{#if note.starred}<Star size={12} fill="currentColor"/>{/if}</div>
        <h2><Highlight text={note.title || 'Untitled note'} {query}/></h2><p><Highlight text={snippets[note.id] || excerpt(note.body)} {query}/></p><div class="card-meta"><span>{date(note.updatedAt)}</span><span>{note.tags.split(',').filter(t => t.trim()).map(t => '#' + t.trim()).slice(0, 2).join(' ')}</span></div>
      </button>
    </div>
  {/each}
  <div aria-hidden="true" style={`height:${range.after}px`}></div>
</div>
