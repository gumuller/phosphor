<script lang="ts">
  import { onMount } from 'svelte';
  import { EditorState, Compartment } from '@codemirror/state';
  import { EditorView, keymap, drawSelection, lineNumbers, highlightActiveLine, rectangularSelection } from '@codemirror/view';
  import { search, searchKeymap } from '@codemirror/search';
  import { history, historyKeymap, defaultKeymap, indentWithTab } from '@codemirror/commands';
  import { markdown } from '@codemirror/lang-markdown';
  import { syntaxHighlighting, defaultHighlightStyle } from '@codemirror/language';
  let { value, noteId, onchange, readonly = false }: { value: string; noteId: string; onchange: (value: string) => void; readonly?: boolean } = $props();
  let host: HTMLDivElement;
  let view: EditorView | undefined;
  let loadedId = '';
  const readOnly = new Compartment();
  function state(doc: string) {
    return EditorState.create({ doc, extensions: [history(), search({ top: true }), markdown(), drawSelection({ cursorBlinkRate: 950 }), rectangularSelection(), lineNumbers(), highlightActiveLine(), syntaxHighlighting(defaultHighlightStyle), EditorView.lineWrapping, keymap.of([...searchKeymap, ...defaultKeymap, ...historyKeymap, indentWithTab]), readOnly.of(EditorState.readOnly.of(readonly)), EditorView.contentAttributes.of({ 'aria-label': 'Markdown editor', spellcheck: 'true' }), EditorView.updateListener.of(update => { if (update.docChanged) onchange(update.state.doc.toString()); })] });
  }
  onMount(() => {
    loadedId = noteId;
    view = new EditorView({ state: state(value), parent: host });
    return () => view?.destroy();
  });
  $effect(() => {
    if (!view) return;
    if (noteId !== loadedId) { loadedId = noteId; view.setState(state(value)); }
    else if (value !== view.state.doc.toString()) view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: value } });
    view.dispatch({ effects: readOnly.reconfigure(EditorState.readOnly.of(readonly)) });
  });
</script>
<div class="editor-host" bind:this={host}></div>
