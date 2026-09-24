import { createHash, randomUUID } from "node:crypto";
import { createReadStream, readFileSync, writeFileSync, renameSync, rmSync, statSync } from "node:fs";
import { dirname, join } from "node:path";

export const VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
export async function sha512(file: string): Promise<string> {
  const hash = createHash("sha512");
  for await (const part of createReadStream(file)) hash.update(part);
  return hash.digest("base64");
}
export function writeJsonAtomic(path: string, value: unknown): void {
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    writeFileSync(temporary, JSON.stringify(value, null, 2) + "\n", { flag: "wx" });
    renameSync(temporary, path);
  } finally { rmSync(temporary, { force: true }); }
}
export interface ReleaseCandidate {
  schema_version: 1; version: string; build_id: string; source_commit: string;
  built_at: string; platform: "windows-x64"; file_name: string; object_key: string;
  size: number; sha512: string; notes: string;
}
export function readCandidate(path: string): ReleaseCandidate {
  const record = JSON.parse(readFileSync(path, "utf8")) as ReleaseCandidate;
  if (record.schema_version !== 1 || !VERSION.test(record.version) || record.platform !== "windows-x64"
    || !/^[a-f0-9]{40}$/.test(record.source_commit) || !/^[a-zA-Z0-9_-]{1,100}$/.test(record.build_id)
    || typeof record.notes !== "string" || !record.notes.trim()
    || typeof record.built_at !== "string" || !Number.isFinite(Date.parse(record.built_at))
    || !Number.isSafeInteger(record.size) || record.size <= 0 || typeof record.sha512 !== "string") {
    throw new Error("Invalid candidate identity");
  }
  const name = `LXE-Agent-${record.version}-windows-x64.exe`;
  if (record.file_name !== name || record.object_key !== `artifacts/${record.version}/${record.build_id}/${name}`) {
    throw new Error("Invalid candidate path");
  }
  return record;
}
export async function verifyCandidate(path: string): Promise<ReleaseCandidate> {
  const record = readCandidate(path);
  const file = join(dirname(path), record.file_name);
  if (statSync(file).size !== record.size || await sha512(file) !== record.sha512) {
    throw new Error("Candidate installer changed");
  }
  return record;
}
