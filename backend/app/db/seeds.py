"""
Seed and backfill functions for the app database.

These run once after the encrypted engine is initialized (first login).
All functions are idempotent and non-fatal — failure is logged but does not
prevent startup. Each function opens and closes its own session.

Split from database.py (Phase H3) to keep engine/session management separate
from data population.
"""

import logging
from collections import defaultdict

log = logging.getLogger("weekly_review")


def _get_session():
    """Get a fresh session from the app DB engine."""
    from app.database import SessionLocal
    return SessionLocal()


# =============================================================================
# SEED FUNCTIONS — populate default reference data
# =============================================================================

def seed_inventory_categories():
    """Seed default inventory categories if none exist."""
    from app.models.inventory import InventoryCategory

    db = _get_session()
    try:
        existing = db.query(InventoryCategory).first()
        if existing:
            return

        defaults = [
            "Produce", "Dairy", "Meat & Seafood", "Frozen",
            "Pantry", "Beverages", "Condiments", "Snacks",
        ]
        for name in defaults:
            db.add(InventoryCategory(name=name))
        db.commit()
        log.info("Seeded %d inventory categories", len(defaults))
    except Exception as e:
        log.warning("Failed to seed inventory categories: %s", e)
        db.rollback()
    finally:
        db.close()


def seed_recipe_categories():
    """Seed default recipe categories if none exist."""
    from app.models.recipe import RecipeCategory

    db = _get_session()
    try:
        existing = db.query(RecipeCategory).first()
        if existing:
            return

        defaults = [
            "Breakfast", "Lunch", "Dinner", "Dessert",
            "Appetizer", "Side Dish", "Soup", "Salad",
        ]
        for name in defaults:
            db.add(RecipeCategory(name=name))
        db.commit()
        log.info("Seeded %d recipe categories", len(defaults))
    except Exception as e:
        log.warning("Failed to seed recipe categories: %s", e)
        db.rollback()
    finally:
        db.close()


def seed_ingredient_packages():
    """Seed default ingredient package mappings if none exist."""
    from app.models.ingredient_package import IngredientPackage, DEFAULT_PACKAGE_MAPPINGS

    db = _get_session()
    try:
        existing = db.query(IngredientPackage).first()
        if existing:
            return
        for pattern, pkg_type, qty in DEFAULT_PACKAGE_MAPPINGS:
            db.add(IngredientPackage(
                ingredient_pattern=pattern,
                package_type=pkg_type,
                default_quantity=qty,
            ))
        db.commit()
        log.info("Seeded %d ingredient package mappings", len(DEFAULT_PACKAGE_MAPPINGS))
    except Exception as e:
        log.warning("Failed to seed ingredient packages: %s", e)
        db.rollback()
    finally:
        db.close()


def seed_new_package_conversions():
    """Upsert: add DEFAULT entries not yet in DB. Idempotent."""
    from app.models.package_conversion import PackageConversion, DEFAULT_PACKAGE_CONVERSIONS

    db = _get_session()
    try:
        existing = {
            row.ingredient_pattern
            for row in db.query(PackageConversion.ingredient_pattern).all()
        }
        added = 0
        for pattern, pkg_type, pkg_size, pkg_unit, cooking_eq, cooking_unit in DEFAULT_PACKAGE_CONVERSIONS:
            if pattern not in existing:
                db.add(PackageConversion(
                    ingredient_pattern=pattern,
                    package_type=pkg_type,
                    package_size=pkg_size,
                    package_unit=pkg_unit,
                    cooking_equivalent=cooking_eq,
                    cooking_unit=cooking_unit,
                ))
                added += 1
        if added:
            db.commit()
            log.info("Seeded %d new package conversions", added)
    except Exception as e:
        log.warning("Failed to seed new package conversions: %s", e)
        db.rollback()
    finally:
        db.close()


def seed_new_ingredient_aliases():
    """Upsert: add DEFAULT_ALIASES entries not yet in DB. Idempotent."""
    from app.models.ingredient_alias import IngredientAlias, DEFAULT_ALIASES

    db = _get_session()
    try:
        existing = {
            row.alias_name
            for row in db.query(IngredientAlias.alias_name).all()
        }
        added = 0
        for alias_name, canonical_name in DEFAULT_ALIASES.items():
            if alias_name not in existing:
                db.add(IngredientAlias(
                    alias_name=alias_name,
                    canonical_name=canonical_name,
                    is_custom=False,
                ))
                added += 1
        if added:
            db.commit()
            log.info("Seeded %d new ingredient aliases", added)
    except Exception as e:
        log.warning("Failed to seed new ingredient aliases: %s", e)
        db.rollback()
    finally:
        db.close()


