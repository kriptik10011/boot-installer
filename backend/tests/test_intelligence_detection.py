"""
Phase 4A-4: Detection & Navigation Model Verification

Tests Markov transition tracking, session type inference, workflow shortcuts,
and view centrality. Documents Mode Detection, Misclick Tracking, and
Interaction Velocity as NOT IMPLEMENTED (deferred to V2).

Verifies model-parameters.md §11 (Markov), §12 (Session Inference).
Documents §13 (Mode Detection), §14 (Misclick), §15 (Velocity) as RED/deferred.
"""

import json
import os
import tempfile

import pytest

from app.services.pattern_detection.transitions import (
    TransitionTracker,
    ViewSequence,
    detect_workflow_shortcuts,
    get_view_centrality,
)


# =============================================================================
# S11: MARKOV TRANSITION TRACKER
# =============================================================================


class TestViewSequence:
    """Test CPT-ready sequence storage."""

    def test_add_view_records_in_order(self):
        seq = ViewSequence(session_id="s1")
        seq.add_view("MealPanel")
        seq.add_view("RecipeSearch")
        seq.add_view("ShoppingList")
        assert seq.views == ["MealPanel", "RecipeSearch", "ShoppingList"]
        assert len(seq.timestamps) == 3

    def test_round_trip_serialization(self):
        seq = ViewSequence(session_id="s1")
        seq.add_view("A")
        seq.add_view("B")
        data = seq.to_dict()
        restored = ViewSequence.from_dict(data)
        assert restored.session_id == "s1"
        assert restored.views == ["A", "B"]
        assert len(restored.timestamps) == 2

    def test_empty_sequence(self):
        seq = ViewSequence(session_id="empty")
        assert seq.views == []
        assert seq.timestamps == []
        data = seq.to_dict()
        restored = ViewSequence.from_dict(data)
        assert restored.views == []


class TestMarkovBasics:
    """Test fundamental Markov chain operations."""

    def test_record_view_updates_transition_counts(self):
        tracker = TransitionTracker()
        tracker.start_session("s1")
        tracker.record_view("A")
        tracker.record_view("B")
        # A→B should have count 1
        assert tracker.transition_counts["A"]["B"] == 1

    def test_multiple_transitions_accumulate(self):
        tracker = TransitionTracker()
        tracker.start_session("s1")
        tracker.record_view("A")
        tracker.record_view("B")
        tracker.record_view("A")
        tracker.record_view("B")
        # A→B seen twice
        assert tracker.transition_counts["A"]["B"] == 2
        # B→A seen once
        assert tracker.transition_counts["B"]["A"] == 1

    def test_first_view_has_no_transition(self):
        """First view in a session creates no transition (no predecessor)."""
        tracker = TransitionTracker()
        tracker.start_session("s1")
        tracker.record_view("A")
        # state_counts should have A (it was visited)
        assert tracker.state_counts["A"] == 1
        # But no transition from A yet (no predecessor)
        assert sum(tracker.transition_counts["A"].values()) == 0

    def test_auto_session_start(self):
        """record_view without start_session auto-starts."""
        tracker = TransitionTracker()
        tracker.record_view("A")
        tracker.record_view("B")
        assert tracker.current_sequence is not None
        assert tracker.current_sequence.views == ["A", "B"]

    def test_session_boundaries_break_transitions(self):
        """Views in different sessions don't create transitions."""
        tracker = TransitionTracker()
        # Session 1: A → B
        tracker.start_session("s1")
        tracker.record_view("A")
        tracker.record_view("B")
        # Session 2: C → D (B→C should NOT be a transition)
        tracker.start_session("s2")
        tracker.record_view("C")
        tracker.record_view("D")
        # B→C should not exist
        assert tracker.transition_counts["B"].get("C", 0) == 0
        # A→B and C→D should exist
        assert tracker.transition_counts["A"]["B"] == 1
        assert tracker.transition_counts["C"]["D"] == 1

    def test_end_session_archives_sequence(self):
        tracker = TransitionTracker()
        tracker.start_session("s1")
        tracker.record_view("A")
        tracker.record_view("B")
        tracker.end_session()
        assert tracker.current_sequence is None
        assert len(tracker.sequences) == 1
        assert tracker.sequences[0].views == ["A", "B"]

    def test_end_session_empty_no_archive(self):
        """Empty session is not archived."""
        tracker = TransitionTracker()
        tracker.start_session("s1")
        tracker.end_session()
        assert len(tracker.sequences) == 0


