"""
Dietary restrictions router — manage dietary labels and tag recipes.
"""

from typing import List
from fastapi import APIRouter, Depends, HTTPException, Request, status
from slowapi import Limiter
from slowapi.util import get_remote_address
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.dietary_restriction import DietaryRestriction, RecipeDietaryRestriction
from app.models.recipe import Recipe
from app.schemas.dietary_restrictions import (
    DietaryRestrictionResponse,
    DietaryRestrictionCreate,
    RecipeRestrictionUpdate,
    RecipeWithRestrictionsResponse,
)

router = APIRouter()
limiter = Limiter(key_func=get_remote_address)


# --- Helpers ---

def _build_restriction_map(db: Session, recipe_ids: list) -> dict:
    """Bulk-load dietary restrictions for a list of recipe IDs.

    Returns {recipe_id: [DietaryRestriction, ...]} avoiding N+1 queries.
    Two queries total regardless of recipe count.
    """
    if not recipe_ids:
        return {}

    # 1. Fetch all associations for these recipes in one query
    assocs = db.query(RecipeDietaryRestriction).filter(
        RecipeDietaryRestriction.recipe_id.in_(recipe_ids)
    ).limit(200).all()

    # Build recipe_id -> [restriction_id] mapping
    rid_by_recipe: dict[int, list[int]] = {}
    all_rids: set[int] = set()
    for a in assocs:
        rid_by_recipe.setdefault(a.recipe_id, []).append(a.restriction_id)
        all_rids.add(a.restriction_id)

    if not all_rids:
        return {}

    # 2. Fetch all referenced restrictions in one query
    restrictions = db.query(DietaryRestriction).filter(
        DietaryRestriction.id.in_(list(all_rids))
    ).limit(200).all()
    restriction_by_id = {r.id: r for r in restrictions}

    # 3. Assemble the map
    result: dict[int, list] = {}
    for recipe_id, rids in rid_by_recipe.items():
        result[recipe_id] = [restriction_by_id[rid] for rid in rids if rid in restriction_by_id]

    return result


# --- Endpoints ---

@router.get("", response_model=List[DietaryRestrictionResponse])
@limiter.limit("30/minute")
def list_restrictions(request: Request, db: Session = Depends(get_db)):
    """List all dietary restrictions."""
    return db.query(DietaryRestriction).order_by(DietaryRestriction.name).limit(1000).all()


@router.post("", response_model=DietaryRestrictionResponse, status_code=status.HTTP_201_CREATED)
@limiter.limit("30/minute")
def create_restriction(request: Request, data: DietaryRestrictionCreate, db: Session = Depends(get_db)):
    """Create a custom dietary restriction."""
    existing = db.query(DietaryRestriction).filter(
        DietaryRestriction.name == data.name
    ).first()
    if existing:
        raise HTTPException(status_code=409, detail=f"Restriction '{data.name}' already exists")

    restriction = DietaryRestriction(
        name=data.name,
        icon=data.icon,
        description=data.description,
        is_system=False,
    )
    db.add(restriction)
    db.commit()
    db.refresh(restriction)
    return restriction


