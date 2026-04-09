/**
 * Bayesian Surprise Utility
 *
 * Measures how much new data changes our model of the user's behavior.
 * Better than Shannon Entropy for summary filtering.
 *
 * WHY BAYESIAN SURPRISE > ENTROPY:
 * - Entropy measures randomness: "$105 groceries" = HIGH entropy (new number)
 * - Surprise measures belief change: "$105 groceries" = LOW surprise (normal for user)
 *
 * Example:
 * - "$5 coffee at 3 AM" = LOW entropy (small amount) but HIGH surprise (unusual time)
 *
 * Formula: Surprise = KL(Posterior || Prior)
 * Simplified: Z-score against user's historical Gaussian for that metric.
 *
 * Threshold: Surface if z-score > 2 (outside 95% of user's normal)
 *
 * @see intelligence-decisions.md "Bayesian Surprise for Summary Filtering"
 */

// =============================================================================
// TYPES
// =============================================================================

/**
 * Statistical model for a metric.
 * Maintains rolling Gaussian parameters using Welford's online algorithm.
 */
export interface MetricModel {
  /** Running mean of observations */
  mean: number;
  /** Running variance (σ²) of observations */
  variance: number;
  /** Number of observations */
  count: number;
}

/**
 * Result of surprise calculation with debug info.
 */
export interface SurpriseResult {
  /** The z-score (standard deviations from mean) */
  zScore: number;
  /** Whether this value is surprising (|z| > threshold) */
  isSurprising: boolean;
  /** Human-readable explanation */
  explanation: string;
  /** The model used for calculation */
  model: MetricModel;
  /** The value that was tested */
  value: number;
}

// =============================================================================
// CONSTANTS
// =============================================================================

/** Minimum observations before calculating surprise */
const MIN_OBSERVATIONS = 3;

/** Default z-score threshold for "surprising" (2σ = 95% confidence) */
const DEFAULT_THRESHOLD = 2.0;

// =============================================================================
// CORE FUNCTIONS
// =============================================================================

/**
 * Calculate Bayesian Surprise as z-score.
 *
 * Returns 0 if not surprising (< threshold), otherwise returns z-score.
 * This allows filtering by surprise while preserving the magnitude.
 *
 * @param value - The new observation to test
 * @param model - The statistical model of user's history
 * @param threshold - Z-score threshold (default: 2.0)
 * @returns Z-score if surprising, 0 otherwise
 *
 * @example
 * const model = { mean: 50, variance: 100, count: 20 };
 * calculateBayesianSurprise(100, model); // Returns ~5.0 (very surprising)
 * calculateBayesianSurprise(52, model);  // Returns 0 (not surprising)
 */
export function calculateBayesianSurprise(
  value: number,
  model: MetricModel,
  threshold: number = DEFAULT_THRESHOLD
): number {
  // Cold start - not enough data to determine what's "normal"
  if (model.count < MIN_OBSERVATIONS) {
    return 0;
  }

  const stdDev = Math.sqrt(model.variance);

  // Zero variance means all values were identical
  // Any different value would be maximally surprising — cap at 10σ to avoid Infinity in UI
  if (stdDev === 0) {
    return value !== model.mean ? 10 : 0;
  }

  const zScore = Math.abs(value - model.mean) / stdDev;

  // Only return z-score if it exceeds threshold
  return zScore > threshold ? zScore : 0;
}

/**
 * Calculate Bayesian Surprise with detailed result.
 *
 * @param value - The new observation to test
 * @param model - The statistical model of user's history
 * @param threshold - Z-score threshold (default: 2.0)
 * @returns SurpriseResult with full details
 */
