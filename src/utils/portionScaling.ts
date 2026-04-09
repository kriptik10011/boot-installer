/**
 * Portion Scaling Utilities
 *
 * Scales ingredient quantities based on serving size changes.
 * Integrates with grocery list auto-generation.
 *
 * Intelligence Integration:
 * - OBSERVE: Track portion size selections
 * - INFER: Learn default portions per recipe type
 * - DECIDE: Suggest "Your usual is X servings for pasta"
 * - ADAPT: Learn household eating patterns
 */

// =============================================================================
// TYPES
// =============================================================================

export interface ScaledIngredient {
  name: string;
  originalQuantity: string;
  scaledQuantity: string;
  scaleFactor: number;
  parsed: ParsedQuantity;
}

export interface ParsedQuantity {
  amount: number;
  unit: string | null;
  original: string;
  isRange: boolean;
  rangeMin?: number;
  rangeMax?: number;
}

// =============================================================================
// UNICODE FRACTIONS
// =============================================================================

const UNICODE_FRACTIONS: Record<string, number> = {
  '½': 0.5,
  '⅓': 1 / 3,
  '⅔': 2 / 3,
  '¼': 0.25,
  '¾': 0.75,
  '⅕': 0.2,
  '⅖': 0.4,
  '⅗': 0.6,
  '⅘': 0.8,
  '⅙': 1 / 6,
  '⅚': 5 / 6,
  '⅛': 0.125,
  '⅜': 0.375,
  '⅝': 0.625,
  '⅞': 0.875,
};

const FRACTION_TO_UNICODE: Record<number, string> = {
  0.25: '¼',
  0.33: '⅓',
  0.5: '½',
  0.67: '⅔',
  0.75: '¾',
};

// =============================================================================
// PARSING
// =============================================================================

/**
 * Parse a quantity string into structured data.
 *
 * Handles:
 * - Simple numbers: "2 cups"
 * - Fractions: "1/2 tsp"
 * - Unicode fractions: "½ cup"
 * - Mixed numbers: "1 1/2 cups"
 * - Ranges: "1-2 tablespoons"
 */
export function parseQuantity(text: string): ParsedQuantity {
  const original = text.trim();
  let remaining = original.toLowerCase();

  const result: ParsedQuantity = {
    amount: 0,
    unit: null,
    original,
    isRange: false,
  };

  // Check for range (e.g., "1-2 cups")
  const rangeMatch = remaining.match(/(\d+(?:\.\d+)?)\s*[-–—to]\s*(\d+(?:\.\d+)?)/);
  if (rangeMatch) {
    result.isRange = true;
    result.rangeMin = parseFloat(rangeMatch[1]);
    result.rangeMax = parseFloat(rangeMatch[2]);
    result.amount = (result.rangeMin + result.rangeMax) / 2;
    remaining = remaining.replace(rangeMatch[0], ' ');
  } else {
    // Try mixed number (e.g., "1 1/2 cups")
    const mixedMatch = remaining.match(/(\d+)\s+(\d+)\s*\/\s*(\d+)/);
    if (mixedMatch) {
      const whole = parseInt(mixedMatch[1]);
      const numerator = parseInt(mixedMatch[2]);
      const denominator = parseInt(mixedMatch[3]);
      if (denominator !== 0) {
        result.amount = whole + numerator / denominator;
      }
      remaining = remaining.replace(mixedMatch[0], ' ');
    } else {
      // Check for unicode fractions
      let foundUnicode = false;
      for (const [char, value] of Object.entries(UNICODE_FRACTIONS)) {
        const unicodeMatch = remaining.match(new RegExp(`(\\d*)\\s*${char}`));
        if (unicodeMatch) {
          const whole = unicodeMatch[1] ? parseInt(unicodeMatch[1]) : 0;
          result.amount = whole + value;
          remaining = remaining.replace(unicodeMatch[0], ' ');
          foundUnicode = true;
          break;
        }
      }

      if (!foundUnicode) {
        // Try simple fraction
        const fractionMatch = remaining.match(/(\d+)\s*\/\s*(\d+)/);
        if (fractionMatch) {
          const numerator = parseInt(fractionMatch[1]);
          const denominator = parseInt(fractionMatch[2]);
          if (denominator !== 0) {
            result.amount = numerator / denominator;
          }
          remaining = remaining.replace(fractionMatch[0], ' ');
        } else {
          // Try simple number
          const numberMatch = remaining.match(/(\d+(?:\.\d+)?)/);
          if (numberMatch) {
            result.amount = parseFloat(numberMatch[1]);
            remaining = remaining.replace(numberMatch[0], ' ');
          } else {
            result.amount = 1;
          }
        }
      }
    }
  }

  // Extract unit from remaining text
  const unitText = remaining.trim();
  if (unitText) {
    result.unit = normalizeUnit(unitText);
  }

  return result;
}

