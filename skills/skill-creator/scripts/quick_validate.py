"""Validate Skill files without importing or executing their scripts."""

import argparse
import json
import re
import sys
from pathlib import Path, PureWindowsPath

import yaml


class SkillLoader(yaml.SafeLoader):
    """Use YAML 1.2 string/boolean rules and reject duplicate mapping keys."""

    yaml_implicit_resolvers = {
        key: [(tag, pattern) for tag, pattern in values
              if tag not in {"tag:yaml.org,2002:bool", "tag:yaml.org,2002:timestamp"}]
        for key, values in yaml.SafeLoader.yaml_implicit_resolvers.items()
    }

    def construct_mapping(self, node, deep=False):
        keys = set()
        for key_node, _ in node.value:
            key = self.construct_object(key_node, deep=deep)
            if not isinstance(key, (str, int, float, bool, type(None))):
                raise ValueError("skill YAML mapping keys must be scalar")
            if key in keys:
                raise ValueError(f"duplicate YAML key: {key}")
            keys.add(key)
        return super().construct_mapping(node, deep=deep)


SkillLoader.add_implicit_resolver(
    "tag:yaml.org,2002:bool", re.compile(r"^(?:true|True|TRUE|false|False|FALSE)$"), list("tTfF")
)


def validate(root: Path, *, compatibility: bool = False) -> dict:
    manifest = root / "SKILL.md"
    if manifest.stat().st_size > 1024 * 1024:
        raise ValueError(f"skill manifest exceeds 1048576 bytes: {manifest}")
    content = manifest.read_text(encoding="utf-8")
    match = re.match(r"^---\s*\r?\n([\s\S]*?)\r?\n---\s*(?:\r?\n|$)", content)
    if not match:
        raise ValueError(f"skill is missing YAML frontmatter: {manifest}")
    metadata = yaml.load(match[1], Loader=SkillLoader)
    if not isinstance(metadata, dict):
        raise ValueError(f"skill frontmatter must be an object: {manifest}")
    name = metadata.get("name")
    if not isinstance(name, str) or not name.strip():
        raise ValueError(f"skill name is required: {manifest}")
    if not compatibility:
        if len(name) > 64 or not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", name):
            raise ValueError("name must use lowercase letters, numbers and single hyphens, at most 64 characters")
        if root.name != name:
            raise ValueError("skill folder must match name")
        description = metadata.get("description")
        if not isinstance(description, str) or not description.strip():
            raise ValueError(f"skill description is required: {manifest}")
        if len(description) > 1024:
            raise ValueError("description must not exceed 1024 characters")
        if not content[match.end():].strip():
            raise ValueError("skill instructions must not be empty")
    references = metadata.get("references", [])
    if isinstance(references, list):
        for reference in references:
            requested = reference if isinstance(reference, str) else reference.get("path", "") if isinstance(reference, dict) else ""
            if not isinstance(requested, str):
                raise ValueError("skill reference path must be a string")
            requested = requested.replace("\\", "/")
            if not requested or requested.startswith("~") or Path(requested).is_absolute() or PureWindowsPath(requested).drive:
                raise ValueError(f"skill reference must be relative: {requested}")
            target = (root / requested).resolve()
            if not target.is_relative_to(root.resolve()):
                raise ValueError(f"skill reference escapes its root: {requested}")
            if not target.is_file():
                raise ValueError(f"skill reference does not exist: {requested}")
            if target.stat().st_size > 128 * 1024 * 1024:
                raise ValueError(f"skill reference exceeds 134217728 bytes: {requested}")
    commands = metadata.get("commands", metadata.get("command", []))
    if not isinstance(commands, list):
        commands = [commands]
    normalized = [str(command).strip() for command in commands if command is not None and str(command).strip()]
    if len(normalized) != len(set(normalized)):
        raise ValueError(f"duplicate command within skill {name}")
    return {"valid": True, "name": name, "path": str(manifest.resolve())}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("directory", type=Path)
    parser.add_argument("--compatibility", action="store_true")
    arguments = parser.parse_args()
    try:
        print(json.dumps(validate(arguments.directory, compatibility=arguments.compatibility), ensure_ascii=False))
        return 0
    except (OSError, ValueError, yaml.YAMLError) as error:
        print(json.dumps({"valid": False, "error": str(error)}, ensure_ascii=False), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
