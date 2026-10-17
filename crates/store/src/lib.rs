mod backup;
mod search;

pub use backup::{Backup, BackupInfo, Workspace};
use rusqlite::{Connection, params};
pub use search::{SearchHit, SearchOptions};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Note {
    pub id: String,
    pub title: String,
    pub body: String,
    pub notebook: String,
    pub tags: String,
    pub starred: bool,
    pub trashed: bool,
    pub created_at: i64,
    pub updated_at: i64,
}

pub struct Store {
    connection: Connection,
    backup_directory: Option<PathBuf>,
    last_auto_check: i64,
}
fn err(e: impl std::fmt::Display) -> String {
    e.to_string()
}
pub fn now() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64
}
fn valid_name(name: &str) -> Result<String, String> {
    let name = name.trim();
    if name.is_empty() || name.chars().count() > 80 || name.chars().any(char::is_control) {
        return Err("Use a name of 1–80 characters without control characters".into());
    }
    Ok(name.to_owned())
}
pub fn tags(value: &str) -> Vec<String> {
    let mut result = Vec::new();
    for tag in value.split(',').map(str::trim).filter(|s| !s.is_empty()) {
        if !result
            .iter()
            .any(|s: &String| s.to_lowercase() == tag.to_lowercase())
        {
            result.push(tag.into());
        }
    }
    result
}
impl Store {
    pub fn open(path: impl AsRef<Path>) -> Result<Self, String> {
        let mut connection = Connection::open(path.as_ref()).map_err(err)?;
        connection
            .busy_timeout(std::time::Duration::from_secs(5))
            .map_err(err)?;
        connection
            .execute_batch(
                "PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;
            CREATE TABLE IF NOT EXISTS notes (id TEXT PRIMARY KEY, data TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS notebooks (name TEXT PRIMARY KEY COLLATE NOCASE);",
            )
            .map_err(err)?;
        let tx = connection.transaction().map_err(err)?;
        let initialized: bool = tx
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM metadata WHERE key='initialized')",
                [],
                |r| r.get(0),
            )
            .map_err(err)?;
        if !initialized {
            let seeds: Vec<Note> =
                serde_json::from_str(include_str!("../../../src/seeds.json")).map_err(err)?;
            for note in seeds {
                tx.execute(
                    "INSERT OR IGNORE INTO notes(id,data) VALUES(?1,?2)",
                    params![note.id, serde_json::to_string(&note).map_err(err)?],
                )
                .map_err(err)?;
            }
            tx.execute("INSERT INTO metadata VALUES('initialized','1')", [])
                .map_err(err)?;
        }
        // Import existing note assignments once; empty/deleted notebooks then remain meaningful.
        let organized: bool = tx
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM metadata WHERE key='notebooks-v1')",
                [],
                |r| r.get(0),
            )
            .map_err(err)?;
        if !organized {
            tx.execute_batch("INSERT OR IGNORE INTO notebooks VALUES('Inbox'),('Field notes'),('Projects'),('Personal');
                INSERT OR IGNORE INTO notebooks SELECT json_extract(data,'$.notebook') FROM notes;
                INSERT INTO metadata VALUES('notebooks-v1','1');").map_err(err)?;
        }
        tx.commit().map_err(err)?;
        let store = Self {
            connection,
            last_auto_check: 0,
            backup_directory: if path.as_ref() == Path::new(":memory:") {
                None
            } else {
                Some(
                    path.as_ref()
                        .parent()
                        .unwrap_or(Path::new("."))
                        .join("backups"),
                )
            },
        };
        store.initialize_search()?;
        Ok(store)
    }
    pub fn list(&self) -> Result<Vec<Note>, String> {
        let mut statement = self
            .connection
            .prepare("SELECT data FROM notes")
            .map_err(err)?;
        let rows = statement
            .query_map([], |row| row.get::<_, String>(0))
            .map_err(err)?;
        rows.map(|row| serde_json::from_str(&row.map_err(err)?).map_err(err))
            .collect()
    }
    pub fn notebooks(&self) -> Result<Vec<String>, String> {
        let mut statement = self
            .connection
            .prepare("SELECT name FROM notebooks ORDER BY name COLLATE NOCASE")
            .map_err(err)?;
        statement
            .query_map([], |r| r.get(0))
            .map_err(err)?
            .map(|r| r.map_err(err))
            .collect()
    }
    pub fn workspace(&self) -> Result<Workspace, String> {
        let tx = self.connection.unchecked_transaction().map_err(err)?;
        let workspace = Workspace {
            notes: self.list()?,
            notebooks: self.notebooks()?,
        };
        tx.commit().map_err(err)?;
        Ok(workspace)
    }
    pub fn save(&mut self, note: &Note) -> Result<(), String> {
        if note.id.is_empty() {
            return Err("Note ID cannot be empty".into());
        }
        let notebook: String = self
            .connection
            .query_row(
                "SELECT name FROM notebooks WHERE name=?1 COLLATE NOCASE",
                [&note.notebook],
                |r| r.get(0),
            )
            .map_err(|_| "Notebook no longer exists. Choose another notebook.".to_string())?;
        let mut note = note.clone();
        note.notebook = notebook;
        note.tags = tags(&note.tags).join(", ");
        self.connection.execute("INSERT INTO notes(id,data) VALUES(?1,?2) ON CONFLICT(id) DO UPDATE SET data=excluded.data", params![note.id, serde_json::to_string(&note).map_err(err)?]).map_err(err)?;
        Ok(())
    }
    pub fn create_notebook(&self, name: &str) -> Result<(), String> {
        let name = valid_name(name)?;
        if ["All notes", "Favorites", "Trash"]
            .iter()
            .any(|s| s.eq_ignore_ascii_case(&name))
            || name.starts_with('#')
        {
            return Err("That name is reserved for a workspace view".into());
        }
        if self
            .notebooks()?
            .iter()
            .any(|n| n.to_lowercase() == name.to_lowercase())
        {
            return Err("A notebook with that name already exists".into());
        }
        self.connection
            .execute("INSERT INTO notebooks(name) VALUES(?1)", [name])
            .map_err(|_| "A notebook with that name already exists".to_string())?;
        Ok(())
    }
    pub fn change_notebook(&mut self, old: &str, replacement: Option<&str>) -> Result<(), String> {
        if old.eq_ignore_ascii_case("Inbox") {
            return Err("Inbox is the default notebook and cannot be renamed or deleted".into());
        }
        let target = replacement
            .map(valid_name)
            .transpose()?
            .unwrap_or_else(|| "Inbox".into());
        if replacement.is_some()
            && self
                .notebooks()?
                .iter()
                .any(|n| n != old && n.to_lowercase() == target.to_lowercase())
        {
            return Err("A notebook with that name already exists".into());
        }
        let tx = self.connection.transaction().map_err(err)?;
        if replacement.is_some() {
            if ["All notes", "Favorites", "Trash"]
                .iter()
                .any(|s| s.eq_ignore_ascii_case(&target))
                || target.starts_with('#')
            {
                return Err("That notebook name is reserved".into());
            }
            let changed = tx
                .execute(
                    "UPDATE notebooks SET name=?1 WHERE name=?2 COLLATE NOCASE",
                    params![target, old],
                )
                .map_err(|_| "A notebook with that name already exists".to_string())?;
            if changed == 0 {
                return Err("Notebook no longer exists".into());
            }
        } else if tx
            .execute("DELETE FROM notebooks WHERE name=?1 COLLATE NOCASE", [old])
            .map_err(err)?
            == 0
        {
            return Err("Notebook no longer exists".into());
        }
        tx.execute("UPDATE notes SET data=json_set(data,'$.notebook',?1) WHERE json_extract(data,'$.notebook')=?2 COLLATE NOCASE", params![target, old]).map_err(err)?;
        tx.commit().map_err(err)
    }
    pub fn change_tag(&mut self, old: &str, replacement: Option<&str>) -> Result<(), String> {
        let replacement = replacement.map(valid_name).transpose()?;
        if replacement.as_ref().is_some_and(|s| s.contains(',')) {
            return Err("Tag names cannot contain commas".into());
        }
        let notes = self.list()?;
        let tx = self.connection.transaction().map_err(err)?;
        for mut note in notes {
            let existing = tags(&note.tags);
            if !existing
                .iter()
                .any(|s| s.to_lowercase() == old.to_lowercase())
            {
                continue;
            }
            note.tags = tags(
                &existing
                    .into_iter()
                    .filter_map(|tag| {
                        if tag.to_lowercase() == old.to_lowercase() {
                            replacement.clone()
                        } else {
                            Some(tag)
                        }
                    })
                    .collect::<Vec<_>>()
                    .join(","),
            )
            .join(", ");
            tx.execute(
                "UPDATE notes SET data=?1 WHERE id=?2",
                params![serde_json::to_string(&note).map_err(err)?, note.id],
            )
            .map_err(err)?;
        }
        tx.commit().map_err(err)
    }
}

#[cfg(test)]
mod tests;