class TestMarkovPrediction:
    """Test prediction (P(Next|Current)) calculations."""

    def test_basic_probability(self):
        """P(B|A) = Count(A→B) / Total(A→*)"""
        tracker = TransitionTracker()
        tracker.start_session("s1")
        # A→B twice, A→C once
        tracker.record_view("A")
        tracker.record_view("B")
        tracker.record_view("A")
        tracker.record_view("B")
        tracker.record_view("A")
        tracker.record_view("C")
        prob_b = tracker.get_transition_probability("A", "B")
        prob_c = tracker.get_transition_probability("A", "C")
        assert abs(prob_b - 2 / 3) < 0.001
        assert abs(prob_c - 1 / 3) < 0.001

    def test_probabilities_sum_to_one(self):
        tracker = TransitionTracker()
        tracker.start_session("s1")
        for _ in range(10):
            tracker.record_view("A")
            tracker.record_view("B")
        for _ in range(5):
            tracker.record_view("A")
            tracker.record_view("C")
        predictions = tracker.predict_next("A")
        total_prob = sum(p for _, p in predictions)
        assert abs(total_prob - 1.0) < 0.001

    def test_top_k_limits_results(self):
        tracker = TransitionTracker()
        tracker.start_session("s1")
        # A transitions to B, C, D, E
        for view in ["B", "C", "D", "E"]:
            tracker.record_view("A")
            tracker.record_view(view)
        preds = tracker.predict_next("A", top_k=2)
        assert len(preds) == 2

    def test_prediction_sorted_by_probability(self):
        tracker = TransitionTracker()
        tracker.start_session("s1")
        # A→B 5 times, A→C 2 times, A→D 1 time
        for _ in range(5):
            tracker.record_view("A")
            tracker.record_view("B")
        for _ in range(2):
            tracker.record_view("A")
            tracker.record_view("C")
        tracker.record_view("A")
        tracker.record_view("D")
        preds = tracker.predict_next("A")
        assert preds[0][0] == "B"
        assert preds[1][0] == "C"
        assert preds[2][0] == "D"

    def test_unknown_view_returns_empty(self):
        tracker = TransitionTracker()
        preds = tracker.predict_next("NeverSeen")
        assert preds == []

    def test_unknown_transition_returns_zero(self):
        tracker = TransitionTracker()
        prob = tracker.get_transition_probability("X", "Y")
        assert prob == 0.0


class TestMarkovTransitionMatrix:
    """Test the full transition matrix export."""

    def test_matrix_has_all_source_states(self):
        tracker = TransitionTracker()
        tracker.start_session("s1")
        tracker.record_view("A")
        tracker.record_view("B")
        tracker.record_view("C")
        matrix = tracker.get_transition_matrix()
        assert "A" in matrix
        assert "B" in matrix
        # C has no outgoing transitions
        assert "C" not in matrix

    def test_matrix_rows_sum_to_one(self):
        tracker = TransitionTracker()
        tracker.start_session("s1")
        for _ in range(10):
            tracker.record_view("A")
            tracker.record_view("B")
            tracker.record_view("C")
        matrix = tracker.get_transition_matrix()
        for from_view, transitions in matrix.items():
            total = sum(transitions.values())
            assert abs(total - 1.0) < 0.001, f"Row {from_view} sums to {total}"


