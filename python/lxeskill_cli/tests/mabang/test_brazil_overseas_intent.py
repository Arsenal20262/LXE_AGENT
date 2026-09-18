from datetime import datetime, timezone

import pytest

from services.mabang.brazil_overseas.contracts import BrazilExportKind, DEFAULT_OUTPUT_DIR
from services.mabang.brazil_overseas.intent import BrazilIntentClarification, validate_brazil_export_parameters
from services.mabang.brazil_overseas.naming import output_filename


@pytest.mark.parametrize("kind", list(BrazilExportKind))
def test_validates_model_resolved_parameters(kind: BrazilExportKind) -> None:
    plan = validate_brazil_export_parameters(warehouse="brazil_overseas", export_kind=kind.value)

    assert plan.kind is kind
    assert plan.warehouse_id == "1072376"
    assert plan.warehouse_label == "巴西海外仓"
    assert plan.source_data_note == "平台原始库存文件仅含7/28/42天累计销量"


def test_rejects_non_brazil_warehouse() -> None:
    result = validate_brazil_export_parameters(warehouse="other", export_kind=BrazilExportKind.INVENTORY_SALES_SNAPSHOT.value)
    assert isinstance(result, BrazilIntentClarification)
    assert result.code == "brazil_warehouse_required"


def test_rejects_unknown_export_kind() -> None:
    result = validate_brazil_export_parameters(warehouse="brazil_overseas", export_kind="ambiguous")
    assert isinstance(result, BrazilIntentClarification)
    assert result.code == "brazil_export_kind_required"


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
