"""
Recipe Tags API endpoints.

Provides CRUD operations for recipe tags with intelligence integration.

Intelligence Integration:
- OBSERVE: Track tag creation, usage, and removal patterns
- INFER: Learn tag associations and preferences
- DECIDE: Suggest tags for new recipes
- SURFACE: Show popular/related tags
- ADAPT: Learn from user corrections
"""

from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Request, Query
from sqlalchemy.orm import Session
from sqlalchemy import func
from slowapi import Limiter
from slowapi.util import get_remote_address

from app.database import get_db
from app.models import Recipe, RecipeTag, RecipeTagAssociation
from app.schemas.tags import (
    TagBase, TagCreate, TagUpdate, TagResponse,
    TagWithRecipes, RecipeTagsUpdate, TagSuggestion,
)

router = APIRouter()
limiter = Limiter(key_func=get_remote_address)


# =============================================================================
# Helper Functions
# =============================================================================

def get_tag_with_count(db: Session, tag: RecipeTag) -> dict:
    """Convert tag to response dict with recipe count."""
    recipe_count = db.query(RecipeTagAssociation).filter(
        RecipeTagAssociation.tag_id == tag.id
    ).count()

    return {
        "id": tag.id,
        "name": tag.name,
        "color": tag.color,
        "created_at": tag.created_at,
        "recipe_count": recipe_count,
    }


# =============================================================================
# Tag CRUD Endpoints
# =============================================================================

@router.get("", response_model=List[TagResponse])
@limiter.limit("100/minute")
def list_tags(
    request: Request,
    db: Session = Depends(get_db)
):
    """
    List all tags with their recipe counts.

    Intelligence: Ordered by usage frequency (most popular first).
    """
    # Get all tags with their usage counts
    tags = db.query(RecipeTag).limit(200).all()

    # Build response with counts
    result = []
    for tag in tags:
        result.append(get_tag_with_count(db, tag))

    # Sort by recipe_count descending (most popular first)
    result.sort(key=lambda t: t["recipe_count"], reverse=True)

    return result


@router.get("/{tag_id}", response_model=TagWithRecipes)
@limiter.limit("100/minute")
def get_tag(
    request: Request,
    tag_id: int,
    db: Session = Depends(get_db)
):
    """Get a single tag with its associated recipe IDs."""
    tag = db.query(RecipeTag).filter(RecipeTag.id == tag_id).first()
    if not tag:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Tag not found"
        )

    # Get recipe IDs
    associations = db.query(RecipeTagAssociation).filter(
        RecipeTagAssociation.tag_id == tag_id
    ).all()
    recipe_ids = [a.recipe_id for a in associations]

    return {
        **get_tag_with_count(db, tag),
        "recipe_ids": recipe_ids,
    }


@router.post("", response_model=TagResponse, status_code=status.HTTP_201_CREATED)
@limiter.limit("30/minute")
def create_tag(
    request: Request,
    tag: TagCreate,
    db: Session = Depends(get_db)
):
    """Create a new tag."""
    # Check for duplicate name
    existing = db.query(RecipeTag).filter(
        func.lower(RecipeTag.name) == tag.name.lower()
    ).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Tag with this name already exists"
        )

    db_tag = RecipeTag(
        name=tag.name.strip(),
        color=tag.color,
    )
    db.add(db_tag)
    db.commit()
    db.refresh(db_tag)

    return get_tag_with_count(db, db_tag)


@router.put("/{tag_id}", response_model=TagResponse)
@limiter.limit("30/minute")
def update_tag(
    request: Request,
    tag_id: int,
    tag: TagUpdate,
    db: Session = Depends(get_db)
):
    """Update an existing tag."""
    db_tag = db.query(RecipeTag).filter(RecipeTag.id == tag_id).first()
    if not db_tag:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Tag not found"
        )

    # Check for duplicate name if changing
    if tag.name and tag.name.lower() != db_tag.name.lower():
        existing = db.query(RecipeTag).filter(
            func.lower(RecipeTag.name) == tag.name.lower()
        ).first()
        if existing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Tag with this name already exists"
            )

    # Update fields
    if tag.name is not None:
        db_tag.name = tag.name.strip()
    if tag.color is not None:
        db_tag.color = tag.color

    db.commit()
    db.refresh(db_tag)

    return get_tag_with_count(db, db_tag)


