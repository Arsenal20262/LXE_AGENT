from __future__ import annotations

from datetime import date
from typing import Any

import pytest

from services.yacang.export_intent import (
    ALL_DATA_TYPES,
    WAREHOUSE_CODES,
    normalize_export_intent,
)


FIXED_TODAY = lambda: date(2026, 9, 14)


def normalized(text: str, **kwargs: Any) -> dict[str, Any]:
    return normalize_export_intent(text, today=FIXED_TODAY, **kwargs)


def test_omitted_dimensions_apply_deterministic_defaults() -> None:
    result = normalized("导出雅仓数据")

    assert result["intent"] == {
        "data_type_intent": {"state": "omitted"},
        "warehouse_intent": {"state": "omitted"},
        "created_date_filter": {"state": "omitted"},
        "inventory_snapshot_intent": {"state": "omitted"},
    }
    assert result["effective_request"] == {
        "data_types": list(ALL_DATA_TYPES),
        "warehouses": list(WAREHOUSE_CODES),
        "created_date_filter": {
            "mode": "default",
            "created_start_date": "2026-09-07",
            "created_end_date": "2026-09-14",
            "source": "system_default",
            "input_fragments": [],
            "normalization_rules": ["default_execution_day_minus_7"],
        },
    }
    assert result["questions"] == []
    assert result["preflight_issues"] == []
    assert result["requires_clarification"] is False


@pytest.mark.parametrize(
    "candidate",
    [
        {"state": "omitted", "mode": "default"},
        {"state": "ambiguous", "days": 7},
        {"state": "resolved", "mode": "default", "days": 7},
        {
            "state": "resolved",
            "mode": "relative_days",
            "days": 7,
            "created_start_date": "2026-09-01",
        },
        {
            "state": "resolved",
            "mode": "explicit_range",
            "created_start_date": "2026-09-01",
            "created_end_date": "2026-09-10",
        },
        {"state": "resolved", "mode": "relative_days", "days": 0},
        {"state": "resolved", "mode": "unknown"},
    ],
)
def test_created_date_filter_rejects_non_exclusive_shapes(
    candidate: dict[str, Any],
) -> None:
    with pytest.raises(ValueError):
        normalized("导出雅仓销量", created_date_filter=candidate)


@pytest.mark.parametrize(
    ("field", "candidate"),
    [
        ("data_type_intent", {"state": "omitted", "values": ["sales-monthly"]}),
        ("data_type_intent", {"state": "resolved", "values": []}),
        ("data_type_intent", {"state": "resolved", "values": ["unknown"]}),
        ("data_type_intent", {"state": "resolved", "values": ["sales-monthly"] * 2}),
        ("data_type_intent", {"state": "unsupported"}),
        ("warehouse_intent", {"state": "omitted", "values": ["MY8801"]}),
        ("warehouse_intent", {"state": "resolved", "values": []}),
        ("warehouse_intent", {"state": "resolved", "values": ["UNKNOWN"]}),
        ("inventory_snapshot_intent", {"state": "resolved"}),
        ("inventory_snapshot_intent", {"state": "current", "date": "2026-09-01"}),
    ],
)
def test_agent_candidates_reject_invalid_or_unknown_shapes(
    field: str,
    candidate: dict[str, Any],
) -> None:
    with pytest.raises(ValueError):
        normalized("导出雅仓数据", **{field: candidate})


@pytest.mark.parametrize("value", [None, "", "   ", 123, ["导出雅仓数据"]])
def test_request_text_must_be_non_empty_text(value: Any) -> None:
    with pytest.raises(ValueError):
        normalize_export_intent(value, today=FIXED_TODAY)


def test_legacy_inventory_candidate_normalizes_at_compatibility_boundary() -> None:
    result = normalized(
        "导出库存",
        data_type_intent={"state": "resolved", "values": ["inventory-month-end"]},
    )

    assert result["intent"]["data_type_intent"] == {
        "state": "resolved",
        "values": ["inventory-current-snapshot"],
    }
    assert result["effective_request"]["data_types"] == ["inventory-current-snapshot"]


