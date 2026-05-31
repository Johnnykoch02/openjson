#!/usr/bin/env bash
# Quick benchmark: parse + schema infer + record diff on a large JSON file
set -euo pipefail
source "$HOME/.cargo/env"
cd "$(dirname "$0")/.."

FILE="${1:-../joby-job-scraping/tmp/Ashby_jobs_Meta-Llama-8b.json}"
FILE2="${2:-$FILE}"

echo "Benchmarking with: $FILE"
/usr/bin/time -f 'parse+schema: %e sec' cargo run -q -p json-vis --bin bench 2>/dev/null || \
python3 - <<'PY'
import json, time, sys
path = sys.argv[1] if len(sys.argv) > 1 else "/home/blazekin/dev/jolbyai/joby-job-scraping/tmp/Ashby_jobs_Meta-Llama-8b.json"
start = time.perf_counter()
with open(path) as f:
    data = json.load(f)
print(f"records: {len(data) if isinstance(data, list) else 1}")
print(f"parse (python): {time.perf_counter()-start:.3f}s")
PY "$FILE"
