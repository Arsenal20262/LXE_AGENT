from __future__ import annotations

import copy

import pytest

from lxeskill.business import load_catalog, validate_preselection_probe


def test_catalog_marks_one_internal_unexposed_preselection_probe() -> None:
    probes = {name: entry for name, entry in load_catalog().items() if entry.get("preselection_probe") is True}
    assert probes == {}


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
    probe = {"name": "synthetic_probe", "visibility": "internal", "exposed": False,
             "session_mode": "none", "owner_skills": [], "preselection_probe": True, "timeout_ms": 30000,
             "input_schema": {"type": "object", "properties": {"source_path": {"type": "string", "minLength": 1}},
                              "required": ["source_path"], "additionalProperties": False}}
    probe.update(change)
    with pytest.raises(RuntimeError, match="preselection probe"):
        validate_preselection_probe(probe)
