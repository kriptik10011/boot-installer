"""
Recipe Scraper Service

Extracts recipe data from URLs using the recipe-scrapers library with
fallback to generic HTML parsing.

Supported sites (via recipe-scrapers):
- AllRecipes, Food Network, Epicurious, BBC Good Food, Serious Eats
- NYTimes Cooking, Bon Appetit, Delish, Taste of Home, and 100+ more

Fallback strategy:
1. Try recipe-scrapers library (100+ sites)
2. Try generic HTML parsing (schema.org, common patterns)
3. Return AI extraction prompt format
"""

import re
import os
import ipaddress
import socket
import httpx
import logging
from logging.handlers import RotatingFileHandler
from dataclasses import dataclass, field
from typing import List, Optional, Tuple
from urllib.parse import urlparse
from pathlib import Path
from platformdirs import user_data_dir

# Set up file logging for debugging
def setup_logger():
    """Set up file logger for recipe scraper diagnostics."""
    log_dir = Path(user_data_dir("WeeklyReview", False))
    log_dir.mkdir(parents=True, exist_ok=True)
    log_file = log_dir / "recipe_scraper.log"

    logger = logging.getLogger("weekly_review.recipe_scraper")
    log_level = os.environ.get("WEEKLY_REVIEW_LOG_LEVEL", "INFO").upper()
    logger.setLevel(getattr(logging, log_level, logging.INFO))

    # Clear existing handlers
    if logger.handlers:
        logger.handlers.clear()

    # File handler - detailed logs with rotation (5 MB max, 3 backups)
    fh = RotatingFileHandler(
        log_file, maxBytes=5*1024*1024, backupCount=3, encoding='utf-8'
    )
    fh.setLevel(logging.DEBUG)
    fh.setFormatter(logging.Formatter(
        '%(asctime)s - %(levelname)s - %(message)s'
    ))
    logger.addHandler(fh)

    return logger

log = setup_logger()


# recipe-scrapers library — works in both dev and PyInstaller bundle
# PyInstaller spec includes collect_submodules('recipe_scrapers') for all 561 site scrapers
scrape_html = None
WebsiteNotImplementedError = Exception
SCRAPERS_AVAILABLE = False

try:
    from recipe_scrapers import scrape_html
    from recipe_scrapers._exceptions import WebsiteNotImplementedError
    SCRAPERS_AVAILABLE = True
    log.info("recipe-scrapers library loaded successfully")
except ImportError as e:
    log.error("Failed to import recipe_scrapers: %s", e)

BeautifulSoup = None
BS4_AVAILABLE = False

try:
    from bs4 import BeautifulSoup
    BS4_AVAILABLE = True
except ImportError:
    log.error("Failed to import beautifulsoup4")


def _ensure_scrapers() -> bool:
    """Lazy retry of recipe-scrapers import. Self-heals if installed after server start."""
    global SCRAPERS_AVAILABLE, scrape_html, WebsiteNotImplementedError
    if SCRAPERS_AVAILABLE:
        return True
    try:
        from recipe_scrapers import scrape_html as _sh
        from recipe_scrapers._exceptions import WebsiteNotImplementedError as _wnie
        scrape_html = _sh
        WebsiteNotImplementedError = _wnie
        SCRAPERS_AVAILABLE = True
        log.info("recipe-scrapers loaded on retry")
        return True
    except ImportError:
        return False


def _ensure_bs4() -> bool:
    """Lazy retry of bs4 import. Self-heals if installed after server start."""
    global BS4_AVAILABLE, BeautifulSoup
    if BS4_AVAILABLE:
        return True
    try:
        from bs4 import BeautifulSoup as _bs
        BeautifulSoup = _bs
        BS4_AVAILABLE = True
        log.info("BeautifulSoup loaded on retry")
        return True
    except ImportError:
        return False


from app.services.parsing.food_item_parser import (
    ExtractedIngredient,
    parse_ingredient_line,
)


@dataclass
class ExtractedRecipe:
    """Structured recipe data extracted from a URL."""
    name: str
    instructions: str
    ingredients: List[ExtractedIngredient] = field(default_factory=list)
    prep_time_minutes: Optional[int] = None
    cook_time_minutes: Optional[int] = None
    total_time_minutes: Optional[int] = None
    servings: Optional[int] = None
    source_url: str = ""
    source_site: str = ""
    image_url: Optional[str] = None
    cuisine_type: Optional[str] = None
    notes: Optional[str] = None
    confidence: float = 1.0
    extraction_method: str = "recipe-scrapers"