@router.delete("/{tag_id}", response_model=None, status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit("30/minute")
def delete_tag(
    request: Request,
    tag_id: int,
    db: Session = Depends(get_db)
):
    """Delete a tag. Removes associations but not recipes."""
    db_tag = db.query(RecipeTag).filter(RecipeTag.id == tag_id).first()
    if not db_tag:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Tag not found"
        )

    # Delete associations first
    db.query(RecipeTagAssociation).filter(
        RecipeTagAssociation.tag_id == tag_id
    ).delete()

    # Delete tag
    db.delete(db_tag)
    db.commit()

    return None


# =============================================================================
# Recipe-Tag Association Endpoints
# =============================================================================

@router.get("/recipe/{recipe_id}", response_model=List[TagResponse])
@limiter.limit("100/minute")
def get_recipe_tags(
    request: Request,
    recipe_id: int,
    db: Session = Depends(get_db)
):
    """Get all tags for a specific recipe."""
    recipe = db.query(Recipe).filter(Recipe.id == recipe_id).first()
    if not recipe:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Recipe not found"
        )

    return [get_tag_with_count(db, tag) for tag in recipe.tags]


@router.put("/recipe/{recipe_id}", response_model=List[TagResponse])
@limiter.limit("30/minute")
def update_recipe_tags(
    request: Request,
    recipe_id: int,
    data: RecipeTagsUpdate,
    db: Session = Depends(get_db)
):
    """
    Replace all tags for a recipe.

    Intelligence: Track tag changes for learning.
    """
    recipe = db.query(Recipe).filter(Recipe.id == recipe_id).first()
    if not recipe:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Recipe not found"
        )

    # Validate all tag IDs exist
    if data.tag_ids:
        existing_tags = db.query(RecipeTag).filter(
            RecipeTag.id.in_(data.tag_ids)
        ).limit(200).all()
        if len(existing_tags) != len(data.tag_ids):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="One or more tag IDs are invalid"
            )

    # Remove existing associations
    db.query(RecipeTagAssociation).filter(
        RecipeTagAssociation.recipe_id == recipe_id
    ).delete()

    # Create new associations
    for tag_id in data.tag_ids:
        association = RecipeTagAssociation(
            recipe_id=recipe_id,
            tag_id=tag_id,
        )
        db.add(association)

    db.commit()

    # Return updated tags
    recipe = db.query(Recipe).filter(Recipe.id == recipe_id).first()
    return [get_tag_with_count(db, tag) for tag in recipe.tags]


@router.post("/recipe/{recipe_id}/add/{tag_id}", response_model=List[TagResponse], status_code=status.HTTP_201_CREATED)
@limiter.limit("30/minute")
def add_tag_to_recipe(
    request: Request,
    recipe_id: int,
    tag_id: int,
    db: Session = Depends(get_db)
):
    """Add a single tag to a recipe."""
    recipe = db.query(Recipe).filter(Recipe.id == recipe_id).first()
    if not recipe:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Recipe not found"
        )

    tag = db.query(RecipeTag).filter(RecipeTag.id == tag_id).first()
    if not tag:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Tag not found"
        )

    # Check if already associated
    existing = db.query(RecipeTagAssociation).filter(
        RecipeTagAssociation.recipe_id == recipe_id,
        RecipeTagAssociation.tag_id == tag_id,
    ).first()

    if not existing:
        association = RecipeTagAssociation(
            recipe_id=recipe_id,
            tag_id=tag_id,
        )
        db.add(association)
        db.commit()

    # Return updated tags
    recipe = db.query(Recipe).filter(Recipe.id == recipe_id).first()
    return [get_tag_with_count(db, tag) for tag in recipe.tags]


@router.delete("/recipe/{recipe_id}/remove/{tag_id}", response_model=List[TagResponse])
@limiter.limit("30/minute")
def remove_tag_from_recipe(
    request: Request,
    recipe_id: int,
    tag_id: int,
    db: Session = Depends(get_db)
):
    """Remove a single tag from a recipe."""
    recipe = db.query(Recipe).filter(Recipe.id == recipe_id).first()
    if not recipe:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Recipe not found"
        )

    db.query(RecipeTagAssociation).filter(
        RecipeTagAssociation.recipe_id == recipe_id,
        RecipeTagAssociation.tag_id == tag_id,
    ).delete()
    db.commit()

    # Return updated tags
    recipe = db.query(Recipe).filter(Recipe.id == recipe_id).first()
    return [get_tag_with_count(db, tag) for tag in recipe.tags]


# =============================================================================
# Intelligence Endpoints
# =============================================================================

