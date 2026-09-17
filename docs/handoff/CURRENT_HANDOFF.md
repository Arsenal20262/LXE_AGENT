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
