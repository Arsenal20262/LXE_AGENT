"""Chat binding uses the same trusted Vietnam SKU store as Desktop management."""

from __future__ import annotations

import json
from pathlib import Path

from openpyxl import Workbook
import pytest

from lxeskill import cli as lxeskill
from lxeskill.business import load_catalog
from services.agent_cli.vietnam_replenishment import bind_sku
from services.agent_cli.vietnam_replenishment import probe_sku
from services.vietnam_replenishment import workflow
from services.vietnam_replenishment.sku_map_store import SkuMapStoreError, inspect_sku_map
from services.vietnam_replenishment import sku_map_store


COMMAND = ["vietnam", "sku", "bind"]
PROBE_COMMAND = ["vietnam", "sku", "probe"]


def _map(path: Path, price: int) -> Path:
    book = Workbook()
    book.active.append(("SKU", "成本", "跨境价", "折扣价", "热销标记"))
    book.active.append(("VN-A", 0, price, 15, None))
    book.save(path)
    book.close()
    return path


def _result(capsys) -> dict:
    events = [json.loads(line) for line in capsys.readouterr().out.splitlines() if line.strip()]
    return next(event for event in reversed(events) if event["type"] == "result")


def test_internal_probe_catalog_contract() -> None:
    entry = load_catalog()["vietnam_replenishment_probe_sku"]
    assert entry["module"] == "services.agent_cli.vietnam_replenishment.probe_sku"
    assert entry["command_path"] == PROBE_COMMAND
    assert entry["visibility"] == "internal"
    assert entry["exposed"] is False
    assert entry["preselection_probe"] is True
    assert entry["owner_skills"] == []
    assert entry["input_schema"]["required"] == ["source_path"]
    assert "x-lxe-file-input" not in entry["input_schema"]["properties"]["source_path"]
    assert not entry.get("artifact_paths")


@pytest.mark.parametrize("matches", [True, False])
def test_internal_probe_returns_only_boolean_without_mutating_store(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, capsys, matches: bool,
) -> None:
    monkeypatch.setenv("LXE_DATA_ROOT", str(tmp_path / "state"))
    source = _map(tmp_path / "synthetic.xlsx", 20) if matches else tmp_path / "other.xlsx"
    if not matches:
        book = Workbook()
        book.active.append(("仓库", "SKU", "库存数量"))
        book.save(source)
        book.close()

    def unexpected_full_load(_path: str | Path) -> dict:
        raise AssertionError("probe must not parse SKU rows")

    monkeypatch.setattr(sku_map_store, "validate_usable_sku_parameters", unexpected_full_load)
    assert lxeskill.main([*PROBE_COMMAND, "--source-path", str(source)]) == 0
    result = _result(capsys)
    assert result["ok"] is True
    assert result["data"] == {"success": True, "matches": matches}
    assert result["files"] == []
    assert source.name not in json.dumps(result)
    assert list(tmp_path.rglob("manifest.json")) == []


@pytest.mark.parametrize(
    "case", ["bad_zip", "symlink", "oversize", "too_many_zip_members", "zip_expansion"]
)
def test_internal_probe_rejects_unsafe_input_without_store_changes(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, capsys, case: str,
) -> None:
    monkeypatch.setenv("LXE_DATA_ROOT", str(tmp_path / "state"))
    source = tmp_path / "synthetic.xlsx"
    if case == "bad_zip":
        source.write_bytes(b"not an xlsx archive")
    elif case == "symlink":
        target = _map(tmp_path / "target.xlsx", 20)
        source.symlink_to(target)
    elif case == "oversize":
        with source.open("wb") as output:
            output.truncate(sku_map_store.MAX_COMPRESSED + 1)
    else:
        _map(source, 20)
        if case == "too_many_zip_members":
            monkeypatch.setattr(sku_map_store, "MAX_MEMBERS", 1)
        else:
            monkeypatch.setattr(sku_map_store, "MAX_UNCOMPRESSED", 1)

    def unexpected_headers(_path: Path) -> bool:
        raise AssertionError("unsafe workbook must be rejected before header read")

    monkeypatch.setattr(sku_map_store, "has_sku_parameter_headers", unexpected_headers)

    assert lxeskill.main([*PROBE_COMMAND, "--source-path", str(source)]) == lxeskill.EXIT_BUSINESS
    result = _result(capsys)
    assert result["ok"] is False
    assert result["files"] == []
    assert str(source) not in json.dumps(result)
    assert source.name not in json.dumps(result)
    assert list(tmp_path.rglob("manifest.json")) == []


