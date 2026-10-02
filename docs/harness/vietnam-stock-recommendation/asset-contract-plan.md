# Vietnam Stock Recommendation Asset Contract Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Register the two Desktop-managed Vietnam input assets and validate the business template and SKU parameter workbook without storing real business data in Git.

**Architecture:** Keep the existing `shared.input_assets` registry as the source of asset slot identity. Add a read-only Vietnam contract module that validates a candidate workbook before later Desktop binding code can promote it. The generation command will consume only `current` assets and will not accept template paths from chat.

**Tech Stack:** Python 3.12, openpyxl, pytest, `uv`; catalog JSON shared by Python and Bun.

**Spec:** `docs/harness/vietnam-stock-recommendation/design.md`

## Global Constraints

- Final output sheets are exactly `越南备货清单`, `雅仓库存`, `雅仓动销`, `数据更改`, `库存商品信息`. The supplied nine-sheet workbook is an allowed input template; output pruning belongs to the workbook task, not this PR.
- Asset slots are `vietnam_replenishment_template` and `vietnam_sku_parameter_map`; the first is required at runtime and the second is optional.
- Parameter precedence is explicit SKU map value, then historical value for the same SKU in the full template, then an explicit business default (`热销=2`), then missing.
- SKU is the exact key. No style, color, suffix, model-number, or LLM guess may fill a missing value.
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

Later modules use these functions on copied run-local assets, merge the current VN8806 exports, produce exactly five sheets, recalculate with `shared.office`, and expose one Vietnam business command. Those modules have separate PR and test cycles.

### Task 1: Validate the full business template

**Files:**
- Create: `python/lxeskill_cli/services/vietnam_replenishment/__init__.py`
- Create: `python/lxeskill_cli/services/vietnam_replenishment/asset_contract.py`
- Create: `python/lxeskill_cli/tests/vietnam_replenishment/test_asset_contract.py`

**Interfaces:**
- Consumes: an existing `.xlsx` path; no asset store mutation.
- Produces: `TemplateContract(sheet_names: tuple[str, ...], main_rows: int)` or `AssetContractError` containing the actual invalid sheet or coordinate.

- [ ] **Step 1: Write a synthetic workbook test.** Build the five required sheets in a temporary `openpyxl.Workbook`, put `SKU` in `E1`, `判断热销` in `B1`, `成本` in `G1`, `陆运` in `H1`, `总在途` in `AN1`, and `30天` / `15天` / `7天` / `汇率` in `AV1:AY1`. Save it with `tmp_path`, then assert `validate_template(path).sheet_names` contains the five names. Add one extra sheet and assert it is accepted, because the provided nine-sheet template is valid input.
- [ ] **Step 2: Verify the test fails.** Run `UV_CACHE_DIR=/private/tmp/uv-vietnam-cache uv run --frozen --no-sync pytest -q python/lxeskill_cli/tests/vietnam_replenishment/test_asset_contract.py`; expect import failure for the missing contract module.
- [ ] **Step 3: Implement the minimal validator.** Define `REQUIRED_SHEETS` and `MAIN_HEADERS` as constants; open with `load_workbook(path, read_only=True, data_only=False)`, verify all five sheet names and the named headers at their exact coordinates, count nonblank SKU cells in column E from row 2, and close the workbook in `finally`. Wrap workbook read errors in `AssetContractError` with the real exception class and message; do not replace them with a generic success/failure string.
- [ ] **Step 4: Add negative cases.** Test a missing target sheet, a moved SKU header, a malformed XLSX, and the supplied real template as a local-only manual probe. Keep the real workbook path out of test fixtures and committed files.
- [ ] **Step 5: Run the focused test.** Use the command from Step 2 and confirm its collected count is nonzero and every test passes.

### Task 2: Parse explicit SKU parameters without guessing

**Files:**
- Modify: `python/lxeskill_cli/services/vietnam_replenishment/asset_contract.py`
- Modify: `python/lxeskill_cli/tests/vietnam_replenishment/test_asset_contract.py`

**Interfaces:**
- Consumes: first worksheet with headers `SKU`, `成本`, `跨境价`, `折扣价`, `热销标记`; optional `上架时间` may be present as an explicit SKU-level input.
- Produces: `dict[str, SkuParameters]`, where `SkuParameters` has `cost`, `cross_border_price`, `discount_price` as `Decimal | None`, `hot_flag` as `int | None`, and `listed_at` as `str | None`. Blank cells remain `None`; numeric zero remains an explicit `Decimal(0)`.

- [ ] **Step 1: Write parameter tests.** Use an in-memory synthetic workbook: two distinct SKUs with different cost/price, one blank field, and one explicit numeric zero. Assert exact SKU lookup, `None` for blank, and preserved zero. Add tests for duplicate SKU, blank SKU, nonnumeric price, a formula in an input cell, and a hot flag outside `{1, 2}`.
- [ ] **Step 2: Verify the new tests fail.** Run the focused test file; expect failure because `load_sku_parameters` and `SkuParameters` are absent.
- [ ] **Step 3: Implement the parser.** Resolve required headers by name rather than fixed position, reject duplicates, read formula view so a formula cannot masquerade as an explicit value, normalize SKU with `str(value).strip()` without modifying internal characters, parse numeric fields using `Decimal(str(value))`, require finite nonnegative values, and accept only `1` or `2` for an explicit hot flag. Allow the optional `上架时间` column as text/date but do not infer it from the 雅仓 `创建时间` column.
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

- [ ] **Step 1: Write registry tests.** Assert the two new IDs exist, have distinct `vietnam/...` directories, report `management == "desktop"`, and are absent from every business command's `x-lxe-asset-slot` input field. Adjust the existing all-slots-bound assertion to apply only to `management == "command"` slots.
- [ ] **Step 2: Verify the tests fail.** Run `UV_CACHE_DIR=/private/tmp/uv-vietnam-cache uv run --frozen --no-sync pytest -q python/lxeskill_cli/tests/infra/test_input_assets.py`; expect missing slot or management failures.
- [ ] **Step 3: Extend the registry.** Add `management` at the end of `InputAsset`; parse only `command` and `desktop` in `load_input_assets`, default existing entries to `command`, expose it in `services.assets.inspect.run`, and add the two catalog entries with `management: "desktop"`. Do not add a template-path field to the public Vietnam command.
- [ ] **Step 4: Run both catalog consumers.** From the worktree root run `UV_CACHE_DIR=/private/tmp/uv-vietnam-cache uv run --frozen --no-sync pytest -q python/lxeskill_cli/tests/lxeskill python/lxeskill_cli/tests/infra` and `bun test packages/agent/runtime/test/tooling/lxeskill-command.test.ts`. Check each exit code and confirm tests were collected.

### Task 4: Document the contract and prepare the next PR

**Files:**
- Create: `docs/harness/vietnam-stock-recommendation/asset-contract.md`
- Modify: `docs/README.md`

- [ ] **Step 1: Document only stable behavior.** State the two slot IDs, allowed workbook structure, exact parameter headers, explicit-value semantics, five output sheet names, and that the real workbook stays outside Git. Link the copied design document and note that asset binding and generation are separate downstream modules.
- [ ] **Step 2: Review the PR diff.** Run `git diff --check`, `git status --short`, and inspect `git diff` plus untracked files. Confirm no `.xlsx`, credential, generated Office result, or unrelated file is staged or tracked.
- [ ] **Step 3: Record handoff.** Report branch/worktree, changed files, validator interfaces, relevant test results, known limitations, downstream PR dependencies, and next work. Propose `git add` and `git commit` for this module; do not run either before the user's Git approval.
