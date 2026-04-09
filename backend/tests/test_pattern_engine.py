"""
Pattern Engine Tests

Tests the backend intelligence pipeline:
- Confidence calculation
- Insight generation
- Day health calculation
- Pattern detection
"""

import pytest
from datetime import date, timedelta, datetime
import uuid

from app.services.pattern_detection import PatternEngine
from app.models import Event, FinancialItem
from app.models.observation import ObservationEvent, SessionSummary, DwellTimeRecord
from app.models.financial import FinancialItemType


# =============================================================================
# HELPER FUNCTIONS
# =============================================================================

def generate_session_id() -> str:
    """Generate a unique session ID."""
    return str(uuid.uuid4())[:12]


def create_planning_session(db, session_start: datetime, duration_seconds: int = 1200):
    """Create a planning session with observation data."""
    session_id = generate_session_id()
    js_weekday = (session_start.weekday() + 1) % 7  # Sunday=0

    # Create session summary
    session = SessionSummary(
        session_id=session_id,
        started_at=session_start,
        ended_at=session_start + timedelta(seconds=duration_seconds),
        duration_seconds=duration_seconds,
        day_of_week=js_weekday,
        hour_started=session_start.hour,
        views_visited=['week', 'events', 'finances', 'meals'],
        actions_taken=['create_event', 'plan_meal'],
        is_planning_session=True,
    )
    db.add(session)

    # Create observation events
    for event_type in ['app_open', 'view_enter', 'view_exit', 'app_close']:
        event = ObservationEvent(
            event_type=event_type,
            view_name='week' if event_type in ['view_enter', 'view_exit'] else None,
            session_id=session_id,
            timestamp=session_start,
            day_of_week=js_weekday,
            hour_of_day=session_start.hour,
        )
        db.add(event)

    # Create dwell time
    dwell = DwellTimeRecord(
        session_id=session_id,
        view_name='week',
        total_seconds=duration_seconds // 2,
        entry_count=1,
    )
    db.add(dwell)

    db.commit()
    return session_id


def create_living_session(db, session_start: datetime, duration_seconds: int = 180):
    """Create a quick living session."""
    session_id = generate_session_id()
    js_weekday = (session_start.weekday() + 1) % 7

    session = SessionSummary(
        session_id=session_id,
        started_at=session_start,
        ended_at=session_start + timedelta(seconds=duration_seconds),
        duration_seconds=duration_seconds,
        day_of_week=js_weekday,
        hour_started=session_start.hour,
        views_visited=['week'],
        actions_taken=[],
        is_planning_session=False,
    )
    db.add(session)

    event = ObservationEvent(
        event_type='app_open',
        session_id=session_id,
        timestamp=session_start,
        day_of_week=js_weekday,
        hour_of_day=session_start.hour,
    )
    db.add(event)

    db.commit()
    return session_id


# =============================================================================
# 1. CONFIDENCE CALCULATION TESTS
# =============================================================================

class TestConfidenceCalculation:
    """Tests for confidence scoring."""

    def test_confidence_starts_low_with_no_data(self, test_db):
        """With no observation data, confidence should be low but Cold Start enables surfacing."""
        engine = PatternEngine(test_db)
        confidence = engine.calculate_overall_confidence()

        assert confidence['overall'] < 0.5
        # Cold Start feature provides template-based insights from day 1
        assert confidence['ready_for_surfacing'] is True

    def test_confidence_increases_with_more_data(self, test_db):
        """More sessions should increase confidence."""
        engine = PatternEngine(test_db)

        # Get baseline confidence
        initial = engine.calculate_overall_confidence()

        # Add 1 week of data
        now = datetime.now()
        for day_offset in range(7):
            session_time = now - timedelta(days=day_offset)
            # Sunday planning session
            if (session_time.weekday() + 1) % 7 == 0:
                session_time = session_time.replace(hour=19, minute=0)
                create_planning_session(test_db, session_time, 1200)
            else:
                session_time = session_time.replace(hour=8, minute=0)
                create_living_session(test_db, session_time, 180)

        # Check confidence increased
        after_week = engine.calculate_overall_confidence()
        assert after_week['overall'] > initial['overall']

        # Add 2 more weeks
        for week in range(2):
            for day_offset in range(7):
                session_time = now - timedelta(weeks=week + 1, days=day_offset)
                if (session_time.weekday() + 1) % 7 == 0:
                    session_time = session_time.replace(hour=19, minute=0)
                    create_planning_session(test_db, session_time, 1200)
                else:
                    session_time = session_time.replace(hour=8, minute=0)
                    create_living_session(test_db, session_time, 180)

        # Confidence should be even higher
        final = engine.calculate_overall_confidence()
        assert final['overall'] >= after_week['overall']

    def test_ready_for_surfacing_threshold(self, test_db):
        """ready_for_surfacing should be True when overall >= 0.5."""
        engine = PatternEngine(test_db)

        # Add enough data to exceed threshold
        now = datetime.now()
        for week in range(3):
            for day_offset in range(7):
                session_time = now - timedelta(weeks=week, days=day_offset)
                if (session_time.weekday() + 1) % 7 == 0:
                    session_time = session_time.replace(hour=19, minute=0)
                    create_planning_session(test_db, session_time, 1200)
                else:
                    session_time = session_time.replace(hour=18, minute=0)
                    create_living_session(test_db, session_time, 300)

        confidence = engine.calculate_overall_confidence()

        # With 3 weeks of consistent data, should be ready
        assert confidence['ready_for_surfacing'] is True
        assert confidence['overall'] >= 0.5


