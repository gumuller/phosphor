use super::*;
use std::{collections::HashSet, fs, io::Write};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Workspace {
    pub notes: Vec<Note>,
    pub notebooks: Vec<String>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Backup {
    pub version: u32,
    pub created_at: i64,
    pub workspace: Workspace,
}
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupInfo {
    pub id: String,
    pub created_at: i64,
    pub notes: usize,
    pub kind: String,
}
impl Backup {
    pub fn validate(&self) -> Result<(), String> {
        if self.version != 1 {
            return Err("Unsupported backup version".into());
        }
        let mut notebooks = HashSet::new();
        for name in &self.workspace.notebooks {
            if valid_name(name)? != *name
                || name.starts_with('#')
                || ["All notes", "Favorites", "Trash"]
                    .iter()
                    .any(|s| s.eq_ignore_ascii_case(name))
                || !notebooks.insert(name.to_lowercase())
            {
                return Err("Invalid or duplicate notebook in backup".into());
            }
        }
        if !self.workspace.notebooks.iter().any(|n| n == "Inbox") {
            return Err("Backup has no Inbox notebook".into());
        }
        let mut ids = HashSet::new();
        for note in &self.workspace.notes {
            if note.id.is_empty()
                || !ids.insert(&note.id)
                || !self.workspace.notebooks.contains(&note.notebook)
            {
                return Err("Backup contains invalid note references or duplicate IDs".into());
            }
        }
        Ok(())
    }
}
impl Store {
    fn backup_dir(&self) -> Result<&Path, String> {
        self.backup_directory
            .as_deref()
            .ok_or_else(|| "Snapshots require a file-backed database".into())
    }
    pub fn list_backups(&self) -> Result<Vec<BackupInfo>, String> {
        let dir = self.backup_dir()?;
        if !dir.exists() {
            return Ok(vec![]);
        }
        let mut result = Vec::new();
        for entry in fs::read_dir(dir).map_err(err)? {
            let path = entry.map_err(err)?.path();
            if path.extension().is_none_or(|e| e != "json") {
                continue;
            }
            let id = path.file_name().unwrap().to_string_lossy().into_owned();
            // Keep corrupt files on disk for diagnosis, but don't offer them for restoration.
            if let Ok(backup) = self.read_backup(&id) {
                result.push(BackupInfo {
                    kind: id.split('-').next().unwrap_or("manual").into(),
                    id,
                    created_at: backup.created_at,
                    notes: backup.workspace.notes.len(),
                });
            }
        }
        result.sort_by(|a, b| b.created_at.cmp(&a.created_at).then(b.id.cmp(&a.id)));
        Ok(result)
    }
    pub fn read_backup(&self, id: &str) -> Result<Backup, String> {
        if !id.ends_with(".json")
            || !id
                .chars()
                .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '.')
            || id.contains("..")
        {
            return Err("Invalid snapshot ID".into());
        }
        let path = self.backup_dir()?.join(id);
        if fs::symlink_metadata(&path)
            .map_err(err)?
            .file_type()
            .is_symlink()
        {
            return Err("Snapshot cannot be a symbolic link".into());
        }
        let backup: Backup = serde_json::from_slice(&fs::read(path).map_err(err)?).map_err(err)?;
        backup.validate()?;
        Ok(backup)
    }
    pub fn snapshot(&self, kind: &str) -> Result<BackupInfo, String> {
        if !["auto", "manual", "recovery"].contains(&kind) {
            return Err("Invalid snapshot kind".into());
        }
        let dir = self.backup_dir()?;
        fs::create_dir_all(dir).map_err(err)?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            fs::set_permissions(dir, fs::Permissions::from_mode(0o700)).map_err(err)?;
        }
        let stamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map_err(err)?
            .as_nanos();
        let id = format!("{kind}-{stamp}.json");
        let path = dir.join(&id);
        let temporary = path.with_extension("tmp");
        let backup = Backup {
            version: 1,
            created_at: now(),
            workspace: self.workspace()?,
        };
        backup.validate()?;
        let data = serde_json::to_vec(&backup).map_err(err)?;
        let mut options = fs::OpenOptions::new();
        options.write(true).create_new(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            options.mode(0o600);
        }
        let result = (|| {
            let mut file = options.open(&temporary).map_err(err)?;
            file.write_all(&data).map_err(err)?;
            file.sync_all().map_err(err)?;
            fs::rename(&temporary, &path).map_err(err)?;
            #[cfg(unix)]
            fs::File::open(dir)
                .and_then(|d| d.sync_all())
                .map_err(err)?;
            Ok::<_, String>(())
        })();
        if result.is_err() {
            let _ = fs::remove_file(&temporary);
        }
        result?;
        if kind == "auto" {
            for old in self
                .list_backups()?
                .into_iter()
                .filter(|b| b.kind == "auto")
                .skip(20)
            {
                fs::remove_file(dir.join(old.id)).map_err(err)?;
            }
        }
        Ok(BackupInfo {
            id,
            created_at: backup.created_at,
            notes: backup.workspace.notes.len(),
            kind: kind.into(),
        })
    }
    pub fn auto_backup(&mut self) -> Result<(), String> {
        if now() - self.last_auto_check < 15 * 60 * 1000 {
            return Ok(());
        }
        let directory = self.backup_dir()?;
        let mut candidates = if directory.exists() {
            fs::read_dir(directory)
                .map_err(err)?
                .map(|entry| {
                    entry
                        .map(|e| e.file_name().to_string_lossy().into_owned())
                        .map_err(err)
                })
                .collect::<Result<Vec<_>, _>>()?
        } else {
            vec![]
        };
        candidates.retain(|id| id.starts_with("auto-") && id.ends_with(".json"));
        candidates.sort_by(|a, b| b.cmp(a));
        let latest = candidates
            .into_iter()
            .find_map(|id| self.read_backup(&id).ok());
        if latest
            .as_ref()
            .is_none_or(|b| now() - b.created_at >= 15 * 60 * 1000)
        {
            // Don't grow the snapshot folder when nothing has changed.
            let same = latest
                .as_ref()
                .is_some_and(|b| self.workspace().is_ok_and(|w| w == b.workspace));
            if !same {
                self.snapshot("auto")?;
            }
        }
        self.last_auto_check = now();
        Ok(())
    }
    pub fn restore_backup(&mut self, id: &str) -> Result<Workspace, String> {
        let backup = self.read_backup(id)?;
        self.restore_data(backup)
    }
    pub fn restore_data(&mut self, backup: Backup) -> Result<Workspace, String> {
        backup.validate()?;
        // A failed safety snapshot must abort restoration before touching live data.
        self.snapshot("recovery")?;
        let tx = self.connection.transaction().map_err(err)?;
        tx.execute("DELETE FROM notes", []).map_err(err)?;
        tx.execute("DELETE FROM notebooks", []).map_err(err)?;
        for name in &backup.workspace.notebooks {
            tx.execute("INSERT INTO notebooks VALUES(?1)", [name])
                .map_err(err)?;
        }
        for note in &backup.workspace.notes {
            tx.execute(
                "INSERT INTO notes(id,data) VALUES(?1,?2)",
                params![note.id, serde_json::to_string(note).map_err(err)?],
            )
            .map_err(err)?;
        }
        tx.commit().map_err(err)?;
        self.workspace()
    }
}
