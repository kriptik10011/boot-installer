"""
Pattern Detection Services

Implements the intelligence layer — inferring patterns from observation data.
Uses code logic and statistics (no ML required).

New in Intelligence Boundary Analysis:
- ADWIN: Adaptive windowing for drift detection (not ML - uses Hoeffding bounds)
- ResilientStreak: Forgiveness-based streak tracking (not binary shame-based)
- ColdStartManager: Progressive personalization with templates
"""

from app.services.pattern_detection.constants import EWMA_ALPHA
from app.services.pattern_detection.temporal_patterns import TemporalPatternDetector
from app.services.pattern_detection.behavioral_patterns import BehavioralPatternDetector
from app.services.pattern_detection.domain_patterns import DomainPatternDetector
from app.services.pattern_detection.engine import PatternEngine
from app.services.pattern_detection.adwin import ADWIN, DriftDetector, ADWINResult
from app.services.pattern_detection.resilient_streak import ResilientStreak, HabitStreakTracker
from app.services.pattern_detection.cold_start import (
    ColdStartManager,
    shrinkage_blend,
    get_adaptive_threshold,
    get_learning_progress,
)
from app.services.pattern_detection.transitions import (
    TransitionTracker,
    ViewSequence,
    detect_workflow_shortcuts,
    get_view_centrality,
)

__all__ = [
    # Shared constants
    "EWMA_ALPHA",
    # Core pattern detectors
    "TemporalPatternDetector",
    "BehavioralPatternDetector",
    "DomainPatternDetector",
    "PatternEngine",
    # ADWIN drift detection
    "ADWIN",
    "DriftDetector",
    "ADWINResult",
    # Resilient streak tracking
    "ResilientStreak",
    "HabitStreakTracker",
    # Cold start and personalization
    "ColdStartManager",
    "shrinkage_blend",
    "get_adaptive_threshold",
    "get_learning_progress",
    # Markov Transition Tracking (CPT-ready)
    "TransitionTracker",
    "ViewSequence",
    "detect_workflow_shortcuts",
    "get_view_centrality",
]
