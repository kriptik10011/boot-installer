from pydantic import BaseModel, Field


class BackupInfo(BaseModel):
    filename: str
    created_at: str
    size_bytes: int


class ExportRequest(BaseModel):
    pin: str = Field(..., min_length=4, max_length=16, pattern=r'^\d+$')  # Re-authenticate for sensitive ops


class RestoreRequest(BaseModel):
    file_id: str = Field(max_length=255, pattern=r'^[\w_.-]+\.db$')  # Opaque file identifier from upload response
    pin: str = Field(..., min_length=4, max_length=16, pattern=r'^\d+$')  # Re-authenticate for destructive ops


class UploadResponse(BaseModel):
    file_id: str  # Opaque identifier, not filesystem path
    filename: str
    size_bytes: int


class RestoreResponse(BaseModel):
    status: str
    message: str


class DatabaseInfoResponse(BaseModel):
    size_bytes: int
    modified_at: str


class DeleteRequest(BaseModel):
    pin: str = Field(..., min_length=4, max_length=16, pattern=r'^\d+$')  # Re-authenticate for destructive ops


class DeleteResponse(BaseModel):
    status: str
    message: str
    tables_cleared: int
