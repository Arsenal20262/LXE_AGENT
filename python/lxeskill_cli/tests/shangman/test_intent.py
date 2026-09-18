from __future__ import annotations

import pytest

from services.shangman.intent import build_goods_export_plan


BASE_PARAMS = {
    "platform": "智慧",
    "country": "印尼",
    "operation": "goods_export",
    "requested_metrics": ["sales", "inventory"],
    "sales_windows_days": [7, 30],
}


def test_structured_params_map_to_one_goods_export_plan() -> None:
    result = build_goods_export_plan(BASE_PARAMS)

    assert result["status"] == "ready"
    assert result["params"] == BASE_PARAMS
    assert result["intent"] == {
        "type": "goods-export",
        "platform": "智慧",
        "country": "印尼",
        "operation": "goods_export",
        "params": BASE_PARAMS,
    }
    assert result["plan"] == {
        "type": "goods-export",
        "tasks": [{"type": "goods-export", "params": BASE_PARAMS}],
        "source_notice": "该文件保留平台原始商品导出字段，不包含逐日销量、14天销量或历史月末快照。",
    }


def test_normalizes_optional_sales_windows_when_omitted() -> None:
    params = {key: value for key, value in BASE_PARAMS.items() if key != "sales_windows_days"}

    result = build_goods_export_plan(params)

    assert result["status"] == "ready"
    assert result["params"]["sales_windows_days"] == []


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("platform", "其他平台"),
        ("country", "美国"),
        ("operation", "inventory_export"),
        ("requested_metrics", ["unknown"]),
        ("sales_windows_days", [15]),
    ],
)
def test_rejects_params_outside_the_declared_contract(field: str, value: object) -> None:
    params = dict(BASE_PARAMS)
    params[field] = value

    result = build_goods_export_plan(params)

    assert result["status"] == "blocked"
    assert result["error"]["code"] == "params_invalid"


def test_rejects_missing_or_non_object_params() -> None:
    assert build_goods_export_plan(None)["error"]["code"] == "params_invalid"
    assert build_goods_export_plan({})["error"]["code"] == "params_invalid"


def test_rejects_duplicate_metrics_and_windows() -> None:
    duplicate_metrics = dict(BASE_PARAMS, requested_metrics=["sales", "sales"])
    duplicate_windows = dict(BASE_PARAMS, sales_windows_days=[7, 7])

    assert build_goods_export_plan(duplicate_metrics)["error"]["code"] == "params_invalid"
    assert build_goods_export_plan(duplicate_windows)["error"]["code"] == "params_invalid"
