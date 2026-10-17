use super::*;

#[derive(Debug, Default, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct SearchOptions {
    pub query: String,
    pub notebook: Option<String>,
    pub tag: Option<String>,
    pub trashed: bool,
    pub starred: bool,
    pub sort: String,
}
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchHit {
    pub id: String,
    pub snippet: String,
}
impl Store {
    pub(crate) fn initialize_search(&self) -> Result<(), String> {
        self.connection.execute_batch("BEGIN;
            CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts USING fts5(id UNINDEXED,title,body,tags,notebook, tokenize='unicode61 remove_diacritics 2', prefix='2 3');
            CREATE TRIGGER IF NOT EXISTS notes_search_insert AFTER INSERT ON notes BEGIN
                INSERT INTO notes_fts(rowid,id,title,body,tags,notebook) VALUES(new.rowid,new.id,json_extract(new.data,'$.title'),json_extract(new.data,'$.body'),json_extract(new.data,'$.tags'),json_extract(new.data,'$.notebook')); END;
            CREATE TRIGGER IF NOT EXISTS notes_search_delete AFTER DELETE ON notes BEGIN DELETE FROM notes_fts WHERE rowid=old.rowid; END;
            CREATE TRIGGER IF NOT EXISTS notes_search_update AFTER UPDATE ON notes BEGIN
                DELETE FROM notes_fts WHERE rowid=old.rowid;
                INSERT INTO notes_fts(rowid,id,title,body,tags,notebook) VALUES(new.rowid,new.id,json_extract(new.data,'$.title'),json_extract(new.data,'$.body'),json_extract(new.data,'$.tags'),json_extract(new.data,'$.notebook')); END;
            INSERT INTO notes_fts(rowid,id,title,body,tags,notebook)
                SELECT rowid,id,json_extract(data,'$.title'),json_extract(data,'$.body'),json_extract(data,'$.tags'),json_extract(data,'$.notebook') FROM notes
                WHERE NOT EXISTS(SELECT 1 FROM metadata WHERE key='fts-v1');
            INSERT OR IGNORE INTO metadata VALUES('fts-v1','1'); COMMIT;").map_err(err)
    }
    pub fn search(&self, options: &SearchOptions) -> Result<Vec<SearchHit>, String> {
        // Treat input as words, never as executable FTS syntax. Every token is a prefix.
        let query = options
            .query
            .split(|c: char| !c.is_alphanumeric())
            .filter(|s| !s.is_empty())
            .map(|s| format!("\"{}\"*", s.replace('"', "\"\"")))
            .collect::<Vec<_>>()
            .join(" AND ");
        if query.is_empty() {
            return Ok(vec![]);
        }
        let order = match options.sort.as_str() {
            "title" => "json_extract(n.data,'$.title') COLLATE NOCASE, n.id",
            "created" => "json_extract(n.data,'$.createdAt') DESC, n.id",
            "updated" => "json_extract(n.data,'$.updatedAt') DESC, n.id",
            _ => "bm25(notes_fts,0,5,1,2,1), json_extract(n.data,'$.updatedAt') DESC, n.id",
        };
        let sql = format!("SELECT n.id, snippet(notes_fts,2,char(1),char(2),'…',24), n.data FROM notes_fts JOIN notes n ON n.rowid=notes_fts.rowid
            WHERE notes_fts MATCH ?1 AND json_extract(n.data,'$.trashed')=?2
            AND (?3 IS NULL OR json_extract(n.data,'$.notebook')=?3 COLLATE NOCASE)
            AND (?4=0 OR json_extract(n.data,'$.starred')=1) ORDER BY {order}");
        let mut statement = self.connection.prepare(&sql).map_err(err)?;
        let rows = statement
            .query_map(
                params![query, options.trashed, options.notebook, options.starred],
                |r| {
                    Ok((
                        SearchHit {
                            id: r.get(0)?,
                            snippet: r.get(1)?,
                        },
                        r.get::<_, String>(2)?,
                    ))
                },
            )
            .map_err(err)?;
        let mut hits = Vec::new();
        for row in rows {
            let (hit, data) = row.map_err(err)?;
            if let Some(tag) = &options.tag {
                let note: Note = serde_json::from_str(&data).map_err(err)?;
                if !tags(&note.tags)
                    .iter()
                    .any(|t| t.to_lowercase() == tag.to_lowercase())
                {
                    continue;
                }
            }
            hits.push(hit);
        }
        Ok(hits)
    }
}
