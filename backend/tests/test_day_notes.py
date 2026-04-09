"""Day notes router tests — CRUD, week view, upsert behavior."""

from datetime import date, timedelta


# --- CRUD ---

def test_create_note(client):
    r = client.post("/api/day-notes/", json={
        "date": str(date.today()), "content": "Good day today",
    })
    assert r.status_code == 201
    assert r.json()["content"] == "Good day today"


def test_get_note_by_date(client):
    today = str(date.today())
    client.post("/api/day-notes/", json={"date": today, "content": "Test note"})
    r = client.get(f"/api/day-notes/{today}")
    assert r.status_code == 200
    assert r.json()["content"] == "Test note"


def test_get_note_missing_date(client):
    r = client.get("/api/day-notes/2020-01-01")
    assert r.status_code == 200
    assert r.json() is None


def test_upsert_note(client):
    today = str(date.today())
    client.post("/api/day-notes/", json={"date": today, "content": "Version 1"})
    client.post("/api/day-notes/", json={"date": today, "content": "Version 2"})
    r = client.get(f"/api/day-notes/{today}")
    assert r.json()["content"] == "Version 2"


def test_update_note(client):
    today = str(date.today())
    client.post("/api/day-notes/", json={"date": today, "content": "Original"})
    r = client.put(f"/api/day-notes/{today}", json={"content": "Updated"})
    assert r.status_code == 200
    assert r.json()["content"] == "Updated"


def test_update_note_not_found(client):
    assert client.put("/api/day-notes/2020-01-01", json={"content": "X"}).status_code == 404


def test_delete_note(client):
    today = str(date.today())
    client.post("/api/day-notes/", json={"date": today, "content": "To delete"})
    r = client.delete(f"/api/day-notes/{today}")
    assert r.status_code == 204


def test_delete_note_not_found(client):
    assert client.delete("/api/day-notes/2020-01-01").status_code == 404


# --- Week View ---

def test_get_week_notes(client):
    today = date.today()
    monday = today - timedelta(days=today.weekday())
    client.post("/api/day-notes/", json={"date": str(monday), "content": "Monday note"})
    client.post("/api/day-notes/", json={"date": str(monday + timedelta(days=2)), "content": "Wednesday note"})
    r = client.get(f"/api/day-notes/week/{monday}")
    assert r.status_code == 200
    assert len(r.json()) == 2


# --- Mood + Pinned ---

def test_note_with_mood(client):
    r = client.post("/api/day-notes/", json={
        "date": str(date.today()), "content": "Great!", "mood": "happy", "is_pinned": True,
    })
    assert r.status_code == 201
    assert r.json()["mood"] == "happy"
    assert r.json()["is_pinned"] is True
