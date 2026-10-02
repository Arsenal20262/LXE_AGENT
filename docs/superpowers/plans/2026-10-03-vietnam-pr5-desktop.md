# Vietnam PR5 Desktop Asset and Settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a trustworthy Desktop upload and rollback path for the Vietnam SKU parameter map, plus persistent four-parameter settings that take effect in the deterministic recommendation workflow.

**Architecture:** A Python managed asset module owns candidate validation, immutable versions, a manifest pointer, and the cross-process lock; Desktop Main invokes its fixed-slot actions and the workbench presents them. Desktop config stores four decimal strings, injects the complete quartet into the Agent environment, and Python resolves and validates it before Yacang export.

**Tech Stack:** Python 3, uv, openpyxl, Bun, Electron, TypeScript, React, Office Kit.

**Spec:** `docs/superpowers/specs/2026-10-03-vietnam-pr5-desktop-design.md`

## Global Constraints

- Base PR5 on PR4 `b2bff2f6a5df434983a2e061161d5c34d7140777`; PR base is `codex/vietnam-stock-pr4-workflow`, not `main`.
- Only the Desktop-managed `vietnam_sku_parameter_map` receives the validated version store; command-managed slots retain their existing behavior.
- Map upload never calls production Yacang; tests use synthetic workbooks and mock exports.
- The live business command accepts no map path or chat parameters; explicit per-chat numeric requests must stop in the Skill.
- Default configuration is `0.8 / 0.8 / 0 / 3900`; environment configuration is all-or-nothing, and invalid values fail before Yacang.
- Use `uv` for Python and `bun` for JS; install with frozen locks. Run Python tests from repository root and only relevant targeted suites during development.
- Do not copy a virtual environment from another worktree, alter unrelated asset slots, log credentials or price tables, or use historical template values.
- Every Git status mutation requires prior user approval. Check tests, `git diff --check`, and diff before proposing each small commit. Push, PR creation, and merge each require a separate approval. No main/master development.
- Windows is a distribution target. macOS tests cannot establish Windows file replacement or packaged command routing; record those as on-site acceptance items.

## File map and interfaces

| Unit | Responsibility |
| --- | --- |
| `python/lxeskill_cli/services/vietnam_replenishment/numeric_contract.py`, `asset_contract.py`, `workbook.py` | Shared complete-map and Excel-exact numeric validation. |
| `python/lxeskill_cli/services/vietnam_replenishment/sku_map_store.py` | Fixed-slot manifest/version transactions, integrity-aware inspection, private snapshot. |
| `python/lxeskill_cli/shared/input_assets.py`, `services/assets/inspect.py` | Trust-gated legacy readers and one-shot list state for the managed slot. |
| `python/lxeskill_cli/services/assets/vietnam_sku_install.py`, `vietnam_sku_rollback.py`, `lxeskill/catalog.json` | Internal, fixed-slot Desktop command adapters; never expose them as model tools. |
| `apps/desktop/src/main/input-assets.ts`, `vietnam-sku-map-actions.ts`, `ipc.ts`, `ipc-validation.ts`, `main.ts`, `ipc-channels.ts`, `preload-bridge.ts` | Structured command errors, native file selection, trusted IPC, and fixed-slot bridge. |
| `packages/foundation/desktop-protocol/src/index.ts`, `apps/dashboard/src/features/workbench/input-assets-view.tsx`, `shared/i18n.tsx`, `styles.css` | Typed asset state and visible upload/rollback controls. |
| `apps/desktop/src/main/config-store/vietnam-recommendation.ts`, `model.ts`, `repository.ts`, `setup.ts` | Decimal-string settings, v11→v12 migration, persistence gate, environment injection. |
| `apps/dashboard/src/desktop/settings-model.ts`, `shell.tsx`, `shared/i18n.tsx`, test fixtures | Draft, dirty state, independent parameter save under Yacang. |
| `python/lxeskill_cli/services/vietnam_replenishment/workflow.py`, `services/agent_cli/vietnam_replenishment/generate.py`, `skills/vietnam-stock-recommendation/SKILL.md` | Runtime configuration resolution, result provenance, truthful operator instructions. |
| `docs/harness/vietnam-stock-recommendation/handoff-pr5.md` | Next reviewer and next module handoff. |

The store API is `inspect_sku_map() -> SkuMapStatus`, `install_sku_map(source: Path, expected_revision: str | None) -> SkuMapMutation`, `rollback_sku_map(expected_revision: str | None) -> SkuMapMutation`, and `current_sku_map_snapshot() -> Iterator[Path]` as a context manager. `SkuMapStatus` contains `revision`, validated `current`/`previous`, `current_error`, `previous_error`, and `manifest_error`; each version includes `path`, `file_name`, `size_bytes`, `updated_at`. Only the list view tolerates an invalid pointed-to version. `trusted_version(generation: Literal["current", "previous"]) -> AssetVersion | None` is the compatibility adapter for `shared.input_assets`. The mutation result has `status: Literal["installed", "unchanged", "rolled_back"]` and `manifest_revision: str`. These names are the interface contract for Tasks 2–5.

### Task 1: Share complete-map and Excel numeric validation

**Files:** Create `python/lxeskill_cli/services/vietnam_replenishment/numeric_contract.py`; modify `python/lxeskill_cli/services/vietnam_replenishment/asset_contract.py`, `workbook.py`, `workflow.py`; test `python/lxeskill_cli/tests/vietnam_replenishment/test_asset_contract.py`, `test_workflow.py`, `test_workbook.py`.

**Interfaces:** Produce `validate_complete_sku_parameters(path: str | Path) -> dict[str, SkuParameters]` and public `excel_number(value: object, sku: str, field: str, *, positive: bool = False) -> Decimal`. Preserve the current `load_sku_parameters()` parser and workbook semantics; move `_number` logic and `WorkbookInputError` to `numeric_contract.py`, import them from both consumers, and re-export `WorkbookInputError` from `workbook.py` for existing callers.

