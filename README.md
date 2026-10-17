# Phosphor

A local-first notebook with a quiet green CRT interface. This first iteration is for validating the feel of writing and finding notes.

## Download the Linux app

Get the **AppImage** from [GitHub Releases](https://github.com/gumuller/phosphor/releases). The repository is private, so sign in with an account that has repository access. You can share the downloaded AppImage directly.

1. Download `Phosphor-0.2.0-linux-x86_64.AppImage`.
2. Right-click it, open **Properties**, and allow executing it as a program.
3. Double-click it.

Or use a terminal in your Downloads folder:

```bash
chmod u+x Phosphor-0.2.0-linux-x86_64.AppImage
./Phosphor-0.2.0-linux-x86_64.AppImage
```

No Rust, Node.js, development server or account is needed to run the app. If your system lacks FUSE 2, launch with `APPIMAGE_EXTRACT_AND_RUN=1 ./Phosphor-0.2.0-linux-x86_64.AppImage`. An optional `.deb` provides an installed menu launcher on Debian/Ubuntu. See the release's `INSTALL.txt` and `SHA256SUMS`.

Linux x86_64 packages use Ubuntu 22.04 as the build baseline (glibc 2.35+); other architectures/platforms are not packaged yet. Notes stay in your application-data directory, separate from the executable. Updating means replacing the app file, not your note data.

See [Linux packaging and releases](docs/DISTRIBUTION.md) for build and publishing instructions.

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

## Features

- Formatted editing is the default, with a toolbar for headings, bold, italic, underline, strikethrough, inline code, bullet/numbered/task lists, quotes, links, tables, code blocks, dividers, clear formatting and undo/redo.
- Selection formatting floats near highlighted text. Find within the current note with Ctrl/Cmd F; Enter and Shift+Enter navigate matches.
- Paste a URL over selected text to link it. Ctrl/Cmd Shift V preserves literal plain text, including Markdown punctuation.
- The note list renders a bounded window, with Up/Down, Home/End and Page Up/Down navigation. Native library searches use SQLite FTS5.
- Switch to raw Markdown at any time. Changes in either editor save to the same note body. Opening formatted mode alone does not rewrite the source.
- Table controls add/remove rows and columns. Code blocks offer Rust, JavaScript, Bash, JSON and plain-text highlighting.
- Thick glowing underline cursor in both editors; raw Markdown uses CodeMirror with line numbers. Formatted editing uses Tiptap/ProseMirror.
- Indexed prefix search across titles, content, tags and notebooks, with relevance ranking, highlighted excerpts, notebook/tag filters and sorting by title or timestamps. Search Trash from its own view. Input is treated as literal words; advanced query operators are not exposed.
- Move notes to Trash and restore them. No permanent delete action.
- Create, rename and delete notebooks; deleting moves notes to Inbox. Inbox is permanent. Rename/merge/remove tags across notes, including Trash. Empty notebooks persist.
- Autosave after a short pause; writes are serialized so older saves cannot overwrite newer ones.
- Native close waits for saves and stays open if a save fails.
- Automatic local snapshots, manual snapshots, recovery before restore, and a Markdown ZIP export of the full workspace. Restore from snapshots or the exported JSON manifest. See [backup and recovery](docs/BACKUPS.md).
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

Unit/component tests run in jsdom and cover formatted/raw editing, toolbar commands, Markdown roundtrips, tables, persistence, search, trash/restore and separate undo histories. Storage tests reopen a real SQLite database. Save queue tests cover rapid edits and failed writes. Native WebDriver E2E tests run the compiled app against a disposable v0.1 database and exercise migration, editing, organization, indexed search, recovery and reopening. See [testing](docs/TESTING.md). Release publication is gated on these checks and packaged startup.

## Deliberately deferred

Cloud sync, accounts, attachment/image management, notebook stacks, general Markdown/ENEX import and platform packaging for Windows/Android. Remote images are omitted in preview, so opening a note does not contact image hosts. Use Ctrl/Cmd-click on formatted links, or the link editor’s Open link action, to open them in the default browser. Underline uses `++text++` in raw Markdown. Complex formatting outside the supported Markdown schema is not offered by the toolbar.

Svelte renders the interface; Tauri hosts it natively; the Rust storage crate is independent of the UI. This prototype has been built on Linux. Windows and Android builds have not been tested.

## Memory footprint

An optimized release executable is available at `target/release/phosphor` (the earlier pre-WYSIWYG build was 13.7 MiB). Initial pre-WYSIWYG measurements show about 280–283 MiB proportional RAM across the app and its WebKit helpers with four sample notes. This is a Rust executable hosting a web interface; it is not yet a very lightweight Rust-rendered notebook. See [PERFORMANCE.md](PERFORMANCE.md) for measurements, caveats and the measurement script.

See [ROADMAP.md](ROADMAP.md) for the Evernote-inspired workflow priorities and [PERFORMANCE.md](PERFORMANCE.md) for benchmark methodology and limitations.
