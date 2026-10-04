# Vietnam Chat SKU Binding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an operator bind the Vietnam SKU parameter workbook from a chat attachment, retain the trusted current/previous versions, and remove the obsolete full-template card from the workbench.

**Architecture:** Add a dedicated business CLI adapter for chat binding that reads the managed store revision and calls the existing validated `install_sku_map`; the generation command stays parameterless. Update the Vietnam Skill to select the real attachment path and sequence bind before generate. Filter the historical template from the workbench and keep the SKU card for status and rollback without an upload button.

**Tech Stack:** Python 3.12, `uv`, Bun 1.4.2, TypeScript/React, Electron preload bridge, Office Kit, pytest, bun:test.

**Spec:** `docs/superpowers/specs/2026-10-04-vietnam-chat-sku-binding-design.md`

## Global Constraints

- Work only in `codex/vietnam-chat-sku-binding`, based on PR6 commit `bbd62a66`; do not develop on `main` or modify other business assets.
- Keep `vietnam_sku_parameter_map` as `management: desktop`, its validated store and rollback, and the existing internal Desktop IPC/CLI contracts.
- Chat binding uses a real `local_file` attachment path selected by the Skill. The CLI validates the local file and content but cannot prove which chat turn supplied a path.
- Use `uv` and `bun` with frozen dependencies. Run Python tests from the repository root. No production Yacang calls or real business spreadsheets in tests or Git.
- Run the Python and Bun catalog contract tests after changing `catalog.json`. Run targeted tests during development; the full suite belongs after the final main sync before merge.
- Check diff, status, secrets, and unrelated files before every proposed commit. Obtain Git commit approval; push, PR creation, and merge each need separate approval.

---

### Task 1: Chat bind command and Skill contract

**Files:**
- Create: `python/lxeskill_cli/services/agent_cli/vietnam_replenishment/bind_sku.py`
- Modify: `python/lxeskill_cli/lxeskill/catalog.json:7-8`
- Modify: `skills/vietnam-stock-recommendation/SKILL.md:1-34`
- Test: `python/lxeskill_cli/tests/lxeskill/test_vietnam_sku_bind_cli.py`
- Test: `packages/agent/runtime/test/tooling/lxeskill-command.test.ts:138-150`
- Test: `packages/agent/runtime/test/tooling/skills.test.ts:70-73`

**Interfaces:**
- Consumes: `inspect_sku_map()`, `install_sku_map(Path, expected_revision)` from `services.vietnam_replenishment.sku_map_store`.
- Produces: `lxeskill vietnam sku bind` with a required absolute `.xlsx` `source_path`, and terminal `data.success`, `data.status` (`installed` or `unchanged`), `data.manifest_revision`, and `files=[]`.
- Keeps: `lxeskill vietnam stock recommend` without arguments or attachment path.

- [ ] **Step 1: Write failing CLI tests.** Create a synthetic workbook with `SKU/成本/跨境价/折扣价/热销标记` and one valid SKU. Set `LXE_DATA_ROOT` to `tmp_path/state`. Assert a first `lxeskill.main(["vietnam", "sku", "bind", "--source-path", str(first)])` returns `0`, the final JSON has `ok=True`, `data.status="installed"`, `files=[]`, and `inspect_sku_map().current.file_name == first.name`. Bind the same bytes again and assert `unchanged`, unchanged revision, and no previous version. Bind different bytes and assert the old version becomes previous. Assert an invalid ZIP returns the actual bounded `BadZipFile` diagnostic and leaves current/revision unchanged. Assert a relative path and an extra flag are rejected before store access. Monkeypatch `install_sku_map` to raise the existing revision conflict and assert the diagnostic is returned without retry. Monkeypatch `export_vietnam_sources` to raise if called and verify bind never calls it.

```python
assert lxeskill.main(["vietnam", "sku", "bind", "--source-path", str(first)]) == 0
record = json.loads(capsys.readouterr().out.strip())
assert record["ok"] is True
assert record["data"]["status"] == "installed"
assert record["files"] == []
assert inspect_sku_map().current.file_name == first.name
```

