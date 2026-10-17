# Backup and recovery

Open **Backups & export** in the sidebar, or **Workspace tools → Backups**.

## Local snapshots

Phosphor checks for an automatic snapshot when the workspace opens and every 15 minutes while open. An unchanged native workspace does not create another snapshot. The latest 20 automatic copies are retained. Manual snapshots and the recovery copy made before every restore are retained until you remove their files yourself.

**Create snapshot** first drains pending edits. Snapshots include all notes (including Trash), raw Markdown, notebook definitions (including empty notebooks), tags, favorites and timestamps. Display settings are not included.

On Linux, snapshot files live in `~/.local/share/com.phosphor.notes/backups/` (or under `XDG_DATA_HOME`). They are versioned JSON, atomically renamed after syncing to disk, with owner-only file permissions. SQLite is read in a consistent transaction; copying a live WAL database is not part of the backup process. Backup errors are shown separately from the autosave status.

Local snapshots protect against accidental changes, **not loss of the disk**. They are not encrypted. Copy an export to another disk or your preferred backup service.

## Restore

Select **Restore** on a snapshot, review its date/count, then **Confirm restore**. This replaces the whole workspace. Phosphor validates the snapshot, saves a recovery snapshot of the current workspace, then replaces notes and notebooks in one SQLite transaction; indexing is updated by the same transaction. A validation, safety-copy or database failure aborts the restore. The **Before restore** entry can undo a successful restore.

Corrupt snapshots are retained on disk but omitted from the picker. Do not edit snapshot files while Phosphor is restoring them.

## Portable export and recovery

**Export all Markdown** saves a ZIP containing individual `.md` files grouped by notebook (with Trash separate), plus `phosphor-backup.json` with the full workspace and metadata. Numeric filename prefixes avoid collisions; user-supplied names cannot create paths outside the archive.

To recover on a new installation, extract the ZIP, open **Backups**, choose `phosphor-backup.json` using **Restore an exported backup**, review the note/notebook counts, and confirm. This also saves a recovery snapshot before replacing the workspace. Individual Markdown files are portable to other editors; this release imports Phosphor backup JSON, not arbitrary Markdown/ENEX files.

Browser preview snapshots use browser localStorage and its quota, independently of the native app. Use the desktop app for a substantial library. Exported files are portable between preview and desktop.
