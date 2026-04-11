from functools import lru_cache

from cryptography.fernet import Fernet, InvalidToken

from core.config import get_settings


@lru_cache
def _fernet() -> Fernet:
    settings = get_settings()
    return Fernet(settings.ENCRYPTION_KEY.encode())


def encrypt_value(raw_value: str) -> str:
    return _fernet().encrypt(raw_value.encode()).decode()


def decrypt_value(encrypted_value: str) -> str:
    try:
        return _fernet().decrypt(encrypted_value.encode()).decode()
    except InvalidToken as exc:
        raise ValueError("Unable to decrypt value.") from exc
