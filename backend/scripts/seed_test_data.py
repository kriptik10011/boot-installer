"""
Test Data Seeding Script for Intelligence System (FAST VERSION)

Generates test data to exercise the intelligence stack.
Optimized for speed with bulk inserts.

Usage:
    cd backend
    python scripts/seed_test_data.py [--clear] [--scenario <name>]

Scenarios (Intelligence Layer - observation patterns):
    typical      - 6 weeks of normal usage (DEFAULT)
    consistent   - 6 weeks with strong patterns
    irregular    - 1 week with random times

Scenarios (Week Stress Testing - app data volume):
    light        - Light week: 3 events, 1 bill, 50% meals planned
    normal       - Normal week: 10 events, 3 bills, 70% meals planned
    heavy        - Heavy week: 25 events, 6 bills (2 overdue), 30% meals planned, conflicts
"""

import random
import uuid
from datetime import datetime, timedelta
from typing import Optional, List

import sys
sys.path.insert(0, '.')

from sqlalchemy.orm import Session
from app.database import SessionLocal
from app.models.observation import ObservationEvent, DwellTimeRecord, SessionSummary
from app.models import Event, FinancialItem, MealPlanEntry
from app.models.meal import MealType
from app.models.financial import FinancialItemType


# ============== Configuration ==============

VIEWS = ['week', 'events', 'finances', 'meals', 'recipes', 'shopping']
ACTIONS = ['create_event', 'edit_event', 'create_expense', 'plan_meal', 'check_item']


def generate_session_id() -> str:
    return str(uuid.uuid4())[:12]


# ============== FAST Scenario Generators ==============

def generate_typical_scenario(db: Session, weeks: int = 6):
    """
    Generate typical user data FAST:
    - 6 weeks of data by default (need 5+ planning sessions for confidence)
    - Planning sessions on Sunday evenings
    - Quick living sessions on weekdays
    - Bulk inserts for speed
    """
    print(f"Generating typical scenario ({weeks} weeks)...")

    now = datetime.now()
    start_date = now - timedelta(weeks=weeks)

    events_to_add: List[ObservationEvent] = []
    sessions_to_add: List[SessionSummary] = []
    dwell_to_add: List[DwellTimeRecord] = []

    current_date = start_date
    while current_date < now:
        day_of_week = current_date.weekday()  # 0=Monday, 6=Sunday

        # Sunday = Planning session
        if day_of_week == 6:
            hour = random.choice([19, 20])
            session_start = current_date.replace(hour=hour, minute=random.randint(0, 30), second=0, microsecond=0)
            s, e, d = _build_planning_session(session_start, 15 * 60)
            sessions_to_add.append(s)
            events_to_add.extend(e)
            dwell_to_add.extend(d)

        # Weekdays = 1 quick living session
        if day_of_week < 5:
            hour = random.choice([8, 12, 18, 20])
            session_start = current_date.replace(hour=hour, minute=random.randint(0, 59), second=0, microsecond=0)
            s, e, d = _build_living_session(session_start, 3 * 60)
            sessions_to_add.append(s)
            events_to_add.extend(e)
            dwell_to_add.extend(d)

        current_date += timedelta(days=1)

    # Bulk add all at once
    db.bulk_save_objects(sessions_to_add)
    db.bulk_save_objects(events_to_add)
    db.bulk_save_objects(dwell_to_add)
    db.commit()

    print(f"  Created {len(sessions_to_add)} sessions, {len(events_to_add)} events")

    # Add minimal app data
    _create_sample_data_fast(db, start_date, now)
    db.commit()
    print("  Created sample events, finances, and meals")