def seed_budget_categories():
    """Seed default budget categories following 50/30/20 rule."""
    from app.models.budget import BudgetCategory

    db = _get_session()
    try:
        existing = db.query(BudgetCategory).first()
        if existing:
            return
        defaults = [
            ("Housing", "need", "#6366f1", 1),
            ("Groceries", "need", "#22c55e", 2),
            ("Utilities", "need", "#f59e0b", 3),
            ("Transportation", "need", "#3b82f6", 4),
            ("Insurance", "need", "#8b5cf6", 5),
            ("Healthcare", "need", "#d97706", 6),
            ("Dining Out", "want", "#f97316", 7),
            ("Entertainment", "want", "#ec4899", 8),
            ("Shopping", "want", "#14b8a6", 9),
            ("Subscriptions", "want", "#a855f7", 10),
            ("Personal Care", "want", "#06b6d4", 11),
            ("Emergency Fund", "savings", "#10b981", 12),
            ("Savings", "savings", "#0ea5e9", 13),
            ("Debt Payments", "debt", "#64748b", 14),
        ]
        for name, cat_type, color, sort_order in defaults:
            db.add(BudgetCategory(
                name=name, type=cat_type, color=color, sort_order=sort_order,
            ))
        db.commit()
        log.info("Seeded %d budget categories", len(defaults))
    except Exception as e:
        log.warning("Failed to seed budget categories: %s", e)
        db.rollback()
    finally:
        db.close()


def seed_dietary_restrictions():
    """Seed default dietary restrictions."""
    from app.models.dietary_restriction import DietaryRestriction, DEFAULT_DIETARY_RESTRICTIONS

    db = _get_session()
    try:
        existing = db.query(DietaryRestriction).first()
        if existing:
            return
        for item in DEFAULT_DIETARY_RESTRICTIONS:
            db.add(DietaryRestriction(
                name=item["name"],
                icon=item["icon"],
                description=item["description"],
                is_system=True,
            ))
        db.commit()
        log.info("Seeded %d dietary restrictions", len(DEFAULT_DIETARY_RESTRICTIONS))
    except Exception as e:
        log.warning("Failed to seed dietary restrictions: %s", e)
        db.rollback()
    finally:
        db.close()


# =============================================================================
# BACKFILL FUNCTIONS — one-time data repair/migration
# =============================================================================

def backfill_ingredient_food_categories():
    """Backfill food_category for existing ingredients that lack it."""
    from app.models.recipe import Ingredient
    from app.services.expiration_defaults import detect_food_category

    db = _get_session()
    try:
        count = db.query(Ingredient).filter(Ingredient.food_category == None).count()  # noqa: E711
        if count == 0:
            return
        ingredients = db.query(Ingredient).filter(Ingredient.food_category == None).all()  # noqa: E711
        for ingredient in ingredients:
            ingredient.food_category = detect_food_category(ingredient.name).value
        db.commit()
        log.info("Backfilled food_category for %d ingredients", count)
    except Exception as e:
        log.warning("Failed to backfill ingredient food categories: %s", e)
        db.rollback()
    finally:
        db.close()


def backfill_canonical_names():
    """
    Re-canonicalize all Ingredients with the current generate_canonical_name()
    (including plural normalization). Then merge duplicates by updating FKs.
    """
    from app.models.recipe import Ingredient, RecipeIngredient, generate_canonical_name
    from app.models.inventory import InventoryItem

    db = _get_session()
    try:
        ingredients = db.query(Ingredient).all()
        if not ingredients:
            return

        updated = 0
        for ing in ingredients:
            new_canonical = generate_canonical_name(ing.name)
            if ing.canonical_name != new_canonical:
                ing.canonical_name = new_canonical
                updated += 1

        if updated == 0:
            return

        db.flush()

        # Group by canonical_name to find duplicates
        groups = defaultdict(list)
        for ing in ingredients:
            if ing.canonical_name:
                groups[ing.canonical_name].append(ing)

        merged = 0
        for canonical, group in groups.items():
            if len(group) <= 1:
                continue

            # Keep the lowest-id as survivor
            group.sort(key=lambda i: i.id)
            survivor = group[0]
            duplicates = group[1:]

            for dup in duplicates:
                # Update RecipeIngredient FKs
                db.query(RecipeIngredient).filter(
                    RecipeIngredient.ingredient_id == dup.id
                ).update({"ingredient_id": survivor.id}, synchronize_session="fetch")

                # Update InventoryItem FKs
                db.query(InventoryItem).filter(
                    InventoryItem.ingredient_id == dup.id
                ).update({"ingredient_id": survivor.id}, synchronize_session="fetch")

                # Update ShoppingListItem FKs if the model exists
                try:
                    from app.models.shopping_list import ShoppingListItem
                    db.query(ShoppingListItem).filter(
                        ShoppingListItem.ingredient_id == dup.id
                    ).update({"ingredient_id": survivor.id}, synchronize_session="fetch")
                except Exception as e:
                    log.warning("FK update failed for ingredient dedup (dup=%s, survivor=%s): %s", dup.id, survivor.id, e)
                    db.rollback()

                db.delete(dup)
                merged += 1

        db.commit()
        if updated or merged:
            log.info("Canonical names: updated %d, merged %d duplicates", updated, merged)
    except Exception as e:
        log.warning("Failed to backfill canonical names: %s", e)
        db.rollback()
    finally:
        db.close()


