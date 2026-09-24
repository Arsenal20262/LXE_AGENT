import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, rmSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { readCandidate, writeJsonAtomic, type ReleaseCandidate } from "./release-candidate";

const BUILD_ID = /^[a-zA-Z0-9_-]{1,100}$/;
const message = (error: unknown) => error instanceof Error ? error.message : String(error);

// Publishing holds this same local lock while reading/uploading an installer.
// Cleanup never waits or interferes with a successful build/publication.
export function lockCandidateFiles(directory: string): () => void {
  const lock = join(directory, "retention.lock");
  try { mkdirSync(lock); } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    throw new Error(`Candidate files locked: ${lock}. Remove only after confirming no publisher or cleanup is running.`);
  }
  return () => rmSync(lock, { recursive: true, force: true });
}
export function recordPublished(directory: string, record: ReleaseCandidate): void {
  // publication.json is an upload intent, not proof of successful channel activation.
  writeJsonAtomic(join(directory, "last-published.json"), {
    schema_version: 1, build_id: record.build_id, version: record.version,
    source_commit: record.source_commit, sha512: record.sha512, confirmed_at: new Date().toISOString(),
  });
}

export function cleanupCandidates(directory: string, protectedBuild?: string, log: (text: string) => void = console.log): void {
  let unlock: (() => void) | undefined;
  try {
    unlock = lockCandidateFiles(directory);
    const protectedIds = new Set<string>(protectedBuild ? [protectedBuild] : []);
    const currentPath = join(directory, "current.json");
    if (existsSync(currentPath)) {
      const current = JSON.parse(readFileSync(currentPath, "utf8"));
      if (current?.status === "ready") {
        if (typeof current.candidate !== "string" || !/^[a-zA-Z0-9_-]{1,100}\/candidate\.json$/.test(current.candidate)) throw new Error("Invalid current candidate; cleanup skipped");
        protectedIds.add(current.candidate.split("/")[0]!);
      }
    }
    const candidates: ReleaseCandidate[] = [];
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.isSymbolicLink() || !BUILD_ID.test(entry.name)) continue;
      const path = join(directory, entry.name, "candidate.json");
      if (!existsSync(path)) continue;
      try {
        if (lstatSync(path).isSymbolicLink()) throw new Error("Linked candidate record");
        const record = readCandidate(path);
        if (record.build_id !== entry.name) throw new Error("Candidate directory identity mismatch");
        candidates.push(record);
      } catch (error) { log(`Local cleanup kept ${entry.name}: ${message(error)}`); }
    }
    const publishedPath = join(directory, "last-published.json");
    const hasPublished = existsSync(publishedPath);
    if (hasPublished) {
      const published = JSON.parse(readFileSync(publishedPath, "utf8"));
      const record = candidates.find(item => item.build_id === published?.build_id);
      if (published?.schema_version !== 1 || !record || record.version !== published.version
        || record.source_commit !== published.source_commit || record.sha512 !== published.sha512
        || !Number.isFinite(Date.parse(published.confirmed_at))) throw new Error("Invalid last-published record; cleanup skipped");
      protectedIds.add(record.build_id);
    } else {
      // Old releases lack a success receipt. Preserve ambiguous publication attempts
      // until the first confirmed publication establishes the latest published build.
      for (const record of candidates) if (existsSync(join(directory, record.build_id, "publication.json"))) {
        protectedIds.add(record.build_id);
        log(`Local cleanup kept ${record.build_id}: legacy publication status is unconfirmed`);
      }
    }
    candidates.sort((a, b) => Date.parse(b.built_at) - Date.parse(a.built_at) || b.build_id.localeCompare(a.build_id));
    for (const record of candidates.slice(0, 3)) protectedIds.add(record.build_id);
    let count = 0, bytes = 0;
    for (const record of candidates) {
      if (protectedIds.has(record.build_id)) continue;
      const file = join(directory, record.build_id, record.file_name);
      try {
        if (!existsSync(file)) continue;
        const stat = lstatSync(file);
        if (stat.isSymbolicLink() || !stat.isFile() || stat.size !== record.size) throw new Error("Installer is not the expected regular file");
        unlinkSync(file); count++; bytes += stat.size;
        log(`Removed local installer: ${record.build_id}/${record.file_name}`);
      } catch (error) { log(`Local cleanup kept ${record.build_id}: ${message(error)}`); }
    }
    log(`Local cleanup: removed ${count} installer(s), freed ${(bytes / 1024 / 1024).toFixed(2)} MiB; JSON records retained.`);
  } catch (error) { log(`Local cleanup skipped: ${message(error)}`); }
  finally {
    try { unlock?.(); } catch (error) { log(`Local cleanup lock release failed: ${message(error)}`); }
  }
}
