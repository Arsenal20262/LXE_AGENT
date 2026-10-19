from __future__ import annotations

import json
import os
import subprocess
import sys

import pytest

from services.mabang.amazon.fba import final_restock_settings as settings


@pytest.fixture(autouse=True)
def isolated(tmp_path, monkeypatch):
    monkeypatch.setenv("LXE_DATA_ROOT", str(tmp_path / "app"))


def test_default_is_on_and_persists_across_reads():
    assert settings.read_state() == {"peak_boost_enabled": True}
    assert settings.peak_boost_enabled() is True
    assert json.loads((settings.data_directory() / "parameters.json").read_text()) == {"peak_boost_enabled": True}


def test_saved_setting_is_used_by_next_read():
    assert settings.save_parameters({"peak_boost_enabled": False}) == {"peak_boost_enabled": False}
    assert settings.peak_boost_enabled() is False


@pytest.mark.parametrize("raw", [None, {}, {"peak_boost_enabled": 1}, {"peak_boost_enabled": "false"}, {"peak_boost_enabled": True, "extra": False}])
def test_invalid_setting_is_rejected(raw):
    with pytest.raises(ValueError):
        settings.save_parameters(raw)


def test_corrupt_saved_setting_fails_instead_of_silently_defaulting():
    settings.read_state()
    path = settings.data_directory() / "parameters.json"
    path.write_text('{"peak_boost_enabled": "false"}', encoding="utf-8")
    with pytest.raises(ValueError, match="格式无效"):
        settings.peak_boost_enabled()


def test_private_command_reads_default_and_saves_setting():
    module = "services.mabang.amazon.fba.final_restock_settings"
    read = subprocess.run([sys.executable, "-I", "-B", "-m", module, "read"], capture_output=True, text=True, env=os.environ.copy())
    assert read.returncode == 0, read.stderr
    assert json.loads(read.stdout)["data"] == {"peak_boost_enabled": True}
    save = subprocess.run([sys.executable, "-I", "-B", "-m", module, "save", '{"peak_boost_enabled":false}'], capture_output=True, text=True, env=os.environ.copy())
    assert save.returncode == 0, save.stderr
    assert json.loads(save.stdout)["data"] == {"peak_boost_enabled": False}


def test_private_command_returns_utf8_error_with_non_utf8_stdout():
    # Reproduce Windows legacy stdout without requiring a Windows host.
    script = (
        "import runpy, sys; sys.stdout.reconfigure(encoding='cp1252'); "
        "sys.argv=['settings', 'save', '{}']; "
        "runpy.run_module('services.mabang.amazon.fba.final_restock_settings', run_name='__main__')"
    )
    result = subprocess.run([sys.executable, "-I", "-B", "-c", script], capture_output=True)
    assert result.returncode == 1
    error = json.loads(result.stdout.decode("utf-8"))
    assert error == {"success": False, "error": "ValueError: peak_boost_enabled 必须是布尔值"}
    assert result.stderr == b""
