<script lang="ts">
  import { onMount, tick } from 'svelte';
  import type { Editor as TiptapEditor, ChainedCommands } from '@tiptap/core';
  import { Bold, Italic, Underline, Strikethrough, List, ListOrdered, ListTodo, Quote, Code, SquareCode, Table2, Link, Unlink, Undo2, Redo2, Minus, RemoveFormatting, Plus, Trash2, X, ArrowUpRight, Search, ChevronUp, ChevronDown, IndentIncrease, IndentDecrease } from '@lucide/svelte';
  import { createRichEditor } from './rich-editor';
  import { findKey, searchInNote } from './editor-find';
  import { TextSelection } from '@tiptap/pm/state';
  let { value, noteId, onchange, readonly = false, openUrl }: { value: string; noteId: string; onchange: (value: string) => void; readonly?: boolean; openUrl: (url: string) => void } = $props();
  let host: HTMLDivElement;
  let surface: HTMLDivElement;
  let editor = $state.raw<TiptapEditor>();
  let revision = $state(0);
  let loadedId = '';
  let lastMarkdown = '';
  let caret = $state({ left: 0, top: 0, visible: false });
  let linkOpen = $state(false);
  let linkUrl = $state('');
  let linkError = $state('');
  let tableOpen = $state(false);
  let rows = $state(3);
  let cols = $state(3);
  let frame = 0;
  let bubble = $state({ left: 0, top: 0, visible: false });
  let findOpen = $state(false);
  let findQuery = $state('');
  let findResult = $state({ total: 0, active: 0 });
  let findInput = $state<HTMLInputElement>();
  async function showFind() { findOpen = true; await tick(); findInput?.focus(); findInput?.select(); }
  function findNext(direction = 0) { if (editor) findResult = searchInNote(editor, findQuery, direction ? findResult.active + direction : 0); }
  function closeFind() { findOpen = false; findQuery = ''; if (editor) searchInNote(editor, '', 0, false); editor?.commands.focus(); }
  function editorKeys(event: KeyboardEvent) {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f') { event.preventDefault(); void showFind(); }
    if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === 'k' && editor?.isFocused && !readonly) { event.preventDefault(); editLink(); }
    if (event.key === 'Escape') {
      if (findOpen) { event.preventDefault(); closeFind(); }
      else if (linkOpen || tableOpen) { event.preventDefault(); linkOpen = tableOpen = false; editor?.commands.focus(); }
    }
  }
  const formatting = $derived.by(() => {
    revision;
    return {
      bold: editor?.isActive('bold') ?? false, italic: editor?.isActive('italic') ?? false,
      underline: editor?.isActive('underline') ?? false, strike: editor?.isActive('strike') ?? false,
      bulletList: editor?.isActive('bulletList') ?? false, orderedList: editor?.isActive('orderedList') ?? false,
      taskList: editor?.isActive('taskList') ?? false, blockquote: editor?.isActive('blockquote') ?? false,
      code: editor?.isActive('code') ?? false, codeBlock: editor?.isActive('codeBlock') ?? false,
      table: editor?.isActive('table') ?? false, link: editor?.isActive('link') ?? false,
      language: editor?.getAttributes('codeBlock').language || '',
      block: editor?.isActive('heading') ? String(editor.getAttributes('heading').level) : 'paragraph',
      undo: editor?.can().undo() ?? false, redo: editor?.can().redo() ?? false,
    };
  });
  function positionCaret() {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      const focused = editor && !editor.isDestroyed && editor.isFocused && editor.isEditable && !editor.view.composing;
      if (!focused || !editor) { caret = { ...caret, visible: false }; bubble = { ...bubble, visible: false }; return; }
      if (!editor.state.selection.empty) {
        caret = { ...caret, visible: false };
        if (!findOpen && editor.state.selection instanceof TextSelection && !editor.isActive('codeBlock')) {
          const start = editor.view.coordsAtPos(editor.state.selection.from);
          const end = editor.view.coordsAtPos(editor.state.selection.to);
          const origin = surface.getBoundingClientRect();
          bubble = { left: Math.max(0, Math.min(surface.clientWidth - 228, (start.left + end.left) / 2 - origin.left - 114)), top: Math.min(start.top, end.top) - origin.top - 42, visible: true };
        } else bubble = { ...bubble, visible: false };
        return;
      }
      bubble = { ...bubble, visible: false };
      const rect = editor.view.coordsAtPos(editor.state.selection.head);
      const origin = surface.getBoundingClientRect();
      caret = { left: rect.left - origin.left, top: rect.bottom - origin.top - 3, visible: true };
    });
  }
  function create() {
    lastMarkdown = value; loadedId = noteId;
    editor = createRichEditor({
      element: host, editable: !readonly,
      onTransaction: ({ editor: instance }) => {
        revision++;
        const result = findKey.getState(instance.state);
        if (result) findResult = { total: result.matches.length, active: result.active };
        positionCaret();
      },
      onUpdate: ({ editor: instance }) => { lastMarkdown = instance.getMarkdown(); onchange(lastMarkdown); },
      onFocus: positionCaret,
      onBlur: () => { caret = { ...caret, visible: false }; bubble = { ...bubble, visible: false }; },
    }, value);
    revision++;
  }
  onMount(() => {
    create();
    const observer = new ResizeObserver(positionCaret);
    observer.observe(surface);
    window.addEventListener('resize', positionCaret);
    return () => { editor?.destroy(); observer.disconnect(); cancelAnimationFrame(frame); window.removeEventListener('resize', positionCaret); };
  });
  $effect(() => {
    if (!editor) return;
    if (noteId !== loadedId) { editor.destroy(); linkOpen = tableOpen = false; findOpen = false; findQuery = ''; create(); }
    else if (value !== lastMarkdown) {
      lastMarkdown = value;
      editor.commands.setContent(value, { contentType: 'markdown', emitUpdate: false });
    }
    if (editor.isEditable === readonly) editor.setEditable(!readonly);
  });
  function run(command: (chain: ChainedCommands) => ChainedCommands) { if (editor && !readonly) command(editor.chain().focus()).run(); }
  function block(value: string) { if (value === 'paragraph') run(c => c.setParagraph()); else run(c => c.setHeading({ level: Number(value) as 1 | 2 | 3 | 4 | 5 | 6 })); }
  function editLink() { linkUrl = editor?.getAttributes('link').href || ''; linkError = ''; linkOpen = !linkOpen; tableOpen = false; }
  function applyLink(event: SubmitEvent) {
    event.preventDefault();
    let href = linkUrl.trim();
    if (!href) { run(c => c.extendMarkRange('link').unsetLink()); linkOpen = false; return; }
    if (!/^[a-z][a-z\d+.-]*:/i.test(href)) href = 'https://' + href;
    try { const url = new URL(href); if (!['http:', 'https:', 'mailto:'].includes(url.protocol)) throw Error(); }
    catch { linkError = 'Use an https://, http:// or mailto: address.'; return; }
    if (editor?.state.selection.empty && !formatting.link) run(c => c.insertContent({ type: 'text', text: href, marks: [{ type: 'link', attrs: { href } }] }));
    else run(c => c.extendMarkRange('link').setLink({ href }));
    linkOpen = false;
  }
  function insertTable(event: SubmitEvent) {
    event.preventDefault();
    run(c => c.insertTable({ rows: Math.max(1, Math.min(20, rows)), cols: Math.max(1, Math.min(12, cols)), withHeaderRow: true }));
    tableOpen = false;
  }
  function linkClicks(node: HTMLElement) {
    function click(event: MouseEvent) {
      const anchor = (event.target as Element).closest('a');
      if (!anchor) return;
      event.preventDefault();
      if (readonly || event.ctrlKey || event.metaKey) openUrl(anchor.getAttribute('href') || '');
    }
    node.addEventListener('click', click);
    return { destroy() { node.removeEventListener('click', click); } };
  }
