"""
Observation Layer Router

API endpoints for recording and querying observation events.
Includes debug endpoints for viewing collected metrics.
"""

import logging
import os
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import func, desc
from sqlalchemy.orm import Session
from slowapi import Limiter
from slowapi.util import get_remote_address

from app.database import get_db
from app.models.observation import ObservationEvent, DwellTimeRecord, SessionSummary
from app.schemas.observation import (
    ObservationEventCreate,
    ObservationEventResponse,
    DwellTimeResponse,
    SessionResponse,
    DwellTimeUpdate,
    StatusOkResponse,
    ObservationStatsResponse,
    SeedTestDataResponse,
    InsightDismissedRequest,
    InsightActedRequest,
    InsightDismissedResponse,
    InsightActedResponse,
    SuppressedPatternsResponse,
)

logger = logging.getLogger("weekly_review")

limiter = Limiter(key_func=get_remote_address)

router = APIRouter()


# ============== Event Recording ==============

@router.post("/events", response_model=ObservationEventResponse, status_code=status.HTTP_201_CREATED)
@limiter.limit("200/minute")
def record_event(request: Request, event: ObservationEventCreate, db: Session = Depends(get_db)):
    """Record an observation event."""
    # Use UTC for timestamp storage (canonical time)
    utc_now = datetime.now(timezone.utc)

    # Use CLIENT-provided local time if available (preferred)
    # This avoids server timezone issues
    if event.local_hour is not None and event.local_day_of_week is not None:
        hour_of_day = event.local_hour
        day_of_week = event.local_day_of_week  # Already in Sunday=0 convention
    else:
        # Fallback to server local time (may be wrong if server timezone differs)
        local_now = datetime.now()
        hour_of_day = local_now.hour
        # Convert from Python (Monday=0) to JavaScript (Sunday=0) convention
        day_of_week = (local_now.weekday() + 1) % 7

    db_event = ObservationEvent(
        event_type=event.event_type,
        view_name=event.view_name,
        action_name=event.action_name,
        entity_type=event.entity_type,
        entity_id=event.entity_id,
        event_metadata=event.metadata,
        session_id=event.session_id,
        timestamp=utc_now,
        day_of_week=day_of_week,
        hour_of_day=hour_of_day,
    )

    db.add(db_event)

    # Update session summary (pass resolved hour/day values)
    _update_session(db, event.session_id, event, utc_now, hour_of_day, day_of_week)

    db.commit()
    db.refresh(db_event)
    return db_event


@router.post("/dwell-time", response_model=StatusOkResponse, status_code=status.HTTP_200_OK)
@limiter.limit("200/minute")
def update_dwell_time(request: Request, update: DwellTimeUpdate, db: Session = Depends(get_db)):
    """Update dwell time for a view."""
    record = db.query(DwellTimeRecord).filter(
        DwellTimeRecord.session_id == update.session_id,
        DwellTimeRecord.view_name == update.view_name
    ).first()

    if record:
        record.total_seconds += update.seconds
        record.entry_count += 1
    else:
        record = DwellTimeRecord(
            session_id=update.session_id,
            view_name=update.view_name,
            total_seconds=update.seconds,
            entry_count=1
        )
        db.add(record)

    db.commit()
    return {"status": "ok"}


@router.post("/session/end", response_model=StatusOkResponse, status_code=status.HTTP_200_OK)
@limiter.limit("30/minute")
def end_session(request: Request, session_id: str, db: Session = Depends(get_db)):
    """Mark a session as ended and calculate duration."""
    session = db.query(SessionSummary).filter(
        SessionSummary.session_id == session_id
    ).first()

    if session and not session.ended_at:
        now = datetime.now(timezone.utc)
        session.ended_at = now
        # Handle timezone-naive started_at from database
        started_at = session.started_at
        if started_at.tzinfo is None:
            started_at = started_at.replace(tzinfo=timezone.utc)
        session.duration_seconds = (now - started_at).total_seconds()

        # Infer if planning session (duration > 5 min and multiple views)
        session.is_planning_session = (
            session.duration_seconds > 300 and
            len(session.views_visited) >= 2
        )

        db.commit()

    return {"status": "ok"}


# ============== Debug/Metrics Endpoints ==============


def _require_debug_mode():
    """Raise 403 if debug endpoints are disabled (production safety)."""
    if os.environ.get("WEEKLY_REVIEW_DEV_MODE") != "true":
        raise HTTPException(status_code=403, detail="Debug endpoints disabled in production")


