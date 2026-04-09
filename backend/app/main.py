"""
FastAPI Backend.

Main application entry point.

Architecture:
- Auth DB (auth.db): always available, plaintext, users table only
- App DB (weekly_review.db): encrypted with SQLCipher, opened after login
- Seeds/migrations run on first login, not on startup
"""

import asyncio
import hmac
import logging
import os
import sys
from contextlib import asynccontextmanager
from logging.handlers import RotatingFileHandler
from pathlib import Path
from platformdirs import user_data_dir

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.middleware.trustedhost import TrustedHostMiddleware
from starlette.requests import Request as StarletteRequest
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

from app.middleware.origin import OriginValidationMiddleware
from app.middleware.size_limit import RequestSizeLimitMiddleware
from app.middleware.error_handler import GenericErrorHandlerMiddleware
from app.middleware.db_injection import DBInjectionMiddleware

# Block test mode in production/frozen builds
if os.environ.get("WEEKLY_REVIEW_TEST_MODE") == "true":
    if getattr(sys, "frozen", False):
        raise RuntimeError(
            "WEEKLY_REVIEW_TEST_MODE cannot be enabled in production build. "
            "Unset this environment variable and restart."
        )
    else:
        logging.getLogger("weekly_review").warning(
            "WEEKLY_REVIEW_TEST_MODE ACTIVE — "
            "DB injection middleware bypassed. Never use in production."
        )

# Block dev mode in production/frozen builds
if os.environ.get("WEEKLY_REVIEW_DEV_MODE") == "true":
    if getattr(sys, "frozen", False):
        raise RuntimeError(
            "WEEKLY_REVIEW_DEV_MODE cannot be enabled in production build. "
            "Unset this environment variable and restart."
        )

# Legacy env var — fail fast to catch stale scripts/configs.
# WEEKLY_REVIEW_DEBUG was renamed to WEEKLY_REVIEW_DEV_MODE to unify a single
# dev/debug gate. Silent partial-enable was the worst class of bug we had.
if os.environ.get("WEEKLY_REVIEW_DEBUG") is not None:
    raise RuntimeError(
        "WEEKLY_REVIEW_DEBUG is no longer supported. "
        "Use WEEKLY_REVIEW_DEV_MODE=true instead."
    )

# Sidecar bearer token (set by Rust host via environment variable)
AUTH_TOKEN = os.environ.get("WEEKLY_REVIEW_AUTH_TOKEN")

# Set up file logging for diagnostics
def setup_main_logger():
    """Set up file logger for main app diagnostics."""
    log_dir = Path(user_data_dir("WeeklyReview", False))
    log_dir.mkdir(parents=True, exist_ok=True)
    log_file = log_dir / "backend.log"

    logger = logging.getLogger("weekly_review")
    log_level_name = os.environ.get("WEEKLY_REVIEW_LOG_LEVEL", "INFO").upper()
    log_level = getattr(logging, log_level_name, logging.INFO)
    logger.setLevel(log_level)

    if logger.handlers:
        logger.handlers.clear()

    fh = RotatingFileHandler(
        log_file, encoding='utf-8', maxBytes=5 * 1024 * 1024, backupCount=3
    )
    fh.setLevel(log_level)
    fh.setFormatter(logging.Formatter(
        '%(asctime)s - %(name)s - %(levelname)s - %(message)s'
    ))
    logger.addHandler(fh)

    return logger

log = setup_main_logger()
log.info("=== Backend Starting ===")


def _check_dependencies():
    """Verify critical encryption deps are available."""
    missing = []
    try:
        import sqlcipher3  # noqa: F401
    except ImportError:
        missing.append("sqlcipher3")
    try:
        import argon2  # noqa: F401
    except ImportError:
        missing.append("argon2-cffi")
    try:
        import dateutil  # noqa: F401
    except ImportError:
        missing.append("python-dateutil")
    try:
        import platformdirs  # noqa: F401
    except ImportError:
        missing.append("platformdirs")
    if missing:
        log.error(
            "MISSING CRITICAL PACKAGES: %s — run: pip install -r requirements.txt",
            ", ".join(missing),
        )