- [ ] **Step 1: Add focused failing tests.** Build tiny `openpyxl.Workbook()` maps with `SKU, 成本, 跨境价, 折扣价, 热销标记`. Assert a valid row with explicit zeros passes; empty map, blank price, 16 significant digits, and a value whose float round trip changes the Decimal raise `AssetContractError`. Assert PR4's workflow still stops before its fake Yacang exporter on incomplete maps. Test sketch:

```python
assert validate_complete_sku_parameters(valid_path)["SKU-1"].cost == Decimal("0")
with pytest.raises(AssetContractError, match="折扣价"):
    validate_complete_sku_parameters(blank_discount_path)
with pytest.raises(AssetContractError, match="Excel 精度"):
    validate_complete_sku_parameters(overprecise_path)
```

- [ ] **Step 2: Prove red.** Run from the worktree root: `uv run --frozen --no-sync pytest -q python/lxeskill_cli/tests/vietnam_replenishment/test_asset_contract.py python/lxeskill_cli/tests/vietnam_replenishment/test_workbook.py python/lxeskill_cli/tests/vietnam_replenishment/test_workflow.py`; expect only the new assertions/imports to fail, and record the actual exit code.
- [ ] **Step 3: Implement the shared validator.** Move `_number`'s current finite/nonnegative, 15-digit, float-range and exact `Decimal(str(float))` checks without weakening them; keep `workbook.py` calling `excel_number`. In `asset_contract.py` import `excel_number` and `WorkbookInputError` from `numeric_contract.py`, call `load_sku_parameters`, reject no rows, reject each `None` price with SKU and Chinese field name, then run `excel_number` on each explicit price and translate `WorkbookInputError` to `AssetContractError` while preserving its message. `workbook.py` imports and re-exports them so existing imports stay valid; neither shared module imports the other.

```python
def validate_complete_sku_parameters(path: str | Path) -> dict[str, SkuParameters]:
    values = load_sku_parameters(path)
    if not values:
        raise AssetContractError("当前越南 SKU 参数映射表没有 SKU，请重新上传")
    for sku, row in values.items():
        for field, label in (("cost", "成本"), ("cross_border_price", "跨境价"), ("discount_price", "折扣价")):
            value = getattr(row, field)
            if value is None:
                raise AssetContractError(f"SKU {sku} 缺少{label}，请补全当前越南 SKU 参数映射表")
            try:
                excel_number(value, sku, label)
            except WorkbookInputError as exc:
                raise AssetContractError(str(exc)) from exc
    return values
```

- [ ] **Step 4: Re-run the same targeted suite and inspect diff.** Expect green, then `git diff --check` and inspect only these files. Propose `feat: validate complete Vietnam SKU map inputs` as its own commit; run Git add/commit only after explicit user approval.

### Task 2: Fixed-slot managed version store

**Files:** Create `python/lxeskill_cli/services/vietnam_replenishment/sku_map_store.py`; test `python/lxeskill_cli/tests/vietnam_replenishment/test_sku_map_store.py`. Reuse `shared.process_lock.interprocess_lock`, `shared.input_assets.slot_dir`, and Task 1's complete validator.

**Interfaces:** Produce the four store functions and dataclasses named in the file map. For no manifest, `revision/current/previous` are null. For structurally invalid manifest, `inspect_sku_map` returns `manifest_error` with no actionable revision; strict readers and mutations raise `SkuMapStoreError`. For valid manifest but bad current, inspection preserves revision and valid previous; rollback can heal it. Mutation expects null only when no manifest, checks revision under the lock, and creates a fresh 32-hex revision for every real switch, including A→B→A. Private helpers are `_stage_and_validate_candidate(source: Path) -> StagedCandidate`, `_manifest_with_new_current(old: Manifest | None, staged: StagedCandidate) -> Manifest`, and `_write_fsynced_manifest(manifest: Manifest) -> Path`; `StagedCandidate` contains validated source digest, safe display name, and staged version path.

- [ ] **Step 1: Write synthetic transaction tests.** Set `LXE_DATA_ROOT` to `tmp_path` using the existing workspace test pattern. Exercise valid install, same SHA idempotence, replacement previous, rollback, valid previous with corrupted current, malformed manifest, old `current/` without manifest, stale revision after A→B→A, source changed during copy, and failing `os.replace` before commit. Use monkeypatch on one narrow internal copy/commit helper for fault injection. Core assertions:

```python
first = install_sku_map(a, expected_revision=None)
assert first.status == "installed"
assert install_sku_map(a, first.manifest_revision).status == "unchanged"
second = install_sku_map(b, first.manifest_revision)
assert inspect_sku_map().previous.file_name == a.name
with pytest.raises(SkuMapStoreError, match="已变化"):
    install_sku_map(c, first.manifest_revision)
```

- [ ] **Step 2: Prove red.** Run `uv run --frozen --no-sync pytest -q python/lxeskill_cli/tests/vietnam_replenishment/test_sku_map_store.py`; expect missing module/functions.
- [ ] **Step 3: Implement bounded candidate validation.** Accept only `.xlsx` regular source files with `lstat`, reject symlink/reparse point for source, manifest, `versions/`, and version files; reject size >20 MiB. Read the ZIP central directory without extracting; reject encrypted members, >1000 entries, or total declared uncompressed bytes >100 MiB; bad ZIP/openpyxl errors report actual cause after safe truncation. Validate the source, calculate SHA-256 by bounded chunks, copy to a uniquely named staging file in the slot, `flush`/`fsync`, rehash and revalidate the staged copy. Reject source/stage digest mismatch before any manifest change. Preserve all three explicit price values and never log table rows.

