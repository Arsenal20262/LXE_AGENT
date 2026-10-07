# Vietnam Offline Generation Implementation Plan

> **文档性质**：本页保留 PR9 的实施步骤，复选框不是当前验收状态。当前 Clean Stack 的分支、基线、实际测试结果和限制以 [PR9 交接](../../harness/vietnam-stock-recommendation/handoff-capability-pr2.md) 为准。

**Goal:** Add a formal offline Vietnam replenishment command for exactly three existing Yacang XLSX reports while retaining the online `vietnam stock recommend` command.

**Architecture:** A local Vietnam source parser owns report classification, file validation, and `load_vietnam_sources()`. The Yacang adapter owns only online collection and passes its three artifacts to that parser. The online and offline workflow entries converge on the existing trusted SKU snapshot and `generate_vietnam_workbook()`, which writes, recalculates, validates, and publishes only the final XLSX.

**Tech Stack:** Python 3.12, openpyxl, uv/pytest, Bun catalog and Skill contract tests.

**Spec:** `docs/harness/vietnam-stock-recommendation/design.md` (approved offline-generation boundary; update the design to match the implemented code).

## Global Constraints

- Keep existing `vietnam stock recommend`, Yacang export, SKU bind/current/version, formulas, Workbook, and shared Office behavior.
- Offline generation must never call the Yacang production interface or fall back to online generation.
- The direct CLI must itself reject fewer or more than three sources, non-XLSX, duplicate files/report types, wrong source structure, and wrong VN8806 warehouse values.
- PR8 owns generic exact-count attachment selection. Do not add Vietnam branching to Runtime.
- Do not expose internal parser, Workbook, Office, or validation functions as Agent tools.
- Do not call production APIs during tests. Git 与远端操作遵循项目规范和当前用户批准范围。

---

### Task 1: Separate local source parsing from online collection

**Files:**
- Create: `python/lxeskill_cli/services/vietnam_replenishment/source_parser.py`
- Modify: `python/lxeskill_cli/services/vietnam_replenishment/yacang_sources.py`
- Modify imports only: `workflow.py`, `workbook.py`, `recalculation.py`, `preparation.py`, `operator_map.py`
- Test: `python/lxeskill_cli/tests/vietnam_replenishment/test_yacang_sources.py`

**Interfaces:**
- `load_vietnam_sources(artifacts: object) -> VietnamSources` remains the deterministic report parser.
- `classify_vietnam_report_paths(raw_paths: object) -> list[dict[str, object]]` validates exactly three local XLSX paths, identifies report roles from exact headers, and prepares metadata for `load_vietnam_sources()`.
- `export_vietnam_sources() -> VietnamSources` remains online only and delegates parsing to `load_vietnam_sources()`.

- [ ] Add synthetic tests for path count, duplicate path/report type, wrong extension/header, and wrong warehouse before moving code.
- [ ] Run the new parser tests and confirm the intended failures.
- [ ] Move parsing and its data types into `source_parser.py`; leave only online Yacang collection in `yacang_sources.py` and preserve its existing public imports where needed for compatibility.
- [ ] Point production data consumers at the parser type rather than the online adapter.
- [ ] Run `uv run pytest python/lxeskill_cli/tests/vietnam_replenishment/test_yacang_sources.py` and confirm all cases pass.

### Task 2: Add offline workflow and formal CLI contract

**Files:**
- Modify: `python/lxeskill_cli/services/vietnam_replenishment/workflow.py`
- Create: `python/lxeskill_cli/services/agent_cli/vietnam_replenishment/generate_offline.py`
- Modify: `python/lxeskill_cli/lxeskill/catalog.json`
- Test: `python/lxeskill_cli/tests/vietnam_replenishment/test_workflow.py`
- Create: `python/lxeskill_cli/tests/lxeskill/test_vietnam_offline_cli.py`

**Interfaces:**
- `generate_offline_vietnam_recommendation(raw_paths: object) -> VietnamRecommendationRun` calls only the local parser before the shared generation stage.
- `vietnam_replenishment_generate_offline` maps to `lxeskill vietnam stock generate`, with `source_xlsx` as a required array of exactly three XLSX and `managed_execution: {attachment_argument: source_xlsx, attachment_count: 3}`.
- `generate_current_vietnam_recommendation()` retains online collection, and both entries share trusted current SKU, config, Workbook, Office, validation, and final output checks.

- [ ] Add workflow and direct-CLI tests for three synthetic valid reports; replace the online Yacang callable with a fail-fast sentinel and assert offline calls it zero times.
- [ ] Add failure tests for 0/1/2/4 inputs, non-XLSX, duplicate path/type, missing or malformed report, wrong warehouse, missing current SKU, Office failure, and no file delivery on failure.
- [ ] Compare online and offline core workbook results with exactly the same synthetic source files, SKU current and configuration; confirm online still calls the existing Yacang export adapter.
- [ ] Run the new tests and confirm missing-command failures before implementation.
- [ ] Implement the offline workflow/CLI and catalog row without changing business formulas or the existing Yacang export command.
- [ ] Run `uv run pytest python/lxeskill_cli/tests/vietnam_replenishment python/lxeskill_cli/tests/lxeskill/test_vietnam_offline_cli.py python/lxeskill_cli/tests/lxeskill/test_vietnam_recommendation_cli.py`.

### Task 3: Route the three user goals and close documentation

**Files:**
- Modify: `skills/vietnam-stock-recommendation/SKILL.md`
- Modify: `packages/agent/runtime/test/tooling/lxeskill-command.test.ts`
- Modify: `packages/agent/runtime/test/tooling/skills.test.ts`
- Modify: `docs/harness/vietnam-stock-recommendation/design.md`
- Create: `docs/harness/vietnam-stock-recommendation/handoff-capability-pr2.md`

- [ ] Add Bun assertions that the real offline catalog command is owned by the Vietnam Skill, declares three managed XLSX, and delivers one final workbook.
- [ ] Update the Skill to distinguish raw Yacang export, explicit use of three existing reports, and online one-click recommendation. Require clarification for ambiguous requests and never infer report roles from filenames.
- [ ] Preserve the existing single-SKU binding path and the send_files responsibility; success delivers only the final validated XLSX.
- [ ] Document the exact online/offline source boundary, test evidence, remaining limits, and PR8 dependency in design and handoff.
- [ ] State that offline output is based on user-provided reports; neither the same export batch nor today's live data is proven.
- [ ] Run `bun test packages/agent/runtime/test/tooling/lxeskill-command.test.ts packages/agent/runtime/test/tooling/skills.test.ts` and `uv run pytest python/lxeskill_cli/tests/lxeskill python/lxeskill_cli/tests/infra` for both catalog consumers.

### Final verification before requesting a commit

- [ ] Run affected Vietnam Python regression and Bun contract tests, plus Runtime typecheck if TypeScript is changed.
- [ ] Check `git diff --check`, `git status --short --branch`, exact file scope, no local paths, credentials, real business XLSX, or unrelated code.
- [ ] Confirm offline does not import or call Yacang workflow, while online still performs one current export.
- [ ] Report actual results and limitations; wait for approval before add, commit, push, or PR creation.
