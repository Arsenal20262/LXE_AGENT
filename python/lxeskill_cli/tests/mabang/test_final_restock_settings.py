from __future__ import annotations

import json

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
