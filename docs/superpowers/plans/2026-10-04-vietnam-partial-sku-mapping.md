# Vietnam Partial SKU Mapping Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep every current VN8806 SKU in the five-sheet recommendation when its operator mapping is absent or has blank prices, while leaving only dependent results blank.

**Architecture:** Keep the PR5 trusted current-map transaction and one-map Desktop upload path. Loosen only the mapped-price completeness check, left join the current Yacang SKU set to the operator map, and use one small formula-dependency helper in both the writer and post-Office validator so blank results cannot hide a bad formula or cache.

**Tech Stack:** Python 3, `uv`, `openpyxl`, packaged XLSX skeleton, project `shared.office` LibreOffice Kit, `pytest`.

**Spec:** `docs/superpowers/specs/2026-10-04-vietnam-partial-sku-mapping-design.md`

## Global Constraints

- Work only on `codex/vietnam-stock-pr6-partial-mapping`, based on PR5 `dbde3e56`; never develop on `main`.
- One Desktop uploaded `.xlsx` map and the packaged five-sheet skeleton remain the only operator-side inputs. Do not call production Yacang or use history or fuzzy SKU matching.
- A trusted current map must exist and contain at least one valid SKU; retain exact headers, unique text SKU, no formula input cells, nonblank price numeric/Excel precision checks, safe XLSX limits, manifest/digest/revision checks, and pre-Yacang failure for invalid map/config.
- Map row absent: B/G/AE/AJ and H/AC/AF:AM blank; current Yacang source fields and independent calculations remain. Existing row with blank hot flag: B=2. Existing row with blank individual prices: blank only the field and dependent finance columns. Explicit zero is present, including the existing zero-price margin error behavior.
- Keep all five sheets and exact current Yacang SKU set. Keep Office Kit recalculation and reject unexpected formula errors, missing formulas, numeric zero in a required blank cache, or empty required numeric caches.
- Run Python tests from repository root using `uv run pytest ...`; use this worktree's own `uv sync --frozen` environment. Run targeted tests during development, full suite only after final `main` synchronization before merge.
- For each independently verified step: inspect diff, ask for approval before `git add`/`git commit`. Ask separately before push, PR creation, or merge.

---

## File map

| File | Responsibility |
| --- | --- |
| `python/lxeskill_cli/services/vietnam_replenishment/asset_contract.py` | Parse and validate a sparse but nonempty operator map. |
| `python/lxeskill_cli/services/vietnam_replenishment/sku_map_store.py` | Apply the sparse-map validator to candidate, staged, current and previous versions without changing storage mechanics. |
| `python/lxeskill_cli/services/vietnam_replenishment/formula_dependencies.py` (new) | Describe which direct mapping cells each conditional formula needs and construct the exact guarded formula. |
| `python/lxeskill_cli/services/vietnam_replenishment/workbook.py` | Left join current Yacang rows, preserve mapped/unmapped hot-flag distinction, and write guarded formulas. |
| `python/lxeskill_cli/services/vietnam_replenishment/recalculation.py` | Verify guarded formulas and blank/numeric Office caches by the same dependencies. |
| `python/lxeskill_cli/tests/vietnam_replenishment/{test_asset_contract,test_sku_map_store,test_workbook,test_recalculation,test_workflow,test_pr5_integration}.py` | Focused contracts and isolated end-to-end regression. |
| `docs/harness/vietnam-stock-recommendation/{design,asset-contract,current-sku-map,handoff-pr6}.md`, `docs/harness/skill/current_skill_catalog.md`, `skills/vietnam-stock-recommendation/SKILL.md` | Current operator-facing behavior and handoff; historical PR3/PR5 documents remain historical. |

### Task 1: Accept a sparse but valid current map

**Files:** Modify `asset_contract.py`, `sku_map_store.py`, `test_asset_contract.py`, `test_sku_map_store.py`, `test_workflow.py`.

