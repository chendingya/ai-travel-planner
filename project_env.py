#!/usr/bin/env python3
"""Shared .env loading helpers for local scripts."""

from __future__ import annotations

import os
from pathlib import Path
from typing import Iterable


PROJECT_ROOT = Path(__file__).resolve().parent
DEFAULT_ENV_CANDIDATES = (
    PROJECT_ROOT / ".env",
    PROJECT_ROOT / "backend" / ".env",
)
_LOADED_KEYS: set[tuple[str, ...]] = set()


def _strip_wrapping_quotes(value: str) -> str:
    text = value.strip()
    if len(text) >= 2 and text[0] == text[-1] and text[0] in {"'", '"'}:
        return text[1:-1]
    return text


def _normalize_candidates(
    candidates: Iterable[Path] | None,
) -> tuple[Path, ...]:
    if candidates is None:
        return tuple(DEFAULT_ENV_CANDIDATES)
    return tuple(candidates)


def load_project_env(candidates: Iterable[Path] | None = None) -> None:
    normalized = _normalize_candidates(candidates)
    cache_key = tuple(str(path.resolve()) for path in normalized)
    if cache_key in _LOADED_KEYS:
        return

    for path in normalized:
        if not path.exists():
            continue
        for raw in path.read_text(encoding="utf-8").splitlines():
            line = raw.strip()
            if not line or line.startswith("#"):
                continue
            if line.startswith("export "):
                line = line[7:].strip()
            if "=" not in line:
                continue
            key, value = line.split("=", 1)
            key = key.strip()
            if not key:
                continue
            os.environ.setdefault(key, _strip_wrapping_quotes(value))

    _LOADED_KEYS.add(cache_key)


def get_env(
    name: str,
    default: str = "",
    candidates: Iterable[Path] | None = None,
) -> str:
    load_project_env(candidates=candidates)
    value = os.getenv(name)
    if value is None or value == "":
        return default
    return value


def resolve_project_path(value: str, base_dir: Path | None = None) -> str:
    if not value:
        return ""
    path = Path(value).expanduser()
    if path.is_absolute():
        return str(path)
    anchor = base_dir or PROJECT_ROOT
    return str((anchor / path).resolve())
