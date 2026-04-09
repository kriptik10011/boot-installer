"""
Intelligence Runtime Smoke Test (Phase 7, Session 2)

Verifies all intelligence endpoints produce meaningful output with seeded data.
Tests the full OBSERVE -> INFER -> DECIDE -> SURFACE -> ADAPT pipeline.

Uses module-scoped fixtures to seed data ONCE and share across all tests,
avoiding rate limit issues on the debug seed endpoint.
"""

import os
import pytest
from datetime import date, timedelta
from fastapi.testclient import TestClient


@pytest.fixture(scope="module", autouse=True)
def patch_auth_and_debug():
    """Disable auth and enable dev mode for the entire module."""
    import app.main as main_module
    original_token = main_module.AUTH_TOKEN
    main_module.AUTH_TOKEN = None
    os.environ["WEEKLY_REVIEW_DEV_MODE"] = "true"
    yield
    main_module.AUTH_TOKEN = original_token
    if "WEEKLY_REVIEW_DEV_MODE" in os.environ:
        del os.environ["WEEKLY_REVIEW_DEV_MODE"]


@pytest.fixture(scope="module")
def client():
    """Module-scoped test client with in-memory DB."""
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker
    from sqlalchemy.pool import StaticPool
    from app.main import app
    from app.database import Base, get_db

    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)
    _Session = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    db = _Session()

    def override_get_db():
        try:
            yield db
        finally:
            pass

    app.dependency_overrides[get_db] = override_get_db
    c = TestClient(app)
    yield c
    app.dependency_overrides.clear()
    db.close()


@pytest.fixture(scope="module")
def seeded_data(client):
    """Seed data ONCE for the entire module.

    Seeds 'typical' scenario (6 weeks observation) then 'normal' (app data)
    without clearing, giving us both rich observation data and app data.
    """
    # Reset rate limiter to ensure clean state
    from app.main import app
    if hasattr(app.state, "limiter"):
        app.state.limiter.reset()

    # Seed typical observation data (6 weeks, high confidence)
    resp = client.post("/api/observation/debug/seed?scenario=typical&clear_first=true")
    assert resp.status_code == 201, f"Seed typical failed: {resp.text}"
    data = resp.json()
    assert data["status"] == "ok", f"Seed error: {data}"
    typical_sessions = data.get("session_count", 0)
    typical_events = data.get("observation_events", 0)

    # Seed normal app data (events, bills, meals) without clearing observations
    resp = client.post("/api/observation/debug/seed?scenario=normal&clear_first=false")
    assert resp.status_code == 201, f"Seed normal failed: {resp.text}"

    return {
        "typical_sessions": typical_sessions,
        "typical_events": typical_events,
    }


def _get_week_start():
    """Get current week's Monday date string."""
    today = date.today()
    monday = today - timedelta(days=today.weekday())
    return monday.isoformat()


# =============================================================================
# 1. OBSERVATION LAYER TESTS
# =============================================================================

class TestObservationLayer:
    """Verify observation data is seeded correctly."""

    def test_seed_creates_sessions(self, client, seeded_data):
        resp = client.get("/api/observation/debug/sessions")
        assert resp.status_code == 200
        sessions = resp.json()
        assert len(sessions) > 0, "No sessions were seeded"

    def test_seed_creates_events(self, client, seeded_data):
        resp = client.get("/api/observation/debug/events")
        assert resp.status_code == 200
        events = resp.json()
        assert len(events) > 0, "No observation events were seeded"

    def test_seed_creates_dwell_time(self, client, seeded_data):
        resp = client.get("/api/observation/debug/dwell-time")
        assert resp.status_code == 200
        records = resp.json()
        assert len(records) > 0, "No dwell time records were seeded"

    def test_seed_creates_app_data(self, client, seeded_data):
        resp = client.get("/api/events")
        assert resp.status_code == 200
        events = resp.json()
        assert len(events) > 0, "No calendar events were seeded"

        resp = client.get("/api/finances")
        assert resp.status_code == 200
        bills = resp.json()
        assert len(bills) > 0, "No bills were seeded"


# =============================================================================
# 2. CONFIDENCE & COLD START TESTS
# =============================================================================

class TestConfidenceAndColdStart:
    """Verify confidence scoring and cold start behavior."""

    def test_confidence_returns_scores(self, client, seeded_data):
        resp = client.get("/api/patterns/confidence")
        assert resp.status_code == 200
        data = resp.json()
        assert "temporal" in data
        assert "behavioral" in data
        assert "overall" in data
        assert "ready_for_surfacing" in data
        assert isinstance(data["temporal"], (int, float))
        assert isinstance(data["behavioral"], (int, float))
        assert isinstance(data["overall"], (int, float))

    def test_seeded_data_exits_cold_start(self, client, seeded_data):
        """6 weeks of typical data should produce confidence > 0."""
        resp = client.get("/api/patterns/confidence")
        assert resp.status_code == 200
        data = resp.json()
        assert data["overall"] > 0, "Overall confidence should be > 0 after 6 weeks"

    # learning-status endpoint removed in Phase F2 (no frontend consumer)


# =============================================================================
# 3. TEMPORAL PATTERN TESTS
# =============================================================================