def generate_consistent_scenario(db: Session):
    """
    Generate data with consistent patterns (6 weeks):
    - Always plans on Sunday at 7pm
    - Always checks at 8am and 6pm on weekdays
    """
    print("Generating consistent scenario (6 weeks)...")

    now = datetime.now()
    start_date = now - timedelta(weeks=6)

    events_to_add: List[ObservationEvent] = []
    sessions_to_add: List[SessionSummary] = []
    dwell_to_add: List[DwellTimeRecord] = []

    current_date = start_date
    while current_date < now:
        day_of_week = current_date.weekday()

        if day_of_week == 6:  # Sunday
            session_start = current_date.replace(hour=19, minute=0, second=0, microsecond=0)
            s, e, d = _build_planning_session(session_start, 20 * 60)
            sessions_to_add.append(s)
            events_to_add.extend(e)
            dwell_to_add.extend(d)

        if day_of_week < 5:  # Weekdays
            # Morning session
            morning = current_date.replace(hour=8, minute=0, second=0, microsecond=0)
            s, e, d = _build_living_session(morning, 3 * 60)
            sessions_to_add.append(s)
            events_to_add.extend(e)
            dwell_to_add.extend(d)

            # Evening session
            evening = current_date.replace(hour=18, minute=0, second=0, microsecond=0)
            s, e, d = _build_living_session(evening, 5 * 60)
            sessions_to_add.append(s)
            events_to_add.extend(e)
            dwell_to_add.extend(d)

        current_date += timedelta(days=1)

    db.bulk_save_objects(sessions_to_add)
    db.bulk_save_objects(events_to_add)
    db.bulk_save_objects(dwell_to_add)
    db.commit()

    print(f"  Created {len(sessions_to_add)} sessions, {len(events_to_add)} events")

    _create_sample_data_fast(db, start_date, now)
    db.commit()


def generate_irregular_scenario(db: Session):
    """
    Generate data with irregular patterns (1 week):
    - Random times, no consistent pattern
    """
    print("Generating irregular scenario (1 week)...")

    now = datetime.now()
    start_date = now - timedelta(weeks=1)

    events_to_add: List[ObservationEvent] = []
    sessions_to_add: List[SessionSummary] = []
    dwell_to_add: List[DwellTimeRecord] = []

    current_date = start_date
    while current_date < now:
        # Random 0-2 sessions per day
        num_sessions = random.randint(0, 2)
        for _ in range(num_sessions):
            hour = random.randint(6, 23)
            session_start = current_date.replace(hour=hour, minute=random.randint(0, 59), second=0, microsecond=0)

            if random.random() > 0.7:
                s, e, d = _build_planning_session(session_start, random.randint(5, 15) * 60)
            else:
                s, e, d = _build_living_session(session_start, random.randint(2, 8) * 60)

            sessions_to_add.append(s)
            events_to_add.extend(e)
            dwell_to_add.extend(d)

        current_date += timedelta(days=1)

    db.bulk_save_objects(sessions_to_add)
    db.bulk_save_objects(events_to_add)
    db.bulk_save_objects(dwell_to_add)
    db.commit()

    print(f"  Created {len(sessions_to_add)} sessions, {len(events_to_add)} events")

    _create_sample_data_fast(db, start_date, now)
    db.commit()


# ============== Week Stress Test Scenarios ==============

def _generate_observation_sessions(db: Session, num_weeks: int = 3, sessions_per_week: int = 5):
    """
    Generate observation sessions to bootstrap the intelligence layer.

    This ensures the system exits cold start mode (requires 10+ sessions).
    Creates a mix of planning and living sessions spread over the specified weeks.
    """
    print(f"  Generating {num_weeks} weeks of observation sessions...")

    now = datetime.now()
    start_date = now - timedelta(weeks=num_weeks)

    events_to_add: List[ObservationEvent] = []
    sessions_to_add: List[SessionSummary] = []
    dwell_to_add: List[DwellTimeRecord] = []

    current_date = start_date
    while current_date < now:
        day_of_week = current_date.weekday()  # 0=Monday, 6=Sunday

        # Sunday = Planning session (always)
        if day_of_week == 6:
            hour = random.choice([18, 19, 20])
            session_start = current_date.replace(hour=hour, minute=random.randint(0, 30), second=0, microsecond=0)
            s, e, d = _build_planning_session(session_start, random.randint(10, 20) * 60)
            sessions_to_add.append(s)
            events_to_add.extend(e)
            dwell_to_add.extend(d)

        # Some weekdays have living sessions
        if day_of_week < 5 and random.random() > 0.5:
            hour = random.choice([8, 12, 18, 20])
            session_start = current_date.replace(hour=hour, minute=random.randint(0, 59), second=0, microsecond=0)
            s, e, d = _build_living_session(session_start, random.randint(2, 5) * 60)
            sessions_to_add.append(s)
            events_to_add.extend(e)
            dwell_to_add.extend(d)

        current_date += timedelta(days=1)

    # Bulk add all at once
    db.bulk_save_objects(sessions_to_add)
    db.bulk_save_objects(events_to_add)
    db.bulk_save_objects(dwell_to_add)
    db.commit()

    print(f"  Created {len(sessions_to_add)} observation sessions ({len(events_to_add)} events)")
    return len(sessions_to_add)