**Interfaces:** Rename `validate_complete_sku_parameters(path: str | Path) -> dict[str, SkuParameters]` to `validate_usable_sku_parameters(...)`, update its store import, and keep `load_sku_parameters()` unchanged. The return still maps trimmed exact SKU strings to `SkuParameters` with `Decimal | None` prices.

- [x] **Step 1: Prepare this worktree's Python environment.** Run `uv sync --frozen` from the repository root; do not reuse another worktree's `.venv` or change the lockfile. If sandbox access to the host uv cache fails, retry through the approved sandbox escalation path rather than sharing a `.venv`.

- [x] **Step 2: Write failing parser/store tests.** Replace the old blank-price rejection case with a parameterized acceptance test; retain the existing inexact-price and empty-first-sheet rejection cases. Add store installation/snapshot of a row with blank discount and a second SKU whose three prices are blank. For the parser test, use the existing `_sku_map` helper:

  ```python
  path = _sku_map(tmp_path / "sparse.xlsx", (None, None, "VN-A", 1, 2))
  values = validate_usable_sku_parameters(path)
  assert values["VN-A"].discount_price is None
  assert values["VN-A"].cost == Decimal("1")
  ```

  In the separate store test, append `("VN-B", None, None, None, None)` and `("VN-C", 0, 0, 0, None)` through `openpyxl` before installation; check snapshot values and no source export. Update `test_workflow.py` so a blank-price current is allowed past the preflight and reaches a monkeypatched `export_vietnam_sources`; stub `generate_vietnam_workbook` in that unit test so it does not need Office Kit. Keep missing/broken/empty current and bad config failing before export.

- [x] **Step 3: Run the focused tests and record the expected pre-change failures.** Run `uv run pytest python/lxeskill_cli/tests/vietnam_replenishment/test_asset_contract.py python/lxeskill_cli/tests/vietnam_replenishment/test_sku_map_store.py python/lxeskill_cli/tests/vietnam_replenishment/test_workflow.py -q`. The new sparse-map tests must fail for the old completeness check; existing safety tests must still run.

- [x] **Step 4: Change the validator only where completeness is enforced.** Keep parsing and file safety rules. The core loop becomes:

  ```python
  values = load_sku_parameters(path)
  if not values:
      raise AssetContractError("当前越南 SKU 参数映射表没有 SKU，请重新上传")
  for sku, row in values.items():
      for field, label in (("cost", "成本"), ("cross_border_price", "跨境价"),
                           ("discount_price", "折扣价")):
          value = getattr(row, field)
          if value is not None:
              try:
                  excel_number(value, sku, label)
              except WorkbookInputError as exc:
                  raise AssetContractError(str(exc)) from exc
  return values
  ```

  Import the renamed function in `sku_map_store.py`; do not change its ZIP, digest, manifest, copy, rollback or snapshot sequence.

- [x] **Step 5: Run the same focused tests, inspect the diff and propose an independent commit.** Verify the new tests pass, and run `git diff --check` plus `git status --short --branch`. After explicit approval only, stage the five named files and commit `feat: accept sparse Vietnam SKU maps`.

### Task 2: Left join Yacang SKUs and write dependent formulas

**Files:** Create `formula_dependencies.py`; modify `workbook.py`, `test_workbook.py`.

**Interfaces:** `mapping_formula_blank(column: str, literals: Mapping[str, object]) -> bool` and `guarded_mapping_formula(formula: str, column: str, row_number: int, literals: Mapping[str, object]) -> str`. `literals` has keys `B`, `G`, `AE`, `AJ`; `None` means absent, `Decimal("0")` means present. Unknown formula columns return the original formula unchanged.