</script>

<svelte:window onkeydown={editorKeys}/>
<div class="rich-editor">
  {#if !readonly}
    <div class="format-toolbar" role="toolbar" aria-label="Text formatting">
      <select aria-label="Text style" value={formatting.block} onchange={e => block(e.currentTarget.value)}><option value="paragraph">Paragraph</option>{#each [1, 2, 3, 4, 5, 6] as level}<option value={String(level)}>Heading {level}</option>{/each}</select>
      <span class="tool-divider"></span>
      {#each [
        { name: 'Bold', icon: Bold, active: formatting.bold, command: (c: ChainedCommands) => c.toggleBold(), shortcut: 'Ctrl+B' },
        { name: 'Italic', icon: Italic, active: formatting.italic, command: (c: ChainedCommands) => c.toggleItalic(), shortcut: 'Ctrl+I' },
        { name: 'Underline', icon: Underline, active: formatting.underline, command: (c: ChainedCommands) => c.toggleUnderline(), shortcut: 'Ctrl+U' },
        { name: 'Strikethrough', icon: Strikethrough, active: formatting.strike, command: (c: ChainedCommands) => c.toggleStrike(), shortcut: '' },
        { name: 'Inline code', icon: Code, active: formatting.code, command: (c: ChainedCommands) => c.toggleCode(), shortcut: '' },
      ] as tool}<button type="button" aria-label={tool.name} title={`${tool.name}${tool.shortcut ? ' (' + tool.shortcut + ')' : ''}`} aria-pressed={tool.active} onmousedown={e => e.preventDefault()} onclick={() => run(tool.command)}><tool.icon size={15}/></button>{/each}
      <span class="tool-divider"></span>
      {#each [
        { name: 'Bullet list', icon: List, active: formatting.bulletList, command: (c: ChainedCommands) => c.toggleBulletList() },
        { name: 'Numbered list', icon: ListOrdered, active: formatting.orderedList, command: (c: ChainedCommands) => c.toggleOrderedList() },
        { name: 'Task list', icon: ListTodo, active: formatting.taskList, command: (c: ChainedCommands) => c.toggleTaskList() },
        { name: 'Blockquote', icon: Quote, active: formatting.blockquote, command: (c: ChainedCommands) => c.toggleBlockquote() },
        { name: 'Code block', icon: SquareCode, active: formatting.codeBlock, command: (c: ChainedCommands) => c.toggleCodeBlock() },
      ] as tool}<button type="button" aria-label={tool.name} title={tool.name} aria-pressed={tool.active} onmousedown={e => e.preventDefault()} onclick={() => run(tool.command)}><tool.icon size={15}/></button>{/each}
      <span class="tool-divider"></span>
      <button type="button" aria-label="Insert or edit link" title="Insert or edit link" aria-pressed={linkOpen || formatting.link} onmousedown={e => e.preventDefault()} onclick={editLink}><Link size={15}/></button>
      <button type="button" aria-label="Insert table" title="Insert table" aria-pressed={tableOpen} onmousedown={e => e.preventDefault()} onclick={() => { tableOpen = !tableOpen; linkOpen = false; }}><Table2 size={15}/></button>
      <button type="button" aria-label="Horizontal rule" title="Horizontal rule" onmousedown={e => e.preventDefault()} onclick={() => run(c => c.setHorizontalRule())}><Minus size={15}/></button>
      <button type="button" aria-label="Clear formatting" title="Clear formatting" onmousedown={e => e.preventDefault()} onclick={() => run(c => c.unsetAllMarks().clearNodes())}><RemoveFormatting size={15}/></button>
      <span class="tool-divider"></span>
      <button type="button" aria-label="Undo" title="Undo (Ctrl+Z)" disabled={!formatting.undo} onmousedown={e => e.preventDefault()} onclick={() => run(c => c.undo())}><Undo2 size={15}/></button>
      <button type="button" aria-label="Redo" title="Redo (Ctrl+Shift+Z)" disabled={!formatting.redo} onmousedown={e => e.preventDefault()} onclick={() => run(c => c.redo())}><Redo2 size={15}/></button>
      <button type="button" aria-label="Indent list" title="Indent list (Ctrl+])" disabled={!(formatting.bulletList || formatting.orderedList || formatting.taskList)} onmousedown={e => e.preventDefault()} onclick={() => run(c => c.sinkListItem(formatting.taskList ? 'taskItem' : 'listItem'))}><IndentIncrease size={15}/></button>
      <button type="button" aria-label="Outdent list" title="Outdent list (Ctrl+[)" disabled={!(formatting.bulletList || formatting.orderedList || formatting.taskList)} onmousedown={e => e.preventDefault()} onclick={() => run(c => c.liftListItem(formatting.taskList ? 'taskItem' : 'listItem'))}><IndentDecrease size={15}/></button>
      <button type="button" aria-label="Find in note" title="Find in note (Ctrl+F)" onclick={showFind}><Search size={15}/></button>
    </div>
    {#if linkOpen}<form class="format-panel link-panel" onsubmit={applyLink}><label>Link address<input aria-label="Link address" type="text" placeholder="https://example.com" bind:value={linkUrl}/></label><button type="submit">Apply</button>{#if formatting.link}<button type="button" aria-label="Remove link" onclick={() => { run(c => c.extendMarkRange('link').unsetLink()); linkOpen = false; }}><Unlink size={14}/></button><button type="button" aria-label="Open link" onclick={() => openUrl(linkUrl)}><ArrowUpRight size={14}/></button>{/if}<button type="button" aria-label="Close link editor" onclick={() => linkOpen = false}><X size={14}/></button>{#if linkError}<span class="format-error" role="alert">{linkError}</span>{/if}</form>{/if}
    {#if tableOpen}<form class="format-panel" onsubmit={insertTable}><label>Rows<input aria-label="Table rows" type="number" min="1" max="20" bind:value={rows} required/></label><label>Columns<input aria-label="Table columns" type="number" min="1" max="12" bind:value={cols} required/></label><button type="submit">Insert table</button><button type="button" aria-label="Close table editor" onclick={() => tableOpen = false}><X size={14}/></button></form>{/if}
    {#if formatting.table}<div class="table-tools" role="toolbar" aria-label="Table formatting"><span>TABLE</span><button type="button" onmousedown={e => e.preventDefault()} onclick={() => run(c => c.addRowBefore())}>Row above</button><button type="button" onmousedown={e => e.preventDefault()} onclick={() => run(c => c.addRowAfter())}><Plus size={11}/> Row below</button><button type="button" onmousedown={e => e.preventDefault()} onclick={() => run(c => c.addColumnBefore())}>Column before</button><button type="button" onmousedown={e => e.preventDefault()} onclick={() => run(c => c.addColumnAfter())}><Plus size={11}/> Column after</button><button type="button" onmousedown={e => e.preventDefault()} onclick={() => run(c => c.deleteRow())}>Delete row</button><button type="button" onmousedown={e => e.preventDefault()} onclick={() => run(c => c.deleteColumn())}>Delete column</button><button type="button" onmousedown={e => e.preventDefault()} onclick={() => run(c => c.deleteTable())}><Trash2 size={11}/> Delete table</button></div>{/if}
    {#if formatting.codeBlock}<div class="code-tools"><label>Code language<select aria-label="Code language" value={formatting.language} onchange={e => run(c => c.updateAttributes('codeBlock', { language: e.currentTarget.value || null }))}>{#each ['', 'rust', 'javascript', 'bash', 'json', ...(formatting.language && !['rust', 'javascript', 'bash', 'json'].includes(formatting.language) ? [formatting.language] : [])] as language}<option value={language}>{language || 'Plain text'}</option>{/each}</select></label><button type="button" onmousedown={e => e.preventDefault()} onclick={() => run(c => c.exitCode())}>Exit code block ↵</button></div>{/if}
  {/if}
  {#if findOpen}<div class="note-find" role="search" aria-label="Find in current note"><Search size={14}/><input bind:this={findInput} aria-label="Find in current note" placeholder="Find in this note…" bind:value={findQuery} oninput={() => findNext()} onkeydown={e => { if (e.key === 'Enter') { e.preventDefault(); findNext(e.shiftKey ? -1 : 1); } }}/><output aria-live="polite">{findResult.total ? findResult.active + 1 : 0} / {findResult.total}{findResult.total === 1000 ? '+' : ''}</output><button type="button" aria-label="Previous match" title="Previous match (Shift+Enter)" disabled={!findResult.total} onclick={() => findNext(-1)}><ChevronUp size={14}/></button><button type="button" aria-label="Next match" title="Next match (Enter)" disabled={!findResult.total} onclick={() => findNext(1)}><ChevronDown size={14}/></button><button type="button" aria-label="Close find" title="Close find (Escape)" onclick={closeFind}><X size={14}/></button></div>{/if}
  <div class="rich-surface" bind:this={surface} use:linkClicks>
    <div bind:this={host}></div>
    {#if bubble.visible && !readonly}<div class="selection-tools" role="toolbar" aria-label="Selection formatting" style={`left:${bubble.left}px;top:${bubble.top}px`}>
      {#each [
        { name: 'Bold selection', icon: Bold, active: formatting.bold, command: (c: ChainedCommands) => c.toggleBold() },
        { name: 'Italic selection', icon: Italic, active: formatting.italic, command: (c: ChainedCommands) => c.toggleItalic() },
        { name: 'Underline selection', icon: Underline, active: formatting.underline, command: (c: ChainedCommands) => c.toggleUnderline() },
        { name: 'Code selection', icon: Code, active: formatting.code, command: (c: ChainedCommands) => c.toggleCode() },
      ] as tool}<button type="button" aria-label={tool.name} title={tool.name} aria-pressed={tool.active} onmousedown={e => e.preventDefault()} onclick={() => run(tool.command)}><tool.icon size={15}/></button>{/each}
      <button type="button" aria-label="Link selection" title="Link selection (Ctrl+Shift+K)" onmousedown={e => e.preventDefault()} onclick={editLink}><Link size={15}/></button>
    </div>{/if}
    {#if caret.visible}{#key revision}<span class="rich-caret" style={`left:${caret.left}px;top:${caret.top}px`} aria-hidden="true"></span>{/key}{/if}
  </div>
</div>
