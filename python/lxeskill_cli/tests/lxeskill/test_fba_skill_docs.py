from __future__ import annotations

from lxeskill.business import load_catalog
from shared.repository import repository_root


PROJECT_ROOT = repository_root()


def _skill_text(name: str) -> str:
    return (PROJECT_ROOT / "skills" / name / "SKILL.md").read_text(encoding="utf-8")


def test_repository_skill_inventory_distinguishes_top_level_and_nested_manifests() -> None:
    skill_root = PROJECT_ROOT / "skills"
    assert len(list(skill_root.glob("*/SKILL.md"))) == 34
    assert len(list(skill_root.rglob("SKILL.md"))) == 61
    assert not (skill_root / "feishu-im-read" / "SKILL.md").exists()
    assert (skill_root / "larksuite-cli" / "lark-im" / "SKILL.md").exists()


def test_yacang_export_skill_uses_one_declared_command_and_four_deliverables() -> None:
    catalog = load_catalog()
    entry = catalog["yacang_export_inventory_sales"]
    assert entry["command_path"] == ["yacang", "inventory-sales", "export"]
    assert entry["owner_skills"] == ["yacang-inventory-sales-export"]
    assert entry["artifact_paths"] == [{"field": "xlsx_paths[]", "role": "deliverable"}]
    text = _skill_text("yacang-inventory-sales-export")
    assert "terminal `files`" in text
    assert "send_files(paths=<terminal.files>)" in text
    assert "15 天销量" in text


def test_yacang_sales_exports_have_fixed_columns_and_router_is_commandless() -> None:
    catalog = load_catalog()
    entry = catalog["yacang_export_sales_monthly"]
    assert entry["command_path"] == ["yacang", "export", "sales-monthly"]
    assert entry["owner_skills"] == ["yacang-sales-monthly-export"]
    assert entry["artifact_paths"] == [{"field": "xlsx_paths[]", "role": "deliverable"}]
    assert "range_days" not in entry["input_schema"]["properties"]

    monthly = _skill_text("yacang-sales-monthly-export")
    assert "7/15/30" in monthly
    assert "send_files(paths=<terminal.files>)" in monthly
    assert "禁止直接执行 Python 模块" in monthly

    sales_90d = catalog["yacang_export_sales_90d"]
    assert sales_90d["command_path"] == ["yacang", "export", "sales-90d"]
    assert sales_90d["owner_skills"] == ["yacang-sales-90d-export"]
    assert sales_90d["artifact_paths"] == [{"field": "xlsx_paths[]", "role": "deliverable"}]
    assert "90天销量" in _skill_text("yacang-sales-90d-export")

    router = _skill_text("yacang-export-workflow-map")
    assert "commands:" not in router.split("---", 2)[1]
    assert "禁止自行尝试相似 endpoint" in router
    assert "不得改走其他雅仓命令冒充成功" in router


def test_yacang_inventory_month_end_uses_confirmed_current_inventory_contract() -> None:
    catalog = load_catalog()
    entry = catalog["yacang_export_inventory_month_end"]
    assert entry["command_path"] == ["yacang", "export", "inventory-month-end"]
    assert entry["owner_skills"] == ["yacang-inventory-month-end-export"]
    assert entry["artifact_paths"] == [{"field": "xlsx_paths[]", "role": "deliverable"}]
    assert entry["input_schema"]["properties"]["warehouse"]["enum"] == [
        "MY8801", "PH8805", "TH8802", "VN8806",
    ]

    text = _skill_text("yacang-inventory-month-end-export")
    assert "当前库存" in text
    assert "不支持历史" in text
    assert "send_files(paths=<terminal.files>)" in text


def test_yacang_inbound_listing_time_uses_confirmed_creation_time_contract() -> None:
    catalog = load_catalog()
    entry = catalog["yacang_export_inbound_listing_time"]
    assert entry["command_path"] == ["yacang", "export", "inbound-listing-time"]
    assert entry["owner_skills"] == ["yacang-inbound-listing-time-export"]
    assert entry["artifact_paths"] == [{"field": "xlsx_paths[]", "role": "deliverable"}]

    text = _skill_text("yacang-inbound-listing-time-export")
    assert "创建时间" in text
    assert "export_count=1" in text
    assert "send_files(paths=<terminal.files>)" in text


def test_ziniao_is_independent_and_shipment_owns_only_four_stages() -> None:
    catalog = load_catalog()
    assert catalog["ziniao_browser"]["owner_skills"] == ["ziniao-browser"]
    assert catalog["ziniao_page"]["owner_skills"] == ["ziniao-browser"]

    shipment = _skill_text("fba-shipment-create")
    frontmatter = shipment.split("---", 2)[1]
    assert "lxeskill browser" not in frontmatter
    assert frontmatter.count("lxeskill fba shipment") == 4

    ziniao = _skill_text("ziniao-browser")
    assert "data.screenshot_path" in ziniao
    assert "不含 base64" in ziniao
    assert "旧元素 `ref` 立即视为失效" in ziniao


def test_fba_docs_send_only_declared_deliverables() -> None:
    catalog = load_catalog()
    deliverable_owners = {
        str(owner)
        for entry in catalog.values()
        if list(entry.get("command_path") or [])[:1] == ["fba"]
        and any(item.get("role") == "deliverable" for item in list(entry.get("artifact_paths") or []))
        for owner in list(entry.get("owner_skills") or [])
    }
    assert deliverable_owners
    for owner in deliverable_owners:
        text = _skill_text(owner)
        assert "terminal `files`" in text, owner
        assert "send_files(paths=<terminal.files>)" in text, owner

    assert "不主动调用 `send_files`" in _skill_text("fba-export-tax-products-manage")


def test_purchase_confirmation_skill_distinguishes_proposed_and_current_inventory() -> None:
    text = _skill_text("fba-purchase-summary-create")

    for field in (
        "proposed_inventory_deduction_quantity",
        "proposed_purchase_quantity",
        "carryover_entry_id",
        "source_sp_no",
        "current_remaining_quantity",
        "replacement_released_quantity",
        "available_after_release",
        "proposed_applied_quantity",
    ):
        assert field in text
    assert "以上为待确认方案，当前库存尚未发生变化。" in text
    assert "禁止仅按合同号合并" in text
    assert "禁止用“ERP 原始数据”" in text


def test_purchase_skill_exposes_only_explicit_no_deduction_route() -> None:
    catalog = load_catalog()
    schema = catalog["mabang_generate_purchase_batch_workbooks"]["input_schema"]
    deduction_mode = schema["properties"]["inventory_deduction_mode"]

    assert deduction_mode["enum"] == ["none"]
    assert "inventory_deduction_mode" not in schema["required"]
    text = _skill_text("fba-purchase-summary-create")
    assert "--inventory-deduction-mode none" in text
    assert "普通采购必须省略" in text
    assert "不得根据库存量、金额或上下文自行推断" in text