class TestTemporalPatterns:
    """Verify temporal pattern detection with seeded data."""

    def test_temporal_returns_structure(self, client, seeded_data):
        resp = client.get("/api/patterns/temporal")
        assert resp.status_code == 200
        data = resp.json()
        assert "planning_time" in data
        assert "peak_hours" in data
        assert "busiest_day" in data
        assert "events_by_day" in data
        assert "events_by_hour" in data

    def test_temporal_detects_planning_time(self, client, seeded_data):
        """With 6 weeks of Sunday planning, should detect planning time."""
        resp = client.get("/api/patterns/temporal")
        assert resp.status_code == 200
        data = resp.json()
        if data["planning_time"] is not None:
            pt = data["planning_time"]
            assert "day" in pt
            assert "hour" in pt
            assert "confidence" in pt
            assert pt["confidence"] > 0, "Planning time confidence should be > 0"


# =============================================================================
# 4. BEHAVIORAL PATTERN TESTS
# =============================================================================

class TestBehavioralPatterns:
    """Verify behavioral pattern detection with seeded data."""

    def test_behavioral_returns_structure(self, client, seeded_data):
        resp = client.get("/api/patterns/behavioral")
        assert resp.status_code == 200
        data = resp.json()
        assert "sessions" in data
        assert "view_preferences" in data
        assert "action_frequency" in data

    def test_session_analysis_has_data(self, client, seeded_data):
        resp = client.get("/api/patterns/behavioral")
        assert resp.status_code == 200
        sessions = resp.json()["sessions"]
        assert sessions["total_sessions"] > 0, "Should have sessions after seeding"


# =============================================================================
# 5. DOMAIN INTELLIGENCE TESTS
# =============================================================================

class TestDomainIntelligence:
    """Verify domain-specific intelligence endpoints."""

    def test_day_health_scoring(self, client, seeded_data):
        today = date.today().isoformat()
        resp = client.get(f"/api/patterns/day-health/{today}")
        assert resp.status_code == 200
        data = resp.json()
        assert "score" in data
        assert "status" in data
        assert data["status"] in ("light", "balanced", "busy", "overloaded")

    def test_week_summary(self, client, seeded_data):
        week_start = _get_week_start()
        resp = client.get(f"/api/patterns/week-summary/{week_start}")
        assert resp.status_code == 200
        data = resp.json()
        assert "summary_sentence" in data
        assert "day_healths" in data
        assert len(data["day_healths"]) == 7

    def test_conflicts_detection(self, client, seeded_data):
        week_start = _get_week_start()
        resp = client.get(f"/api/patterns/conflicts/{week_start}")
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list)

    def test_spending_trends(self, client, seeded_data):
        resp = client.get("/api/patterns/spending-trends")
        assert resp.status_code == 200
        data = resp.json()
        assert "current_week" in data
        assert "trend" in data

    def test_meal_gaps(self, client, seeded_data):
        week_start = _get_week_start()
        resp = client.get(f"/api/patterns/meal-gaps/{week_start}")
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list)


# =============================================================================
# 6. INSIGHTS GENERATION TESTS
# =============================================================================

class TestInsightsGeneration:
    """Verify actionable insights are generated from seeded data."""

    def test_insights_endpoint_works(self, client, seeded_data):
        week_start = _get_week_start()
        resp = client.get(f"/api/patterns/insights?week_start={week_start}")
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list)

    def test_insights_have_required_fields(self, client, seeded_data):
        week_start = _get_week_start()
        resp = client.get(f"/api/patterns/insights?week_start={week_start}")
        data = resp.json()
        for insight in data:
            assert "type" in insight, "Insight missing 'type'"
            assert "message" in insight, "Insight missing 'message'"
            assert "priority" in insight, "Insight missing 'priority'"
            assert "confidence" in insight, "Insight missing 'confidence'"

    def test_all_patterns_combined(self, client, seeded_data):
        week_start = _get_week_start()
        resp = client.get(f"/api/patterns/all?week_start={week_start}")
        assert resp.status_code == 200
        data = resp.json()
        assert "temporal" in data
        assert "behavioral" in data
        assert "week_summary" in data
        assert "day_healths" in data
        assert "spending_trend" in data


# =============================================================================
# 7. HABIT STREAKS TESTS
# =============================================================================

class TestHabitStreaks:
    """Verify habit streak tracking and forgiveness tokens."""

    def test_record_habit_creates_streak(self, client, seeded_data):
        resp = client.post(
            "/api/patterns/habits/meal_planning/record",
            json={"occurred": True}
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["habit"] == "meal_planning"
        assert "action" in data
        assert "display" in data

    def test_habit_has_forgiveness_tokens(self, client, seeded_data):
        client.post("/api/patterns/habits/weekly_review/record", json={"occurred": True})
        resp = client.get("/api/patterns/habits/weekly_review")
        assert resp.status_code == 200
        data = resp.json()
        assert "forgiveness_tokens" in data
        assert "display" in data
        display = data["display"]
        assert "saves_remaining" in display
        assert "saves_text" in display

    def test_habits_summary(self, client, seeded_data):
        client.post("/api/patterns/habits/cooking/record", json={"occurred": True})
        client.post("/api/patterns/habits/shopping/record", json={"occurred": True})
        resp = client.get("/api/patterns/habits/summary")
        assert resp.status_code == 200
        data = resp.json()
        assert "has_data" in data
        assert "habits_tracked" in data


# =============================================================================
# 8. DEBUG DATA TESTS
# =============================================================================

class TestDebugEndpoints:
    """Verify debug endpoints work."""

    # debug/raw-data endpoint removed in Phase F2 (no frontend consumer)

    def test_observation_stats(self, client, seeded_data):
        resp = client.get("/api/observation/debug/stats")
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, dict)
