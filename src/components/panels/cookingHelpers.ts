/**
 * Cooking Helpers — parsing and scaling utilities for CookingLayout.
 */

import type { RecipeIngredient } from '@/types';

/**
 * Parse instructions into numbered steps.
 */
export function parseInstructions(instructions: string): string[] {
  if (!instructions) return [];

  const lines = instructions
    .split(/(?:\r?\n)+|(?:\d+\.\s+)|(?:•\s+)|(?:-\s+)/)
    .map(line => line.trim())
    .filter(line => line.length > 0);

  if (lines.length <= 1 && instructions.length > 100) {
    return instructions
      .split(/(?<=[.!?])\s+/)
      .map(line => line.trim())
      .filter(line => line.length > 0);
  }

  return lines;
}

/**
 * Parse simple ingredient lines from notes or instructions.
 * Fallback for recipes without structured ingredient data.
 */
export function parseIngredientsFromNotes(notes: string | null): RecipeIngredient[] {
  if (!notes) return [];

  const lines = notes.split('\n');
  const ingredients: RecipeIngredient[] = [];

  for (const line of lines) {
    const match = line.match(/^(\d+(?:[\/\.]\d+)?)\s*(cup|cups|tbsp|tsp|oz|lb|g|ml|l)?\s*(.+)/i);
    if (match) {
      ingredients.push({
        ingredient_id: 0,
        ingredient_name: match[3].trim(),
        quantity: match[1],
        unit: match[2] || null,
        notes: null,
      });
    }
  }

  return ingredients;
}

/**
 * Extract ingredients mentioned in a single instruction step.
 * Returns ingredients that are referenced in the instruction text.
 * This enables "inline ingredients" - showing quantities right where you need them.
 */
export function extractIngredientsForStep(
  stepText: string,
  allIngredients: RecipeIngredient[]
): RecipeIngredient[] {
  if (!stepText || allIngredients.length === 0) return [];

  const stepLower = stepText.toLowerCase();
  const mentioned: RecipeIngredient[] = [];

  for (const ing of allIngredients) {
    const nameLower = ing.ingredient_name.toLowerCase();
    const words = nameLower.split(/\s+/);
    const isReferenced = words.some(word =>
      word.length >= 3 && stepLower.includes(word)
    ) || stepLower.includes(nameLower);

    if (isReferenced) {
      mentioned.push(ing);
    }
  }

  return mentioned;
}

/**
 * Scale a string quantity by a factor.
 * Handles fractions like "1/2" and ranges like "2-3".
 */
export function scaleStringQuantity(quantity: string | null, scaleFactor: number): string {
  if (!quantity) return '';

  const simple = parseFloat(quantity);
  if (Number.isFinite(simple)) {
    const scaled = simple * scaleFactor;
    if (Number.isInteger(scaled)) return String(scaled);
    return scaled.toFixed(2).replace(/\.?0+$/, '');
  }

  const fractionMatch = quantity.match(/^(\d+)\s*\/\s*(\d+)$/);
  if (fractionMatch) {
    const numerator = parseInt(fractionMatch[1]);
    const denominator = parseInt(fractionMatch[2]);
    if (denominator !== 0) {
      const value = (numerator / denominator) * scaleFactor;
      if (Number.isInteger(value)) return String(value);
      return value.toFixed(2).replace(/\.?0+$/, '');
    }
  }

  const mixedMatch = quantity.match(/^(\d+)\s+(\d+)\s*\/\s*(\d+)$/);
  if (mixedMatch) {
    const whole = parseInt(mixedMatch[1]);
    const numerator = parseInt(mixedMatch[2]);
    const denominator = parseInt(mixedMatch[3]);
    if (denominator !== 0) {
      const value = (whole + numerator / denominator) * scaleFactor;
      if (Number.isInteger(value)) return String(value);
      return value.toFixed(2).replace(/\.?0+$/, '');
    }
  }

  return quantity;
}
