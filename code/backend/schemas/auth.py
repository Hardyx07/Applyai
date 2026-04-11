from pydantic import BaseModel, Field


class RegisterRequest(BaseModel):
    email: str = Field(min_length=5, max_length=255)
    full_name: str = Field(min_length=2, max_length=255)
    password: str = Field(min_length=8, max_length=128)


class LoginRequest(BaseModel):
    email: str = Field(min_length=5, max_length=255)
    password: str = Field(min_length=8, max_length=128)


class RefreshRequest(BaseModel):
    refresh_token: str = Field(min_length=20)


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class ValidateKeysRequest(BaseModel):
    gemini_api_key: str = Field(min_length=10)
    cohere_api_key: str = Field(min_length=10)


class ValidateKeysResponse(BaseModel):
    gemini_valid: bool
    cohere_valid: bool
    detail: str


class SaveKeysRequest(BaseModel):
    gemini_api_key: str = Field(min_length=10)
    cohere_api_key: str = Field(min_length=10)


class SaveKeysResponse(BaseModel):
    gemini_valid: bool
    cohere_valid: bool
    saved: bool
    detail: str


class SavedKeysResponse(BaseModel):
    gemini_api_key: str | None = None
    cohere_api_key: str | None = None
    has_saved_keys: bool