def test_internal_probe_rejects_relative_path_without_file_access(capsys) -> None:
    assert lxeskill.main([*PROBE_COMMAND, "--source-path", "relative.xlsx"]) == lxeskill.EXIT_BUSINESS
    result = _result(capsys)
    assert result["data"]["error"]["code"] == "invalid_arguments"
    assert result["files"] == []


def test_internal_probe_redacts_path_and_configured_secret(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, capsys,
) -> None:
    source = tmp_path / "synthetic.xlsx"
    monkeypatch.setenv("LXE_YACANG_PASSWORD", "synthetic-probe-canary")

    def failing_probe(_path: Path) -> bool:
        raise SkuMapStoreError(f"failed at {source}: synthetic-probe-canary")

    monkeypatch.setattr(probe_sku, "probe_sku_map", failing_probe)
    assert lxeskill.main([*PROBE_COMMAND, "--source-path", str(source)]) == lxeskill.EXIT_BUSINESS
    result = _result(capsys)
    encoded = json.dumps(result)
    assert "failed at" in encoded
    assert "[source_path]" in encoded
    assert "[REDACTED]" in encoded
    assert str(source) not in encoded
    assert "synthetic-probe-canary" not in encoded


def test_catalog_exposes_only_a_chat_file_input() -> None:
    entry = load_catalog()["vietnam_replenishment_bind_sku"]
    assert entry["module"] == "services.agent_cli.vietnam_replenishment.bind_sku"
    assert entry["command_path"] == COMMAND
    assert entry["visibility"] == "business"
    assert entry["session_mode"] == "none"
    assert entry["owner_skills"] == ["vietnam-stock-recommendation"]
    assert entry["exposed"] is True
    assert entry["input_schema"]["required"] == ["source_path"]
    assert entry["input_schema"]["additionalProperties"] is False
    source = entry["input_schema"]["properties"]["source_path"]
    assert source["x-lxe-file-input"]["accepted_extensions"] == [".xlsx"]
    assert "x-lxe-asset-slot" not in source
    assert not entry.get("artifact_paths")


def test_bind_installs_reuses_and_replaces_without_calling_yacang(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, capsys,
) -> None:
    monkeypatch.setenv("LXE_DATA_ROOT", str(tmp_path / "state"))

    def unexpected_export() -> None:
        raise AssertionError("binding must not export Yacang data")

    monkeypatch.setattr(workflow, "export_vietnam_sources", unexpected_export)
    first_path = _map(tmp_path / "first.xlsx", 20)
    second_path = _map(tmp_path / "second.xlsx", 25)

    assert lxeskill.main([*COMMAND, "--source-path", str(first_path)]) == 0
    first = _result(capsys)
    first_revision = first["data"]["manifest_revision"]
    assert first["ok"] is True
    assert first["data"]["success"] is True
    assert first["data"]["status"] == "installed"
    assert first["files"] == []
    assert inspect_sku_map().current.file_name == first_path.name
    assert inspect_sku_map().previous is None

    assert lxeskill.main([*COMMAND, "--source-path", str(first_path)]) == 0
    unchanged = _result(capsys)
    assert unchanged["data"]["status"] == "unchanged"
    assert unchanged["data"]["manifest_revision"] == first_revision
    assert inspect_sku_map().previous is None

    assert lxeskill.main([*COMMAND, "--source-path", str(second_path)]) == 0
    replaced = _result(capsys)
    assert replaced["data"]["status"] == "installed"
    assert replaced["data"]["manifest_revision"] != first_revision
    assert replaced["files"] == []
    status = inspect_sku_map()
    assert status.current.file_name == second_path.name
    assert status.previous.file_name == first_path.name


