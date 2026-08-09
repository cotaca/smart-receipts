from functools import lru_cache
from pathlib import Path
from typing import Protocol

from backend.core.config import settings


class StorageBackend(Protocol):
    def save(self, key: str, content: bytes, content_type: str) -> None: ...
    def read(self, key: str) -> bytes: ...
    def delete(self, key: str) -> None: ...


class LocalStorageBackend:
    def __init__(self, base_path: Path) -> None:
        self._base_path = base_path
        self._base_path.mkdir(parents=True, exist_ok=True)

    def _resolve(self, key: str) -> Path:
        return self._base_path / key

    def save(self, key: str, content: bytes, content_type: str) -> None:
        path = self._resolve(key)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(content)

    def read(self, key: str) -> bytes:
        return self._resolve(key).read_bytes()

    def delete(self, key: str) -> None:
        self._resolve(key).unlink(missing_ok=True)


@lru_cache
def get_storage_backend() -> StorageBackend:
    if settings.storage_backend == "local":
        return LocalStorageBackend(Path(settings.storage_local_path))
    raise ValueError(f"Unknown storage backend: {settings.storage_backend}")
