# Linux packaging and releases

## Downloads

Release assets contain a portable Linux x86_64 AppImage, a Debian package, `INSTALL.txt`, and SHA-256 checksums. AppImage downloads need the executable permission enabled once. FUSE-free extraction/run is supported through `APPIMAGE_EXTRACT_AND_RUN=1`.

The Debian package installs a desktop-menu entry and app icon using the normal package manager. The AppImage includes its launcher and icon, but this project does not automatically alter a user's desktop or menus when they run a portable copy.

The repository stays private. Release pages require repository access; the AppImage file can be shared directly. Packages contain code and starter notes, not your personal note database. Updates are manual. Code signing/automatic updates are not configured.

## Build baseline

Official release builds use GitHub's `ubuntu-22.04` x86_64 runner. This targets glibc 2.35 and avoids accidentally raising the minimum libc version by building on a newer Arch/Omarchy host. AppImage still needs a compatible Linux graphical desktop/graphics stack. It is not a promise that every distribution has been tested. See [Tauri's compatibility guidance](https://v2.tauri.app/distribute/appimage/).

Build locally only for your machine, or from a compatible Ubuntu 22.04 environment:

```bash
npm ci
npm run package:linux
node scripts/prepare-release.mjs --tag v0.1.0
```

Final downloads appear in `target/release/distribution/`. The underlying bundles are in `target/release/bundle/`. Building on this workstation may produce a binary that requires its newer glibc; use the official workflow for distribution.

## Publishing

The workflow is `.github/workflows/release-linux.yml`. It pins action revisions, uses lockfiles, checks version consistency, runs frontend and SQLite tests, packages both formats, validates checksums/desktop metadata, and smoke-tests AppImage extraction/native startup under Xvfb with disposable notes and software graphics.

That smoke check verifies a running application, SQLite initialization and a WebKit content process. It does not automate interactions or verify final visual layout.

To build the current source without publishing, run **Actions → Linux release → Run workflow**, select the desired source branch/tag, enter the matching version tag (e.g. `v0.1.0`), and leave **Publish** off. Download the tested artifact from the workflow run.

For the first release, or a manually selected source ref:

```bash
gh workflow run release-linux.yml --ref main -f tag=v0.1.0 -F publish=true
```

The release is created only after all checks pass, using the workflow's exact source commit. When invoked manually without an existing tag, GitHub creates the tag at that commit during publication. Existing releases are not overwritten by the workflow.

Future release procedure:

1. Update the version in `package.json`/`package-lock.json`, `src-tauri/tauri.conf.json`, and the app's `src-tauri/Cargo.toml`/`Cargo.lock` entry. Update release notes as needed.
2. Run checks and commit/push the changes.
3. Create and push a matching version tag (e.g. `v0.1.1`). Tag pushes automatically build and publish a preview release after validation.
4. Confirm the workflow succeeds and verify downloaded checksums.

`docs/RELEASE_NOTES.md` is the release-notes template; `__VERSION__` is replaced during publication. All releases are currently marked as previews. Add stable-release policy and update signing deliberately when the app is ready.
