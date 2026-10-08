"""SKU workbook validation and read-only migration of the former version store."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
import hashlib
import json
import os
from pathlib import Path
import re
import stat
from zipfile import BadZipFile, ZipFile

from services.yacang.errors import safe_remote_detail

from .asset_contract import (
    AssetContractError,
    validate_usable_sku_parameters,
)


SKU_SLOT = "vietnam_sku_parameter_map"
MAX_COMPRESSED = 20 * 1024 * 1024
MAX_UNCOMPRESSED = 100 * 1024 * 1024
MAX_MEMBERS = 1000
REVISION_RE = re.compile(r"^[0-9a-f]{32}$")
_DIGEST_RE = re.compile(r"^[0-9a-f]{64}$")
_MANIFEST_NAME = "manifest.json"


class SkuMapStoreError(RuntimeError):
    """The SKU map cannot be read or changed safely."""


@dataclass(frozen=True)
class _VersionRecord:
    id: str
    file_name: str
    sha256: str
    size_bytes: int
    uploaded_at: str


@dataclass(frozen=True)
class _Manifest:
    revision: str
    current: _VersionRecord | None
    previous: _VersionRecord | None


def _diagnostic(exc: BaseException) -> str:
    secrets = tuple(
        os.environ.get(name, "")
        for name in ("LXE_YACANG_MOBILE", "LXE_YACANG_PASSWORD")
    )
    return safe_remote_detail(f"{type(exc).__name__}: {exc}", secrets=secrets, limit=2000)


def _is_reparse(path: Path, info: os.stat_result) -> bool:
    flag = getattr(stat, "FILE_ATTRIBUTE_REPARSE_POINT", 0x400)
    return path.is_symlink() or bool(getattr(info, "st_file_attributes", 0) & flag)


def _existing_info(path: Path) -> os.stat_result | None:
    try:
        return path.lstat()
    except FileNotFoundError:
        return None


def _safe_directory(path: Path, *, create: bool = False) -> bool:
    info = _existing_info(path)
    if info is None:
        if not create:
            return False
        path.mkdir(parents=True, exist_ok=True)
        info = path.lstat()
    if _is_reparse(path, info) or not stat.S_ISDIR(info.st_mode):
        raise SkuMapStoreError(f"受控映射表目录不是普通目录: {path}")
    return True


def _safe_regular(path: Path, *, label: str) -> os.stat_result:
    info = _existing_info(path)
    if info is None:
        raise SkuMapStoreError(f"{label}缺失: {path}")
    if _is_reparse(path, info) or not stat.S_ISREG(info.st_mode):
        raise SkuMapStoreError(f"{label}不是普通文件: {path}")
    return info


def _digest(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for block in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def _safe_file_name(value: object) -> str:
    if (
        not isinstance(value, str)
        or not value
        or len(value) > 255
        or value in (".", "..")
        or "/" in value
        or "\\" in value
        or any(ord(char) < 32 for char in value)
        or not value.lower().endswith(".xlsx")
    ):
        raise SkuMapStoreError("映射表清单包含无效文件名")
    return value


def _record_from_json(raw: object, label: str) -> _VersionRecord | None:
    if raw is None:
        return None
    if not isinstance(raw, dict) or set(raw) != {
        "id", "file_name", "sha256", "size_bytes", "uploaded_at"
    }:
        raise SkuMapStoreError(f"映射表清单 {label} 结构无效")
    version_id = raw["id"]
    sha256 = raw["sha256"]
    size = raw["size_bytes"]
    stamp = raw["uploaded_at"]
    if not isinstance(version_id, str) or not REVISION_RE.fullmatch(version_id):
        raise SkuMapStoreError(f"映射表清单 {label} 版本 ID 无效")
    if not isinstance(sha256, str) or not _DIGEST_RE.fullmatch(sha256):
        raise SkuMapStoreError(f"映射表清单 {label} 摘要无效")
    if type(size) is not int or size < 0 or size > MAX_COMPRESSED:
        raise SkuMapStoreError(f"映射表清单 {label} 大小无效")
    if not isinstance(stamp, str):
        raise SkuMapStoreError(f"映射表清单 {label} 时间无效")
    try:
        parsed = datetime.fromisoformat(stamp)
    except ValueError as exc:
        raise SkuMapStoreError(f"映射表清单 {label} 时间无效: {exc}") from exc
    if parsed.tzinfo is None:
        raise SkuMapStoreError(f"映射表清单 {label} 时间缺少时区")
    return _VersionRecord(version_id, _safe_file_name(raw["file_name"]), sha256, size, stamp)


def _read_manifest_strict(root: Path) -> _Manifest | None:
    path = root / _MANIFEST_NAME
    if _existing_info(path) is None:
        return None
    info = _safe_regular(path, label="映射表清单")
    if info.st_size > 64 * 1024:
        raise SkuMapStoreError("映射表清单超过 64 KiB")
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError) as exc:
        raise SkuMapStoreError(f"映射表清单无法读取: {_diagnostic(exc)}") from exc
    if not isinstance(raw, dict) or set(raw) != {"schema_version", "revision", "current", "previous"}:
        raise SkuMapStoreError("映射表清单结构无效")
    if type(raw["schema_version"]) is not int or raw["schema_version"] != 1:
        raise SkuMapStoreError("映射表清单版本无效")
    revision = raw["revision"]
    if not isinstance(revision, str) or not REVISION_RE.fullmatch(revision):
        raise SkuMapStoreError("映射表清单 revision 无效")
    current = _record_from_json(raw["current"], "current")
    previous = _record_from_json(raw["previous"], "previous")
    if current is None and previous is None:
        raise SkuMapStoreError("映射表清单没有有效版本指针")
    if current and previous and current.id == previous.id:
        raise SkuMapStoreError("映射表清单版本指针重复")
    return _Manifest(revision, current, previous)


def _check_zip(path: Path) -> None:
    try:
        with ZipFile(path) as archive:
            members = archive.infolist()
            if len(members) > MAX_MEMBERS:
                raise SkuMapStoreError(f"映射表 ZIP 条目超过 {MAX_MEMBERS} 个")
            uncompressed = 0
            for member in members:
                if member.flag_bits & 1:
                    raise SkuMapStoreError("映射表 ZIP 包含加密条目")
                uncompressed += member.file_size
                if uncompressed > MAX_UNCOMPRESSED:
                    raise SkuMapStoreError("映射表声明解压大小超过 100 MiB")
            if not members:
                raise SkuMapStoreError("映射表 ZIP 没有工作簿条目")
    except (BadZipFile, OSError, ValueError) as exc:
        raise SkuMapStoreError(f"映射表 ZIP 无法读取: {_diagnostic(exc)}") from exc


def _validate_file(path: Path, *, label: str) -> tuple[int, str]:
    info = _safe_regular(path, label=label)
    if info.st_size > MAX_COMPRESSED:
        raise SkuMapStoreError(f"{label}超过 20 MiB")
    if info.st_size == 0:
        raise SkuMapStoreError(f"{label}为空")
    if path.suffix.lower() != ".xlsx":
        raise SkuMapStoreError(f"{label}必须是 .xlsx 文件")
    _check_zip(path)
    try:
        validate_usable_sku_parameters(path)
    except AssetContractError as exc:
        raise SkuMapStoreError(str(exc)) from exc
    return info.st_size, _digest(path)

def legacy_current_path(root: Path) -> Path | None:
    """Read only the old current pointer; never recover from previous implicitly."""
    if not _safe_directory(root):
        return None
    manifest = _read_manifest_strict(root)
    if manifest is None or manifest.current is None:
        return None
    record = manifest.current
    _safe_directory(root / "versions")
    path = root / "versions" / f"{record.id}.xlsx"
    size, digest = _validate_file(path, label="旧映射表当前版本")
    if size != record.size_bytes or digest != record.sha256:
        raise SkuMapStoreError("旧映射表当前版本与清单不一致，请重新上传")
    return path


validate_sku_map = _validate_file
