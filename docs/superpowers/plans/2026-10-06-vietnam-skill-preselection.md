# Vietnam Skill Preselection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Skip unnecessary Skill discovery for clear Vietnam replenishment requests and locally recognized Vietnam SKU uploads, while keeping the Agent responsible for bind, generate and final file delivery.

**Architecture:** Runtime accepts an optional Skill preselection callback and feeds its names through the existing explicit Skill loader. Skills declare high-confidence phrases and optional internal, read-only attachment probes; one generic selector reads enabled Skill declarations. The Vietnam business module supplies only its own declaration and local header probe. No new business executor, state store, fixed host route or bypass of tool permissions is added.

**Tech Stack:** Bun/TypeScript Runtime and Desktop host, Python `lxeskill`, openpyxl, Bun tests and pytest.

**Spec:** `docs/superpowers/specs/2026-10-06-managed-lxeskill-execution-design.md` (“越南 Skill 的轻量预选”)

## Global Constraints

- Implement and verify on the current `codex/trusted-lxeskill-execution` worktree, then include this change in the existing PR7 source branch after scoped local commits. Keep PR7 based on PR6; do not alter PR1–PR6 or create a new PR.
- No production API calls in automated tests. Use synthetic workbooks, fake CLI results and fake model responses; do not read or send real business data.
- Do not modify generic `exec` permission or the existing `managed_lxeskill` bind/generate and `send_files` contracts.
- Preselect only when exactly one enabled repository Skill matches a Desktop request. Ambiguous inventory, raw Yacang export, conflicting Skills and other countries keep the normal route; no common or host code contains Vietnam-specific route branches.
- Only a current sole XLSX with no words or a declared exact option reply, or an eligible adjacent confirmation of it, may use the local probe. Verify attachment provenance before reading it; never search older history.
- Probe output is only a match boolean; do not return or log path, filename, headers, SKU rows or cell values. A probe error is observable and follows the ordinary route; it must never bind.
- Use `uv` and `bun`. Catalog changes require Python lxeskill/infra and Bun catalog contract tests. Review diff, `git diff --check`, status and staged scope before asking approval for local commits. Do not push, create PR or merge.

---

### Task 1: Add a read-only Vietnam SKU header probe

**Files:**
- Modify: `python/lxeskill_cli/services/vietnam_replenishment/asset_contract.py`
- Modify: `python/lxeskill_cli/services/vietnam_replenishment/sku_map_store.py`
- Create: `python/lxeskill_cli/services/agent_cli/vietnam_replenishment/probe_sku.py`
- Modify: `python/lxeskill_cli/lxeskill/catalog.json`
- Test: `python/lxeskill_cli/tests/vietnam_replenishment/test_asset_contract.py`
- Test: `python/lxeskill_cli/tests/lxeskill/test_vietnam_sku_bind_cli.py`

**Interfaces:** `has_sku_parameter_headers(path: str | Path) -> bool` inspects only first-sheet row 1 and reuses `_PARAMETER_HEADERS`. `probe_sku_map(path: Path) -> bool` checks regular XLSX, compressed size and ZIP limits before reading row 1. Internal `lxeskill vietnam sku probe --source-path PATH` returns `data.matches: bool` and no files; it never calls `install_sku_map`.

- [x] Add synthetic tests for exact/reordered required headers, unrelated workbook, bad ZIP, symlink and oversize input. Assert the probe does not call the full row loader or create a manifest.
- [x] Run `uv run pytest python/lxeskill_cli/tests/vietnam_replenishment/test_asset_contract.py python/lxeskill_cli/tests/lxeskill/test_vietnam_sku_bind_cli.py -q` from the repository root and record the expected new-test failure.
- [x] Implement only the read-only helpers and internal catalog command. The header check returns `all(header in columns for header in _PARAMETER_HEADERS)` and closes the workbook; the CLI result contains only `success` and `matches` on success.
- [x] Re-run the two focused suites, then `uv run pytest python/lxeskill_cli/tests/lxeskill python/lxeskill_cli/tests/infra -q` and `bun test packages/agent/runtime/test/tooling/lxeskill-command.test.ts`. Check `git diff --check` and the exact file scope before proposing a separate local commit.