# =============================================================================
# 2. INSIGHT GENERATION TESTS
# =============================================================================

class TestInsightGeneration:
    """Tests for actionable insight generation."""

    def test_insights_generated_for_seeded_data(self, test_db):
        """Consistent scenario should generate insights."""
        engine = PatternEngine(test_db)

        # Add consistent data (Sunday 7pm planning) for 6 weeks
        # Need at least 5 planning sessions for MIN_SESSIONS_FOR_CONFIDENCE
        now = datetime.now()
        for week in range(6):
            for day_offset in range(7):
                session_time = now - timedelta(weeks=week, days=day_offset)
                if (session_time.weekday() + 1) % 7 == 0:  # Sunday
                    session_time = session_time.replace(hour=19, minute=0)
                    create_planning_session(test_db, session_time, 1200)
                else:
                    session_time = session_time.replace(hour=8, minute=0)
                    create_living_session(test_db, session_time, 180)

        # Add some events and bills for domain insights
        today = date.today()
        for i in range(5):
            event = Event(
                name=f"Event {i}",
                date=today + timedelta(days=i % 7),
                start_time="09:00",
                end_time="10:00",
            )
            test_db.add(event)

        bill = FinancialItem(
            name="Test Bill",
            amount=100.0,
            type=FinancialItemType.BILL,
            due_date=today + timedelta(days=3),
            is_paid=False,
        )
        test_db.add(bill)
        test_db.commit()

        # Check confidence is sufficient
        confidence = engine.calculate_overall_confidence()
        assert confidence['ready_for_surfacing'], f"Confidence too low: {confidence}"

        # Get insights
        insights = engine.get_actionable_insights()

        # Should have at least some insights (not just "insufficient_data")
        assert len(insights) > 0
        assert insights[0]['type'] != 'insufficient_data', f"Got insufficient_data: {insights}"

        # Each insight should have required fields
        for insight in insights:
            assert 'type' in insight
            assert 'message' in insight
            assert 'priority' in insight
            assert 'confidence' in insight
            assert isinstance(insight['priority'], int)
            assert 0 <= insight['confidence'] <= 1

    def test_insufficient_data_returns_learning_message(self, test_db):
        """With no data, should return Cold Start template + learning progress insights."""
        engine = PatternEngine(test_db)

        insights = engine.get_actionable_insights()

        # Cold Start provides template insights + learning progress
        assert len(insights) >= 1
        # Should have at least one learning-related message
        learning_insights = [i for i in insights if 'learning' in i.get('message', '').lower() or i.get('is_template', False)]
        assert len(learning_insights) >= 1

    def test_week_summary_sentence_generated(self, test_db):
        """Week summary should include a summary_sentence field."""
        engine = PatternEngine(test_db)
        today = date.today()

        # Add some data for summary context
        for i in range(3):
            event = Event(
                name=f"Event {i}",
                date=today + timedelta(days=i),
                start_time="09:00",
                end_time="10:00",
            )
            test_db.add(event)
        test_db.commit()

        week_start = today - timedelta(days=(today.weekday() + 1) % 7)
        summary = engine.get_week_summary(week_start.isoformat())

        assert 'summary_sentence' in summary
        assert isinstance(summary['summary_sentence'], str)
        assert len(summary['summary_sentence']) > 0

    def test_week_summary_includes_seven_day_healths(self, test_db):
        """Week summary day_healths should contain exactly 7 entries."""
        engine = PatternEngine(test_db)
        today = date.today()

        week_start = today - timedelta(days=(today.weekday() + 1) % 7)
        summary = engine.get_week_summary(week_start.isoformat())

        assert 'day_healths' in summary
        assert len(summary['day_healths']) == 7

        # Each day health should have required fields
        for day_health in summary['day_healths']:
            assert 'date' in day_health
            assert 'score' in day_health
            assert 'status' in day_health


