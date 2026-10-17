//! Synthetic indexed-search workload; never opens the user's data.
use phosphor_store::{SearchOptions, Store};
use std::time::Instant;
fn main() {
    let directory =
        std::env::temp_dir().join(format!("phosphor-search-bench-{}", std::process::id()));
    std::fs::create_dir_all(&directory).unwrap();
    let path = directory.join("synthetic.sqlite3");
    let mut store = Store::open(&path).unwrap();
    let template = store.list().unwrap().remove(0);
    let start = Instant::now();
    for i in 0..10_000 {
        let mut note = template.clone();
        note.id = format!("bench-{i}");
        note.title = format!("Field report {i}");
        note.body = format!(
            "{} Unique marker constellation{i} with searchable engineering notes.",
            "A longer paragraph about a small quiet notebook and work in progress. ".repeat(28)
        );
        note.notebook = "Inbox".into();
        note.tags = "synthetic, benchmark".into();
        store.save(&note).unwrap();
    }
    let insert_ms = start.elapsed().as_secs_f64() * 1000.0;
    let mut samples = Vec::new();
    for _ in 0..30 {
        let start = Instant::now();
        let hits = store
            .search(&SearchOptions {
                query: "constellation9876".into(),
                ..Default::default()
            })
            .unwrap();
        assert_eq!(hits.len(), 1);
        samples.push(start.elapsed().as_secs_f64() * 1000.0);
    }
    samples.sort_by(f64::total_cmp);
    println!(
        "10,000 synthetic notes, ~19M body characters. SQLite FTS5 exact-prefix result + snippet."
    );
    println!(
        "Insertion total: {insert_ms:.2} ms; search p50: {:.3} ms, p95: {:.3} ms (30 samples).",
        samples[15], samples[28]
    );
    let start = Instant::now();
    store.auto_backup().unwrap();
    println!(
        "Initial snapshot: {:.2} ms",
        start.elapsed().as_secs_f64() * 1000.0
    );
    let start = Instant::now();
    store.auto_backup().unwrap();
    println!(
        "Not-due snapshot check: {:.4} ms",
        start.elapsed().as_secs_f64() * 1000.0
    );
    drop(store);
    std::fs::remove_dir_all(directory).unwrap();
}
