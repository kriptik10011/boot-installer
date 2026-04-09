from pydantic import BaseModel, Field


class CreateUserRequest(BaseModel):
    username: str = Field(..., min_length=1, max_length=32)
    pin: str = Field(..., min_length=4, max_length=16)


class UserResponse(BaseModel):
    id: str
    username: str


class LoginRequest(BaseModel):
    user_id: str
    pin: str = Field(..., min_length=4, max_length=16)


class LoginResponse(BaseModel):
    token: str
    user_id: str
    username: str


class SessionStatusResponse(BaseModel):
    status: str
    user_id: str
