"""
ADWIN (Adaptive Windowing) Algorithm for Drift Detection

Implements concept drift detection using Hoeffding bounds.
This is "simple math" (statistics), not machine learning.

Key insight from Intelligence Boundary Analysis:
- Simple z-scores can't differentiate between:
  - One-off anomaly: "You worked late one Tuesday" (not a pattern)
  - Concept drift: "You now work late every Tuesday" (new normal)
- Z-scores keep flagging the new normal as "anomalous" forever
- ADWIN automatically "forgets" old habits when patterns change

Use cases:
- Wake time detection (catches lifestyle changes)
- Spending baseline (catches income/expense changes)
- Planning time (catches schedule changes)
- Event patterns (catches routine changes)

NOT for one-off anomalies - use z-score for those.
"""

import math
from collections import deque
from dataclasses import dataclass
from typing import Optional


@dataclass
class ADWINResult:
    """Result of ADWIN drift detection."""

    drift_detected: bool
    """True if a significant change was detected"""

    old_mean: float
    """Mean before the drift point"""

    new_mean: float
    """Mean after the drift point (current window)"""

    cut_point: int
    """Index where the drift was detected"""

    window_size: int
    """Current window size after pruning"""

    message: str
    """Human-readable explanation"""


class ADWIN:
    """
    Adaptive Windowing for concept drift detection.

    Uses Hoeffding bounds to detect when the mean of a data stream
    has significantly changed. When drift is detected, the old data
    is automatically "forgotten" (window is shrunk).

    Parameters:
        delta: Confidence parameter (default: 0.002)
            Lower delta = more sensitive to drift
            Higher delta = fewer false positives
        min_window: Minimum window size before checking drift (default: 10)

    Example:
        >>> adwin = ADWIN(delta=0.002)
        >>> for wake_time in daily_wake_times:
        ...     result = adwin.add(wake_time)
        ...     if result.drift_detected:
        ...         print(f"Your wake time shifted from {result.old_mean} to {result.new_mean}")
    """

    def __init__(self, delta: float = 0.002, min_window: int = 10):
        self.delta = delta
        self.min_window = min_window
        self.window: deque[float] = deque()
        self._sum = 0.0
        self._sum_sq = 0.0
        self._last_drift_point = 0

    def add(self, value: float) -> ADWINResult:
        """
        Add a new value and check for drift.

        Args:
            value: New data point to add

        Returns:
            ADWINResult with drift detection information

        Raises:
            TypeError: If value is not a number
            ValueError: If value is NaN or Inf
        """
        # Input validation
        if not isinstance(value, (int, float)):
            raise TypeError(f"Expected numeric value, got {type(value).__name__}")
        if math.isnan(value) or math.isinf(value):
            raise ValueError("Cannot add NaN or Inf values to ADWIN")

        # Add to window (ensure float for consistency)
        value = float(value)
        self.window.append(value)
        self._sum += value
        self._sum_sq += value * value

        # Check for drift and shrink window if needed
        drift_result = self._detect_and_shrink()

        return drift_result

    def _detect_and_shrink(self) -> ADWINResult:
        """
        Detect drift and shrink window if significant change found.

        Uses Hoeffding bound to compare sub-windows.
        """
        n = len(self.window)

        # Not enough data yet
        if n < self.min_window:
            return ADWINResult(
                drift_detected=False,
                old_mean=0.0,
                new_mean=self.mean,
                cut_point=0,
                window_size=n,
                message="Gathering data..."
            )

        # Check for drift at various cut points
        for cut in range(self.min_window // 2, n - self.min_window // 2):
            # Calculate sub-window statistics
            left_values = list(self.window)[:cut]
            right_values = list(self.window)[cut:]

            n1 = len(left_values)
            n2 = len(right_values)

            if n1 < 5 or n2 < 5:
                continue

            mean1 = sum(left_values) / n1
            mean2 = sum(right_values) / n2

            # Calculate Hoeffding bound
            epsilon = self._hoeffding_bound(n1, n2)

            # Check if means differ significantly
            mean_diff = abs(mean1 - mean2)

            if mean_diff > epsilon:
                # Drift detected! Shrink window to keep only recent data
                old_mean = mean1
                new_mean = mean2

                # Remove old data (keep only right side)
                while len(self.window) > len(right_values):
                    removed = self.window.popleft()
                    self._sum -= removed
                    self._sum_sq -= removed * removed

                self._last_drift_point = cut

                return ADWINResult(
                    drift_detected=True,
                    old_mean=round(old_mean, 2),
                    new_mean=round(new_mean, 2),
                    cut_point=cut,
                    window_size=len(self.window),
                    message=f"Pattern changed: {old_mean:.1f} → {new_mean:.1f}"
                )

        # No drift detected
        return ADWINResult(
            drift_detected=False,
            old_mean=self.mean,
            new_mean=self.mean,
            cut_point=0,
            window_size=n,
            message="Pattern stable"
        )

    def _hoeffding_bound(self, n1: int, n2: int) -> float:
        """
        Calculate Hoeffding bound for two sub-windows.

        The bound determines how different the means must be
        to be considered statistically significant.
        """
        # Harmonic mean of sample sizes
        m = 1.0 / (1.0 / n1 + 1.0 / n2)

        # Hoeffding bound formula
        # epsilon = sqrt(ln(2/delta) / (2*m))
        epsilon = math.sqrt(math.log(2.0 / self.delta) / (2.0 * m))

        return epsilon

    @property
    def mean(self) -> float:
        """Current window mean."""
        if not self.window:
            return 0.0
        return self._sum / len(self.window)

    @property
    def variance(self) -> float:
        """Current window variance."""
        n = len(self.window)
        if n < 2:
            return 0.0
        mean = self.mean
        return (self._sum_sq / n) - (mean * mean)

    @property
    def std_dev(self) -> float:
        """Current window standard deviation."""
        return math.sqrt(max(0, self.variance))

    def is_anomaly(self, value: float, z_threshold: float = 2.0) -> bool:
        """
        Check if a value is a one-off anomaly (not drift).

        Use this for single-point anomaly detection.
        ADWIN.add() is for drift detection over time.

        Args:
            value: Value to check
            z_threshold: Z-score threshold (default: 2.0)

        Returns:
            True if value is anomalous given current window
        """
        if len(self.window) < self.min_window:
            return False

        std = self.std_dev
        if std == 0:
            return value != self.mean

        z_score = abs(value - self.mean) / std
        return z_score > z_threshold

    def reset(self):
        """Reset the window (e.g., for new tracking period)."""
        self.window.clear()
        self._sum = 0.0
        self._sum_sq = 0.0
        self._last_drift_point = 0


class DriftDetector:
    """
    High-level drift detection for application patterns.

    Wraps ADWIN for common use cases:
    - Wake time / sleep schedule
    - Spending patterns
    - Planning time
    - Activity levels
    """

    def __init__(self):
        self.detectors: dict[str, ADWIN] = {
            "wake_time": ADWIN(delta=0.01),      # Minutes since midnight
            "spending": ADWIN(delta=0.005),      # Weekly spending
            "planning_hour": ADWIN(delta=0.02),  # Hour of planning sessions
            "event_count": ADWIN(delta=0.01),    # Weekly event count
            "session_duration": ADWIN(delta=0.01),  # App session length
        }

    def record(self, pattern_type: str, value: float) -> Optional[ADWINResult]:
        """
        Record a value and check for drift.

        Args:
            pattern_type: Type of pattern (wake_time, spending, etc.)
            value: The observed value

        Returns:
            ADWINResult if pattern type is tracked, None otherwise
        """
        if pattern_type not in self.detectors:
            return None

        return self.detectors[pattern_type].add(value)

    def check_all_drift(self) -> dict[str, ADWINResult]:
        """Get current drift status for all patterns."""
        results = {}
        for pattern_type, adwin in self.detectors.items():
            if len(adwin.window) >= adwin.min_window:
                # Create a summary result without adding new data
                results[pattern_type] = ADWINResult(
                    drift_detected=False,
                    old_mean=adwin.mean,
                    new_mean=adwin.mean,
                    cut_point=0,
                    window_size=len(adwin.window),
                    message="Pattern stable" if len(adwin.window) >= adwin.min_window else "Gathering data..."
                )
        return results

    def get_pattern_summary(self, pattern_type: str) -> dict:
        """Get summary statistics for a pattern."""
        if pattern_type not in self.detectors:
            return {"error": f"Unknown pattern type: {pattern_type}"}

        adwin = self.detectors[pattern_type]

        if len(adwin.window) < adwin.min_window:
            return {
                "pattern_type": pattern_type,
                "has_data": False,
                "message": f"Need {adwin.min_window - len(adwin.window)} more data points"
            }

        return {
            "pattern_type": pattern_type,
            "has_data": True,
            "mean": round(adwin.mean, 2),
            "std_dev": round(adwin.std_dev, 2),
            "window_size": len(adwin.window),
            "last_drift_point": adwin._last_drift_point,
        }


def time_to_minutes(hour: int, minute: int = 0) -> int:
    """Convert hour:minute to minutes since midnight."""
    return hour * 60 + minute


def minutes_to_time(minutes: int) -> str:
    """Convert minutes since midnight to HH:MM format."""
    hours = minutes // 60
    mins = minutes % 60
    return f"{hours:02d}:{mins:02d}"
