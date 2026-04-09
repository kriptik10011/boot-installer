"""
Calendar import service — parse .ics files and create events.

Parses iCalendar (.ics) format files and creates Event entries.
One-time read-only import — no bidirectional sync.
"""

import logging
import re
from datetime import date, datetime, timezone

logger = logging.getLogger("weekly_review")
from typing import List, Optional
from sqlalchemy.orm import Session

from app.models.event import Event


def parse_ics_content(content: str) -> List[dict]:
    """
    Parse iCalendar (.ics) content into a list of event dictionaries.

    Handles VEVENT components with:
    - SUMMARY (title)
    - DTSTART (date/datetime)
    - DTEND (optional)
    - DESCRIPTION (optional, mapped to notes)
    - LOCATION (optional)

    Returns list of {title, date, start_time, end_time, notes, location, source}.
    """
    events = []
    in_event = False
    current: dict = {}

    # Unfold continuation lines (lines starting with space/tab)
    unfolded = re.sub(r'\r?\n[ \t]', '', content)
    lines = unfolded.split('\n')

    for line in lines:
        line = line.strip()

        if line == 'BEGIN:VEVENT':
            in_event = True
            current = {}
        elif line == 'END:VEVENT':
            in_event = False
            if 'title' in current and 'date' in current:
                events.append(current)
        elif in_event:
            if ':' in line:
                key_part, _, value = line.partition(':')
                # Handle parameters like DTSTART;VALUE=DATE:20260215
                key = key_part.split(';')[0].upper()

                if key == 'SUMMARY':
                    current['title'] = _unescape_ics(value)
                elif key == 'DTSTART':
                    parsed = _parse_ics_datetime(value)
                    if parsed:
                        if isinstance(parsed, date) and not isinstance(parsed, datetime):
                            current['date'] = parsed
                            current['start_time'] = None
                        else:
                            current['date'] = parsed.date() if isinstance(parsed, datetime) else parsed
                            current['start_time'] = parsed.strftime('%H:%M') if isinstance(parsed, datetime) else None
                elif key == 'DTEND':
                    parsed = _parse_ics_datetime(value)
                    if parsed and isinstance(parsed, datetime):
                        current['end_time'] = parsed.strftime('%H:%M')
                elif key == 'DESCRIPTION':
                    current['notes'] = _unescape_ics(value)
                elif key == 'LOCATION':
                    current['location'] = _unescape_ics(value)

    return events


def _parse_ics_datetime(value: str) -> Optional[date | datetime]:
    """Parse iCalendar date/datetime value."""
    value = value.strip()

    # DATE format: YYYYMMDD
    if len(value) == 8 and value.isdigit():
        try:
            return date(int(value[:4]), int(value[4:6]), int(value[6:8]))
        except ValueError:
            return None

    # DATETIME format: YYYYMMDDTHHMMSS or YYYYMMDDTHHMMSSZ
    if 'T' in value:
        value = value.rstrip('Z')
        try:
            return datetime(
                int(value[:4]), int(value[4:6]), int(value[6:8]),
                int(value[9:11]), int(value[11:13]), int(value[13:15]),
                tzinfo=timezone.utc,
            )
        except (ValueError, IndexError):
            return None

    return None


def _unescape_ics(text: str) -> str:
    """Unescape iCalendar text values."""
    return (
        text
        .replace('\\n', '\n')
        .replace('\\,', ',')
        .replace('\\;', ';')
        .replace('\\\\', '\\')
    )


def import_ics_events(
    db: Session,
    content: str,
    category_id: Optional[int] = None,
    skip_duplicates: bool = True,
) -> dict:
    """
    Import events from .ics content into the database.

    Args:
        db: Database session
        content: Raw .ics file content
        category_id: Optional category to assign to all imported events
        skip_duplicates: If True, skip events that match existing (title + date)

    Returns dict with {imported, skipped, errors, events[]}.
    """
    parsed = parse_ics_content(content)

    imported = 0
    skipped = 0
    errors = 0
    created_events = []

    # Pre-load existing events for O(1) duplicate checks
    existing_event_keys: set[tuple[str, date]] = set()
    if skip_duplicates and parsed:
        parsed_dates = [e.get('date') for e in parsed if e.get('date')]
        if parsed_dates:
            min_date = min(parsed_dates)
            max_date = max(parsed_dates)
            existing_events = db.query(Event.name, Event.date).filter(
                Event.date >= min_date,
                Event.date <= max_date,
            ).all()
            existing_event_keys = {(e.name, e.date) for e in existing_events}

    for event_data in parsed:
        try:
            title = event_data.get('title', '')
            event_date = event_data.get('date')

            if not title or not event_date:
                errors += 1
                continue

            # Check for duplicates
            if skip_duplicates:
                if (title, event_date) in existing_event_keys:
                    skipped += 1
                    continue

            # Build description from notes + location
            desc_parts = []
            if event_data.get('notes'):
                desc_parts.append(event_data['notes'])
            if event_data.get('location'):
                desc_parts.append(f"Location: {event_data['location']}")
            description = '\n'.join(desc_parts) if desc_parts else None

            event = Event(
                name=title,
                date=event_date,
                start_time=event_data.get('start_time'),
                end_time=event_data.get('end_time'),
                location=event_data.get('location'),
                description=description,
                category_id=category_id,
            )
            db.add(event)
            imported += 1
            created_events.append({
                'title': title,
                'date': event_date.isoformat(),
                'start_time': event_data.get('start_time'),
            })

        except Exception as e:
            logger.warning("Calendar import: failed to import event: %s", e)
            errors += 1

    if imported > 0:
        db.commit()

    return {
        'imported': imported,
        'skipped': skipped,
        'errors': errors,
        'total_parsed': len(parsed),
        'events': created_events,
    }
