<script lang="ts">
  import { onMount } from 'svelte';
  import { Monitor, Search, Plus, FileText, Star, BookOpen, Inbox, Hash, Trash2, ChevronDown, ArrowUpRight, Eye, Code2, PanelLeftClose, PanelLeft, SlidersHorizontal, Check, RotateCcw, X, Download, Circle } from '@lucide/svelte';
  import RichEditor from './RichEditor.svelte';
  import NoteList from './NoteList.svelte';
  import CrtRaster from './CrtRaster.svelte';
  import { filterNotes, notebooks, SaveQueue, type Note } from './model';
  import { loadNotes, saveNote, native, saveBrowserSnapshot } from './storage';
  let notes: Note[] = $state([]);
  let selected = $state('welcome');
  let section = $state('All notes');
  let query = $state('');
  let mode = $state<'formatted' | 'raw'>('formatted');
  let saveState = $state('saved');
  let error = $state('');
  let ready = $state(false);
  let settings = $state(false);
  let effects = $state(true);
  let bloom = $state(75);
  let focus = $state(false);
  let mobileEditor = $state(false);
  let searchInput: HTMLInputElement;
  const queue = new SaveQueue(saveNote, (state, problem) => { saveState = state; if (problem) error = `Could not save: ${String(problem)}. Your edit is still here. Retry before closing.`; else if (state === 'saved') error = ''; });
  const visible = $derived(filterNotes(notes, section, query));
  const current = $derived(notes.find(n => n.id === selected));
  const tags = $derived([...new Set(notes.filter(n => !n.trashed).flatMap(n => n.tags.split(',').map(t => t.trim()).filter(Boolean)))].sort());
  const allNotebooks = $derived([...new Set([...notebooks, ...notes.map(n => n.notebook)])]);
  const words = $derived(current?.body.trim().split(/\s+/).filter(Boolean).length ?? 0);
  const activeCount = $derived(notes.filter(n => !n.trashed).length);
  function update(patch: Partial<Note>) {
    if (!current || !ready) return;
    const next = { ...current, ...patch, updatedAt: Date.now() };
    notes = notes.map(n => n.id === next.id ? next : n);
    queue.enqueue(next);
  }
  function choose(id: string) { selected = id; mobileEditor = true; }
  function navigate(name: string) { section = name; mobileEditor = false; const next = filterNotes(notes, name, query); if (!next.some(n => n.id === selected)) selected = next[0]?.id ?? ''; }
  function createNote() {
    if (!ready) return;
    const now = Date.now();
    const note: Note = { id: crypto.randomUUID(), title: '', body: '', notebook: allNotebooks.includes(section) ? section : 'Inbox', tags: '', starred: false, trashed: false, createdAt: now, updatedAt: now };
    notes = [note, ...notes]; section = 'All notes'; query = ''; selected = note.id; mode = 'formatted'; mobileEditor = true; queue.enqueue(note);
    setTimeout(() => document.querySelector<HTMLInputElement>('.note-title')?.focus(), 0);
  }
  function trash() { if (!current) return; const id = current.id; update({ trashed: !current.trashed }); selected = filterNotes(notes, section, query).find(n => n.id !== id)?.id ?? ''; mobileEditor = false; }
  async function exportNote() {
    if (!current) return;
    const content = `# ${current.title || 'Untitled note'}\n\n${current.body}`;
    const filename = `${(current.title || 'Untitled note').replace(/[^\p{L}\p{N} _-]/gu, '').slice(0, 80)}.md`;
    if (native) {
      try {
        const { save } = await import('@tauri-apps/plugin-dialog');
        const path = await save({ defaultPath: filename, filters: [{ name: 'Markdown', extensions: ['md'] }] });
        if (path) { const { writeTextFile } = await import('@tauri-apps/plugin-fs'); await writeTextFile(path, content); }
      } catch (e) { error = `Could not export: ${String(e)}`; }
      return;
    }
    const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `${(current.title || 'Untitled note').replace(/[^\p{L}\p{N} _-]/gu, '').slice(0, 80)}.md`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function openUrl(href: string) {
    if (!/^(https?:\/\/|mailto:)/i.test(href)) return;
    try {
      if (native) { const { openUrl } = await import('@tauri-apps/plugin-opener'); await openUrl(href); }
      else window.open(href, '_blank', 'noopener,noreferrer');
    } catch (e) { error = `Could not open link: ${String(e)}`; }
  }
  function date(time: number) { return new Date(time).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); }
  function excerpt(body: string) { return body.replace(/[#>*`\[\]_-]/g, '').replace(/\s+/g, ' ').trim().slice(0, 110) || 'A little room for a new thought…'; }
  function keyboard(event: KeyboardEvent) {
    if (!(event.ctrlKey || event.metaKey)) return;
    if (event.key === '/') { event.preventDefault(); settings = !settings; }
    if (event.key.toLowerCase() === 'n') { event.preventDefault(); createNote(); }
    if (event.key.toLowerCase() === 'k') { event.preventDefault(); focus = false; mobileEditor = false; setTimeout(() => searchInput?.focus(), 0); }
    if (event.key.toLowerCase() === 's') { event.preventDefault(); void queue.flush().catch(() => {}); }
    if (event.shiftKey && event.key.toLowerCase() === 'p') { event.preventDefault(); mode = mode === 'raw' ? 'formatted' : 'raw'; }
  }
  onMount(() => {
    let unlisten: (() => void) | undefined;
    let disposed = false;
    void loadNotes().then(loaded => { if (disposed) return; notes = loaded; selected = loaded.find(n => !n.trashed)?.id ?? ''; ready = true; }).catch(e => { error = `Could not load notes: ${String(e)}`; });
    try {
      effects = localStorage.getItem('phosphor.crt') !== 'off';
      const storedBloom = localStorage.getItem('phosphor.bloom');
      if (storedBloom !== null && Number.isFinite(Number(storedBloom))) bloom = Math.max(0, Math.min(100, Number(storedBloom)));
    } catch { /* Settings are optional. */ }
    if (native) void import('@tauri-apps/api/window').then(async ({ getCurrentWindow }) => {
      const win = getCurrentWindow();
      const stop = await win.onCloseRequested(async event => { event.preventDefault(); try { await queue.flush(); await win.destroy(); } catch { /* Keep unsaved work open. */ } });
      if (disposed) stop(); else unlisten = stop;
    }).catch(e => { error = `Could not enable safe closing: ${String(e)}`; });
    return () => { disposed = true; unlisten?.(); };
  });
  function leaving() { if (ready && !native) { try { saveBrowserSnapshot(notes); } catch { /* The save banner already reports failures. */ } } }
  function changeBloom(value: number) {
    bloom = value;
    try { localStorage.setItem('phosphor.bloom', String(value)); } catch { /* Keep current choice. */ }
  }
  function toggleEffects() { effects = !effects; try { localStorage.setItem('phosphor.crt', effects ? 'on' : 'off'); } catch { /* Keep current choice. */ } }
</script>

<svelte:window onkeydown={keyboard} onbeforeunload={leaving} onblur={() => { if (ready) void queue.flush().catch(() => {}); }} />
<div class:crt={effects} class:focused={focus} class:mobile-editor={mobileEditor} class="app-shell" style={`--bloom: ${bloom / 100}`}>
  <header class="topbar">
    <div class="brand"><span class="brand-icon"><Monitor size={22} strokeWidth={1.5}/></span><span>phosphor<span class="brand-dot">_</span></span><span class="version">LOCAL / 001</span></div>
    <div class="top-message"><span class="status-dot"></span> A LITTLE SPACE TO THINK.</div>
    <button class="icon-button" class:active={settings} title="Display settings" aria-label="Display settings" onclick={() => settings = !settings}><SlidersHorizontal size={17}/></button>
  </header>
  {#if error}<div class="error-banner" role="alert">{error} {#if ready}<button onclick={() => void queue.flush().catch(() => {})}>Retry save</button>{:else}<button onclick={() => location.reload()}>Retry load</button>{/if}</div>{/if}
  <main>
    <aside class="sidebar">
      <button class="new-note" onclick={createNote} disabled={!ready}><Plus size={18}/><span>New note</span><kbd>⌃ N</kbd></button>
      <div class="nav-label">YOUR WORKSPACE</div>
      <nav aria-label="Workspace">
        {#each [{ name: 'All notes', icon: FileText, count: activeCount }, { name: 'Favorites', icon: Star, count: notes.filter(n => n.starred && !n.trashed).length }] as item}
          <button class:chosen={section === item.name} onclick={() => navigate(item.name)}><item.icon size={16}/><span>{item.name}</span><span class="count">{String(item.count).padStart(2, '0')}</span></button>
        {/each}
      </nav>
      <div class="nav-label spaced">NOTEBOOKS <BookOpen size={12}/></div>
      <nav aria-label="Notebooks">{#each allNotebooks as name}<button class:chosen={section === name} onclick={() => navigate(name)}>{#if name === 'Inbox'}<Inbox size={16}/>{:else}<BookOpen size={16}/>{/if}<span>{name}</span><span class="count">{notes.filter(n => n.notebook === name && !n.trashed).length}</span></button>{/each}</nav>
      <div class="nav-label spaced">TAGS <Hash size={12}/></div>
      <div class="tags">{#each tags as tag}<button class:chosen={section === '#' + tag} onclick={() => navigate('#' + tag)}><span>#</span>{tag}</button>{/each}</div>
      <div class="sidebar-bottom"><button class="trash-nav" class:chosen={section === 'Trash'} onclick={() => navigate('Trash')}><Trash2 size={16}/><span>Trash</span><span class="count">{notes.filter(n => n.trashed).length || ''}</span></button><div class="local-label"><span class="status-dot"></span><span>{native ? 'Stored on this device' : 'Browser preview · local storage'}</span></div><div class="sidebar-foot">YOUR THOUGHTS. YOUR SPACE.</div></div>
    </aside>
    <section class="note-list" aria-label="Notes">
      <div class="list-heading"><h1>{section}</h1><div class="mobile-list-tools"><select aria-label="View notes" value={section} onchange={e => navigate(e.currentTarget.value)}>{#each ['All notes', 'Favorites', ...allNotebooks, 'Trash'] as name}<option>{name}</option>{/each}</select><button class="icon-button" aria-label="Create note" onclick={createNote} disabled={!ready}><Plus size={18}/></button></div><span>{String(visible.length).padStart(2, '0')}</span></div>
      <div class="search-box"><Search size={15}/><input bind:this={searchInput} bind:value={query} placeholder="Find a thought…" aria-label="Search notes"/><kbd>⌃ K</kbd>{#if query}<button class="icon-button" onclick={() => query = ''} aria-label="Clear search"><X size={12}/></button>{/if}</div>
      <div class="sort-label"><span>{query ? 'SEARCH RESULTS' : 'LAST UPDATED'}</span><ChevronDown size={12}/></div>
      {#if visible.length}<NoteList notes={visible} {selected} onchoose={choose}/>{:else}<div class="note-cards">        {#if !visible.length}<div class="list-empty"><Search size={24}/><p>{ready ? 'Nothing here. Yet.' : 'Opening your notebook…'}</p><span>{query ? 'Try a different word.' : 'A new thought starts with a new note.'}</span>{#if !query && ready}<button class="quiet-button" onclick={createNote}>+ Create a note</button>{/if}</div>{/if}</div>{/if}
      <div class="list-footer"><span>{activeCount} notes, a world of possibilities.</span><Circle size={8}/></div>
    </section>
    <section class="workspace" aria-label="Note editor">
      <div class="editor-toolbar"><div class="breadcrumb"><button class="icon-button focus-toggle" title={focus ? 'Show sidebar' : 'Focus mode'} aria-label={focus ? 'Show sidebar' : 'Focus mode'} onclick={() => { focus = window.innerWidth > 700 ? !focus : false; mobileEditor = false; }}>{#if focus}<PanelLeft size={16}/>{:else}<PanelLeftClose size={16}/>{/if}</button><span class="breadcrumb-notebook">{current?.notebook || 'Notebook'}</span><span class="slash">/</span><span class="breadcrumb-note">{current?.title || 'Untitled note'}</span></div><div class="view-switch" aria-label="Editor mode"><button class:active={mode === 'formatted'} aria-pressed={mode === 'formatted'} onclick={() => mode = 'formatted'} title="Formatted editing"><Eye size={14}/><span>Formatted</span></button><button class:active={mode === 'raw'} aria-pressed={mode === 'raw'} onclick={() => mode = 'raw'} title="Raw Markdown (Ctrl+Shift+P)"><Code2 size={14}/><span>Markdown</span></button></div></div>
      {#if current}
        <div class="note-sheet">
          <div class="note-eyebrow"><span><FileText size={12}/> MARKDOWN NOTE</span><div class="note-actions"><button class="icon-button" class:starred={current.starred} onclick={() => update({ starred: !current.starred })} aria-label={current.starred ? 'Remove from favorites' : 'Add to favorites'} title="Favorite"><Star size={16} fill={current.starred ? 'currentColor' : 'none'}/></button><button class="icon-button" onclick={exportNote} aria-label="Export Markdown" title="Export Markdown"><Download size={16}/></button><button class="icon-button" onclick={trash} aria-label={current.trashed ? 'Restore note' : 'Move to trash'} title={current.trashed ? 'Restore note' : 'Move to trash'}>{#if current.trashed}<RotateCcw size={16}/>{:else}<Trash2 size={16}/>{/if}</button></div></div>
          <input class="note-title" aria-label="Note title" placeholder="Untitled note" value={current.title} oninput={e => update({ title: e.currentTarget.value })} readonly={current.trashed}/>
          <div class="note-properties"><label><BookOpen size={12}/><select aria-label="Notebook" value={current.notebook} onchange={e => update({ notebook: e.currentTarget.value })} disabled={current.trashed}>{#each allNotebooks as name}<option>{name}</option>{/each}</select></label><span class="property-divider"></span><label class="tag-input"><Hash size={12}/><input aria-label="Tags, separated by commas" placeholder="Add tags, separated by commas" value={current.tags} oninput={e => update({ tags: e.currentTarget.value })} readonly={current.trashed}/></label></div>
          <div class="sheet-rule"></div>
          {#if current.trashed}<div class="trash-banner">This note is in Trash. <button onclick={trash}>Restore note <RotateCcw size={12}/></button></div>{/if}
          {#if mode === 'formatted'}<RichEditor value={current.body} noteId={current.id} onchange={body => update({ body })} readonly={current.trashed} {openUrl}/>{:else}{#await import('./Editor.svelte')}<p class="preview-loading">Opening Markdown…</p>{:then raw}<raw.default value={current.body} noteId={current.id} onchange={body => update({ body })} readonly={current.trashed}/>{/await}{/if}
          <div class="end-mark">· · ·</div>
        </div>
      {:else}<div class="editor-empty"><Monitor size={46} strokeWidth={1}/><h2>A little room to think.</h2><p>{section === 'Trash' ? 'Your deleted notes will wait here.' : 'Choose a note, or begin a new one.'}</p>{#if section !== 'Trash'}<button class="quiet-button" onclick={createNote} disabled={!ready}>Create a note <ArrowUpRight size={14}/></button>{/if}</div>{/if}
      <footer class="editor-footer"><span class:error={saveState === 'error'}>{#if saveState === 'saved'}<Check size={13}/>{:else}<span class="status-dot"></span>{/if}{saveState === 'saved' ? 'All changes saved' : saveState === 'saving' ? 'Saving…' : 'Unsaved changes'}</span><div><span>{words} words</span><span>UTF-8</span><span>MARKDOWN</span><span class="footer-cursor">▁</span></div></footer>
    </section>
  </main>
  {#if effects}<CrtRaster/>{/if}
  {#if settings}<div class="settings-popover"><div class="settings-title">DISPLAY <button class="icon-button" aria-label="Close display settings" onclick={() => settings = false}><X size={14}/></button></div><button class="setting-row" onclick={toggleEffects} aria-pressed={effects}><span>CRT atmosphere<small>Phosphor bloom, scanlines & glass glow</small></span><span class="toggle" class:on={effects}></span></button><label class="bloom-control" class:disabled={!effects}><span>Phosphor bloom <output for="bloom">{bloom}%</output></span><input id="bloom" aria-label="Phosphor bloom" aria-valuetext={`${bloom}%`} type="range" min="0" max="100" step="5" value={bloom} oninput={e => changeBloom(Number(e.currentTarget.value))} disabled={!effects}/><span class="bloom-scale"><span>Sharp</span><span>Radiant</span></span></label><p>Steady phosphor. No flicker or screen shake.</p><div class="shortcut-list"><span>New note <kbd>Ctrl N</kbd></span><span>Search <kbd>Ctrl K</kbd></span><span>Formatted / Raw <kbd>Ctrl Shift P</kbd></span><span>Save now <kbd>Ctrl S</kbd></span><span>Find in note <kbd>Ctrl F</kbd></span><span>Link selection <kbd>Ctrl Shift K</kbd></span><span>Paste plain text <kbd>Ctrl Shift V</kbd></span><span>Next / previous cell <kbd>Tab / Shift Tab</kbd></span><span>List indent / outdent <kbd>Ctrl ] / [</kbd></span><span>Shortcut help <kbd>Ctrl /</kbd></span></div></div>{/if}
</div>
