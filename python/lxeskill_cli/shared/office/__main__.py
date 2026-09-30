"""Run with ``uv run --frozen python -m shared.office <operation> ...``."""

from __future__ import annotations

import os
from pathlib import Path
import signal
import subprocess
import sys

KIT_OPERATIONS = {"capabilities", "recalculate", "render", "convert"}
HELP = """Usage: python -m shared.office <operation> [arguments]

  check FILE [--out JSON] [--contains TEXT] [--count N]
  capabilities --json
  recalculate --input FILE --output FILE
  render --input FILE --output-dir DIR [--pages 1,3 | --sheet NAME --range A1:D20]
  convert --input FILE --output FILE

Kit arguments, stdout, stderr and exit status are passed through unchanged.
Relative file paths use the current working directory. The launcher uses the
absolute LXE_OFFICE_NODE and LXE_OFFICE_CLI paths supplied by the LXE host.
"""


def configured_file(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        raise ValueError(f"{name} is not configured; prepare the LXE Office runtime and restart the host")
    path = Path(value)
    if not path.is_absolute():
        raise ValueError(f"{name} must be an absolute path: {value}")
    if not path.is_file():
        raise FileNotFoundError(f"{name} is not a file: {value}")
    return str(path)


def run_kit(arguments: list[str]) -> int:
    process = subprocess.Popen([configured_file("LXE_OFFICE_NODE"), configured_file("LXE_OFFICE_CLI"), *arguments])
    previous = {}

    def forward(signum: int, _frame: object) -> None:
        if process.poll() is None:
            process.send_signal(signum)

    try:
        for signum in (signal.SIGINT, signal.SIGTERM):
            previous[signum] = signal.signal(signum, forward)
        code = process.wait()
        return 128 - code if code < 0 else code
    finally:
        for signum, handler in previous.items():
            signal.signal(signum, handler)


def main() -> int:
    arguments = sys.argv[1:]
    if not arguments or arguments[0] in {"--help", "-h"}:
        print(HELP)
        return 0
    if arguments[0] == "check":
        from . import check

        sys.argv = ["shared.office check", *arguments[1:]]
        return check.main()
    if arguments[0] not in KIT_OPERATIONS:
        print(f"Unknown Office operation: {arguments[0]}\n{HELP}", file=sys.stderr)
        return 2
    try:
        return run_kit(arguments)
    except (OSError, ValueError) as error:
        print(f"{type(error).__name__}: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
