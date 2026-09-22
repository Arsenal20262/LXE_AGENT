from __future__ import annotations

import asyncio
from pathlib import Path

from lxeskill.business import load_catalog
from services.agent_cli.shangman import _workflow, goods_export_preview, goods_export_run
from services.shangman.goods_export import CaptchaChannelUnavailable, CaptchaInputExpired, ShangmanAuthError
from shared.repository import repository_root


GOODS_PARAMS = {
    "platform": "智慧",
    "country": "印尼",
    "operation": "goods_export",
}


def test_skill_contract_maps_all_supported_wording_to_one_goods_export() -> None:
    text = (
        repository_root()
        / "skills"
        / "shangman-goods-export-workflow-map"
        / "SKILL.md"
    ).read_text(encoding="utf-8")

    for phrase in [
        "智慧商品",
        "销量",
        "库存",
        "库存加销量",
        "入库时间",
        "上架时间",
        "月末库存",
        "月末快照",
        "7/14/30/90 天销量",
        "90 天日度销量",
        "最近一个月销量",
        "智慧库存和销量",
        "智慧销量、库存和上架时间",
    ]:
        assert phrase in text
    assert text.count(
        'lxeskill shangman export run --params \'{"platform":"智慧","country":"印尼","operation":"goods_export"}\''
    ) == 1
    assert "不得按指标或周期拆成多次调用" in text
    assert "不再次调用 `run`" in text
    assert "不用于雅仓、智汇/TMS 或马帮" in text


def test_preview_is_deterministic_and_does_not_construct_client(monkeypatch) -> None:
    def fail_constructor(*args, **kwargs):
        raise AssertionError("preview must not construct an HTTP client")

    monkeypatch.setattr(goods_export_preview, "ShangmanClient", fail_constructor, raising=False)

    first = goods_export_preview.run({"params": GOODS_PARAMS})
    second = goods_export_preview.run({"params": GOODS_PARAMS})

    assert first == second
    assert first["success"] is True
    assert first["status"] == "ready"
    assert first["params"] == GOODS_PARAMS
    assert first["intent"]["type"] == "goods-export"
    assert first["plan"] == {
        "type": "goods-export",
        "tasks": [{"type": "goods-export", "params": GOODS_PARAMS}],
        "source_notice": "该文件保留平台原始商品导出字段，不包含逐日销量、14天销量或历史月末快照。",
    }


def test_catalog_exposes_only_structured_params_for_both_public_commands() -> None:
    catalog = load_catalog()
    entries = [
        catalog["shangman_goods_export_preview"],
        catalog["shangman_goods_export_run"],
    ]

    assert [entry["command_path"] for entry in entries] == [
        ["shangman", "export", "preview"],
        ["shangman", "export", "run"],
    ]
    assert all(entry["owner_skills"] == ["shangman-goods-export-workflow-map"] for entry in entries)
    assert all(entry["input_schema"]["required"] == ["params"] for entry in entries)
    assert all(set(entry["input_schema"]["properties"]) == {"params"} for entry in entries)
    assert all(
        entry["input_schema"]["properties"]["params"]["required"]
        == ["platform", "country", "operation"]
        for entry in entries
    )
    assert all(
        set(entry["input_schema"]["properties"]["params"]["properties"])
        == {"platform", "country", "operation"}
        for entry in entries
    )
    assert all(
        entry["input_schema"]["properties"]["params"]["additionalProperties"] is False
        for entry in entries
    )


def test_preview_accepts_ai_generated_params_without_parsing_business_wording() -> None:
    result = goods_export_preview.run({"params": GOODS_PARAMS})

    assert result["success"] is True
    assert result["status"] == "ready"
    assert result["params"] == GOODS_PARAMS
    assert result["intent"]["params"] == GOODS_PARAMS
    assert result["plan"]["tasks"] == [{"type": "goods-export", "params": GOODS_PARAMS}]


def test_preview_rejects_missing_structured_params() -> None:
    result = goods_export_preview.run({})

    assert result["success"] is False
    assert result["status"] == "blocked"
    assert result["error"]["code"] == "params_invalid"


