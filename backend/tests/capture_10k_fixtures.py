"""
Fast concurrent fixture capture for 10K recipe stress test.

Uses shared httpx.AsyncClient with connection pooling + recipe_scrapers.scrape_html()
for maximum throughput. Bypasses the full scraper pipeline (no per-request client creation).

Run from backend/:
    python tests/capture_10k_fixtures.py                     # Full 10K capture
    python tests/capture_10k_fixtures.py --target 500        # Just 500
    python tests/capture_10k_fixtures.py --concurrency 150   # 150 parallel

Output: tests/fixtures/recipe_data/{NNN}_{site}_{slug}.json
"""

import argparse
import asyncio
import json
import logging
import random
import re
import sys
import time
from datetime import date
from pathlib import Path
from urllib.parse import urlparse

# Suppress ALL logging below ERROR
logging.disable(logging.WARNING)

# Add backend to sys.path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

FIXTURES_DIR = Path(__file__).resolve().parent / "fixtures" / "recipe_data"


def generate_food_com_urls(count: int, existing_ids: set) -> list:
    """Generate food.com URLs from recipe ID ranges, avoiding duplicates. Fast."""
    target = int(count * 1.5)
    ranges = [
        (1000, 15000, 0.12),
        (15000, 50000, 0.18),
        (50000, 100000, 0.15),
        (100000, 200000, 0.15),
        (200000, 300000, 0.15),
        (300000, 400000, 0.13),
        (400000, 530000, 0.12),
    ]

    candidate_ids = set()
    for start, end, weight in ranges:
        n = int(target * weight)
        # Use random.sample on range object (fast, no list creation)
        sample_size = min(n * 2, end - start)
        ids = set(random.sample(range(start, end), sample_size))
        ids -= existing_ids
        candidate_ids.update(list(ids)[:n])

    candidate_list = list(candidate_ids - existing_ids)[:target]
    random.shuffle(candidate_list)

    return [
        (f"https://www.food.com/recipe/recipe-{rid}", "food.com", "mixed")
        for rid in candidate_list
    ]


def url_to_filename(url: str, site: str) -> str:
    """Deterministic filename from URL — uses recipe ID for food.com, slug for others."""
    parsed = urlparse(url)
    slug = parsed.path.strip("/").replace("/", "_")
    slug = re.sub(r"[^a-zA-Z0-9_-]", "", slug)[:80]
    site_clean = site.replace(".", "_")
    # Extract recipe ID for deterministic naming
    match = re.search(r'-(\d+)$', url.rstrip('/'))
    if match and "food.com" in url:
        return f"fc_{match.group(1)}.json"
    return f"{site_clean}_{slug}.json"


class FastCapture:
    """High-throughput recipe fixture capture using shared HTTP client."""

    def __init__(self, concurrency: int = 100):
        self.concurrency = concurrency
        self.ok = 0
        self.fail = 0
        self.skip = 0
        self._lock = asyncio.Lock()
        self.start_time = None

    async def capture_all(self, urls: list, skip_existing: bool = True):
        import httpx

        self.start_time = time.time()
        sem = asyncio.Semaphore(self.concurrency)

        # Shared client with connection pooling
        limits = httpx.Limits(
            max_connections=self.concurrency + 20,
            max_keepalive_connections=self.concurrency,
        )
        timeout = httpx.Timeout(30.0, connect=10.0)

        async with httpx.AsyncClient(
            follow_redirects=True,
            timeout=timeout,
            limits=limits,
            headers={"User-Agent": "Mozilla/5.0 (compatible; RecipeBot/1.0)"},
        ) as client:
            tasks = [
                self._capture_one(sem, client, i, url, site, cuisine, skip_existing)
                for i, (url, site, cuisine) in enumerate(urls)
            ]
            await asyncio.gather(*tasks)

        elapsed = time.time() - self.start_time
        total = self.ok + self.fail + self.skip
        rate = (self.ok + self.fail) / max(elapsed, 1)
        print(f"\nDone: {self.ok} captured, {self.fail} failed, "
              f"{self.skip} skipped — {rate:.1f} req/s — {elapsed:.0f}s")

    async def _capture_one(self, sem, client, index, url, site, cuisine, skip_existing):
        FIXTURES_DIR.mkdir(parents=True, exist_ok=True)
        filename = url_to_filename(url, site)
        filepath = FIXTURES_DIR / filename

        if skip_existing and filepath.exists():
            async with self._lock:
                self.skip += 1
            return

        async with sem:
            try:
                resp = await client.get(url)
                if resp.status_code != 200:
                    async with self._lock:
                        self.fail += 1
                        if self.fail <= 10:
                            print(f"  HTTP {resp.status_code}: {url}")
                    return

                html = resp.text
                final_url = str(resp.url)

                # Use recipe_scrapers to parse HTML directly (no extra HTTP request)
                data = self._parse_recipe(html, final_url, site, cuisine)
                if not data:
                    async with self._lock:
                        self.fail += 1
                        if self.fail <= 10:
                            print(f"  PARSE FAIL: {url} (html={len(html)} chars)")
                    return

                filepath.write_text(
                    json.dumps(data, indent=2, ensure_ascii=False),
                    encoding="utf-8",
                )
                async with self._lock:
                    self.ok += 1
                    if self.ok % 200 == 0:
                        elapsed = time.time() - self.start_time
                        rate = (self.ok + self.fail) / max(elapsed, 1)
                        print(f"  Progress: {self.ok} ok / {self.fail} fail — "
                              f"{rate:.1f} req/s — {elapsed:.0f}s")

            except Exception as e:
                async with self._lock:
                    self.fail += 1
                    if self.fail <= 5:
                        print(f"  ERROR [{index}]: {type(e).__name__}: {e} — {url}")

    def _parse_recipe(self, html: str, url: str, site: str, cuisine: str) -> dict | None:
        """Parse recipe from HTML using recipe_scrapers library."""
        try:
            from recipe_scrapers import scrape_html

            scraper = scrape_html(html, org_url=url)
            title = scraper.title()
            if not title:
                return None

            raw_ingredients = scraper.ingredients()
            if not raw_ingredients:
                return None

            # Parse each ingredient line using our parser
            from app.services.recipe_scraper import parse_ingredient_line

            ingredients = []
            for line in raw_ingredients:
                parsed = parse_ingredient_line(line)
                # parse_ingredient_line returns ExtractedIngredient namedtuple-like object
                qty = getattr(parsed, 'quantity', None)
                if qty is not None:
                    qty = str(qty)
                ingredients.append({
                    "name": getattr(parsed, 'name', line) or line,
                    "quantity": qty,
                    "unit": getattr(parsed, 'unit', None),
                    "notes": getattr(parsed, 'notes', None),
                })

            if not ingredients:
                return None

            # Extract times safely
            try:
                prep_time = scraper.prep_time()
            except Exception:
                prep_time = None
            try:
                cook_time = scraper.cook_time()
            except Exception:
                cook_time = None
            try:
                servings_str = scraper.yields()
                servings = int(re.search(r'\d+', servings_str or "4").group()) if servings_str else 4
            except Exception:
                servings = 4
            try:
                instructions = scraper.instructions()
            except Exception:
                instructions = ""

            return {
                "name": title,
                "instructions": instructions or "",
                "ingredients": ingredients,
                "servings": servings,
                "prep_time_minutes": prep_time,
                "cook_time_minutes": cook_time,
                "_meta": {
                    "url": url,
                    "site": site,
                    "cuisine": cuisine,
                    "captured_at": str(date.today()),
                },
            }
        except Exception as e:
            if not hasattr(self, '_parse_err_count'):
                self._parse_err_count = 0
            self._parse_err_count += 1
            if self._parse_err_count <= 5:
                import traceback
                print(f"  PARSE EXCEPTION: {type(e).__name__}: {e}")
                traceback.print_exc()
            return None


