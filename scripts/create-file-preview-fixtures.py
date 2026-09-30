"""Create editable Office acceptance samples, including upstream legacy fixtures."""
from pathlib import Path
import importlib.util
import shutil
import sys

repository = Path(__file__).resolve().parent.parent
root = Path(sys.argv[1] if len(sys.argv) > 1 else repository / "build/file-preview-validation/中文 samples").resolve()
root.mkdir(parents=True, exist_ok=True)
spec = importlib.util.spec_from_file_location("office_fixtures", repository / "scripts/verify-office-runtime.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
module.fixtures(root)
for extension, name in [("doc", "文档"), ("ppt", "幻灯片"), ("xls", "表格")]:
    shutil.copyfile(repository / f"apps/desktop/test/fixtures/file-preview/legacy.{extension}", root / f"旧 {name}.{extension}")
print(root)
