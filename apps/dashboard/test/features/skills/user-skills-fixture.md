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

Automated coverage additionally checks stale mutation rejection, restart persistence, shared sources, canonical path activation, native file/exec creation and editing, and shared Python/Bun format fixtures. Windows path parsing is tested with Unicode and spaces; Windows runtime UI was not run on this macOS host.
