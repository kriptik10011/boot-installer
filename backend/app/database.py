"""
Database configuration and session management.

Architecture:
- Auth DB (auth.db): plaintext, users table only — see db/auth_database.py
- App DB (weekly_review.db): SQLCipher encrypted, all financial/recipe/meal data
  Engine is NOT created at module load — it requires the encryption key derived
  from the user's PIN. initialize_app_db() is called after login.

Security: Database is stored in OS-protected app data directory:
- Windows: %LOCALAPPDATA%/WeeklyReview/
- macOS: ~/Library/Application Support/WeeklyReview/
- Linux: ~/.local/share/WeeklyReview/
"""

import logging
import os
from contextvars import ContextVar
from pathlib import Path
from typing import Optional

import sqlalchemy as sa
from platformdirs import user_data_dir
from sqlalchemy import create_engine, event
from sqlalchemy.orm import Session, sessionmaker, declarative_base

log = logging.getLogger("weekly_review")

# Base class for ALL app models (not auth — those use AuthBase)
Base = declarative_base()

# ---- App DB state (deferred until login) ----
# These are None until initialize_app_db() is called with the encryption key.
engine: Optional[sa.engine.Engine] = None
SessionLocal: Optional[sessionmaker] = None

# Per-request context variable — set by db_injection middleware
_db_context: ContextVar[Optional[Session]] = ContextVar("db_context", default=None)


def get_database_path() -> Path:
    """Get the secure database path in OS app data directory."""
    if custom_path := os.getenv("DATABASE_PATH"):
        return Path(custom_path)

    app_data = Path(user_data_dir("WeeklyReview", False))
    app_data.mkdir(parents=True, exist_ok=True)
    return app_data / "weekly_review.db"


def migrate_legacy_database():
    """
    Migrate database from old location (working directory) to secure location.
    Only runs once if legacy database exists and new one doesn't.
    """
    import shutil

    legacy_path = Path("./weekly_review.db")
    secure_path = get_database_path()

    if legacy_path.exists() and not secure_path.exists():
        try:
            log.info("Migrating database to secure location: %s", secure_path)
            shutil.copy2(legacy_path, secure_path)
            try:
                legacy_backup = legacy_path.with_suffix(".db.backup")
                legacy_path.rename(legacy_backup)
                log.info("Legacy database backed up to: %s", legacy_backup)
            except PermissionError:
                log.info("Note: Legacy database still in use, will be kept as-is")
        except Exception as e:
            log.warning("Database migration failed: %s", e)


# Run legacy migration check on module load (moves file, doesn't open it)
migrate_legacy_database()

# Path constant (does NOT open the DB)
DATABASE_PATH = get_database_path()


def initialize_app_db(key: bytes) -> tuple:
    """
    Create the encrypted SQLAlchemy engine and session factory.

    Called after login when the encryption key is available.
    Returns (engine, SessionLocal) for storage in the session dict.

    Args:
        key: 32-byte encryption key derived from PIN.
    """
    from sqlcipher3 import dbapi2 as sqlcipher

    global engine, SessionLocal

    if len(key) != 32:
        raise ValueError("Encryption key must be exactly 32 bytes")

    db_path = str(DATABASE_PATH)
    # Capture raw key bytes in closure — hex is derived inline at point of use
    # and immediately eligible for GC. No long-lived hex string in memory.
    _key_bytes = bytes(key)

    def _creator():
        conn = sqlcipher.connect(db_path, check_same_thread=False)
        hex_key = _key_bytes.hex()
        conn.execute(f"PRAGMA key = \"x'{hex_key}'\";")
        del hex_key  # Eligible for GC immediately
        conn.execute("PRAGMA journal_mode = WAL;")
        conn.execute("PRAGMA foreign_keys = ON;")
        conn.execute("PRAGMA synchronous = NORMAL;")
        conn.execute("PRAGMA cache_size = -8000;")  # 8 MB
        conn.execute("PRAGMA temp_store = MEMORY;")
        # Verify key correctness — fails fast if wrong key
        conn.execute("SELECT count(*) FROM sqlite_master;")
        return conn

    from sqlalchemy.pool import SingletonThreadPool

    new_engine = create_engine(
        "sqlite+pysqlite:///",
        creator=_creator,
        echo=False,
        poolclass=SingletonThreadPool,
    )

    # Eagerly verify the key is correct — _creator has HMAC check,
    # but create_engine is lazy. Force a connection now so a wrong key
    # fails HERE (login returns 500) instead of silently creating a
    # broken session where every subsequent query returns 500.
    with new_engine.connect() as test_conn:
        test_conn.execute(sa.text("SELECT 1"))

    new_session_local = sessionmaker(
        autocommit=False, autoflush=False, bind=new_engine,
    )

    # Set module-level globals so seed functions and migrate_schema work
    engine = new_engine
    SessionLocal = new_session_local

    log.info("Encrypted app DB engine initialized")
    return new_engine, new_session_local