def test_run_stops_at_production_gate_without_network(monkeypatch) -> None:
    monkeypatch.delenv("LXE_SHANGMAN_PROD_ENABLED", raising=False)

    class FailClient:
        def __init__(self, *args, **kwargs):
            raise AssertionError("run must stop before client construction")

    monkeypatch.setattr(_workflow, "ShangmanClient", FailClient)

    result = goods_export_run.run({"params": GOODS_PARAMS})

    assert result == {
        "success": False,
        "status": "blocked",
        "params": GOODS_PARAMS,
        "intent": {
            "type": "goods-export",
            "platform": "智慧",
            "country": "印尼",
            "operation": "goods_export",
            "params": GOODS_PARAMS,
        },
        "plan": {
            "type": "goods-export",
            "tasks": [{"type": "goods-export", "params": GOODS_PARAMS}],
            "source_notice": "该文件保留平台原始商品导出字段，不包含逐日销量、14天销量或历史月末快照。",
        },
        "error": {
            "code": "production_gate_required",
            "message": "LXE_SHANGMAN_PROD_ENABLED must be true before ERP execution",
            "recoverable": True,
        },
        "terminal_projection": {
            "data": {
                "platform": "智慧",
                "country": "印尼",
                "business_type": "goods_export",
                "recoverable": True,
            },
            "error": {
                "code": "production_gate_required",
                "message": "LXE_SHANGMAN_PROD_ENABLED must be true before ERP execution",
            },
        },
    }


def test_run_reports_missing_captcha_after_gate_and_credentials(monkeypatch) -> None:
    monkeypatch.setenv("LXE_SHANGMAN_PROD_ENABLED", "true")
    for name, value in {
        "LXE_SHANGMAN_TENANT_ID": "tenant",
        "LXE_SHANGMAN_USERNAME": "user",
        "LXE_SHANGMAN_PROCESSED_PASSWORD": "password",
        "LXE_SHANGMAN_BASIC_AUTH": "Basic ZHVtbXk6cGFzcw==",
    }.items():
        monkeypatch.setenv(name, value)

    result = goods_export_run.run({"params": GOODS_PARAMS})

    assert result["success"] is False
    assert result["status"] == "blocked"
    assert result["error"]["code"] == "captcha_channel_unavailable"
    assert result["error"]["recoverable"] is True


def test_run_reuses_first_stage_client_and_returns_one_artifact(monkeypatch, tmp_path: Path) -> None:
    monkeypatch.setenv("LXE_SHANGMAN_PROD_ENABLED", "true")
    for name, value in {
        "LXE_SHANGMAN_TENANT_ID": "tenant",
        "LXE_SHANGMAN_USERNAME": "user",
        "LXE_SHANGMAN_PROCESSED_PASSWORD": "password",
        "LXE_SHANGMAN_BASIC_AUTH": "Basic ZHVtbXk6cGFzcw==",
        "LXE_SHANGMAN_CAPTCHA_CHANNEL_URL": "http://127.0.0.1:1",
        "LXE_SHANGMAN_CAPTCHA_CHANNEL_TOKEN": "channel-token",
        "LXE_AGENT_SESSION_ID": "session-id",
        "LXE_AGENT_TURN_ID": "turn-id",
    }.items():
        monkeypatch.setenv(name, value)
    artifact = tmp_path / "智慧-商品-20260917-150000.xlsx"
    artifact.write_bytes(b"fake xlsx")
    calls: list[dict] = []

    class FakeResult:
        def to_payload(self):
            return {"artifact_path": str(artifact), "source": "shangman_goods_export"}

    class FakeClient:
        def __init__(self, *, credentials, captcha_provider, output_dir=None):
            calls.append({"credentials": credentials, "captcha_provider": captcha_provider})

        async def export_goods(self):
            return FakeResult()

    monkeypatch.setattr(_workflow, "ShangmanClient", FakeClient)

    result = goods_export_run.run({"params": GOODS_PARAMS})

    assert result["success"] is True
    assert result["status"] == "completed"
    assert result["artifact_path"] == str(artifact)
    assert result["plan"]["type"] == "goods-export"
    assert result["terminal_projection"] == {
        "data": {
            "platform": "智慧",
            "country": "印尼",
            "business_type": "goods_export",
        }
    }
    assert len(calls) == 1


