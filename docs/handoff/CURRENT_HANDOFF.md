# Wisdom Indonesia ERP Export Client Handoff

## Goal

Implement the first core Wisdom Indonesia ERP capability: a testable Python export client that obtains a captcha, logs in with the confirmed OAuth contract, submits the goods export, downloads the returned XLSX, validates the workbook and business headers, and returns canonical artifact metadata.

## Branch

- Worktree: `/Users/hym/PycharmProjects/LXE_AGENT/.worktrees/pool-2`
- Branch: `codex/shangman-erp-export-client`
- Base: `efd39316` (`fix: close delivery download sessions before event loop shutdown`)

## Completed

- Added `ShangmanClient` for:
  - `GET /api/blade-auth/oauth/captcha`.
  - caller-injected captcha text through `CaptchaCodeProvider` / `StaticCaptchaCodeProvider`; no OCR or bypass.
  - `POST /api/blade-auth/oauth/token` with the confirmed query fields, Basic Auth, and captcha/tenant headers.
  - `POST /api/blade-goods/goods/merchant/exportNew` with Basic Auth, `Blade-Auth: bearer <access_token>`, and `Tenant-Id`.
  - exact trusted-HTTPS host validation for `erp.shangmanet.com` and the observed export host `oss.erp.shangmanet.com`, followed by XLSX download; no wildcard subdomains.
- Added workbook validation using openpyxl with forced worksheet dimension scanning, so an incorrect XLSX `<dimension>` does not hide actual rows.
- Validated the required Wisdom Indonesia business headers before exposing an artifact, including the source workbook's bilingual `English Name\n(中文名)` headers. The result retains the source header text.
- Download requests to the OSS host omit ERP Basic Auth and `Blade-Auth`; redirects are disabled for downloads.
- Added atomic-enough temporary-file handling: invalid or unreadable downloads leave no partial artifact.
- Added canonical result metadata with platform/source, artifact path, exact filename, sheet names, row count, original source headers, and download host.
- Default output is under the existing artifact root at `shangman/indonesia`; a caller-supplied output directory remains supported. Catalog registration is intentionally deferred.
- Added focused HTTP/download fakes and tests for success, request contract, bad dimensions, exact OSS host, bilingual headers, URL safety, missing headers, malformed XLSX, business failure, and redacted authentication errors.
- Read-only validation of the supplied sample workbook found `sheet1`, 36 source headers, and 16,778 data rows. The workbook emitted an openpyxl warning that it has no default style; validation still succeeded.

## Modified files

- `python/lxeskill_cli/services/shangman/__init__.py`
- `python/lxeskill_cli/services/shangman/goods_export.py`
- `python/lxeskill_cli/tests/shangman/test_goods_export.py`
- `docs/superpowers/plans/2026-09-17-shangman-erp-export-client.md`
- `docs/handoff/CURRENT_HANDOFF.md`

## Deferred to later phases

- Skill definition and discovery.
- `catalog.json` command/dataset contract changes and Catalog tests.
- Desktop secure mobile/password configuration and runtime environment injection.
- Production enablement gate, device permissions, and real ERP probe.
- Natural-language intent routing for monthly sales, 90-day daily sales, inventory, month-end snapshots, inbound time, or listing time.
- The caller/UI flow that displays the captcha image and supplies captcha text.
- Any claim that the source XLSX contains 14-day, 90-day daily, or historical month-end fields; this phase preserves only source workbook fields.

## Verification

Command, run from the worktree/repository root:

```text
uv run pytest python/lxeskill_cli/tests/shangman/test_goods_export.py
```

Current result: `9 passed`.

Additional check:

```text
git diff --check
```

No real ERP request was made, no credential or token was written to source, fixtures, logs, or this handoff, and no push was performed.

## Git commit

The commit SHA is reported in the stage completion response. This document is included in that commit, so it cannot contain its own SHA; use `git log -1 --format=%H codex/shangman-erp-export-client` to retrieve it from the repository.

## Stage 2: Unified public entry and CLI contract