def teardown_app_db():
    """Dispose the encrypted engine. Called on logout/lock."""
    global engine, SessionLocal
    if engine is not None:
        try:
            engine.dispose()
        except Exception as e:
            log.debug("Engine dispose failed during teardown: %s", e)
    engine = None
    SessionLocal = None
    log.info("App DB engine disposed")


def wipe_encrypted_database() -> int:
    """
    Delete the encrypted DB file and any SQLite WAL/SHM sidecars.

    Used by:
    - Atomic user-delete flow (DELETE /api/auth/users/{id}) to keep auth.db
      and weekly_review.db consistent.
    - Bootstrap orphan recovery (startup hook in main.py) when auth.db has
      no users but the encrypted DB still exists from a previous account.

    The caller is responsible for first calling teardown_app_db() so that no
    SQLAlchemy connection holds an open file handle (Windows otherwise blocks
    the unlink with PermissionError).

    Returns the number of files actually removed (0-3).
    """
    import gc

    db_path = str(get_database_path())
    sidecars = [db_path, f"{db_path}-shm", f"{db_path}-wal"]

    # Force GC then a tiny sleep — sqlcipher3 sometimes lags releasing handles.
    gc.collect()
    import time
    time.sleep(0.1)

    removed = 0
    for path in sidecars:
        if os.path.exists(path):
            try:
                os.remove(path)
                removed += 1
                log.info("Wiped encrypted DB artifact: %s", os.path.basename(path))
            except OSError as e:
                log.error("Could not remove %s: %s", os.path.basename(path), e)
                raise
    return removed


def set_request_db(session: Session):
    """Called by db_injection middleware to set the per-request DB session."""
    _db_context.set(session)


def get_db():
    """
    FastAPI dependency. Returns the request-scoped encrypted DB session.

    After login, db_injection middleware sets the ContextVar.
    Before login (or for auth endpoints), this raises RuntimeError.

    Usage:
        @router.get("/items")
        def get_items(db: Session = Depends(get_db)):
            return db.query(Item).all()
    """
    db = _db_context.get()
    if db is None:
        raise RuntimeError("No database session — user not authenticated")
    try:
        yield db
    finally:
        pass  # Session lifecycle managed by middleware, not here


def run_seeds_and_migrations():
    """
    Run create_all, migrate_schema, and all seed functions.
    Called once after the encrypted engine is initialized (first login).
    """
    from app.db.seeds import ALL_SEEDS

    if engine is None or SessionLocal is None:
        raise RuntimeError("Cannot seed — app DB not initialized")

    log.info("Running create_all + migrations + seeds on encrypted DB...")

    # Create all tables defined by Base
    Base.metadata.create_all(bind=engine)

    # Run column migrations — failure here is FATAL (schema incomplete)
    migrate_schema()

    # Run seed functions — non-fatal (data population, not schema)
    for seed_fn in ALL_SEEDS:
        try:
            seed_fn()
        except Exception as seed_exc:
            log.warning("Seed function %s failed: %s", seed_fn.__name__, seed_exc)

    log.info("Seeds and migrations complete on encrypted DB")