@dataclass
class FallbackResponse:
    """Response when extraction fails, includes AI prompt."""
    success: bool = False
    error_message: str = ""
    ai_prompt: str = ""
    source_url: str = ""


def parse_time_string(time_str) -> Optional[int]:
    """Parse a time string like '30 minutes' or 'PT30M' to minutes.

    Also handles integer values (already in minutes).
    """
    if time_str is None:
        return None

    # If already an integer, return it directly
    if isinstance(time_str, int):
        return time_str if time_str > 0 else None

    if not time_str:
        return None

    # Ensure it's a string
    time_str = str(time_str)

    # ISO 8601 duration format (PT30M, PT1H30M)
    iso_match = re.match(r'PT(?:(\d+)H)?(?:(\d+)M)?', time_str)
    if iso_match:
        hours = int(iso_match.group(1) or 0)
        minutes = int(iso_match.group(2) or 0)
        return hours * 60 + minutes

    # Natural language format
    time_str_lower = time_str.lower()
    total_minutes = 0

    # Hours
    hour_match = re.search(r'(\d+)\s*(?:hour|hr|h)', time_str_lower)
    if hour_match:
        total_minutes += int(hour_match.group(1)) * 60

    # Minutes
    min_match = re.search(r'(\d+)\s*(?:minute|min|m(?!on))', time_str_lower)
    if min_match:
        total_minutes += int(min_match.group(1))

    return total_minutes if total_minutes > 0 else None


def parse_servings_string(servings_str) -> Optional[int]:
    """Parse a servings string like '4 servings' to an integer.

    Handles strings, integers, and lists (takes first item).
    """
    if servings_str is None:
        return None

    # If it's a list, use the first item
    if isinstance(servings_str, list):
        if not servings_str:
            return None
        servings_str = servings_str[0]

    if isinstance(servings_str, int):
        return servings_str

    if not servings_str:
        return None

    # Try direct integer
    try:
        return int(servings_str)
    except (ValueError, TypeError):
        pass

    # Extract first number
    match = re.search(r'(\d+)', str(servings_str))
    if match:
        return int(match.group(1))

    return None


def merge_split_instruction_steps(instructions: str) -> str:
    """
    Post-process instructions to merge incorrectly split steps.

    Strategy: If a line doesn't start with a step number (1., 2., Step 1, etc.),
    it's likely a continuation of the previous step and should be merged.

    Returns cleaned instructions with proper step boundaries.
    """
    if not instructions:
        return instructions

    # Split into lines
    lines = instructions.split('\n')
    if len(lines) <= 1:
        return instructions

    merged_steps = []
    current_step_parts = []

    # Pattern to detect step numbers: "1.", "1)", "Step 1:", "1 -", "1:" etc.
    step_pattern = re.compile(r'^(\d+[\.\)\-:\s]|Step\s+\d+)', re.IGNORECASE)

    for line in lines:
        stripped = line.strip()
        if not stripped:
            # Empty line - could be intentional separator
            # If we have accumulated content, save it
            if current_step_parts:
                merged_steps.append(' '.join(current_step_parts))
                current_step_parts = []
            continue

        is_new_step = bool(step_pattern.match(stripped))

        if is_new_step:
            # This is a new numbered step
            # Save any accumulated content first
            if current_step_parts:
                merged_steps.append(' '.join(current_step_parts))
                current_step_parts = []
            # Start new step
            current_step_parts.append(stripped)
        else:
            # Not a numbered step - merge with current step
            if current_step_parts:
                # Continuation of current step
                current_step_parts.append(stripped)
            else:
                # First line without a number - treat as standalone
                current_step_parts.append(stripped)

    # Don't forget the last step
    if current_step_parts:
        merged_steps.append(' '.join(current_step_parts))

    # Join with double newlines for clear step separation
    return "\n\n".join(merged_steps)




def _sanitize_for_log(text: str) -> str:
    """Strip control characters from text before logging."""
    return ''.join(c for c in text if c >= ' ' or c in '\t\n')