def generate_light_week(db: Session):
    """
    Light week scenario - Calm, low-stress week:
    - 3 events total (spread across week)
    - 1 bill due ($50)
    - 50% meals planned (10-11 of 21)
    - No conflicts
    - No overloaded days
    - INCLUDES: 3 weeks of observation sessions (exits cold start)
    """
    print("Generating light week scenario...")

    now = datetime.now()
    # Get start of current week (Monday)
    week_start = now - timedelta(days=now.weekday())
    week_start = week_start.replace(hour=0, minute=0, second=0, microsecond=0)

    events = []
    finances = []
    meals = []

    # 3 simple events - no overlaps
    event_configs = [
        ("Doctor Checkup", 1, "10:00", "11:00"),
        ("Coffee with Friend", 3, "14:00", "15:00"),
        ("Movie Night", 5, "19:00", "22:00"),
    ]
    for name, day_offset, start, end in event_configs:
        events.append(Event(
            name=name,
            date=(week_start + timedelta(days=day_offset)).date(),
            start_time=start,
            end_time=end,
        ))

    # 1 bill - not overdue
    finances.append(FinancialItem(
        name="Electric Bill",
        amount=50,
        type=FinancialItemType.BILL,
        due_date=(week_start + timedelta(days=4)).date(),
        is_paid=False,
    ))

    # 50% meals planned (10-11 of 21)
    meal_types = [MealType.BREAKFAST, MealType.LUNCH, MealType.DINNER]
    meal_options = {
        MealType.BREAKFAST: ["Eggs & Toast", "Oatmeal", "Cereal"],
        MealType.LUNCH: ["Sandwich", "Salad", "Soup"],
        MealType.DINNER: ["Pasta", "Grilled Chicken", "Stir Fry"],
    }

    # Plan meals for first 3-4 days only
    for day_offset in range(4):
        meal_date = (week_start + timedelta(days=day_offset)).date()
        for meal_type in meal_types:
            # Skip some meals randomly (about 20-30% skip rate)
            if random.random() > 0.75:
                continue
            meals.append(MealPlanEntry(
                date=meal_date,
                meal_type=meal_type,
                description=random.choice(meal_options[meal_type]),
            ))

    db.bulk_save_objects(events)
    db.bulk_save_objects(finances)
    db.bulk_save_objects(meals)
    db.commit()

    print(f"  Created {len(events)} events, {len(finances)} bills, {len(meals)} meals")

    # Generate observation sessions to exit cold start
    session_count = _generate_observation_sessions(db, num_weeks=3, sessions_per_week=5)
    print(f"  Intelligence: {session_count} sessions created (exits cold start)")