```python
SKU_SLOT = "vietnam_sku_parameter_map"
MAX_COMPRESSED = 20 * 1024 * 1024
MAX_UNCOMPRESSED = 100 * 1024 * 1024
MAX_MEMBERS = 1000
REVISION_RE = re.compile(r"^[0-9a-f]{32}$")
# Version path is formed solely from a validated id: root / "versions" / f"{id}.xlsx".
```

- [ ] **Step 4: Implement the lock and one-pointer commit.** All status reads, installs, rollbacks, and snapshot creation use `interprocess_lock(slot_dir(SKU_SLOT) / ".manifest.lock")`. Parse schema-1 manifest strictly: exact fields, safe UUID ids, SHA-256, nonnegative size, display name only as metadata. Under the lock compare `expected_revision` with the manifest revision. Write immutable version and same-directory temporary manifest with `fsync`; call `os.replace(temp_manifest, manifest)` exactly once and never use delete-then-rename. A failed precommit operation leaves old manifest/current/previous unchanged. `install` on damaged current may recover it, but carries forward only a previously validated version as `previous`; a damaged version is never re-exposed. Successful same-digest upload is a no-op without revision churn. Postcommit orphan cleanup is best effort and must not roll back success. For rollback, validate previous and current; new previous is old current only when valid, otherwise null.

```python
@dataclass(frozen=True)
class SkuMapMutation:
    status: Literal["installed", "unchanged", "rolled_back"]
    manifest_revision: str

with interprocess_lock(slot_dir(SKU_SLOT) / ".manifest.lock"):
    old = _read_manifest_strict()
    if (old.revision if old else None) != expected_revision:
        raise SkuMapStoreError("映射表已变化，请刷新后重试")
    staged = _stage_and_validate_candidate(source)
    next_manifest = _manifest_with_new_current(old, staged)
    temporary_manifest = _write_fsynced_manifest(next_manifest)
    os.replace(temporary_manifest, slot_dir(SKU_SLOT) / "manifest.json")
```

- [ ] **Step 5: Add integrity and platform boundary tests.** Reject bad digest/size, unsafe ID, linked manifest/version/parent directory, nonregular files, bad ZIP, and limits. Assert `inspect_sku_map` returns valid previous plus `current_error` and revision for a bad current; damaged manifest returns `manifest_error` and null revision. Assert a private snapshot remains valid after a later install. Where Windows reparse detection cannot run on macOS, isolate that helper and record the Windows acceptance check; do not mark it validated by macOS.
- [ ] **Step 6: Run the focused suite and inspect diff.** `uv run --frozen --no-sync pytest -q python/lxeskill_cli/tests/vietnam_replenishment/test_sku_map_store.py python/lxeskill_cli/tests/vietnam_replenishment/test_asset_contract.py`; `git diff --check`. Propose `feat: store validated Vietnam SKU map versions` and obtain approval before Git add/commit.

### Task 3: Trust-gated list and generation snapshot

**Files:** Modify `python/lxeskill_cli/shared/input_assets.py`, `services/assets/inspect.py`, `services/vietnam_replenishment/workflow.py`; tests `python/lxeskill_cli/tests/infra/test_input_assets.py`, `tests/vietnam_replenishment/test_workflow.py`, and `test_sku_map_store.py`.

**Interfaces:** Consume `SkuMapStatus`, `inspect_sku_map`, and `current_sku_map_snapshot` from Task 2. `assets list` returns `manifest_revision: str | null`, `current_error`, `previous_error`, `manifest_error` for the managed slot, plus its existing fields. Other slots retain their existing status shape. Strict `current_asset`/`previous_asset` never scan the old directories for this one slot.

- [ ] **Step 1: Write failing integration tests.** With only a legacy `current/file.xlsx` and no manifest, assert `current_asset(SKU_SLOT) is None`, managed list current is null, and fake Yacang export has zero calls. After install, assert list's `management="desktop"`, revision, current file metadata, and previous; after corrupting current, assert list preserves revision and valid previous with `current_error`, while `current_asset` raises a factual `InputAssetError`. Test that other command-managed slots keep the old directory behavior. After invalid manifest, assert the managed slot has `manifest_error` without revision and other slots remain visible.
- [ ] **Step 2: Prove red.** Run `uv run --frozen --no-sync pytest -q python/lxeskill_cli/tests/infra/test_input_assets.py python/lxeskill_cli/tests/vietnam_replenishment/test_workflow.py` and confirm the new assertions fail.
- [ ] **Step 3: Add the narrow adapter.** In `shared.input_assets.current_asset` and `previous_asset`, branch only for `vietnam_sku_parameter_map`, lazily import the store to avoid a cycle, and convert a validated `SkuMapVersion` to existing `AssetVersion`. If a pointed-to version or manifest is corrupt, raise `InputAssetError` with the observed store error; never convert corruption to missing. Leave `promote_asset` rejecting `management="desktop"`.

```python
def current_asset(slot_id: str) -> AssetVersion | None:
    if slot_id == "vietnam_sku_parameter_map":
        from services.vietnam_replenishment.sku_map_store import trusted_version
        return trusted_version("current")
    path = _generation_file(slot_id, _CURRENT)
    return _describe(path) if path else None
```

- [ ] **Step 4: Build the list from one locked state.** `services.assets.inspect.run()` calls `inspect_sku_map()` once for the managed entry, serializes its already captured sizes/times/errors, and never calls `path.stat()` after the lock. Keep `run()`'s ordinary success envelope; a malformed managed manifest becomes an error field on that slot rather than hiding all other assets. Nonmanaged entries continue through `_generation(current_asset(...))` and `_generation(previous_asset(...))`.
- [ ] **Step 5: Replace PR4's unsafe snapshot.** Workflow imports the store context manager. It must acquire the lock, strictly validate current, copy to a private temp file, rehash and validate the copy while still locked, then release lock before `export_vietnam_sources()`. Wrap store exceptions as `VietnamWorkflowError` while preserving actual diagnostic text. Remove its duplicate completeness loop, now shared in Task 1. The workflow may keep a thin alias with its public old name for existing tests, but that alias must call the store implementation.

