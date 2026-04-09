"""
10K+ Recipe Pipeline Stress Test — Single-Launch Orchestrator.

Splits ALL fixtures across N workers (one launch, no batches).
Each worker processes its share through the 11-stage pipeline.

Usage:
    cd backend
    python tests/run_stress_test.py                  # All fixtures, 4 workers
    python tests/run_stress_test.py --workers 4      # Override workers
    python tests/run_stress_test.py --limit 500      # First 500 only
    python tests/run_stress_test.py --report          # Write JSON report
"""

import json
import sys
import time
import argparse
import tempfile
import subprocess
from pathlib import Path

FIXTURES_DIR = Path(__file__).resolve().parent / "fixtures" / "recipe_data"
CHUNK_WORKER = str(Path(__file__).resolve().parent / "_chunk_worker.py")
BACKEND_DIR = str(Path(__file__).resolve().parent.parent)
MAX_WORKERS = 4


def load_fixture_paths(limit=None):
    paths = sorted([str(f) for f in FIXTURES_DIR.glob("*.json")
                    if not f.name.startswith("_")])
    if limit:
        paths = paths[:limit]
    return paths


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--workers", type=int, default=MAX_WORKERS)
    parser.add_argument("--limit", type=int, default=0)
    parser.add_argument("--report", action="store_true")
    args = parser.parse_args()

    num_workers = args.workers
    all_paths = load_fixture_paths(args.limit or None)
    total = len(all_paths)

    if total == 0:
        print("No fixtures found.", flush=True)
        sys.exit(1)

    temp_dir = Path(tempfile.mkdtemp())
    chunk_size = (total + num_workers - 1) // num_workers

    print(f"{'='*70}", flush=True)
    print(f"  10K+ Recipe Pipeline Stress Test", flush=True)
    print(f"  {total} recipes | {num_workers} workers | 11 stages each", flush=True)
    print(f"  ~{chunk_size} recipes per worker (single launch)", flush=True)
    print(f"{'='*70}", flush=True)

    # Launch ALL workers at once
    procs = []
    stderr_files = []
    for wid in range(num_workers):
        s = wid * chunk_size
        e = min(s + chunk_size, total)
        if s >= total:
            break
        wp = all_paths[s:e]
        pf = str(temp_dir / f"paths_{wid}.json")
        of = str(temp_dir / f"result_{wid}.json")
        ef = str(temp_dir / f"stderr_{wid}.txt")
        Path(pf).write_text(json.dumps(wp), encoding="utf-8")
        stderr_fh = open(ef, "w", encoding="utf-8")
        proc = subprocess.Popen(
            [sys.executable, CHUNK_WORKER, pf, of],
            stdout=subprocess.DEVNULL,
            stderr=stderr_fh,
            cwd=BACKEND_DIR,
        )
        stderr_fh.close()  # Close immediately so handle is not inherited
        procs.append((proc, wid, of, ef, len(wp)))

    actual_workers = len(procs)
    start = time.time()
    print(f"  Launched {actual_workers} workers at {time.strftime('%H:%M:%S')}",
          flush=True)

    # Poll workers with heartbeat (prevents parent from being killed by
    # process managers that interpret silence as completion)
    done = set()
    while len(done) < len(procs):
        time.sleep(10)
        elapsed = time.time() - start
        for proc, wid, of, ef, cnt in procs:
            if wid not in done and proc.poll() is not None:
                done.add(wid)
                if proc.returncode == 0:
                    print(f"  Worker {wid} done ({cnt} recipes) | "
                          f"exit=0 | {elapsed:.0f}s", flush=True)
                else:
                    # Read last 3 lines of stderr for diagnostics
                    err_tail = ""
                    try:
                        err_tail = Path(ef).read_text(encoding="utf-8").strip()
                        err_tail = "\n".join(err_tail.split("\n")[-3:])
                    except Exception:
                        pass
                    print(f"  Worker {wid} FAILED ({cnt} recipes) | "
                          f"exit={proc.returncode} | {elapsed:.0f}s", flush=True)
                    if err_tail:
                        print(f"    {err_tail[:300]}", flush=True)
        if len(done) < len(procs):
            pct = len(done) / len(procs) * 100
            print(f"  [{pct:5.1f}%] {len(done)}/{len(procs)} workers done | "
                  f"{elapsed:.0f}s elapsed", flush=True)

    elapsed = time.time() - start

    # Collect results
    passed = failed = skipped = errors = 0
    failures = []
    stage_counts = {}
    worker_stats = []

    for proc, wid, of, ef, cnt in procs:
        w_pass = w_fail = w_skip = w_err = 0
        try:
            data = json.loads(Path(of).read_text(encoding="utf-8"))
            for status, tid, err, stage in data:
                if status == "PASS":
                    passed += 1
                    w_pass += 1
                elif status == "FAIL":
                    failed += 1
                    w_fail += 1
                    failures.append({"id": tid, "error": err, "stage": stage})
                    stage_counts[stage] = stage_counts.get(stage, 0) + 1
                elif status == "SKIP":
                    skipped += 1
                    w_skip += 1
                else:
                    errors += 1
                    w_err += 1
                    failures.append({"id": tid, "error": err, "stage": "exception"})
        except Exception:
            w_err = cnt
            errors += cnt
        worker_stats.append({
            "worker": wid, "total": cnt,
            "passed": w_pass, "failed": w_fail,
            "skipped": w_skip, "errors": w_err,
        })

    rate = total / max(elapsed, 0.1)
    pass_rate = passed / max(total, 1) * 100

    print(f"\n{'='*70}", flush=True)
    print(f"  RESULTS", flush=True)
    print(f"{'='*70}", flush=True)
    print(f"  Total:   {total}", flush=True)
    print(f"  Passed:  {passed} ({pass_rate:.1f}%)", flush=True)
    print(f"  Failed:  {failed} ({failed/max(total,1)*100:.1f}%)", flush=True)
    print(f"  Skipped: {skipped}", flush=True)
    print(f"  Errors:  {errors}", flush=True)
    print(f"  Time:    {elapsed:.1f}s ({rate:.0f} recipes/s)", flush=True)
    print(f"  Workers: {actual_workers}", flush=True)

    print(f"\n  Per-worker breakdown:", flush=True)
    for ws in worker_stats:
        wr = ws["passed"] / max(ws["total"], 1) * 100
        print(f"    Worker {ws['worker']}: {ws['passed']}/{ws['total']} "
              f"({wr:.1f}%) | fail={ws['failed']} skip={ws['skipped']} "
              f"err={ws['errors']}", flush=True)

    if failures:
        print(f"\n  Failures by stage:", flush=True)
        for s, c in sorted(stage_counts.items(), key=lambda x: -x[1]):
            print(f"    {s:20s} {c}", flush=True)
        print(f"\n  First 50 failures:", flush=True)
        for f in failures[:50]:
            print(f"    [{f['stage']}] {f['id']}: {f['error'][:120]}", flush=True)

    if args.report:
        report = {
            "total": total,
            "passed": passed,
            "failed": failed,
            "skipped": skipped,
            "errors": errors,
            "elapsed_seconds": round(elapsed, 1),
            "rate_per_second": round(rate, 1),
            "workers": actual_workers,
            "recipes_per_worker": chunk_size,
            "pass_rate": round(pass_rate, 2),
            "worker_stats": worker_stats,
            "failures": failures,
            "stage_failure_counts": stage_counts,
        }
        rp = Path(__file__).resolve().parent / "stress_test_report.json"
        rp.write_text(json.dumps(report, indent=2), encoding="utf-8")
        print(f"\n  Report: {rp}", flush=True)

    print(f"{'='*70}", flush=True)

    import shutil
    shutil.rmtree(temp_dir, ignore_errors=True)
    sys.exit(0 if pass_rate >= 99 else 1)


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        import traceback
        print(f"\n  ORCHESTRATOR CRASHED: {e}", flush=True)
        traceback.print_exc()
        sys.exit(99)