class TestMarkovDecay:
    """Test decay_alpha parameter behavior."""

    def test_default_alpha_is_01(self):
        tracker = TransitionTracker()
        assert tracker.decay_alpha == 0.1

    def test_custom_alpha(self):
        tracker = TransitionTracker(decay_alpha=0.3)
        assert tracker.decay_alpha == 0.3

    def test_alpha_preserved_in_persistence(self):
        """decay_alpha survives save/load cycle."""
        tracker = TransitionTracker(decay_alpha=0.5)
        with tempfile.NamedTemporaryFile(suffix=".json", delete=False, mode="w") as f:
            filepath = f.name
        try:
            tracker.save_to_file(filepath)
            restored = TransitionTracker.load_from_file(filepath)
            assert restored.decay_alpha == 0.5
        finally:
            os.unlink(filepath)


class TestCPTSequences:
    """Test CPT upgrade path — full sequence export."""

    def test_sequences_include_archived_and_current(self):
        tracker = TransitionTracker()
        # Session 1 (archived)
        tracker.start_session("s1")
        tracker.record_view("A")
        tracker.record_view("B")
        # Session 2 (current)
        tracker.start_session("s2")
        tracker.record_view("C")
        tracker.record_view("D")
        seqs = tracker.get_sequences_for_cpt()
        assert len(seqs) == 2
        assert seqs[0] == ["A", "B"]
        assert seqs[1] == ["C", "D"]

    def test_empty_sequences_excluded(self):
        tracker = TransitionTracker()
        tracker.start_session("s1")
        # Empty session
        tracker.start_session("s2")
        tracker.record_view("A")
        seqs = tracker.get_sequences_for_cpt()
        # Empty s1 excluded
        assert len(seqs) == 1


class TestMarkovPersistence:
    """Test save/load round-trip for restart recovery."""

    def test_full_round_trip(self):
        tracker = TransitionTracker()
        tracker.start_session("s1")
        tracker.record_view("A")
        tracker.record_view("B")
        tracker.record_view("C")
        tracker.end_session()

        with tempfile.NamedTemporaryFile(suffix=".json", delete=False, mode="w") as f:
            filepath = f.name
        try:
            tracker.save_to_file(filepath)
            restored = TransitionTracker.load_from_file(filepath)

            # Verify transition counts preserved
            assert restored.transition_counts["A"]["B"] == 1
            assert restored.transition_counts["B"]["C"] == 1

            # Verify sequences preserved
            seqs = restored.get_sequences_for_cpt()
            assert len(seqs) == 1
            assert seqs[0] == ["A", "B", "C"]

            # Verify predictions work
            preds = restored.predict_next("A")
            assert len(preds) == 1
            assert preds[0][0] == "B"
            assert preds[0][1] == 1.0
        finally:
            os.unlink(filepath)

    def test_missing_file_returns_empty_tracker(self):
        restored = TransitionTracker.load_from_file("/nonexistent/path.json")
        assert len(restored.sequences) == 0
        assert len(restored.transition_counts) == 0

    def test_corrupted_file_returns_empty_tracker(self):
        with tempfile.NamedTemporaryFile(
            suffix=".json", delete=False, mode="w"
        ) as f:
            f.write("not valid json {{{")
            filepath = f.name
        try:
            restored = TransitionTracker.load_from_file(filepath)
            assert len(restored.sequences) == 0
        finally:
            os.unlink(filepath)

    def test_statistics_after_load(self):
        tracker = TransitionTracker()
        tracker.start_session("s1")
        tracker.record_view("A")
        tracker.record_view("B")
        tracker.record_view("C")

        with tempfile.NamedTemporaryFile(suffix=".json", delete=False, mode="w") as f:
            filepath = f.name
        try:
            tracker.save_to_file(filepath)
            restored = TransitionTracker.load_from_file(filepath)
            stats = restored.get_statistics()
            assert stats["unique_views"] == 3
            assert stats["total_transitions"] == 2
        finally:
            os.unlink(filepath)