def _validate_url_safe(url: str) -> Tuple[Optional[str], Optional[str]]:
    """Validate URL is safe to fetch (no SSRF).

    Returns (error_message, validated_ip).
    error_message is None if safe; validated_ip is the first safe IP to connect to.
    The caller MUST use validated_ip to prevent DNS rebinding (TOCTOU).
    """
    parsed = urlparse(url)

    # Only allow http and https schemes
    if parsed.scheme not in ('http', 'https'):
        return f"Only HTTP and HTTPS URLs are supported, got: {parsed.scheme}", None

    if not parsed.hostname:
        return "URL has no hostname", None

    # Resolve hostname ONCE and check all IPs for private/internal ranges
    validated_ip = None
    try:
        resolved = socket.getaddrinfo(parsed.hostname, None)
        for _, _, _, _, addr in resolved:
            ip = ipaddress.ip_address(addr[0])
            # Block any IP that isn't a globally-routable unicast address.
            # Defense-in-depth list: private (RFC1918/ULA), loopback,
            # link-local (incl. AWS metadata 169.254.169.254), reserved,
            # multicast, and unspecified (0.0.0.0 / ::).
            if (
                ip.is_private
                or ip.is_loopback
                or ip.is_link_local
                or ip.is_reserved
                or ip.is_multicast
                or ip.is_unspecified
            ):
                return "Internal/private URLs are not allowed", None
            if validated_ip is None:
                validated_ip = str(ip)
    except socket.gaierror:
        return "URL could not be reached", None

    return None, validated_ip


MAX_RESPONSE_BYTES = 5 * 1024 * 1024  # 5MB — largest legitimate recipe page is ~600KB


async def fetch_url(url: str, pinned_ip: Optional[str] = None) -> Tuple[str, str]:
    """Fetch URL content with size limit. Returns (html, final_url).

    When pinned_ip is provided, connects to that IP directly (with original Host header)
    to prevent DNS rebinding between validation and fetch.
    """
    log.info("Fetching URL: %s", _sanitize_for_log(url))

    # Build URL that connects to the validated IP to prevent DNS rebinding (TOCTOU)
    fetch_target = url
    extra_headers = {}
    if pinned_ip:
        parsed = urlparse(url)
        port = parsed.port or (443 if parsed.scheme == 'https' else 80)
        fetch_target = url.replace(parsed.hostname, pinned_ip, 1)
        extra_headers['Host'] = parsed.hostname

    async with httpx.AsyncClient(
        follow_redirects=True, timeout=30.0, max_redirects=10, verify=True
    ) as client:
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            **extra_headers,
        }
        # Stream response to enforce size limit (prevents OOM on malicious URLs)
        async with client.stream('GET', fetch_target, headers=headers) as response:
            log.info("Response status: %s for %s", response.status_code, _sanitize_for_log(url))
            response.raise_for_status()

            # Check Content-Length header first (fast rejection)
            content_length = response.headers.get('content-length')
            if content_length and int(content_length) > MAX_RESPONSE_BYTES:
                raise ValueError(f"Response too large: {content_length} bytes (max {MAX_RESPONSE_BYTES})")

            # Stream and cap total bytes read
            chunks = []
            total_bytes = 0
            async for chunk in response.aiter_bytes(chunk_size=65536):
                total_bytes += len(chunk)
                if total_bytes > MAX_RESPONSE_BYTES:
                    raise ValueError(f"Response exceeded {MAX_RESPONSE_BYTES} bytes while streaming")
                chunks.append(chunk)

            html = b''.join(chunks).decode('utf-8', errors='replace')
            return html, str(response.url)