_check_dependencies()

# Import Base for model registration (no engine created yet — deferred to login)
from app.database import Base  # noqa: E402

# Import all models so they register with Base.metadata for create_all
from app.routers import events, recipes, finances, meals, categories, summary, backup, recurrence, shopping_list, inventory, observation, patterns, feedback, tags  # noqa: E402
from app.routers import budget, income, transactions, savings, debt, net_worth, recurring, investments, reports  # noqa: E402
from app.routers import day_notes, batch_prep  # noqa: E402
from app.routers import dietary_restrictions  # noqa: E402
from app.routers import calendar_import  # noqa: E402
from app.routers import predictions  # noqa: E402
from app.routers import food_parser  # noqa: E402
from app.routers import auth as auth_router  # noqa: E402
from app.routers import property as property_router  # noqa: E402
from app.routers import property_maintenance  # noqa: E402
from app.routers import intelligence  # noqa: E402


# Initialize auth DB (plaintext, always available) — creates users table
# Skipped in test mode to avoid opening the real auth.db file, which on Windows
# conflicts with a running backend's file handle (SQLite exclusive locking).
from app.db.auth_database import initialize_auth_db  # noqa: E402
if os.environ.get("WEEKLY_REVIEW_TEST_MODE") != "true":
    initialize_auth_db()
    log.info("Auth DB initialized")
else:
    log.info("Test mode — skipping auth DB initialization")

# NOTE: App DB (encrypted) is NOT opened here.
# It opens on first login via auth.py → initialize_app_db().
# Seeds and migrations run then, not now.

log.info("Imports complete — waiting for user login to open encrypted DB")