def migrate_schema():
    """
    Add any missing columns to existing tables.
    Uses the current engine (must be initialized first).
    """
    if engine is None:
        log.warning("migrate_schema called but engine is None — skipping")
        return

    migrations = {
        "meal_plan_entries": {
            "actual_servings": "INTEGER",
            "actual_prep_minutes": "INTEGER",
            "actual_cook_minutes": "INTEGER",
            "cooked_at": "DATETIME",
            "cooking_notes": "VARCHAR(500)",
            "planned_servings": "INTEGER",
            "inventory_depleted": "BOOLEAN DEFAULT 0",
        },
        "recipes": {
            "image_url": "VARCHAR(2000)",
            "cuisine_type": "VARCHAR(100)",
        },
        "ingredients": {
            "food_category": "VARCHAR(50)",
            # Unified ingredient architecture
            "canonical_name": "VARCHAR(200)",
            "category": "VARCHAR(20) DEFAULT 'other'",
            "preferred_tracking_mode": "VARCHAR(20)",
            "count_interactions": "INTEGER DEFAULT 0",
            "percentage_interactions": "INTEGER DEFAULT 0",
            "package_type": "VARCHAR(50)",
            "default_package_qty": "FLOAT DEFAULT 1.0",
            "aliases": "JSON DEFAULT '[]'",
            "default_unit": "VARCHAR(50)",
        },
        "inventory_items": {
            "package_size": "FLOAT",
            "package_unit": "VARCHAR(50)",
            "package_label": "VARCHAR(100)",
            "packages_count": "FLOAT DEFAULT 1.0",
            "amount_used": "FLOAT DEFAULT 0.0",
            "amount_used_unit": "VARCHAR(50)",
            # Unified ingredient architecture
            "ingredient_id": "INTEGER REFERENCES ingredients(id)",
            "percent_full": "FLOAT",
            "last_restocked_at": "DATETIME",
            "consumption_history": "JSON DEFAULT '[]'",
            # Expiration tracking
            "purchase_date": "DATE",
            "default_shelf_life": "INTEGER",
            "expiration_auto_filled": "BOOLEAN DEFAULT 1",
            "food_category": "VARCHAR(50)",
            # Leftover support
            "source": "VARCHAR(20) DEFAULT 'purchased'",
            "linked_meal_id": "INTEGER REFERENCES meal_plan_entries(id)",
            "original_meal_name": "VARCHAR(200)",
            # Per-item step size for +/- buttons
            "adjustment_step": "REAL",
            # Per-item tracking mode override ("count" or "percentage")
            "tracking_mode_override": "VARCHAR(20)",
            # Unified inventory tracking
            "unit_type": "VARCHAR(20)",
            "quantity_unit": "VARCHAR(50)",
            "packages_backup": "FLOAT",
            "reorder_threshold": "FLOAT",
        },
        "financial_items": {
            "budget_category_id": "INTEGER REFERENCES budget_categories(id)",
            "is_migrated_to_transaction": "BOOLEAN DEFAULT 0",
        },
    }

    with engine.connect() as conn:
        inspector = sa.inspect(engine)

        for table_name, new_columns in migrations.items():
            try:
                existing_columns = {
                    col["name"] for col in inspector.get_columns(table_name)
                }
            except Exception as e:
                log.debug("Skipping migration for table %s (not found): %s", table_name, e)
                continue

            for col_name, col_type in new_columns.items():
                if col_name not in existing_columns:
                    try:
                        conn.execute(
                            sa.text(f"ALTER TABLE {table_name} ADD COLUMN {col_name} {col_type}")
                        )
                        conn.commit()
                        log.info("Migration: added %s.%s", table_name, col_name)
                    except Exception as e:
                        log.warning("Could not add column %s.%s: %s", table_name, col_name, e)

    # --- Schema versioning: run one-time migrations ---
    _ensure_schema_versions_table()
    _run_versioned_migrations()

    # --- FK indexes: ensure all foreign key columns are indexed ---
    _create_fk_indexes()

    # --- Data normalization: fix inconsistent inventory items ---
    _normalize_inventory_items()
    _unify_quantity_source_of_truth()


def _ensure_schema_versions_table():
    """Create schema_versions table if it doesn't exist."""
    if engine is None:
        return
    with engine.connect() as conn:
        conn.execute(sa.text("""
            CREATE TABLE IF NOT EXISTS schema_versions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                version_name VARCHAR(100) NOT NULL UNIQUE,
                applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        """))
        conn.commit()


def _has_migration_run(conn, name: str) -> bool:
    """Check if a named migration has already been applied."""
    row = conn.execute(
        sa.text("SELECT 1 FROM schema_versions WHERE version_name = :name"),
        {"name": name},
    ).fetchone()
    return row is not None


def _mark_migration_done(conn, name: str):
    """Record that a migration has been applied."""
    conn.execute(
        sa.text("INSERT INTO schema_versions (version_name) VALUES (:name)"),
        {"name": name},
    )


