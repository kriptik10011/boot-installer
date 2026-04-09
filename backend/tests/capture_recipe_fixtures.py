"""
One-time fixture capture: fetch real recipe URLs and save as JSON.

Run from backend/:
    python tests/capture_recipe_fixtures.py                  # All URLs
    python tests/capture_recipe_fixtures.py --limit 20       # First 20
    python tests/capture_recipe_fixtures.py --skip-existing  # Only new
    python tests/capture_recipe_fixtures.py --url "https://..." # Single URL

Output: tests/fixtures/recipe_data/{NNN}_{site}_{slug}.json
"""

import argparse
import asyncio
import json
import re
import sys
import time
from datetime import date
from pathlib import Path
from urllib.parse import urlparse

# Add backend to sys.path for imports
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.services.recipe_scraper import scrape_recipe_url


FIXTURES_DIR = Path(__file__).resolve().parent / "fixtures" / "recipe_data"


def url_to_filename(index: int, url: str, site: str) -> str:
    """Generate deterministic filename from URL."""
    parsed = urlparse(url)
    slug = parsed.path.strip("/").replace("/", "_")
    slug = re.sub(r"[^a-zA-Z0-9_-]", "", slug)[:80]
    site_clean = site.replace(".", "_")
    return f"{index:03d}_{site_clean}_{slug}.json"


def extracted_to_dict(recipe, url: str, site: str, cuisine: str) -> dict:
    """Convert ExtractedRecipe to JSON-serializable dict."""
    ingredients = []
    for ing in (recipe.ingredients or []):
        qty = ing.quantity
        if qty is not None:
            qty = str(qty)
        ingredients.append({
            "name": ing.name,
            "quantity": qty,
            "unit": ing.unit,
            "notes": ing.notes,
        })

    return {
        "name": recipe.name,
        "instructions": recipe.instructions or "",
        "ingredients": ingredients,
        "servings": recipe.servings,
        "prep_time_minutes": recipe.prep_time_minutes,
        "cook_time_minutes": recipe.cook_time_minutes,
        "_meta": {
            "url": url,
            "site": site,
            "cuisine": cuisine,
            "captured_at": str(date.today()),
        },
    }


async def capture_single(index: int, url: str, site: str, cuisine: str,
                          skip_existing: bool = False) -> bool:
    """Fetch one URL and save fixture. Returns True on success."""
    FIXTURES_DIR.mkdir(parents=True, exist_ok=True)
    filename = url_to_filename(index, url, site)
    filepath = FIXTURES_DIR / filename

    if skip_existing and filepath.exists():
        return True

    try:
        result = await scrape_recipe_url(url)

        # Check if it's a successful extraction (ExtractedRecipe has .name)
        if not hasattr(result, "name") or not result.name:
            print(f"  SKIP [{index:03d}] {site}: No recipe extracted — {url}")
            return False

        data = extracted_to_dict(result, url, site, cuisine)

        if not data["ingredients"]:
            print(f"  SKIP [{index:03d}] {site}: No ingredients — {url}")
            return False

        filepath.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")
        print(f"  OK   [{index:03d}] {site}: {data['name']} ({len(data['ingredients'])} ingredients)")
        return True

    except Exception as e:
        print(f"  FAIL [{index:03d}] {site}: {type(e).__name__}: {e} — {url}")
        return False


async def capture_all(urls: list, skip_existing: bool = False):
    """Capture all URLs sequentially (respects rate limits)."""
    ok = 0
    fail = 0
    start = time.time()

    for i, (url, site, cuisine) in enumerate(urls):
        success = await capture_single(i, url, site, cuisine, skip_existing)
        if success:
            ok += 1
        else:
            fail += 1

    elapsed = time.time() - start
    print(f"\nDone: {ok} captured, {fail} failed, {elapsed:.0f}s elapsed")

    # Write index manifest
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
    print(f"Index: {len(index_data)} fixtures in {index_path}")


def main():
    parser = argparse.ArgumentParser(description="Capture recipe fixtures from URLs")
    parser.add_argument("--limit", type=int, default=0, help="Max URLs to process (0=all)")
    parser.add_argument("--skip-existing", action="store_true", help="Skip already-captured fixtures")
    parser.add_argument("--url", type=str, help="Capture a single URL")
    args = parser.parse_args()

    if args.url:
        success = asyncio.run(capture_single(999, args.url, "manual", "unknown"))
        sys.exit(0 if success else 1)

    from tests._recipe_urls import RECIPE_URLS

    urls = RECIPE_URLS
    if args.limit > 0:
        urls = urls[:args.limit]

    print(f"Capturing {len(urls)} recipe URLs...")
    asyncio.run(capture_all(urls, skip_existing=args.skip_existing))


if __name__ == "__main__":
    main()
