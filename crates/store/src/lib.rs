use rusqlite::{Connection, params};
use serde::{Deserialize, Serialize};
use std::path::Path;

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

pub struct Store(Connection);
impl Store {
    pub fn open(path: impl AsRef<Path>) -> Result<Self, String> {
        let mut connection = Connection::open(path).map_err(|e| e.to_string())?;
        connection
            .busy_timeout(std::time::Duration::from_secs(5))
            .map_err(|e| e.to_string())?;
        connection
            .execute_batch(
                "PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;
            CREATE TABLE IF NOT EXISTS notes (id TEXT PRIMARY KEY, data TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);",
            )
            .map_err(|e| e.to_string())?;
        let tx = connection.transaction().map_err(|e| e.to_string())?;
        let initialized: bool = tx
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM metadata WHERE key='initialized')",
                [],
                |r| r.get(0),
            )
            .map_err(|e| e.to_string())?;
        if !initialized {
            let seeds: Vec<Note> = serde_json::from_str(include_str!("../../../src/seeds.json"))
                .map_err(|e| e.to_string())?;
            for note in seeds {
                tx.execute(
                    "INSERT OR IGNORE INTO notes(id,data) VALUES(?1,?2)",
                    params![
                        note.id,
                        serde_json::to_string(&note).map_err(|e| e.to_string())?
                    ],
                )
                .map_err(|e| e.to_string())?;
            }
            tx.execute("INSERT INTO metadata VALUES('initialized','1')", [])
                .map_err(|e| e.to_string())?;
        }
        tx.commit().map_err(|e| e.to_string())?;
        Ok(Self(connection))
    }
    pub fn list(&self) -> Result<Vec<Note>, String> {
        let mut statement = self
            .0
            .prepare("SELECT data FROM notes")
            .map_err(|e| e.to_string())?;
        let rows = statement
            .query_map([], |row| row.get::<_, String>(0))
            .map_err(|e| e.to_string())?;
        rows.map(|row| {
            serde_json::from_str(&row.map_err(|e| e.to_string())?).map_err(|e| e.to_string())
        })
        .collect()
    }
    pub fn save(&self, note: &Note) -> Result<(), String> {
        if note.id.is_empty() {
            return Err("Note ID cannot be empty".into());
        }
        self.0.execute("INSERT INTO notes(id,data) VALUES(?1,?2) ON CONFLICT(id) DO UPDATE SET data=excluded.data", params![note.id, serde_json::to_string(note).map_err(|e| e.to_string())?]).map_err(|e| e.to_string())?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn edits_and_trash_survive_reopening_without_duplicate_seeds() {
        let path = std::env::temp_dir().join(format!(
            "phosphor-test-{}-{}.sqlite3",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let store = Store::open(&path).unwrap();
        let count = store.list().unwrap().len();
        let mut note = store
            .list()
            .unwrap()
            .into_iter()
            .find(|n| n.id == "welcome")
            .unwrap();
        note.body = "# Hello 世界\n\n**Saved** & <script>text</script>".into();
        note.trashed = true;
        store.save(&note).unwrap();
        drop(store);
        let reopened = Store::open(&path).unwrap();
        assert_eq!(reopened.list().unwrap().len(), count);
        assert_eq!(
            reopened
                .list()
                .unwrap()
                .into_iter()
                .find(|n| n.id == "welcome")
                .unwrap(),
            note
        );
        drop(reopened);
        std::fs::remove_file(path).unwrap();
    }
    #[test]
    fn rejects_empty_ids() {
        let store = Store::open(":memory:").unwrap();
        let mut note = store.list().unwrap().remove(0);
        note.id.clear();
        assert!(store.save(&note).is_err());
    }
}
