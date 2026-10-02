# Vietnam PR3 Workbook Implementation Plan

> **For agentic workers:** Implement the checked tasks in this isolated PR3 worktree. Review each task's focused tests and diff before proposing a commit. Repository `AGENTS.md` requires user approval before any Git state-changing command.

**Goal:** Generate a complete, recalculated five-sheet Vietnam workbook from one current VN8806 source snapshot and an explicit SKU parameter map, without a previously uploaded business template.

**Architecture:** A distributable data-free workbook skeleton supplies audited formulas and layout. A pure writer validates the same-run inputs and fills only current SKUs. A separate Office Kit adapter recalculates a staged file; a validator reads formulas and cached results before atomic publication.

**Tech Stack:** Python 3.12.10, openpyxl, `uv --frozen`, existing `shared.office` LibreOffice Kit launcher, Hatchling wheel, Bun for the project Office runtime.

**Spec:** [pr3-workbook-design.md](pr3-workbook-design.md). The broader product target is [design.md](design.md), with the PR3-specific source and template decisions in the new spec taking precedence.

## Global constraints

- Work only on `codex/vietnam-stock-pr3-workbook`, based on PR2 commit `405e5586`; do not modify `main` or the PR2 branch.
- Never include the real nine-sheet XLSX, real SKU rows, prices, pictures, comments, hyperlinks, hidden metadata, or credentials in Git or the package.
- Current SKUs are the union of VN8806 sales and current inventory. Every SKU needs all three source rows, authoritative inventory `在途数量`, and explicit map cost, cross-border price, and discount price.
- Product `创建时间` is the user-confirmed listing time. Normalize it to `YYYY-MM-DD HH:MM` text for the template's `DATEVALUE(LEFT(AA,10))` formula; no template-history fallback.
- Keep exactly five target sheets. `AN` is the authoritative in-transit literal; `AO:AU` stays blank. Hot flag defaults to `2` when absent.
- Tests use synthetic fixtures; never call production Yacang. Run Python tests from repository root. Run one full suite only at final merge readiness, not during PR3 development.

---

### Task 1: Create and package a data-free five-sheet skeleton

**Files:**
- Create: `scripts/build-vietnam-skeleton.py`
- Create: `python/lxeskill_cli/services/vietnam_replenishment/resources/skeleton.xlsx`
- Create: `python/lxeskill_cli/tests/vietnam_replenishment/test_skeleton.py`
- Modify if required by a wheel-member check: `pyproject.toml`

**Interfaces:**
- Consumes: the real nine-sheet template only as a local read-only maintainer input.
- Produces: a package resource with exactly five named sheets, row 1 headers, one blank main row 2 with audited formulas/styles, and four default inputs in `数据更改!A2:D2`.

- [ ] Add a test that opens the skeleton, checks the five sheets and expected formula cells (`H2`, `J2:AC2`, `AF2:AI2`, `AK2:AM2`, `AV2:AY2`), and verifies `E2`, `G2`, `AE2`, `AJ2`, `AN2`, `AO2:AU2` contain no business literals.
- [ ] Add ZIP-level assertions rejecting `xl/media/`, drawings, comments, custom XML, external links, hyperlinks, document custom properties, nonempty historical SKU rows, and recognizable real-template SKU/price strings. Confirm the exact resource appears in the built wheel.
- [ ] Run `uv run --frozen pytest -q python/lxeskill_cli/tests/vietnam_replenishment/test_skeleton.py` and observe the missing resource failure.
- [ ] Build the resource from a fresh `openpyxl.Workbook()`: copy only whitelisted headers, donor formula text, styles, dimensions, and defaults. Use an `AK:AM` donor row with valid formulas; translate it to row 2. Recreate `AC2` as a one-cell `ArrayFormula`. Do not copy any worksheet, row object, image, comment, hyperlink, or ZIP member from the source.
- [ ] Run the focused test, build a wheel with `uv build --wheel --offline` using cached pinned Hatchling, and inspect the wheel member list for `services/vietnam_replenishment/resources/skeleton.xlsx`. Review its ZIP structure and diff; propose one independent feature commit after user approval.

### Task 2: Validate current inputs and fill the skeleton

**Files:**
- Create: `python/lxeskill_cli/services/vietnam_replenishment/workbook.py`
- Create: `python/lxeskill_cli/tests/vietnam_replenishment/test_workbook.py`

