"""Persistent, user-editable settings for the Amazon final-restock workbook."""
from __future__ import annotations

import json
import os
from pathlib import Path
import sys
from uuid import uuid4

from shared.process_lock import interprocess_lock
from shared.repository import state_root


def data_directory() -> Path:
    return state_root() / "skill-data" / "amazon-final-restock"


def _path() -> Path:
    return data_directory() / "parameters.json"


def _read_unlocked() -> bool:
    path = _path()
    if not path.exists():
        return True
    if path.stat().st_size > 1024 * 1024:
        raise ValueError("Amazon 最终备货设置文件超过 1 MiB")
    raw = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(raw, dict) or set(raw) != {"peak_boost_enabled"} or type(raw["peak_boost_enabled"]) is not bool:
        raise ValueError("Amazon 最终备货设置格式无效")
    return raw["peak_boost_enabled"]


def _write_unlocked(enabled: bool) -> None:
    root = data_directory()
    temporary = root / f".parameters-{uuid4().hex}.tmp"
    try:
        with temporary.open("x", encoding="utf-8") as stream:
            json.dump({"peak_boost_enabled": enabled}, stream, ensure_ascii=False, indent=2)
            stream.write("\n")
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, _path())
    finally:
        temporary.unlink(missing_ok=True)


def read_state() -> dict[str, bool]:
    root = data_directory()
    root.mkdir(parents=True, exist_ok=True)
    with interprocess_lock(root / ".settings.lock"):
        enabled = _read_unlocked()
        if not _path().exists():
            _write_unlocked(enabled)
    return {"peak_boost_enabled": enabled}


def peak_boost_enabled() -> bool:
    """Read the setting for each workbook run; invalid settings fail closed."""
    return read_state()["peak_boost_enabled"]


def save_parameters(raw: object) -> dict[str, bool]:
    if not isinstance(raw, dict) or set(raw) != {"peak_boost_enabled"} or type(raw["peak_boost_enabled"]) is not bool:
        raise ValueError("peak_boost_enabled 必须是布尔值")
    root = data_directory()
    root.mkdir(parents=True, exist_ok=True)
    with interprocess_lock(root / ".settings.lock"):
        _write_unlocked(raw["peak_boost_enabled"])
    return {"peak_boost_enabled": raw["peak_boost_enabled"]}


def main(argv: list[str] | None = None) -> int:
    args = sys.argv[1:] if argv is None else argv
    # Isolated Python ignores PYTHONIOENCODING; keep Desktop JSON diagnostics UTF-8.
    for stream in (sys.stdout, sys.stderr):
        reconfigure = getattr(stream, "reconfigure", None)
        if callable(reconfigure):
            reconfigure(encoding="utf-8", errors="replace")
    try:
        if len(args) == 1 and args[0] == "read":
            data = read_state()
        elif len(args) == 2 and args[0] == "save":
            data = save_parameters(json.loads(args[1]))
        else:
            raise ValueError("用法: settings read | settings save <json>")
        print(json.dumps({"success": True, "data": data}, ensure_ascii=False))
        return 0
    except Exception as exc:  # noqa: BLE001 - private Desktop bridge returns concrete diagnostics.
        print(json.dumps({"success": False, "error": f"{type(exc).__name__}: {exc}"}, ensure_ascii=False))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
