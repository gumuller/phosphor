Phosphor __VERSION__ adds everyday organization, recovery and indexed search to the CRT notebook.

- Automatic local snapshots (latest 20), manual snapshots, transactional restore and a recovery copy before restoration.
- Export the whole workspace as Markdown ZIP, including metadata, and restore from its JSON backup file.
- Create/rename/delete notebooks, retain empty notebooks, and rename/merge/remove tags. Deleting a notebook moves its notes to Inbox.
- SQLite FTS5 search with prefix matching, relevance ranking, highlighted excerpts, notebook/tag filters and title/date sorting.
- Automated unit/component and Rust storage tests, plus native WebDriver E2E covering migration from v0.1, real editing/persistence, organization, search, recovery and reopening. Publication is gated on these and packaged startup checks.

**Download `Phosphor-__VERSION__-linux-x86_64.AppImage` for Omarchy/Arch or portable Linux use.** Mark it executable, then launch it. `INSTALL.txt` includes commands and a FUSE-free option. The `.deb` is for Debian/Ubuntu. Verify downloads with `SHA256SUMS`.

Built on Ubuntu 22.04 for Linux x86_64 (glibc 2.35+). Rust, Node and a development server are not required to run it. Updates are manual: close the old version, replace the executable; keep the app-data directory. Existing v0.1 notes migrate on opening.

Snapshots stay on the same device and are not encrypted. Export to another disk for protection against disk failure. Cloud sync, attachments, Windows/Android builds and automatic updates remain deferred. This is a preview release.
