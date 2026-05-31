# OpenJSON

Free, open-source JSON visualization and data quality tool — built for large datasets.

Inspired by [JSON Crack](https://github.com/AykutSarac/jsoncrack.com) and [ToDiagram](https://todiagram.com/editor), but designed from the ground up for **performance**, **multi-file comparison**, and **implicit schema inference** without paywalls or upload limits.

## Why this stack

| Layer | Choice | Reason |
|-------|--------|--------|
| Core engine | **Rust** (`json-vis-core`) | SIMD JSON parsing, schema inference, diffs — data stays out of the JS heap |
| Desktop shell | **Tauri 2** | ~15–40 MB installers vs 150+ MB Electron; native file I/O |
| UI | **React + React Flow** | Interactive graph, familiar web UX |
| Web preview | **Vite + browser fallback** | Same UI works in browser for smaller files during development |

JSON Crack is excellent but pure TypeScript in the browser — large files hit memory and IPC limits quickly. OpenJSON keeps parsed documents in Rust and only sends **view slices** (graph nodes, schema summaries, diff results) to the UI.

## Features

- **Graph visualization** — interactive node graph with auto dagre layout and **lazy expansion** (click `+` to fetch a subtree from Rust, one level at a time — handles deeply nested LLM outputs without rendering everything)
- **Implicit schema inference** — field types, nullability, per-field coverage bars, sample values
- **JSONPath query panel** — extract and inspect any slice: `$[*].field`, `$..salary`, wildcards, negative indices, with a live result type breakdown
- **LLM output comparison** — the headline feature:
  - **Overall agreement gauge** across all shared records
  - **Field agreement scorecard** — for every field path, what % of records did the two model runs produce identical values (most divergent first)
  - **Schema diff** — fields only in A / only in B / type & coverage shifts
  - **Record explorer** — filterable, searchable per-record side-by-side value diffs
- **Multi-format input** — JSON, JSONL, NDJSON (with auto-detection)
- **Drag & drop** multi-file workspace
- **100% local** — no uploads, no accounts, no limits, no cost

## Quick start

### Browser mode (no Rust system deps)

```bash
cd json-vis
npm install
npm run dev
```

Open http://localhost:1420 — works for development and moderate file sizes.

### Desktop app (recommended for large files)

**Prerequisites:** [Tauri prerequisites](https://tauri.app/start/prerequisites/) for your OS.

```bash
cd json-vis
npm install
npm run tauri:dev      # development
npm run tauri:build    # release binaries for distribution
```

Release artifacts land in `src-tauri/target/release/bundle/`.

### Benchmark the Rust core

```bash
cargo run -p json-vis-core --bin json-vis-bench -- /path/to/large.json
```

## Project layout

```
json-vis/
├── crates/json-vis-core/   # Rust: parse, schema, graph, diff
├── src/                    # React UI
├── src-tauri/              # Tauri commands + document store
└── scripts/
```

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│  React UI (graph · schema · compare)                    │
│  Only receives: GraphSnapshot, InferredSchema, diffs    │
└───────────────────────────┬─────────────────────────────┘
                            │ Tauri IPC (small payloads)
┌───────────────────────────▼─────────────────────────────┐
│  json-vis-core (Rust)                                   │
│  · simd-json parse                                      │
│  · schema inference across N records                    │
│  · lazy graph builder (max nodes cap)                   │
│  · schema + record diff                                 │
└───────────────────────────┬─────────────────────────────┘
                            │
                   DocumentStore (in-memory)
                   Full JSON never copied to JS
```

## LLM comparison workflow

1. Run the same extraction task through two models → save each as JSON (e.g. `Ashby_jobs_Meta-Llama-8b.json` vs `Ashby_jobs_gpt.json`)
2. Drop both files in
3. Switch to **Compare**, pick model **A** and **B**, hit **Compare**
4. Read the scorecard:
   - **Overall agreement** — headline quality signal
   - **Field agreement** — e.g. "models agree 96% on `job_title` but only 41% on `salary`" → that's where to focus eval
   - **Record explorer** — drill into specific records keyed by `platform_job_id`

Field agreement is computed leaf-by-leaf in Rust across every shared record, so it stays fast even on large outputs.

## JSONPath query syntax

| Pattern | Meaning |
|---------|---------|
| `$[*]` | every top-level item |
| `$[*].field` | one field across all records (column extract) |
| `$..field` | recursive descent — find `field` at any depth |
| `$[0]` / `$[-1]` | first / last array item |
| `$['key with spaces']` | quoted key |
| `a.b[2].c` | mixed path |

## Roadmap

- [x] Lazy graph expansion (click node → fetch subtree from Rust)
- [x] JSONL / NDJSON input support
- [x] JSONPath query panel
- [x] Field-level LLM agreement scorecard
- [x] GitHub Actions release builds (Linux, macOS, Windows)
- [ ] Streaming parse for GB-scale files (chunked NDJSON)
- [ ] WASM build of `json-vis-core` for a fully static web deploy
- [ ] Export schema as JSON Schema / TypeScript types
- [ ] N-way comparison (more than two models at once)

## Support

OpenJSON is free and always will be — no paywalls, no accounts, no upload limits. If it saves you time, you can support development here:

☕ **[Buy me a coffee](https://buymeacoffee.com/johnnykoch0)**

## License

**GNU AGPL-3.0-or-later.** You may download, use, study, and modify OpenJSON for any purpose (including at work) at no cost. However:

- If you distribute it or run a **modified** version as a network service, you must release your source under the same AGPL license.
- This intentionally **prevents anyone from taking it closed-source or reselling it** as a proprietary product.

In short: free for everyone to use and improve, and it stays that way. See [`LICENSE`](./LICENSE) for the full text.

## Publishing

### Desktop binaries
Tag a release (`git tag v0.1.0 && git push --tags`) and the [`release`](.github/workflows/release.yml) workflow builds signed installers for **Windows (x64)**, **macOS (universal)**, and **Ubuntu/Linux** via `tauri-action`, attaching them to a GitHub Release.

### Landing page (GitHub Pages)
A ready-made software landing page lives in [`docs/`](./docs/index.html). It auto-fetches the latest release and shows download buttons per platform plus the donation link.

To publish it:
1. Push to GitHub, then **Settings → Pages → Source: GitHub Actions** (the [`pages`](.github/workflows/pages.yml) workflow deploys `docs/`).
2. Edit the `REPO` constant near the bottom of `docs/index.html` to your `owner/repo` so the download buttons resolve.

No backend required — everything (app and site) runs client-side.