def test_run_redacts_runtime_credentials_but_keeps_client_diagnostic(monkeypatch) -> None:
    monkeypatch.setenv("LXE_SHANGMAN_PROD_ENABLED", "true")
    for name, value in {
        "LXE_SHANGMAN_TENANT_ID": "tenant-secret",
        "LXE_SHANGMAN_USERNAME": "user-secret",
        "LXE_SHANGMAN_PROCESSED_PASSWORD": "password-secret",
        "LXE_SHANGMAN_BASIC_AUTH": "Basic ZHVtbXk6cGFzcw==",
        "LXE_SHANGMAN_CAPTCHA_CHANNEL_URL": "http://127.0.0.1:1",
        "LXE_SHANGMAN_CAPTCHA_CHANNEL_TOKEN": "channel-token",
        "LXE_AGENT_SESSION_ID": "session-id",
        "LXE_AGENT_TURN_ID": "turn-id",
    }.items():
        monkeypatch.setenv(name, value)

    class FailingClient:
        def __init__(self, **kwargs):
            del kwargs

        async def export_goods(self):
            raise RuntimeError("login failed for password-secret: status=502")

    monkeypatch.setattr(_workflow, "ShangmanClient", FailingClient)

    result = goods_export_run.run({"params": GOODS_PARAMS})

    assert result["error"] == {
        "code": "erp_execution_failed",
        "message": "login failed for <redacted>: status=502",
        "recoverable": True,
    }
    assert result["terminal_projection"] == {
        "data": {
            "platform": "智慧",
            "country": "印尼",
            "business_type": "goods_export",
            "recoverable": True,
        },
        "error": {
            "code": "erp_execution_failed",
            "message": "login failed for <redacted>: status=502",
        },
    }


def test_run_stops_after_shangman_auth_failure_instead_of_requesting_another_recovery(monkeypatch) -> None:
    monkeypatch.setenv("LXE_SHANGMAN_PROD_ENABLED", "true")
    for name, value in {
        "LXE_SHANGMAN_TENANT_ID": "tenant",
        "LXE_SHANGMAN_USERNAME": "user",
        "LXE_SHANGMAN_PROCESSED_PASSWORD": "password",
        "LXE_SHANGMAN_BASIC_AUTH": "Basic ZHVtbXk6cGFzcw==",
        "LXE_SHANGMAN_CAPTCHA_CHANNEL_URL": "http://127.0.0.1:1",
        "LXE_SHANGMAN_CAPTCHA_CHANNEL_TOKEN": "channel-token",
        "LXE_AGENT_SESSION_ID": "session-id",
        "LXE_AGENT_TURN_ID": "turn-id",
    }.items():
        monkeypatch.setenv(name, value)

    class AuthFailingClient:
        def __init__(self, **kwargs):
            del kwargs

        async def export_goods(self):
            raise ShangmanAuthError("login response incomplete: 用户名或密码不正确")

    monkeypatch.setattr(_workflow, "ShangmanClient", AuthFailingClient)

    result = goods_export_run.run({"params": GOODS_PARAMS})

    assert result["error"] == {
        "code": "shangman_auth_failed",
        "message": "login response incomplete: 用户名或密码不正确",
        "recoverable": False,
    }
    assert result["terminal_projection"]["data"]["recoverable"] is False


def test_run_returns_a_terminal_failure_when_captcha_wait_expires(monkeypatch) -> None:
    monkeypatch.setenv("LXE_SHANGMAN_PROD_ENABLED", "true")
    for name, value in {
        "LXE_SHANGMAN_TENANT_ID": "tenant",
        "LXE_SHANGMAN_USERNAME": "user",
        "LXE_SHANGMAN_PROCESSED_PASSWORD": "password",
        "LXE_SHANGMAN_BASIC_AUTH": "Basic ZHVtbXk6cGFzcw==",
        "LXE_SHANGMAN_CAPTCHA_CHANNEL_URL": "http://127.0.0.1:1",
        "LXE_SHANGMAN_CAPTCHA_CHANNEL_TOKEN": "channel-token",
        "LXE_AGENT_SESSION_ID": "session-id",
        "LXE_AGENT_TURN_ID": "turn-id",
    }.items():
        monkeypatch.setenv(name, value)

    class WaitingClient:
        def __init__(self, **kwargs):
            del kwargs

        async def export_goods(self):
            raise CaptchaInputExpired("opaque-challenge-id")

    monkeypatch.setattr(_workflow, "ShangmanClient", WaitingClient)

    result = goods_export_run.run({"params": GOODS_PARAMS})

    assert result["error"] == {
        "code": "captcha_expired",
        "message": "Captcha input timed out or the challenge expired",
        "recoverable": True,
    }
    assert result["terminal_projection"]["error"]["code"] == "captcha_expired"
    assert "challenge_id" not in result["error"]