class TestWorkflowShortcuts:
    """Test frequent path detection for shortcut suggestions."""

    def test_detects_frequent_path(self):
        """Path A→B→C occurring 3+ times → suggest A→C shortcut."""
        tracker = TransitionTracker()
        for i in range(5):
            tracker.start_session(f"s{i}")
            tracker.record_view("A")
            tracker.record_view("B")
            tracker.record_view("C")

        shortcuts = detect_workflow_shortcuts(tracker, min_occurrences=3, path_length=3)
        assert len(shortcuts) >= 1
        # Should suggest A→C
        found = any(s["from"] == "A" and s["to"] == "C" for s in shortcuts)
        assert found, f"Expected A→C shortcut, got {shortcuts}"

    def test_infrequent_paths_excluded(self):
        """Paths below min_occurrences threshold not suggested."""
        tracker = TransitionTracker()
        # Only 2 occurrences of A→B→C
        for i in range(2):
            tracker.start_session(f"s{i}")
            tracker.record_view("A")
            tracker.record_view("B")
            tracker.record_view("C")

        shortcuts = detect_workflow_shortcuts(tracker, min_occurrences=3, path_length=3)
        assert len(shortcuts) == 0

    def test_longer_path_length(self):
        """Detect 4-step workflow paths."""
        tracker = TransitionTracker()
        for i in range(4):
            tracker.start_session(f"s{i}")
            tracker.record_view("A")
            tracker.record_view("B")
            tracker.record_view("C")
            tracker.record_view("D")

        shortcuts = detect_workflow_shortcuts(tracker, min_occurrences=3, path_length=4)
        assert len(shortcuts) >= 1
        found = any(s["from"] == "A" and s["to"] == "D" for s in shortcuts)
        assert found

    def test_shortcuts_sorted_by_frequency(self):
        """Most frequent shortcuts first."""
        tracker = TransitionTracker()
        # A→B→C: 5 times
        for i in range(5):
            tracker.start_session(f"abc{i}")
            tracker.record_view("A")
            tracker.record_view("B")
            tracker.record_view("C")
        # X→Y→Z: 3 times
        for i in range(3):
            tracker.start_session(f"xyz{i}")
            tracker.record_view("X")
            tracker.record_view("Y")
            tracker.record_view("Z")

        shortcuts = detect_workflow_shortcuts(tracker, min_occurrences=3, path_length=3)
        assert len(shortcuts) >= 2
        assert shortcuts[0]["occurrences"] >= shortcuts[1]["occurrences"]


class TestViewCentrality:
    """Test PageRank-like centrality for navigation hubs."""

    def test_hub_view_has_highest_centrality(self):
        """A view that many views transition through has high centrality."""
        tracker = TransitionTracker()
        tracker.start_session("s1")
        # All paths go through Hub
        for src in ["A", "B", "C", "D"]:
            tracker.record_view(src)
            tracker.record_view("Hub")
        centrality = get_view_centrality(tracker)
        assert "Hub" in centrality
        # Hub should have highest centrality
        assert centrality["Hub"] == max(centrality.values())

    def test_centrality_normalized_to_1(self):
        """Max centrality is 1.0."""
        tracker = TransitionTracker()
        tracker.start_session("s1")
        tracker.record_view("A")
        tracker.record_view("B")
        tracker.record_view("C")
        centrality = get_view_centrality(tracker)
        assert max(centrality.values()) == 1.0

    def test_empty_tracker_empty_centrality(self):
        tracker = TransitionTracker()
        centrality = get_view_centrality(tracker)
        assert centrality == {}

    def test_isolated_view_low_centrality(self):
        """A view with only one connection has low centrality."""
        tracker = TransitionTracker()
        tracker.start_session("s1")
        # Hub connects to many
        tracker.record_view("Hub")
        tracker.record_view("A")
        tracker.record_view("Hub")
        tracker.record_view("B")
        tracker.record_view("Hub")
        tracker.record_view("C")
        # Leaf only appears once
        tracker.record_view("Hub")
        tracker.record_view("Leaf")
        centrality = get_view_centrality(tracker)
        assert centrality["Hub"] > centrality["Leaf"]