# Initialize rate limiter
limiter = Limiter(key_func=get_remote_address)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Lifespan context manager for startup and shutdown events.
    Ensures graceful shutdown to prevent zombie sockets.
    """
    # Startup
    log.info("FastAPI lifespan: Starting...")
    yield
    # Shutdown
    log.info("FastAPI lifespan: Shutting down...")
    # Close encrypted DB if open
    from app.database import engine as app_engine
    if app_engine is not None:
        app_engine.dispose()
    # Close auth DB
    from app.db.auth_database import auth_engine
    auth_engine.dispose()
    # Allow pending tasks to complete
    await asyncio.sleep(0.1)
    log.info("FastAPI lifespan: Shutdown complete")


# Initialize FastAPI app.
# Docs (/docs, /redoc, /openapi.json) are gated behind dev mode so production
# builds never expose the endpoint surface to anyone who reaches the sidecar port.
_IS_DEV_MODE = os.environ.get("WEEKLY_REVIEW_DEV_MODE") == "true"

app = FastAPI(
    title="API",
    description="",
    version="",
    docs_url="/docs" if _IS_DEV_MODE else None,
    redoc_url="/redoc" if _IS_DEV_MODE else None,
    openapi_url="/openapi.json" if _IS_DEV_MODE else None,
    lifespan=lifespan,
)

# Add rate limiter to app state
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

from app.exceptions import register_exception_handlers
register_exception_handlers(app)

# Block DNS rebinding attacks — only allow known hosts
app.add_middleware(
    TrustedHostMiddleware,
    allowed_hosts=["localhost", "127.0.0.1", "testserver"],
)


# Bearer token authentication middleware (sidecar security)
class BearerAuthMiddleware(BaseHTTPMiddleware):
    """Validates Authorization: Bearer <token> on every request.

    - Exempt: /health, /api/health (needed for health polling before frontend has token)
    - Exempt: OPTIONS requests (CORS preflight)
    - Exempt: When no token is configured (dev mode — running uvicorn manually)
    """

    EXEMPT_PATHS = {"/health", "/api/health"}

    async def dispatch(self, request: StarletteRequest, call_next):
        # Skip auth if no token configured (dev mode)
        if not AUTH_TOKEN:
            return await call_next(request)

        # Skip auth for CORS preflight
        if request.method == "OPTIONS":
            return await call_next(request)

        # Skip auth for health endpoints
        if request.url.path in self.EXEMPT_PATHS:
            return await call_next(request)

        # Validate bearer token (constant-time comparison to prevent timing attacks)
        auth_header = request.headers.get("Authorization") or ""
        expected = f"Bearer {AUTH_TOKEN}"
        if not hmac.compare_digest(auth_header.encode(), expected.encode()):
            return JSONResponse(
                {"detail": "Unauthorized"},
                status_code=401,
            )

        return await call_next(request)


# Bearer token middleware — validates the sidecar auth token on every request.
# Exempt in dev mode when no token is configured.
app.add_middleware(BearerAuthMiddleware)


# Security response headers middleware
class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: StarletteRequest, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "no-referrer"
        response.headers["Cache-Control"] = "no-store"
        response.headers["Content-Security-Policy"] = "default-src 'none'"
        response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
        return response


app.add_middleware(SecurityHeadersMiddleware)

# Deprecation headers for endpoints being phased out
from app.middleware.deprecation import DeprecationHeaderMiddleware  # noqa: E402
app.add_middleware(DeprecationHeaderMiddleware)

# Origin validation, request size limits
app.add_middleware(OriginValidationMiddleware)
app.add_middleware(RequestSizeLimitMiddleware)

# DB injection: validates session token, injects encrypted DB session into ContextVar
app.add_middleware(DBInjectionMiddleware)

# Generic error handler MUST be added after DBInjection so it wraps it (outer).
# In Starlette, last-added = outermost. This catches any unhandled exception from
# DBInjection or deeper middleware and returns a clean 500.
app.add_middleware(GenericErrorHandlerMiddleware)

# CORS MUST be outermost middleware (added last = runs first in Starlette).
# If inner middleware (DBInjection, GenericErrorHandler) returns an error response,
# CORS headers are still added — otherwise the browser blocks all error responses.
# Origins evaluated once at startup. Set WEEKLY_REVIEW_DEV_MODE before launching
# uvicorn -- changing the env var after start has no effect.
_cors_origins = [
    "tauri://localhost",          # Tauri 2.0 (Windows/Linux)
    "https://tauri.localhost",    # Tauri 2.0 (macOS)
    "http://tauri.localhost",     # Tauri 2.0 fallback
]
if _IS_DEV_MODE:
    _cors_origins += [
        "http://localhost:5173",      # Vite dev server
        "http://127.0.0.1:5173",      # Vite dev server (IP)
        "http://localhost:5174",      # Vite dev server (alternate port)
        "http://127.0.0.1:5174",      # Vite dev server (alternate port IP)
    ]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Accept", "Authorization", "X-Session-Token"],
)

# Include routers
# Events: main CRUD + sub-routers for import and recurrence
app.include_router(events.router, prefix="/api/events")
app.include_router(calendar_import.router, prefix="/api/events/import")
app.include_router(recipes.router, prefix="/api/recipes")
app.include_router(finances.router, prefix="/api/finances")
app.include_router(meals.router, prefix="/api/meals")
app.include_router(categories.router, prefix="/api/categories")
app.include_router(summary.router, prefix="/api/summary")
app.include_router(backup.router, prefix="/api/backup")
# Recurrence: available under events sub-path AND legacy path
app.include_router(recurrence.router, prefix="/api/events/recurrence")
app.include_router(recurrence.router, prefix="/api/recurrence")  # legacy
app.include_router(shopping_list.router, prefix="/api/shopping-list")
app.include_router(inventory.router, prefix="/api/inventory")
app.include_router(observation.router, prefix="/api/observation")
app.include_router(patterns.router, prefix="/api/patterns")
app.include_router(feedback.router, prefix="/api/feedback")
app.include_router(tags.router, prefix="/api/tags")
# Finance routers
app.include_router(budget.router, prefix="/api/budget")
app.include_router(income.router, prefix="/api/income")
app.include_router(transactions.router, prefix="/api/transactions")
app.include_router(savings.router, prefix="/api/savings")
app.include_router(debt.router, prefix="/api/debt")
app.include_router(net_worth.router, prefix="/api/net-worth")
# Recurring/subscriptions router
app.include_router(recurring.router, prefix="/api/recurring")
# Investment portfolio router
app.include_router(investments.router, prefix="/api/investments")
# Financial reports and analytics router
app.include_router(reports.router, prefix="/api/reports")
# Day notes and batch prep
app.include_router(day_notes.router, prefix="/api/day-notes")
app.include_router(batch_prep.router, prefix="/api/batch-prep")
# Dietary restrictions
app.include_router(dietary_restrictions.router, prefix="/api/dietary-restrictions")
# Predictions
app.include_router(predictions.router, prefix="/api/predictions")
# Unified food item parser
app.include_router(food_parser.router, prefix="/api/food-parser")
# PIN auth system
app.include_router(auth_router.router, prefix="/api/auth")
# Property management
app.include_router(property_router.router, prefix="/api/property")
app.include_router(property_maintenance.router, prefix="/api/property")
# Intelligence endpoints
app.include_router(intelligence.router, prefix="/api/intelligence")


@app.get("/api/health")
def health_check():
    """API health check."""
    return {"status": "healthy"}


# Test-only endpoints (gated behind WEEKLY_REVIEW_TEST_MODE)
if os.environ.get("WEEKLY_REVIEW_TEST_MODE") == "true":
    @app.post("/api/test/seed")
    def test_seed_data():
        """Seed minimal data for E2E tests."""
        from app.database import SessionLocal
        if SessionLocal is None:
            return JSONResponse({"error": "DB not initialized — login first"}, status_code=503)

        from app.models.recipe import Recipe, RecipeIngredient, Ingredient
        from app.models.meal import MealPlanEntry
        from app.models.event import Event
        from app.models.financial import FinancialItem
        from datetime import date, timedelta

        db = SessionLocal()
        try:
            today = date.today()
            monday = today - timedelta(days=today.weekday())

            ing = Ingredient(name="Test Flour", food_category="baking")
            db.add(ing)
            db.flush()

            recipe = Recipe(
                name="Test Pancakes",
                description="Fluffy pancakes",
                instructions="Mix and cook",
                servings=4,
                prep_time=10,
                cook_time=15,
            )
            db.add(recipe)
            db.flush()

            ri = RecipeIngredient(
                recipe_id=recipe.id,
                ingredient_id=ing.id,
                quantity="2",
                quantity_amount=2.0,
                quantity_unit="cup",
                unit="cup",
            )
            db.add(ri)

            meal = MealPlanEntry(
                date=monday,
                meal_type="breakfast",
                recipe_id=recipe.id,
                planned_servings=2,
            )
            db.add(meal)

            event = Event(
                name="Test Meeting",
                date=monday,
                start_time="09:00",
                end_time="10:00",
            )
            db.add(event)

            bill = FinancialItem(
                name="Test Electric Bill",
                amount=85.0,
                due_date=monday + timedelta(days=3),
                is_paid=False,
            )
            db.add(bill)

            db.commit()
            return {"status": "seeded", "recipe_id": recipe.id, "ingredient_id": ing.id}
        except Exception as e:
            db.rollback()
            log.error("Test seed failed: %s", e)
            return JSONResponse({"error": "Internal server error"}, status_code=500)
        finally:
            db.close()

    @app.post("/api/test/clear")
    def test_clear_data():
        """Clear all test data."""
        from app.database import SessionLocal
        if SessionLocal is None:
            return JSONResponse({"error": "DB not initialized — login first"}, status_code=503)

        from sqlalchemy import text

        SAFE_TABLES = frozenset([
            "meal_plan_entries", "recipe_ingredients", "shopping_list_items",
            "inventory_items", "events", "financial_items", "recipes", "ingredients",
        ])

        db = SessionLocal()
        try:
            for table_name in SAFE_TABLES:
                db.execute(text(f"DELETE FROM {table_name}"))  # noqa: S608
            db.commit()
            return {"status": "cleared"}
        except Exception as e:
            db.rollback()
            log.error("Test clear failed: %s", e)
            return JSONResponse({"error": "Internal server error"}, status_code=500)
        finally:
            db.close()
