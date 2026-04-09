"""
Recipes API endpoints.

Recipe import from URL:
- POST /recipes/import/preview - Extract recipe from URL
- POST /recipes/import/confirm - Save imported recipe
- POST /recipes/import/ai-parse - Parse AI-generated JSON
"""

import json
import logging
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.orm import Session, joinedload
from slowapi import Limiter
from slowapi.util import get_remote_address

from app.database import get_db
from app.models import Recipe, RecipeIngredient, RecipeCategory, RecipeTag
from app.services.ingredient_service import find_or_create_ingredient
from app.services.parsing.quantity_parser import normalize_unit
from app.services.recipe_scraper import (
    scrape_recipe_url,
    ExtractedRecipe,
    parse_ingredient_line,
    merge_split_instruction_steps,
)
from app.schemas.recipe_import import (
    ImportPreviewRequest,
    ImportPreviewResponse,
    ImportConfirmRequest,
    AIPasteRequest,
    ExtractedRecipeSchema,
    ExtractedIngredientSchema,
)
from app.schemas.recipes import (
    RecipeCreate,
    RecipeUpdate,
    RecipeResponse,
    RecipeIngredientResponse,
    RecipeTagResponse,
    RecipeWithIngredientsResponse,
    IngredientMatchSchema,
    PantrySuggestionSchema,
    CoverageCheckRequest,
    IngredientStatusSchema,
    CoverageCheckResponse,
)

router = APIRouter()
limiter = Limiter(key_func=get_remote_address)
logger = logging.getLogger("weekly_review")


# =============================================================================
# Endpoints
# =============================================================================

@router.get("", response_model=List[RecipeWithIngredientsResponse])
@limiter.limit("100/minute")
def list_recipes(
    request: Request,
    category_id: Optional[int] = None,
    search: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """List all recipes with ingredients, optionally filtered by category or search term."""
    query = db.query(Recipe).options(
        joinedload(Recipe.ingredients).joinedload(RecipeIngredient.ingredient),
        joinedload(Recipe.tags),
    )
    if category_id:
        query = query.filter(Recipe.category_id == category_id)
    if search:
        safe = search.replace("\\", "\\\\").replace("%", r"\%").replace("_", r"\_")
        query = query.filter(Recipe.name.ilike(f"%{safe}%", escape="\\"))

    recipes = query.order_by(Recipe.name).limit(1000).all()

    # Build response with ingredients
    result = []
    for recipe in recipes:
        ingredients_response = []
        for ri in recipe.ingredients:
            ingredients_response.append(RecipeIngredientResponse(
                ingredient_id=ri.ingredient_id,
                ingredient_name=ri.ingredient.name if ri.ingredient else "Unknown",
                quantity=ri.quantity,
                unit=ri.unit,
                notes=ri.notes
            ))

        result.append(RecipeWithIngredientsResponse(
            id=recipe.id,
            name=recipe.name,
            category_id=recipe.category_id,
            instructions=recipe.instructions,
            prep_time_minutes=recipe.prep_time_minutes,
            cook_time_minutes=recipe.cook_time_minutes,
            servings=recipe.servings,
            source=recipe.source,
            image_url=recipe.image_url,
            notes=recipe.notes,
            cuisine_type=recipe.cuisine_type,
            created_at=recipe.created_at,
            updated_at=recipe.updated_at,
            ingredients=ingredients_response,
            tags=[RecipeTagResponse(id=t.id, name=t.name, color=t.color) for t in recipe.tags],
        ))

    return result


@router.get("/{recipe_id}", response_model=RecipeWithIngredientsResponse)
@limiter.limit("100/minute")
def get_recipe(request: Request, recipe_id: int, db: Session = Depends(get_db)):
    """Get a single recipe by ID with ingredients."""
    recipe = db.query(Recipe).options(
        joinedload(Recipe.ingredients).joinedload(RecipeIngredient.ingredient),
        joinedload(Recipe.tags),
    ).filter(Recipe.id == recipe_id).first()

    if not recipe:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Recipe not found"
        )

    # Build ingredients response with ingredient names
    ingredients_response = []
    for ri in recipe.ingredients:
        ingredients_response.append(RecipeIngredientResponse(
            ingredient_id=ri.ingredient_id,
            ingredient_name=ri.ingredient.name,
            quantity=ri.quantity,
            unit=ri.unit,
            notes=ri.notes
        ))

    # Return recipe with ingredients and tags
    return RecipeWithIngredientsResponse(
        id=recipe.id,
        name=recipe.name,
        category_id=recipe.category_id,
        instructions=recipe.instructions,
        prep_time_minutes=recipe.prep_time_minutes,
        cook_time_minutes=recipe.cook_time_minutes,
        servings=recipe.servings,
        source=recipe.source,
        image_url=recipe.image_url,
        notes=recipe.notes,
        cuisine_type=recipe.cuisine_type,
        created_at=recipe.created_at,
        updated_at=recipe.updated_at,
        ingredients=ingredients_response,
        tags=[RecipeTagResponse(id=t.id, name=t.name, color=t.color) for t in recipe.tags],
    )