def _run_versioned_migrations():
    """Run all one-time versioned migrations.

    IMPORTANT: All migrations share a single conn.commit() at the end.
    Do NOT add intermediate commits — the atomicity guarantees that either
    all data mutations AND the version record are committed together, or
    none are (WAL rollback on crash). This prevents double-conversion.
    """
    if engine is None:
        return
    with engine.connect() as conn:
        # D8: Float → Integer Cents
        if not _has_migration_run(conn, "d8_float_to_cents"):
            _migrate_float_to_cents(conn)
            _mark_migration_done(conn, "d8_float_to_cents")

        # D9: Composite Unique Constraints
        if not _has_migration_run(conn, "d9_unique_constraints"):
            _add_unique_constraints(conn)
            _mark_migration_done(conn, "d9_unique_constraints")

        # D10: Property monetary Float → Integer Cents
        if not _has_migration_run(conn, "d10_property_float_to_cents"):
            _migrate_property_to_cents(conn)
            _mark_migration_done(conn, "d10_property_float_to_cents")

        # D12: Fix CASCADE bugs (Asset→AssetHistory, MealPlanEntry→BatchPrepMeal)
        # SQLite cannot ALTER FK constraints, so we recreate affected tables.
        if not _has_migration_run(conn, "d12_cascade_fixes"):
            _fix_cascade_constraints(conn)
            _mark_migration_done(conn, "d12_cascade_fixes")

        # D13: UNIQUE constraint on ingredients.canonical_name
        if not _has_migration_run(conn, "d13_canonical_name_unique"):
            _add_canonical_name_unique(conn)
            _mark_migration_done(conn, "d13_canonical_name_unique")

        # Backfill NULL ingredient_ids in any legacy items
        if not _has_migration_run(conn, "d14_ingredient_id_not_null"):
            _backfill_null_ingredient_ids(conn)
            _mark_migration_done(conn, "d14_ingredient_id_not_null")

        conn.commit()


def _migrate_float_to_cents(conn):
    """D8: Convert monetary float columns to integer cents in-place.

    SQLite stores REAL and INTEGER in the same dynamic type system,
    so we can convert values in-place without table recreation.
    The TypeDecorator on the model handles Python-side conversion.

    This function is ONLY called when _has_migration_run("d8_float_to_cents")
    returns False. It runs unconditionally — no per-column sampling heuristic.
    The schema_versions record is the sole gate against double-conversion.
    The entire block commits atomically (single conn.commit in the caller).
    WAL mode guarantees rollback on crash before commit.
    """
    monetary_columns = {
        "financial_items": ["amount"],
        "budget_categories": ["budget_amount", "rollover_cap"],
        "budget_allocations": ["allocated_amount", "spent_amount", "rolled_over_from"],
        "income_sources": ["amount"],
        "transactions": ["amount"],
        "transaction_recurrences": ["amount"],
        "debt_accounts": ["current_balance", "original_balance", "minimum_payment", "extra_payment_amount"],
        "debt_payments": ["amount", "principal_portion", "interest_portion", "balance_after"],
        "assets": ["current_value"],
        "asset_history": ["value", "change_amount"],
        "investment_holdings": ["cost_basis", "current_price", "current_value"],
        "investment_contributions": ["amount"],
        "savings_goals": ["target_amount", "current_amount", "monthly_contribution"],
        "purchase_history": ["price"],
    }

    inspector = sa.inspect(engine)
    for table, columns in monetary_columns.items():
        try:
            existing = {c["name"] for c in inspector.get_columns(table)}
        except Exception as e:
            log.debug("Skipping cents migration for table %s (not found): %s", table, e)
            continue  # Table doesn't exist yet

        for col in columns:
            if col not in existing:
                continue
            conn.execute(sa.text(
                f"UPDATE {table} SET {col} = CAST(ROUND({col} * 100) AS INTEGER) WHERE {col} IS NOT NULL"
            ))
            log.info("D8: Converted %s.%s to integer cents", table, col)


def _add_unique_constraints(conn):
    """D9: Add composite unique constraints via unique indexes.

    SQLite doesn't support ALTER TABLE ADD CONSTRAINT, so we use
    CREATE UNIQUE INDEX which has the same effect. Duplicates must
    be resolved first.

    All entries must be tables with a single-column integer 'id' PK.
    Association tables (composite PK, no 'id') are not compatible
    with the MAX(id) dedup pattern.
    """
    constraints = [
        ("uq_meal_date_type", "meal_plan_entries", ["date", "meal_type"]),
        ("uq_alloc_cat_period", "budget_allocations", ["category_id", "period_start"]),
        ("uq_template_day_type", "meal_plan_templates", ["day_of_week", "meal_type"]),
        ("uq_holding_acct_sym", "investment_holdings", ["account_id", "symbol"]),
        ("uq_target_acct_class", "target_allocations", ["account_id", "asset_class"]),
    ]

    inspector = sa.inspect(engine)
    for idx_name, table, columns in constraints:
        try:
            existing_tables = inspector.get_table_names()
            if table not in existing_tables:
                continue

            existing_cols = {c["name"] for c in inspector.get_columns(table)}
            if not all(c in existing_cols for c in columns):
                continue

            # Check if index already exists
            existing_indexes = {idx["name"] for idx in inspector.get_indexes(table)}
            if idx_name in existing_indexes:
                continue

            # Dedup: keep highest ID for each duplicate group
            cols_csv = ", ".join(columns)
            conn.execute(sa.text(f"""
                DELETE FROM {table} WHERE id NOT IN (
                    SELECT MAX(id) FROM {table} GROUP BY {cols_csv}
                )
            """))

            conn.execute(sa.text(
                f"CREATE UNIQUE INDEX IF NOT EXISTS {idx_name} ON {table} ({cols_csv})"
            ))
            log.info("D9: Added unique constraint %s on %s(%s)", idx_name, table, cols_csv)
        except Exception as e:
            log.warning("D9: Could not add %s: %s", idx_name, e)


