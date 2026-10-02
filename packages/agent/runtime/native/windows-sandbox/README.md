# Windows ACL launcher

Adapted from DeepSeek Harness commit `639ed015397290b3745d163aafe02ffee4aa3f84`:
`packages/sandbox/sandbox-windows-acl/src` and `packages/subprocess/win32-process/src`.
The upstream MIT license is retained in LICENSE. This directory is vendored native
code, outside the Bun runtime bundle. Build it for Node with
`bun scripts/prepare-exec-sandbox.ts`; Koffi 3.1.1 is locked separately.

Local adaptations: relative imports, Node createRequire in place of DSH's lazy
loader, no Cordis/diagnostic-skill registration or DSH control pipe, LXE error
prefix, and TMPDIR alongside TMP/TEMP. Bun owns the wrapper's environment,
stdio, output persistence and cancellation. The Node helper owns Win32 handles,
restricted tokens, grants and the kill-on-close Job. Each workspace-write call
creates a unique temporary child directory/SID under the host-assigned session
temporary directory, avoiding concurrent grant revocation. Normal exit revokes
and removes that temporary directory. Forced termination can leave residue;
subsequent launches never reuse its path/SID.

Workspace ACLs, inherited delete-child denies and Low labels persist by design.
The backend has DSH's partial write enforcement, including hardlink aliases,
Low-label effects on other processes and inherited pipe/PowerShell limitations.
It does not isolate reads, networking or process visibility. It never retries an
unrestricted command or repairs foreign ACLs. See the main permission-policy
document for product scope and native validation.