def scrape_with_library(html: str, url: str) -> Optional[ExtractedRecipe]:
    """Try to scrape using recipe-scrapers library."""
    log.info("scrape_with_library called for URL: %s", _sanitize_for_log(url))

    if not _ensure_scrapers():
        log.warning("recipe-scrapers library not available (even after retry)")
        return None

    try:
        log.debug("HTML length: %d chars", len(html))
        scraper = scrape_html(html, url)
        log.info("Scraper created: %s", type(scraper).__name__)

        # Extract ingredients
        raw_ingredients = scraper.ingredients() or []
        log.debug("Found %d ingredients", len(raw_ingredients))
        ingredients = [parse_ingredient_line(ing) for ing in raw_ingredients]

        # Extract instructions - handle both string and list formats
        instructions_raw = scraper.instructions()
        if isinstance(instructions_raw, list):
            instructions = "\n\n".join(instructions_raw)
        else:
            instructions = instructions_raw or ""
        log.debug("Instructions: %d chars", len(instructions))

        # Post-process to merge any incorrectly split steps
        instructions = merge_split_instruction_steps(instructions)

        # Get times - handle both int (minutes) and string formats
        raw_prep = scraper.prep_time()
        raw_cook = scraper.cook_time()
        raw_total = scraper.total_time()
        log.debug("Raw times - prep: %s (%s), cook: %s (%s)", raw_prep, type(raw_prep), raw_cook, type(raw_cook))

        prep_time = parse_time_string(raw_prep)
        cook_time = parse_time_string(raw_cook)
        total_time = parse_time_string(raw_total)

        # Get servings
        servings = parse_servings_string(scraper.yields() or "")

        # Get site name from URL
        parsed_url = urlparse(url)
        site_name = parsed_url.netloc.replace('www.', '')

        title = scraper.title() or "Untitled Recipe"
        log.info("SUCCESS: Extracted recipe '%s' with %d ingredients", title, len(ingredients))

        # Safely extract optional metadata (some scrapers don't implement these)
        try:
            image_url = scraper.image() if hasattr(scraper, 'image') else None
        except Exception as e:
            log.debug("Failed to extract image URL from %s: %s", url, e)
            image_url = None
        try:
            cuisine_type = scraper.cuisine() if hasattr(scraper, 'cuisine') else None
        except Exception as e:
            log.debug("Failed to extract cuisine type from %s: %s", url, e)
            cuisine_type = None

        return ExtractedRecipe(
            name=title,
            instructions=instructions,
            ingredients=ingredients,
            prep_time_minutes=prep_time,
            cook_time_minutes=cook_time,
            total_time_minutes=total_time,
            servings=servings,
            source_url=url,
            source_site=site_name,
            image_url=image_url,
            cuisine_type=cuisine_type,
            confidence=0.95,
            extraction_method="recipe-scrapers"
        )

    except WebsiteNotImplementedError as e:
        log.warning("Website not implemented: %s", e)
        return None
    except Exception as e:
        log.error("Scraper error: %s: %s", type(e).__name__, e, exc_info=True)
        return None