def test_run_returns_a_terminal_failure_when_captcha_channel_is_unavailable(monkeypatch) -> None:
    monkeypatch.setenv("LXE_SHANGMAN_PROD_ENABLED", "true")
    for name, value in {
        "LXE_SHANGMAN_TENANT_ID": "tenant",
        "LXE_SHANGMAN_USERNAME": "user",
        "LXE_SHANGMAN_PROCESSED_PASSWORD": "password",
        "LXE_SHANGMAN_BASIC_AUTH": "Basic ZHVtbXk6cGFzcw==",
        "LXE_SHANGMAN_CAPTCHA_CHANNEL_URL": "http://127.0.0.1:1",
        "LXE_SHANGMAN_CAPTCHA_CHANNEL_TOKEN": "channel-token",
        "LXE_AGENT_SESSION_ID": "session-id",
        "LXE_AGENT_TURN_ID": "turn-id",
    }.items():
        monkeypatch.setenv(name, value)

    class UnavailableClient:
        def __init__(self, **kwargs):
            del kwargs

        async def export_goods(self):
            raise CaptchaChannelUnavailable("broker unavailable")

    monkeypatch.setattr(_workflow, "ShangmanClient", UnavailableClient)

    result = goods_export_run.run({"params": GOODS_PARAMS})

    assert result["success"] is False
    assert result["error"] == {
        "code": "captcha_channel_unavailable",
        "message": "Desktop captcha input channel is unavailable",
        "recoverable": True,
    }
    assert result["terminal_projection"]["data"]["recoverable"] is True


def test_run_returns_a_terminal_failure_when_captcha_input_is_cancelled(monkeypatch) -> None:
    monkeypatch.setenv("LXE_SHANGMAN_PROD_ENABLED", "true")
    for name, value in {
        "LXE_SHANGMAN_TENANT_ID": "tenant",
        "LXE_SHANGMAN_USERNAME": "user",
        "LXE_SHANGMAN_PROCESSED_PASSWORD": "password",
        "LXE_SHANGMAN_BASIC_AUTH": "Basic ZHVtbXk6cGFzcw==",
        "LXE_SHANGMAN_CAPTCHA_CHANNEL_URL": "http://127.0.0.1:1",
        "LXE_SHANGMAN_CAPTCHA_CHANNEL_TOKEN": "channel-token",
        "LXE_AGENT_SESSION_ID": "session-id",
        "LXE_AGENT_TURN_ID": "turn-id",
    }.items():
        monkeypatch.setenv(name, value)

    class CancelledClient:
        def __init__(self, **kwargs):
            del kwargs

        async def export_goods(self):
            raise asyncio.CancelledError

    monkeypatch.setattr(_workflow, "ShangmanClient", CancelledClient)

    result = goods_export_run.run({"params": GOODS_PARAMS})

    assert result["error"] == {
        "code": "captcha_cancelled",
        "message": "Captcha input was cancelled",
        "recoverable": True,
    }


def test_run_rejects_invalid_structured_params_before_gate(monkeypatch) -> None:
    monkeypatch.delenv("LXE_SHANGMAN_PROD_ENABLED", raising=False)

    result = goods_export_run.run(
        {
            "params": {
                **GOODS_PARAMS,
                "operation": "unknown",
            }
        }
    )

    assert result["success"] is False
    assert result["status"] == "blocked"
    assert result["error"]["code"] == "params_invalid"