@pytest.mark.parametrize(
    ("text", "expected"),
    [
        ("导出最近30天销量", ["sales-monthly"]),
        ("导出7/15/30销量", ["sales-monthly"]),
        ("导出近90天每天销量", ["sales-90d"]),
        ("导出近三个月销量", ["sales-90d"]),
        ("导出长期每日销量", ["sales-90d"]),
        ("导出当前库存", ["inventory-current-snapshot"]),
        ("导出现在库存", ["inventory-current-snapshot"]),
        ("导出库存现状", ["inventory-current-snapshot"]),
        ("导出库存快照", ["inventory-current-snapshot"]),
        ("现在还有多少货", ["inventory-current-snapshot"]),
        ("还剩多少货", ["inventory-current-snapshot"]),
        ("导出什么时候上架", ["inbound-listing-time"]),
    ],
)
def test_supported_colloquial_types_map_to_fixed_canonical_types(
    text: str,
    expected: list[str],
) -> None:
    result = normalized(text)

    assert result["effective_request"]["data_types"] == expected
    assert result["requires_clarification"] is False


@pytest.mark.parametrize(
    "text",
    [
        "导出库存动销",
        "导出最近销量",
        "导出库存和销量",
        "导出最近7天的商品销量",
    ],
)
def test_true_semantic_ambiguity_requires_clarification(text: str) -> None:
    result = normalized(text)

    assert result["requires_clarification"] is True
    assert result["effective_request"] is None
    assert result["questions"]


def test_generic_sales_with_relative_creation_filter_preserves_both_states() -> None:
    result = normalized("最近7天创建的商品销量")

    assert result["intent"]["data_type_intent"] == {"state": "ambiguous"}
    assert result["intent"]["created_date_filter"] == {
        "state": "resolved",
        "mode": "relative_days",
        "days": 7,
    }
    assert result["requires_clarification"] is True
    assert result["effective_request"] is None


def test_inventory_plus_both_sales_selects_exactly_three_types() -> None:
    result = normalized("库存和两种销量都要")

    assert result["effective_request"]["data_types"] == [
        "sales-monthly",
        "sales-90d",
        "inventory-current-snapshot",
    ]


@pytest.mark.parametrize(
    "text",
    ["全部数据", "所有数据", "完整数据", "全套", "四类", "导一套", "雅仓都要"],
)
def test_all_data_phrases_select_all_four_types(text: str) -> None:
    result = normalized(text)

    assert result["intent"]["data_type_intent"] == {
        "state": "resolved",
        "values": list(ALL_DATA_TYPES),
    }
    assert result["effective_request"]["data_types"] == list(ALL_DATA_TYPES)


@pytest.mark.parametrize("text", ["导出四仓月底库存", "导出月末库存", "导出月末快照"])
def test_bare_month_end_inventory_is_ambiguous(text: str) -> None:
    result = normalized(text)

    assert result["intent"]["data_type_intent"] == {
        "state": "resolved",
        "values": ["inventory-current-snapshot"],
    }
    assert result["intent"]["inventory_snapshot_intent"] == {"state": "ambiguous"}
    assert result["requires_clarification"] is True


@pytest.mark.parametrize("text", ["导出上个月月底库存", "导出8月31日库存"])
def test_historical_inventory_is_explicitly_unsupported(text: str) -> None:
    result = normalized(text)

    assert result["intent"]["inventory_snapshot_intent"] == {"state": "historical"}
    assert result["effective_request"]["data_types"] == ["inventory-current-snapshot"]
    assert result["requires_clarification"] is False
    assert result["preflight_issues"] == [
        {
            "kind": "unsupported",
            "code": "UNSUPPORTED_HISTORICAL_INVENTORY",
            "message": "当前雅仓接口不支持历史库存快照",
        }
    ]


def test_relative_creation_days_are_calculated_only_by_deterministic_layer() -> None:
    result = normalized("导出最近30天创建商品的月度销量")

    assert result["intent"]["created_date_filter"] == {
        "state": "resolved",
        "mode": "relative_days",
        "days": 30,
    }
    assert result["effective_request"]["created_date_filter"] == {
        "mode": "relative_days",
        "created_start_date": "2026-08-15",
        "created_end_date": "2026-09-14",
        "source": "deterministic_relative_days",
        "input_fragments": ["最近30天创建"],
        "normalization_rules": ["relative_creation_days"],
    }


