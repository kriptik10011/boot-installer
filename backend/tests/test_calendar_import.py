"""Calendar import router tests — import, preview, validation."""


SAMPLE_ICS = """BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
SUMMARY:Team Standup
DTSTART:20260325T090000
DTEND:20260325T093000
LOCATION:Zoom
DESCRIPTION:Daily sync
END:VEVENT
BEGIN:VEVENT
SUMMARY:Lunch Meeting
DTSTART:20260326T120000
DTEND:20260326T130000
END:VEVENT
END:VCALENDAR"""


# --- Preview ---

def test_preview_ics(client):
    r = client.post("/api/events/import/preview", json={
        "content": SAMPLE_ICS,
    })
    assert r.status_code == 200
    items = r.json()
    assert len(items) == 2
    assert items[0]["title"] == "Team Standup"


def test_preview_empty_content(client):
    r = client.post("/api/events/import/preview", json={"content": ""})
    assert r.status_code == 400


# --- Import ---

def test_import_ics(client):
    r = client.post("/api/events/import/import", json={
        "content": SAMPLE_ICS, "skip_duplicates": True,
    })
    assert r.status_code == 201
    data = r.json()
    assert data["total_parsed"] == 2
    assert data["imported"] >= 1


def test_import_invalid_ics(client):
    r = client.post("/api/events/import/import", json={
        "content": "NOT A CALENDAR",
    })
    assert r.status_code == 400


def test_import_skip_duplicates(client):
    client.post("/api/events/import/import", json={
        "content": SAMPLE_ICS, "skip_duplicates": True,
    })
    r = client.post("/api/events/import/import", json={
        "content": SAMPLE_ICS, "skip_duplicates": True,
    })
    assert r.status_code == 201
    assert r.json()["skipped"] >= 1