- [ ] **Step 2: Run the new test file from the repository root and confirm it fails because the command is absent.**

```text
uv run --frozen --no-sync pytest python/lxeskill_cli/tests/lxeskill/test_vietnam_sku_bind_cli.py -q
```

- [ ] **Step 3: Implement the dedicated adapter.** Require exactly `source_path`, a non-empty absolute string, and `.xlsx`. Call `inspect_sku_map()` and fail on `manifest_error`; call `install_sku_map(Path(source_path), status.revision)`. Return the real mutation status and revision. On failure return `{success: False, error: {code, message}}` with `safe_remote_detail` over the actual exception and configured secret values, bounded to 2,000 characters. Do not call Yacang or the generic `promote_asset`.

```python
status = inspect_sku_map()
if status.manifest_error:
    raise SkuMapStoreError(status.manifest_error)
mutation = install_sku_map(Path(source_path), status.revision)
return {"success": True, "status": mutation.status,
        "manifest_revision": mutation.manifest_revision}
```

- [ ] **Step 4: Register and teach the command.** Add one catalog entry named `vietnam_replenishment_bind_sku` with `module="services.agent_cli.vietnam_replenishment.bind_sku"`, command path `["vietnam","sku","bind"]`, `visibility="business"`, `session_mode="none"`, `owner_skills=["vietnam-stock-recommendation"]`, `exposed=true`, and exactly one required `source_path` string. Mark that field `x-lxe-file-input` with `accepted_extensions=[".xlsx"]` and a Chinese chat-upload instruction; do not add `x-lxe-asset-slot`. Add the bind command to the Skill frontmatter. In its body specify bind-only, generate-only, and bind-then-generate paths; use the current message attachment (or the immediately preceding attachment after an explicit clarification), verify the final terminal, stop on bind failure, and never pass a map path to the existing generate command. Only `send_files` after successful generation.

```json
{"name":"vietnam_replenishment_bind_sku","module":"services.agent_cli.vietnam_replenishment.bind_sku","command_path":["vietnam","sku","bind"],"visibility":"business","session_mode":"none","owner_skills":["vietnam-stock-recommendation"],"exposed":true,"timeout_ms":180000,"input_schema":{"type":"object","properties":{"source_path":{"type":"string","minLength":1,"x-lxe-file-input":{"accepted_extensions":[".xlsx"],"instruction":"请在当前对话上传越南 SKU 参数表，并使用附件的真实绝对路径。"}}},"required":["source_path"],"additionalProperties":false}}
```

- [ ] **Step 5: Update the two Bun contract tests and run the required targeted gates.** Assert the new catalog entry is exposed, owned by the Vietnam Skill, has `.xlsx` input metadata and no asset slot; assert the Skill lists both commands. Run the command tests, both catalog consumers, and Skill discovery tests. Check `git diff --check`, `git status`, changed-file list, and sensitive strings. After user approval, commit this complete chat binding capability as `feat: bind Vietnam SKU maps from chat`.

```text
uv run --frozen --no-sync pytest python/lxeskill_cli/tests/lxeskill python/lxeskill_cli/tests/infra -q
bun test packages/agent/runtime/test/tooling/lxeskill-command.test.ts packages/agent/runtime/test/tooling/skills.test.ts
git diff --check
git status --short
```

### Task 2: Workbench presentation

**Files:**
- Modify: `apps/dashboard/src/features/workbench/input-assets-view.tsx:1-36,67-106,130-199`
- Modify: `apps/dashboard/src/main.tsx:103,182-188,997-1005`
- Modify: `apps/dashboard/src/shared/i18n.tsx:187-214,1079-1106`
- Test: `apps/dashboard/test/features/workbench/input-assets-view.test.tsx`

