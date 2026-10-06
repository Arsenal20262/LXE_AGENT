# Vietnam Stock Recommendation Asset Contract Implementation Plan

> **For agentic workers:** Execute one checked task at a time with the available `executing-plans` skill or collaboration subagents. Review and request Git approval after each independently testable change.

**Goal:** Register the two Desktop-managed Vietnam input assets and validate the business template and SKU parameter workbook without storing real business data in Git.

**Architecture:** Keep the existing `shared.input_assets` registry as the source of asset slot identity. Add a read-only Vietnam contract module that validates a candidate workbook before later Desktop binding code can promote it. The generation command will consume only `current` assets and will not accept template paths from chat.

**Tech Stack:** Python 3.12, openpyxl, pytest, `uv`; catalog JSON shared by Python and Bun.

**Spec:** `docs/harness/vietnam-stock-recommendation/design.md`

## Global Constraints

- Final output sheets are exactly `越南备货清单`, `雅仓库存`, `雅仓动销`, `数据更改`, `库存商品信息`. The supplied nine-sheet workbook is an allowed input template; output pruning belongs to the workbook task, not this PR.
- The template's 8,300 historical SKU rows are input history only. The final workbook must contain only SKUs from the current VN8806 雅仓 exports; the output row set is never copied wholesale from the template.
- The later operations-facing SKU workbook is derived from the same current VN8806 SKU set. Its editable columns cover only SKU-level business inputs absent from the three 雅仓 exports; template history can be shown as reference but must not silently become an explicit map override. Missing or conflicting values stay visibly unresolved for operations to check. Generating and merging that workbook belongs to a later PR, after the current three exports are available.
- Asset slots are `vietnam_replenishment_template` and `vietnam_sku_parameter_map`; the first is required at runtime and the second is optional.
- Parameter precedence is explicit SKU map value, then historical value for the same SKU in the full template, then an explicit business default (`热销=2`), then missing.
- SKU is the exact key. No style, color, suffix, model-number, or LLM guess may fill a missing value.
- The supplied historical template has duplicate SKU rows. Structural validation accepts them; later history merging may use a field only when every row for that SKU agrees, otherwise it marks that field missing.
- Current asset replacement must validate and hash a candidate before switching, and a failed replacement must preserve the old current. This PR defines validation and slot identity; the later Desktop binding PR implements promotion.
- No real template, SKU map, cost/price data, account secret, or production export is committed or packaged.
- Development stays in a `codex/` pool worktree. Run Python with `uv`, JavaScript with `bun`, and tests from repository root. Do not modify `main`.

---

## PR boundary and downstream interfaces

This is the first small reviewable module. It provides:

```python
from services.vietnam_replenishment.asset_contract import (
    AssetContractError,
    SkuParameters,
    TemplateContract,
    load_sku_parameters,
    validate_template,
)

validate_template(path: str | Path) -> TemplateContract
load_sku_parameters(path: str | Path) -> dict[str, SkuParameters]
```

Later modules use these functions on copied run-local assets, merge the current VN8806 exports, produce exactly five sheets, recalculate with `shared.office`, and expose one Vietnam business command. They also extract an operations-facing SKU workbook from only the current VN8806 SKU set and the SKU-level fields missing from 雅仓. Those modules have separate PR and test cycles.

### Task 1: Validate the full business template

**Files:**
- Create: `python/lxeskill_cli/services/vietnam_replenishment/__init__.py`
- Create: `python/lxeskill_cli/services/vietnam_replenishment/asset_contract.py`
- Create: `python/lxeskill_cli/tests/vietnam_replenishment/test_asset_contract.py`

**Interfaces:**
- Consumes: an existing `.xlsx` path; no asset store mutation.
- Produces: `TemplateContract(sheet_names: tuple[str, ...], main_rows: int)` or `AssetContractError` containing the actual invalid sheet or coordinate.

- [ ] **Step 1: Write a synthetic workbook test.** Build the five required sheets in a temporary `openpyxl.Workbook`. Put `判断热销` / `SKU` / `成本` / `陆运` / `上架时间` / `跨境价` / `折扣价` / `总在途` at main-sheet `B1` / `E1` / `G1` / `H1` / `AA1` / `AE1` / `AJ1` / `AN1`, and `30天` / `15天` / `7天` / `汇率` at `AV1:AY1`. Put the SKU and consumed source headers at `雅仓库存!B1/F1/H1/J1`, `雅仓动销!A1/E1/F1/G1`, `数据更改!A1:D1`, and `库存商品信息!B1/K1`. Put public default values `0.8, 0.8, 0, 3900` in `数据更改!A2:D2` and corresponding reference formulas in main-sheet `AV2:AY2`. Save it with `tmp_path`, then assert `validate_template(path).sheet_names` contains the five names. Add an extra sheet and duplicate history SKU row, asserting both are accepted because the supplied template contains them.
- [ ] **Step 2: Verify the test fails.** Run `uv run --frozen --no-sync pytest -q python/lxeskill_cli/tests/vietnam_replenishment/test_asset_contract.py` from the worktree root; expect import failure for the missing contract module. If an isolated uv cache is needed, set `UV_CACHE_DIR` to a local temporary directory.
- [ ] **Step 3: Implement the minimal validator.** Define `REQUIRED_SHEETS` and a per-sheet header-coordinate map as constants; open with `load_workbook(path, read_only=True, data_only=False)`, verify all five sheet names and the named headers at their exact coordinates, count nonblank SKU cells in main-sheet column E from row 2, and close the workbook in `finally`. Verify that `数据更改!A2:D2` is the parameter input row and main-sheet `AV2:AY2` contains references to it; later code must write the former, not overwrite formulas in the latter. Wrap workbook read errors in `AssetContractError` with the real exception class and message; do not replace them with a generic success/failure string.
- [ ] **Step 4: Add negative cases.** Test a missing target sheet, a moved SKU header, a malformed XLSX, and the supplied real template as a local-only manual probe. Keep the real workbook path out of test fixtures and committed files.
- [ ] **Step 5: Run the focused test.** Use the command from Step 2 and confirm its collected count is nonzero and every test passes.

