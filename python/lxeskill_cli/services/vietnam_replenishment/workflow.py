"""Calculate one Vietnam recommendation from explicitly supplied local reports."""

from __future__ import annotations

from dataclasses import dataclass
from contextlib import nullcontext
from pathlib import Path
import shutil
from tempfile import TemporaryDirectory
from uuid import uuid4

from shared.datasets import dataset_dir
from shared.filesystem import display_path
from shared.workspace import resolve_workspace_input

from .asset_contract import REQUIRED_SHEETS, load_sku_parameters, load_template_sku_parameters
from .full_workbook import REQUIRED_ORDER
from .settings import run_inputs
from .sku_map_store import SkuMapStoreError
from .recalculation import generate_vietnam_workbook
from .workbook import RecommendationConfig
from .yacang_sources import VietnamSources, load_vietnam_files


class VietnamWorkflowError(RuntimeError):
    """A current input or final output prerequisite failed."""

    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code


@dataclass(frozen=True)
class VietnamRecommendationRun:
    output_xlsx: Path
    sku_count: int
    config: RecommendationConfig
    config_source: str
    sku_map_source: str
    source_files: tuple[dict, ...]
    validation: dict


def generate_current_vietnam_recommendation(
    *, sales: str, inventory: str, products: str, sku_map: str | None = None,
    template: str | None = None,
) -> VietnamRecommendationRun:
    """Read the supplied reports and saved settings; never start an ERP export."""
    try:
        with run_inputs(sku_map, include_map=template is None or sku_map is not None) as (map_path, config, config_source, sku_map_source):
            sources = load_vietnam_files(sales=sales, inventory=inventory, products=products)
            return _generate_from_sources(sources, map_path, config, config_source, sku_map_source, template)
    except SkuMapStoreError as exc:
        raise VietnamWorkflowError("sku_parameter_map_invalid", str(exc)) from exc


def _generate_from_sources(
    sources: VietnamSources, map_path: Path | None, config: RecommendationConfig,
    config_source: str, sku_map_source: str | None, template: str | None = None,
) -> VietnamRecommendationRun:
    if not sources.skus:
        raise VietnamWorkflowError("current_skus_empty", "本轮 VN8806 来源没有 SKU")

    with TemporaryDirectory(prefix="vietnam-template-") if template is not None else nullcontext(None) as directory:
        if template is not None:
            template_source = resolve_workspace_input(template)
            template_snapshot = Path(directory) / "business-template.xlsx"
            shutil.copyfile(template_source, template_snapshot)
            if map_path is None:
                parameters = load_template_sku_parameters(template_snapshot, set(sources.skus))
                sku_map_source = str(display_path(template_source))
            else:
                parameters = load_sku_parameters(map_path)
        else:
            template_snapshot = None
            parameters = load_sku_parameters(map_path)
        output = dataset_dir("vietnam_recommendations", uuid4().hex) / "越南备货清单.xlsx"
        try:
            completed = generate_vietnam_workbook(
                map_path, output, sources=sources, config=config,
                **({"template": template_snapshot, "parameters": parameters} if template_snapshot is not None else {}),
            )
            if Path(completed) != output or not output.is_file() or output.stat().st_size == 0:
                raise VietnamWorkflowError("output_missing", "本轮没有生成最终 XLSX")
        except Exception:
            output.unlink(missing_ok=True)
            raise
    return VietnamRecommendationRun(
        output_xlsx=output, sku_count=len(sources.skus),
        config=config, config_source=config_source, sku_map_source=sku_map_source,
        source_files=tuple({
            "report": report, "path": str(display_path(path)),
            "sha256": sources.file_hashes[report],
        } for report, path in sources.artifacts.items()),
        validation={
            "status": "passed", "sku_count": len(sources.skus),
            "sheets": list(REQUIRED_ORDER if template is not None else REQUIRED_SHEETS),
            "checks": ["source_schema", "sku_coverage", "source_values", "formulas", "recalculated_results", "parameters"],
            "missing_mapping_count": sum(sku not in parameters for sku in sources.skus),
            "in_transit_mismatch_count": len(sources.in_transit_mismatch),
        },
    )


__all__ = [
    "VietnamRecommendationRun",
    "VietnamWorkflowError",
    "generate_current_vietnam_recommendation",
]