- Worktree/Pool: `/Users/hym/PycharmProjects/LXE_AGENT/.worktrees/pool-2`, branch `codex/shangman-erp-export-client`.
- Base commit: `d9e61d4c0c1d6006ee74d5f95834f12bb379c6a0`.
- Public Skill: `shangman-goods-export-workflow-map`, authorization type `amazon_replenish`.
- Public commands:
  - `lxeskill shangman export preview --request-text "<完整原始请求>"`
  - `lxeskill shangman export run --request-text "<完整原始请求>"`
- All supported sales, inventory, month-end, inbound-time, and listing-time wording maps to one canonical `goods-export` intent and one `goods-export` task. The original request text is retained.
- `preview` is deterministic and makes no network request. `run` first checks `LXE_SHANGMAN_PROD_ENABLED`, then these runtime-only variables: `LXE_SHANGMAN_TENANT_ID`, `LXE_SHANGMAN_USERNAME`, `LXE_SHANGMAN_PASSWORD`, `LXE_SHANGMAN_BASIC_USERNAME`, and `LXE_SHANGMAN_BASIC_PASSWORD`; it then requires the later interaction layer's captcha input before invoking the stage-one client. The public Catalog schema accepts only the complete `request_text`; captcha is not a public command argument.
- Missing gate, credentials, or captcha returns a recoverable `data.error` with a specific code. Terminal failure messages preserve the nested business diagnostic with credential values redacted. No Desktop files are read and no real ERP request was made.

### Stage 2 files

- `python/lxeskill_cli/services/shangman/intent.py`
- `python/lxeskill_cli/services/agent_cli/shangman/__init__.py`
- `python/lxeskill_cli/services/agent_cli/shangman/_workflow.py`
- `python/lxeskill_cli/services/agent_cli/shangman/goods_export_preview.py`
- `python/lxeskill_cli/services/agent_cli/shangman/goods_export_run.py`
- `python/lxeskill_cli/tests/shangman/test_intent.py`
- `python/lxeskill_cli/tests/shangman/test_goods_export_workflow.py`
- `python/lxeskill_cli/lxeskill/business.py`
- `python/lxeskill_cli/lxeskill/catalog.json`
- `skills/shangman-goods-export-workflow-map/SKILL.md`
- `python/lxeskill_cli/tests/lxeskill/test_fba_skill_docs.py`
- `python/lxeskill_cli/tests/lxeskill/test_lxeskill_cli.py`
- `packages/agent/runtime/test/tooling/lxeskill-command.test.ts`
- `docs/superpowers/plans/2026-09-17-shangman-goods-export-contract.md`
- `docs/handoff/CURRENT_HANDOFF.md`

### Stage 2 verification

- `UV_CACHE_DIR=/private/tmp/lxe-uv-cache uv run pytest python/lxeskill_cli/tests/lxeskill python/lxeskill_cli/tests/infra python/lxeskill_cli/tests/shangman` → `336 passed`, 4 existing aiohttp deprecation warnings. The command required sandbox-outside execution only because the existing aiohttp test binds a localhost port.
- `bun test packages/agent/runtime/test/tooling/lxeskill-command.test.ts` → `4 pass`.
- `UV_CACHE_DIR=/private/tmp/lxe-uv-cache uv run lxeskill shangman export preview --request-text '请导出90天日度销量'` → terminal `ok=true`, canonical `goods-export` plan with the source-field limitation notice, no files.
- `uv run lxeskill shangman export run --request-text '请导出当前库存'` → terminal `ok=false`, `data.error.code=production_gate_required`, no files and no ERP request.
- `git diff --check` passed; sensitive-data scan found only variable names, protocol field names, redaction logic, and explicitly synthetic test values; no runtime credential or token was used or recorded.

### Stage 2 limits and next step

- Desktop secure credential configuration, Cloud enrollment, production gate ownership, captcha image display and manual input, and authorized real end-to-end export remain for stage 3.
- A parallel duplicate implementation (`export_intent.py` / `export_*` adapters and tests) was reviewed, its coverage was retained in the canonical workflow tests, and the duplicate files were removed so the Catalog module names and public Skill cannot diverge.
- Stage 2 changes are verified but not staged or committed. Proposed commit: `feat: add Shangman unified export skill contract`.
