"""
Markov Transition Tracker with CPT Upgrade Path

Stores full view sequences (not just pairs) to enable
Compact Prediction Trees upgrade in V2.

V1: First-order Markov chains
- P(Next=j | Current=i) = Count(i→j) / Count(i)
- Decay-based weight updates: P_new = (1-α)×P_old + α×Current

V2 Upgrade Path: Compact Prediction Trees (CPT)
- Same data model supports CPT Trie construction
- CPT remembers full sequences for context-aware predictions
- Store full view sequences NOW so CPT can use the data later

Usage:
    tracker = TransitionTracker()
    tracker.start_session("session_123")
    tracker.record_view("MealPanel")
    tracker.record_view("RecipeSearch")
    tracker.record_view("ShoppingList")

    # Get predictions
    predictions = tracker.predict_next("MealPanel", top_k=3)
    # [("RecipeSearch", 0.8), ("ShoppingList", 0.15), ("Settings", 0.05)]

    # Export for CPT training in V2
    sequences = tracker.get_sequences_for_cpt()
    # [["MealPanel", "RecipeSearch", "ShoppingList"], ...]

@see intelligence-decisions.md "Markov Transition Tracking (CPT-Ready)"
"""

from dataclasses import dataclass, field
from datetime import datetime
from collections import defaultdict
from typing import Optional
import json
import os


@dataclass
class ViewSequence:
    """
    Full sequence storage for CPT upgrade path.

    Unlike simple transition pairs (A→B), this stores the complete
    sequence (A→B→C→D) which enables CPT to learn that:
    - A→B→C usually leads to D
    - X→B→C usually leads to Y
    (Markov only sees C and can't distinguish these cases)
    """

    session_id: str
    views: list[str] = field(default_factory=list)
    timestamps: list[str] = field(default_factory=list)  # ISO format strings

    def add_view(self, view: str, timestamp: datetime = None):
        """Add a view to the sequence with timestamp."""
        self.views.append(view)
        ts = timestamp or datetime.now()
        self.timestamps.append(ts.isoformat())

    def to_dict(self) -> dict:
        """Serialize for JSON storage."""
        return {
            "session_id": self.session_id,
            "views": self.views,
            "timestamps": self.timestamps,
        }

    @classmethod
    def from_dict(cls, data: dict) -> "ViewSequence":
        """Deserialize from JSON."""
        seq = cls(session_id=data["session_id"])
        seq.views = data.get("views", [])
        seq.timestamps = data.get("timestamps", [])
        return seq


