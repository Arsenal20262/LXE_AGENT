from __future__ import annotations

import contextlib
import importlib
import json
import os
from pathlib import Path
import re
from typing import Any, Callable

from shared.datasets import load_datasets
from shared.filesystem import display_path, filesystem_path
from shared.logging import get_logger
from shared.repository import skills_root
from shared.workspace import artifact_root, resolve_workspace_input


logger = get_logger(__name__)
_ARTIFACT_ROLES = {"deliverable", "model_input", "diagnostic"}
_SELECTOR_PART = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*(?:\[\])?$")


class ArtifactPathError(ValueError):
    pass


_MANAGED_TOKEN = re.compile(r"^[a-z][a-z0-9-]*$")
_MANAGED_ARGUMENT = re.compile(r"^[a-z][a-z0-9_]*$")


def validate_managed_execution(entry: dict[str, Any]) -> None:
    """Fail closed when a catalog opt-in cannot be mapped to fixed CLI argv."""
    if "managed_execution" not in entry:
        return
    name = str(entry.get("name") or "<unknown>")
    declaration = entry["managed_execution"]
    schema = entry.get("input_schema")
    if not isinstance(declaration, dict) or set(declaration) - {"attachment_argument"}:
        raise RuntimeError(f"invalid managed execution declaration for {name}")
    command_path = entry.get("command_path")
    owners = entry.get("owner_skills")
    if (entry.get("visibility") != "business" or entry.get("session_mode") != "none"
            or entry.get("exposed") is not True or not isinstance(owners, list)
            or len(owners) != 1 or not isinstance(command_path, list)
            or not command_path or any(not isinstance(token, str) or not _MANAGED_TOKEN.fullmatch(token) for token in command_path)
            or not isinstance(entry.get("timeout_ms"), int) or entry["timeout_ms"] <= 0
            or not isinstance(schema, dict) or schema.get("type") != "object"
            or schema.get("additionalProperties") is not False):
        raise RuntimeError(f"invalid managed execution contract for {name}")
    artifact_paths = entry.get("artifact_paths", [])
    if (not isinstance(artifact_paths, list) or len(artifact_paths) > 1
            or any(not isinstance(item, dict) or set(item) != {"field", "role"}
                   or item.get("role") != "deliverable"
                   or not isinstance(item.get("field"), str)
                   or not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", item["field"])
                   for item in artifact_paths)):
        raise RuntimeError(f"invalid managed execution artifact contract for {name}")
    properties = schema.get("properties")
    required = schema.get("required", [])
    attachment_argument = declaration.get("attachment_argument")
    if not isinstance(properties, dict) or not isinstance(required, list):
        raise RuntimeError(f"invalid managed execution input schema for {name}")
    if attachment_argument is None:
        if properties or required:
            raise RuntimeError(f"managed execution requires empty inputs for {name}")
        return
    if (not isinstance(attachment_argument, str) or not _MANAGED_ARGUMENT.fullmatch(attachment_argument)
            or set(properties) != {attachment_argument} or required != [attachment_argument]):
        raise RuntimeError(f"invalid managed execution attachment argument for {name}")
    field = properties[attachment_argument]
    file_input = field.get("x-lxe-file-input") if isinstance(field, dict) else None
    if (not isinstance(field, dict) or field.get("type") != "string"
            or not isinstance(file_input, dict)
            or file_input.get("accepted_extensions") != [".xlsx"]):
        raise RuntimeError(f"invalid managed execution XLSX input for {name}")


def validate_preselection_probe(entry: dict[str, Any]) -> None:
    """Require internal, input-only catalog probes with one fixed path argument."""
    if "preselection_probe" not in entry:
        return
    name = str(entry.get("name") or "<unknown>")
    schema = entry.get("input_schema")
    properties = schema.get("properties") if isinstance(schema, dict) else None
    field = properties.get("source_path") if isinstance(properties, dict) else None
    timeout = entry.get("timeout_ms")
    if (entry["preselection_probe"] is not True or entry.get("visibility") != "internal"
            or entry.get("exposed") is not False or entry.get("session_mode") != "none"
            or entry.get("owner_skills") != [] or "managed_execution" in entry
            or not isinstance(timeout, int) or isinstance(timeout, bool) or not 0 < timeout <= 2**53 - 1
            or not isinstance(schema, dict) or schema.get("type") != "object"
            or schema.get("additionalProperties") is not False
            or not isinstance(properties, dict) or set(properties) != {"source_path"}
            or not isinstance(field, dict) or field.get("type") != "string"
            or type(field.get("minLength")) is not int or field["minLength"] != 1
            or schema.get("required") != ["source_path"]
            or ("artifact_paths" in entry and entry["artifact_paths"] != [])):
        raise RuntimeError(f"invalid preselection probe contract for {name}")