```python
with current_sku_map_snapshot() as map_path:
    sources = export_vietnam_sources()
    completed = generate_vietnam_workbook(map_path, output, sources=sources, config=config)
```

- [ ] **Step 6: Verify and review.** Run `uv run --frozen --no-sync pytest -q python/lxeskill_cli/tests/infra/test_input_assets.py python/lxeskill_cli/tests/vietnam_replenishment/test_workflow.py python/lxeskill_cli/tests/vietnam_replenishment/test_sku_map_store.py`; inspect `git diff --check` and diff. Propose `feat: trust managed SKU map in listing and workflow`; seek approval before add/commit.

### Task 4: Internal Desktop map commands and truthful subprocess errors

**Files:** Create `python/lxeskill_cli/services/assets/vietnam_sku_install.py`, `vietnam_sku_rollback.py`, `python/lxeskill_cli/tests/lxeskill/test_vietnam_sku_management_cli.py`, `apps/desktop/test/input-assets.test.ts`; modify `python/lxeskill_cli/lxeskill/catalog.json`, `apps/desktop/src/main/input-assets.ts`; run the existing catalog contract suites.

**Interfaces:** Define `parseLastResult(stdout: string)`, `errorMessage(record: unknown)`, and `redactAndBound(message: string)` as private helpers in `input-assets.ts`; the last helper replaces known process secret values and appends an explicit `[truncated]` marker when the message exceeds 4096 bytes. Python commands are `lxeskill assets vietnam sku install --source-path <absolute> --expected-revision <hex-or-empty>` and `lxeskill assets vietnam sku rollback --expected-revision <hex-or-empty>`. Empty revision means no manifest, though rollback rejects it because previous requires a manifest. Both catalog entries have `visibility="internal"`, `exposed=false`, `session_mode="none"`, and exact strict input schemas. Desktop `DesktopInputAssetsService.installVietnamSkuMap(sourcePath: string, expectedRevision: string | null)` and `.rollbackVietnamSkuMap(expectedRevision: string)` call them. Source path never appears in the renderer bridge.

- [ ] **Step 1: Write failing CLI tests.** Assert both catalog entries are internal and unexposed, reject extra slot/path arguments, reject malformed revisions, and return the Task 2 mutation status and revision from synthetic maps. Assert install never invokes the Yacang export. Keep the existing business-command test proving `vietnam stock recommend` accepts no arguments.

```python
entry = load_catalog()["assets_vietnam_sku_install"]
assert entry["visibility"] == "internal" and entry["exposed"] is False
assert entry["input_schema"]["additionalProperties"] is False
assert lxeskill.main(["vietnam", "stock", "recommend", "--source-path", str(candidate)]) == lxeskill.EXIT_USAGE
```

- [ ] **Step 2: Prove red.** `uv run --frozen --no-sync pytest -q python/lxeskill_cli/tests/lxeskill/test_vietnam_sku_management_cli.py python/lxeskill_cli/tests/lxeskill/test_vietnam_recommendation_cli.py`.
- [ ] **Step 3: Add fixed-slot adapters and catalog entries.** Each thin `run(arguments)` converts the CLI empty revision to `None`, validates an absolute source path for install, calls the store, and returns `{success: true, status, manifest_revision}`; exceptions become `{success:false, error:{code,message}}` with the actual bounded and redacted cause. Do not accept a slot name or arbitrary output path. Declare source/revision as required string properties in catalog and set timeout to 180000 ms for install, 30000 ms for rollback.

```python
def run(arguments: dict[str, Any]) -> dict[str, Any]:
    revision = arguments["expected_revision"] or None
    source = Path(arguments["source_path"])
    if not source.is_absolute():
        return {"success": False, "error": {"code": "invalid_arguments", "message": "source_path must be absolute"}}
    result = install_sku_map(source, revision)
    return {"success": True, "status": result.status, "manifest_revision": result.manifest_revision}
```

- [ ] **Step 4: Write Desktop subprocess tests before changing its implementation.** Inject or mock `execFile` using the existing app test pattern. For a nonzero child exit with stdout `{"type":"result","ok":false,"error":{"message":"校验失败: 成本缺失"}}`, assert the actual message is shown instead of Node's `Command failed`. Assert malformed stdout retains actual stderr, `management` and revision survive list parsing, and secret strings are redacted with an explicit truncation marker at 4096 bytes. Verify command arguments are fixed and inherited process environment includes `LXE_DATA_ROOT`, `LXE_SQLITE_DB_PATH`, `LXE_MANAGED_PATH`, and isolated temp variables.
- [ ] **Step 5: Refactor `runAssetCommand` once.** Always capture stdout, stderr, and process error first; parse the last nonempty JSON result even when exit is nonzero. Prefer terminal `error.message`, then `data.error.message`, then `data.exception`, then observed stderr/process error; never replace a real message with a generic guess. Bound and redact after selecting the message. Use this runner for list and both mutations. Reject malformed success envelopes, including missing `manifest_revision`. Keep `directoryFor()` behavior for other slots.

```ts
const result = parseLastResult(stdout);
const observed = errorMessage(result) || stderr.trim() || childError?.message || "lxeskill produced no diagnostic";
if (childError || result?.ok !== true) throw new Error(redactAndBound(observed));
return result.data;
```

- [ ] **Step 6: Verify cross-runtime contract and diff.** Run `uv run --frozen --no-sync pytest -q python/lxeskill_cli/tests/lxeskill python/lxeskill_cli/tests/infra`, `bun test packages/agent/runtime/test/tooling/lxeskill-command.test.ts`, and `bun test apps/desktop/test/input-assets.test.ts` from the root. Check exit codes and scanned test counts; then `git diff --check` and review the changed catalog and adapters. Propose `feat: expose internal Vietnam map management commands`; seek approval before Git add/commit.