class TransitionTracker:
    """
    V1: Markov transition matrix with decay updates.
    V2: Same data enables CPT Trie construction.

    Key Features:
    - Stores full sequences (not just pairs) for CPT upgrade
    - Decay-based weight updates for adapting to changing workflows
    - Persistence to file for restart recovery
    - Prediction API for prefetching and shortcuts

    Math:
    - P(Next=j | Current=i) = Count(i→j) / Count(i)
    - Decay update: P_new = (1-α)×P_old + α×CurrentTransition
    - Default α = 0.1 (recent behavior matters more)
    """

    def __init__(self, decay_alpha: float = 0.1):
        """
        Initialize the tracker.

        Args:
            decay_alpha: How much to weight recent observations vs history.
                        Higher = more responsive to changes.
                        Lower = more stable predictions.
        """
        self.decay_alpha = decay_alpha
        self.sequences: list[ViewSequence] = []
        self.current_sequence: Optional[ViewSequence] = None

        # Transition counts for Markov matrix
        # transition_counts[from_view][to_view] = count
        self.transition_counts: dict[str, dict[str, int]] = defaultdict(
            lambda: defaultdict(int)
        )

        # Total outgoing transitions from each state
        self.state_counts: dict[str, int] = defaultdict(int)

    def start_session(self, session_id: str):
        """
        Start a new session (new sequence).

        Call this when the user opens the app or after a long idle period.
        """
        # Save current sequence if exists
        if self.current_sequence and len(self.current_sequence.views) > 0:
            self.sequences.append(self.current_sequence)

        self.current_sequence = ViewSequence(session_id=session_id)

    def end_session(self):
        """
        Explicitly end the current session.

        Called when app closes or user goes idle.
        """
        if self.current_sequence and len(self.current_sequence.views) > 0:
            self.sequences.append(self.current_sequence)
            self.current_sequence = None

    def record_view(self, view: str, timestamp: datetime = None):
        """
        Record a view/screen transition.

        This updates both:
        1. The full sequence (for CPT upgrade)
        2. The Markov transition counts (for V1 predictions)

        Args:
            view: Name of the view/screen (e.g., "MealPanel", "RecipeSearch")
            timestamp: When the view was visited (defaults to now)
        """
        # Auto-start session if needed
        if not self.current_sequence:
            self.start_session(f"auto_{datetime.now().isoformat()}")

        # Get previous view for transition tracking
        prev_view = (
            self.current_sequence.views[-1] if self.current_sequence.views else None
        )

        # Record to sequence (for CPT upgrade path)
        self.current_sequence.add_view(view, timestamp)

        # Update Markov counts
        self.state_counts[view] += 1
        if prev_view:
            self.transition_counts[prev_view][view] += 1

    def predict_next(
        self, current_view: str, top_k: int = 3
    ) -> list[tuple[str, float]]:
        """
        Predict next views with probabilities.

        Returns: [(view, probability), ...] sorted by probability descending

        Args:
            current_view: The user's current view/screen
            top_k: Maximum predictions to return

        Example:
            predictions = tracker.predict_next("MealPanel")
            # [("RecipeSearch", 0.8), ("ShoppingList", 0.15), ("Settings", 0.05)]
        """
        if current_view not in self.transition_counts:
            return []

        transitions = self.transition_counts[current_view]
        total = sum(transitions.values())

        if total == 0:
            return []

        predictions = [(view, count / total) for view, count in transitions.items()]

        # Sort by probability, return top k
        predictions.sort(key=lambda x: x[1], reverse=True)
        return predictions[:top_k]

    def get_transition_probability(self, from_view: str, to_view: str) -> float:
        """
        Get P(to_view | from_view).

        Returns 0.0 if no data for the transition.
        """
        if from_view not in self.transition_counts:
            return 0.0

        transitions = self.transition_counts[from_view]
        total = sum(transitions.values())

        if total == 0:
            return 0.0

        return transitions.get(to_view, 0) / total

    def get_transition_matrix(self) -> dict[str, dict[str, float]]:
        """
        Get the full Markov transition matrix as probabilities.

        Returns: {from_view: {to_view: probability, ...}, ...}
        """
        matrix = {}
        for from_view in self.transition_counts:
            total = sum(self.transition_counts[from_view].values())
            if total > 0:
                matrix[from_view] = {
                    to_view: count / total
                    for to_view, count in self.transition_counts[from_view].items()
                }
        return matrix

    def get_sequences_for_cpt(self) -> list[list[str]]:
        """
        Export sequences for CPT training (V2 upgrade).

        Returns list of view sequences. Each sequence is a list of view names
        in the order they were visited.

        Example:
            sequences = tracker.get_sequences_for_cpt()
            # [
            #     ["MealPanel", "RecipeSearch", "ShoppingList"],
            #     ["Settings", "Inventory", "MealPanel"],
            #     ...
            # ]
        """
        all_sequences = [seq.views for seq in self.sequences if seq.views]
        if self.current_sequence and self.current_sequence.views:
            all_sequences.append(self.current_sequence.views)
        return all_sequences

    def get_statistics(self) -> dict:
        """Get summary statistics for debugging."""
        all_views = set(self.state_counts.keys())
        for from_view in self.transition_counts:
            all_views.update(self.transition_counts[from_view].keys())

        total_transitions = sum(
            sum(transitions.values())
            for transitions in self.transition_counts.values()
        )

        return {
            "unique_views": len(all_views),
            "total_transitions": total_transitions,
            "total_sequences": len(self.sequences)
            + (1 if self.current_sequence else 0),
            "current_sequence_length": len(self.current_sequence.views)
            if self.current_sequence
            else 0,
            "views": list(all_views),
        }

    # =========================================================================
    # PERSISTENCE
    # =========================================================================

    def save_to_file(self, filepath: str):
        """
        Persist tracker state for restart recovery.

        Args:
            filepath: Path to save JSON data
        """
        # Ensure directory exists
        os.makedirs(os.path.dirname(filepath) or ".", exist_ok=True)

        data = {
            "version": 1,
            "decay_alpha": self.decay_alpha,
            "sequences": [seq.to_dict() for seq in self.sequences],
            "current_sequence": self.current_sequence.to_dict()
            if self.current_sequence
            else None,
            "transition_counts": {
                from_view: dict(transitions)
                for from_view, transitions in self.transition_counts.items()
            },
            "state_counts": dict(self.state_counts),
            "saved_at": datetime.now().isoformat(),
        }

        with open(filepath, "w") as f:
            json.dump(data, f, indent=2)

    @classmethod
    def load_from_file(cls, filepath: str) -> "TransitionTracker":
        """
        Load tracker from persistence file.

        Args:
            filepath: Path to load JSON data from

        Returns:
            TransitionTracker with restored state
        """
        tracker = cls()

        try:
            with open(filepath, "r") as f:
                data = json.load(f)

            tracker.decay_alpha = data.get("decay_alpha", 0.1)

            # Restore sequences
            for seq_data in data.get("sequences", []):
                tracker.sequences.append(ViewSequence.from_dict(seq_data))

            # Restore current sequence
            if data.get("current_sequence"):
                tracker.current_sequence = ViewSequence.from_dict(
                    data["current_sequence"]
                )

            # Restore transition counts
            for from_view, transitions in data.get("transition_counts", {}).items():
                for to_view, count in transitions.items():
                    tracker.transition_counts[from_view][to_view] = count

            # Restore state counts
            tracker.state_counts = defaultdict(int, data.get("state_counts", {}))

        except FileNotFoundError:
            pass  # Return empty tracker
        except json.JSONDecodeError:
            pass  # Return empty tracker on corrupted file

        return tracker