def get_existing_food_ids() -> set:
    """Get food.com recipe IDs already captured as fixtures."""
    ids = set()
    if not FIXTURES_DIR.exists():
        return ids
    for f in FIXTURES_DIR.glob("*.json"):
        if f.name == "_index.json":
            continue
        try:
            data = json.loads(f.read_text(encoding="utf-8"))
            url = data.get("_meta", {}).get("url", "")
            if "food.com" in url:
                match = re.search(r'-(\d+)$', url.rstrip('/'))
                if match:
                    ids.add(int(match.group(1)))
        except Exception:
            pass
    return ids


def write_index():
    index_data = []
    for f in sorted(FIXTURES_DIR.glob("*.json")):
        if f.name == "_index.json":
            continue
        try:
            data = json.loads(f.read_text(encoding="utf-8"))
            index_data.append({
                "file": f.name,
                "name": data.get("name", ""),
                "site": data.get("_meta", {}).get("site", ""),
                "ingredients": len(data.get("ingredients", [])),
            })
        except Exception:
            pass
    index_path = FIXTURES_DIR / "_index.json"
    index_path.write_text(json.dumps(index_data, indent=2), encoding="utf-8")
    print(f"Index: {len(index_data)} total fixtures")
    return len(index_data)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--target", type=int, default=10000)
    parser.add_argument("--concurrency", type=int, default=100)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    FIXTURES_DIR.mkdir(parents=True, exist_ok=True)
    existing_count = len([f for f in FIXTURES_DIR.glob("*.json") if f.name != "_index.json"])
    existing_food_ids = get_existing_food_ids()

    print(f"Existing: {existing_count} | Target: {args.target} | Need: {max(0, args.target - existing_count)}")

    needed = max(0, args.target - existing_count)
    if needed == 0:
        print(f"Already at target!")
        write_index()
        return

    random.seed(42)
    urls = generate_food_com_urls(needed, existing_food_ids)
    print(f"Generated {len(urls)} candidate URLs (concurrency={args.concurrency})")

    if args.dry_run:
        return

    # Run capture rounds until we hit target
    for round_num in range(1, 6):
        print(f"\n=== Round {round_num} ===")
        capturer = FastCapture(concurrency=args.concurrency)
        asyncio.run(capturer.capture_all(urls, skip_existing=True))

        current = len([f for f in FIXTURES_DIR.glob("*.json") if f.name != "_index.json"])
        remaining = args.target - current
        print(f"Current: {current} | Remaining: {remaining}")

        if remaining <= 0:
            break

        # Generate more URLs for next round
        existing_food_ids = get_existing_food_ids()
        random.seed(42 + round_num * 10000)
        urls = generate_food_com_urls(remaining, existing_food_ids)
        print(f"Generated {len(urls)} more candidate URLs")

    final = write_index()
    print(f"\nFINAL: {final} fixtures ({'PASS' if final >= args.target else 'NEED MORE'})")


if __name__ == "__main__":
    main()