# =============================================================================
# 3. DAY HEALTH CALCULATION TESTS
# =============================================================================

class TestDayHealth:
    """Tests for day health scoring."""

    def test_day_health_penalizes_conflicts(self, test_db):
        """Events with time overlap should reduce health score."""
        engine = PatternEngine(test_db)
        today = date.today()
        today_str = today.isoformat()

        # Create two overlapping events
        event1 = Event(
            name="Meeting A",
            date=today,
            start_time="09:00",
            end_time="10:30",  # Ends after next event starts
        )
        event2 = Event(
            name="Meeting B",
            date=today,
            start_time="10:00",  # Overlaps with event1
            end_time="11:00",
        )
        test_db.add(event1)
        test_db.add(event2)
        test_db.commit()

        health = engine.get_day_health(today_str)

        # Should have conflicts
        assert health['has_conflicts'] is True
        assert health['conflict_count'] >= 1
        # Score should be reduced (less than perfect 100)
        assert health['score'] < 100

    def test_day_health_penalizes_overdue_bills(self, test_db):
        """Overdue bills reduce health score."""
        engine = PatternEngine(test_db)
        today = date.today()
        today_str = today.isoformat()

        # Create an overdue bill (due yesterday)
        bill = FinancialItem(
            name="Overdue Bill",
            amount=200.0,
            type=FinancialItemType.BILL,
            due_date=today - timedelta(days=1),
            is_paid=False,
        )
        test_db.add(bill)
        test_db.commit()

        health = engine.get_day_health(today_str)

        # Should count the overdue bill
        assert health['overdue_bills'] >= 1
        # Score should be reduced
        assert health['score'] < 100

    def test_day_health_status_mapping(self, test_db):
        """Health score should map to correct status."""
        engine = PatternEngine(test_db)
        today = date.today()
        today_str = today.isoformat()

        # Clean day should be "light" or "balanced"
        health = engine.get_day_health(today_str)
        assert health['status'] in ['light', 'balanced', 'busy', 'overloaded']

        # Score 80-100 = light
        # Score 60-79 = balanced
        # Score 40-59 = busy
        # Score 0-39 = overloaded
        if health['score'] >= 80:
            assert health['status'] == 'light'
        elif health['score'] >= 60:
            assert health['status'] == 'balanced'
        elif health['score'] >= 40:
            assert health['status'] == 'busy'
        else:
            assert health['status'] == 'overloaded'

    def test_many_events_reduce_health(self, test_db):
        """Days with many events should have lower health."""
        engine = PatternEngine(test_db)
        today = date.today()
        today_str = today.isoformat()

        # Create 6 events (should trigger busy/overloaded)
        for i in range(6):
            hour = 8 + i * 2
            event = Event(
                name=f"Event {i}",
                date=today,
                start_time=f"{hour:02d}:00",
                end_time=f"{hour + 1:02d}:00",
            )
            test_db.add(event)
        test_db.commit()

        health = engine.get_day_health(today_str)

        assert health['event_count'] == 6
        # Should be busy or overloaded
        assert health['status'] in ['busy', 'overloaded']


# =============================================================================
# 4. PATTERN DETECTION TESTS
# =============================================================================