def test_bad_zip_and_corrupt_manifest_preserve_current(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, capsys,
) -> None:
    monkeypatch.setenv("LXE_DATA_ROOT", str(tmp_path / "state"))
    first_path = _map(tmp_path / "first.xlsx", 20)
    assert lxeskill.main([*COMMAND, "--source-path", str(first_path)]) == 0
    _result(capsys)
    before = inspect_sku_map()

    bad_path = tmp_path / "bad.xlsx"
    bad_path.write_bytes(b"not a zip archive")
    assert lxeskill.main([*COMMAND, "--source-path", str(bad_path)]) == lxeskill.EXIT_BUSINESS
    bad = _result(capsys)
    assert bad["ok"] is False
    assert "BadZipFile" in bad["data"]["error"]["message"]
    assert bad["files"] == []
    after = inspect_sku_map()
    assert after.revision == before.revision
    assert after.current.file_name == first_path.name

    manifest = before.current.path.parent.parent / "manifest.json"
    manifest.write_text("{broken", encoding="utf-8")
    assert lxeskill.main([*COMMAND, "--source-path", str(first_path)]) == lxeskill.EXIT_BUSINESS
    corrupt = _result(capsys)
    assert corrupt["ok"] is False
    assert "映射表清单无法读取" in corrupt["data"]["error"]["message"]
    assert manifest.read_text(encoding="utf-8") == "{broken"
    assert before.current.path.exists()


def test_rejects_relative_path_and_extra_option_before_store_access(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, capsys,
) -> None:
    monkeypatch.setenv("LXE_DATA_ROOT", str(tmp_path / "state"))

    def unexpected_inspect() -> None:
        raise AssertionError("invalid CLI input must not access the store")

    monkeypatch.setattr(bind_sku, "inspect_sku_map", unexpected_inspect)
    assert lxeskill.main([*COMMAND, "--source-path", "relative.xlsx"]) == lxeskill.EXIT_BUSINESS
    relative = _result(capsys)
    assert relative["data"]["error"]["code"] == "invalid_arguments"
    assert "绝对" in relative["data"]["error"]["message"]

    assert lxeskill.main([
        *COMMAND, "--source-path", str(tmp_path / "good.xlsx"), "--slot", "other",
    ]) == lxeskill.EXIT_USAGE
    extra = _result(capsys)
    assert "unknown option" in extra["error"]["message"]


def test_revision_conflict_is_reported_once_without_retry(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, capsys,
) -> None:
    monkeypatch.setenv("LXE_DATA_ROOT", str(tmp_path / "state"))
    source = _map(tmp_path / "first.xlsx", 20)
    calls: list[str | None] = []

    def conflicting_install(_source: Path, expected_revision: str | None):
        calls.append(expected_revision)
        raise SkuMapStoreError("映射表已变化，请刷新后重试")

    monkeypatch.setattr(bind_sku, "install_sku_map", conflicting_install)
    assert lxeskill.main([*COMMAND, "--source-path", str(source)]) == lxeskill.EXIT_BUSINESS
    conflict = _result(capsys)
    assert conflict["ok"] is False
    assert "映射表已变化" in conflict["data"]["error"]["message"]
    assert calls == [None]
    assert inspect_sku_map().current is None


def test_missing_source_gives_upload_recovery(capsys) -> None:
    assert lxeskill.main(COMMAND) == lxeskill.EXIT_USAGE
    result = _result(capsys)
    assert result["ok"] is False
    assert result["recovery"]["field"] == "source_path"
    assert result["recovery"]["accepted_extensions"] == [".xlsx"]


def test_store_error_redacts_configured_secrets(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, capsys,
) -> None:
    monkeypatch.setenv("LXE_DATA_ROOT", str(tmp_path / "state"))
    monkeypatch.setenv("LXE_YACANG_PASSWORD", "synthetic-test-canary")
    source = _map(tmp_path / "first.xlsx", 20)

    def unexpected_install(_source: Path, _expected_revision: str | None):
        raise SkuMapStoreError("synthetic-test-canary")

    monkeypatch.setattr(bind_sku, "install_sku_map", unexpected_install)
    assert lxeskill.main([*COMMAND, "--source-path", str(source)]) == lxeskill.EXIT_BUSINESS
    result = _result(capsys)
    assert "[REDACTED]" in result["data"]["error"]["message"]
    assert "synthetic-test-canary" not in json.dumps(result)
