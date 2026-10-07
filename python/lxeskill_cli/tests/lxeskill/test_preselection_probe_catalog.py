from __future__ import annotations

import copy

import pytest

from lxeskill.business import load_catalog, validate_preselection_probe


def test_catalog_marks_one_internal_unexposed_preselection_probe() -> None:
    probes = {name: entry for name, entry in load_catalog().items() if entry.get("preselection_probe") is True}
    assert set(probes) == {"vietnam_replenishment_probe_sku"}
    validate_preselection_probe(probes["vietnam_replenishment_probe_sku"])


@pytest.mark.parametrize("change", [
    {"visibility": "business"},
    {"exposed": True},
    {"session_mode": "lxe_session"},
    {"owner_skills": ["stock"]},
    {"input_schema": {"type": "object", "properties": {}, "additionalProperties": False}},
    {"artifact_paths": [{"field": "output", "role": "deliverable"}]},
    {"preselection_probe": False},
])
def test_probe_marker_rejects_unsafe_contracts(change: dict) -> None:
    probe = copy.deepcopy(load_catalog()["vietnam_replenishment_probe_sku"])
    probe.update(change)
    with pytest.raises(RuntimeError, match="preselection probe"):
        validate_preselection_probe(probe)
