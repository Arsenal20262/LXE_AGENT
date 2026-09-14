"""Create a new Skill directory; write the finished SKILL.md with file tools."""

import argparse
import json
import re
import sys
from pathlib import Path


def initialize(name: str, parent: Path, resources: list[str]) -> Path:
    if len(name) > 64 or not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", name):
        raise ValueError("name must use lowercase letters, numbers and single hyphens, at most 64 characters")
    if any(resource not in {"scripts", "references", "assets"} for resource in resources):
        raise ValueError("resources must be scripts, references or assets")
    parent.mkdir(parents=True, exist_ok=True)
    destination = parent / name
    destination.mkdir()  # Never overwrite or initialize an existing skill.
    for resource in set(resources):
        (destination / resource).mkdir()
    return destination.resolve()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("name")
    parser.add_argument("--path", required=True, type=Path)
    parser.add_argument("--resources", default="")
    arguments = parser.parse_args()
    try:
        destination = initialize(arguments.name, arguments.path, [item.strip() for item in arguments.resources.split(",") if item.strip()])
        print(json.dumps({"directory": str(destination), "next": "Write SKILL.md, then run quick_validate.py"}, ensure_ascii=False))
        return 0
    except (OSError, ValueError) as error:
        print(json.dumps({"error": str(error)}, ensure_ascii=False), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