- [x] **Step 1: Write failing writer tests.** Replace the old missing-map and missing-price failure assertions. With `_sources()` containing `VN-A` and `VN-B`, provide only `VN-A` in parameters; assert all five sheets keep both SKUs, B/G/AE/AJ for `VN-B` are `None`, H/AC/AF:AM retain formulas with `ISBLANK` guards, and J:AB/AN/AV:AY remain written. The first test can follow this exact shape using the existing helpers:

  ```python
  values = {"VN-A": _parameters()["VN-A"]}
  output = tmp_path / "unmapped.xlsx"
  writer.write_vietnam_workbook(output, _sources(), values, writer.RecommendationConfig())
  book = load_workbook(output, data_only=False)
  try:
      main = book["越南备货清单"]
      assert [main[f"E{r}"].value for r in (2, 3)] == ["VN-A", "VN-B"]
      assert all(main[f"{col}3"].value is None for col in ("B", "G", "AE", "AJ"))
      assert "ISBLANK(B3)" in main["H3"].value
      assert "ISBLANK(B3)" in main["AC3"].value.text
  finally:
      book.close()
  ```

  For a mapped row with `discount_price=None`, assert B=2 when hot is blank, H/AC and AE-derived formulas are unguarded, while AK/AL/AM are guarded. Cover missing cost and missing cross-border price separately, and verify a direct `Decimal("0")` remains numeric. Keep invalid hot flag and Yacang-source-error tests.

- [x] **Step 2: Run `uv run pytest python/lxeskill_cli/tests/vietnam_replenishment/test_workbook.py -q` and confirm the new cases fail.**

- [x] **Step 3: Add the shared dependency helper.** Use this mapping and wrapper; require `formula.startswith("=")` for guarded targets:

  ```python
  MAPPING_FORMULA_INPUTS = {
      "H": ("B",), "AC": ("B",),
      "AF": ("AE",), "AG": ("AE", "G"), "AH": ("AE", "G"),
      "AI": ("AE",), "AK": ("AJ",),
      "AL": ("AJ", "G"), "AM": ("AJ", "G"),
  }
  def mapping_formula_blank(column, literals):
      return any(literals[name] is None for name in MAPPING_FORMULA_INPUTS.get(column, ()))
  def guarded_mapping_formula(formula, column, row_number, literals):
      if not mapping_formula_blank(column, literals):
          return formula
      if not formula.startswith("="):
          raise ValueError(f"{column}{row_number} is not a formula")
      tests = [f"ISBLANK({name}{row_number})" for name in MAPPING_FORMULA_INPUTS[column]]
      condition = tests[0] if len(tests) == 1 else f"OR({','.join(tests)})"
      return f'=IF({condition},"",{formula[1:]})'
  ```

- [x] **Step 4: Make `_CurrentRow` mapped fields nullable and preserve map-row presence.** Reject an empty `parameters` mapping for the direct offline writer. For each Yacang SKU, run all existing source checks first; set `values = parameters.get(sku)` and call `_map_time_agrees` only if present. If absent, set B/G/AE/AJ to `None`; if present with blank hot flag, B=2. Validate each nonblank price through `_number`, not the blank values. Build `literals = {"B": current.hot_flag, "G": current.cost, "AE": current.cross_border_price, "AJ": current.discount_price}` in `_fill_main`; after translating each skeleton formula, pass its text through `guarded_mapping_formula` before assigning it (including the `AC` `ArrayFormula`). Keep full-input formulas identical to the skeleton.

- [x] **Step 5: Run the writer tests and inspect the generated workbook.** Run the Task 2 test command again; inspect formula text for H, AC and each finance dependency using the packaged skeleton test. Run `git diff --check` and `git status --short --branch`. After explicit approval, stage only Task 2 files and commit `feat: retain unmapped Vietnam SKUs in workbooks`.

### Task 3: Verify Office results cannot mask missing inputs or errors

**Files:** Modify `recalculation.py`, `test_recalculation.py`; adjust the generated-cache fixture in that test file.

**Interfaces:** Reuse Task 2 `mapping_formula_blank()` and `guarded_mapping_formula()`. `validate_recalculated_workbook()` still receives `sources`, `parameters`, `config` and returns `None` or raises `WorkbookGenerationError`.