**Interfaces:**
- Consumes: the existing `DesktopInputAssetSlot[]` from `listInputAssets()`; backend catalog/IPC remain intact.
- Produces: a visible-slot helper filtering only `vietnam_replenishment_template`. The card list and workbench summary use that helper. SKU current/previous and rollback remain available; upload button is absent.

- [ ] **Step 1: Update the workbench test first.** Feed a list with one FBA slot, the historical Vietnam template, and the SKU slot with a valid previous revision. Assert the historical name and upload button are absent, the FBA and SKU names remain, and rollback is still shown. Assert `visibleInputAssetSlots(raw)` has length `2` and the ready count reflects those two slots. Add a second render with missing SKU current and assert the Chinese empty hint directs users to chat.

```tsx
expect(markup).not.toContain("Vietnam historical template");
expect(markup).not.toContain("Upload SKU map");
expect(markup).toContain("Roll back to previous");
expect(visibleInputAssetSlots(raw).map(slot => slot.slot)).toEqual([
  "export_tax_master", "vietnam_sku_parameter_map",
]);
```

- [ ] **Step 2: Run the focused Bun test to confirm the old UI fails.**

```text
bun test apps/dashboard/test/features/workbench/input-assets-view.test.tsx
```

- [ ] **Step 3: Implement one shared filter and remove only the UI upload action.** Export `visibleInputAssetSlots(slots)` from `input-assets-view.tsx`, filter the old template ID, use it when rendering cards, and use it in `main.tsx` before computing `slotSummary` or passing props to `InputAssetsWorkbench`. Remove the `Upload` import, `upload()` callback, upload button, and historical paragraph. Keep the SKU rollback callback and existing Desktop IPC untouched. Update Chinese and English empty hints to direct chat binding; remove unused upload/historical text keys only if TypeScript permits.

```tsx
export const visibleInputAssetSlots = (slots: DesktopInputAssetSlot[]) =>
  slots.filter(slot => slot.slot !== "vietnam_replenishment_template");
const visibleSlots = assetSlots.slots ? visibleInputAssetSlots(assetSlots.slots) : null;
```

- [ ] **Step 4: Verify focused UI and renderer gates.** Run the focused test, `bun run --cwd apps/dashboard typecheck`, and `bun run dashboard:build`. Inspect the native Electron workbench if the local preview is available, confirming the old card is gone, SKU upload absent, rollback visible, and the summary count excludes the hidden card. Check diff, status, and unrelated files. After user approval, commit as `feat: move Vietnam SKU upload to chat`.

```text
bun test apps/dashboard/test/features/workbench/input-assets-view.test.tsx
bun run --cwd apps/dashboard typecheck
bun run dashboard:build
git diff --check
git status --short
```

### Task 3: One synthetic chat-bind-to-generation regression

**Files:**
- Modify: `python/lxeskill_cli/tests/vietnam_replenishment/test_pr5_integration.py:120+`

**Interfaces:**
- Consumes: Task 1's `lxeskill vietnam sku bind` and the unchanged `lxeskill vietnam stock recommend`.
- Produces: a regression proving the new binding entry reaches the same private snapshot, Office Kit recalculation, and final five-sheet output without production Yacang.

- [ ] **Step 1: Add an end-to-end test using `_sparse_map()` and `_three_sources()`.** Use the existing `isolated_state` fixture, set Office Kit paths already used by this repository, monkeypatch `workflow.export_vietnam_sources` to return `_three_sources()`, bind the synthetic map through `lxeskill.main(["vietnam","sku","bind",...])`, then run `lxeskill.main(["vietnam","stock","recommend"])`. Assert bind returns no files and generation returns exactly one final workbook; use `load_workbook(data_only=True)` to check all three SKU rows, including blank dependent values for unmapped `VN-C`. Check that bind itself did not call `export_vietnam_sources` by counting the stub calls before and after generation.

