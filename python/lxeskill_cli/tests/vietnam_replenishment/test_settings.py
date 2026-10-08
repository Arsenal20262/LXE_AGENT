from __future__ import annotations

from dataclasses import replace
from decimal import Decimal
import hashlib
import json
from pathlib import Path
import subprocess
import sys

from openpyxl import Workbook
import pytest

from services.vietnam_replenishment import settings, workflow
from services.vietnam_replenishment.asset_contract import load_sku_parameters
from services.vietnam_replenishment.workbook import RecommendationConfig


@pytest.fixture(autouse=True)
def isolated(tmp_path, monkeypatch):
    monkeypatch.setenv("LXE_DATA_ROOT", str(tmp_path / "app"))
    monkeypatch.setenv("LXE_WORKSPACE_ROOT", str(tmp_path))
    from shared import workspace
    monkeypatch.setattr(workspace, "_workspace_root", tmp_path)


def sku_map(path: Path, cost=10):
    book = Workbook()
    book.active.append(["SKU", "成本", "跨境价", "折扣价", "热销标记"])
    book.active.append(["VN-A", cost, 30, None, 1])
    book.save(path)
    book.close()
    return path


def test_defaults_persist_and_reload_in_another_process():
    state = settings.read_state()
    assert state["parameters"] == settings.config_json(RecommendationConfig())
    assert state["sku_map"] is None
    raw = {**state["parameters"], "exchange_rate": "4100", "sales_weight_7d": "1", "sales_weight_15d": "0", "sales_weight_30d": "0"}
    settings.save_parameters(raw)
    child = subprocess.run([sys.executable, "-I", "-B", "-m", "services.vietnam_replenishment.settings", "read"], capture_output=True, text=True)
    assert child.returncode == 0, child.stderr
    assert json.loads(child.stdout)["data"]["parameters"] == raw


@pytest.mark.parametrize("change", [
    {"sales_weight_7d": "0.5"}, {"sales_weight_7d": "-0.1"}, {"exchange_rate": "0"},
    {"day_adjustment_15d": "-1"}, {"day_adjustment_7d": "NaN"}, {"exchange_rate": "1e9999999999"},
    {"exchange_rate": "1e-9999"}, {"exchange_rate": "0.1234567890123456"}, {"sales_weight_7d": 0.6},
    {"extra": "1"},
])
def test_invalid_save_preserves_previous_file(change):
    old = settings.read_state()["parameters"]
    file = settings.data_directory() / "parameters.json"
    before = file.read_bytes()
    with pytest.raises((ValueError, ArithmeticError)):
        settings.save_parameters({**old, **change})
    assert file.read_bytes() == before


def test_corrupt_existing_configuration_is_reported_not_reset():
    settings.read_state()
    file = settings.data_directory() / "parameters.json"
    file.write_text("{broken")
    state = settings.read_state()
    assert "JSONDecodeError" in state["parameters_error"]
    assert state["parameters"] is None
    assert file.read_text() == "{broken"


def test_upload_is_atomic_and_failed_replacement_keeps_file(tmp_path):
    source = sku_map(tmp_path / "first.xlsx")
    state = settings.upload_map(source)
    target = Path(state["sku_map"]["path"])
    before = target.read_bytes()
    bad = tmp_path / "bad.xlsx"
    bad.write_bytes(b"not a zip")
    with pytest.raises(RuntimeError, match="ZIP"):
        settings.upload_map(bad)
    assert target.read_bytes() == before
    state = settings.upload_map(sku_map(tmp_path / "second.xlsx", cost=12))
    assert load_sku_parameters(target)["VN-A"].cost == Decimal(12)
    assert state["sku_map"]["updated_at"]
    assert sorted(path.name for path in target.parent.glob("*.xlsx")) == ["sku-map.xlsx"]