def generate_normal_week(db: Session):
    """
    Normal week scenario - Typical busy week:
    - 10 events (mix of work/personal)
    - 3 bills due ($200 total)
    - 70% meals planned (~15 of 21)
    - 1 minor conflict (2 events overlap slightly)
    - INCLUDES: 3 weeks of observation sessions (exits cold start)
    """
    print("Generating normal week scenario...")

    now = datetime.now()
    week_start = now - timedelta(days=now.weekday())
    week_start = week_start.replace(hour=0, minute=0, second=0, microsecond=0)

    events = []
    finances = []
    meals = []

    # 10 events - including 1 conflict
    event_configs = [
        # Monday - work focused
        ("Team Standup", 0, "09:00", "09:30"),
        ("Project Meeting", 0, "14:00", "15:30"),
        # Tuesday
        ("Gym", 1, "06:30", "07:30"),
        ("Client Call", 1, "11:00", "12:00"),
        # Wednesday - has conflict
        ("Dentist", 2, "10:00", "11:00"),
        ("Doctor Checkup", 2, "10:30", "11:30"),  # Overlaps with dentist!
        # Thursday
        ("Team Lunch", 3, "12:00", "13:00"),
        # Friday
        ("1:1 with Manager", 4, "10:00", "10:30"),
        ("Happy Hour", 4, "17:00", "19:00"),
        # Weekend
        ("Brunch", 6, "11:00", "13:00"),
    ]
    for name, day_offset, start, end in event_configs:
        events.append(Event(
            name=name,
            date=(week_start + timedelta(days=day_offset)).date(),
            start_time=start,
            end_time=end,
        ))

    # 3 bills - $200 total, none overdue
    bill_configs = [
        ("Internet", 80, 2),
        ("Phone", 65, 4),
        ("Streaming", 55, 5),
    ]
    for name, amount, day_offset in bill_configs:
        finances.append(FinancialItem(
            name=name,
            amount=amount,
            type=FinancialItemType.BILL,
            due_date=(week_start + timedelta(days=day_offset)).date(),
            is_paid=False,
        ))

    # 70% meals planned (~15 of 21)
    meal_types = [MealType.BREAKFAST, MealType.LUNCH, MealType.DINNER]
    meal_options = {
        MealType.BREAKFAST: ["Eggs & Toast", "Oatmeal", "Smoothie", "Cereal"],
        MealType.LUNCH: ["Sandwich", "Salad", "Leftovers", "Soup"],
        MealType.DINNER: ["Pasta", "Tacos", "Grilled Salmon", "Stir Fry", "Pizza"],
    }

    # Plan most meals, leave a few gaps
    for day_offset in range(7):
        meal_date = (week_start + timedelta(days=day_offset)).date()
        for meal_type in meal_types:
            # Skip about 30% of meals
            if random.random() > 0.7:
                continue
            meals.append(MealPlanEntry(
                date=meal_date,
                meal_type=meal_type,
                description=random.choice(meal_options[meal_type]),
            ))

    db.bulk_save_objects(events)
    db.bulk_save_objects(finances)
    db.bulk_save_objects(meals)
    db.commit()

    print(f"  Created {len(events)} events, {len(finances)} bills, {len(meals)} meals")

    # Generate observation sessions to exit cold start
    session_count = _generate_observation_sessions(db, num_weeks=3, sessions_per_week=5)
    print(f"  Intelligence: {session_count} sessions created (exits cold start)")