def load_catalog() -> dict[str, dict[str, Any]]:
    path = Path(__file__).with_name("catalog.json")
    document = json.loads(path.read_text(encoding="utf-8"))
    if str(document.get("protocol_version") or "") != "1":
        raise RuntimeError("invalid script tool catalog protocol")
    # Fails loudly on a malformed dataset registry, same as the entry contract.
    load_datasets()
    entries: dict[str, dict[str, Any]] = {}
    modules: set[str] = set()
    command_paths: set[tuple[str, ...]] = set()
    legacy_aliases: set[str] = set()
    allowed_visibilities = {"business", "browser", "maintenance", "internal"}
    allowed_session_modes = {"none", "lxe_session"}
    for raw in list(document.get("entries") or []):
        entry = dict(raw or {})
        name = str(entry.get("name") or "").strip()
        module = str(entry.get("module") or "").strip()
        handler = str(entry.get("handler") or "").strip()
        if not name or name in entries:
            raise RuntimeError(f"duplicate or empty script tool name: {name}")
        if not module and not handler:
            raise RuntimeError(f"script tool has no handler: {name}")
        command_path = tuple(str(item).strip() for item in list(entry.get("command_path") or []))
        if not command_path or any(not item for item in command_path):
            raise RuntimeError(f"lxeskill command path is empty: {name}")
        if command_path in command_paths:
            raise RuntimeError(f"duplicate lxeskill command path: {' '.join(command_path)}")
        command_paths.add(command_path)
        visibility = str(entry.get("visibility") or "").strip()
        if visibility not in allowed_visibilities:
            raise RuntimeError(f"invalid lxeskill visibility for {name}: {visibility}")
        session_mode = str(entry.get("session_mode") or "").strip()
        if session_mode not in allowed_session_modes:
            raise RuntimeError(f"invalid lxeskill session mode for {name}: {session_mode}")
        owners = [str(owner).strip() for owner in list(entry.get("owner_skills") or []) if str(owner).strip()]
        entry["owner_skills"] = owners
        explicit_attribution = str(entry.get("attribution_skill") or "").strip()
        if len(owners) > 1 and not explicit_attribution:
            raise RuntimeError(f"multi-owner lxeskill command requires attribution_skill: {name}")
        if explicit_attribution and explicit_attribution not in owners:
            raise RuntimeError(f"lxeskill attribution_skill must be an owner: {name}")
        attribution_skill = explicit_attribution or (owners[0] if len(owners) == 1 else "")
        if attribution_skill:
            entry["attribution_skill"] = attribution_skill
        for declaration in list(entry.get("artifact_paths") or []):
            item = dict(declaration or {})
            selector = str(item.get("field") or "").strip()
            role = str(item.get("role") or "").strip()
            if not selector or any(not _SELECTOR_PART.fullmatch(part) for part in selector.split(".")):
                raise RuntimeError(f"invalid artifact path selector for {name}: {selector}")
            if role not in _ARTIFACT_ROLES:
                raise RuntimeError(f"invalid artifact path role for {name}: {role}")
        for alias_value in list(entry.get("legacy_aliases") or []):
            alias = str(alias_value).strip()
            if not alias or alias in legacy_aliases or alias in entries:
                raise RuntimeError(f"duplicate or empty lxeskill legacy alias: {alias}")
            legacy_aliases.add(alias)
        if module:
            if module in modules:
                raise RuntimeError(f"duplicate script tool module: {module}")
            modules.add(module)
            expected = (
                f"mabang_{module.rsplit('.', 1)[-1]}"
                if module.startswith("services.agent_cli.mabang.")
                else f"mabang_tms_{module.rsplit('.', 1)[-1]}"
                if module.startswith("services.agent_cli.mabang_tms.")
                else f"yacang_{module.rsplit('.', 1)[-1]}"
                if module.startswith("services.agent_cli.yacang.")
                else f"vietnam_replenishment_{module.rsplit('.', 1)[-1]}"
                if module.startswith("services.agent_cli.vietnam_replenishment.")
                else f"shangman_{module.rsplit('.', 1)[-1]}"
                if module.startswith("services.agent_cli.shangman.")
                else f"amazon_fba_{module.rsplit('.', 1)[-1]}"
                if module.startswith("services.agent_cli.browser.amazon_fba.")
                else f"amazon_operations_{module.rsplit('.', 1)[-1]}"
                if module.startswith("services.agent_cli.amazon_operations.")
                else f"media_{module.rsplit('.', 1)[-1]}"
                if module.startswith("services.media.")
                else f"assets_{module.rsplit('.', 1)[-1]}"
                if module.startswith("services.assets.")
                else ""
            )
            if expected != name:
                raise RuntimeError(f"script tool naming mismatch: {module} -> {name}")
        validate_managed_execution(entry)
        validate_preselection_probe(entry)
        entries[name] = entry
    return entries


def _is_within(path: Path, root: Path) -> bool:
    try:
        path.relative_to(root)
        return True
    except ValueError:
        return False


