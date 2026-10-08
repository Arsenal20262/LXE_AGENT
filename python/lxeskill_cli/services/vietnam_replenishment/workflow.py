"""Generate one Vietnam recommendation from current inputs only."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from uuid import uuid4

from shared.datasets import dataset_dir

from .settings import run_inputs
from .sku_map_store import SkuMapStoreError
from .recalculation import generate_vietnam_workbook
from .workbook import RecommendationConfig
from .yacang_sources import export_vietnam_sources


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


def generate_current_vietnam_recommendation(sku_map: str | None = None) -> VietnamRecommendationRun:
    """Use the explicit map or saved app map, then publish one validated XLSX."""
    try:
        with run_inputs(sku_map) as (map_path, config, config_source, sku_map_source):
            return _generate_from_map(map_path, config, config_source, sku_map_source)
    except SkuMapStoreError as exc:
        raise VietnamWorkflowError("sku_parameter_map_invalid", str(exc)) from exc


def _generate_from_map(map_path: Path, config: RecommendationConfig, config_source: str, sku_map_source: str) -> VietnamRecommendationRun:
    sources = export_vietnam_sources()
    if not sources.skus:
        raise VietnamWorkflowError("current_skus_empty", "本轮 VN8806 来源没有 SKU")

    output = dataset_dir("vietnam_recommendations", uuid4().hex) / "越南备货清单.xlsx"
    try:
        completed = generate_vietnam_workbook(
            map_path, output, sources=sources, config=config
        )
        if Path(completed) != output or not output.is_file() or output.stat().st_size == 0:
            raise VietnamWorkflowError("output_missing", "本轮没有生成最终 XLSX")
    except Exception:
        output.unlink(missing_ok=True)
        raise
    return VietnamRecommendationRun(
        output_xlsx=output, sku_count=len(sources.skus),
        config=config, config_source=config_source, sku_map_source=sku_map_source,
    )


__all__ = [
    "VietnamRecommendationRun",
    "VietnamWorkflowError",
    "generate_current_vietnam_recommendation",
]
