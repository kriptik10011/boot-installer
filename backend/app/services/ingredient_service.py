"""
Ingredient Service — shared find-or-create logic.

Centralizes ingredient lookup and creation so that every code path
(recipe import, shopping list generation, manual add) produces
Ingredient records with canonical_name and category set.
"""

import json
import logging

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

log = logging.getLogger("weekly_review")

from app.models import (
    Ingredient,
    IngredientPackage,
    IngredientAlias,
    generate_canonical_name,
    infer_category_from_name,
)
from app.services.expiration_defaults import detect_food_category


def find_or_create_ingredient(db: Session, name: str, unit: str = None) -> Ingredient:
    """
    Find existing ingredient by canonical name or create new one.

    Unified ingredient architecture:
    - Uses canonical_name for matching (eliminates ILIKE fragility)
    - Checks aliases as fallback
    - Creates new ingredient with inferred category for cold start

    Returns the linked Ingredient record.
    """
    canonical = generate_canonical_name(name)

    # Guard: empty/whitespace name produces empty canonical — reject early
    if not canonical:
        raise ValueError(f"Cannot create ingredient from empty or whitespace-only name: {name!r}")

    # Try exact canonical match first
    ingredient = db.query(Ingredient).filter(
        Ingredient.canonical_name == canonical
    ).first()

    if ingredient:
        # Lazy backfill: ensure food_category is populated
        if not ingredient.food_category:
            ingredient.food_category = detect_food_category(ingredient.name).value
            db.flush()
        return ingredient

    # V2: Check IngredientAlias table for known aliases
    # "scallions" → canonical "green onion" → finds "green onion" Ingredient
    alias_entry = db.query(IngredientAlias).filter(
        IngredientAlias.alias_name == canonical
    ).first()
    if not alias_entry:
        # Also check by raw lowercase name (in case canonical differs)
        alias_entry = db.query(IngredientAlias).filter(
            IngredientAlias.alias_name == name.lower().strip()
        ).first()

    if alias_entry:
        # Look up ingredient by alias's canonical_name
        aliased = db.query(Ingredient).filter(
            Ingredient.canonical_name == alias_entry.canonical_name
        ).first()
        if aliased:
            if not aliased.food_category:
                aliased.food_category = detect_food_category(aliased.name).value
                db.flush()
            return aliased

    # Try alias match (JSON contains check on Ingredient.aliases field)
    # Note: SQLite JSON support varies, so we check in Python
    all_ingredients = db.query(Ingredient).filter(
        Ingredient.aliases != None,
        Ingredient.aliases != '[]'
    ).all()

    for ing in all_ingredients:
        aliases = ing.aliases or []
        if isinstance(aliases, str):
            try:
                aliases = json.loads(aliases)
            except json.JSONDecodeError as e:
                log.warning("Corrupted aliases JSON for ingredient %s (%s): %s", ing.id, ing.name, e)
                aliases = []
        if isinstance(aliases, list) and canonical in [str(a).lower() for a in aliases]:
            # Lazy backfill: ensure food_category is populated
            if not ing.food_category:
                ing.food_category = detect_food_category(ing.name).value
                db.flush()
            return ing

    # Create new ingredient with cold-start category inference
    category = infer_category_from_name(name)
    food_cat = detect_food_category(name)
    # Sentence-case display name: "chopped nuts" -> "Chopped nuts", "CHICKEN" -> "Chicken"
    if name and name[0].islower():
        display_name = name[0].upper() + name[1:]
    elif name and name.isupper() and len(name) > 1:
        display_name = name.capitalize()
    else:
        display_name = name
    ingredient = Ingredient(
        name=display_name,
        canonical_name=canonical,
        default_unit=unit,
        category=category,
        food_category=food_cat.value,
    )

    # Check if we have a package mapping for this ingredient
    safe_canonical = canonical.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    package = db.query(IngredientPackage).filter(
        IngredientPackage.ingredient_pattern.ilike(safe_canonical, escape="\\")
    ).first()

    if package:
        ingredient.package_type = package.package_type
        ingredient.default_package_qty = float(package.default_quantity)

    db.add(ingredient)
    try:
        db.flush()  # Get the ID without committing
    except IntegrityError:
        # Race condition: another request created the same canonical_name
        # between our lookup and insert. Rollback and fetch the winner.
        db.rollback()
        existing = db.query(Ingredient).filter_by(canonical_name=canonical).first()
        if existing:
            log.debug("Canonical dedup race resolved: '%s' → id=%d", canonical, existing.id)
            return existing
        raise  # Unexpected — re-raise if the duplicate vanished

    return ingredient


def find_ingredient_readonly(db: Session, name: str) -> Ingredient | None:
    """
    Read-only ingredient lookup — same matching logic as find_or_create_ingredient
    but returns None instead of creating when not found.

    Used by preview inventory checks where we don't want to persist new records.
    """
    canonical = generate_canonical_name(name)
    if not canonical:
        return None

    # Try exact canonical match
    ingredient = db.query(Ingredient).filter(
        Ingredient.canonical_name == canonical
    ).first()
    if ingredient:
        return ingredient

    # Check IngredientAlias table
    alias_entry = db.query(IngredientAlias).filter(
        IngredientAlias.alias_name == canonical
    ).first()
    if not alias_entry:
        alias_entry = db.query(IngredientAlias).filter(
            IngredientAlias.alias_name == name.lower().strip()
        ).first()

    if alias_entry:
        aliased = db.query(Ingredient).filter(
            Ingredient.canonical_name == alias_entry.canonical_name
        ).first()
        if aliased:
            return aliased

    # Check JSON aliases field
    all_with_aliases = db.query(Ingredient).filter(
        Ingredient.aliases != None,
        Ingredient.aliases != '[]'
    ).all()

    for ing in all_with_aliases:
        aliases = ing.aliases or []
        if isinstance(aliases, str):
            try:
                aliases = json.loads(aliases)
            except json.JSONDecodeError:
                aliases = []
        if isinstance(aliases, list) and canonical in [str(a).lower() for a in aliases]:
            return ing

    return None