/**
 * Display-layer unit normalization for portion scaling math.
 * Subset of backend normalize_unit() (quantity_parser.py) which is authoritative.
 * Recipe data arrives pre-normalized from the backend, so this is a defensive
 * fallback for edge cases in client-side scaling calculations.
 */
function normalizeUnit(unit: string): string {
  const unitMap: Record<string, string> = {
    tsp: 'teaspoon',
    t: 'teaspoon',
    teaspoons: 'teaspoon',
    tbsp: 'tablespoon',
    tbs: 'tablespoon',
    tablespoons: 'tablespoon',
    c: 'cup',
    cups: 'cup',
    oz: 'ounce',
    ounces: 'ounce',
    lb: 'pound',
    lbs: 'pound',
    pounds: 'pound',
    g: 'gram',
    grams: 'gram',
    kg: 'kilogram',
    ml: 'milliliter',
    l: 'liter',
    cloves: 'clove',
    pieces: 'piece',
    pcs: 'piece',
  };

  const lower = unit.toLowerCase().trim();
  return unitMap[lower] || lower;
}

// =============================================================================
// FORMATTING
// =============================================================================

/**
 * Format a quantity for display.
 *
 * Converts decimals to fractions where appropriate.
 * Guards against NaN/Infinity.
 */
export function formatQuantity(amount: number, unit?: string | null): string {
  // Guard against invalid amounts
  if (!Number.isFinite(amount) || amount < 0) {
    return unit || '';
  }

  const whole = Math.floor(amount);
  const decimal = amount - whole;

  let fractionStr = '';
  for (const [value, char] of Object.entries(FRACTION_TO_UNICODE)) {
    if (Math.abs(decimal - parseFloat(value)) < 0.05) {
      fractionStr = char;
      break;
    }
  }

  let result: string;
  if (fractionStr) {
    if (whole > 0) {
      result = `${whole}${fractionStr}`;
    } else {
      result = fractionStr;
    }
  } else if (decimal < 0.05) {
    result = `${whole}`;
  } else {
    result = amount.toFixed(2).replace(/\.?0+$/, '');
  }

  if (unit) {
    result += ` ${unit}`;
  }

  return result;
}

// =============================================================================
// SCALING
// =============================================================================

/**
 * Scale a quantity by a factor.
 * Guards against NaN/Infinity in input or output.
 */
export function scaleQuantity(
  quantity: string,
  scaleFactor: number
): string {
  // Guard against invalid scale factor
  if (!Number.isFinite(scaleFactor) || scaleFactor <= 0) {
    return quantity; // Return original if can't scale
  }

  const parsed = parseQuantity(quantity);

  // Guard against NaN/Infinity in parsed amount
  if (!Number.isFinite(parsed.amount)) {
    return quantity; // Return original if parsing failed
  }

  const scaledAmount = parsed.amount * scaleFactor;

  // Guard against NaN/Infinity in result
  if (!Number.isFinite(scaledAmount)) {
    return quantity;
  }

  if (parsed.isRange && parsed.rangeMin && parsed.rangeMax) {
    const scaledMin = parsed.rangeMin * scaleFactor;
    const scaledMax = parsed.rangeMax * scaleFactor;
    if (Number.isFinite(scaledMin) && Number.isFinite(scaledMax)) {
      return `${formatQuantity(scaledMin)}-${formatQuantity(scaledMax, parsed.unit)}`;
    }
    return quantity;
  }

  return formatQuantity(scaledAmount, parsed.unit);
}

/**
 * Scale all ingredients for a recipe.
 */