def backfill_clean_ingredient_names():
    """
    One-time data migration: re-parse ingredient names through the fixed parser
    to clean raw/unprocessed text (dual metrics, trailing quantities, orphaned
    parens, section headers, double parens, etc.).

    Safe to re-run — only updates records where parsed name differs from stored name.
    Also applies sentence-case normalization and re-canonicalizes updated names.
    """
    import re as _re
    from app.models.recipe import Ingredient, generate_canonical_name
    from app.services.parsing.food_item_parser import parse_ingredient_line

    # Patterns that indicate a name needs re-parsing (raw/unprocessed text)
    _BAD_NAME_PATTERNS = _re.compile(
        r'(?:'
        r'\d+\s*(?:lb|lbs|oz|g|kg|ml)\b'  # embedded quantity+unit
        r'|\(\('                             # double parens
        r'|\(\s*,'                           # orphaned "(,"
        r'|^optional\s*:'                    # section header prefix
        r'|;\s+'                             # semicolon notes not split
        r'|\(\s*for\s+'                      # "(for serving)" not stripped
        r')',
        _re.IGNORECASE
    )

    db = _get_session()
    try:
        ingredients = db.query(Ingredient).all()
        if not ingredients:
            return

        updated = 0
        for ing in ingredients:
            new_name = ing.name

            # Phase A: Re-parse only names with known bad patterns
            if _BAD_NAME_PATTERNS.search(ing.name):
                result = parse_ingredient_line(ing.name)
                cleaned = result.name.strip() if result.name else None
                # Safety: don't accept if cleaned name is too short (< 3 chars)
                # or lost more than 70% of original length (unless result is still >= 10 chars)
                if cleaned and len(cleaned) >= 3 and (len(cleaned) >= 10 or len(cleaned) > len(ing.name) * 0.3):
                    new_name = cleaned

            # Phase B: Sentence-case normalization
            if new_name and new_name[0].islower():
                new_name = new_name[0].upper() + new_name[1:]

            # Skip if nothing changed
            if new_name == ing.name:
                continue

            ing.name = new_name
            ing.canonical_name = generate_canonical_name(new_name)
            updated += 1

        if updated > 0:
            db.commit()
            log.info("Ingredient names: cleaned %d records", updated)
    except Exception as e:
        log.warning("Failed to clean ingredient names: %s", e)
        db.rollback()
    finally:
        db.close()


def backfill_unified_inventory():
    """Backfill unified tracking columns (unit_type, quantity_unit, etc.) on existing items."""
    from app.services.inventory_service import backfill_unified_columns

    db = _get_session()
    try:
        backfill_unified_columns(db)
    except Exception as e:
        log.warning("Failed to backfill unified inventory columns: %s", e)
        db.rollback()
    finally:
        db.close()


def repair_orphaned_package_inventory():
    """Repair items with package_size+package_unit but missing quantity_unit."""
    from app.services.inventory_service import repair_orphaned_package_items

    db = _get_session()
    try:
        repair_orphaned_package_items(db)
    except Exception as e:
        log.warning("Failed to repair orphaned package items: %s", e)
        db.rollback()
    finally:
        db.close()


