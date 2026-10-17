use super::*;
struct Fixture {
    path: PathBuf,
    store: Store,
}
impl Fixture {
    fn new() -> Self {
        let path = std::env::temp_dir().join(format!(
            "phosphor-test-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir_all(&path).unwrap();
        Self {
            store: Store::open(path.join("notes.sqlite3")).unwrap(),
            path,
        }
    }
    fn reopen(&mut self) {
        self.store = Store::open(self.path.join("notes.sqlite3")).unwrap();
    }
}
impl Drop for Fixture {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.path);
    }
}
fn options(query: &str) -> SearchOptions {
    SearchOptions {
        query: query.into(),
        ..Default::default()
    }
}
#[test]
fn edits_trash_and_empty_notebooks_survive_reopening() {
    let mut f = Fixture::new();
    let mut note = f.store.list().unwrap().remove(0);
    let count = f.store.list().unwrap().len();
    note.body = "# Hello 世界\n**Saved** & <script>text</script>".into();
    note.trashed = true;
    f.store.save(&note).unwrap();
    f.store.create_notebook("Empty notebook").unwrap();
    f.reopen();
    assert_eq!(f.store.list().unwrap().len(), count);
    assert_eq!(
        f.store
            .list()
            .unwrap()
            .into_iter()
            .find(|n| n.id == note.id)
            .unwrap(),
        note
    );
    assert!(
        f.store
            .notebooks()
            .unwrap()
            .contains(&"Empty notebook".into())
    );
}
#[test]
fn rejects_invalid_saves_and_duplicate_names() {
    let mut store = Store::open(":memory:").unwrap();
    let mut note = store.list().unwrap().remove(0);
    note.id.clear();
    assert!(store.save(&note).is_err());
    note.id = "new".into();
    note.notebook = "Missing".into();
    assert!(store.save(&note).is_err());
    for name in [
        "",
        " inbox ",
        "All notes",
        "#tag",
        "Favorites",
        "Trash",
        "bad\nname",
    ] {
        assert!(store.create_notebook(name).is_err(), "{name}");
    }
    assert!(store.change_notebook("Inbox", None).is_err());
    assert!(store.change_notebook("Missing", Some("New")).is_err());
}
#[test]
fn notebook_operations_move_active_and_trashed_notes_atomically() {
    let mut store = Store::open(":memory:").unwrap();
    store.create_notebook("Work").unwrap();
    let mut note = store.list().unwrap().remove(0);
    note.notebook = "Work".into();
    note.trashed = true;
    store.save(&note).unwrap();
    assert!(store.change_notebook("Work", Some("Projects")).is_err());
    assert_eq!(
        store
            .list()
            .unwrap()
            .into_iter()
            .find(|n| n.id == note.id)
            .unwrap()
            .notebook,
        "Work"
    );
    store.change_notebook("Work", Some("Writing")).unwrap();
    assert!(store.notebooks().unwrap().contains(&"Writing".into()));
    store.change_notebook("Writing", None).unwrap();
    assert_eq!(
        store
            .list()
            .unwrap()
            .into_iter()
            .find(|n| n.id == note.id)
            .unwrap()
            .notebook,
        "Inbox"
    );
}
#[test]
fn tags_rename_merge_and_remove_without_substring_collisions() {
    let mut store = Store::open(":memory:").unwrap();
    let mut note = store.list().unwrap().remove(0);
    note.tags = "work, homework, ideas, WORK".into();
    store.save(&note).unwrap();
    store.change_tag("WORK", Some("ideas")).unwrap();
    assert_eq!(
        store
            .list()
            .unwrap()
            .into_iter()
            .find(|n| n.id == note.id)
            .unwrap()
            .tags,
        "ideas, homework"
    );
    store.change_tag("ideas", None).unwrap();
    assert_eq!(
        store
            .list()
            .unwrap()
            .into_iter()
            .find(|n| n.id == note.id)
            .unwrap()
            .tags,
        "homework"
    );
    assert!(store.change_tag("homework", Some("one,two")).is_err());
}
#[test]
fn migrates_old_database_and_indexes_existing_content_once() {
    let f = Fixture::new();
    let path = f.path.join("legacy.sqlite3");
    let db = Connection::open(&path).unwrap();
    db.execute_batch("CREATE TABLE notes(id TEXT PRIMARY KEY,data TEXT NOT NULL); CREATE TABLE metadata(key TEXT PRIMARY KEY,value TEXT NOT NULL); INSERT INTO metadata VALUES('initialized','1');").unwrap();
    let mut note = f.store.list().unwrap().remove(0);
    note.notebook = "Legacy book".into();
    note.body = "Migration searchable aardvark".into();
    db.execute(
        "INSERT INTO notes VALUES(?1,?2)",
        params![note.id, serde_json::to_string(&note).unwrap()],
    )
    .unwrap();
    drop(db);
    for _ in 0..2 {
        let store = Store::open(&path).unwrap();
        assert_eq!(store.search(&options("aardv")).unwrap().len(), 1);
        assert!(store.notebooks().unwrap().contains(&"Legacy book".into()));
    }
}
#[test]
fn full_text_search_updates_filters_highlights_and_ranks() {
    let mut f = Fixture::new();
    let mut note = f.store.list().unwrap().remove(0);
    note.id = "search-body".into();
    note.title = "Zebra".into();
    note.body = "Café launch unicorn underneath the moon".into();
    note.tags = "special tag, quote\"tag".into();
    note.starred = true;
    note.notebook = "Projects".into();
    f.store.save(&note).unwrap();
    let mut title = note.clone();
    title.id = "search-title".into();
    title.title = "Unicorn".into();
    title.body = "Café launch".into();
    title.tags.clear();
    title.starred = false;
    f.store.save(&title).unwrap();
    assert_eq!(f.store.search(&options("unic")).unwrap()[0].id, title.id);
    assert!(
        f.store
            .search(&options("cafe launch"))
            .unwrap()
            .iter()
            .any(|h| h.id == note.id)
    );
    let hits = f
        .store
        .search(&SearchOptions {
            tag: Some("special tag".into()),
            notebook: Some("Projects".into()),
            starred: true,
            ..options("unicorn")
        })
        .unwrap();
    assert_eq!(hits.len(), 1);
    assert!(hits[0].snippet.contains("\u{1}unicorn\u{2}"));
    assert!(
        f.store
            .search(&SearchOptions {
                tag: Some("special".into()),
                ..options("unicorn")
            })
            .unwrap()
            .is_empty()
    );
    assert_eq!(
        f.store
            .search(&SearchOptions {
                tag: Some("quote\"tag".into()),
                ..options("unicorn")
            })
            .unwrap()
            .len(),
        1
    );
    note.body = "Replacement platypus".into();
    note.trashed = true;
    f.store.save(&note).unwrap();
    assert_eq!(f.store.search(&options("unicorn")).unwrap().len(), 1);
    assert!(f.store.search(&options("platypus")).unwrap().is_empty());
    assert_eq!(
        f.store
            .search(&SearchOptions {
                trashed: true,
                ..options("platypus")
            })
            .unwrap()
            .len(),
        1
    );
    f.reopen();
    assert_eq!(
        f.store
            .search(&SearchOptions {
                trashed: true,
                ..options("platypus")
            })
            .unwrap()
            .len(),
        1
    );
    for q in [
        "\"",
        "---",
        "OR * NOT",
        "\"; DROP TABLE notes; --",
        "世界",
        "café",
    ] {
        f.store.search(&options(q)).unwrap();
    }
}
#[test]
fn snapshots_restore_everything_and_keep_a_recovery_copy() {
    let mut f = Fixture::new();
    f.store.create_notebook("Empty book").unwrap();
    let expected = f.store.workspace().unwrap();
    let snapshot = f.store.snapshot("manual").unwrap();
    let mut note = expected.notes[0].clone();
    note.body = "Changed after snapshot salamander".into();
    f.store.save(&note).unwrap();
    f.store.create_notebook("Later").unwrap();
    let changed = f.store.workspace().unwrap();
    assert_eq!(f.store.restore_backup(&snapshot.id).unwrap(), expected);
    assert!(f.store.search(&options("salamander")).unwrap().is_empty());
    let recovery = f
        .store
        .list_backups()
        .unwrap()
        .into_iter()
        .find(|b| b.kind == "recovery")
        .unwrap();
    assert_eq!(
        f.store.read_backup(&recovery.id).unwrap().workspace,
        changed
    );
    f.reopen();
    assert_eq!(f.store.workspace().unwrap(), expected);
    assert!(f.store.restore_backup("../anything.json").is_err());
}
#[test]
fn corrupt_or_invalid_snapshots_leave_live_data_untouched() {
    let mut f = Fixture::new();
    let expected = f.store.workspace().unwrap();
    let snapshot = f.store.snapshot("manual").unwrap();
    let path = f.path.join("backups").join(&snapshot.id);
    for content in [
        "broken".to_owned(),
        serde_json::to_string(&Backup {
            version: 99,
            created_at: 0,
            workspace: expected.clone(),
        })
        .unwrap(),
        {
            let mut workspace = expected.clone();
            workspace.notes.push(workspace.notes[0].clone());
            serde_json::to_string(&Backup {
                version: 1,
                created_at: 0,
                workspace,
            })
            .unwrap()
        },
    ] {
        std::fs::write(&path, content).unwrap();
        assert!(f.store.restore_backup(&snapshot.id).is_err());
        assert_eq!(f.store.workspace().unwrap(), expected);
    }
}
#[test]
fn safety_snapshot_failure_aborts_restore() {
    let mut f = Fixture::new();
    let snapshot = f.store.snapshot("manual").unwrap();
    let mut note = f.store.list().unwrap().remove(0);
    note.body = "Keep current changes".into();
    f.store.save(&note).unwrap();
    let before = f.store.workspace().unwrap();
    let backup = f.store.read_backup(&snapshot.id).unwrap();
    // Reading a portable backup succeeds, but writing the recovery copy fails.
    f.store.backup_directory = Some(f.path.join("blocked"));
    std::fs::write(f.path.join("blocked"), "file").unwrap();
    assert!(f.store.restore_data(backup).is_err());
    assert_eq!(f.store.workspace().unwrap(), before);
}
#[test]
fn automatic_snapshot_cadence_and_retention_preserve_manual_copies() {
    let mut f = Fixture::new();
    f.store.auto_backup().unwrap();
    f.store.auto_backup().unwrap();
    assert_eq!(f.store.list_backups().unwrap().len(), 1);
    let manual = f.store.snapshot("manual").unwrap();
    for _ in 0..22 {
        f.store.snapshot("auto").unwrap();
    }
    let backups = f.store.list_backups().unwrap();
    assert_eq!(backups.iter().filter(|b| b.kind == "auto").count(), 20);
    assert!(backups.iter().any(|b| b.id == manual.id));
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        assert_eq!(
            std::fs::metadata(f.path.join("backups").join(manual.id))
                .unwrap()
                .permissions()
                .mode()
                & 0o777,
            0o600
        );
    }
}

