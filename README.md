# Phosphor

A local-first notebook with a quiet green CRT interface. This first iteration is for validating the feel of writing and finding notes.

## Run

```bash
npm install
PATH="$HOME/.cargo/bin:$PATH" npm run desktop
```

Requires Rust, Node.js, and Tauri's platform dependencies. On this Linux machine, the required GTK3 and WebKitGTK 4.1 libraries are already installed.

For the browser-only preview:

```bash
npm run dev
```

Open http://127.0.0.1:1420. Browser preview notes live in that browser's local storage; they are separate from the desktop app's SQLite notes. Use the same URL and browser profile to return to them.

To build a standalone native binary with embedded frontend assets:

```bash
PATH="$HOME/.cargo/bin:$PATH" npm run tauri -- build --debug --no-bundle
./target/debug/phosphor
```

For an optimized build, omit `--debug`; the binary is `target/release/phosphor`.

## First iteration

- Formatted editing is the default, with a toolbar for headings, bold, italic, underline, strikethrough, inline code, bullet/numbered/task lists, quotes, links, tables, code blocks, dividers, clear formatting and undo/redo.
- Selection formatting floats near highlighted text. Find within the current note with Ctrl/Cmd F; Enter and Shift+Enter navigate matches.
- Paste a URL over selected text to link it. Ctrl/Cmd Shift V preserves literal plain text, including Markdown punctuation.
- The note list renders a bounded window, with Up/Down, Home/End and Page Up/Down navigation. Repeated library searches reuse normalized content.
- Switch to raw Markdown at any time. Changes in either editor save to the same note body. Opening formatted mode alone does not rewrite the source.
- Table controls add/remove rows and columns. Code blocks offer Rust, JavaScript, Bash, JSON and plain-text highlighting.
- Thick glowing underline cursor in both editors; raw Markdown uses CodeMirror with line numbers. Formatted editing uses Tiptap/ProseMirror.
- Search title, content, tags and notebook; filter favorites, notebooks and tags.
- Move notes to Trash and restore them. No permanent delete action.
- Assign notes to four starter notebooks and edit comma-separated tags.
- Autosave after a short pause; writes are serialized so older saves cannot overwrite newer ones.
- Native close waits for saves and stays open if a save fails.
- Export individual notes as Markdown through the native Save dialog.
- Toggle CRT atmosphere and adjust a saved phosphor bloom slider: green text emission, cursor glow, a softly curved raster, stationary phosphor grain and a static glass vignette. The raster is redrawn only on resize, not in an animation loop. Reduced-motion preferences disable caret blinking.

Native notes live in Tauri's platform application-data directory. On Linux this is normally `~/.local/share/com.phosphor.notes/phosphor.sqlite3`, or under `$XDG_DATA_HOME` if set. Do not move or copy a live SQLite database as a backup: it may have active WAL files.

The first run includes four editable example notes. They are seeded only once.

## Shortcuts

| Action | Shortcut |
| --- | --- |
| New note | Ctrl/Cmd N |
| Search | Ctrl/Cmd K |
| Formatted / Raw Markdown | Ctrl/Cmd Shift P |
| Save now | Ctrl/Cmd S |
| Find in note | Ctrl/Cmd F |
| Link selection (formatted editor) | Ctrl/Cmd Shift K |
| Paste plain text | Ctrl/Cmd Shift V |
| Table next / previous cell | Tab / Shift Tab |
| List indent / outdent | Ctrl/Cmd ] / [ |
| Shortcut help | Ctrl/Cmd / |

## Checks

```bash
npm run check
npm test
cargo test -p phosphor-store
npm run build
npm run bench
```

Component tests run in jsdom and cover formatted/raw editing, toolbar commands, Markdown roundtrips, tables, persistence, search, trash/restore and separate undo histories. Storage tests reopen a real SQLite database. Save queue tests cover rapid edits and failed writes. A real desktop visual review is still required: no browser or native UI automation surface was available during implementation.

## Deliberately deferred

Cloud sync, accounts, automatic backups, attachment/image management, custom notebook management, Markdown import and platform packaging for Windows/Android. Remote images are omitted in preview, so opening a note does not contact image hosts. Use Ctrl/Cmd-click on formatted links, or the link editor’s Open link action, to open them in the default browser. Underline uses `++text++` in raw Markdown. Complex formatting outside the supported Markdown schema is not offered by the toolbar.

Svelte renders the interface; Tauri hosts it natively; the Rust storage crate is independent of the UI. This prototype has been built on Linux. Windows and Android builds have not been tested.

## Memory footprint

An optimized release executable is available at `target/release/phosphor` (the earlier pre-WYSIWYG build was 13.7 MiB). Initial pre-WYSIWYG measurements show about 280–283 MiB proportional RAM across the app and its WebKit helpers with four sample notes. This is a Rust executable hosting a web interface; it is not yet a very lightweight Rust-rendered notebook. See [PERFORMANCE.md](PERFORMANCE.md) for measurements, caveats and the measurement script.

See [ROADMAP.md](ROADMAP.md) for the Evernote-inspired workflow priorities and [PERFORMANCE.md](PERFORMANCE.md) for benchmark methodology and limitations.