def consolidate_duplicate_inventory():
    """
    One-time data migration: merge duplicate inventory items that share
    the same ingredient_id + location. Keeps the item with the highest id
    (most recent), sums quantities from duplicates, then deletes extras.

    Safe to re-run — if no duplicates exist, it's a no-op.
    """
    from app.models.inventory import InventoryItem

    db = _get_session()
    try:
        items = db.query(InventoryItem).filter(
            InventoryItem.ingredient_id.isnot(None)
        ).all()
        if not items:
            return

        # Group by (ingredient_id, location)
        groups: dict[tuple, list] = defaultdict(list)
        for item in items:
            key = (item.ingredient_id, item.location)
            groups[key].append(item)

        merged_count = 0
        deleted_count = 0
        for key, group in groups.items():
            if len(group) <= 1:
                continue

            # Keep the newest item (highest id), merge others into it
            group.sort(key=lambda i: i.id)
            survivor = group[-1]
            duplicates = group[:-1]

            for dup in duplicates:
                survivor.quantity = (survivor.quantity or 0) + (dup.quantity or 0)

                # Backfill nulls on survivor
                if not survivor.category_id and dup.category_id:
                    survivor.category_id = dup.category_id
                if not survivor.food_category and dup.food_category:
                    survivor.food_category = dup.food_category
                if not survivor.expiration_date and dup.expiration_date:
                    survivor.expiration_date = dup.expiration_date

                db.delete(dup)
                deleted_count += 1

            merged_count += 1

        if merged_count:
            db.commit()
            log.info("Inventory consolidation: merged %d groups, deleted %d duplicates", merged_count, deleted_count)
    except Exception as e:
        log.warning("Failed to consolidate duplicate inventory: %s", e)
        db.rollback()
    finally:
        db.close()


def backfill_inventory_units():
    """
    One-shot migration: fix existing inventory items to use package-aware storage.

    - Deletes section-header items ("Optional toppings: ...")
    - Cleans display names (strips prep methods, embedded quantities, parens)
    - Applies PackageConversion metadata to items missing package tracking
    - Fixes spices stuck at "1 count" by applying jar metadata
    - Fixes category using unified detect_food_category()

    Safe to re-run — idempotent (skips items already fixed).
    """
    from app.models.inventory import InventoryItem
    from app.services.inventory_unit_recommender import (
        clean_display_name, is_section_header,
    )
    from app.services.package_converter import find_conversion
    from app.services.expiration_defaults import (
        detect_food_category, CATEGORY_DISPLAY_MAP,
    )
    from app.services.parsing.quantity_parser import normalize_unit, classify_unit_type

    db = _get_session()
    try:
        items = db.query(InventoryItem).all()
        if not items:
            return

        fixed = 0
        deleted = 0

        for item in items:
            changed = False

            # 1. Delete section-header items
            if is_section_header(item.name or ''):
                db.delete(item)
                deleted += 1
                continue

            # Delete items with double-paren noise in name
            if '((' in (item.name or ''):
                db.delete(item)
                deleted += 1
                continue

            # 2. Clean display names
            if item.name:
                clean = clean_display_name(item.name)
                if clean != item.name:
                    item.name = clean
                    changed = True

            # 3. Apply PackageConversion to items without package tracking
            if not item.package_size:
                conv = find_conversion(db, item.name or '')
                if conv:
                    item.package_size = conv.package_size
                    item.package_unit = conv.package_unit
                    item.package_label = (
                        f"{conv.package_size}{conv.package_unit} "
                        f"{conv.package_type}"
                    )
                    item.packages_count = item.packages_count or 1.0
                    item.amount_used = item.amount_used or 0.0
                    item.amount_used_unit = conv.package_unit
                    # Update unit to container type
                    item.unit = conv.package_type
                    item.quantity_unit = normalize_unit(conv.package_type)
                    item.unit_type = classify_unit_type(item.quantity_unit)
                    if item.quantity is None or item.quantity <= 0:
                        item.quantity = 1
                    changed = True

            # 4. Fix category using unified detection
            if item.name:
                correct_cat = detect_food_category(item.name)
                correct_display = CATEGORY_DISPLAY_MAP.get(correct_cat, "Other")
                if item.food_category != correct_cat.value:
                    item.food_category = correct_cat.value
                    changed = True

            if changed:
                fixed += 1

        if fixed or deleted:
            db.commit()
            parts = []
            if fixed:
                parts.append(f"fixed {fixed} items")
            if deleted:
                parts.append(f"deleted {deleted} malformed items")
            log.info("Inventory unit backfill: %s", ", ".join(parts))
    except Exception as e:
        log.warning("Failed to backfill inventory units: %s", e)
        db.rollback()
    finally:
        db.close()


# =============================================================================
# SEED REGISTRY — ordered list for run_seeds_and_migrations()
# =============================================================================

ALL_SEEDS = [
    seed_inventory_categories,
    seed_recipe_categories,
    seed_ingredient_packages,
    seed_new_package_conversions,
    seed_new_ingredient_aliases,
    seed_budget_categories,
    seed_dietary_restrictions,
    backfill_ingredient_food_categories,
    backfill_clean_ingredient_names,
    backfill_canonical_names,
    consolidate_duplicate_inventory,
    backfill_unified_inventory,
    repair_orphaned_package_inventory,
    backfill_inventory_units,
]