### Task 5: Desktop fixed-slot upload and rollback workbench

**Files:** Create `apps/desktop/src/main/vietnam-sku-map-actions.ts`, `apps/desktop/test/vietnam-sku-map-actions.test.ts`; modify `packages/foundation/desktop-protocol/src/index.ts`, `apps/desktop/src/ipc-channels.ts`, `src/preload-bridge.ts`, `src/main/ipc-validation.ts`, `src/main/ipc.ts`, `src/main.ts`, `apps/dashboard/src/features/workbench/input-assets-view.tsx`, `src/shared/i18n.tsx`, `src/styles.css`; tests `apps/desktop/test/preload-bridge.test.ts`, `ipc-validation.test.ts`, `apps/dashboard/test/features/workbench/input-assets-view.test.tsx`.

**Interfaces:** `createVietnamSkuMapActions({list, choose, install, rollback})` is a pure Main-side coordinator whose `upload()` reads current revision before `choose()` and whose `rollback(revision)` forwards one validated revision. `ipc.ts` performs the trusted-sender check before either action. `DesktopInputAssetSlot` gains required `management: "command" | "desktop"`, `manifest_revision: string | null`, and optional `current_error`, `previous_error`, `manifest_error`; other slots get null revision. `DesktopVietnamSkuMapMutation = {status: "installed" | "unchanged" | "rolled_back"; manifest_revision: string}`. Bridge offers `uploadVietnamSkuMap(): Promise<DesktopVietnamSkuMapMutation | null>` and `rollbackVietnamSkuMap(expectedRevision: string): Promise<DesktopVietnamSkuMapMutation>`. Only Main has the selected source path. Its upload handler reads expected revision before opening the chooser; Python compares again under the lock.

- [ ] **Step 1: Write failing protocol/bridge/handler tests.** Verify preload exposes only no-argument upload and revision-only rollback, with no renderer path or slot parameter. Verify the IPC trust guard rejects a non-main frame before dispatch. For upload, inject a canceled `choose()` and assert no install; for a selected file, assert the coordinator passes only the native selected path plus the revision read *before* `choose()`; change revision during selection and assert the Python compare-and-swap error reaches the caller. Verify `validateVietnamSkuMapRevision` accepts exactly 32 lowercase hex characters and rejects `null`, paths, and objects on rollback.

```ts
expect(await bridge.desktop.uploadVietnamSkuMap()).toBeNull();
expect(invocations.at(-1)).toEqual([IPC_CHANNELS.uploadVietnamSkuMap]);
expect(() => validateVietnamSkuMapRevision("../current.xlsx")).toThrow();
```

- [ ] **Step 2: Prove red.** `bun test apps/desktop/test/preload-bridge.test.ts apps/desktop/test/ipc-validation.test.ts apps/desktop/test/vietnam-sku-map-actions.test.ts`.
- [ ] **Step 3: Add typed fixed-slot IPC.** In `ipc.ts`, call `application.isTrustedFileSender(event)` first for both mutations, then delegate to `createVietnamSkuMapActions`. Give it `application.listInputAssets`, the native open-file dialog with an `.xlsx` filter, and fixed-slot install/rollback functions. The coordinator rejects a `manifest_error`, remembers `manifest_revision` before selection, returns null on cancel, and invokes install only on selection. For rollback, validate the revision in IPC and pass it to the coordinator. Wire these to Task 4's service methods in `main.ts`, and add only these two whitelisted channel names to preload. The native filter is UX; Python remains final validator. The coordinator implementation uses `const target = (await deps.list()).find(item => item.slot === "vietnam_sku_parameter_map")`, stores `target.manifest_revision` before awaiting `deps.choose()`, and calls `deps.install(selection.filePaths[0], expected)` only if selection is not canceled.

```ts
ipcMain.handle(IPC_CHANNELS.uploadVietnamSkuMap, (event) => {
  if (!application.isTrustedFileSender(event)) throw new Error("Only the desktop main frame may manage input assets");
  return mapActions.upload();
});
ipcMain.handle(IPC_CHANNELS.rollbackVietnamSkuMap, (event, revision: unknown) => {
  if (!application.isTrustedFileSender(event)) throw new Error("Only the desktop main frame may manage input assets");
  return mapActions.rollback(validateVietnamSkuMapRevision(revision));
});
```

- [ ] **Step 4: Add workbench controls and focused tests.** Render upload only for the exact managed SKU slot, rollback only with a valid previous and revision, and show `current_error`/`previous_error`/`manifest_error` even when current is null. Keep valid previous visible when current is damaged. Disable both controls during a mutation; cancel leaves status unchanged; success labels distinguish installed, unchanged, and rolled back and refresh the list. Show the old template as historical reference and replace the page-wide claim that all uploads occur in chat. Exercise conditional UI with the existing React test harness; add interaction tests for busy/cancel/error/refresh using the app's test utilities rather than a static implementation mirror.

```tsx
const managed = slot.slot === "vietnam_sku_parameter_map" && slot.management === "desktop";
const canRollback = managed && !!slot.previous && !!slot.manifest_revision && !slot.previous_error;
{managed && <button disabled={busy || !!slot.manifest_error} onClick={() => void upload()}>{copy.upload}</button>}
{canRollback && <button disabled={busy} onClick={() => void rollback(slot.manifest_revision!)}>{copy.rollback}</button>}
```