def _migrate_property_to_cents(conn):
    """D10: Convert property monetary float columns to integer cents in-place.

    Same pattern as D8. Excludes non-monetary Float columns:
    - property_units.bathrooms (count, e.g. 1.5)
    - security_deposits.interest_rate (APR percentage)
    - mortgages.interest_rate (APR percentage)
    """
    property_monetary_columns = {
        "properties": ["purchase_price", "current_value"],
        "property_units": ["monthly_rent"],
        "leases": ["monthly_rent", "security_deposit"],
        "rent_payments": ["amount_due", "amount_paid", "late_fee"],
        "property_expenses": ["amount"],
        "maintenance_requests": ["cost"],
        "security_deposits": ["amount", "refund_amount"],
        "mortgages": ["original_amount", "current_balance", "monthly_payment"],
    }

    inspector = sa.inspect(engine)
    for table, columns in property_monetary_columns.items():
        try:
            existing = {c["name"] for c in inspector.get_columns(table)}
        except Exception as e:
            log.debug("Skipping D10 cents migration for table %s (not found): %s", table, e)
            continue

        for col in columns:
            if col not in existing:
                continue
            conn.execute(sa.text(
                f"UPDATE {table} SET {col} = CAST(ROUND({col} * 100) AS INTEGER) WHERE {col} IS NOT NULL"
            ))
            log.info("D10: Converted %s.%s to integer cents", table, col)


def _fix_cascade_constraints(conn):
    """D12: Fix missing CASCADE/SET NULL on FK constraints.

    SQLite cannot ALTER existing FK constraints. We must recreate the
    affected tables with the correct ON DELETE clauses.

    Bug 1: asset_history.asset_id needs ON DELETE CASCADE
    Bug 2: batch_prep_meals.meal_id needs ON DELETE SET NULL + nullable
    """
    inspector = sa.inspect(engine)

    # --- Bug 1: asset_history.asset_id ON DELETE CASCADE ---
    if "asset_history" in inspector.get_table_names():
        try:
            # Cleanup from any previous partial run (CRITICAL-2 fix)
            conn.execute(sa.text("DROP TABLE IF EXISTS asset_history_new"))
            # Prune orphaned rows before recreation (HIGH-2 fix)
            conn.execute(sa.text(
                "DELETE FROM asset_history WHERE asset_id NOT IN (SELECT id FROM assets)"
            ))
            conn.execute(sa.text("""
                CREATE TABLE asset_history_new (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    asset_id INTEGER NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
                    date DATE NOT NULL,
                    value INTEGER NOT NULL,
                    change_amount INTEGER,
                    change_note VARCHAR(300),
                    created_at DATETIME
                )
            """))
            conn.execute(sa.text("""
                INSERT INTO asset_history_new (id, asset_id, date, value, change_amount, change_note, created_at)
                SELECT id, asset_id, date, value, change_amount, change_note, created_at
                FROM asset_history
            """))
            conn.execute(sa.text("DROP TABLE asset_history"))
            conn.execute(sa.text("ALTER TABLE asset_history_new RENAME TO asset_history"))
            conn.execute(sa.text("CREATE INDEX IF NOT EXISTS ix_asset_history_asset_id ON asset_history (asset_id)"))
            conn.execute(sa.text("CREATE INDEX IF NOT EXISTS ix_asset_history_date ON asset_history (date)"))
            log.info("D12: Recreated asset_history with ON DELETE CASCADE")
        except Exception as e:
            log.warning("D12: Could not fix asset_history cascade: %s", e)

    # --- Bug 2: batch_prep_meals.meal_id ON DELETE SET NULL + nullable ---
    if "batch_prep_meals" in inspector.get_table_names():
        try:
            # Cleanup from any previous partial run (CRITICAL-2 fix)
            conn.execute(sa.text("DROP TABLE IF EXISTS batch_prep_meals_new"))
            # Prune orphaned rows (session or meal deleted without cascade)
            conn.execute(sa.text(
                "DELETE FROM batch_prep_meals WHERE session_id NOT IN (SELECT id FROM batch_prep_sessions)"
            ))
            conn.execute(sa.text(
                "DELETE FROM batch_prep_meals WHERE meal_id NOT IN (SELECT id FROM meal_plan_entries)"
            ))
            conn.execute(sa.text("""
                CREATE TABLE batch_prep_meals_new (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    session_id INTEGER NOT NULL REFERENCES batch_prep_sessions(id) ON DELETE CASCADE,
                    meal_id INTEGER REFERENCES meal_plan_entries(id) ON DELETE SET NULL
                )
            """))
            conn.execute(sa.text("""
                INSERT INTO batch_prep_meals_new (id, session_id, meal_id)
                SELECT id, session_id, meal_id FROM batch_prep_meals
            """))
            conn.execute(sa.text("DROP TABLE batch_prep_meals"))
            conn.execute(sa.text("ALTER TABLE batch_prep_meals_new RENAME TO batch_prep_meals"))
            conn.execute(sa.text("CREATE INDEX IF NOT EXISTS idx_bpm_session_id ON batch_prep_meals (session_id)"))
            conn.execute(sa.text("CREATE INDEX IF NOT EXISTS idx_bpm_meal_id ON batch_prep_meals (meal_id)"))
            log.info("D12: Recreated batch_prep_meals with ON DELETE SET NULL + CASCADE")
        except Exception as e:
            log.warning("D12: Could not fix batch_prep_meals cascade: %s", e)


