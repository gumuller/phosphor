# Initial footprint measurements

Measured on this Linux machine on 2026-10-17 with the four example notes, before the stronger configurable CRT bloom styling and Tiptap formatted editor were added. The current CRT treatment uses static text shadows, glass overlays and a canvas raster redrawn on resize, but its frame-rendering cost has not yet been benchmarked. These are observations, not large-library performance guarantees.

## Optimized release

Built with `npm run tauri -- build --no-bundle` using thin LTO and symbol stripping.

| Metric | Measured value |
| --- | --- |
| Executable | 13.70 MiB |
| Runtime processes | 3: app, WebKit network, WebKit content |
| Proportional resident memory (PSS), total | 279.61–282.65 MiB |
| Private resident memory, total | 193.99–197.07 MiB |
| Summed resident memory (RSS) | 521.36–523.76 MiB |
| Proportional swap | 0 MiB |

RSS double-counts shared pages. PSS apportions shared pages between processes and is a more useful attribution of resident memory.

The release used an isolated temporary application-data/config/cache directory. Samples were collected 8, 11 and 14 seconds after launch. The existing debug app remained open, so shared pages were apportioned between instances: this is not an isolated single-instance baseline or an exact debug-versus-release comparison. Window visibility, caches, GPU allocations and WebKit behavior affect the results. PSS does not include every kernel/GPU allocation. No automated UI interaction was available during the measurement.

The temporary release instance was stopped afterwards; the original app and its notes were left running and unchanged.

## Debug reference

The existing debug executable is approximately 253 MiB on disk. Before release compilation, its three processes used approximately 369–372 MiB PSS and 534–538 MiB summed RSS. During compilation, some memory moved into swap; resident-only measurements then fell. A separate 10-second idle sample recorded no CPU tick increase for the debug app and its helpers at the available sampling resolution. Release typing/CPU and large-library benchmarks have not been performed.

## Interpretation

The release is a compiled, dynamically linked x86-64 Rust ELF executable with embedded frontend assets. No Node.js/Vite server is required. System GTK/WebKitGTK libraries render the Svelte/CodeMirror interface; this is not a fully Rust-rendered UI. A small executable does not imply small runtime memory use.

This footprint is too high to claim a very lightweight notebook. If a budget such as less than 100 MiB idle memory is desired, validate it with a Rust-rendered UI prototype. Compiler optimization alone does not remove WebKit's memory cost. The Rust/SQLite storage crate can be retained; changing renderers needs a fresh assessment of web/mobile UI sharing.

## Reproduce on Linux

```bash
./target/release/phosphor
pgrep -x phosphor
python3 scripts/measure-memory.py MAIN_PID --samples 3 --interval 3
```

Select the main PID for the intended instance. The script reads `/proc` counters and includes descendants, excluding unrelated browser, preview-server and build processes. Compare matching datasets, visibility and idle time. Prefer closing other instances after saving work.

The Vite development watcher now ignores Rust source/build directories so Rust compilation does not trigger unrelated frontend file watching. This helps development tooling; it does not reduce the release app's webview footprint.

## Editor polish workload measurements

The checked-in `benchmarks/results/after.json` records an isolated synthetic workload run after editor polish. Run `npm run bench` to reproduce without reading or writing your real notes. Vitest/jsdom measures application logic and DOM construction, not a native browser's layout, paint, input latency, GPU work, startup, or SQLite persistence.

| Workload | Latest result |
| --- | --- |
| Library | 10,000 notes; 18,696,000 body characters |
| Cold indexed search | 22.54 ms |
| Warm cached search, p50 / p95 | 8.37 / 8.76 ms |
| Uncached search reference in the same run, p50 / p95 | 14.02 / 15.29 ms |
| Mounted note cards, 700 px test viewport | 10 |
| Note-list DOM mount in jsdom | 31.29 ms |
| Long note | 95,888 Markdown characters |
| Long-note editor creation | 77.63 ms |
| Editor insertion plus Markdown serialization, p50 / p95 | 4.85 / 9.10 ms |

Each timing distribution contains 30 samples. Search caching does more work up front and retains normalized note text; it trades some memory for repeated-search speed. The uncached reference uses the previous full-text concatenation/lowercasing behavior on the same corpus. Measurements are indicative, ordered within one process, and subject to runtime caches/GC. `before.json` is an earlier run with a different test runner concurrency context; prefer the same-run reference over treating the two files as a controlled end-to-end comparison.

The list test confirms rendering remains bounded and keyboard navigation reaches note 10,000. It does not establish a native frame-rate guarantee. Native startup and input-to-paint remain to be measured with an appropriate UI surface.

## v0.2 native SQLite search

The default desktop search now uses a persistent FTS5 index, maintained by SQLite triggers in the same transactions as note edits, organization changes and restore. The old cached JavaScript search figures above describe the earlier implementation, not the new native path. All notes still load into frontend memory; indexing does not yet make startup/library memory independent of library size.

Reproduce the isolated workload with `cargo run --release -p phosphor-store --example search_bench`. On this machine (2026-10-17), 10,000 synthetic notes with approximately 19 million body characters took 865.47 ms to insert. Thirty warm searches for one unique prefix, returning the result and highlighted snippet, measured 0.038 ms p50 / 0.070 ms p95. The first full snapshot took 70.60 ms; a not-due automatic-backup check took 0.0002 ms. These are Rust/SQLite logic measurements on a synthetic corpus, excluding IPC, UI debounce (100 ms), painting and disk-failure conditions. Common terms returning thousands of results require more work than this selective query.

Database operations run on Tauri's blocking worker pool rather than its UI thread. The backup timer uses a cheap in-memory cadence check, reads only the most recent valid automatic snapshot when due, and skips unchanged workspaces. Native WebDriver E2E exercises the optimized executable and real SQLite, but is a correctness check, not an input-to-paint performance benchmark.