@router.post("", response_model=RecipeResponse, status_code=status.HTTP_201_CREATED)
@limiter.limit("30/minute")
def create_recipe(request: Request, recipe: RecipeCreate, db: Session = Depends(get_db)):
    """Create a new recipe."""
    db_recipe = Recipe(**recipe.model_dump())
    db.add(db_recipe)
    db.commit()
    db.refresh(db_recipe)
    return db_recipe


@router.put("/{recipe_id}", response_model=RecipeResponse)
@limiter.limit("30/minute")
def update_recipe(request: Request, recipe_id: int, recipe: RecipeUpdate, db: Session = Depends(get_db)):
    """Update an existing recipe."""
    db_recipe = db.query(Recipe).filter(Recipe.id == recipe_id).first()
    if not db_recipe:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Recipe not found"
        )

    update_data = recipe.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_recipe, key, value)

    db.commit()
    db.refresh(db_recipe)
    return db_recipe


@router.delete("/{recipe_id}", response_model=None, status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit("30/minute")
def delete_recipe(request: Request, recipe_id: int, db: Session = Depends(get_db)):
    """Delete a recipe.

    - Meal plan entries using this recipe will have recipe_id set to NULL
    - Recipe ingredients will be deleted
    - Recipe tag associations will be deleted
    """
    from app.models import MealPlanEntry, RecipeIngredient
    from sqlalchemy import text

    db_recipe = db.query(Recipe).filter(Recipe.id == recipe_id).first()
    if not db_recipe:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Recipe not found"
        )

    # 1. Unlink from any meal plan entries (set recipe_id to NULL)
    db.query(MealPlanEntry).filter(MealPlanEntry.recipe_id == recipe_id).update(
        {"recipe_id": None},
        synchronize_session=False
    )

    # 2. Delete recipe ingredients (junction table, can't set to NULL)
    db.query(RecipeIngredient).filter(RecipeIngredient.recipe_id == recipe_id).delete(
        synchronize_session=False
    )

    # 3. Delete recipe tag associations
    db.execute(
        text("DELETE FROM recipe_tag_associations WHERE recipe_id = :recipe_id"),
        {"recipe_id": recipe_id}
    )

    # 4. Delete the recipe
    db.delete(db_recipe)
    db.commit()
    return None


# =============================================================================
# Recipe Import Endpoints
# =============================================================================

@router.post("/import/preview", response_model=ImportPreviewResponse)
@limiter.limit("10/minute")
async def import_preview(request: Request, data: ImportPreviewRequest):
    """
    Preview a recipe import from a URL.

    Attempts to extract recipe data using:
    1. recipe-scrapers library (100+ supported sites)
    2. Generic schema.org parsing
    3. Returns AI prompt for manual extraction

    Returns extracted recipe or fallback AI prompt.
    """
    logger.info("[IMPORT] Received URL for import")
    logger.debug("[IMPORT] URL: %s", data.url)
    result = await scrape_recipe_url(data.url)
    logger.info("[IMPORT] Result type: %s", type(result).__name__)

    if isinstance(result, ExtractedRecipe):
        logger.info("[IMPORT] SUCCESS: recipe imported")
        logger.debug("[IMPORT] Recipe name: %s", result.name)
        # Successfully extracted
        return ImportPreviewResponse(
            success=True,
            recipe=ExtractedRecipeSchema(
                name=result.name,
                instructions=result.instructions,
                ingredients=[
                    ExtractedIngredientSchema(
                        name=ing.name,
                        quantity=str(ing.quantity) if ing.quantity is not None else None,
                        unit=ing.unit,
                        notes=ing.notes,
                        raw_text=ing.raw_text
                    )
                    for ing in result.ingredients
                ],
                prep_time_minutes=result.prep_time_minutes,
                cook_time_minutes=result.cook_time_minutes,
                total_time_minutes=result.total_time_minutes,
                servings=result.servings,
                source_url=result.source_url,
                source_site=result.source_site,
                image_url=result.image_url,
                cuisine_type=result.cuisine_type,
                notes=result.notes,
                confidence=result.confidence,
                extraction_method=result.extraction_method
            ),
            source_url=result.source_url
        )
    else:
        # Fallback response
        return ImportPreviewResponse(
            success=False,
            error_message=result.error_message,
            ai_prompt=result.ai_prompt,
            source_url=result.source_url
        )


