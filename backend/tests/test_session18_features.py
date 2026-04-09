"""
V2 Session 18 Tests: Calendar Import (.ics)

Tests cover:
- ICS parsing (various formats)
- Event import (with duplicate detection)
- Preview mode
- Error handling (invalid format, empty content)
"""

import pytest
from datetime import date
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session
from sqlalchemy.pool import StaticPool

from app.main import app
from app.database import Base, get_db
from app.models.event import Event, EventCategory
from app.services.calendar_import import parse_ics_content, import_ics_events


SAMPLE_ICS = """BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Test//Test//EN
BEGIN:VEVENT
SUMMARY:Team Standup
DTSTART:20260216T090000Z
DTEND:20260216T091500Z
DESCRIPTION:Daily standup meeting
LOCATION:Conference Room A
END:VEVENT
BEGIN:VEVENT
SUMMARY:Dentist Appointment
DTSTART;VALUE=DATE:20260218
DESCRIPTION:Annual checkup
END:VEVENT
BEGIN:VEVENT
SUMMARY:Project Deadline
DTSTART:20260220T170000Z
END:VEVENT
END:VCALENDAR"""


SAMPLE_ICS_WITH_ESCAPES = """BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
SUMMARY:John\\, Mary\\, and Bob's Meeting
DTSTART:20260301T140000Z
DESCRIPTION:Discuss Q1 results\\nReview budget\\nPlan Q2
END:VEVENT
END:VCALENDAR"""


SAMPLE_ICS_FOLDED = """BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
SUMMARY:Very Long Meeting Title That Gets
 Folded Across Multiple Lines
DTSTART:20260305T100000Z
END:VEVENT
END:VCALENDAR"""


@pytest.fixture(autouse=True)
def db():
    """Create a fresh in-memory database for each test."""
    _engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=_engine)
    _SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=_engine)
    session = _SessionLocal()
    yield session
    session.close()
    Base.metadata.drop_all(bind=_engine)


@pytest.fixture
def client(db):
    """Test client with DB override."""
    def override_get_db():
        try:
            yield db
        finally:
            pass
    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


class TestIcsParsing:
    """Tests for .ics content parsing."""

    def test_parse_basic_events(self, db):
        events = parse_ics_content(SAMPLE_ICS)
        assert len(events) == 3

    def test_parse_datetime_event(self, db):
        events = parse_ics_content(SAMPLE_ICS)
        standup = next(e for e in events if e['title'] == 'Team Standup')
        assert standup['date'] == date(2026, 2, 16)
        assert standup['start_time'] == '09:00'
        assert standup['end_time'] == '09:15'
        assert 'standup meeting' in standup['notes']
        assert standup['location'] == 'Conference Room A'

    def test_parse_date_only_event(self, db):
        events = parse_ics_content(SAMPLE_ICS)
        dentist = next(e for e in events if e['title'] == 'Dentist Appointment')
        assert dentist['date'] == date(2026, 2, 18)
        assert dentist.get('start_time') is None

    def test_parse_escaped_text(self, db):
        events = parse_ics_content(SAMPLE_ICS_WITH_ESCAPES)
        assert len(events) == 1
        assert "John, Mary, and Bob's Meeting" == events[0]['title']
        assert '\n' in events[0]['notes']

    def test_parse_folded_lines(self, db):
        events = parse_ics_content(SAMPLE_ICS_FOLDED)
        assert len(events) == 1
        # RFC 5545: CRLF+SPACE is removed entirely, so "Gets" + "Folded" join without extra space
        assert 'Very Long Meeting Title That GetsFolded Across Multiple Lines' == events[0]['title']

    def test_parse_empty_content(self, db):
        events = parse_ics_content("")
        assert events == []

    def test_parse_no_events(self, db):
        events = parse_ics_content("BEGIN:VCALENDAR\nVERSION:2.0\nEND:VCALENDAR")
        assert events == []


class TestIcsImport:
    """Tests for importing .ics events into database."""

    def test_import_creates_events(self, db):
        result = import_ics_events(db, SAMPLE_ICS)
        assert result['imported'] == 3
        assert result['skipped'] == 0
        assert result['errors'] == 0

        # Verify in DB
        events = db.query(Event).all()
        assert len(events) == 3

    def test_import_skip_duplicates(self, db):
        # First import
        import_ics_events(db, SAMPLE_ICS)
        # Second import — should skip all
        result = import_ics_events(db, SAMPLE_ICS, skip_duplicates=True)
        assert result['imported'] == 0
        assert result['skipped'] == 3

    def test_import_allow_duplicates(self, db):
        import_ics_events(db, SAMPLE_ICS)
        result = import_ics_events(db, SAMPLE_ICS, skip_duplicates=False)
        assert result['imported'] == 3
        assert result['skipped'] == 0

    def test_import_with_category(self, db):
        cat = EventCategory(name="Imported")
        db.add(cat)
        db.commit()
        db.refresh(cat)

        result = import_ics_events(db, SAMPLE_ICS, category_id=cat.id)
        assert result['imported'] == 3

        events = db.query(Event).all()
        assert all(e.category_id == cat.id for e in events)

    def test_import_notes_include_location(self, db):
        import_ics_events(db, SAMPLE_ICS)
        standup = db.query(Event).filter(Event.name == 'Team Standup').first()
        assert standup is not None
        assert 'Daily standup meeting' in standup.description
        assert 'Location: Conference Room A' in standup.description


class TestCalendarApiEndpoints:
    """Tests for calendar import API endpoints."""

    def test_import_endpoint(self, client, db):
        resp = client.post("/api/events/import/import", json={
            "content": SAMPLE_ICS,
            "skip_duplicates": True,
        })
        assert resp.status_code == 201
        data = resp.json()
        assert data['imported'] == 3

    def test_preview_endpoint(self, client, db):
        resp = client.post("/api/events/import/preview", json={
            "content": SAMPLE_ICS,
        })
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 3
        assert data[0]['title'] == 'Team Standup'

    def test_import_invalid_format(self, client, db):
        resp = client.post("/api/events/import/import", json={
            "content": "not an ics file",
        })
        assert resp.status_code == 400
        assert "VCALENDAR" in resp.json()["detail"]

    def test_import_empty_content(self, client, db):
        resp = client.post("/api/events/import/import", json={
            "content": "",
        })
        assert resp.status_code == 400

    def test_import_returns_event_details(self, client, db):
        resp = client.post("/api/events/import/import", json={
            "content": SAMPLE_ICS,
        })
        data = resp.json()
        events = data['events']
        assert len(events) == 3
        standup = next(e for e in events if e['title'] == 'Team Standup')
        assert standup['date'] == '2026-02-16'
        assert standup['start_time'] == '09:00'