**Interfaces:**
- Consumes: `VietnamSources` from `yacang_sources.py`, `load_sku_parameters()` and `SkuParameters` from `asset_contract.py`, packaged `skeleton.xlsx`.
- Produces: `RecommendationConfig` and `write_vietnam_workbook(path: Path, sources: VietnamSources, parameters: Mapping[str, SkuParameters], config: RecommendationConfig) -> None`.

- [ ] Write synthetic tests for exact SKU union, missing sales/inventory/products/in-transit/map values, explicit zero, hot default, extra map SKUs, old map listing-time conflict, and an output path that already exists. Assert failures include concrete SKU and field names.
- [ ] Run `uv run --frozen pytest -q python/lxeskill_cli/tests/vietnam_replenishment/test_workbook.py` and observe failures before implementation.
- [ ] Validate every current SKU before writing. Convert validated product time with `datetime.strptime(...).strftime("%Y-%m-%d %H:%M")`; keep it as text. Reject an old explicit `listed_at` value if it describes a different timestamp. Require finite nonnegative prices from the existing loader.
- [ ] Project each auxiliary row by the skeleton's header text, not source column index. Copy main row-2 style to each current row; translate same-row formulas to that row, recreate the `AC` array ref, and keep `AV:AY` fixed to `数据更改!A2:D2`. Set `B/E/F/G/AE/AJ/AN` explicitly; keep `A/C/D/AD/AO:AU` empty.
- [ ] Run the focused tests, check representative formula text at first/middle/last rows and source-table column order, then inspect diff; propose a separate feature commit after user approval.

### Task 3: Recalculate, validate, and publish atomically

**Files:**
- Create: `python/lxeskill_cli/services/vietnam_replenishment/recalculation.py`
- Create: `python/lxeskill_cli/tests/vietnam_replenishment/test_recalculation.py`
- Keep composition in `python/lxeskill_cli/services/vietnam_replenishment/recalculation.py`; the writer remains a separate pure entry.

**Interfaces:**
- Consumes: `write_vietnam_workbook()`, `shared.office` launcher, `VietnamSources`, and map path.
- Produces: `generate_vietnam_workbook(map_path: str | Path, output_path: str | Path, *, sources: VietnamSources, config: RecommendationConfig | None = None) -> Path`.

- [ ] Test that an injected failing Kit subprocess preserves its actual redacted diagnostic, leaves no final XLSX, and does not overwrite an existing output. Test the successful staged path with a small synthetic workbook and a controlled recalculator.
- [ ] Implement the production Kit call through `sys.executable -m shared.office recalculate --input STAGED --output RECALCULATED`, bounded by a timeout; `LXE_OFFICE_NODE` and `LXE_OFFICE_CLI` come from the host. Do not invoke system LibreOffice or call Yacang.
- [ ] Validate exact sheet names and SKU sets, full headers and source rows, canonical product times, map literals, current in-transit, missing historical batches, every audited formula, cached `J:M`/`AA`/parameters, and final `H` recomputed from cached operands for every current SKU. Permit `AB=#DIV/0!` only when cached `S=0` and final `H` is valid; reject other critical formula errors.
- [ ] Atomically move the validated recalculated file to a new output path. Run `uv run --frozen pytest -q python/lxeskill_cli/tests/vietnam_replenishment/test_recalculation.py python/lxeskill_cli/tests/vietnam_replenishment/test_workbook.py`; review diff; propose a separate feature commit after user approval.

### Task 4: Verify real formula compatibility and hand off

**Files:**
- Modify: `docs/harness/vietnam-stock-recommendation/design.md`, `current-sku-map.md`, and `asset-contract.md` only where the new approved source/template policy supersedes old statements.
- Create: `docs/harness/vietnam-stock-recommendation/handoff-pr3.md`

- [ ] Prepare this worktree's own `.venv` with `uv sync --frozen` and the project's Office runtime with `bun scripts/prepare-office-runtime.ts`; do not copy either from another checkout.
- [ ] Use synthetic old/new/low-sales SKU cases with the real Kit. Independently calculate representative expected values for sales aggregation, hot flag, listing-date classification, in-transit, and final replenishment. Verify the output opened in formula and data-only modes, and visually inspect all five sheets.
- [ ] Run focused PR1/PR2/PR3 and existing 雅仓 tests once from repository root. Verify wheel resource inclusion, `git diff --check`, `git status`, changed-file list, and scans for real data/secrets. Do not run the repository-wide suite until final merge readiness.
- [ ] Record branch, base, entry point, environment variables, tests, limits, and follow-on PR4/PR5 dependency in the handoff. Report reviewable results and request separate approval before any `git add`/commit, push, or PR creation.
