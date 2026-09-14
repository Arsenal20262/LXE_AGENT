import importlib.util
import json
import subprocess
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[4]
SCRIPTS = ROOT / "skills/skill-creator/scripts"
CASES = json.loads((ROOT / "packages/agent/runtime/test/fixtures/skill-manifests.json").read_text(encoding="utf-8"))


def load_script(name):
    spec = importlib.util.spec_from_file_location(name, SCRIPTS / f"{name}.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@pytest.mark.parametrize("case", CASES, ids=lambda case: case["title"])
@pytest.mark.parametrize("compatibility", [False, True])
def test_shared_manifest_fixtures(tmp_path, case, compatibility):
    root = tmp_path / "sample"
    root.mkdir()
    (root / "SKILL.md").write_text(case["content"], encoding="utf-8")
    for file, content in case.get("files", {}).items():
        target = root / file
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(content, encoding="utf-8")
    validate = load_script("quick_validate").validate
    if case["compatible" if compatibility else "strict"]:
        assert validate(root, compatibility=compatibility)["valid"]
    else:
        with pytest.raises(Exception):
            validate(root, compatibility=compatibility)


def test_initializer_does_not_publish_placeholder_or_overwrite_existing_skill(tmp_path):
    initialize = load_script("init_skill").initialize
    parent = tmp_path / "中文 (space)"
    root = initialize("weekly-report", parent, ["references", "scripts", "assets"])
    assert sorted(path.name for path in root.iterdir()) == ["assets", "references", "scripts"]
    (root / "SKILL.md").write_text("user instructions", encoding="utf-8")
    with pytest.raises(FileExistsError):
        initialize("weekly-report", parent, [])
    assert (root / "SKILL.md").read_text(encoding="utf-8") == "user instructions"
    with pytest.raises(ValueError):
        initialize("../escape", parent, [])


def test_cli_preserves_errors_and_never_executes_skill_scripts(tmp_path):
    root = tmp_path / "sample"
    root.mkdir()
    (root / "SKILL.md").write_text(CASES[0]["content"], encoding="utf-8")
    (root / "scripts").mkdir()
    marker = tmp_path / "executed"
    (root / "scripts" / "unsafe.py").write_text(f"from pathlib import Path\nPath({str(marker)!r}).touch()\n", encoding="utf-8")
    result = subprocess.run([sys.executable, str(SCRIPTS / "quick_validate.py"), str(root)], capture_output=True, text=True)
    assert result.returncode == 0
    assert json.loads(result.stdout)["valid"]
    assert not marker.exists()
    (root / "SKILL.md").write_text("---\nname: [\n---\n", encoding="utf-8")
    result = subprocess.run([sys.executable, str(SCRIPTS / "quick_validate.py"), str(root)], capture_output=True, text=True)
    assert result.returncode == 1
    assert "expected" in json.loads(result.stderr)["error"]