# =============================================================================
# CONVENIENCE FUNCTIONS
# =============================================================================


def detect_workflow_shortcuts(
    tracker: TransitionTracker, min_occurrences: int = 3, path_length: int = 3
) -> list[dict]:
    """
    Detect potential workflow shortcuts from recorded sequences.

    If users frequently go A→B→C→D, suggest a shortcut A→D.

    Args:
        tracker: The TransitionTracker with recorded data
        min_occurrences: Minimum times path must occur to be a "workflow"
        path_length: Minimum path length to consider for shortcuts

    Returns:
        List of shortcut suggestions with details
    """
    sequences = tracker.get_sequences_for_cpt()

    # Count path occurrences
    path_counts: dict[tuple[str, ...], int] = defaultdict(int)

    for seq in sequences:
        for i in range(len(seq) - path_length + 1):
            path = tuple(seq[i : i + path_length])
            path_counts[path] += 1

    # Find frequent paths
    shortcuts = []
    for path, count in path_counts.items():
        if count >= min_occurrences:
            shortcuts.append(
                {
                    "from": path[0],
                    "to": path[-1],
                    "full_path": list(path),
                    "occurrences": count,
                    "suggestion": f"Add shortcut: {path[0]} → {path[-1]}",
                }
            )

    # Sort by frequency
    shortcuts.sort(key=lambda x: x["occurrences"], reverse=True)
    return shortcuts


def get_view_centrality(tracker: TransitionTracker) -> dict[str, float]:
    """
    Calculate PageRank-like centrality for views.

    Views with high centrality are "hubs" that users pass through frequently.
    These might deserve prominent placement in navigation.

    Returns:
        {view_name: centrality_score, ...}
    """
    # Simple degree centrality (in-degree + out-degree)
    centrality: dict[str, float] = defaultdict(float)

    for from_view, transitions in tracker.transition_counts.items():
        out_degree = len(transitions)
        centrality[from_view] += out_degree

        for to_view in transitions:
            centrality[to_view] += 1  # in-degree

    # Normalize by max
    if centrality:
        max_val = max(centrality.values())
        if max_val > 0:
            for view in centrality:
                centrality[view] /= max_val

    return dict(centrality)