@pytest.mark.parametrize(
    ("text", "expected_rule"),
    [
        ("导出创建日期2026-09-01 到 2026-09-10的月度销量", "explicit_iso_range"),
        ("导出创建日期2026年9月1日到2026年9月10日的月度销量", "explicit_chinese_range"),
        ("导出创建日期9月1日到9月10日的月度销量", "execution_year_inference"),
    ],
)
def test_explicit_creation_ranges_are_normalized_from_raw_text(
    text: str,
    expected_rule: str,
) -> None:
    result = normalized(
        text,
        created_date_filter={"state": "resolved", "mode": "explicit_range"},
    )
    effective = result["effective_request"]["created_date_filter"]

    assert effective["created_start_date"] == "2026-09-01"
    assert effective["created_end_date"] == "2026-09-10"
    assert expected_rule in effective["normalization_rules"]
    assert effective["input_fragments"]


@pytest.mark.parametrize(
    "text",
    [
        "导出创建日期2026-09-01的月度销量",
        "导出创建日期2026-09-10到2026-09-01的月度销量",
        "导出创建日期12月20日到1月5日的月度销量",
    ],
)
def test_incomplete_invalid_or_cross_year_ranges_require_clarification(text: str) -> None:
    result = normalized(text)

    assert result["requires_clarification"] is True
    assert result["effective_request"] is None


@pytest.mark.parametrize("days", [45, 56, 60, 120])
def test_custom_sales_windows_are_deterministic_unsupported_output(days: int) -> None:
    result = normalized(f"导出{days}天销量")

    assert result["intent"]["data_type_intent"] == {"state": "unsupported"}
    assert result["effective_request"]["data_types"] == []
    assert result["requires_clarification"] is False
    assert result["preflight_issues"] == [
        {
            "kind": "unsupported",
            "code": "UNSUPPORTED_SALES_WINDOW",
            "requested_value": {"sales_window_days": days},
            "message": "当前只支持 7/15/30 汇总销量和日度近 90 天销量",
        }
    ]
    assert "requested_value" not in result["effective_request"]


def test_retired_7_14_30_wording_is_not_accepted_as_monthly_report() -> None:
    result = normalized("导出7/14/30销量")

    assert result["intent"]["data_type_intent"] == {"state": "unsupported"}
    assert result["effective_request"]["data_types"] == []
    assert result["preflight_issues"][0]["code"] == "UNSUPPORTED_SALES_WINDOW"
    assert result["preflight_issues"][0]["requested_value"] == {"sales_window_days": 14}


@pytest.mark.parametrize("text", ["导出雅仓利润", "导出雅仓订单"])
def test_explicit_unknown_business_is_unsupported_instead_of_defaulting_all(text: str) -> None:
    result = normalized(text)

    assert result["intent"]["data_type_intent"] == {"state": "unsupported"}
    assert result["effective_request"]["data_types"] == []
    assert result["preflight_issues"][0]["code"] == "UNSUPPORTED_DATA_TYPE"
    assert result["requires_clarification"] is False


def test_mixed_unsupported_window_keeps_only_supported_type() -> None:
    result = normalized("导出当前库存和56天销量")

    assert result["intent"]["data_type_intent"] == {"state": "unsupported"}
    assert result["effective_request"]["data_types"] == ["inventory-current-snapshot"]
    assert result["preflight_issues"][0]["code"] == "UNSUPPORTED_SALES_WINDOW"


def test_plain_sales_number_does_not_become_creation_filter() -> None:
    result = normalized("导出最近30天销量")

    assert result["intent"]["created_date_filter"] == {"state": "omitted"}
    assert result["effective_request"]["created_date_filter"]["mode"] == "default"