@router.post("/import/confirm", response_model=RecipeWithIngredientsResponse, status_code=status.HTTP_201_CREATED)
@limiter.limit("30/minute")
def import_confirm(request: Request, data: ImportConfirmRequest, db: Session = Depends(get_db)):
    """
    Confirm and save an imported recipe.

    Creates the recipe and links ingredients.
    Returns the full recipe with ingredients so frontend has complete data immediately.
    """
    # Create the recipe
    db_recipe = Recipe(
        name=data.name,
        instructions=data.instructions,
        prep_time_minutes=data.prep_time_minutes,
        cook_time_minutes=data.cook_time_minutes,
        servings=data.servings,
        source=data.source_url,
        image_url=data.image_url,
        cuisine_type=data.cuisine_type,
        notes=data.notes,
        category_id=data.category_id
    )
    db.add(db_recipe)
    db.flush()  # Get the recipe ID

    # Add ingredients and build response list
    # Track seen ingredient_ids to skip duplicates (e.g., "olive oil" and "extra virgin olive oil"
    # both resolve to the same canonical ingredient)
    ingredients_response = []
    seen_ingredient_ids = set()
    for ing_data in data.ingredients:
        # Skip empty ingredient names (section headers like "(For the sauce:)")
        if not ing_data.name or not ing_data.name.strip():
            logger.warning("Skipping ingredient with empty name (raw: %r)", ing_data)
            continue

        # Find or create ingredient via shared service
        # Sets canonical_name + category for downstream matching
        try:
            ingredient = find_or_create_ingredient(db, ing_data.name, ing_data.unit)
        except ValueError as e:
            logger.warning("Skipping ingredient that failed validation: %s", e)
            continue

        # Consolidate duplicate ingredient quantities instead of dropping them
        if ingredient.id in seen_ingredient_ids:
            # Find the existing RecipeIngredient and consolidate
            for existing_ri in ingredients_response:
                if existing_ri.ingredient_id == ingredient.id:
                    # Attempt to consolidate quantities
                    if ing_data.quantity and existing_ri.quantity:
                        try:
                            existing_qty = float(existing_ri.quantity)
                            new_qty = float(ing_data.quantity)
                            existing_ri.quantity = str(existing_qty + new_qty)
                            # Also update the DB record
                            for ri in db.query(RecipeIngredient).filter(
                                RecipeIngredient.recipe_id == db_recipe.id,
                                RecipeIngredient.ingredient_id == ingredient.id
                            ).limit(100).all():
                                ri.quantity = existing_ri.quantity
                            logger.info(
                                "Consolidated duplicate ingredient '%s': %s + %s = %s",
                                ingredient.name, existing_qty, new_qty, existing_ri.quantity,
                            )
                        except (ValueError, TypeError):
                            # Can't parse quantities — append note instead
                            note_addition = f"Also: {ing_data.quantity or ''} {ing_data.unit or ''} {ing_data.name}".strip()
                            if existing_ri.notes:
                                existing_ri.notes = f"{existing_ri.notes}; {note_addition}"
                            else:
                                existing_ri.notes = note_addition
                            logger.info(
                                "Could not consolidate quantities for '%s', added to notes",
                                ingredient.name,
                            )
                    break
            continue
        seen_ingredient_ids.add(ingredient.id)

        # Normalize unit before storage for consistent display
        normalized_unit = normalize_unit(ing_data.unit) if ing_data.unit else ing_data.unit

        # Create recipe-ingredient link
        recipe_ingredient = RecipeIngredient(
            recipe_id=db_recipe.id,
            ingredient_id=ingredient.id,
            quantity=ing_data.quantity,
            unit=normalized_unit,
            notes=ing_data.notes
        )
        db.add(recipe_ingredient)

        # Build response ingredient
        ingredients_response.append(RecipeIngredientResponse(
            ingredient_id=ingredient.id,
            ingredient_name=ingredient.name,
            quantity=ing_data.quantity,
            unit=normalized_unit,
            notes=ing_data.notes
        ))

    db.commit()
    db.refresh(db_recipe)

    # Return full recipe with ingredients (tags empty for new imports)
    return RecipeWithIngredientsResponse(
        id=db_recipe.id,
        name=db_recipe.name,
        category_id=db_recipe.category_id,
        instructions=db_recipe.instructions,
        prep_time_minutes=db_recipe.prep_time_minutes,
        cook_time_minutes=db_recipe.cook_time_minutes,
        servings=db_recipe.servings,
        source=db_recipe.source,
        image_url=db_recipe.image_url,
        notes=db_recipe.notes,
        cuisine_type=db_recipe.cuisine_type,
        created_at=db_recipe.created_at,
        updated_at=db_recipe.updated_at,
        ingredients=ingredients_response,
        tags=[],
    )