class TestPatternDetection:
    """Tests for pattern detection."""

    def test_planning_time_detected_from_consistent_data(self, test_db):
        """Consistent Sunday evening sessions should detect planning time."""
        engine = PatternEngine(test_db)

        # Create consistent Sunday 7pm planning sessions for 6 weeks
        # (need at least 5 for MIN_SESSIONS_FOR_CONFIDENCE threshold)
        now = datetime.now()
        for week in range(6):
            # Find the Sunday of this week
            days_until_sunday = (6 - now.weekday()) % 7
            sunday = now - timedelta(weeks=week) + timedelta(days=days_until_sunday - 7)
            sunday = sunday.replace(hour=19, minute=0, second=0, microsecond=0)

            create_planning_session(test_db, sunday, 1200)

        # Get temporal patterns
        patterns = engine.get_temporal_patterns()

        # Should detect planning time
        assert patterns.get('planning_time') is not None

        pt = patterns['planning_time']
        assert pt['day'] == 0  # Sunday (JS convention)
        assert 18 <= pt['hour'] <= 20  # Around 7pm
        # Shrinkage formula limits early confidence; 0.2 threshold is reasonable for 4 weeks data
        assert pt['confidence'] > 0.2

    def test_peak_hours_detected(self, test_db):
        """Sessions at consistent hours should detect peak hours."""
        engine = PatternEngine(test_db)

        now = datetime.now()
        # Create sessions at 8am and 6pm consistently
        for week in range(3):
            for day in range(5):  # Weekdays
                morning = now - timedelta(weeks=week, days=day)
                morning = morning.replace(hour=8, minute=0)
                create_living_session(test_db, morning, 180)

                evening = now - timedelta(weeks=week, days=day)
                evening = evening.replace(hour=18, minute=0)
                create_living_session(test_db, evening, 300)

        patterns = engine.get_temporal_patterns()

        # Should have peak hours detected
        assert len(patterns.get('peak_hours', [])) > 0
        # 8am and/or 6pm should be in peak hours
        peak_hours = patterns['peak_hours']
        assert 8 in peak_hours or 18 in peak_hours

    def test_view_preferences_tracked(self, test_db):
        """Dwell time on views should create view preferences."""
        engine = PatternEngine(test_db)

        now = datetime.now()
        # Create sessions with dwell time on specific views
        for i in range(10):
            session_id = generate_session_id()
            session_time = now - timedelta(days=i)

            session = SessionSummary(
                session_id=session_id,
                started_at=session_time,
                ended_at=session_time + timedelta(minutes=10),
                duration_seconds=600,
                day_of_week=(session_time.weekday() + 1) % 7,
                hour_started=session_time.hour,
                views_visited=['week', 'events'],
                actions_taken=[],
                is_planning_session=False,
            )
            test_db.add(session)

            # Add dwell time - more on 'week' than 'events'
            dwell_week = DwellTimeRecord(
                session_id=session_id,
                view_name='week',
                total_seconds=400,
                entry_count=1,
            )
            dwell_events = DwellTimeRecord(
                session_id=session_id,
                view_name='events',
                total_seconds=100,
                entry_count=1,
            )
            test_db.add(dwell_week)
            test_db.add(dwell_events)

        test_db.commit()

        patterns = engine.get_behavioral_patterns()

        # Should have view preferences
        prefs = patterns.get('view_preferences', [])
        assert len(prefs) > 0

        # 'week' should have more time than 'events'
        week_pref = next((p for p in prefs if p['view'] == 'week'), None)
        events_pref = next((p for p in prefs if p['view'] == 'events'), None)

        if week_pref and events_pref:
            assert week_pref['total_seconds'] > events_pref['total_seconds']


# =============================================================================
# 6. INSIGHT EVIDENCE (Phase 4B-5)
# =============================================================================