def scrape_generic_html(html: str, url: str) -> Optional[ExtractedRecipe]:
    """Try generic HTML parsing using common patterns and schema.org."""
    log.info("scrape_generic_html called for URL: %s", _sanitize_for_log(url))
    log.info("BS4_AVAILABLE: %s", BS4_AVAILABLE)

    if not _ensure_bs4():
        log.warning("BeautifulSoup not available (even after retry)")
        return None

    try:
        soup = BeautifulSoup(html, 'html.parser')

        # Try schema.org Recipe structured data
        import json

        scripts = soup.find_all('script', type='application/ld+json')
        log.info("Found %d ld+json scripts", len(scripts))

        for i, script in enumerate(scripts):
            try:
                raw_string = script.string
                if not raw_string:
                    log.debug("Script %d: empty string", i)
                    continue

                data = json.loads(raw_string)
                log.debug("Script %d: parsed, type=%s", i, type(data).__name__)

                # Handle @graph wrapper (common in modern schema.org)
                if isinstance(data, dict) and '@graph' in data:
                    log.debug("Script %d: found @graph wrapper", i)
                    data = data['@graph']

                # Handle array of schemas
                if isinstance(data, list):
                    log.debug("Script %d: array with %d items", i, len(data))
                    found_recipe = False
                    for item in data:
                        item_type = item.get('@type', 'unknown')
                        log.debug("  - Item type: %s", item_type)
                        if item_type == 'Recipe' or (isinstance(item_type, list) and 'Recipe' in item_type):
                            data = item
                            found_recipe = True
                            break
                    if not found_recipe:
                        continue
                else:
                    item_type = data.get('@type', 'unknown')
                    log.debug("Script %d: single item, type=%s", i, item_type)

                # Check for Recipe type (can be string or array)
                item_type = data.get('@type', '')
                is_recipe = item_type == 'Recipe' or (isinstance(item_type, list) and 'Recipe' in item_type)
                if not is_recipe:
                    continue

                log.info("Script %d: Found Recipe!", i)
                # Extract from schema.org
                name = data.get('name', 'Untitled Recipe')

                # Instructions - handle various schema.org formats
                # Can be: string, list of strings, list of HowToStep, list of HowToSection
                instructions_data = data.get('recipeInstructions', [])
                steps = []

                def extract_steps(items):
                    """Recursively extract steps from various schema.org formats."""
                    result = []
                    if isinstance(items, str):
                        result.append(items)
                    elif isinstance(items, list):
                        for item in items:
                            if isinstance(item, str):
                                result.append(item)
                            elif isinstance(item, dict):
                                item_type = item.get('@type', '')
                                if item_type == 'HowToStep':
                                    text = item.get('text', '')
                                    if text:
                                        result.append(text)
                                elif item_type == 'HowToSection':
                                    # Recursively extract from itemListElement
                                    section_items = item.get('itemListElement', [])
                                    result.extend(extract_steps(section_items))
                                elif 'text' in item:
                                    result.append(item['text'])
                    return result

                steps = extract_steps(instructions_data)
                instructions = "\n\n".join(steps) if steps else ""

                # Post-process to merge any incorrectly split steps
                instructions = merge_split_instruction_steps(instructions)

                # Ingredients
                raw_ingredients = data.get('recipeIngredient', [])
                ingredients = [parse_ingredient_line(ing) for ing in raw_ingredients]

                # Times
                prep_time = parse_time_string(data.get('prepTime', ''))
                cook_time = parse_time_string(data.get('cookTime', ''))
                total_time = parse_time_string(data.get('totalTime', ''))

                # Servings
                servings = parse_servings_string(data.get('recipeYield', ''))

                # Site name
                parsed_url = urlparse(url)
                site_name = parsed_url.netloc.replace('www.', '')

                # Extract image URL - handle list, dict (ImageObject), or string
                raw_image = data.get('image')
                image_url = None
                if isinstance(raw_image, list) and raw_image:
                    raw_image = raw_image[0]
                if isinstance(raw_image, dict):
                    image_url = raw_image.get('url') or raw_image.get('contentUrl')
                elif isinstance(raw_image, str):
                    image_url = raw_image

                # Cuisine type from schema.org recipeCuisine field
                raw_cuisine = data.get('recipeCuisine')
                cuisine_type = None
                if isinstance(raw_cuisine, list) and raw_cuisine:
                    cuisine_type = raw_cuisine[0] if isinstance(raw_cuisine[0], str) else None
                elif isinstance(raw_cuisine, str):
                    cuisine_type = raw_cuisine

                log.info("SUCCESS via generic parsing: %s", name)

                return ExtractedRecipe(
                    name=name,
                    instructions=instructions,
                    ingredients=ingredients,
                    prep_time_minutes=prep_time,
                    cook_time_minutes=cook_time,
                    total_time_minutes=total_time,
                    servings=servings,
                    source_url=url,
                    source_site=site_name,
                    image_url=image_url,
                    cuisine_type=cuisine_type,
                    confidence=0.85,
                    extraction_method="schema.org"
                )

            except (json.JSONDecodeError, TypeError) as e:
                log.debug("Script %d: parse error - %s", i, e)
                continue

        log.warning("No Recipe found in any ld+json script")
        return None

    except Exception as e:
        log.error("Generic HTML parsing error: %s: %s", type(e).__name__, e, exc_info=True)
        return None


def generate_ai_prompt(url: str, error: str = "") -> str:
    """Generate AI extraction prompt for failed parsing."""
    return f"""I need to extract recipe data from a website and convert it to JSON format.

**URL:** {url}

**Error encountered:** {error or "Could not automatically extract recipe data"}

Please visit the URL above and extract the recipe into this JSON format:

```json
{{
  "name": "Recipe Title",
  "instructions": "1. First complete step here.\\n2. Second complete step here.\\n3. Third complete step here.",
  "ingredients": [
    {{"name": "ingredient name", "quantity": "2", "unit": "cups", "notes": "optional"}},
    {{"name": "another ingredient", "quantity": "1/2", "unit": "tsp"}}
  ],
  "prep_time_minutes": 15,
  "cook_time_minutes": 30,
  "servings": 4
}}
```

**Rules:**
- "quantity" should be a number or fraction (1, 2, 1/2, 1/4)
- "unit" should be standard (cup, tsp, tbsp, oz, lb, g, ml)
- "notes" is optional (e.g., "chopped", "room temperature")
- "instructions" CRITICAL FORMATTING:
  - Each numbered step must be COMPLETE (all actions for that step together)
  - Separate steps with \\n (single newline)
  - Do NOT split a step based on HTML line breaks or formatting
  - Keep sub-actions within the same step (e.g., "Wash produce. Peel carrots." = ONE step if numbered together)
  - Example: "1. Wash and dry produce. Peel carrots; halve lengthwise, then cut crosswise into 1/2-inch pieces."
- Include prep_time_minutes and cook_time_minutes if available
- Include servings if available (just the number)

Please provide the JSON only, no explanation needed."""