#[test]
fn database_failure_rolls_back_restore_and_keeps_recovery_copy() {
    let mut f = Fixture::new();
    let snapshot = f.store.snapshot("manual").unwrap();
    let mut note = f.store.list().unwrap().remove(0);
    note.body = "Latest live data".into();
    f.store.save(&note).unwrap();
    let before = f.store.workspace().unwrap();
    f.store.connection.execute_batch("CREATE TRIGGER simulate_full_disk BEFORE INSERT ON notes BEGIN SELECT RAISE(ABORT,'simulated disk failure'); END;").unwrap();
    assert!(
        f.store
            .restore_backup(&snapshot.id)
            .unwrap_err()
            .contains("simulated disk failure")
    );
    assert_eq!(f.store.workspace().unwrap(), before);
    let recovery = f
        .store
        .list_backups()
        .unwrap()
        .into_iter()
        .find(|b| b.kind == "recovery")
        .unwrap();
    assert_eq!(f.store.read_backup(&recovery.id).unwrap().workspace, before);
}

#[test]
fn automatic_backups_skip_unchanged_data_and_capture_edits_when_due() {
    let mut f = Fixture::new();
    f.store.auto_backup().unwrap();
    f.store.last_auto_check = 0;
    let first = f.store.list_backups().unwrap().remove(0);
    let path = f.path.join("backups").join(&first.id);
    let mut old = f.store.read_backup(&first.id).unwrap();
    old.created_at = 0;
    std::fs::write(&path, serde_json::to_vec(&old).unwrap()).unwrap();
    f.store.auto_backup().unwrap();
    assert_eq!(f.store.list_backups().unwrap().len(), 1);
    let mut note = f.store.list().unwrap().remove(0);
    note.body = "new automatic snapshot".into();
    f.store.save(&note).unwrap();
    f.store.last_auto_check = 0;
    f.store.auto_backup().unwrap();
    let latest = f.store.list_backups().unwrap().remove(0);
    assert_ne!(latest.id, first.id);
    assert!(
        f.store
            .read_backup(&latest.id)
            .unwrap()
            .workspace
            .notes
            .iter()
            .any(|n| n.body == "new automatic snapshot")
    );
}
