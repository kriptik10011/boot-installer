"""Shared constants for pattern detection modules."""

# EWMA smoothing factor (0-1, higher = more weight on recent data).
# Used by: BehavioralPatternDetector, DomainPatternDetector, PropertyPatternEngine
EWMA_ALPHA = 0.3