@router.post("/import/ai-parse", response_model=ImportPreviewResponse)
@limiter.limit("30/minute")
def import_ai_parse(request: Request, data: AIPasteRequest):
    """
    Parse AI-generated JSON into recipe preview format.

    Use when automated extraction fails and user pastes AI output.
    """
    try:
        # Parse the JSON
        recipe_data = json.loads(data.json_text)

        # Extract ingredients
        ingredients = []
        for ing in recipe_data.get('ingredients', []):
            if isinstance(ing, str):
                # Parse string format
                parsed = parse_ingredient_line(ing)
                ingredients.append(ExtractedIngredientSchema(
                    name=parsed.name,
                    quantity=str(parsed.quantity) if parsed.quantity is not None else None,
                    unit=parsed.unit,
                    notes=parsed.notes,
                    raw_text=parsed.raw_text
                ))
            elif isinstance(ing, dict):
                ingredients.append(ExtractedIngredientSchema(
                    name=ing.get('name', ''),
                    quantity=ing.get('quantity'),
                    unit=ing.get('unit'),
                    notes=ing.get('notes'),
                    raw_text=str(ing)
                ))

        # Build recipe - post-process instructions to merge split steps
        raw_instructions = recipe_data.get('instructions', '')
        cleaned_instructions = merge_split_instruction_steps(raw_instructions)

        recipe = ExtractedRecipeSchema(
            name=recipe_data.get('name', 'Untitled Recipe'),
            instructions=cleaned_instructions,
            ingredients=ingredients,
            prep_time_minutes=recipe_data.get('prep_time_minutes'),
            cook_time_minutes=recipe_data.get('cook_time_minutes'),
            total_time_minutes=recipe_data.get('total_time_minutes'),
            servings=recipe_data.get('servings'),
            source_url=data.source_url,
            source_site="AI Import",
            cuisine_type=recipe_data.get('cuisine_type'),
            notes=recipe_data.get('notes'),
            confidence=0.8,
            extraction_method="ai-paste"
        )

        return ImportPreviewResponse(
            success=True,
            recipe=recipe,
            source_url=data.source_url
        )

    except json.JSONDecodeError as e:
        logger.error("AI parse JSON decode error: %s", e)
        return ImportPreviewResponse(
            success=False,
            error_message="Invalid JSON format",
            source_url=data.source_url
        )
    except Exception as e:
        logger.error("AI parse failed: %s", e)
        return ImportPreviewResponse(
            success=False,
            error_message="Failed to parse recipe data",
            source_url=data.source_url
        )


# ============================================================================
# Pantry-First Suggestions
# ============================================================================

@router.get("/suggest/from-pantry", response_model=List[PantrySuggestionSchema])
@limiter.limit("30/minute")
def suggest_from_pantry_endpoint(
    request: Request,
    min_match: float = 0.0,
    limit: int = 20,
    db: Session = Depends(get_db),
):
    """Suggest recipes based on current pantry inventory."""
    from app.services.pantry_suggestions import suggest_from_pantry

    suggestions = suggest_from_pantry(db, min_match_pct=min_match, limit=limit)
    return [
        PantrySuggestionSchema(
            recipe_id=s.recipe_id,
            recipe_name=s.recipe_name,
            total_ingredients=s.total_ingredients,
            matching_ingredients=s.matching_ingredients,
            missing_ingredients=s.missing_ingredients,
            match_pct=s.match_pct,
            matches=[
                IngredientMatchSchema(
                    ingredient_id=m.ingredient_id,
                    ingredient_name=m.ingredient_name,
                    in_stock=m.in_stock,
                    stock_note=m.stock_note,
                ) for m in s.matches
            ],
            missing=[
                IngredientMatchSchema(
                    ingredient_id=m.ingredient_id,
                    ingredient_name=m.ingredient_name,
                    in_stock=m.in_stock,
                ) for m in s.missing
            ],
        )
        for s in suggestions
    ]


# =============================================================================
# IMPORT COVERAGE CHECK (Preview inventory match for unsaved recipes)
# =============================================================================


@router.post("/import/coverage", response_model=CoverageCheckResponse)
@limiter.limit("20/minute")
def import_coverage_check(
    request: Request,
    data: CoverageCheckRequest,
    db: Session = Depends(get_db),
):
    """Check ingredient names against inventory. Read-only, no ingredient creation."""
    from app.services.preview_inventory_check import check_preview_coverage

    result = check_preview_coverage(db, data.ingredient_names)
    return CoverageCheckResponse(
        coverage_pct=result.coverage_pct,
        total_ingredients=result.total_ingredients,
        in_stock_count=result.in_stock_count,
        missing_count=result.missing_count,
        ingredients=[
            IngredientStatusSchema(
                name=ing.name,
                in_stock=ing.in_stock,
                stock_note=ing.stock_note,
                food_category=ing.food_category,
                alternatives=ing.alternatives,
            ) for ing in result.ingredients
        ],
    )
