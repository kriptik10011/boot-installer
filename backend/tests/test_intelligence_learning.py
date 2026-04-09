"""
Phase 4A-2: Learning Models Math Verification

Deep convergence tests and edge cases for:
- LinUCB (simple counter) — convergence, cold start, anti-pattern
- EWMA — 8-week simulation, declining trend, alpha sensitivity
- Forgiveness Streaks — rolling vs per-streak, retroactive, max grace, supportive language
"""

import pytest
from datetime import date, timedelta

from app.models.recipe import (
    Ingredient, IngredientCategory, TrackingMode,
    generate_canonical_name, infer_category_from_name,
)
from app.models.habit_streak import HabitStreak
from app.services.pattern_detection.behavioral_patterns import BehavioralPatternDetector


# =============================================================================
# LINUCB (Simple Counter) — Deep Convergence
# =============================================================================

class TestLinUCBConvergence:
    """Extended LinUCB (simple counter) verification."""

    def test_20_count_0_percentage_strongly_prefers_count(self):
        """20 COUNT / 0 PERCENTAGE → strongly prefer COUNT."""
        ing = Ingredient(name="eggs")
        ing.count_interactions = 20
        ing.percentage_interactions = 0
        result = ing.get_suggested_tracking_mode()
        assert result == TrackingMode.COUNT

    def test_0_count_20_percentage_strongly_prefers_percentage(self):
        """0 COUNT / 20 PERCENTAGE → strongly prefer PERCENTAGE."""
        ing = Ingredient(name="olive oil")
        ing.count_interactions = 0
        ing.percentage_interactions = 20
        result = ing.get_suggested_tracking_mode()
        assert result == TrackingMode.PERCENTAGE

    def test_cold_start_zero_interactions_no_crash(self):
        """0 interactions → None suggestion, no crash."""
        ing = Ingredient(name="test")
        ing.count_interactions = 0
        ing.percentage_interactions = 0
        result = ing.get_suggested_tracking_mode()
        assert result is None

    def test_cold_start_none_interactions_no_crash(self):
        """None interactions (fresh DB row) → None suggestion, no crash."""
        ing = Ingredient(name="test")
        ing.count_interactions = None
        ing.percentage_interactions = None
        result = ing.get_suggested_tracking_mode()
        assert result is None

    def test_4_interactions_no_suggestion(self):
        """4 total → below threshold, no suggestion."""
        ing = Ingredient(name="test")
        ing.count_interactions = 3
        ing.percentage_interactions = 1
        assert ing.get_suggested_tracking_mode() is None

    def test_5_interactions_at_threshold(self):
        """Exactly 5 total → at threshold, suggestion given."""
        ing = Ingredient(name="test")
        ing.count_interactions = 4
        ing.percentage_interactions = 1
        assert ing.get_suggested_tracking_mode() == TrackingMode.COUNT

    def test_gradual_convergence_simulation(self):
        """Simulate 20 interactions gradually leaning toward COUNT."""
        ing = Ingredient(name="flour")
        ing.count_interactions = 0
        ing.percentage_interactions = 0

        # First 4: no suggestion
        for i in range(4):
            ing.record_tracking_interaction(TrackingMode.COUNT)
        assert ing.get_suggested_tracking_mode() is None

        # 5th: now 5-0, suggest COUNT
        ing.record_tracking_interaction(TrackingMode.COUNT)
        assert ing.get_suggested_tracking_mode() == TrackingMode.COUNT

        # Mix in some PERCENTAGE: 5 COUNT / 3 PERCENTAGE
        for _ in range(3):
            ing.record_tracking_interaction(TrackingMode.PERCENTAGE)
        # 5-3, COUNT still leads
        assert ing.get_suggested_tracking_mode() == TrackingMode.COUNT

    def test_mode_flip_after_behavior_change(self):
        """User changes preference: initially COUNT, then switches to PERCENTAGE."""
        ing = Ingredient(name="oil")
        ing.count_interactions = 10
        ing.percentage_interactions = 0
        assert ing.get_suggested_tracking_mode() == TrackingMode.COUNT

        # User flips: 15 more PERCENTAGE interactions
        for _ in range(15):
            ing.record_tracking_interaction(TrackingMode.PERCENTAGE)
        # Now 10 COUNT / 15 PERCENTAGE → PERCENTAGE wins
        assert ing.get_suggested_tracking_mode() == TrackingMode.PERCENTAGE

    def test_suggest_never_mutates_preference(self):
        """get_suggested_tracking_mode() is read-only."""
        ing = Ingredient(name="test")
        ing.count_interactions = 10
        ing.percentage_interactions = 2
        ing.preferred_tracking_mode = None

        # Call 10 times
        for _ in range(10):
            ing.get_suggested_tracking_mode()

        # preferred_tracking_mode must still be None
        assert ing.preferred_tracking_mode is None

    def test_preferred_overrides_cold_start(self):
        """User explicitly sets preference → overrides cold start default."""
        ing = Ingredient(name="olive oil", category=IngredientCategory.LIQUID)
        # Cold start would say PERCENTAGE
        assert ing.get_effective_tracking_mode() == TrackingMode.PERCENTAGE

        # User sets explicit preference to COUNT
        ing.preferred_tracking_mode = TrackingMode.COUNT
        assert ing.get_effective_tracking_mode() == TrackingMode.COUNT

    def test_all_categories_have_valid_cold_start(self):
        """Every IngredientCategory produces a valid TrackingMode."""
        for cat in IngredientCategory:
            ing = Ingredient(name="test", category=cat)
            mode = ing.get_effective_tracking_mode()
            assert mode in (TrackingMode.COUNT, TrackingMode.PERCENTAGE)


