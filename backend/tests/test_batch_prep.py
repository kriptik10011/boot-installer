"""Batch prep router tests — sessions, tasks, meal linking, completion."""

from datetime import date


SAMPLE_SESSION = {
    "name": "Sunday Prep", "prep_date": str(date.today()),
    "estimated_duration_minutes": 120,
}


# --- Session CRUD ---

def test_create_session(client):
    r = client.post("/api/batch-prep/", json=SAMPLE_SESSION)
    assert r.status_code == 201
    data = r.json()
    assert data["name"] == "Sunday Prep"
    assert data["is_completed"] is False


def test_list_sessions(client):
    client.post("/api/batch-prep/", json=SAMPLE_SESSION)
    r = client.get("/api/batch-prep/")
    assert r.status_code == 200
    assert len(r.json()) >= 1


def test_get_session(client):
    cr = client.post("/api/batch-prep/", json=SAMPLE_SESSION)
    sid = cr.json()["id"]
    r = client.get(f"/api/batch-prep/{sid}")
    assert r.status_code == 200
    assert r.json()["name"] == "Sunday Prep"


def test_get_session_not_found(client):
    assert client.get("/api/batch-prep/9999").status_code == 404


def test_update_session(client):
    cr = client.post("/api/batch-prep/", json=SAMPLE_SESSION)
    sid = cr.json()["id"]
    r = client.put(f"/api/batch-prep/{sid}", json={"name": "Updated Prep"})
    assert r.status_code == 200
    assert r.json()["name"] == "Updated Prep"


def test_delete_session(client):
    cr = client.post("/api/batch-prep/", json=SAMPLE_SESSION)
    sid = cr.json()["id"]
    r = client.delete(f"/api/batch-prep/{sid}")
    assert r.status_code == 204


def test_get_week_sessions(client):
    client.post("/api/batch-prep/", json=SAMPLE_SESSION)
    r = client.get(f"/api/batch-prep/week/{date.today()}")
    assert r.status_code == 200
    assert isinstance(r.json(), list)


# --- Tasks ---

def test_add_task(client):
    cr = client.post("/api/batch-prep/", json=SAMPLE_SESSION)
    sid = cr.json()["id"]
    r = client.post(f"/api/batch-prep/{sid}/tasks", json={
        "task_name": "Chop vegetables", "estimated_minutes": 20,
    })
    assert r.status_code == 201
    assert r.json()["task_name"] == "Chop vegetables"


def test_toggle_task(client):
    cr = client.post("/api/batch-prep/", json=SAMPLE_SESSION)
    sid = cr.json()["id"]
    task = client.post(f"/api/batch-prep/{sid}/tasks", json={"task_name": "Boil eggs"})
    tid = task.json()["id"]
    r = client.put(f"/api/batch-prep/{sid}/tasks/{tid}")
    assert r.status_code == 200
    assert r.json()["is_completed"] is True


# --- Completion ---

def test_complete_session(client):
    cr = client.post("/api/batch-prep/", json=SAMPLE_SESSION)
    sid = cr.json()["id"]
    r = client.post(f"/api/batch-prep/{sid}/complete?actual_duration_minutes=90")
    assert r.status_code == 200
    assert r.json()["is_completed"] is True
    assert r.json()["actual_duration_minutes"] == 90


# --- Session with tasks ---

def test_create_session_with_tasks(client):
    r = client.post("/api/batch-prep/", json={
        **SAMPLE_SESSION,
        "tasks": [
            {"task_name": "Wash produce"},
            {"task_name": "Marinate chicken"},
        ],
    })
    assert r.status_code == 201
    assert len(r.json()["tasks"]) == 2