### Task 2: Parse explicit SKU parameters without guessing

**Files:**
- Modify: `python/lxeskill_cli/services/vietnam_replenishment/asset_contract.py`
- Modify: `python/lxeskill_cli/tests/vietnam_replenishment/test_asset_contract.py`

**Interfaces:**
- Consumes: first worksheet with headers `SKU`, `成本`, `跨境价`, `折扣价`, `热销标记`; optional `上架时间` may be present as an explicit SKU-level input.
- Produces: `dict[str, SkuParameters]`, where `SkuParameters` has `cost`, `cross_border_price`, `discount_price` as `Decimal | None`, `hot_flag` as `int | None`, and `listed_at` as `str | None`. Blank cells remain `None`; numeric zero remains an explicit `Decimal(0)`.

- [ ] **Step 1: Write parameter tests.** Create a synthetic workbook and save it under `tmp_path`: two distinct text SKUs with different cost/price, one blank field, and one explicit numeric zero. Assert exact SKU lookup, `None` for blank, and preserved zero. Add tests for duplicate SKU, blank or numeric SKU, nonnumeric price, a formula in an input cell, and a hot flag outside `{1, 2}`. Skip an entirely blank trailing row; reject a nonblank row without SKU.
- [ ] **Step 2: Verify the new tests fail.** Run the focused test file; expect failure because `load_sku_parameters` and `SkuParameters` are absent.
- [ ] **Step 3: Implement the parser.** Resolve required headers by name rather than fixed position, reject duplicates, read formula view so a formula cannot masquerade as an explicit value, accept only text SKU cells and strip surrounding whitespace without modifying internal characters, parse numeric fields using `Decimal(str(value))`, require finite nonnegative values, and accept only `1` or `2` for an explicit hot flag. Allow the optional `上架时间` column as text/date but do not infer it from the 雅仓 `创建时间` column.
- [ ] **Step 4: Re-run the focused test.** Confirm all added cases pass. Do not add tests that merely duplicate the parser implementation.

### Task 3: Register Desktop-managed asset slots

**Files:**
- Modify: `python/lxeskill_cli/lxeskill/catalog.json`
- Modify: `python/lxeskill_cli/shared/input_assets.py`
- Modify: `python/lxeskill_cli/services/assets/inspect.py`
- Modify: `python/lxeskill_cli/tests/infra/test_input_assets.py`

**Interfaces:**
- `InputAsset.management` is `"command"` for existing slots and `"desktop"` for the two new Vietnam slots.
- `load_input_assets()` remains the single registry loader; `current_asset(slot_id)` remains the read-only runtime entry.

- [ ] **Step 1: Write registry tests.** Assert the two new IDs exist, have distinct `vietnam/...` directories, report `management == "desktop"`, and are absent from every catalog command's `x-lxe-asset-slot` input field. Assert generic `promote_asset` rejects both Desktop-managed slots. Adjust the existing all-slots-bound assertion to apply only to `management == "command"` slots.
- [ ] **Step 2: Verify the tests fail.** Run `uv run --frozen --no-sync pytest -q python/lxeskill_cli/tests/infra/test_input_assets.py` from the worktree root; expect missing slot or management failures.
- [ ] **Step 3: Extend the registry.** Add `management` at the end of `InputAsset`; parse only `command` and `desktop` in `load_input_assets`, default existing entries to `command`, expose it in `services.assets.inspect.run`, and add the two catalog entries with `management: "desktop"`. Make generic `promote_asset` reject Desktop-managed slots; the later Main-controlled binding entry will validate, hash and promote them. Do not add a template-path field to the public Vietnam command.
- [ ] **Step 4: Run both catalog consumers.** From the worktree root run `uv run --frozen --no-sync pytest -q python/lxeskill_cli/tests/lxeskill python/lxeskill_cli/tests/infra` and `bun test packages/agent/runtime/test/tooling/lxeskill-command.test.ts`. Check each exit code and confirm tests were collected.

### Task 4: Document the contract and prepare the next PR

**Files:**
- Create: `docs/harness/vietnam-stock-recommendation/asset-contract.md`
- Modify: `docs/README.md`

- [ ] **Step 1: Document only stable behavior.** State the two slot IDs, allowed workbook structure, exact parameter headers, explicit-value semantics, five output sheet names, and that the real workbook stays outside Git. Link the copied design document and note that asset binding and generation are separate downstream modules.
- [ ] **Step 2: Review the PR diff.** Run `git diff --check`, `git status --short`, and inspect `git diff` plus untracked files. Confirm no `.xlsx`, credential, generated Office result, or unrelated file is staged or tracked.
- [ ] **Step 3: Record handoff.** Report branch/worktree, changed files, validator interfaces, relevant test results, known limitations, downstream PR dependencies, and next work. Propose `git add` and `git commit` for this module; do not run either before the user's Git approval.
