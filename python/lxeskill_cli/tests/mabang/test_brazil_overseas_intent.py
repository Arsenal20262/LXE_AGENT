from datetime import datetime, timezone

import pytest

from services.mabang.brazil_overseas.contracts import BrazilExportKind, DEFAULT_OUTPUT_DIR
from services.mabang.brazil_overseas.intent import BrazilIntentClarification, normalize_brazil_export_intent
from services.mabang.brazil_overseas.naming import output_filename


@pytest.mark.parametrize(
    "request_text",
    [
        "查询一下海外巴西仓最近一个月的销量",
        "巴西海外仓近三个月销量",
        "巴西海外仓7天销量",
        "巴西海外仓日度90天销量",
        "查一下巴西海外仓库存",
        "巴西仓库存快照",
    ],
)
def test_sales_and_inventory_requests_share_the_raw_inventory_export(request_text: str) -> None:
    plan = normalize_brazil_export_intent(request_text)

    assert plan.kind is BrazilExportKind.INVENTORY_SALES_SNAPSHOT
    assert plan.warehouse_id == "1072376"
    assert plan.warehouse_label == "巴西海外仓"
    assert plan.source_data_note == "平台原始库存文件仅含7/28/42天累计销量"


@pytest.mark.parametrize(
    ("request_text", "expected_kind"),
    [
        ("查询巴西海外仓已签收的单据", BrazilExportKind.ALLOCATION_SIGNED_BEFORE_3M),
        ("导出巴西海外仓三个月前已签收单据", BrazilExportKind.ALLOCATION_SIGNED_BEFORE_3M),
        ("查询巴西海外仓三个月内待签收的单据", BrazilExportKind.ALLOCATION_PENDING_DEFAULT_3M),
        ("导出巴西海外仓待签收单据", BrazilExportKind.ALLOCATION_PENDING_DEFAULT_3M),
    ],
)
def test_allocation_requests_resolve_to_fixed_export_kinds(
    request_text: str,
    expected_kind: BrazilExportKind,
) -> None:
    assert normalize_brazil_export_intent(request_text).kind is expected_kind


@pytest.mark.parametrize("request_text", ["查询巴西海外仓入库单据", "查询巴西海外仓调拨单据"])
def test_ambiguous_allocation_requests_require_a_status_choice(request_text: str) -> None:
    result = normalize_brazil_export_intent(request_text)

    assert isinstance(result, BrazilIntentClarification)
    assert result.code == "allocation_status_required"


@pytest.mark.parametrize(
    ("kind", "expected"),
    [
        (
            BrazilExportKind.INVENTORY_SALES_SNAPSHOT,
            "马帮系统-库存-巴西海外仓-2026-09-18_1430.xlsx",
        ),
        (
            BrazilExportKind.ALLOCATION_SIGNED_BEFORE_3M,
            "马帮系统-已签收-巴西海外仓-2026-09-18_1430.xlsx",
        ),
        (
            BrazilExportKind.ALLOCATION_PENDING_DEFAULT_3M,
            "马帮系统-3个月待签收-巴西海外仓-2026-09-18_1430.xlsx",
        ),
    ],
)
def test_output_filenames_use_beijing_time(kind: BrazilExportKind, expected: str) -> None:
    executed_at = datetime(2026, 9, 18, 6, 30, tzinfo=timezone.utc)

    assert output_filename(kind, executed_at=executed_at) == expected


def test_brazil_exports_use_the_registered_replenishment_artifact_partition() -> None:
    assert DEFAULT_OUTPUT_DIR.as_posix().endswith("artifacts/replenish/brazil_overseas")