def test_explicit_file_overrides_saved_without_changing_it_and_snapshot_is_stable(tmp_path):
    settings.upload_map(sku_map(tmp_path / "saved.xlsx", cost=10))
    explicit = sku_map(tmp_path / "explicit.xlsx", cost=20)
    with settings.run_inputs("explicit.xlsx") as (snapshot, config, _, source):
        assert source == str(explicit)
        assert load_sku_parameters(snapshot)["VN-A"].cost == Decimal(20)
        settings.save_parameters(settings.config_json(replace(config, exchange_rate=Decimal(4200))))
        settings.upload_map(sku_map(tmp_path / "replacement.xlsx", cost=30))
        explicit.write_bytes(b"changed after snapshot")
        assert load_sku_parameters(snapshot)["VN-A"].cost == Decimal(20)
        assert config.exchange_rate == Decimal(3900)
    assert not snapshot.exists()
    with settings.run_inputs() as (snapshot, config, _, source):
        assert load_sku_parameters(snapshot)["VN-A"].cost == Decimal(30)
        assert config.exchange_rate == Decimal(4200)
        assert source.endswith("sku-map.xlsx")


def test_bad_explicit_path_does_not_fall_back_or_start_erp(tmp_path, monkeypatch):
    settings.upload_map(sku_map(tmp_path / "valid.xlsx"))
    monkeypatch.setattr(workflow, "export_vietnam_sources", lambda: pytest.fail("ERP must not run"))
    with pytest.raises(workflow.VietnamWorkflowError, match="missing.xlsx"):
        workflow.generate_current_vietnam_recommendation(str(tmp_path / "missing.xlsx"))


def test_invalid_configuration_stops_before_erp(tmp_path, monkeypatch):
    settings.upload_map(sku_map(tmp_path / "valid.xlsx"))
    path = settings.data_directory() / "parameters.json"
    path.write_text('{"exchange_rate":"0"}')
    monkeypatch.setattr(workflow, "export_vietnam_sources", lambda: pytest.fail("ERP must not run"))
    with pytest.raises(ValueError):
        workflow.generate_current_vietnam_recommendation()


def legacy_state(tmp_path):
    app = tmp_path / "app"
    (app / "config").mkdir(parents=True)
    (app / "config" / "settings.json").write_text(json.dumps({"vietnam_recommendation": {
        "weight_7d": "0.1", "weight_15d": "0.6", "weight_30d": "0.7", "exchange_rate": "4000"}}))
    root = app / "inputs" / "vietnam" / "sku_parameter_map"
    (root / "versions").mkdir(parents=True)
    source = sku_map(root / "versions" / ("a" * 32 + ".xlsx"))
    record = {"id": "a" * 32, "file_name": "old.xlsx", "size_bytes": source.stat().st_size,
              "sha256": hashlib.sha256(source.read_bytes()).hexdigest(), "uploaded_at": "2026-10-01T00:00:00+00:00"}
    (root / "manifest.json").write_text(json.dumps({"schema_version": 1, "revision": "b" * 32, "current": record, "previous": None}))
    return source


def test_migration_preserves_legacy_and_never_overwrites_new_state(tmp_path):
    source = legacy_state(tmp_path)
    state = settings.read_state()
    assert state["parameters"]["day_adjustment_7d"] == "0.1"
    assert state["parameters"]["sales_weight_7d"] == "0.6"
    assert state["parameters"]["exchange_rate"] == "4000"
    assert Path(state["sku_map"]["path"]).read_bytes() == source.read_bytes()
    settings.save_parameters(settings.config_json(RecommendationConfig()))
    settings.upload_map(sku_map(tmp_path / "new.xlsx", cost=30))
    source.write_bytes(b"legacy corrupted after migration")
    state = settings.read_state()
    assert state["parameters"]["exchange_rate"] == "3900"
    assert load_sku_parameters(Path(state["sku_map"]["path"]))["VN-A"].cost == Decimal(30)
    assert source.exists()


def test_broken_legacy_current_is_reported_and_upload_can_repair(tmp_path):
    source = legacy_state(tmp_path)
    source.write_bytes(b"broken")
    state = settings.read_state()
    assert "ZIP" in state["sku_map_error"]
    assert state["sku_map"] is None
    state = settings.upload_map(sku_map(tmp_path / "replacement.xlsx"))
    assert state["sku_map_error"] is None
    assert source.read_bytes() == b"broken"
