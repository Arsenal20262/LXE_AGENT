from __future__ import annotations

import pytest

from services.shangman.intent import build_goods_export_plan


SUPPORTED_REQUESTS = [
    "请导出智慧印尼本月7天销量",
    "请给我智慧印尼14天销量和30天销量",
    "查看智慧印尼90天日度销量",
    "查一下智慧印尼当前库存",
    "我要智慧印尼月末库存快照",
    "导出智慧印尼入库时间",
    "导出智慧印尼商品上架时间",
    "智慧印尼 goods export 商品导出",
]


@pytest.mark.parametrize("request_text", SUPPORTED_REQUESTS)
def test_supported_business_wording_maps_to_one_goods_export_plan(request_text: str) -> None:
    result = build_goods_export_plan(request_text)

    assert result["status"] == "ready"
    assert result["intent"] == {
        "type": "goods-export",
        "request_text": request_text,
    }
    assert result["plan"] == {
        "type": "goods-export",
        "tasks": [{"type": "goods-export"}],
        "source_notice": "该文件保留平台原始商品导出字段，不包含逐日销量、14天销量或历史月末快照。",
    }
    assert result["request_text"] == request_text
    assert "14" not in result["plan"]
    assert "90" not in result["plan"]
    assert "month_end" not in result["plan"]


def test_month_end_and_listing_time_variants_share_the_same_canonical_plan() -> None:
    plans = [
        build_goods_export_plan("导出智慧印尼月底库存快照")["plan"],
        build_goods_export_plan("查询智慧印尼商品创建时间")["plan"],
        build_goods_export_plan("导出智慧印尼商品")["plan"],
    ]

    assert plans[0] == plans[1] == plans[2]


def test_empty_request_is_recoverable_input_error() -> None:
    result = build_goods_export_plan("  ")

    assert result == {
        "status": "blocked",
        "request_text": "  ",
        "error": {
            "code": "request_text_required",
            "message": "request_text is required",
            "recoverable": True,
        },
    }


def test_ambiguous_request_requires_clarification_without_guessing_report_type() -> None:
    result = build_goods_export_plan("帮我看一下智慧印尼最近卖得怎么样")

    assert result["status"] == "needs_clarification"
    assert result["request_text"] == "帮我看一下智慧印尼最近卖得怎么样"
    assert result["error"]["code"] == "ambiguous_request"
    assert result["error"]["recoverable"] is True


def test_unrelated_request_is_explicitly_unsupported() -> None:
    result = build_goods_export_plan("帮我发一封邮件")

    assert result["status"] == "unsupported"
    assert result["error"]["code"] == "platform_marker_required"


@pytest.mark.parametrize("request_text", ["导出智慧库存", "导出印尼库存"])
def test_both_platform_markers_are_required_to_trigger_the_workflow(request_text: str) -> None:
    result = build_goods_export_plan(request_text)

    assert result["status"] == "unsupported"
    assert result["error"]["code"] == "platform_marker_required"
