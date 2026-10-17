# Phosphor direction

Fast local capture, comfortable writing and reliable retrieval come first. Evernote is the workflow reference; the CRT interface is Phosphor's own visual language. This is an iterative roadmap, not a claim of feature parity.

## Current iteration: editor polish and responsiveness

- [x] Default formatted editor with raw Markdown access.
- [x] Persistent formatting bar and a floating toolbar for selected text.
- [x] Headings, marks, lists, checklists, links, code and editable tables.
- [x] Tab/Shift+Tab between table cells; Tab in the last cell adds a row.
- [x] List indentation controls.
- [x] Pasting a URL over selected text applies a link.
- [x] Formatted paste through the editor schema and explicit plain-text paste.
- [x] Find-in-note, match navigation and highlighting; raw editor find/replace.
- [x] Keyboard note-list navigation and shortcut help.
- [x] Bounded note-card rendering and reusable search text.
- [x] Synthetic 10,000-note and long-note logic benchmarks.
- [ ] Real native input-to-paint and usable-window startup measurements.

## Next: everyday organization and trust

- [x] Notebook creation/renaming/deletion, persistent empty notebooks and tag rename/merge/removal.
- [ ] Notebook stacks.
- [ ] Duplicate notes and quick-access shortcuts.
- [x] Automatic local snapshots, retention, tested restore/recovery, full Markdown export and portable backup restoration.
- [x] SQLite FTS5 prefix search, relevance ranking, snippets, notebook/tag filters and explicit sorting.
- Markdown import and a deliberate Evernote ENEX migration path.

## Later: richer reference material

- Local images/files, attachment management and drag-and-drop capture.
- Internal note links/backlinks, note outlines and navigation history.
- Saved searches and richer task management beyond checklist items.
- Revisit cloud sync after local persistence and recovery are proven.

External web clipping, shared notebooks, OCR, account management and AI features require their own product and storage decisions. They are not implied by the current prototype.

## References

Evernote's [editor overview](https://help.evernote.com/hc/en-us/articles/360022954093-Note-editor-and-editing-toolbar-overview) informs selection formatting, structured content and URL-over-selection paste. Its [keyboard reference](https://help.evernote.com/hc/en-us/articles/34296687388307-Keyboard-shortcuts) informs familiar note capture and navigation. Phosphor's own shortcuts are documented in README; they are not an exact copy of every Evernote binding.