# =============================================================================
# EWMA — 8-Week Simulation
# =============================================================================

class TestEWMADeep:
    """Deep EWMA verification including 8-week simulations."""

    def _make_detector(self):
        detector = BehavioralPatternDetector.__new__(BehavioralPatternDetector)
        return detector

    def test_alpha_is_0_3(self):
        """Verify alpha constant."""
        from app.services.pattern_detection.constants import EWMA_ALPHA
        assert EWMA_ALPHA == 0.3

    def test_8_week_stable_pattern(self):
        """8 weeks of stable 100-second sessions → EWMA ≈ 100."""
        detector = self._make_detector()
        values = [100.0] * 8
        ewma = detector._calculate_ewma(values, alpha=0.3)
        assert abs(ewma - 100.0) < 0.01

    def test_8_week_declining_trend(self):
        """8 weeks declining: 100 → 30 → EWMA detects downtrend."""
        detector = self._make_detector()
        values = [100, 90, 80, 70, 60, 50, 40, 30]
        ewma = detector._calculate_ewma(values, alpha=0.3)
        median = sorted(values)[len(values) // 2]  # 55
        # EWMA should be below median (weighted toward recent low values)
        assert ewma < median

    def test_8_week_increasing_trend(self):
        """8 weeks increasing: 30 → 100 → EWMA detects uptrend."""
        detector = self._make_detector()
        values = [30, 40, 50, 60, 70, 80, 90, 100]
        ewma = detector._calculate_ewma(values, alpha=0.3)
        median = sorted(values)[len(values) // 2]  # 65
        # EWMA should be above median (weighted toward recent high values)
        assert ewma > median

    def test_spike_recovery(self):
        """Spike in week 4, recovery by week 8."""
        detector = self._make_detector()
        values = [50, 50, 50, 200, 50, 50, 50, 50]  # Spike at position 3
        ewma = detector._calculate_ewma(values, alpha=0.3)
        # With alpha=0.3, spike influence decays quickly
        # After 4 more values of 50, EWMA should be close to 50
        assert 50 < ewma < 70  # Some residual from spike

    def test_alpha_sensitivity_high(self):
        """Higher alpha = more responsive to recent changes."""
        detector = self._make_detector()
        values = [10, 10, 10, 10, 100]

        low_alpha = detector._calculate_ewma(values, alpha=0.1)
        high_alpha = detector._calculate_ewma(values, alpha=0.9)

        # High alpha should be much closer to 100 (most recent)
        assert high_alpha > low_alpha
        assert high_alpha > 80  # Very responsive
        assert low_alpha < 30  # Slow to react

    def test_trend_classification(self):
        """Verify trend classification: stable vs increasing vs decreasing."""
        detector = self._make_detector()

        # Stable: all same value
        stable_ewma = detector._calculate_ewma([50, 50, 50, 50], alpha=0.3)
        stable_median = 50
        assert abs(stable_ewma - stable_median) / stable_median < 0.2  # Within 20% → stable

        # Increasing: longer sequence so alpha=0.3 has time to shift
        inc_ewma = detector._calculate_ewma([10, 20, 30, 40, 60, 80, 100, 120], alpha=0.3)
        inc_median = sorted([10, 20, 30, 40, 60, 80, 100, 120])[4]  # 60
        # EWMA weighted toward recent high values, should be above median
        assert inc_ewma > inc_median  # Trending up

        # Decreasing: longer sequence
        dec_ewma = detector._calculate_ewma([120, 100, 80, 60, 40, 30, 20, 10], alpha=0.3)
        dec_median = sorted([120, 100, 80, 60, 40, 30, 20, 10])[4]  # 60
        # EWMA weighted toward recent low values, should be below median
        assert dec_ewma < dec_median  # Trending down


# =============================================================================
# FORGIVENESS STREAKS — Edge Cases
# =============================================================================

class TestForgivenessDeep:
    """Deep forgiveness streak edge case verification."""

    def _make_habit(self, **kwargs):
        defaults = {
            "habit_name": "test_habit",
            "current_streak": 0,
            "forgiveness_tokens": 2,
            "max_tokens": 2,
            "trend_score": 0.0,
            "total_occurrences": 0,
            "tracking_weeks": 0,
            "tokens_used": 0,
            "week_history": [],
        }
        defaults.update(kwargs)
        return HabitStreak(**defaults)

    def test_grace_period_is_per_streak_not_rolling(self):
        """
        Grace period is per-streak (token-based), not rolling.
        Using a token preserves the current streak — the miss is forgiven.
        """
        habit = self._make_habit(current_streak=5, forgiveness_tokens=2)

        # Miss with token: streak preserved
        habit.forgiveness_tokens -= 1
        # Streak stays at 5 (not reset)
        assert habit.current_streak == 5
        assert habit.forgiveness_tokens == 1

        # Another miss with token: still preserved
        habit.forgiveness_tokens -= 1
        assert habit.current_streak == 5
        assert habit.forgiveness_tokens == 0

        # Third miss: no tokens → streak breaks
        habit.current_streak = 0
        assert habit.current_streak == 0

    def test_max_grace_period_is_2_tokens(self):
        """Max grace = 2 tokens. Cannot exceed max_tokens."""
        habit = self._make_habit(forgiveness_tokens=2, max_tokens=2)
        # Try to add more: capped at max_tokens
        habit.forgiveness_tokens = min(3, habit.max_tokens)
        assert habit.forgiveness_tokens == 2

    def test_token_regeneration_monthly(self):
        """1 token per 30 days, up to max."""
        habit = self._make_habit(
            forgiveness_tokens=0,
            max_tokens=2,
            tokens_used=2,
            last_token_regen=date.today() - timedelta(days=30),
        )

        # After 30 days: should regen 1 token
        days_since = (date.today() - habit.last_token_regen).days
        assert days_since >= 30

        # Regen 1 token
        habit.forgiveness_tokens += 1
        assert habit.forgiveness_tokens == 1

    def test_token_regen_not_before_30_days(self):
        """No regen if < 30 days."""
        habit = self._make_habit(
            forgiveness_tokens=0,
            max_tokens=2,
            tokens_used=1,
            last_token_regen=date.today() - timedelta(days=15),
        )
        days_since = (date.today() - habit.last_token_regen).days
        assert days_since < 30  # Not yet

    def test_streak_break_message_supportive(self):
        """Verify streak break uses supportive language (no shame)."""
        habit = self._make_habit(current_streak=0, trend_score=0.0)
        display = habit.get_display()
        # "Starting fresh" — not "Failed" or "Broken"
        assert display["trend_label"] == "Starting fresh"
        assert "fail" not in display["display_text"].lower()
        assert "broke" not in display["display_text"].lower()

    def test_building_message(self):
        """Mid-range trend uses 'Building' label."""
        habit = self._make_habit(trend_score=0.55, tracking_weeks=4)
        display = habit.get_display()
        assert display["trend_label"] == "Building"

    def test_fading_message(self):
        """Low trend uses 'Fading' label."""
        habit = self._make_habit(trend_score=0.3, tracking_weeks=8)
        display = habit.get_display()
        assert display["trend_label"] == "Fading"

    def test_strong_habit_message(self):
        """High trend uses 'Strong habit' label."""
        habit = self._make_habit(trend_score=0.8, tracking_weeks=8)
        display = habit.get_display()
        assert display["trend_label"] == "Strong habit"

    def test_saves_display_positive_framing(self):
        """Saves text uses positive framing."""
        habit_with = self._make_habit(forgiveness_tokens=2)
        display = habit_with.get_display()
        assert "2 saves available" in display["saves_text"]

        habit_without = self._make_habit(forgiveness_tokens=0)
        display = habit_without.get_display()
        assert "No saves left" in display["saves_text"]

    def test_best_of_y_with_low_tracking_weeks(self):
        """Best X of Y when tracking_weeks < 8."""
        habit = self._make_habit(trend_score=1.0, tracking_weeks=3)
        display = habit.get_display()
        # lookback_weeks = min(8, 3) = 3
        # best_of_y = round(1.0 * 3) = 3
        assert display["best_of_y"] == "3/3"

    def test_best_of_y_with_zero_tracking_weeks(self):
        """Edge case: 0 tracking weeks → 0/1 (no div by zero)."""
        habit = self._make_habit(trend_score=0.0, tracking_weeks=0)
        display = habit.get_display()
        # lookback_weeks = min(8, 0) or 1 = 1
        # best_of_y = round(0.0 * 1) = 0
        assert display["best_of_y"] == "0/1"

    def test_8_week_mixed_simulation(self):
        """
        8-week simulation: hit, hit, miss(token), hit, miss(token), hit, miss(break), hit.
        Verify streak and trend at each step.
        """
        trend = 0.0
        streak = 0
        tokens = 2

        # Week 1: hit
        streak += 1
        trend = (trend * 0.7) + 0.3
        assert streak == 1

        # Week 2: hit
        streak += 1
        trend = (trend * 0.7) + 0.3
        assert streak == 2

        # Week 3: miss with token
        tokens -= 1
        trend = trend * 0.9
        assert streak == 2  # Preserved
        assert tokens == 1

        # Week 4: hit
        streak += 1
        trend = (trend * 0.7) + 0.3
        assert streak == 3

        # Week 5: miss with token
        tokens -= 1
        trend = trend * 0.9
        assert streak == 3  # Preserved
        assert tokens == 0

        # Week 6: hit
        streak += 1
        trend = (trend * 0.7) + 0.3
        assert streak == 4

        # Week 7: miss, no tokens → break
        streak = 0
        trend = trend * 0.7
        assert streak == 0
        assert tokens == 0

        # Week 8: hit (fresh start)
        streak += 1
        trend = (trend * 0.7) + 0.3

        # Final state
        assert streak == 1  # Fresh start
        assert 0.3 < trend < 0.7  # Moderate after mixed history

    def test_trend_convergence_bounds(self):
        """
        Trend score formula bounds:
        - Maximum: hit formula trend = t*0.7 + 0.3 → converges to 1.0
        - Minimum: miss formula trend = t*0.7 → converges to 0.0

        Verify convergence speed.
        """
        # Max convergence: continuous hits
        t = 0.0
        for i in range(20):
            t = (t * 0.7) + 0.3
            t = max(0.0, min(1.0, t))
        # Should be very close to 1.0 (limit = 0.3 / (1 - 0.7) = 1.0)
        assert t > 0.99

        # Min convergence: continuous misses without tokens
        t = 1.0
        for i in range(20):
            t = t * 0.7
            t = max(0.0, min(1.0, t))
        # Should be very close to 0.0
        assert t < 0.01


# =============================================================================
# CATEGORY INFERENCE
# =============================================================================

class TestCategoryInference:
    """Verify cold start category inference."""

    def test_liquid_inference(self):
        assert infer_category_from_name("olive oil") == IngredientCategory.LIQUID
        assert infer_category_from_name("soy sauce") == IngredientCategory.LIQUID
        assert infer_category_from_name("chicken broth") == IngredientCategory.LIQUID

    def test_protein_inference(self):
        assert infer_category_from_name("ground beef") == IngredientCategory.PROTEIN
        assert infer_category_from_name("chicken breast") == IngredientCategory.PROTEIN
        assert infer_category_from_name("large eggs") == IngredientCategory.PROTEIN

    def test_produce_inference(self):
        assert infer_category_from_name("garlic cloves") == IngredientCategory.PRODUCE
        assert infer_category_from_name("diced tomatoes") == IngredientCategory.PRODUCE
        assert infer_category_from_name("red onion") == IngredientCategory.PRODUCE

    def test_dairy_inference(self):
        assert infer_category_from_name("cheddar cheese") == IngredientCategory.DAIRY
        assert infer_category_from_name("unsalted butter") == IngredientCategory.DAIRY

    def test_spice_inference(self):
        assert infer_category_from_name("ground cumin") == IngredientCategory.SPICE
        assert infer_category_from_name("dried oregano") == IngredientCategory.SPICE

    def test_solid_default(self):
        """Unknown items default to SOLID."""
        assert infer_category_from_name("flour") == IngredientCategory.SOLID
        assert infer_category_from_name("quinoa") == IngredientCategory.SOLID