- [ ] **Step 5: Verify targeted Desktop/UI tests and types.** Run `bun test apps/desktop/test/preload-bridge.test.ts apps/desktop/test/ipc-validation.test.ts apps/desktop/test/vietnam-sku-map-actions.test.ts apps/dashboard/test/features/workbench/input-assets-view.test.tsx`, update other `DesktopInputAssetSlot` fixtures found by typecheck, `bun run --cwd apps/desktop typecheck`, and `bun run --cwd apps/dashboard typecheck`. Inspect `git diff --check` and diff. Propose `feat: manage Vietnam SKU map from Desktop workbench`; seek approval before Git add/commit.

### Task 6: Persist and inject four Desktop decimal settings

**Files:** Create `apps/desktop/src/main/config-store/vietnam-recommendation.ts`; modify `packages/foundation/desktop-protocol/src/index.ts`, `apps/desktop/src/main/config-store/model.ts`, `repository.ts`, `setup.ts`, `apps/desktop/src/main/ipc-validation.ts`; tests `apps/desktop/test/config-store-repository.test.ts`, `config-store.test.ts`, `ipc-validation.test.ts`.

**Interfaces:** Define private `strictObjectWithExactlyFourKeys(value: unknown): Record<string, unknown>` and `exactExcelDecimal(value: unknown, field: string, positive: boolean): string` in `vietnam-recommendation.ts`; `DesktopVietnamRecommendationSettings = {weight_30d:string; weight_15d:string; weight_7d:string; exchange_rate:string}` is a required field of `DesktopSetupState` and an optional independent field of `DesktopSetupInput`. `DesktopConfig.schema_version` and `SETTINGS_SCHEMA_VERSION` become 12, with a top-level `vietnam_recommendation` object. `validateVietnamRecommendationSettings(value: unknown)` returns the same four validated decimal strings without converting them to JavaScript numbers. Schema 11 gets the exact defaults; malformed schema 12 never silently defaults.

- [ ] **Step 1: Write failing migration and validation tests.** Confirm `cloneConfig()` has schema 12 and four exact defaults. A stored v11 config lacking the field reads as defaults; v12 with missing object/field, extra field, number instead of string, NaN, infinity, negative weight, zero exchange rate, >15 significant digits, or an inexact float round trip throws without rewriting `settings.json`. IPC rejects the same malformed inputs. Assert a save that contains only `workspace_root` plus `vietnam_recommendation` succeeds without `yacang:save` or a Yacang password, persists across reload, and injects all four variables independently of Yacang readiness.

```ts
expect(parseSettings({...oldV11, schema_version: 11}, "darwin").vietnam_recommendation)
  .toEqual({weight_30d: "0.8", weight_15d: "0.8", weight_7d: "0", exchange_rate: "3900"});
expect(() => validateSetupInput({workspace_root: "/workspace", vietnam_recommendation: {...defaults, exchange_rate: "0"}})).toThrow();
```

- [ ] **Step 2: Prove red.** `bun test apps/desktop/test/config-store-repository.test.ts apps/desktop/test/config-store.test.ts apps/desktop/test/ipc-validation.test.ts`.
- [ ] **Step 3: Implement one strict string validator.** Accept bounded decimal text, optional scientific notation, finite nonnegative weights and finite positive exchange rate. Normalize decimal significand/exponent as strings to compare the user value with `String(Number(value))`; strip leading and trailing zeros for significant-digit count and require ≤15. Check `Number.isFinite` and reject nonzero values that underflow to zero. Return trimmed original strings, never `String(Number(value))`, so saving does not rewrite user decimals. Expose a small named `DEFAULT_VIETNAM_RECOMMENDATION` object. Use the same validator from IPC, schema-12 parser, service save, and repository prewrite gate.

```ts
export function validateVietnamRecommendationSettings(value: unknown): DesktopVietnamRecommendationSettings {
  const raw = strictObjectWithExactlyFourKeys(value);
  const fields = ["weight_30d", "weight_15d", "weight_7d", "exchange_rate"] as const;
  const result = Object.fromEntries(fields.map(field => [field,
    exactExcelDecimal(raw[field], field, field === "exchange_rate")])) as DesktopVietnamRecommendationSettings;
  return result;
}
```

- [ ] **Step 4: Wire schema migration and storage gate.** Add explicit `schema_version === 11` to `parseSettings`' accepted legacy versions when `SETTINGS_SCHEMA_VERSION` moves to 12. Add `vietnam_recommendation` to the exact top-level allow-list. For v12 require the whole object and validate it; for v11 and older use a cloned default. `parseConfig` returns the validated original strings, and `DesktopConfigRepository.commit()` calls `validateVietnamRecommendationSettings(config.vietnam_recommendation)` before writing either secrets or settings. In `DesktopSetupService.save`, assign only if `input.vietnam_recommendation` exists, independent of credential branches. `state()` echoes it. `environment()` always emits all four raw strings under `LXE_VIETNAM_WEIGHT_30D`, `LXE_VIETNAM_WEIGHT_15D`, `LXE_VIETNAM_WEIGHT_7D`, `LXE_VIETNAM_EXCHANGE_RATE`.

```ts
if (input.vietnam_recommendation !== undefined) {
  config.vietnam_recommendation = validateVietnamRecommendationSettings(input.vietnam_recommendation);
}
// environment():
LXE_VIETNAM_WEIGHT_30D: config.vietnam_recommendation.weight_30d,
LXE_VIETNAM_WEIGHT_15D: config.vietnam_recommendation.weight_15d,
LXE_VIETNAM_WEIGHT_7D: config.vietnam_recommendation.weight_7d,
LXE_VIETNAM_EXCHANGE_RATE: config.vietnam_recommendation.exchange_rate,
```