export function scaleIngredients(
  ingredients: Array<{ name: string; quantity: string }>,
  originalServings: number,
  desiredServings: number
): ScaledIngredient[] {
  // Validate servings
  if (originalServings <= 0) {
    throw new Error('Original servings must be greater than zero');
  }
  if (desiredServings <= 0) {
    throw new Error('Desired servings must be greater than zero');
  }

  const scaleFactor = desiredServings / originalServings;

  return ingredients.map((ing) => {
    const parsed = parseQuantity(ing.quantity);
    return {
      name: ing.name,
      originalQuantity: ing.quantity,
      scaledQuantity: scaleQuantity(ing.quantity, scaleFactor),
      scaleFactor,
      parsed: {
        ...parsed,
        amount: parsed.amount * scaleFactor,
      },
    };
  });
}

/**
 * Scale quantities in instruction text.
 *
 * Finds quantities in brackets [2 cups] and scales them.
 */
export function scaleInstructions(
  instruction: string,
  scaleFactor: number
): string {
  // Find quantities in brackets and scale them
  return instruction.replace(
    /\[([^\]]+)\]/g,
    (match, quantity) => {
      try {
        const scaled = scaleQuantity(quantity, scaleFactor);
        return `[${scaled}]`;
      } catch {
        return match;
      }
    }
  );
}

// =============================================================================
// CONSOLIDATION
// =============================================================================

export interface ConsolidatedIngredient {
  name: string;
  totalQuantity: string;
  sources: Array<{ recipe: string; quantity: string }>;
  parsed: ParsedQuantity;
}

/**
 * Consolidate ingredients from multiple recipes.
 *
 * Groups by name and combines quantities.
 */
export function consolidateIngredients(
  ingredients: Array<{
    name: string;
    quantity: string;
    recipe?: string;
  }>
): ConsolidatedIngredient[] {
  const groups = new Map<string, Array<{ recipe: string; quantity: string; parsed: ParsedQuantity }>>();

  // Group by normalized name
  for (const ing of ingredients) {
    const key = ing.name.toLowerCase().trim();
    const parsed = parseQuantity(ing.quantity);
    const entry = {
      recipe: ing.recipe || 'Unknown',
      quantity: ing.quantity,
      parsed,
    };

    if (groups.has(key)) {
      groups.get(key)!.push(entry);
    } else {
      groups.set(key, [entry]);
    }
  }

  // Consolidate each group
  const result: ConsolidatedIngredient[] = [];

  for (const [name, items] of groups) {
    // Find the most common unit
    const unitCounts = new Map<string | null, number>();
    for (const item of items) {
      const unit = item.parsed.unit;
      unitCounts.set(unit, (unitCounts.get(unit) || 0) + 1);
    }

    let targetUnit: string | null = null;
    let maxCount = 0;
    for (const [unit, count] of unitCounts) {
      if (count > maxCount) {
        maxCount = count;
        targetUnit = unit;
      }
    }

    // Sum quantities (simplified - assumes same unit)
    let total = 0;
    for (const item of items) {
      if (item.parsed.unit === targetUnit || item.parsed.unit === null) {
        total += item.parsed.amount;
      } else {
        // Different unit - just add as is (would need conversion table for proper handling)
        total += item.parsed.amount;
      }
    }

    result.push({
      name: items[0].recipe ? name : name.charAt(0).toUpperCase() + name.slice(1),
      totalQuantity: formatQuantity(total, targetUnit),
      sources: items.map((i) => ({ recipe: i.recipe, quantity: i.quantity })),
      parsed: {
        amount: total,
        unit: targetUnit,
        original: formatQuantity(total, targetUnit),
        isRange: false,
      },
    });
  }

  return result;
}

// =============================================================================
// INVENTORY CHECK
// =============================================================================

export interface InventoryCheckResult {
  covered: boolean;
  coveragePercent: number;
  shortfall: number;
  shortfallDisplay: string;
}

/**
 * Check if inventory covers a needed quantity.
 */
export function checkInventoryCoverage(
  needed: ParsedQuantity,
  available: ParsedQuantity
): InventoryCheckResult {
  // Simplified comparison (assumes same unit)
  const neededAmount = needed.amount;
  const availableAmount = available.amount;

  const covered = availableAmount >= neededAmount;
  const coveragePercent = neededAmount > 0
    ? Math.min(100, (availableAmount / neededAmount) * 100)
    : 100;
  const shortfall = Math.max(0, neededAmount - availableAmount);

  return {
    covered,
    coveragePercent,
    shortfall,
    shortfallDisplay: shortfall > 0 ? formatQuantity(shortfall, needed.unit) : '',
  };
}
