import { Extension } from '@tiptap/core';
import type { Node } from '@tiptap/pm/model';
import { Plugin, PluginKey, TextSelection } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import type { Editor } from '@tiptap/core';
export interface Match { from: number; to: number }
interface FindState { query: string; matches: Match[]; active: number }
export const findKey = new PluginKey<FindState>('phosphor-find');
export function findText(doc: Node, query: string): Match[] {
  if (!query) return [];
  const matches: Match[] = [];
  // Escaping the literal query and using a Unicode-aware regexp preserves
  // original string positions even for case folding with different lengths.
  const pattern = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'giu');
  doc.descendants((node, pos) => {
    if (matches.length >= 1000) return false;
    if (!node.isTextblock) return true;
    const text = node.textBetween(0, node.content.size, '', '\ufffc');
    for (const match of text.matchAll(pattern)) {
      matches.push({ from: pos + 1 + match.index!, to: pos + 1 + match.index! + match[0].length });
      if (matches.length === 1000) break;
    }
    return false;
  });
  return matches;
}
export const NoteFind = Extension.create({
  name: 'noteFind',
  addProseMirrorPlugins() {
    return [new Plugin<FindState>({
      key: findKey,
      state: {
        init: () => ({ query: '', matches: [], active: 0 }),
        apply(tr, old) {
          const request = tr.getMeta(findKey) as { query: string; active: number } | undefined;
          if (!request && !tr.docChanged) return old;
          const query = request?.query ?? old.query;
          const matches = findText(tr.doc, query);
          return { query, matches, active: Math.max(0, Math.min(request?.active ?? old.active, matches.length-1)) };
        },
      },
      props: { decorations(state) {
        const find = findKey.getState(state);
        return DecorationSet.create(state.doc, find?.matches.map((m,i) => Decoration.inline(m.from, m.to, { class: i === find.active ? 'note-match current-match' : 'note-match' })) ?? []);
      } },
    })];
  },
});
export function searchInNote(editor: Editor, query: string, active = 0, jump = true) {
  const matches = findText(editor.state.doc, query);
  const index = matches.length ? ((active % matches.length) + matches.length) % matches.length : 0;
  let tr = editor.state.tr.setMeta(findKey, { query, active: index });
  if (jump && matches[index]) tr = tr.setSelection(TextSelection.create(tr.doc, matches[index].from, matches[index].to)).scrollIntoView();
  editor.view.dispatch(tr);
  return { total: matches.length, active: index };
}