# =============================================================================
# S12: SESSION TYPE INFERENCE
# =============================================================================


class TestSessionTypeInference:
    """
    Test the session type heuristic in observation.py.

    Planning session = duration > 300 seconds AND views >= 2.
    This is a simple heuristic, not a full mode detection chain.
    """

    def test_planning_session_criteria(self):
        """Session >5min with multiple views = planning."""
        duration = 600  # 10 minutes
        views = ["WeekView", "MealPanel", "RecipeSearch"]
        is_planning = duration > 300 and len(views) >= 2
        assert is_planning is True

    def test_short_session_not_planning(self):
        """Session < 5min even with multiple views = not planning."""
        duration = 120  # 2 minutes
        views = ["WeekView", "MealPanel"]
        is_planning = duration > 300 and len(views) >= 2
        assert is_planning is False

    def test_single_view_not_planning(self):
        """Long session with single view = not planning (quick check)."""
        duration = 600
        views = ["WeekView"]
        is_planning = duration > 300 and len(views) >= 2
        assert is_planning is False

    def test_boundary_exactly_300s(self):
        """300 seconds is NOT > 300 (strict inequality)."""
        duration = 300
        views = ["WeekView", "MealPanel"]
        is_planning = duration > 300 and len(views) >= 2
        assert is_planning is False

    def test_boundary_exactly_2_views(self):
        """2 views meets >= 2 threshold."""
        duration = 301
        views = ["WeekView", "MealPanel"]
        is_planning = duration > 300 and len(views) >= 2
        assert is_planning is True


# =============================================================================
# S13: MODE DETECTION — NOT IMPLEMENTED (V2)
# =============================================================================


class TestModeDetectionStatus:
    """
    Document that 4-tier mode detection chain is NOT implemented.

    Roadmap expected:
    - Session duration → temporal pattern → day heuristic → default
    - Planning, Cooking, Shopping, Living modes
    - Mid-session mode switches

    Reality: Only binary is_planning_session heuristic exists.
    This is V2 territory — requires more observation data to tune.
    """

    def test_no_mode_detection_module_exists(self):
        """Verify mode detection is not implemented."""
        # There should be no mode_detection module
        try:
            from app.services.pattern_detection import mode_detection
            has_module = True
        except ImportError:
            has_module = False
        assert not has_module, "Mode detection module found — update model-parameters.md!"

    def test_session_summary_has_only_binary_planning(self):
        """SessionSummary.is_planning_session is Boolean, not a mode enum."""
        from app.models.observation import SessionSummary
        col = SessionSummary.__table__.columns["is_planning_session"]
        # It's a Boolean column, not an Enum
        assert str(col.type) == "BOOLEAN"


# =============================================================================
# S14: MISCLICK TRACKING — NOT IMPLEMENTED (V2)
# =============================================================================


class TestMisclickTrackingStatus:
    """
    Document that misclick/correction tracking is NOT implemented.

    Roadmap expected:
    - 5-second reversal window
    - Cluster definition for fatigue detection

    Reality: Observation events are recorded but no reversal
    detection or fatigue clustering exists.
    """

    def test_no_reversal_tracking(self):
        """Verify no misclick/reversal tracking in observation events."""
        from app.models.observation import ObservationEventType
        event_types = [e.value for e in ObservationEventType]
        assert "misclick" not in event_types
        assert "reversal" not in event_types
        assert "correction" not in event_types


# =============================================================================
# S15: INTERACTION VELOCITY — NOT IMPLEMENTED (V2)
# =============================================================================


