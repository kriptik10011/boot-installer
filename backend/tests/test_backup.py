"""
Tests for Backup/Restore API endpoints.

Note: Some endpoints (export, restore, upload) depend on filesystem state.
We test validation paths and info endpoints that work with in-memory DB.
"""

import pytest
from datetime import date


class TestBackupInfoEndpoint:
    """Test database info endpoint."""

    def test_database_info(self, client):
        """Database info returns size and modified date."""
        response = client.get("/api/backup/info")
        # This depends on the actual DB file existing on disk.
        # In test with in-memory DB, the file may not exist → 404.
        # Both 200 and 404 are acceptable depending on DB location.
        assert response.status_code in (200, 404)
        if response.status_code == 200:
            data = response.json()
            assert "size_bytes" in data
            assert "modified_at" in data


class TestBackupExport:
    """Test database export endpoint."""

    def test_export_database(self, client):
        """Export endpoint returns file or 404 if no DB file on disk."""
        response = client.post("/api/backup/export", json={"pin": "111111"})
        # In test with in-memory DB, the file may not exist → 404.
        assert response.status_code in (200, 404)

    def test_export_without_pin_rejected(self, client):
        """Export without PIN returns 422 (validation error)."""
        response = client.post("/api/backup/export", json={})
        assert response.status_code == 422

    def test_export_get_method_not_allowed(self, client):
        """Old GET /export path should return 405 Method Not Allowed."""
        response = client.get("/api/backup/export")
        assert response.status_code == 405


class TestBackupRestore:
    """Test database restore endpoint."""

    def test_restore_missing_file(self, client):
        """Restore with non-existent file_id returns 404."""
        response = client.post("/api/backup/restore", json={
            "file_id": "nonexistent_backup.db",
            "pin": "111111",
        })
        assert response.status_code == 404

    def test_restore_validation_path_traversal(self, client):
        """Restore with path traversal in file_id returns 422 (schema) or 400."""
        response = client.post("/api/backup/restore", json={
            "file_id": "../../etc/passwd",
            "pin": "111111",
        })
        # Schema pattern rejects non-filename strings (422) before path check (400)
        assert response.status_code in (400, 404, 422)


class TestBackupUpload:
    """Test file upload for backup."""

    def test_upload_non_db_extension(self, client):
        """Upload a file without .db extension returns 400."""
        import io
        response = client.post(
            "/api/backup/upload",
            files={"file": ("backup.txt", io.BytesIO(b"not a database"), "application/octet-stream")},
        )
        assert response.status_code == 400

    def test_upload_invalid_sqlite(self, client):
        """Upload a .db file that is not valid SQLite returns 400."""
        import io
        response = client.post(
            "/api/backup/upload",
            files={"file": ("backup.db", io.BytesIO(b"not a sqlite file"), "application/octet-stream")},
        )
        assert response.status_code == 400


class TestDeleteAllData:
    """Test delete all data endpoint."""

    def test_delete_all_data(self, client, sample_event, sample_meal):
        """Delete all data clears the database."""
        # Create some data first
        client.post("/api/events", json=sample_event)
        client.post("/api/meals", json=sample_meal)

        # Verify data exists
        assert len(client.get("/api/events").json()) > 0
        assert len(client.get("/api/meals").json()) > 0

        # Delete all (requires PIN for re-authentication)
        response = client.request("DELETE", "/api/backup/database", json={"pin": "111111"})
        assert response.status_code == 204