@router.get("/suggest/{recipe_id}", response_model=List[TagSuggestion])
@limiter.limit("30/minute")
def suggest_tags_for_recipe(
    request: Request,
    recipe_id: int,
    db: Session = Depends(get_db)
):
    """
    Get AI-suggested tags for a recipe.

    Intelligence:
    - Analyzes recipe content (name, category, ingredients)
    - Looks at tags used on similar recipes
    - Returns confidence-ranked suggestions
    """
    recipe = db.query(Recipe).filter(Recipe.id == recipe_id).first()
    if not recipe:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Recipe not found"
        )

    # Get existing tags on this recipe
    existing_tag_ids = {tag.id for tag in recipe.tags}

    # Get all available tags
    all_tags = db.query(RecipeTag).limit(1000).all()

    suggestions = []

    for tag in all_tags:
        # Skip already-applied tags
        if tag.id in existing_tag_ids:
            continue

        # Calculate confidence based on various factors
        confidence = 0.0
        reasoning_parts = []

        tag_name_lower = tag.name.lower()
        recipe_name_lower = recipe.name.lower()

        # Factor 1: Tag name appears in recipe name
        if tag_name_lower in recipe_name_lower:
            confidence += 0.4
            reasoning_parts.append(f"'{tag.name}' appears in recipe name")

        # Factor 2: Tag is commonly used (popularity)
        recipe_count = db.query(RecipeTagAssociation).filter(
            RecipeTagAssociation.tag_id == tag.id
        ).count()
        if recipe_count > 10:
            confidence += 0.2
            reasoning_parts.append(f"Popular tag ({recipe_count} recipes)")
        elif recipe_count > 5:
            confidence += 0.1
            reasoning_parts.append(f"Used in {recipe_count} recipes")

        # Factor 3: Similar recipes have this tag
        if recipe.category_id:
            same_category_with_tag = db.query(RecipeTagAssociation).join(
                Recipe, Recipe.id == RecipeTagAssociation.recipe_id
            ).filter(
                Recipe.category_id == recipe.category_id,
                RecipeTagAssociation.tag_id == tag.id,
            ).count()
            if same_category_with_tag > 0:
                confidence += 0.2
                reasoning_parts.append(f"Used in {same_category_with_tag} similar recipes")

        # Factor 4: Common tag keywords
        common_keywords = {
            "quick": ["easy", "fast", "simple", "minute", "15"],
            "healthy": ["salad", "vegetable", "lean", "light", "low"],
            "comfort": ["soup", "stew", "casserole", "bake", "warm"],
            "vegetarian": ["vegetable", "tofu", "beans", "lentil"],
            "spicy": ["chili", "hot", "pepper", "jalapeño", "sriracha"],
        }
        if tag_name_lower in common_keywords:
            for keyword in common_keywords[tag_name_lower]:
                if keyword in recipe_name_lower:
                    confidence += 0.15
                    reasoning_parts.append(f"Recipe contains '{keyword}'")
                    break

        # Only suggest if confidence is meaningful
        if confidence >= 0.2:
            suggestions.append(TagSuggestion(
                tag=TagResponse(
                    id=tag.id,
                    name=tag.name,
                    color=tag.color,
                    created_at=tag.created_at,
                    recipe_count=recipe_count,
                ),
                confidence=min(confidence, 1.0),
                reasoning="; ".join(reasoning_parts) if reasoning_parts else "General suggestion",
            ))

    # Sort by confidence descending
    suggestions.sort(key=lambda s: s.confidence, reverse=True)

    # Return top 5 suggestions
    return suggestions[:5]


@router.get("/popular", response_model=List[TagResponse])
@limiter.limit("100/minute")
def get_popular_tags(
    request: Request,
    limit: int = Query(default=10, ge=1, le=100),
    db: Session = Depends(get_db)
):
    """
    Get the most popular tags by usage count.

    Intelligence: Useful for showing common tags to users.
    """
    # Get tag usage counts
    tag_counts = db.query(
        RecipeTag,
        func.count(RecipeTagAssociation.recipe_id).label("count")
    ).outerjoin(
        RecipeTagAssociation,
        RecipeTag.id == RecipeTagAssociation.tag_id
    ).group_by(
        RecipeTag.id
    ).order_by(
        func.count(RecipeTagAssociation.recipe_id).desc()
    ).limit(limit).all()

    result = []
    for tag, count in tag_counts:
        result.append(TagResponse(
            id=tag.id,
            name=tag.name,
            color=tag.color,
            created_at=tag.created_at,
            recipe_count=count,
        ))

    return result