### Task 2: Reuse Runtime explicit Skill loading for preselected names

**Files:**
- Modify: `packages/agent/runtime/src/engine/runtime.ts`
- Test: `packages/agent/runtime/test/engine/runtime.test.ts`

**Interfaces:** Add an optional `preselectSkills` callback to `TypeScriptAgentRuntimeOptions`. It receives the current job, persisted messages, workspace and abort signal and returns Skill names when the user did not explicitly invoke a Skill. Explicit `/skill` takes priority; Runtime then uses the existing `resolveInvokedSkill`, `toolExposure.allowsSkill`, `activateSkill`, `renderInvokedSkill` and message persistence flow. The original user message remains unchanged.

- [x] Add a fake-provider test where plain “查询越南备货” and a preselected fixture Skill appear in the *first* request, its owned tool is exposed, the stored user text is unchanged, and exactly one `skill_invocation` is recorded. Add explicit-slash de-duplication, disabled Skill and read-failure cases.
- [x] Run `bun test packages/agent/runtime/test/engine/runtime.test.ts` and record the new-test failure.
- [x] Add the callback and route its names through the existing loader. Do not add Vietnam strings or direct tool execution to Runtime. Do not run the callback on heartbeat turns.
- [x] Re-run the focused Runtime test and `bun run --cwd packages/agent/runtime typecheck`; check diff and whitespace before proposing a separate local commit.

### Task 3: Parse generic Skill preselection declarations

**Files:**
- Modify: `packages/agent/runtime/src/tooling/skills.ts`
- Create: `packages/agent/runtime/src/tooling/skill-preselection.ts`
- Modify: `packages/agent/runtime/src/workspace/instance-manager.ts`
- Modify: `packages/agent/runtime/src/tooling/lxeskill-command.ts`
- Modify: `python/lxeskill_cli/lxeskill/business.py`
- Modify: `python/lxeskill_cli/lxeskill/catalog.json`
- Modify: `skills/vietnam-stock-recommendation/SKILL.md`
- Test: `packages/agent/runtime/test/tooling/skills.test.ts`
- Test: `packages/agent/runtime/test/tooling/skill-preselection.test.ts`
- Test: `packages/agent/runtime/test/tooling/lxeskill-command.test.ts`

**Interfaces:** Optional repository Skill frontmatter `preselect` contains a bounded `text_phrases` list and optional `attachment` with `extensions`, `probe_command_id` and `followup_phrases`. `SkillCatalogSnapshot` carries only enabled declarations; its signature changes when declarations change. A pure matcher returns a single Skill name only when exactly one declaration matches the current text, or returns no name on zero/multiple matches. Catalog probe command must be `internal`, `exposed:false`, `session_mode:none`, marked `preselection_probe:true`, and accept only one `source_path` string.

- [x] Add tests for malformed declaration rejection, exact phrase match, zero/two matches, disabled/user Skills ignored, snapshot refresh after metadata change, and safe catalog probe marker validation. The Vietnam Skill declaration includes clear business phrases but excludes generic stock checks and raw Yacang exports.
- [x] Run `bun test packages/agent/runtime/test/tooling/skills.test.ts packages/agent/runtime/test/tooling/skill-preselection.test.ts packages/agent/runtime/test/tooling/lxeskill-command.test.ts` and the affected Python catalog tests; record the expected new-test failures.
- [x] Parse and validate the optional metadata, include it in enabled snapshots and implement a literal-phrase matcher. Keep every business phrase in SKILL.md. No regex or executable predicate is accepted from metadata; ambiguous matches return no preselection. Validate `preselection_probe:true` symmetrically in Python and Bun catalog loaders.
- [x] Re-run the focused tests, Python lxeskill/infra and Bun catalog contract suites, plus Runtime typecheck. Check diff and `git diff --check` before proposing a local commit.

### Task 4: Connect the generic selector to the Desktop host

**Files:**
- Create: `apps/agent-cli/src/skill-preselection.ts`
- Modify: `apps/agent-cli/src/runtime-host.ts`
- Modify: `packages/agent/runtime/src/index.ts`
- Test: `apps/agent-cli/test/skill-preselection.test.ts`