export function calculateSurpriseDetailed(
  value: number,
  model: MetricModel,
  threshold: number = DEFAULT_THRESHOLD
): SurpriseResult {
  // Cold start
  if (model.count < MIN_OBSERVATIONS) {
    return {
      zScore: 0,
      isSurprising: false,
      explanation: `Need ${MIN_OBSERVATIONS - model.count} more observations`,
      model,
      value,
    };
  }

  const stdDev = Math.sqrt(model.variance);

  // Zero variance — cap at 10σ to avoid Infinity in UI
  if (stdDev === 0) {
    const isSurprising = value !== model.mean;
    return {
      zScore: isSurprising ? 10 : 0,
      isSurprising,
      explanation: isSurprising
        ? `All previous values were ${model.mean.toFixed(2)}`
        : 'Matches all previous values exactly',
      model,
      value,
    };
  }

  const zScore = Math.abs(value - model.mean) / stdDev;
  const isSurprising = zScore > threshold;

  // Generate human-readable explanation
  const direction = value > model.mean ? 'above' : 'below';
  const explanation = isSurprising
    ? `${zScore.toFixed(1)}σ ${direction} your average (${model.mean.toFixed(2)} ± ${stdDev.toFixed(2)})`
    : `Within normal range (${zScore.toFixed(1)}σ from mean)`;

  return {
    zScore,
    isSurprising,
    explanation,
    model,
    value,
  };
}

// =============================================================================
// MODEL MANAGEMENT (Welford's Online Algorithm)
// =============================================================================

/**
 * Update model with new observation using Welford's online algorithm.
 *
 * This is numerically stable and computes mean and variance in a single pass.
 * No need to store all historical values - just the running statistics.
 *
 * Welford's Algorithm:
 * 1. newCount = count + 1
 * 2. delta = newValue - mean
 * 3. newMean = mean + delta / newCount
 * 4. delta2 = newValue - newMean
 * 5. newVariance = (variance * count + delta * delta2) / newCount
 *
 * @param model - Current model state
 * @param newValue - New observation to incorporate
 * @returns New model with updated statistics (immutable)
 *
 * @example
 * let model = createEmptyModel();
 * model = updateModel(model, 50);  // mean: 50, variance: 0, count: 1
 * model = updateModel(model, 60);  // mean: 55, variance: 25, count: 2
 * model = updateModel(model, 40);  // mean: 50, variance: 66.67, count: 3
 */
export function updateModel(
  model: MetricModel,
  newValue: number
): MetricModel {
  const newCount = model.count + 1;
  const delta = newValue - model.mean;
  const newMean = model.mean + delta / newCount;
  const delta2 = newValue - newMean;

  // Handle first observation (variance = 0)
  const newVariance = model.count === 0
    ? 0
    : (model.variance * model.count + delta * delta2) / newCount;

  return {
    mean: newMean,
    variance: newVariance,
    count: newCount,
  };
}

/**
 * Create initial empty model.
 *
 * @returns Fresh MetricModel ready for observations
 */
export function createEmptyModel(): MetricModel {
  return { mean: 0, variance: 0, count: 0 };
}

/**
 * Create model from existing array of values.
 * Useful for initializing from historical data.
 *
 * @param values - Array of historical observations
 * @returns MetricModel with computed statistics
 */
export function createModelFromValues(values: number[]): MetricModel {
  let model = createEmptyModel();
  for (const value of values) {
    model = updateModel(model, value);
  }
  return model;
}

// =============================================================================
// FILTERING UTILITIES
// =============================================================================

/**
 * Filter items to only those that are surprising.
 *
 * @param items - Array of items to filter
 * @param getValue - Function to extract numeric value from item
 * @param getModel - Function to get the model for comparison
 * @param threshold - Z-score threshold (default: 2.0)
 * @returns Filtered array of surprising items
 *
 * @example
 * const transactions = [
 *   { amount: 50, category: 'groceries' },
 *   { amount: 500, category: 'groceries' }, // Surprising!
 *   { amount: 55, category: 'groceries' },
 * ];
 * const groceryModel = { mean: 52, variance: 25, count: 50 };
 *
 * const surprising = filterBySurprise(
 *   transactions,
 *   t => t.amount,
 *   () => groceryModel
 * );
 * // Returns only the $500 transaction
 */
