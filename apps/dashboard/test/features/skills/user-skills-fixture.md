# User Skill acceptance

Run from the repository root:

```sh
bun apps/dashboard/test/features/skills/user-skills-fixture-server.ts
```

Open the printed local URL. This fixture uses the real user-skill file service and UI components with disposable files. It has no model connection and counts attempted message sends.

Checked on macOS in the browser:

- Valid, broken YAML and shadowed entries appear together with actual diagnostics.
- An existing Chinese draft survives navigation. Use appends one prompt; refresh and remount do not duplicate it. Send count stays zero.
- Edit appends the name and actual manifest path while preserving the draft and send count.
- Markdown and assets/template.md render in the preview. The narrow viewport remains usable.
- Disable immediately blocks Use. Recycle removes the entry and reports its recovery path.

Automated coverage additionally checks stale mutation rejection, restart persistence, shared sources, canonical path activation, native file/exec creation and editing, and shared Python/Bun format fixtures.

## Windows native validation — 2026-09-14

Tested through SSH in an isolated Windows x64 worktree, with Bun 1.4.2 and Python 3.12.10 from that worktree's own virtual environment.

- At `6a33f9c0`: 101 related Bun tests and 81 Python tests passed. All workspace type checks and the Dashboard production build passed.
- Native file/exec tests created and validated instruction-only and scripted/template skills using Chinese and space-containing paths. Discovery, state persistence, stale-version rejection, activation and conversation drafts passed.
- An additional real C-drive skill / D-drive app-data test exposed `EXDEV` during recycling. Fix `664c2435` adds copy-and-version-check handling before source removal, retaining the recovery copy if removal fails.
- At `664c2435`: all 28 affected Bun tests passed, including the real cross-volume regression; the original standalone C→D case and all workspace type checks passed again.

This run verified Windows native processes, file operations, Dashboard interfaces and production compilation. It did not automate the Windows desktop GUI. The main checkout and user skills on the remote machine were left unchanged.
