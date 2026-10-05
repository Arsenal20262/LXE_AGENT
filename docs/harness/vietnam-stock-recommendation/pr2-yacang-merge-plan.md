# Vietnam PR2: current 雅仓 data and SKU map plan

**Goal:** Produce a current VN8806 SKU snapshot and an operations upload workbook without generating the five-sheet recommendation workbook.

**Base:** `codex/vietnam-stock-recommendation` (PR1). PR2 uses that branch as its review base until PR1 enters personal `main`.

**Existing contracts:** [design.md](design.md), [asset-contract.md](asset-contract.md), `services.yacang.workflow.run`, `services.yacang.validation`, and `services.vietnam_replenishment.asset_contract`.

## Boundaries

- One existing 雅仓 export call requests `inventory-sales`, `inventory-current-snapshot`, and `warehouse-products` with `warehouses=["VN8806"]`; the product task is global within the existing workflow. Do not set `created_date` or recreate authentication, queue, or download code.
- A run is usable only when all three identified artifacts succeed. The current SKU set is the union of the two VN reports. An SKU missing from either source stays in the set with a visible diagnostic. An empty union is an error.
- The global product report is filtered by the current SKU set before it enters the returned snapshot. Duplicate, blank, or nontext SKU keys cannot silently overwrite a row.
- The operations workbook first sheet has `SKU`, `成本`, `跨境价`, `折扣价`, `热销标记`, `上架时间`. Its editable values come only from an existing explicit SKU map. A separate reference sheet may show template history and missing-source diagnoses. History never fills an editable cell automatically. Values must round-trip through the PR1 loader without silent precision loss.
- Resolution for a future calculator uses explicit map value, then the same SKU's nonconflicting literal template history, then the confirmed `热销标记=2` default, then missing. Explicit zero remains a value. A template formula, invalid value, or conflicting duplicate cannot become history fallback.
- The current inventory list's `在途数量` is authoritative for the later `总在途` field, as confirmed by the user. The sales report's `在途` is comparison data; a mismatch or missing authoritative value is reported, and sales never fills a missing inventory-list value.
- No production export is invoked during tests. Real files and credentials stay outside Git.

## Task 1: Acquire and parse current sources

**Files:** `services/vietnam_replenishment/yacang_sources.py`, `tests/vietnam_replenishment/test_yacang_sources.py`.

1. Add synthetic three-report XLSX fixtures with matching source headers. Cover exact VN filtering, union SKU set, product subset, duplicates, blank keys, missing one report, empty union, and partial export failure.
2. Run the focused test and observe failures before adding the implementation.
3. Implement `VietnamSources`, `load_vietnam_sources(artifacts)`, and `export_vietnam_sources()` using the existing validators and `workflow.run` once per run. Preserve the actual sanitized 雅仓 failure detail.
4. Run the focused test from the repository root, inspect the file diff, and form an independent `feat` commit only after the required Git approval.

## Task 2: Resolve SKU parameters

**Files:** `services/vietnam_replenishment/sku_parameters.py`, `tests/vietnam_replenishment/test_sku_parameters.py`.

1. Add synthetic template tests for exact SKU match, explicit zero, duplicate history agreement and conflict, invalid history, formula history, new SKU, and hot-flag default.
2. Run those tests and observe failures before implementation.
3. Implement `load_template_sku_parameters(path, skus)` and `resolve_sku_parameters(skus, explicit, history)` using PR1's `SkuParameters` type and validated template layout. Return field-level sources and unavailable reasons alongside resolved values.
4. Run the focused test, inspect the file diff, and form an independent `feat` commit only after the required Git approval.

## Task 3: Produce the operations upload workbook

**Files:** `services/vietnam_replenishment/operator_map.py`, `tests/vietnam_replenishment/test_operator_map.py`.

1. Test that the first sheet round-trips through PR1 `load_sku_parameters`, contains only current SKUs, uses only existing explicit map values, and keeps all template values on a distinct reference sheet. Include new and missing-source SKUs.
2. Run the focused test and observe failures before implementation.
3. Implement `write_operator_sku_map(path, sources, explicit, history)` without copying product `创建时间` into `上架时间`.
4. Run the focused test, inspect the file diff, and form an independent `feat` commit only after the required Git approval.

## Task 4: Compose one current-run preparation entry

**Files:** `services/vietnam_replenishment/preparation.py`, `tests/vietnam_replenishment/test_preparation.py`.

1. Build one synthetic fixture that supplies current VN source rows, a valid history template, and a current explicit map. Verify that the generated upload sheet contains only current SKUs and explicit values, while the returned resolution may use unconflicted history and the hot default.
2. Run the focused test and observe failure before implementation.
3. Implement `prepare_operator_sku_map(template_path, output_path, current_map_path=None, *, sources=None)` as a thin composition of the three PR2 modules and PR1's map loader. When `sources` is omitted, call the existing 雅仓 export once; injected sources support fixture tests and later workflow reuse. Return the output path, source snapshot, and resolved per-SKU parameters.
4. Run the focused test, inspect the file diff, and form an independent `feat` commit only after the required Git approval.

## Module review

Run the PR2 test files and the existing 雅仓 and PR1 contract tests from the repository root. Check `git diff --check`, changed files, status, and new-file content for credentials, real XLSX data, and unrelated changes. Record branch/base, interfaces, tests, limitations, and next module in `handoff-pr2.md`. Request separate confirmation before push and before PR creation. If PR1 remains open, the personal PR base is `codex/vietnam-stock-recommendation`; after PR1 merges, change the PR base to personal `main`.