- [x] **Step 1: Write failing result-check tests.** Create a two-SKU workbook with only VN-A mapped; fill its synthetic caches so VN-B H/AC/AF:AM are `None` or `""`. Extend `_formula_caches` to set finite financial caches for fully mapped rows and blank caches for missing dependencies; extend `_set_formula_caches` so `None` writes an empty `<v/>`, not the text `"None"`. Assert the sparse workbook validates; then tamper VN-B H cache to `0`, VN-B AF cache to `#VALUE!`, and a guarded formula to an unguarded one, asserting each is rejected with SKU/cell evidence. Tamper a present-price AF cache to blank and assert rejection. Keep the existing explicit-zero AH/AM `#DIV/0!` named-error tests and AB-only known exception.

  ```python
  sparse = {"VN-A": _parameters()["VN-A"]}
  path = _calculated_fixture(tmp_path / "sparse.xlsx", parameters=sparse)
  _validate(path, parameters=sparse)
  _set_formula_caches(path, {"H3": 0})
  with pytest.raises(recalculation.WorkbookGenerationError, match="VN-B.*H3"):
      _validate(path, parameters=sparse)
  ```

- [x] **Step 2: Run `uv run pytest python/lxeskill_cli/tests/vietnam_replenishment/test_recalculation.py -q` and confirm new tests fail against the old validator.**

- [x] **Step 3: Reuse the exact formula helper in `_check_main_formulas`.** Pass the validated current row into the check; translate the skeleton formula as before, then call `guarded_mapping_formula()` using B/G/AE/AJ from that row. Keep the existing `ArrayFormula` ref check and formula-normalization allowance for LibreOffice `TRUE()`/`FALSE()` rewriting. Remove the now-invalid `mapped = parameters[sku]` direct index.

- [x] **Step 4: Validate the expected cache kind per field.** J/K/L/M, source values, four config values, S/T/U/AA and unchanged formulas keep current checks. Also require finite numeric caches for always-numeric independent N/O/P/X/Y/Z/AB (except the known AB zero-daily error), check Q and its conditional R result, and allow V/W to be genuinely empty for applicable SKU shapes. For H/AC and AF/AG/AH/AI/AK/AL/AM, use `mapping_formula_blank()` to require only `None` or `""` when an input is absent; otherwise require a finite numeric cell rather than numeric text. Check `H` against `_expected_replenishment()` only when B exists. Scan for formula errors before finance numeric checks so the current explicit-zero price diagnostic remains specific. Do not allow a missing value in an independent result that must be numeric to pass.

- [x] **Step 5: Run the validator tests and regression subset.** Run `uv run pytest python/lxeskill_cli/tests/vietnam_replenishment/test_recalculation.py python/lxeskill_cli/tests/vietnam_replenishment/test_workbook.py -q`; inspect the actual diff, `git diff --check`, and branch status. After explicit approval, stage only Task 3 files and commit `fix: verify sparse Vietnam formula results`.

### Task 4: Isolated full-flow proof

**Files:** Modify `test_pr5_integration.py`.

**Interfaces:** Keep the no-argument `lxeskill vietnam stock recommend` terminal contract and `files` list. Do not add a CLI argument, a Desktop upload route, a new map slot, or guessed missing-SKU counts.

- [x] **Step 1: Add a failing synthetic integration case.** Extend the existing isolated PR5 test file with a second test. Construct a three-SKU `VietnamSources` by copying the `_sources()` row shape into VN-B and VN-C with `dataclasses.replace`; set exact SKU fields, VN8806 warehouse, numeric sales/inventory/in-transit, title and creation time for each. Build one map with VN-A complete and VN-B discount blank; leave VN-C unmapped. Use the existing `isolated_state` fixture, monkeypatch `workflow.export_vietnam_sources`, and run the real no-argument CLI once. The critical test body is:

  ```python
  assert install_map({"source_path": str(map_path), "expected_revision": ""})["success"] is True
  assert lxeskill.main(["vietnam", "stock", "recommend"]) == 0
  records = [json.loads(line) for line in capsys.readouterr().out.splitlines() if line.strip()]
  assert len(records) == 1 and records[0]["ok"] is True
  assert records[0]["data"]["sku_count"] == 3
  output = Path(records[0]["data"]["output_xlsx"])
  assert records[0]["files"] == [str(output)]
  book = load_workbook(output, data_only=True)
  try:
      main = book["越南备货清单"]
      assert [main[f"E{row}"].value for row in (2, 3, 4)] == ["VN-A", "VN-B", "VN-C"]
      assert main["AJ3"].value is None and main["H3"].value is not None
      assert all(main[f"{col}4"].value in (None, "")
                 for col in ("B", "G", "AE", "AJ", "H", "AC", "AF", "AG", "AH", "AI", "AK", "AL", "AM"))
  finally:
      book.close()
  ```

  Also assert every auxiliary sheet contains all three SKUs, VN-C title/stock/sales and independent main results remain populated, VN-B AK/AL/AM are blank while AF/AG/AH/AI remain numeric, only one fake export occurs, and no intermediate file is listed or published.