**Interfaces:** The host receives the Runtime Skill snapshot, current constructed user message and persisted history. It uses the generic phrase matcher first. A sole XLSX without words or with a declared exact option reply, or a declared exact follow-up to an immediately prior preselected file, uses the declared internal probe. For the current turn the host uses the Gateway-built `local_file` block; for an adjacent prior turn it uses the persisted attachment record. Both go through `selectManagedAttachmentId` and `resolveManagedAttachment`, then call catalog `probe_command_id` using the existing packaged `OneShotCliRunner` and fixed argv. Only `ok=true`, `data.success=true`, `data.matches=true`, `files=[]` counts as a match.

- [x] Add fake-runner tests: clear text, sole matching/nonmatching XLSX, adjacent “仅绑定”/“绑定并查询”, multiple files, non-XLSX, older attachment, invalid stored record, probe failure and conflicting Skill declarations. Assert no probe on explicit text or non-Desktop turns.
- [x] Run `bun test apps/agent-cli/test/skill-preselection.test.ts` and record the expected failure.
- [x] Implement host wiring with no `if vietnam`, no filename inference and no model-controlled argv. Keep probe failures observable with actual sanitized diagnostics; allow ordinary Agent route on nonmatch or unavailable probe.
- [x] Re-run focused tests and `bun run --cwd apps/agent-cli typecheck`; check diff and `git diff --check` before proposing a local commit.

### Task 5: Verify the real boundary and update handoff

**Files:**
- Modify: `docs/harness/managed-lxeskill-execution/handoff.md`
- Modify: `docs/superpowers/plans/2026-10-06-vietnam-skill-preselection.md`

- [x] Re-run the affected Runtime and Skill suites after the live-choice correction, plus host selector tests and both typechecks; record the results below.
- [x] In fake-model tests, assert only that the first request has the Skill and the appropriate tools. Do not report this as real model decision, real Yacang or Windows installer acceptance.
- [ ] Complete fresh Desktop acceptance for all requested paths: existing bound SKU → final XLSX; sole SKU upload → two options; confirmation or two-turn binding → final XLSX; same-turn SKU+query → bind then generate → final XLSX. Record actual outcomes and any remaining limits. A successful direct generation and a successful bind → generate → send_files chain are logged, and the user reports a clickable choice plus final XLSX; the current logs do not tie that choice to the same completed turn.
- [x] Audit `git status --short --branch`, staged/unstaged scope and sensitive/path strings. The approved code scope was staged and committed as `4fd8e450`; `git diff --cached --check` passed. Do not create a new PR.

## Current execution record

- After the clickable-choice and error-diagnostic corrections, the affected Runtime/Skill/managed-tool suites were rerun on 2026-10-06: 180 passed, 0 failed across 7 files; host selector 15 passed, 0 failed; permission tests 19 passed, 0 failed. Python `lxeskill` and `infra` returned 432 passed, 2 skipped; asset-contract and SKU-store tests 83 passed. Runtime and Agent CLI typechecks and the Agent CLI build passed. No automated test used real business workbooks or production Yacang.
- The first live bare-upload attempt recognized the Skill but only asked in text. The Skill now explicitly requests the existing Desktop `ask_user_question` with two choices, and Runtime gives an explicit `/skill` priority over auto-preselection. The user subsequently reported seeing a clickable choice and receiving the final XLSX. The first restarted service logged one completed `generate → send_files` turn and one completed `bind → generate → send_files` turn, with no unrelated tool calls. After a second restart, one new turn logged `ask_user_question → bind` successfully. The user confirmed choosing only "仅绑定" in that turn, so no generation or file delivery was expected there. No production code changed between these restarts. A single uninterrupted choice → bind → generate → delivery trace is not yet established, and the remaining distinct scenarios require separate confirmation.
- The code, Skill and tests were committed as `4fd8e450` after a scoped staged review. The documentation is a separate commit. Both belong to the existing PR7 source branch; no new PR or merge into the lead repository is part of this plan. Verify the personal fork remote HEAD and PR page after normal push.