@router.get("/debug/events", response_model=List[ObservationEventResponse])
@limiter.limit("100/minute")
def get_recent_events(
    request: Request,
    limit: int = Query(default=100, ge=1, le=1000),
    session_id: Optional[str] = None,
    event_type: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """Get recent observation events for debugging."""
    _require_debug_mode()
    query = db.query(ObservationEvent)

    if session_id:
        query = query.filter(ObservationEvent.session_id == session_id)
    if event_type:
        query = query.filter(ObservationEvent.event_type == event_type)

    return query.order_by(desc(ObservationEvent.timestamp)).limit(limit).all()


@router.get("/debug/sessions", response_model=List[SessionResponse])
@limiter.limit("100/minute")
def get_recent_sessions(
    request: Request,
    limit: int = Query(default=20, ge=1, le=1000),
    db: Session = Depends(get_db)
):
    """Get recent session summaries for debugging."""
    _require_debug_mode()
    return db.query(SessionSummary).order_by(
        desc(SessionSummary.started_at)
    ).limit(limit).all()


@router.get("/debug/dwell-time", response_model=List[DwellTimeResponse])
@limiter.limit("100/minute")
def get_dwell_times(
    request: Request,
    session_id: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """Get dwell time records for debugging."""
    _require_debug_mode()
    query = db.query(DwellTimeRecord)

    if session_id:
        query = query.filter(DwellTimeRecord.session_id == session_id)

    return query.order_by(desc(DwellTimeRecord.updated_at)).limit(100).all()


@router.get("/debug/stats", response_model=ObservationStatsResponse)
@limiter.limit("100/minute")
def get_observation_stats(request: Request, db: Session = Depends(get_db)):
    """Get aggregate observation statistics for debugging."""
    _require_debug_mode()

    # Total counts
    total_events = db.query(func.count(ObservationEvent.id)).scalar() or 0
    total_sessions = db.query(func.count(SessionSummary.id)).scalar() or 0

    # Events by type
    events_by_type = db.query(
        ObservationEvent.event_type,
        func.count(ObservationEvent.id)
    ).group_by(ObservationEvent.event_type).limit(100).all()

    # Events by day of week
    events_by_day = db.query(
        ObservationEvent.day_of_week,
        func.count(ObservationEvent.id)
    ).group_by(ObservationEvent.day_of_week).order_by(
        ObservationEvent.day_of_week
    ).limit(100).all()

    # Events by hour
    events_by_hour = db.query(
        ObservationEvent.hour_of_day,
        func.count(ObservationEvent.id)
    ).group_by(ObservationEvent.hour_of_day).order_by(
        ObservationEvent.hour_of_day
    ).limit(100).all()

    # View popularity (dwell time)
    view_dwell = db.query(
        DwellTimeRecord.view_name,
        func.sum(DwellTimeRecord.total_seconds).label("total_seconds"),
        func.sum(DwellTimeRecord.entry_count).label("total_entries")
    ).group_by(DwellTimeRecord.view_name).limit(100).all()

    # Average session duration
    avg_duration = db.query(
        func.avg(SessionSummary.duration_seconds)
    ).filter(SessionSummary.duration_seconds != None).scalar()

    # Planning vs Living sessions
    planning_count = db.query(func.count(SessionSummary.id)).filter(
        SessionSummary.is_planning_session == True
    ).scalar() or 0
    living_count = db.query(func.count(SessionSummary.id)).filter(
        SessionSummary.is_planning_session == False
    ).scalar() or 0

    return {
        "total_events": total_events,
        "total_sessions": total_sessions,
        "events_by_type": {t: c for t, c in events_by_type},
        "events_by_day": {d: c for d, c in events_by_day},
        "events_by_hour": {h: c for h, c in events_by_hour},
        "view_popularity": [
            {"view": v, "seconds": s or 0, "entries": e or 0}
            for v, s, e in view_dwell
        ],
        "average_session_duration_seconds": avg_duration,
        "planning_sessions": planning_count,
        "living_sessions": living_count,
    }


@router.delete("/debug/clear", response_model=None, status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit("10/minute")
def clear_observation_data(request: Request, db: Session = Depends(get_db)):
    """Clear all observation data. For debugging/testing only."""
    _require_debug_mode()
    db.query(ObservationEvent).delete()
    db.query(DwellTimeRecord).delete()
    db.query(SessionSummary).delete()
    db.commit()
    return None


@router.post("/debug/seed", response_model=SeedTestDataResponse, status_code=status.HTTP_201_CREATED)
@limiter.limit("5/minute")
def seed_test_data(
    request: Request,
    scenario: str = "typical",
    clear_first: bool = True,
    db: Session = Depends(get_db)
):
    """
    Seed test data for debugging the intelligence system.

    Clears ALL existing data (events, bills, meals, observations) before seeding.

    Intelligence Layer Scenarios (observation patterns):
    - typical: 6 weeks of normal usage with Sunday planning sessions
    - consistent: 6 weeks with very consistent patterns (high confidence)
    - irregular: 1 week with random times (low confidence)

    Week Stress Test Scenarios (app data volume):
    - light: Calm week - 3 events, 1 bill, 50% meals
    - normal: Typical week - 10 events, 3 bills, 70% meals, 1 conflict
    - heavy: Stressful week - 25 events, 6 bills (2 overdue), 30% meals, conflicts
    """
    _require_debug_mode()

    import sys

    logger.info("Seed request received: scenario='%s', clear_first=%s", scenario, clear_first)

    # Normalize scenario input (strip whitespace, lowercase)
    scenario = scenario.strip().lower()
    logger.info("Normalized scenario: '%s'", scenario)

    # Validate scenario before importing
    valid_scenarios = ['typical', 'consistent', 'irregular', 'light', 'normal', 'heavy']
    if scenario not in valid_scenarios:
        logger.error("Invalid scenario: '%s'. Valid: %s", scenario, valid_scenarios)
        return {"status": "error", "message": f"Unknown scenario: '{scenario}'. Valid scenarios: {valid_scenarios}"}

    # Add backend directory to path for scripts import
    backend_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    if backend_dir not in sys.path:
        sys.path.insert(0, backend_dir)

    try:
        # Force fresh import by removing from cache first
        if 'scripts.seed_test_data' in sys.modules:
            del sys.modules['scripts.seed_test_data']
        if 'scripts' in sys.modules:
            del sys.modules['scripts']

        from scripts.seed_test_data import (
            generate_typical_scenario,
            generate_consistent_scenario,
            generate_irregular_scenario,
            generate_light_week,
            generate_normal_week,
            generate_heavy_week,
            clear_all_data,
        )
        logger.info("Successfully imported seed functions")
    except ImportError as e:
        logger.error("Import error: %s", e, exc_info=True)
        return {"status": "error", "message": "Failed to load seed data module"}

    try:
        if clear_first:
            logger.info("Clearing all data first")
            clear_all_data(db)

        logger.info("Generating scenario: %s", scenario)

        # Intelligence layer scenarios (observation patterns)
        if scenario == "typical":
            generate_typical_scenario(db, weeks=6)
        elif scenario == "consistent":
            generate_consistent_scenario(db)
        elif scenario == "irregular":
            generate_irregular_scenario(db)
        # Week stress test scenarios (app data volume)
        elif scenario == "light":
            generate_light_week(db)
        elif scenario == "normal":
            generate_normal_week(db)
        elif scenario == "heavy":
            generate_heavy_week(db)

        logger.info("Successfully generated scenario: %s", scenario)

        # Get counts for response
        session_count = db.query(func.count(SessionSummary.id)).scalar() or 0
        event_count = db.query(func.count(ObservationEvent.id)).scalar() or 0

        return {
            "status": "ok",
            "scenario": scenario,
            "session_count": session_count,
            "observation_events": event_count,
            "exits_cold_start": session_count >= 10,
        }
    except Exception as e:
        logger.error("Seed error: %s", e, exc_info=True)
        return {"status": "error", "message": "Failed to generate seed data"}


# ============== Helper Functions ==============

def _update_session(db: Session, session_id: str, event: ObservationEventCreate, utc_now: datetime, hour_of_day: int, day_of_week: int):
    """Update or create session summary."""
    session = db.query(SessionSummary).filter(
        SessionSummary.session_id == session_id
    ).first()

    if not session:
        session = SessionSummary(
            session_id=session_id,
            started_at=utc_now,  # Store UTC for timestamp
            day_of_week=day_of_week,  # Already resolved (Sunday=0, client local time)
            hour_started=hour_of_day,  # Already resolved (client local hour)
            views_visited=[],
            actions_taken=[],
        )
        db.add(session)

    # Track unique views
    if event.view_name and event.view_name not in session.views_visited:
        session.views_visited = session.views_visited + [event.view_name]

    # Track actions
    if event.action_name and event.action_name not in session.actions_taken:
        session.actions_taken = session.actions_taken + [event.action_name]


# =============================================================================
# INSIGHT LEARNING ENDPOINTS (Session 6)
# =============================================================================

@router.post("/insight-dismissed", response_model=InsightDismissedResponse)
@limiter.limit("60/minute")
def log_insight_dismissed(
    request: Request,
    body: InsightDismissedRequest,
    db: Session = Depends(get_db),
):
    """Record an insight dismissal. 3+ dismissals triggers suppression."""
    from app.services.observation_learning import learn_from_dismissed
    count = learn_from_dismissed(db, body.insight_type, body.context)
    suppressed = count >= 3
    return {"count": count, "suppressed": suppressed}


@router.post("/insight-acted", response_model=InsightActedResponse)
@limiter.limit("60/minute")
def log_insight_acted(
    request: Request,
    body: InsightActedRequest,
    db: Session = Depends(get_db),
):
    """Record an action taken on an insight."""
    from app.services.observation_learning import learn_from_acted
    boost = learn_from_acted(db, body.insight_type, body.action, body.outcome)
    return {"confidence_boost": boost}


@router.get("/suppressed-patterns", response_model=SuppressedPatternsResponse)
@limiter.limit("30/minute")
def get_suppressed(
    request: Request,
    db: Session = Depends(get_db),
):
    """Get all insight types that have been suppressed by user dismissals."""
    from app.services.observation_learning import get_suppressed_patterns
    return {"suppressed": get_suppressed_patterns(db)}