class TestInsightEvidence:
    """Tests for Phase 4B-5: Evidence fields on all insights."""

    def test_all_insights_have_evidence(self, test_db):
        """Every insight from get_actionable_insights() must include an evidence dict."""
        engine = PatternEngine(test_db)

        # Seed enough data to trigger multiple insight types
        now = datetime.now()
        for week in range(6):
            for day_offset in range(7):
                session_time = now - timedelta(weeks=week, days=day_offset)
                if (session_time.weekday() + 1) % 7 == 0:  # Sunday
                    session_time = session_time.replace(hour=19, minute=0)
                    create_planning_session(test_db, session_time, 1200)
                else:
                    session_time = session_time.replace(hour=8, minute=0)
                    create_living_session(test_db, session_time, 180)

        today = date.today()
        for i in range(5):
            event = Event(
                name=f"Event {i}",
                date=today + timedelta(days=i % 7),
                start_time="09:00",
                end_time="10:00",
            )
            test_db.add(event)

        bill = FinancialItem(
            name="Test Bill",
            amount=100.0,
            type=FinancialItemType.BILL,
            due_date=today + timedelta(days=3),
            is_paid=False,
        )
        test_db.add(bill)
        test_db.commit()

        insights = engine.get_actionable_insights()
        assert len(insights) > 0

        for insight in insights:
            assert 'evidence' in insight, (
                f"Insight type '{insight['type']}' missing 'evidence' field"
            )
            evidence = insight['evidence']
            assert isinstance(evidence, dict), (
                f"Insight type '{insight['type']}' evidence is not a dict"
            )

    def test_evidence_has_valid_fields(self, test_db):
        """Evidence dicts should only contain valid field names with correct types."""
        engine = PatternEngine(test_db)
        today = date.today()

        # Calculate current week start (Sunday) so the bill always falls within it
        days_since_sunday = (today.weekday() + 1) % 7
        week_start = today - timedelta(days=days_since_sunday)

        # Add a bill due on Wednesday of the current week (always within range)
        bill = FinancialItem(
            name="Rent",
            amount=1500.0,
            type=FinancialItemType.BILL,
            due_date=week_start + timedelta(days=3),
            is_paid=False,
        )
        test_db.add(bill)
        test_db.commit()

        insights = engine.get_actionable_insights()
        bills_insight = next(
            (i for i in insights if i['type'] == 'bills_due'), None
        )
        assert bills_insight is not None

        evidence = bills_insight['evidence']
        valid_keys = {'observation_count', 'pattern_strength', 'last_observed', 'context'}
        assert set(evidence.keys()).issubset(valid_keys), (
            f"Evidence has unexpected keys: {set(evidence.keys()) - valid_keys}"
        )

        # Type checks
        if 'observation_count' in evidence:
            assert isinstance(evidence['observation_count'], int)
        if 'pattern_strength' in evidence:
            assert isinstance(evidence['pattern_strength'], (int, float))
            assert 0 <= evidence['pattern_strength'] <= 1.0
        if 'last_observed' in evidence:
            assert isinstance(evidence['last_observed'], str)
        if 'context' in evidence:
            assert isinstance(evidence['context'], str)
            assert len(evidence['context']) > 0

    def test_cold_start_template_has_evidence(self, test_db):
        """Cold start template insights should include evidence explaining the template source."""
        engine = PatternEngine(test_db)

        insights = engine.get_actionable_insights()
        template_insights = [i for i in insights if i.get('is_template', False)]

        # Cold start should produce at least one template insight
        assert len(template_insights) >= 1, "No template insights generated during cold start"

        for insight in template_insights:
            assert 'evidence' in insight, (
                f"Template insight '{insight['type']}' missing evidence"
            )
            evidence = insight['evidence']
            # Templates should have context explaining it's not personalized yet
            if 'context' in evidence:
                assert len(evidence['context']) > 0

    def test_deterministic_insights_have_full_evidence(self, test_db):
        """Deterministic insights (bills, conflicts) should have all 4 evidence fields."""
        engine = PatternEngine(test_db)
        today = date.today()

        bill = FinancialItem(
            name="Electric",
            amount=142.0,
            type=FinancialItemType.BILL,
            due_date=today + timedelta(days=1),
            is_paid=False,
        )
        test_db.add(bill)
        test_db.commit()

        insights = engine.get_actionable_insights()
        bills_insight = next(
            (i for i in insights if i['type'] == 'bills_due'), None
        )
        assert bills_insight is not None

        evidence = bills_insight['evidence']
        assert 'observation_count' in evidence
        assert 'pattern_strength' in evidence
        assert 'last_observed' in evidence
        assert 'context' in evidence
        assert evidence['pattern_strength'] == 1.0  # Bills are deterministic

    def test_evidence_context_is_human_readable(self, test_db):
        """Evidence context strings should be human-readable, not technical jargon."""
        engine = PatternEngine(test_db)
        today = date.today()

        bill = FinancialItem(
            name="Water",
            amount=50.0,
            type=FinancialItemType.BILL,
            due_date=today + timedelta(days=5),
            is_paid=False,
        )
        test_db.add(bill)
        test_db.commit()

        insights = engine.get_actionable_insights()

        for insight in insights:
            evidence = insight.get('evidence', {})
            context = evidence.get('context', '')
            if context:
                # Should not contain code-like patterns
                assert 'SELECT' not in context.upper()
                assert 'query' not in context.lower()
                assert '__' not in context  # No dunder patterns
                # Should be a real sentence (starts with uppercase or number)
                assert context[0].isupper() or context[0].isdigit(), (
                    f"Context '{context}' doesn't start with uppercase or number"
                )