def test_warehouse_defaults_subset_and_unknown_are_deterministic() -> None:
    default = normalized("导出当前库存")
    subset = normalized("导出 MY8801、TH8802 当前库存")
    unknown = normalized("导出 XX9999 当前库存")

    assert default["effective_request"]["warehouses"] == list(WAREHOUSE_CODES)
    assert subset["effective_request"]["warehouses"] == ["MY8801", "TH8802"]
    assert unknown["requires_clarification"] is True
    assert unknown["effective_request"] is None


def test_agent_candidate_conflicting_with_strong_raw_signal_is_rejected_as_ambiguous() -> None:
    result = normalized(
        "导出近90天每天销量",
        data_type_intent={"state": "resolved", "values": ["sales-monthly"]},
    )

    assert result["requires_clarification"] is True
    assert result["effective_request"] is None
    assert any(question["code"] == "DATA_TYPE_INTENT_CONFLICT" for question in result["questions"])


def test_agent_warehouse_candidate_cannot_override_explicit_raw_warehouse() -> None:
    result = normalized(
        "导出 MY8801 当前库存",
        warehouse_intent={"state": "resolved", "values": ["TH8802"]},
    )

    assert result["requires_clarification"] is True
    assert any(question["code"] == "WAREHOUSE_INTENT_CONFLICT" for question in result["questions"])


def test_agent_relative_days_must_match_raw_creation_phrase() -> None:
    result = normalized(
        "导出最近7天创建商品的月度销量",
        created_date_filter={"state": "resolved", "mode": "relative_days", "days": 30},
    )

    assert result["requires_clarification"] is True
    assert any(
        question["code"] == "CREATED_DATE_INTENT_CONFLICT"
        for question in result["questions"]
    )


def test_agent_inventory_candidate_cannot_override_historical_raw_intent() -> None:
    result = normalized(
        "导出上个月月底库存",
        inventory_snapshot_intent={"state": "current"},
    )

    assert result["requires_clarification"] is True
    assert any(question["code"] == "INVENTORY_INTENT_CONFLICT" for question in result["questions"])


def test_omitted_candidate_does_not_hide_strong_raw_signal() -> None:
    result = normalized(
        "导出 MY8801 当前库存",
        data_type_intent={"state": "omitted"},
        warehouse_intent={"state": "omitted"},
    )

    assert result["effective_request"]["data_types"] == ["inventory-current-snapshot"]
    assert result["effective_request"]["warehouses"] == ["MY8801"]


@pytest.mark.parametrize(
    ("text", "kwargs", "code"),
    [
        (
            "导出当前库存",
            {"created_date_filter": {"state": "resolved", "mode": "default"}},
            "INVALID_CREATED_DATE_SCOPE",
        ),
        (
            "导出月度销量",
            {"inventory_snapshot_intent": {"state": "current"}},
            "INVALID_INVENTORY_INTENT_SCOPE",
        ),
        (
            "导出 MY8801 上架时间",
            {},
            "UNSUPPORTED_INBOUND_WAREHOUSE_FILTER",
        ),
        (
            "导出最近7天创建商品的上架时间",
            {},
            "UNSUPPORTED_INBOUND_CREATED_DATE_FILTER",
        ),
    ],
)
def test_cross_field_scope_errors_are_preflight_issues(
    text: str,
    kwargs: dict[str, Any],
    code: str,
) -> None:
    result = normalized(text, **kwargs)

    assert result["requires_clarification"] is False
    assert any(issue["code"] == code for issue in result["preflight_issues"])


def test_mixed_sales_and_inbound_keeps_shared_filters_at_request_scope_only() -> None:
    result = normalized("导出 MY8801 最近7天创建商品的月度销量和上架时间")

    assert result["effective_request"] == {
        "data_types": ["sales-monthly", "inbound-listing-time"],
        "warehouses": ["MY8801"],
        "created_date_filter": {
            "mode": "relative_days",
            "created_start_date": "2026-09-07",
            "created_end_date": "2026-09-14",
            "source": "deterministic_relative_days",
            "input_fragments": ["最近7天创建"],
            "normalization_rules": ["relative_creation_days"],
        },
    }
    assert result["preflight_issues"] == []