def _backfill_null_ingredient_ids(conn):
    """D14: Backfill any NULL ingredient_ids in inventory_items and shopping_list_items.

    Every production code path sets ingredient_id via find_or_create_ingredient(),
    but any legacy items may have NULLs. This migration creates a
    placeholder ingredient for each orphaned item name, then links them.

    Note: SQLite cannot ALTER COLUMN to NOT NULL on existing tables. The model
    declares nullable=False which prevents new NULLs. This migration handles
    existing data.
    """
    inspector = sa.inspect(engine)

    for table in ["inventory_items", "shopping_list_items"]:
        if table not in inspector.get_table_names():
            continue

        # Find rows with NULL ingredient_id
        nulls = conn.execute(sa.text(
            f"SELECT id, name FROM {table} WHERE ingredient_id IS NULL"
        )).fetchall()

        if not nulls:
            continue

        for row_id, name in nulls:
            if not name:
                name = "Unknown Item"
            # Create or find ingredient by canonical name
            from app.models.recipe import generate_canonical_name
            canonical = generate_canonical_name(name)
            if not canonical:
                canonical = name.lower().strip()

            # Check if ingredient exists
            existing = conn.execute(sa.text(
                "SELECT id FROM ingredients WHERE canonical_name = :cn"
            ), {"cn": canonical}).fetchone()

            if existing:
                ing_id = existing[0]
            else:
                conn.execute(sa.text(
                    "INSERT INTO ingredients (name, canonical_name, category) VALUES (:name, :cn, 'other')"
                ), {"name": name, "cn": canonical})
                ing_id = conn.execute(sa.text("SELECT last_insert_rowid()")).scalar()

            conn.execute(sa.text(
                f"UPDATE {table} SET ingredient_id = :ing_id WHERE id = :row_id"
            ), {"ing_id": ing_id, "row_id": row_id})

        log.info("D14: Backfilled %d NULL ingredient_ids in %s", len(nulls), table)