```python
assert lxeskill.main(["vietnam", "sku", "bind", "--source-path", str(map_path)]) == 0
bind_events = [json.loads(line) for line in capsys.readouterr().out.splitlines() if line.strip()]
assert next(event for event in reversed(bind_events) if event["type"] == "result")["files"] == []
assert export_calls == []
assert lxeskill.main(["vietnam", "stock", "recommend"]) == 0
events = [json.loads(line) for line in capsys.readouterr().out.splitlines() if line.strip()]
result = next(event for event in reversed(events) if event["type"] == "result")
assert len(result["files"]) == 1
```

- [ ] **Step 2: Run the focused integration with the host Office Kit and confirm actual execution, not a skip.** Keep the `skipif` condition in place for machines without Office Kit; on this worktree set both paths to the installed local runtime. Check the output count, `git diff --check`, and status. After user approval, commit as `test: cover Vietnam chat binding through generation`.

```text
LXE_OFFICE_NODE=/Users/hym/.codex/worktrees/3062/LXE_AGENT1/build/desktop-runtime/darwin-arm64/node/node LXE_OFFICE_CLI=/Users/hym/.codex/worktrees/3062/LXE_AGENT1/build/desktop-runtime/darwin-arm64/office/node_modules/@deepseek-ai/libreoffice-kit/lib/cli.js uv run --frozen --no-sync pytest python/lxeskill_cli/tests/vietnam_replenishment/test_pr5_integration.py -q
git diff --check
git status --short
```

### Task 4: Current documentation and handoff

**Files:**
- Modify: `docs/harness/vietnam-stock-recommendation/design.md`
- Modify: `docs/harness/vietnam-stock-recommendation/asset-contract.md`
- Modify: `docs/harness/vietnam-stock-recommendation/current-sku-map.md`
- Modify: `docs/harness/skill/current_skill_catalog.md`
- Modify: `docs/README.md:34`
- Create: `docs/harness/vietnam-stock-recommendation/handoff-pr7.md`

**Interfaces:**
- Consumes: the shipped chat command, Skill, and workbench presentation from Tasks 1–3.
- Produces: current business instructions plus a PR7 handoff. Historical PR1–PR6 specs/plans/handoffs stay unchanged.

- [ ] **Step 1: Replace only current upload instructions.** State that the operator sends the `.xlsx` SKU map in chat and requests binding; accepted maps remain long-lived and may omit some SKU rows/prices. Say the old full template is not an input because the five-sheet skeleton is packaged. Document bind-only versus bind-then-generate, current/previous/rollback, actual validation errors, and that the workbench shows status and rollback but no longer uploads.

```markdown
运营在聊天中附上越南 SKU 参数表并说“绑定这张越南 SKU 表”。校验成功后，它成为长期生效的当前版；只说“生成越南备货清单”时沿用当前版。完整业务模板无需上传，五表骨架随应用发布。
```

- [ ] **Step 2: Write `handoff-pr7.md` with branch/base, changes and paths, command/Skill flow, test results, known limitations, PR dependencies, Git status, and next action.** Record that chat attachment origin is enforced by Skill selection rather than cryptographically by the standalone CLI, and record any real UI/Windows/Yacang checks not executed.

- [ ] **Step 3: Review the changed-file list and test evidence, then request the docs commit.** Run `git diff --check`, `git status --short`, and a targeted scan for secrets, `.xlsx`, generated outputs, and unrelated files. After user approval, commit as `docs: explain Vietnam chat SKU binding`.

```text
git diff --check
git status --short
git diff --name-only
```

## Final PR gate

- [ ] Review the complete PR7 diff against PR6, and audit the PR1–PR6 stack for project-rule violations, sensitive files, accidental artifacts, and unrelated changes. Resolve any PR7 finding within this branch; report issues in earlier PRs without silently mixing them into PR7.
- [ ] Verify all required targeted tests, renderer build/typecheck, Office Kit regression, `git diff --check`, `git status`, and sensitive-file scan from actual output. After a final main sync before merge, run the repository's single full validation pass according to `AGENTS.md`.
- [ ] Report scope, evidence, risks, dependency on PR6, and remaining work. Obtain separate user approval before push, PR creation, or merge; do not advance to another module in this session.
