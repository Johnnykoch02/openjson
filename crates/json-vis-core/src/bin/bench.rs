use json_vis_core::{build_graph, diff_records, infer_schema, ParsedDocument};
use std::env;
use std::time::Instant;

fn main() {
    let path = env::args()
        .nth(1)
        .unwrap_or_else(|| "../joby-job-scraping/tmp/Ashby_jobs_Meta-Llama-8b.json".to_string());

    let bytes = std::fs::read(&path).expect("read file");
    let size = bytes.len();

    let start = Instant::now();
    let doc = ParsedDocument::parse("bench".into(), "bench.json".into(), bytes).expect("parse");
    let parse_ms = start.elapsed().as_secs_f64() * 1000.0;

    let start = Instant::now();
    let _schema = infer_schema(&doc.value, size as u64);
    let schema_ms = start.elapsed().as_secs_f64() * 1000.0;

    let start = Instant::now();
    let _graph = build_graph(&doc.value, 250, 2);
    let graph_ms = start.elapsed().as_secs_f64() * 1000.0;

    let start = Instant::now();
    let _diff = diff_records(&doc.value, &doc.value, None, 500).expect("diff");
    let diff_ms = start.elapsed().as_secs_f64() * 1000.0;

    println!("file: {path}");
    println!("size: {:.1} MB", size as f64 / 1024.0 / 1024.0);
    println!("records: {}", doc.schema.record_count);
    println!("fields: {}", doc.schema.top_level_keys.len());
    println!("parse (simd-json): {parse_ms:.1} ms");
    println!("schema infer: {schema_ms:.1} ms");
    println!("graph (250 nodes): {graph_ms:.1} ms");
    println!("record diff (self): {diff_ms:.1} ms");
}