def generate_heavy_week(db: Session):
    """
    Heavy week scenario - Stressful, needs attention:
    - 25+ events (overloaded days with 5+ events)
    - 6 bills due ($500 total, 2 overdue)
    - 30% meals planned (~6 of 21)
    - 4 conflicts across multiple days
    - 3 overloaded days (5+ events)
    - INCLUDES: 3 weeks of observation sessions (exits cold start)
    """
    print("Generating heavy week scenario...")

    now = datetime.now()
    week_start = now - timedelta(days=now.weekday())
    week_start = week_start.replace(hour=0, minute=0, second=0, microsecond=0)

    events = []
    finances = []
    meals = []

    # Monday - OVERLOADED (6 events, conflicts)
    monday_events = [
        ("Team Standup", "09:00", "09:30"),
        ("Budget Review", "09:15", "10:15"),  # Conflict!
        ("Sprint Planning", "10:00", "11:30"),  # Conflict!
        ("Client Presentation", "13:00", "15:00"),
        ("1:1 with Director", "15:00", "15:30"),  # Conflict!
        ("All-Hands Meeting", "16:00", "17:00"),
    ]
    for name, start, end in monday_events:
        events.append(Event(
            name=name,
            date=(week_start + timedelta(days=0)).date(),
            start_time=start,
            end_time=end,
        ))

    # Tuesday - OVERLOADED (5 events)
    tuesday_events = [
        ("Gym", "06:30", "07:30"),
        ("Design Review", "09:00", "10:30"),
        ("Interview - Candidate A", "11:00", "12:00"),
        ("Interview - Candidate B", "14:00", "15:00"),
        ("Team Retrospective", "16:00", "17:00"),
    ]
    for name, start, end in tuesday_events:
        events.append(Event(
            name=name,
            date=(week_start + timedelta(days=1)).date(),
            start_time=start,
            end_time=end,
        ))

    # Wednesday - moderate (4 events)
    wednesday_events = [
        ("Dentist", "08:00", "09:00"),
        ("Vendor Meeting", "10:00", "11:00"),
        ("Lunch & Learn", "12:00", "13:00"),
        ("Code Review", "15:00", "16:30"),
    ]
    for name, start, end in wednesday_events:
        events.append(Event(
            name=name,
            date=(week_start + timedelta(days=2)).date(),
            start_time=start,
            end_time=end,
        ))

    # Thursday - OVERLOADED (5 events, conflict)
    thursday_events = [
        ("Strategy Meeting", "09:00", "11:00"),
        ("Product Demo", "10:30", "11:30"),  # Conflict!
        ("Investor Call", "13:00", "14:00"),
        ("Training Session", "14:30", "16:00"),
        ("Team Dinner", "18:00", "21:00"),
    ]
    for name, start, end in thursday_events:
        events.append(Event(
            name=name,
            date=(week_start + timedelta(days=3)).date(),
            start_time=start,
            end_time=end,
        ))

    # Friday - busy (4 events)
    friday_events = [
        ("Weekly Review", "10:00", "11:00"),
        ("Performance Review", "11:30", "12:30"),
        ("Offsite Planning", "14:00", "16:00"),
        ("Happy Hour", "17:00", "19:00"),
    ]
    for name, start, end in friday_events:
        events.append(Event(
            name=name,
            date=(week_start + timedelta(days=4)).date(),
            start_time=start,
            end_time=end,
        ))

    # Weekend - still some events
    weekend_events = [
        ("Oil Change", 5, "10:00", "11:00"),
        ("Brunch with Parents", 6, "11:00", "13:00"),
    ]
    for name, day_offset, start, end in weekend_events:
        events.append(Event(
            name=name,
            date=(week_start + timedelta(days=day_offset)).date(),
            start_time=start,
            end_time=end,
        ))

    # 6 bills - $500 total, 2 OVERDUE (past due dates)
    yesterday = (now - timedelta(days=1)).date()
    two_days_ago = (now - timedelta(days=2)).date()

    bill_configs = [
        # Overdue bills
        ("Credit Card", 150, two_days_ago, False),
        ("Electric Bill", 135, yesterday, False),
        # Upcoming bills
        ("Internet", 80, (week_start + timedelta(days=2)).date(), False),
        ("Phone", 65, (week_start + timedelta(days=3)).date(), False),
        ("Rent", 50, (week_start + timedelta(days=5)).date(), False),  # Partial payment placeholder
        ("Insurance", 20, (week_start + timedelta(days=6)).date(), False),
    ]
    for name, amount, due_date, is_paid in bill_configs:
        finances.append(FinancialItem(
            name=name,
            amount=amount,
            type=FinancialItemType.BILL,
            due_date=due_date,
            is_paid=is_paid,
        ))

    # 30% meals planned (~6 of 21) - very sparse
    meal_options = {
        MealType.BREAKFAST: ["Quick Toast"],
        MealType.LUNCH: ["Leftovers"],
        MealType.DINNER: ["Takeout", "Frozen Pizza"],
    }

    # Only plan a few meals sporadically
    planned_days = [0, 2, 4]  # Monday, Wednesday, Friday
    for day_offset in planned_days:
        meal_date = (week_start + timedelta(days=day_offset)).date()
        # Only plan 1-2 meals per day
        meal_type = random.choice([MealType.LUNCH, MealType.DINNER])
        meals.append(MealPlanEntry(
            date=meal_date,
            meal_type=meal_type,
            description=random.choice(meal_options[meal_type]),
        ))

    db.bulk_save_objects(events)
    db.bulk_save_objects(finances)
    db.bulk_save_objects(meals)
    db.commit()

    print(f"  Created {len(events)} events, {len(finances)} bills, {len(meals)} meals")
    print("  ⚠️  Includes: 2 overdue bills, 4 conflicts, 3 overloaded days")

    # Generate observation sessions to exit cold start
    session_count = _generate_observation_sessions(db, num_weeks=3, sessions_per_week=5)
    print(f"  Intelligence: {session_count} sessions created (exits cold start)")