export function filterBySurprise<T>(
  items: T[],
  getValue: (item: T) => number,
  getModel: (item: T) => MetricModel,
  threshold: number = DEFAULT_THRESHOLD
): T[] {
  return items.filter(item => {
    const surprise = calculateBayesianSurprise(
      getValue(item),
      getModel(item),
      threshold
    );
    return surprise > 0;
  });
}

/**
 * Sort items by surprise level (most surprising first).
 *
 * @param items - Array of items to sort
 * @param getValue - Function to extract numeric value from item
 * @param getModel - Function to get the model for comparison
 * @returns New array sorted by surprise (highest first)
 */
export function sortBySurprise<T>(
  items: T[],
  getValue: (item: T) => number,
  getModel: (item: T) => MetricModel
): T[] {
  return [...items].sort((a, b) => {
    const surpriseA = calculateBayesianSurprise(getValue(a), getModel(a));
    const surpriseB = calculateBayesianSurprise(getValue(b), getModel(b));
    return surpriseB - surpriseA; // Descending order
  });
}

// =============================================================================
// MODEL PERSISTENCE
// =============================================================================

/** Storage key prefix for metric models */
const MODEL_STORAGE_PREFIX = 'weekly-review-metric-model-';

/**
 * Save a metric model to localStorage.
 *
 * @param metricName - Unique name for this metric (e.g., 'spending_groceries')
 * @param model - The model to save
 */
export function saveModel(metricName: string, model: MetricModel): void {
  try {
    const key = MODEL_STORAGE_PREFIX + metricName;
    localStorage.setItem(key, JSON.stringify(model));
  } catch {
    // Ignore storage errors
  }
}

/**
 * Load a metric model from localStorage.
 *
 * @param metricName - Unique name for this metric
 * @returns Saved model or empty model if not found
 */
export function loadModel(metricName: string): MetricModel {
  try {
    const key = MODEL_STORAGE_PREFIX + metricName;
    const stored = localStorage.getItem(key);
    if (!stored) return createEmptyModel();
    return JSON.parse(stored) as MetricModel;
  } catch {
    return createEmptyModel();
  }
}

/**
 * Delete a saved metric model.
 *
 * @param metricName - Unique name for this metric
 */
export function deleteModel(metricName: string): void {
  try {
    const key = MODEL_STORAGE_PREFIX + metricName;
    localStorage.removeItem(key);
  } catch {
    // Ignore storage errors
  }
}

// =============================================================================
// DEBUG UTILITIES
// =============================================================================

/**
 * Get a human-readable summary of a model's state.
 *
 * @param model - The model to summarize
 * @param metricName - Optional name for the metric
 * @returns Summary string
 */
export function getModelSummary(model: MetricModel, metricName?: string): string {
  const stdDev = Math.sqrt(model.variance);
  const prefix = metricName ? `[${metricName}] ` : '';

  if (model.count === 0) {
    return `${prefix}No data`;
  }

  if (model.count < MIN_OBSERVATIONS) {
    return `${prefix}Learning (${model.count}/${MIN_OBSERVATIONS} observations)`;
  }

  return `${prefix}μ=${model.mean.toFixed(2)}, σ=${stdDev.toFixed(2)}, n=${model.count}`;
}

/**
 * Get the 95% confidence interval for a model.
 *
 * @param model - The model to analyze
 * @returns [lower, upper] bounds or null if insufficient data
 */
export function getConfidenceInterval(model: MetricModel): [number, number] | null {
  if (model.count < MIN_OBSERVATIONS) {
    return null;
  }

  const stdDev = Math.sqrt(model.variance);
  return [
    model.mean - 2 * stdDev,
    model.mean + 2 * stdDev,
  ];
}