- [ ] **Step 5: Verify environment refresh path.** Existing `main.ts` compares `config.environment()` before/after `saveSetup` and refreshes Gateway/Agent when changed. Add one focused test or extend the existing Main config test proving a four-value edit triggers that path, while re-saving identical strings does not. Confirm `desktop-gateway.ts` still forwards the managed environment into Agent/Python rather than adding a second injection path.
- [ ] **Step 6: Run targeted tests/types and inspect diff.** `bun test apps/desktop/test/config-store-repository.test.ts apps/desktop/test/config-store.test.ts apps/desktop/test/ipc-validation.test.ts`; `bun run --cwd apps/desktop typecheck`; `git diff --check`. Propose `feat: persist Vietnam recommendation settings` after reviewing the diff; Git add/commit requires approval.

### Task 7: Show independent Vietnam parameter save under Yacang

**Files:** Modify `apps/dashboard/src/desktop/settings-model.ts`, `shell.tsx`, `apps/dashboard/src/shared/i18n.tsx`, `styles.css`, `apps/dashboard/test/desktop/settings-fixture-data.ts`, `erp-settings-fixture.tsx`; test `apps/dashboard/test/desktop/settings-model.test.ts` and use the ERP fixture for a native smoke check.

**Interfaces:** Add `vietnamWeight30d`, `vietnamWeight15d`, `vietnamWeight7d`, and `vietnamExchangeRate` to `DesktopSettingsFormValue` as strings. The Yacang dirty group includes these four values. A dedicated “保存越南参数” action calls `desktop.saveSetup(desktopVietnamRecommendationInput(form, setup.workspace_root || form.workspaceRoot))`; it does not include `yacang`, `logging`, or other unsaved drafts. A successful focused save refreshes just the four parameter fields/baseline and leaves other drafts intact. The existing all-settings save includes the four values but retains current credential behavior.

- [ ] **Step 1: Write failing model and UI tests.** Assert the form begins with saved decimal strings, editing a weight makes the Yacang section dirty, and focused refresh clears that dirty state without overwriting an unsaved `yacangMobile` or password draft. Add `desktopVietnamRecommendationInput(form, workspaceRoot)` as a pure payload builder and assert it excludes Yacang, logging, and other drafts. Extend the existing ERP fixture so a native smoke run can fill an incomplete Yacang phone draft and a valid parameter, click dedicated save, and inspect the exact captured payload/success indicator; the saved fixture state must echo `vietnam_recommendation`. Keep invalid-value drafts visible after the IPC error.

```ts
expect(desktopSettingsSectionIsDirty("yacang", edited, baseline)).toBe(true);
expect(desktopSettingsFormAfterVietnamSave(edited, next).yacangMobile).toBe("unsaved phone draft");
expect(desktopVietnamRecommendationInput(edited, "/workspace")).toEqual({
  workspace_root: "/workspace",
  vietnam_recommendation: {weight_30d: "0.7", weight_15d: "0.8", weight_7d: "0", exchange_rate: "3900"},
});
```

- [ ] **Step 2: Prove red.** `bun test apps/dashboard/test/desktop/settings-model.test.ts`.
- [ ] **Step 3: Implement form conversion and focused refresh.** Add the four default strings to the shared `setupState()` fixture, then extend `desktopSettingsForm(state)` and `SECTION_FIELDS.yacang`; implement `desktopSettingsFormAfterVietnamSave(current, next)` by copying only the four keys from `desktopSettingsForm(next)`. Add `desktopVietnamRecommendationInput(form, workspaceRoot)` returning a `DesktopSetupInput` containing only the workspace and four strings. Keep password and unrelated drafts unchanged.

```ts
export const desktopSettingsFormAfterVietnamSave = (current: DesktopSettingsFormValue, next: DesktopSetupState) => ({
  ...current,
  vietnamWeight30d: next.vietnam_recommendation.weight_30d,
  vietnamWeight15d: next.vietnam_recommendation.weight_15d,
  vietnamWeight7d: next.vietnam_recommendation.weight_7d,
  vietnamExchangeRate: next.vietnam_recommendation.exchange_rate,
});
```

- [ ] **Step 4: Implement four inputs and isolated save action.** Put “越南备货” beneath the existing Yacang credentials in its settings section with four text/decimal inputs, localized labels/help/error/success copy. Focused button sets the existing saving/error state, invokes the minimal payload, updates setup and only those four form fields, and does not close settings. Ensure the general `formInput()` includes `vietnam_recommendation` for all-settings save. Its current automatic `yacang:save` behavior must not run on the focused button. Do not silently discard a draft on success or failure.

```tsx
const saveVietnamRecommendation = async () => {
  setSaving(true);
  setError("");
  try {
    const next = await desktop.saveSetup(
      desktopVietnamRecommendationInput(form, setup.workspace_root || form.workspaceRoot));
    await refreshVietnamSetup(next);
    showSuccessNotice(t.desktop.yacang.vietnamSaved);
  } catch (cause) {
    setError(cause instanceof Error ? cause.message : String(cause));
  } finally {
    setSaving(false);
  }
};
```

- [ ] **Step 5: Verify targeted UI and types.** Run `bun test apps/dashboard/test/desktop/settings-model.test.ts`, perform the focused ERP fixture smoke check where native Electron is available, then `bun run --cwd apps/dashboard typecheck` and `git diff --check`. Review the diff and propose `feat: edit Vietnam parameters in Desktop settings`; obtain approval before Git add/commit.

### Task 8: Resolve effective runtime parameters and report their source

**Files:** Modify `python/lxeskill_cli/services/vietnam_replenishment/workbook.py`, `workflow.py`, `services/agent_cli/vietnam_replenishment/generate.py`, `skills/vietnam-stock-recommendation/SKILL.md`; tests `python/lxeskill_cli/tests/vietnam_replenishment/test_workflow.py`, `test_workbook.py`, `tests/lxeskill/test_vietnam_recommendation_cli.py`.