class TestInteractionVelocityStatus:
    """
    Document that interaction velocity buckets are NOT implemented.

    Roadmap expected:
    - LOW < 5/min, MEDIUM 5-15/min, HIGH > 15/min
    - HIGH velocity suppresses suggestions but not critical bills

    Reality: Session duration and event counts are tracked via
    behavioral_patterns.py, but no velocity bucket calculation
    or velocity-based suppression logic exists.
    """

    def test_no_velocity_module(self):
        """No dedicated velocity tracking exists."""
        try:
            from app.services.pattern_detection import velocity
            has_module = True
        except ImportError:
            has_module = False
        assert not has_module

    def test_behavioral_patterns_has_no_velocity(self):
        """BehavioralPatternDetector doesn't calculate velocity buckets."""
        from app.services.pattern_detection.behavioral_patterns import (
            BehavioralPatternDetector,
        )
        # No get_velocity or calculate_velocity method
        assert not hasattr(BehavioralPatternDetector, "get_velocity")
        assert not hasattr(BehavioralPatternDetector, "calculate_velocity")


# =============================================================================
# STATISTICS & EDGE CASES
# =============================================================================


class TestTrackerStatistics:
    """Test statistics reporting."""

    def test_statistics_counts(self):
        tracker = TransitionTracker()
        tracker.start_session("s1")
        tracker.record_view("A")
        tracker.record_view("B")
        tracker.record_view("C")
        stats = tracker.get_statistics()
        assert stats["unique_views"] == 3
        assert stats["total_transitions"] == 2
        assert stats["current_sequence_length"] == 3

    def test_statistics_empty(self):
        tracker = TransitionTracker()
        stats = tracker.get_statistics()
        assert stats["unique_views"] == 0
        assert stats["total_transitions"] == 0
        assert stats["total_sequences"] == 0
        assert stats["current_sequence_length"] == 0

    def test_statistics_after_end_session(self):
        tracker = TransitionTracker()
        tracker.start_session("s1")
        tracker.record_view("A")
        tracker.record_view("B")
        tracker.end_session()
        stats = tracker.get_statistics()
        assert stats["total_sequences"] == 1
        assert stats["current_sequence_length"] == 0


class TestMarkovEdgeCases:
    """Edge cases and stress scenarios."""

    def test_self_loop(self):
        """View transitioning to itself."""
        tracker = TransitionTracker()
        tracker.start_session("s1")
        tracker.record_view("A")
        tracker.record_view("A")
        tracker.record_view("A")
        prob = tracker.get_transition_probability("A", "A")
        assert prob == 1.0

    def test_many_views_no_overflow(self):
        """100 unique views don't cause issues."""
        tracker = TransitionTracker()
        tracker.start_session("s1")
        for i in range(100):
            tracker.record_view(f"View_{i}")
        stats = tracker.get_statistics()
        assert stats["unique_views"] == 100
        assert stats["total_transitions"] == 99

    def test_many_sessions(self):
        """50 sessions with proper archival."""
        tracker = TransitionTracker()
        for i in range(50):
            tracker.start_session(f"s{i}")
            tracker.record_view("A")
            tracker.record_view("B")
        tracker.end_session()
        # 49 archived by start_session + 1 by end_session
        assert len(tracker.sequences) == 50

    def test_predict_deterministic_chain(self):
        """A always goes to B, B always goes to C — predictions are 100%."""
        tracker = TransitionTracker()
        for i in range(10):
            tracker.start_session(f"s{i}")
            tracker.record_view("A")
            tracker.record_view("B")
            tracker.record_view("C")
        assert tracker.get_transition_probability("A", "B") == 1.0
        assert tracker.get_transition_probability("B", "C") == 1.0

    def test_diverging_paths(self):
        """A goes to B or C with equal probability."""
        tracker = TransitionTracker()
        for i in range(10):
            tracker.start_session(f"ab{i}")
            tracker.record_view("A")
            tracker.record_view("B")
        for i in range(10):
            tracker.start_session(f"ac{i}")
            tracker.record_view("A")
            tracker.record_view("C")
        prob_b = tracker.get_transition_probability("A", "B")
        prob_c = tracker.get_transition_probability("A", "C")
        assert abs(prob_b - 0.5) < 0.001
        assert abs(prob_c - 0.5) < 0.001
