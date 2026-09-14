import { randomUUID } from "node:crypto";
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { readSkillStates, skillFileList, skillPathKey } from "./skill-files";
import { safeSkillReference, SkillCatalog, type SkillCatalogEntry, type SkillPromptOptions } from "./skills";

const contains = (root: string, path: string): boolean => {
  const child = relative(skillPathKey(root), skillPathKey(path));
  return child !== "" && !isAbsolute(child) && child !== ".." && !child.startsWith(`..${sep}`);
};

/** Dashboard file operations only. This service is not a model tool. */
export class UserSkillFiles {
  constructor(private readonly catalog: SkillCatalog, private readonly dataRoot: string) {}

  list(options: SkillPromptOptions = {}) {
    const available = new Set(this.catalog.list(options).map(item => skillPathKey(item.location)));
    return this.catalog.entries().filter(entry => entry.source === "user").map(entry => this.payload(entry, available));
  }

  content(id: string, options: SkillPromptOptions = {}, file = "SKILL.md") {
    const entry = this.entry(id);
    const root = dirname(entry.location);
    const safe = safeSkillReference(root, file);
    const bytes = readFileSync(join(root, safe));
    const preview = bytes.subarray(0, 256 * 1024);
    let content: string | undefined;
    try { if (!preview.includes(0)) content = new TextDecoder("utf-8", { fatal: true }).decode(preview, { stream: bytes.length > preview.length }); }
    catch { /* A binary resource is listed, without pretending it is UTF-8 text. */ }
    const item = this.list(options).find(item => item.id === id)!;
    return { ...item, files: skillFileList(root), file: safe, content: content ?? "",
      binary: content === undefined, truncated: bytes.length > preview.length };
  }

  setEnabled(id: string, version: string, enabled: boolean, options: SkillPromptOptions = {}) {
    const path = this.catalog.statePath;
    if (!path) throw new Error("Skill state path is not configured");
    mkdirSync(dirname(path), { recursive: true });
    const lock = `${path}.lock`;
    const descriptor = openSync(lock, "wx", 0o600);
    const temporary = `${path}.${randomUUID()}.tmp`;
    try {
      const entry = this.entry(id, version);
      const states = readSkillStates(path);
      const key = skillPathKey(entry.location);
      if (enabled) delete states[key]; else states[key] = false;
      writeFileSync(temporary, JSON.stringify({ version: 1, disabled: Object.keys(states).sort() }, null, 2) + "\n", { mode: 0o600 });
      renameSync(temporary, path);
    } finally {
      closeSync(descriptor);
      rmSync(temporary, { force: true });
      rmSync(lock, { force: true });
    }
    this.catalog.forceRefresh();
    return this.list(options).find(item => item.id === id)!;
  }

  delete(id: string, version: string) {
    const entry = this.entry(id, version);
    const root = dirname(entry.location);
    const trash = join(this.dataRoot, "trash", "skills");
    if (contains(root, trash) || skillPathKey(root) === skillPathKey(trash)) throw new Error("Skill cannot contain its recycle directory");
    mkdirSync(trash, { recursive: true });
    const destination = join(trash, `${basename(root)}-${randomUUID()}`);
    renameSync(root, destination);
    this.catalog.forceRefresh();
    return { id, deleted: true, recycled_path: destination };
  }

  private entry(id: string, version?: string): SkillCatalogEntry {
    this.catalog.forceRefresh();
    const entry = this.catalog.entries().find(item => item.id === id && item.source === "user");
    if (!entry) throw new Error(`User skill not found: ${id}`);
    const root = dirname(entry.location);
    if (!existsSync(entry.location) || !contains(this.catalog.userSkillsRoot, root)
      || !contains(resolve(this.catalog.userSkillsRoot), entry.location)) {
      throw new Error(`User skill is not a manageable child of its source directory: ${entry.location}`);
    }
    if (version !== undefined && version !== entry.version) throw new Error(`Skill changed; reload before modifying: ${entry.location}`);
    return entry;
  }

  private payload(entry: SkillCatalogEntry, available: Set<string>) {
    const manifest = entry.manifest;
    return { id: entry.id, version: entry.version, source: "user" as const, location: entry.location,
      name: manifest?.name ?? basename(dirname(entry.location)), type: manifest?.type ?? "default",
      description: manifest?.description ?? "", commands: manifest?.commands ?? [], references: manifest?.references ?? [],
      enabled: entry.enabled, available: available.has(skillPathKey(entry.location)),
      unavailable_reason: entry.diagnostics.map(item => item.message).join("\n")
        || (!entry.enabled ? "disabled" : !available.has(skillPathKey(entry.location)) ? "permission_or_connector" : ""),
      diagnostics: entry.diagnostics };
  }
}