def _add_canonical_name_unique(conn):
    """D13: Add UNIQUE constraint on ingredients.canonical_name.

    The canonical name is the universal join key for the food system.
    Making it UNIQUE enforces the 1:1 canonical→ingredient invariant
    that find_or_create_ingredient() relies on.

    Dedup: merge duplicates by rerouting FKs to the lowest-ID survivor
    (oldest ingredient), then delete the duplicate.
    """
    inspector = sa.inspect(engine)
    if "ingredients" not in inspector.get_table_names():
        return

    # Check if index already exists
    existing_indexes = {idx["name"] for idx in inspector.get_indexes("ingredients")}
    if "uq_ingredients_canonical_name" in existing_indexes:
        return

    # Find and merge duplicate canonical_names (keep lowest ID = oldest)
    dupes = conn.execute(sa.text("""
        SELECT canonical_name, MIN(id) as survivor_id, GROUP_CONCAT(id) as all_ids, COUNT(*) as cnt
        FROM ingredients
        WHERE canonical_name IS NOT NULL
        GROUP BY canonical_name
        HAVING COUNT(*) > 1
    """)).fetchall()

    for row in dupes:
        canonical, survivor_id, all_ids_str, cnt = row
        dup_ids = [int(x) for x in all_ids_str.split(",") if int(x) != survivor_id]

        for dup_id in dup_ids:
            # Reroute all FKs from dup to survivor
            for table, col in [
                ("inventory_items", "ingredient_id"),
                ("shopping_list_items", "ingredient_id"),
                ("recipe_ingredients", "ingredient_id"),
                ("ingredient_aliases", "ingredient_id"),
                ("purchase_history", "ingredient_id"),
            ]:
                try:
                    conn.execute(sa.text(
                        f"UPDATE {table} SET {col} = :survivor WHERE {col} = :dup"
                    ), {"survivor": survivor_id, "dup": dup_id})
                except Exception:
                    pass  # Table may not exist

            conn.execute(sa.text("DELETE FROM ingredients WHERE id = :dup"), {"dup": dup_id})

        log.info("D13: Merged %d duplicates for canonical '%s' (survivor id=%d)", cnt - 1, canonical, survivor_id)

    # Now add the UNIQUE index
    conn.execute(sa.text(
        "CREATE UNIQUE INDEX IF NOT EXISTS uq_ingredients_canonical_name ON ingredients (canonical_name)"
    ))
    log.info("D13: Added UNIQUE index on ingredients.canonical_name")


def _create_fk_indexes():
    """Create indexes on all unindexed foreign key columns. Idempotent."""
    if engine is None:
        return

    fk_indexes = [
        ("idx_bpt_session_id", "batch_prep_tasks", "session_id"),
        ("idx_bpm_session_id", "batch_prep_meals", "session_id"),
        ("idx_bpm_meal_id", "batch_prep_meals", "meal_id"),
        ("idx_bc_parent_id", "budget_categories", "parent_category_id"),
        ("idx_fi_category_id", "financial_items", "category_id"),
        ("idx_fi_recurrence_id", "financial_items", "recurrence_rule_id"),
        ("idx_fi_budget_cat_id", "financial_items", "budget_category_id"),
        ("idx_ev_category_id", "events", "category_id"),
        ("idx_ev_recurrence_id", "events", "recurrence_rule_id"),
        ("idx_inv_category_id", "inventory_items", "category_id"),
        ("idx_inv_meal_id", "inventory_items", "linked_meal_id"),
        ("idx_mpe_recipe_id", "meal_plan_entries", "recipe_id"),
        ("idx_mpt_recipe_id", "meal_plan_templates", "recipe_id"),
        ("idx_ia_ingredient_id", "ingredient_aliases", "ingredient_id"),
        ("idx_rec_category_id", "recipes", "category_id"),
        ("idx_sli_recipe_id", "shopping_list_items", "source_recipe_id"),
        ("idx_tr_category_id", "transaction_recurrences", "category_id"),
        ("idx_tx_income_src", "transactions", "income_source_id"),
        ("idx_tx_recurrence", "transactions", "recurrence_id"),
        # W2.2: Missing FK indexes identified by 13-agent audit (2026-04-01)
        ("idx_inv_ingredient_id", "inventory_items", "ingredient_id"),
        ("idx_sli_ingredient_id", "shopping_list_items", "ingredient_id"),
        ("idx_ba_category_id", "budget_allocations", "category_id"),
    ]

    with engine.connect() as conn:
        for idx_name, table, column in fk_indexes:
            try:
                conn.execute(sa.text(
                    f"CREATE INDEX IF NOT EXISTS {idx_name} ON {table} ({column})"
                ))
            except Exception as e:
                log.debug("Skipping FK index %s on %s.%s: %s", idx_name, table, column, e)
        conn.commit()


