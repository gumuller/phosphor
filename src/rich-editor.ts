import { Editor, type EditorOptions } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { Markdown } from '@tiptap/markdown';
import { TableKit } from '@tiptap/extension-table';
import { TaskList, TaskItem } from '@tiptap/extension-list';
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import Placeholder from '@tiptap/extension-placeholder';
import { createLowlight } from 'lowlight';
import rust from 'highlight.js/lib/languages/rust';
import javascript from 'highlight.js/lib/languages/javascript';
import bash from 'highlight.js/lib/languages/bash';
import json from 'highlight.js/lib/languages/json';
import { NoteFind } from './editor-find';
import { TextSelection } from '@tiptap/pm/state';
const lowlight = createLowlight({ rust, javascript, bash, json });

export function createRichEditor(options: Partial<EditorOptions>, markdown = '') {
  let plainPaste = false;
  return new Editor({
    ...options,
    extensions: [
      StarterKit.configure({ codeBlock: false, link: { openOnClick: false, autolink: true, defaultProtocol: 'https', protocols: ['http', 'https', 'mailto'] } }),
      CodeBlockLowlight.configure({ lowlight, defaultLanguage: null }),
      TableKit.configure({ table: { resizable: false } }),
      NoteFind, TaskList, TaskItem.configure({ nested: true }),
      Placeholder.configure({ placeholder: 'A little room for your next thought…' }),
      Markdown.configure({ markedOptions: { gfm: true }, indentation: { style: 'space', size: 2 } }),
    ],
    content: markdown,
    contentType: 'markdown',
    editorProps: {
      handleKeyDown(_view, event) {
        plainPaste = (event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === 'v';
        return false;
      },
      handlePaste(view, event, slice) {
        if (plainPaste) {
          plainPaste = false;
          // ProseMirror already prepared a plain-text slice for Shift+paste.
          // Omitting paste-rule metadata keeps literal Markdown literal.
          view.dispatch(view.state.tr.replaceSelection(slice).scrollIntoView());
          return true;
        }
        const text = event.clipboardData?.getData('text/plain')?.trim();
        if (!text || view.state.selection.empty || !(view.state.selection instanceof TextSelection) || /\s/.test(text) || view.state.selection.$from.parent.type.name === 'codeBlock' || view.state.doc.rangeHasMark(view.state.selection.from, view.state.selection.to, view.state.schema.marks.code)) return false;
        try {
          const url = new URL(text);
          if (!['https:', 'http:', 'mailto:'].includes(url.protocol)) return false;
        } catch { return false; }
        const { from, to } = view.state.selection;
        view.dispatch(view.state.tr.addMark(from, to, view.state.schema.marks.link.create({ href: text })));
        return true;
      },
      attributes: { class: 'markdown rich-document', 'aria-label': 'Formatted note editor', role: 'textbox', 'aria-multiline': 'true', spellcheck: 'true' }, ...options.editorProps },
  });
}