async def scrape_recipe_url(url: str) -> ExtractedRecipe | FallbackResponse:
    """
    Main entry point for recipe scraping.

    Strategy:
    1. Fetch the URL content
    2. Try recipe-scrapers library (100+ sites)
    3. Try generic HTML parsing (schema.org)
    4. Return AI prompt as fallback
    """
    log.info("=== scrape_recipe_url called ===")
    log.info("URL: %s", _sanitize_for_log(url))

    # SSRF protection: validate URL and pin resolved IP to prevent DNS rebinding
    ssrf_error, pinned_ip = _validate_url_safe(url)
    if ssrf_error:
        log.warning("SSRF validation failed: %s", ssrf_error)
        return FallbackResponse(
            success=False,
            error_message=ssrf_error,
            source_url=url
        )

    # Validate URL
    parsed = urlparse(url)
    if not parsed.scheme or not parsed.netloc:
        log.error("Invalid URL format: %s", _sanitize_for_log(url))
        return FallbackResponse(
            success=False,
            error_message="Invalid URL format",
            source_url=url
        )

    try:
        # Fetch the page (pinned_ip prevents DNS rebinding between validation and fetch)
        html, final_url = await fetch_url(url, pinned_ip=pinned_ip)
        log.info("Fetched %d chars from %s", len(html), _sanitize_for_log(final_url))

        # Re-validate final URL after redirects to block SSRF redirect-chain bypass
        if final_url != url:
            ssrf_error, _ = _validate_url_safe(final_url)
            if ssrf_error:
                log.warning("SSRF validation failed on redirect target: %s (redirected from %s to %s)", ssrf_error, _sanitize_for_log(url), _sanitize_for_log(final_url))
                return FallbackResponse(
                    success=False,
                    error_message="URL redirected to a blocked destination",
                    source_url=url
                )

        # Try recipe-scrapers
        log.info("Trying recipe-scrapers library...")
        result = scrape_with_library(html, final_url)
        if result:
            # Validate extracted recipe has actual content (paywalled/bot-protected sites)
            if not result.ingredients and len(result.instructions) < 20:
                log.warning("recipe-scrapers returned empty recipe (0 ingredients, %d chars instructions) -- likely paywalled/bot-protected. Falling through to generic parsing.", len(result.instructions))
                result = None
            else:
                log.info("SUCCESS via recipe-scrapers: %s", result.name)
                return result

        # Try generic parsing
        log.info("Trying generic HTML parsing...")
        result = scrape_generic_html(html, final_url)
        if result:
            # Same validation for generic parsing
            if not result.ingredients and len(result.instructions) < 20:
                log.warning("Generic parsing returned empty recipe -- falling through to AI fallback.")
                result = None
            else:
                log.info("SUCCESS via generic parsing: %s", result.name)
                return result

        # Fallback to AI prompt
        missing = []
        if not SCRAPERS_AVAILABLE:
            missing.append("recipe-scrapers")
        if not BS4_AVAILABLE:
            missing.append("beautifulsoup4")
        if missing:
            reason = "Could not extract recipe data from this page. Use AI extraction."
            log.error("Extraction failed due to missing dependencies: %s", missing)
        else:
            reason = "Could not extract recipe data from this page. Use AI extraction."
            log.warning("All extraction methods failed, returning AI prompt fallback")
        return FallbackResponse(
            success=False,
            error_message=reason,
            ai_prompt=generate_ai_prompt(final_url, reason),
            source_url=final_url
        )

    except httpx.HTTPError as e:
        log.error("HTTP error fetching recipe URL: %s", e)
        return FallbackResponse(
            success=False,
            error_message="Failed to fetch recipe URL",
            ai_prompt=generate_ai_prompt(url, "HTTP error while fetching URL"),
            source_url=url
        )
    except Exception as e:
        log.error("Unexpected error scraping recipe URL: %s: %s", type(e).__name__, e, exc_info=True)
        return FallbackResponse(
            success=False,
            error_message="Failed to extract recipe",
            ai_prompt=generate_ai_prompt(url, "Extraction failed unexpectedly"),
            source_url=url
        )