# ============== Session Builders (return objects, don't commit) ==============

def _build_planning_session(start: datetime, duration_seconds: int):
    """Build a planning session - returns (session, events, dwells)."""
    session_id = generate_session_id()
    js_weekday = (start.weekday() + 1) % 7

    session = SessionSummary(
        session_id=session_id,
        started_at=start,
        ended_at=start + timedelta(seconds=duration_seconds),
        duration_seconds=duration_seconds,
        day_of_week=js_weekday,
        hour_started=start.hour,
        views_visited=['week', 'events', 'finances', 'meals'],
        actions_taken=['create_event', 'plan_meal'],
        is_planning_session=True,
    )

    events = []
    dwells = []
    current_time = start

    # App open
    events.append(_build_event(session_id, 'app_open', None, None, current_time))

    # Visit a few views (simplified)
    for view in ['week', 'events', 'meals']:
        dwell_time = duration_seconds // 4
        current_time += timedelta(seconds=2)
        events.append(_build_event(session_id, 'view_enter', view, None, current_time))
        current_time += timedelta(seconds=dwell_time)
        events.append(_build_event(session_id, 'view_exit', view, None, current_time))

        dwells.append(DwellTimeRecord(
            session_id=session_id,
            view_name=view,
            total_seconds=dwell_time,
            entry_count=1,
        ))

    # App close
    events.append(_build_event(session_id, 'app_close', None, None, current_time))

    return session, events, dwells


def _build_living_session(start: datetime, duration_seconds: int):
    """Build a living session - returns (session, events, dwells)."""
    session_id = generate_session_id()
    js_weekday = (start.weekday() + 1) % 7
    view = random.choice(['week', 'events', 'finances'])

    session = SessionSummary(
        session_id=session_id,
        started_at=start,
        ended_at=start + timedelta(seconds=duration_seconds),
        duration_seconds=duration_seconds,
        day_of_week=js_weekday,
        hour_started=start.hour,
        views_visited=[view],
        actions_taken=[],
        is_planning_session=False,
    )

    events = [
        _build_event(session_id, 'app_open', None, None, start),
        _build_event(session_id, 'view_enter', view, None, start + timedelta(seconds=1)),
        _build_event(session_id, 'view_exit', view, None, start + timedelta(seconds=duration_seconds - 1)),
        _build_event(session_id, 'app_close', None, None, start + timedelta(seconds=duration_seconds)),
    ]

    dwells = [DwellTimeRecord(
        session_id=session_id,
        view_name=view,
        total_seconds=duration_seconds,
        entry_count=1,
    )]

    return session, events, dwells