def allowed_output_file(raw_path: str, *, owner_skills: list[str] | tuple[str, ...] = ()) -> Path:
    path = Path(raw_path).expanduser()
    if not path.is_absolute():
        path = resolve_workspace_input(path)
    try:
        resolved = filesystem_path(path).resolve(strict=True)
    except FileNotFoundError as exc:
        raise ArtifactPathError(f"business CLI returned a missing file: {raw_path}") from exc
    if not resolved.is_file():
        raise ArtifactPathError(f"business CLI returned a path that is not a regular file: {raw_path}")
    roots = [filesystem_path(artifact_root()).resolve()]
    roots.extend(filesystem_path(skills_root() / skill / "assets").resolve() for skill in owner_skills)
    if not any(_is_within(resolved, root) for root in roots):
        raise ArtifactPathError(f"business CLI returned a file outside allowed artifact roots: {raw_path}")
    return display_path(resolved)


def _select_artifact_values(payload: Any, selector: str) -> list[Any]:
    values = [payload]
    for raw_part in selector.split("."):
        is_array = raw_part.endswith("[]")
        key = raw_part[:-2] if is_array else raw_part
        selected: list[Any] = []
        for value in values:
            if not isinstance(value, dict) or key not in value:
                continue
            child = value[key]
            if is_array:
                if child is None:
                    continue
                if not isinstance(child, list):
                    raise ArtifactPathError(f"declared artifact field is not an array: {selector}")
                selected.extend(child)
            else:
                selected.append(child)
        values = selected
    return values


def collect_declared_artifacts(entry: dict[str, Any], payload: dict[str, Any]) -> list[str]:
    owners = tuple(str(item) for item in list(entry.get("owner_skills") or []) if str(item).strip())
    deliverables: list[str] = []
    validated: dict[str, str] = {}
    delivered: set[str] = set()
    for declaration in list(entry.get("artifact_paths") or []):
        item = dict(declaration or {})
        selector = str(item.get("field") or "").strip()
        role = str(item.get("role") or "").strip()
        for raw_value in _select_artifact_values(payload, selector):
            if raw_value in (None, ""):
                continue
            if not isinstance(raw_value, (str, os.PathLike)):
                raise ArtifactPathError(f"declared artifact path is not a string: {selector}")
            raw_text = str(raw_value)
            provisional_key = os.path.normcase(str(Path(raw_text).expanduser()))
            resolved = validated.get(provisional_key)
            if resolved is None:
                resolved = str(allowed_output_file(raw_text, owner_skills=owners))
                validated[provisional_key] = resolved
            key = os.path.normcase(resolved)
            if role == "deliverable" and key not in delivered:
                delivered.add(key)
                deliverables.append(resolved)
    return deliverables


def _close_network_clients_best_effort() -> None:
    import asyncio

    from shared.infra.net import close_all_network_clients

    with contextlib.suppress(Exception):
        asyncio.run(close_all_network_clients())


def execute_module_json(
    entry: dict[str, Any],
    arguments: dict[str, Any],
    _session: dict[str, Any],
    *,
    on_event: Callable[[dict[str, Any]], None] | None = None,
    on_text: Callable[[str], None] | None = None,
) -> tuple[bool, list[dict[str, Any]], list[str], dict[str, str] | None]:
    module_name = str(entry.get("module") or "").strip()
    module = importlib.import_module(module_name)
    # The one business contract: run(arguments) -> payload dict, with the
    # catalog input_schema as the argument source. No argv round-trips and
    # no stdout capture.
    run = getattr(module, "run", None)
    if not callable(run):
        raise RuntimeError(f"business module has no callable run(): {module_name}")
    try:
        run_with_events = getattr(module, "run_with_events", None)
        payload = (
            run_with_events(dict(arguments or {}), on_event or (lambda _event: None))
            if callable(run_with_events)
            else run(dict(arguments or {}))
        )
    except Exception as exc:  # noqa: BLE001 — business failures become envelopes
        payload = {"success": False, "exception": f"{type(exc).__name__}: {exc}"}
    finally:
        _close_network_clients_best_effort()
    if not isinstance(payload, dict):
        raise RuntimeError(f"business run() must return an object: {module_name}")
    return _finalize_payload(entry, module_name, payload)


def _finalize_payload(
    entry: dict[str, Any],
    module_name: str,
    payload: dict[str, Any],
) -> tuple[bool, list[dict[str, Any]], list[str], dict[str, str] | None]:
    if "success" in payload:
        success = bool(payload.get("success"))
    elif "ok" in payload:
        success = bool(payload.get("ok"))
    else:
        success = True
    if "finished" in payload:
        success = success and bool(payload.get("finished"))
    deliver_on_failure = bool(entry.get("deliver_artifacts_on_failure", False))
    files = collect_declared_artifacts(entry, payload) if success or deliver_on_failure else []
    content = [{"type": "text", "text": json.dumps(payload, ensure_ascii=False, separators=(",", ":"))}]
    if success:
        return True, content, files, None
    error = payload.get("error")
    detail = error.get("message") if isinstance(error, dict) else None
    message = str(payload.get("exception") or payload.get("message") or detail or payload.get("notice") or f"{module_name} failed").strip()
    return False, content, files, {"code": "business_cli_failed", "message": message}


__all__ = [
    "ArtifactPathError",
    "allowed_output_file",
    "collect_declared_artifacts",
    "execute_module_json",
    "load_catalog",
]