**Interfaces:** `validate_recommendation_config(config: RecommendationConfig) -> tuple[Decimal, Decimal, Decimal, Decimal]` is exported from `workbook.py`, preserving existing `_validated_config` behavior and used by generation. `resolve_recommendation_config(environ: Mapping[str,str]) -> tuple[RecommendationConfig, Literal["environment","default"]]` returns defaults only when all four keys are absent. `VietnamRecommendationRun` adds effective `config` and `config_source`. CLI success data gains string values and factual `config_source`, never claims that an arbitrary environment came from Desktop.

- [ ] **Step 1: Write failing workflow/CLI tests.** With all four variables absent, assert defaults/source `default`. With all present (`0.7/0.6/0.1/4000`), assert passed config reaches the fake `generate_vietnam_workbook`, five-sheet synthetic output has those values in `数据更改`, and CLI reports the same strings/source `environment`. Parametrize one key missing, empty, negative, zero exchange, overprecision, overflow, and underflow; assert `VietnamWorkflowError.code == "recommendation_config_invalid"` and fake Yacang export has zero calls. Update existing CLI success fixture to include config/source.

```python
config, source = resolve_recommendation_config({
    "LXE_VIETNAM_WEIGHT_30D": "0.7", "LXE_VIETNAM_WEIGHT_15D": "0.6",
    "LXE_VIETNAM_WEIGHT_7D": "0.1", "LXE_VIETNAM_EXCHANGE_RATE": "4000",
})
assert source == "environment" and config.exchange_rate == Decimal("4000")
```

- [ ] **Step 2: Prove red.** `uv run --frozen --no-sync pytest -q python/lxeskill_cli/tests/vietnam_replenishment/test_workflow.py python/lxeskill_cli/tests/lxeskill/test_vietnam_recommendation_cli.py`.
- [ ] **Step 3: Implement all-or-nothing resolution before export.** Use exactly the four keys named in Task 6. `if all(name not in environ for name in ENV_NAMES)` returns `RecommendationConfig(), "default"`; otherwise require all four keys to be present and nonempty, parse with `Decimal(raw)`, call shared `validate_recommendation_config`, and wrap its actual failure as `VietnamWorkflowError("recommendation_config_invalid", observed_detail)`. Resolve after obtaining the trusted map snapshot but before `export_vietnam_sources()`. Pass the effective config through to PR3 generation; put it on `VietnamRecommendationRun` and serialize `str(Decimal)` to CLI data. Avoid a second unvalidated default inside the workflow.

```python
if all(name not in environ for name in ENV_NAMES):
    return RecommendationConfig(), "default"
for name in ENV_NAMES:
    if name not in environ or not environ[name].strip():
        raise VietnamWorkflowError("recommendation_config_invalid", f"{name} 缺失或为空")
config = RecommendationConfig(*(Decimal(environ[name]) for name in ENV_NAMES))
validate_recommendation_config(config)
return config, "environment"
```

- [ ] **Step 4: Correct Skill wording.** Replace “当前入口只使用四参数默认值” with “本次生成使用 Desktop 长期设置，旧环境四项全缺时用系统默认；命令结果给出本轮值和来源”. Keep the refusal for explicit per-chat numeric override, no new business arguments, one invocation, and deliver only the final verified workbook. On success the Skill may report effective values/source but must not mislabel an injected environment as saved Desktop settings.
- [ ] **Step 5: Verify targeted tests and diff.** `uv run --frozen --no-sync pytest -q python/lxeskill_cli/tests/vietnam_replenishment/test_workflow.py python/lxeskill_cli/tests/vietnam_replenishment/test_workbook.py python/lxeskill_cli/tests/lxeskill/test_vietnam_recommendation_cli.py`; `git diff --check`. Propose `feat: apply saved Vietnam recommendation parameters`; get approval before Git add/commit.

### Task 9: PR5 integration, handoff, and review boundary

**Files:** Create `docs/harness/vietnam-stock-recommendation/handoff-pr5.md` and `python/lxeskill_cli/tests/vietnam_replenishment/test_pr5_integration.py`; amend design/plan docs only for observed implementation changes. No unrelated code edits.

- [ ] **Step 1: Run one synthetic integrated pass.** In `test_pr5_integration.py`, install map A through the internal Python adapter using a temp data root; inspect the Python `assets list` JSON, replace with B, rollback, then generate against a fake Yacang export and nondefault environment. Task 4 separately verifies Desktop parses that JSON contract. Assert final deliverable is one five-sheet XLSX with A's explicit price cells and the nondefault four values, and that the CLI `files` array contains only that final file. Do not call a live Yacang endpoint.
- [ ] **Step 2: Run final relevant checks once after code settles.** From the worktree root run the Python Vietnam and infrastructure suites, the catalog dual-runtime tests if catalog changed, touched Desktop/Dashboard Bun tests, Desktop/Dashboard typechecks, `git diff --check`, `git status --short`, and a sensitive-string/unrelated-file diff inspection. Verify real exit codes and nonzero test collection. Per AGENTS, postpone the repo-wide full suite until final rebase/merge to main, and do not repeat it on an unchanged base.
- [ ] **Step 3: Write `handoff-pr5.md`.** Record branch `codex/vietnam-stock-pr5-desktop`, pool-2 path, PR4 dependency/base, completed scope, exact changed files and call path, four env names/defaults, tests with actual results, Windows acceptance not yet run, live Yacang limitation, known issues, Git status, and next step. Explicitly put per-chat override in a later PR and state that the Skill refuses it in PR5. Do not guess a PR URL before creation.
- [ ] **Step 4: Present a reviewable boundary to the user.** Summarize diff, actual test/typecheck results, risks, and remaining acceptance items. Propose any needed doc commit and obtain approval before Git add/commit. After a clean commit, read-only check latest main/PR4 state and conflicts on the current branch. Propose push, PR creation against PR4, and merge as three separate approval gates; attach any created PR to this task. Stop after PR5 closure and use the handoff for a new task for the next module.