@router.delete("/{restriction_id}", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit("30/minute")
def delete_restriction(request: Request, restriction_id: int, db: Session = Depends(get_db)):
    """Delete a custom dietary restriction (system ones cannot be deleted)."""
    restriction = db.get(DietaryRestriction, restriction_id)
    if not restriction:
        raise HTTPException(status_code=404, detail="Restriction not found")
    if restriction.is_system:
        raise HTTPException(status_code=400, detail="Cannot delete system restrictions")

    # Remove all recipe associations first
    db.query(RecipeDietaryRestriction).filter(
        RecipeDietaryRestriction.restriction_id == restriction_id
    ).delete()
    db.delete(restriction)
    db.commit()
    return None


@router.get("/recipe/{recipe_id}", response_model=List[DietaryRestrictionResponse])
@limiter.limit("30/minute")
def get_recipe_restrictions(request: Request, recipe_id: int, db: Session = Depends(get_db)):
    """Get dietary restrictions for a specific recipe."""
    recipe = db.get(Recipe, recipe_id)
    if not recipe:
        raise HTTPException(status_code=404, detail="Recipe not found")

    associations = db.query(RecipeDietaryRestriction).filter(
        RecipeDietaryRestriction.recipe_id == recipe_id
    ).limit(200).all()

    restriction_ids = [a.restriction_id for a in associations]
    if not restriction_ids:
        return []

    return db.query(DietaryRestriction).filter(
        DietaryRestriction.id.in_(restriction_ids)
    ).order_by(DietaryRestriction.name).limit(200).all()


@router.put("/recipe/{recipe_id}", response_model=List[DietaryRestrictionResponse])
@limiter.limit("30/minute")
def update_recipe_restrictions(
    request: Request, recipe_id: int, data: RecipeRestrictionUpdate, db: Session = Depends(get_db)
):
    """Set dietary restrictions for a recipe (replaces all existing)."""
    recipe = db.get(Recipe, recipe_id)
    if not recipe:
        raise HTTPException(status_code=404, detail="Recipe not found")

    # Remove existing associations
    db.query(RecipeDietaryRestriction).filter(
        RecipeDietaryRestriction.recipe_id == recipe_id
    ).delete()

    # Add new associations
    for rid in data.restriction_ids:
        restriction = db.get(DietaryRestriction, rid)
        if not restriction:
            raise HTTPException(status_code=404, detail=f"Restriction {rid} not found")
        db.add(RecipeDietaryRestriction(
            recipe_id=recipe_id,
            restriction_id=rid,
        ))

    db.commit()

    # Return updated list
    return get_recipe_restrictions(request, recipe_id, db)


@router.get("/filter/recipes", response_model=List[RecipeWithRestrictionsResponse])
@limiter.limit("30/minute")
def filter_recipes_by_restrictions(
    request: Request,
    restriction_ids: str = "",
    match_all: bool = True,
    db: Session = Depends(get_db),
):
    """
    Filter recipes by dietary restrictions.

    Args:
        restriction_ids: Comma-separated restriction IDs (e.g., "1,3,5")
        match_all: If True, recipe must match ALL given restrictions.
                   If False, recipe matches ANY of them.
    """
    if not restriction_ids:
        # Return all recipes with their restrictions (eager-loaded to avoid N+1)
        recipes = db.query(Recipe).order_by(Recipe.name).limit(1000).all()
        recipe_ids_all = [r.id for r in recipes]
        restriction_map = _build_restriction_map(db, recipe_ids_all)
        return [
            RecipeWithRestrictionsResponse(
                recipe_id=recipe.id,
                recipe_name=recipe.name,
                restrictions=[DietaryRestrictionResponse.model_validate(r) for r in restriction_map.get(recipe.id, [])],
            )
            for recipe in recipes
        ]

    rid_list = [int(x.strip()) for x in restriction_ids.split(",") if x.strip()]

    if match_all:
        # Recipe must have ALL specified restrictions
        from sqlalchemy import func
        matching_recipe_ids = (
            db.query(RecipeDietaryRestriction.recipe_id)
            .filter(RecipeDietaryRestriction.restriction_id.in_(rid_list))
            .group_by(RecipeDietaryRestriction.recipe_id)
            .having(func.count(RecipeDietaryRestriction.restriction_id) == len(rid_list))
            .limit(200).all()
        )
    else:
        # Recipe must have ANY of the specified restrictions
        matching_recipe_ids = (
            db.query(RecipeDietaryRestriction.recipe_id)
            .filter(RecipeDietaryRestriction.restriction_id.in_(rid_list))
            .distinct()
            .limit(200).all()
        )

    recipe_ids = [r[0] for r in matching_recipe_ids]
    if not recipe_ids:
        return []

    recipes = db.query(Recipe).filter(Recipe.id.in_(recipe_ids)).order_by(Recipe.name).limit(1000).all()
    restriction_map = _build_restriction_map(db, recipe_ids)
    return [
        RecipeWithRestrictionsResponse(
            recipe_id=recipe.id,
            recipe_name=recipe.name,
            restrictions=[DietaryRestrictionResponse.model_validate(r) for r in restriction_map.get(recipe.id, [])],
        )
        for recipe in recipes
    ]

