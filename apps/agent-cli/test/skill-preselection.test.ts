import { afterEach, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { extname, join } from "node:path";
import type { AgentJob, JsonObject } from "@lxe/protocol";
import type {
  CliTerminalResult,
  LxeSkillCommandDefinition,
  RuntimeAttachmentRecord,
  RuntimeMessage,
  RuntimeSkillSnapshot,
} from "@lxe/runtime";
import { createSkillPreselector } from "../src/skill-preselection";

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

const rule = (name = "fixture-replenishment") => ({
  name,
  textPhrases: ["查询甲国备货"],
  attachment: {
    extensions: [".xlsx"],
    probeCommandId: "fixture_probe",
    followupPhrases: ["仅绑定", "绑定并查询"],
  },
});

function fixture(options: {
  text?: string;
  files?: string[];
  previous?: { files: string[]; invokedSkills?: string[]; text?: string };
  older?: boolean;
  platform?: string;
  rules?: ReturnType<typeof rule>[];
  matches?: boolean;
  invalidRecord?: boolean;
  probeError?: Error;
  resolveAttachmentError?: Error;
  terminalData?: JsonObject;
} = {}) {
  const root = mkdtempSync(join(tmpdir(), "lxe-preselect-test-"));
  roots.push(root);
  const pathFor = (name: string): string => {
    const path = join(root, name);
    writeFileSync(path, "synthetic attachment");
    return path;
  };
  const records = new Map<string, RuntimeAttachmentRecord>();
  const blocks = (names: string[], turnId: string) => names.map((name, index) => {
    const path = pathFor(`${turnId}-${index}${extname(name)}`);
    const attachmentId = `${turnId}-${index}`;
    const record: RuntimeAttachmentRecord = {
      attachment_id: attachmentId, turn_id: turnId, path, name,
      size_bytes: 20, media_type: "application/octet-stream", ts: 0,
    };
    records.set(attachmentId, record);
    return { type: "local_file", ...record };
  });
  const currentFiles = blocks(options.files ?? [], "current");
  const previousFiles = blocks(options.previous?.files ?? [], "previous");
  const currentUserMessage: RuntimeMessage = {
    role: "user", message_id: "current-message",
    content: [...currentFiles, ...(options.text ? [{ type: "text", text: options.text }] : [])],
  };
  const persistedMessages: RuntimeMessage[] = [];
  if (options.older) persistedMessages.push({ role: "user", message_id: "older", content: previousFiles });
  if (options.previous) {
    persistedMessages.push({
      role: "user", message_id: "previous-message", content: options.older ? [] : previousFiles,
      ...(options.previous.invokedSkills ? { invoked_skills: options.previous.invokedSkills } : {}),
    });
  }
  if (options.older) persistedMessages.push({ role: "user", message_id: "intervening", content: "unrelated" });
  const job = {
    job_id: "current", session_id: "synthetic-session", session_key: "desktop:synthetic-session",
    response_route_id: "route-current", user_id: "synthetic-user", conversation_id: "synthetic-session",
    is_group: false, message_id: "current-message", user_input: options.text ?? "",
    job_kind: "turn", sender_nick: "Synthetic", workspace: { directory: root, worktree: root },
    source: { platform: options.platform ?? "desktop", chat_id: "synthetic-session", chat_type: "dm", user_id: "synthetic-user" },
    raw_data: {}, user_content_blocks: currentFiles, diagnostics: [],
  } satisfies AgentJob;
  const skillSnapshot: RuntimeSkillSnapshot = {
    names: ["fixture-replenishment"], prompt: "", modules: {},
    preselection: options.rules ?? [rule()],
  };
  const command = {
    name: "fixture_probe", command: "lxeskill fixture probe", visibility: "internal",
    preselectionProbe: true,
  } as LxeSkillCommandDefinition;
  const calls: string[][] = [];
  const errors: unknown[] = [];
  const failurePaths: string[] = [];
  const select = createSkillPreselector({
    commands: [command],
    resolveAttachment: async (_sessionId, id) => {
      if (options.resolveAttachmentError) throw options.resolveAttachmentError;
      return options.invalidRecord
        ? { ...records.get(id)!, size_bytes: 999 }
        : id.startsWith("current-") ? undefined : records.get(id);
    },
    runProbe: async (_entry, argv) => {
      calls.push(argv);
      if (options.probeError) throw options.probeError;
      return {
        protocol_version: "1", type: "result", command: "fixture probe", ok: true,
        data: options.terminalData ?? { success: true, matches: options.matches ?? true }, files: [],
      } satisfies CliTerminalResult;
    },
    reportProbeFailure: (_commandId, error, attachmentPath) => {
      errors.push(error);
      failurePaths.push(attachmentPath);
    },
  });
  const context = { job, currentUserMessage, persistedMessages, skillSnapshot,
    workspace: { directory: root, worktree: root }, signal: new AbortController().signal };
  return { select, context, calls, errors, failurePaths, currentPath: currentFiles[0]?.path };
}

test("clear business text preselects its declared Skill without probing", async () => {
  const f = fixture({ text: "请查询甲国备货" });
  expect(await f.select(f.context)).toEqual(["fixture-replenishment"]);
  expect(f.calls).toEqual([]);
});

test("a sole wordless XLSX probes once with fixed CLI arguments", async () => {
  const f = fixture({ files: ["synthetic.xlsx"] });
  expect(await f.select(f.context)).toEqual(["fixture-replenishment"]);
  expect(f.calls).toHaveLength(1);
  expect(f.calls[0]?.slice(0, -1)).toEqual(["fixture", "probe", "--source-path"]);
  expect(f.calls[0]?.at(-1)).toBeString();
});

test("unrelated workbook does not preselect", async () => {
  const f = fixture({ files: ["other.xlsx"], matches: false });
  expect(await f.select(f.context)).toEqual([]);
  expect(f.calls).toHaveLength(1);
});

test.each(["仅绑定", "绑定并查询"])("immediate attachment clarification %s may reuse the verified previous file", async text => {
  const f = fixture({ text, previous: { files: ["synthetic.xlsx"], invokedSkills: ["fixture-replenishment"] } });
  expect(await f.select(f.context)).toEqual(["fixture-replenishment"]);
  expect(f.calls).toHaveLength(1);
});

test.each(["仅绑定", "绑定并查询"])("current unique XLSX with %s preselects after the read-only probe", async text => {
  const f = fixture({ text, files: ["synthetic.xlsx"] });
  expect(await f.select(f.context)).toEqual(["fixture-replenishment"]);
  expect(f.calls).toHaveLength(1);
});

test("previous upload without prior Skill activation is not inferred", async () => {
  const f = fixture({ text: "仅绑定", previous: { files: ["synthetic.xlsx"] } });
  expect(await f.select(f.context)).toEqual([]);
  expect(f.calls).toEqual([]);
});

test("older attachments, multiple files and non-XLSX never trigger a probe", async () => {
  const cases = [
    fixture({ text: "仅绑定", previous: { files: ["synthetic.xlsx"], invokedSkills: ["fixture-replenishment"] }, older: true }),
    fixture({ files: ["one.xlsx", "two.xlsx"] }),
    fixture({ files: ["notes.pdf"] }),
  ];
  for (const f of cases) {
    expect(await f.select(f.context)).toEqual([]);
    expect(f.calls).toEqual([]);
  }
});

test("invalid stored attachment and probe failure do not preselect", async () => {
  const invalid = fixture({ files: ["synthetic.xlsx"], invalidRecord: true });
  expect(await invalid.select(invalid.context)).toEqual([]);
  expect(invalid.calls).toEqual([]);
  expect(invalid.errors).toEqual([]);
  const failed = fixture({ files: ["synthetic.xlsx"], probeError: new Error("synthetic probe failed") });
  expect(await failed.select(failed.context)).toEqual([]);
  expect(failed.calls).toHaveLength(1);
  expect(failed.errors).toHaveLength(1);
});

test.each([
  ["DB", new Error("sqlite attachment lookup failed")],
  ["EACCES", Object.assign(new Error("attachment read denied"), { code: "EACCES" })],
] as const)("unexpected %s attachment resolution error is reported", async (_case, error) => {
  const f = fixture({ files: ["synthetic.xlsx"], resolveAttachmentError: error });
  expect(await f.select(f.context)).toEqual([]);
  expect(f.calls).toEqual([]);
  expect(f.errors).toEqual([error]);
  expect(f.failurePaths).toEqual([f.currentPath!]);
});

test.each([
  ["missing", { success: true }],
  ["nonboolean", { success: true, matches: "yes" }],
] as const)("probe with %s data.matches reports a malformed terminal", async (_case, terminalData) => {
  const f = fixture({ files: ["synthetic.xlsx"], terminalData });
  expect(await f.select(f.context)).toEqual([]);
  expect(f.calls).toHaveLength(1);
  expect(f.errors).toHaveLength(1);
  expect((f.errors[0] as Error).message).toContain("data.matches");
});

test("ambiguous Skill declarations and non-Desktop turns stay on the ordinary route", async () => {
  const conflict = fixture({ text: "请查询甲国备货", rules: [rule(), rule("other-replenishment")] });
  expect(await conflict.select(conflict.context)).toEqual([]);
  const nonDesktop = fixture({ files: ["synthetic.xlsx"], platform: "feishu" });
  expect(await nonDesktop.select(nonDesktop.context)).toEqual([]);
  expect(nonDesktop.calls).toEqual([]);
});
