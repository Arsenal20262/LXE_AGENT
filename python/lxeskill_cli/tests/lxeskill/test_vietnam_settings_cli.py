from __future__ import annotations

import json
import subprocess
import sys

import pytest
from openpyxl import Workbook

from lxeskill import cli
from lxeskill.business import load_catalog
from services.agent_cli.vietnam_replenishment import settings as command
from services.vietnam_replenishment import settings


COMMAND = ["vietnam", "replenishment", "settings"]


def test_settings_command_is_internal_and_hidden_from_listing(capsys):
    entry = load_catalog()["vietnam_replenishment_settings"]
    assert entry["command_path"] == COMMAND
    assert entry["visibility"] == "internal"
    assert entry["exposed"] is False
    assert entry["session_mode"] == "none"
    assert entry["owner_skills"] == []
    assert cli.main(["list"]) == 0
    result = json.loads(capsys.readouterr().out)
    assert " ".join(COMMAND) not in {item["command"] for item in result["data"]["commands"]}


@pytest.mark.parametrize("arguments", [
    {}, {"action": "invalid"}, {"action": []},
    {"action": "read", "path": "/unexpected.xlsx"},
    {"action": "save"}, {"action": "upload"}, {"action": "export", "path": "/missing-kind.xlsx"},
    *[{"action": "upload", "path": path} for path in (None, 1, "", " ", "relative.xlsx")],
])
def test_invalid_action_arguments_never_reach_storage(arguments, monkeypatch):
    def unexpected(*_args):
        pytest.fail("invalid arguments must not reach settings storage")

    for name in ("read_state", "save_parameters", "upload_map", "export_map"):
        monkeypatch.setattr(settings, name, unexpected)
    result = command.run(arguments)
    assert result["success"] is False
    assert result["error"]["code"] == "ValueError"
    assert result["error"]["message"]


def test_cli_round_trip_uses_shared_storage_and_preserves_failed_upload(tmp_path, monkeypatch):
    monkeypatch.setenv("LXE_DATA_ROOT", str(tmp_path / "app"))
    monkeypatch.setenv("LXE_WORKSPACE_ROOT", str(tmp_path))
    monkeypatch.delenv("LXE_AGENT_SESSION_ID", raising=False)

    def invoke(action, *flags, expected=0):
        child = subprocess.run(
            [sys.executable, "-I", "-B", "-m", "lxeskill", *COMMAND, "--action", action, *flags],
            capture_output=True, text=True, encoding="utf-8",
        )
        assert child.returncode == expected, child.stderr + child.stdout
        result = json.loads(child.stdout)
        assert result["type"] == "result"
        assert result["protocol_version"] == "1"
        assert result["ok"] is (expected == 0)
        return result

    parameters = invoke("read")["data"]["data"]["parameters"]
    parameters["exchange_rate"] = "4200"
    invoke("save", "--parameters", json.dumps(parameters))
    assert invoke("read")["data"]["data"]["parameters"] == parameters

    source = tmp_path / "中文 映射表.xlsx"
    book = Workbook()
    book.active.append(["SKU", "热销标记", "成本", "跨境价", "折扣价"])
    book.active.append(["001", 1, 10, 20, 15])
    book.save(source)
    book.close()
    invoke("upload", "--path", str(source))
    with settings.run_inputs() as (snapshot, config, *_):
        assert snapshot.read_bytes() == source.read_bytes()
        assert str(config.exchange_rate) == "4200"
    invalid = tmp_path / "坏表.xlsx"
    invalid.write_bytes(b"not an xlsx")
    failed = invoke("upload", "--path", str(invalid), expected=cli.EXIT_BUSINESS)
    assert "ZIP" in failed["error"]["message"]
    assert failed["error"]["message"] == failed["data"]["error"]["message"]
    output = tmp_path / "导出 当前表.xlsx"
    assert invoke("export", "--kind", "current", "--path", str(output))["data"]["data"] == {"path": str(output)}
    assert output.read_bytes() == source.read_bytes()