- [x] **Step 2: Run the case with the project's managed Office Kit paths.** Set `LXE_OFFICE_NODE` and `LXE_OFFICE_CLI` to the same available project Office Kit installation as read-only resources for the pytest process. Run `uv run pytest python/lxeskill_cli/tests/vietnam_replenishment/test_pr5_integration.py -q -rs`. A skip is not accepted as the integration proof; record the real pass or concrete environment blocker. Do not call production Yacang.

- [x] **Step 3: Run all directly affected targeted tests from repository root.** Run `uv run pytest python/lxeskill_cli/tests/vietnam_replenishment python/lxeskill_cli/tests/lxeskill/test_vietnam_recommendation_cli.py python/lxeskill_cli/tests/lxeskill/test_vietnam_sku_management_cli.py -q -rs` with Office Kit configured so the integration tests actually execute. Run `uv build --wheel --offline` and inspect that the wheel includes `formula_dependencies.py`.

- [x] **Step 4: Inspect the integration-test diff and propose its commit.** Run `git diff --check` and `git status --short --branch`; confirm no real XLSX or credentials entered the diff. After explicit approval, stage only `test_pr5_integration.py` and commit `test: cover partial Vietnam mapping end to end`.

### Task 5: Current operator instructions and PR6 handoff

**Files:** Modify `docs/harness/vietnam-stock-recommendation/{design,asset-contract,current-sku-map}.md`, `docs/harness/skill/current_skill_catalog.md`, `skills/vietnam-stock-recommendation/SKILL.md`; create `docs/harness/vietnam-stock-recommendation/handoff-pr6.md`. Include this plan file in the documentation commit.

**Interfaces:** User-facing entry remains Desktop's single SKU map slot and the no-argument chat command. The CLI result still reports total `sku_count`, output path and active config; it does not report an invented missing-SKU count.

- [x] **Step 1: Update current documentation and Skill.** In `design.md`, replace the old “all three prices required / any missing map stops” text with the PR6 join and blank matrix, and correct its older PR6 roadmap note. In `asset-contract.md` and `current-sku-map.md`, explain that blank individual prices and unmapped current SKUs are allowed while invalid map/real-time sources still fail. In `current_skill_catalog.md`, reflect the PR5 Desktop long-term config plus PR6 map behavior. In `skills/vietnam-stock-recommendation/SKILL.md`, tell the agent to deliver a successful partial workbook without guessing missing SKU counts; retain the pre-Yacang no-current error, one-command, and one-final-file rules. Preserve PR3/PR5 documents as historical records.

- [x] **Step 2: Write `handoff-pr6.md` from actual evidence.** Record branch/head, PR5 dependency, changed files, entry/data flow, environment variables, exact test counts, Office Kit run, Windows and real-Yacang limits, Git status, and the next review step. Copy exact command results from Task 4; do not convert skipped tests into a pass.

- [x] **Step 3: Review final PR6 scope and propose the docs commit.** Run `git diff --check`, `git status --short --branch`, inspect tracked and untracked diffs, and scan only changed files for credential-like literals and accidental real XLSX additions. After explicit approval, stage only the Task 5 files and commit `docs: explain partial Vietnam SKU mapping`. Report module completion with test evidence and ask separately before push and before creating PR6.