def _normalize_inventory_items():
    """One-time data fix: normalize quantity_unit and backfill unit_type for inventory items.

    Fixes items transferred from shopping with non-canonical units (e.g. 'bottles' -> 'bottle',
    'lbs' -> 'pound') and items missing unit_type classification.
    """
    if engine is None:
        return

    from app.services.parsing.quantity_parser import normalize_unit, classify_unit_type

    with engine.connect() as conn:
        try:
            rows = conn.execute(
                sa.text("SELECT id, unit, quantity_unit, unit_type, tracking_mode_override FROM inventory_items")
            ).fetchall()
        except Exception as e:
            log.debug("Skipping inventory normalization (table not ready): %s", e)
            return

        fixed = 0
        for row in rows:
            item_id, unit, quantity_unit, unit_type, tracking_mode_override = row
            try:
                updates = {}

                # Percentage-tracked items use quantity_unit='percent'
                if tracking_mode_override == "percentage" and quantity_unit != "percent":
                    updates["quantity_unit"] = "percent"
                    updates["unit_type"] = "continuous"

                # Normalize quantity_unit if it exists and isn't canonical or 'percent'
                if quantity_unit and quantity_unit != "percent" and tracking_mode_override != "percentage":
                    canonical = normalize_unit(quantity_unit)
                    if canonical != quantity_unit:
                        updates["quantity_unit"] = canonical

                # Backfill quantity_unit from unit field if missing (skip percentage items)
                if not quantity_unit and unit and tracking_mode_override != "percentage":
                    canonical = normalize_unit(unit)
                    if canonical != unit or canonical:
                        updates["quantity_unit"] = canonical

                # Derive unit_type if missing
                effective_unit = updates.get("quantity_unit", quantity_unit)
                if not unit_type and effective_unit:
                    updates["unit_type"] = classify_unit_type(effective_unit)

                if updates:
                    set_clauses = ", ".join(f"{k} = :val_{k}" for k in updates)
                    params = {f"val_{k}": v for k, v in updates.items()}
                    params["item_id"] = item_id
                    conn.execute(
                        sa.text(f"UPDATE inventory_items SET {set_clauses} WHERE id = :item_id"),
                        params,
                    )
                    fixed += 1
            except Exception as row_exc:
                log.warning("Failed to normalize inventory item id=%s: %s", item_id, row_exc)

        if fixed:
            conn.commit()
            log.info("Migration: normalized %d inventory item(s) (unit/unit_type)", fixed)


def _unify_quantity_source_of_truth():
    """Ensure every inventory item has quantity_unit set and quantity reflects
    'how much is left' as single source of truth.

    Populations:
    A) Package-tracked with NULL quantity_unit: derive from package_unit,
       set quantity = max(0, package_size - amount_used).
    B) Legacy 0-100 with NULL quantity_unit and no package data:
       set quantity_unit='percent', unit_type='continuous', sync percent_full.
    C) Items with quantity_unit + package data: trust quantity as source of truth,
       sync amount_used = max(0, package_size - quantity).

    Idempotent: skips if no items need fixing.
    """
    if engine is None:
        return

    from app.services.parsing.quantity_parser import normalize_unit, classify_unit_type

    with engine.connect() as conn:
        try:
            rows = conn.execute(
                sa.text(
                    "SELECT id, quantity, quantity_unit, unit_type, "
                    "package_size, package_unit, amount_used, percent_full "
                    "FROM inventory_items"
                )
            ).fetchall()
        except Exception as e:
            log.debug("Skipping quantity unification (table not ready): %s", e)
            return

        fixed = 0
        for row in rows:
            (item_id, quantity, quantity_unit, unit_type,
             package_size, package_unit, amount_used, percent_full) = row

            updates = {}

            if quantity_unit is None:
                if package_size and package_unit:
                    # Population A: package-tracked, no quantity_unit
                    canonical = normalize_unit(package_unit)
                    updates["quantity_unit"] = canonical
                    updates["unit_type"] = classify_unit_type(canonical)
                    derived_qty = max(0.0, (package_size or 0) - (amount_used or 0))
                    if quantity is None or abs((quantity or 0) - derived_qty) > 0.01:
                        updates["quantity"] = round(derived_qty, 4)
                else:
                    # Population B: legacy 0-100 pseudo-scale
                    updates["quantity_unit"] = "percent"
                    updates["unit_type"] = "continuous"
                    if quantity is not None and (
                        percent_full is None or abs(percent_full - quantity) > 0.01
                    ):
                        updates["percent_full"] = quantity

            elif package_size and package_size > 0 and quantity_unit != "percent":
                # Population C: has quantity_unit + package data — sync amount_used
                if quantity is not None:
                    expected_used = max(0.0, (package_size or 0) - quantity)
                    if amount_used is None or abs(amount_used - expected_used) > 0.01:
                        updates["amount_used"] = round(expected_used, 4)

            if updates:
                set_clauses = ", ".join(f"{k} = :val_{k}" for k in updates)
                params = {f"val_{k}": v for k, v in updates.items()}
                params["item_id"] = item_id
                try:
                    conn.execute(
                        sa.text(
                            f"UPDATE inventory_items SET {set_clauses} WHERE id = :item_id"
                        ),
                        params,
                    )
                    fixed += 1
                except Exception as row_exc:
                    log.warning(
                        "Failed to unify quantity for inventory item id=%s: %s",
                        item_id, row_exc,
                    )

        if fixed:
            conn.commit()
            log.info(
                "Migration: unified quantity source of truth for %d inventory item(s)", fixed
            )
