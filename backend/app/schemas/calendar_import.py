from typing import List, Optional

from pydantic import BaseModel


class IcsImportRequest(BaseModel):
    content: str
    category_id: Optional[int] = None
    skip_duplicates: bool = True


class ImportedEventItem(BaseModel):
    title: str
    date: str
    start_time: Optional[str] = None


class IcsImportResponse(BaseModel):
    imported: int
    skipped: int
    errors: int
    total_parsed: int
    events: List[ImportedEventItem]


class IcsPreviewItem(BaseModel):
    title: str
    date: str
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    notes: Optional[str] = None
    location: Optional[str] = None