def _build_event(session_id: str, event_type: str, view_name: Optional[str],
                 action_name: Optional[str], timestamp: datetime) -> ObservationEvent:
    """Build an observation event object."""
    js_weekday = (timestamp.weekday() + 1) % 7
    return ObservationEvent(
        event_type=event_type,
        view_name=view_name,
        action_name=action_name,
        session_id=session_id,
        timestamp=timestamp,
        day_of_week=js_weekday,
        hour_of_day=timestamp.hour,
    )


# ============== Fast App Data Generator ==============

def _create_sample_data_fast(db: Session, start: datetime, end: datetime):
    """Create minimal sample app data quickly."""
    events = []
    finances = []
    meals = []

    # Create ~5 events
    event_names = ["Team Meeting", "Dentist", "Gym", "Date Night", "Doctor"]
    for i, name in enumerate(event_names):
        event_date = start + timedelta(days=i % 7)
        events.append(Event(
            name=name,
            date=event_date.date(),
            start_time="09:00" if i % 2 == 0 else "14:00",
            end_time="10:00" if i % 2 == 0 else "15:00",
        ))

    # Create ~4 bills
    bill_names = [("Electric", 120), ("Internet", 80), ("Phone", 65), ("Netflix", 15)]
    for name, amount in bill_names:
        finances.append(FinancialItem(
            name=name,
            amount=amount,
            type=FinancialItemType.BILL,
            due_date=(start + timedelta(days=random.randint(1, 14))).date(),
            is_paid=random.random() > 0.5,
        ))

    # Create meals for ~5 days
    meal_names = {
        MealType.BREAKFAST: ['Eggs', 'Oatmeal', None],
        MealType.LUNCH: ['Sandwich', 'Salad', None],
        MealType.DINNER: ['Pasta', 'Tacos', 'Pizza', None],
    }
    for day_offset in range(5):
        meal_date = (start + timedelta(days=day_offset)).date()
        for meal_type in [MealType.BREAKFAST, MealType.LUNCH, MealType.DINNER]:
            name = random.choice(meal_names[meal_type])
            if name:
                meals.append(MealPlanEntry(
                    date=meal_date,
                    meal_type=meal_type,
                    description=name,
                ))

    db.bulk_save_objects(events)
    db.bulk_save_objects(finances)
    db.bulk_save_objects(meals)


# ============== Clear Functions ==============

def clear_observation_data(db: Session):
    """Clear all observation data."""
    db.query(ObservationEvent).delete()
    db.query(DwellTimeRecord).delete()
    db.query(SessionSummary).delete()
    db.commit()
    print("Cleared observation data")


def clear_all_data(db: Session):
    """Clear ALL data."""
    clear_observation_data(db)
    db.query(Event).delete()
    db.query(FinancialItem).delete()
    db.query(MealPlanEntry).delete()
    db.commit()
    print("Cleared all data")


# ============== Main ==============

if __name__ == '__main__':
    import argparse

    parser = argparse.ArgumentParser(description='Seed test data (FAST)')
    parser.add_argument('--clear', action='store_true', help='Clear existing data first')
    parser.add_argument('--clear-all', action='store_true', help='Clear ALL data (including events, bills, meals)')
    parser.add_argument('--scenario', default='typical',
                       choices=['typical', 'consistent', 'irregular', 'light', 'normal', 'heavy'],
                       help='Data scenario to generate')

    args = parser.parse_args()

    db = SessionLocal()

    try:
        if args.clear_all:
            clear_all_data(db)
        elif args.clear:
            clear_observation_data(db)

        # Intelligence layer scenarios (observation patterns)
        if args.scenario == 'typical':
            generate_typical_scenario(db, weeks=1)
        elif args.scenario == 'consistent':
            generate_consistent_scenario(db)
        elif args.scenario == 'irregular':
            generate_irregular_scenario(db)
        # Week stress test scenarios (app data volume)
        elif args.scenario == 'light':
            generate_light_week(db)
        elif args.scenario == 'normal':
            generate_normal_week(db)
        elif args.scenario == 'heavy':
            generate_heavy_week(db)

        print("\nDone! Refresh the app to see new data.")
    finally:
        db.close()
