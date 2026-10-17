# Automated checks

```bash
npm ci
npm run check
npm test
cargo test --locked -p phosphor-store
npm run tauri -- build --no-bundle
npm run test:e2e
```

## Unit and component tests

30 Vitest/jsdom tests cover both editors, formatting, save-queue ordering/failures, filtering, management UI, restoration confirmation, snapshot write failures, export ZIP contents/path safety/metadata, and literal highlighting. 12 Rust tests cover v0.1 migration, persisted empty notebooks, notebook/tag operations, FTS migration/update/filter/ranking/snippets, reopening, backup retention, invalid input, transactional restoration and recovery-copy failures.

## Native end-to-end test

`e2e/native.py` is a Python standard-library W3C WebDriver client, following [Tauri's native WebDriver setup](https://v2.tauri.app/develop/tests/webdriver/). Install `tauri-driver` with `cargo install tauri-driver --version 2.0.4 --locked` and provide `WebKitWebDriver` on PATH (Ubuntu package `webkit2gtk-driver`). A graphical session is needed; on CI use:

```bash
dbus-run-session -- xvfb-run -a npm run test:e2e
```

The test launches the actual optimized executable, enables Tauri automation only in its process environment, and uses real commands/SQLite, not API mocks or browser localStorage. It starts with a disposable v0.1 schema and exercises notebook creation/duplicates, formatted typing, content-prefix search/highlighting, combined filters, rename/delete/moves, tag merge/removal, manual snapshots, safe restore/recovery, Trash search/restore, empty notebook persistence a full process restart, and portable backup-file recovery. It verifies stored data independently through SQLite.

All XDG app-data/config/cache directories are isolated in a temporary folder and removed after the test; personal notes are never used. `PHOSPHOR_E2E_BINARY` overrides the default `target/release/phosphor`; `WEBKIT_WEBDRIVER` can point at a driver outside PATH. Driver ports are allocated dynamically. Screenshots, page source and driver logs are retained under `target/e2e-artifacts/` (only disposable notes). CI uploads this evidence even on failure.

## Release gate

The Linux release workflow runs type checks, frontend tests, Rust tests, the native E2E against the optimized binary, checksum/package metadata checks, and AppImage extraction/startup smoke checks before publishing. A failed required check prevents release publication. Native E2E is Linux-only; Windows/Android and native file-chooser interactions need separate coverage.

SQLite search uses [FTS5](https://sqlite.org/fts5.html), Unicode tokenization and safe quoted prefix terms, with BM25 relevance weighted toward titles. General Boolean/phrase syntax is deliberately not exposed.
