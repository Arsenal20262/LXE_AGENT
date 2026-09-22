from datetime import datetime, timezone

import pytest

from lxeskill.business import load_catalog
from services.mabang.brazil_overseas.contracts import BrazilExportKind, DEFAULT_OUTPUT_DIR
from services.mabang.brazil_overseas.intent import BrazilIntentClarification, validate_brazil_export_parameters
from services.mabang.brazil_overseas.naming import output_filename
from shared.repository import repository_root


PROJECT_ROOT = repository_root()
EXPECTED_STATUS_PHRASES = {
    "allocation_pending_default_3m": ("未签", "未签收", "待签", "待签收", "还没签收", "尚未签收"),
    "allocation_signed_before_3m": ("已签", "已签收", "已经签收", "签收完成"),
}


def _brazil_skill_text() -> str:
    return (PROJECT_ROOT / "skills" / "replenishment-workflow-map" / "SKILL.md").read_text(
        encoding="utf-8",
    )


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


def test_documents_without_status_use_the_existing_command_and_both_exports() -> None:
    plan = validate_brazil_export_parameters(
        warehouse="brazil_overseas",
        export_kind="allocation_both",
    )

    assert plan.kind is BrazilExportKind.ALLOCATION_BOTH


def test_brazil_status_synonyms_are_complete_and_identical_in_skill_and_catalog() -> None:
    skill = _brazil_skill_text()
    catalog_description = load_catalog()["mabang_brazil_overseas_export"]["input_schema"]["properties"][
        "export_kind"
    ]["description"]

    for export_kind, phrases in EXPECTED_STATUS_PHRASES.items():
        assert export_kind in skill
        assert export_kind in catalog_description
        for phrase in phrases:
            assert phrase in skill
            assert phrase in catalog_description

    assert "未指定签收状态" in skill
    assert "未指定签收状态" in catalog_description
    assert "调拨单据" in skill
    assert "调拨单据" in catalog_description


def test_brazil_skill_requires_clarification_for_ambiguous_document_terms() -> None:
    skill = _brazil_skill_text()

    for term in ("签收", "调拨", "单据"):
        assert f"裸词“{term}”" in skill
    assert "必须返回澄清" in skill
    assert "巴西海外仓的“单据/调拨单据”才映射为 `allocation_both`" in skill


def test_brazil_parameter_validator_documentation_excludes_prose_and_runtime_routing() -> None:
    documentation = validate_brazil_export_parameters.__doc__ or ""

    assert "selected Skill" in documentation
    assert "global Runtime filter" in documentation


def test_brazil_exports_use_the_registered_replenishment_artifact_partition() -> None:
    assert DEFAULT_OUTPUT_DIR.as_posix().endswith("artifacts/replenish/brazil_overseas")
