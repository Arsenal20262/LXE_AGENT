import type { JsonObject } from "@lxe/protocol";
import { readFileSync } from "node:fs";

export interface ArtifactPathDeclaration {
  field: string;
  role: "deliverable" | "model_input" | "diagnostic";
}

export interface LxeSkillCommandDefinition {
  command: string;
  name: string;
  module?: string;
  visibility: "business" | "browser" | "maintenance" | "internal";
  ownerSkills: string[];
  attributionSkill?: string;
  artifactPaths?: ArtifactPathDeclaration[];
  managedExecution?: { attachmentArgument?: string };
  timeoutMs?: number;
}

interface LxeSkillCatalogEntry {
  name: string;
  [key: string]: unknown;
}

interface LxeSkillCatalogDocument {
  protocol_version: "1";
  entries: LxeSkillCatalogEntry[];
  datasets?: Record<string, unknown>;
}

/** A registered artifact directory: where a class of CLI output lands. */
export interface LxeSkillDataset {
  id: string;
  /** Module-partitioned path relative to the artifact root, e.g. "fba/delivery_csv". */
  dir: string;
  /** One line describing what the directory holds, shown to the model. */
  holds: string;
}

const DATASET_ID = /^[a-z][a-z0-9_]*$/u;
const DATASET_DIR = /^[a-z][a-z0-9_]*(?:\/[a-z][a-z0-9_]*)*$/u;

/**
 * Read the artifact dataset registry. Mirrors shared/datasets.py so both
 * runtimes fail on the same malformed contract.
 */
export function loadLxeSkillDatasets(path: string): LxeSkillDataset[] {
  const document = JSON.parse(readFileSync(path, "utf8")) as LxeSkillCatalogDocument;
  const raw = document.datasets;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("invalid lxeskill dataset registry");
  }
  const seenDirs = new Set<string>();
  return Object.entries(raw).map(([id, value]) => {
    const item = value && typeof value === "object" && !Array.isArray(value)
      ? value as Record<string, unknown>
      : {};
    const dir = String(item.dir ?? "").trim();
    const holds = String(item.holds ?? "").trim();
    if (!DATASET_ID.test(id) || !DATASET_DIR.test(dir) || !dir.includes("/") || !holds) {
      throw new Error(`invalid lxeskill dataset declaration: ${id}`);
    }
    if (seenDirs.has(dir)) throw new Error(`duplicate lxeskill dataset dir: ${dir}`);
    seenDirs.add(dir);
    return { id, dir, holds };
  });
}

const artifactPathsOf = (
  raw: Record<string, unknown>,
  entryName: string,
): ArtifactPathDeclaration[] => {
  const declarations = Array.isArray(raw.artifact_paths) ? raw.artifact_paths : [];
  return declarations.map((value) => {
    const item = value && typeof value === "object" && !Array.isArray(value)
      ? value as Record<string, unknown>
      : {};
    const field = String(item.field ?? "").trim();
    const role = String(item.role ?? "").trim() as ArtifactPathDeclaration["role"];
    if (!/^[A-Za-z_]\w*(?:\[\])?(?:\.[A-Za-z_]\w*(?:\[\])?)*$/u.test(field)
      || !["deliverable", "model_input", "diagnostic"].includes(role)) {
      throw new Error(`invalid artifact path declaration: ${entryName}`);
    }
    return { field, role };
  });
};

const MANAGED_TOKEN = /^[a-z][a-z0-9-]*$/u;
const MANAGED_ARGUMENT = /^[a-z][a-z0-9_]*$/u;

const managedExecutionOf = (raw: Record<string, unknown>, commandPath: string[], ownerSkills: string[]) => {
  if (!Object.prototype.hasOwnProperty.call(raw, "managed_execution")) return undefined;
  const value = raw.managed_execution;
  const declaration = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
  const schema = raw.input_schema && typeof raw.input_schema === "object" && !Array.isArray(raw.input_schema)
    ? raw.input_schema as Record<string, unknown> : null;
  const properties = schema?.properties && typeof schema.properties === "object" && !Array.isArray(schema.properties)
    ? schema.properties as Record<string, unknown> : null;
  const required = schema?.required ?? [];
  const timeout = Number(raw.timeout_ms);
  if (!declaration || Object.keys(declaration).some(key => key !== "attachment_argument")
    || raw.visibility !== "business" || raw.session_mode !== "none" || raw.exposed !== true
    || ownerSkills.length !== 1 || commandPath.length === 0 || !commandPath.every(token => MANAGED_TOKEN.test(token))
    || !Number.isSafeInteger(timeout) || timeout <= 0 || !schema || schema.type !== "object"
    || schema.additionalProperties !== false || !properties || !Array.isArray(required)) {
    throw new Error(`invalid managed execution contract: ${String(raw.name ?? "")}`);
  }
  if (!Object.prototype.hasOwnProperty.call(declaration, "attachment_argument")) {
    if (Object.keys(properties).length !== 0 || required.length !== 0)
      throw new Error(`invalid managed execution inputs: ${String(raw.name ?? "")}`);
    return {};
  }
  const argument = declaration.attachment_argument;
  if (typeof argument !== "string" || !MANAGED_ARGUMENT.test(argument)
    || Object.keys(properties).length !== 1 || !Object.prototype.hasOwnProperty.call(properties, argument)
    || required.length !== 1 || required[0] !== argument)
    throw new Error(`invalid managed execution attachment argument: ${String(raw.name ?? "")}`);
  const field = properties[argument] as Record<string, unknown> | null;
  const fileInput = field?.["x-lxe-file-input"] as Record<string, unknown> | undefined;
  if (!field || field.type !== "string" || !fileInput || !Array.isArray(fileInput.accepted_extensions)
    || fileInput.accepted_extensions.length !== 1 || fileInput.accepted_extensions[0] !== ".xlsx")
    throw new Error(`invalid managed execution XLSX input: ${String(raw.name ?? "")}`);
  return { attachmentArgument: argument };
};

export function loadLxeSkillCommandCatalog(path: string): LxeSkillCommandDefinition[] {
  const document = JSON.parse(readFileSync(path, "utf8")) as LxeSkillCatalogDocument;
  if (document.protocol_version !== "1" || !Array.isArray(document.entries)) {
    throw new Error("invalid lxeskill command catalog protocol");
  }
  return document.entries.map((entry) => {
    const raw = entry as Record<string, unknown>;
    const commandPath = Array.isArray(raw.command_path)
      ? raw.command_path.map((item) => String(item).trim()).filter(Boolean)
      : [];
    const visibility = String(raw.visibility ?? "internal") as LxeSkillCommandDefinition["visibility"];
    if (commandPath.length === 0 || !["business", "browser", "maintenance", "internal"].includes(visibility)) {
      throw new Error(`invalid lxeskill catalog entry: ${entry.name}`);
    }
    const artifactPaths = artifactPathsOf(raw, entry.name);
    const ownerSkills = Array.isArray(raw.owner_skills)
      ? raw.owner_skills.map((item) => String(item).trim()).filter(Boolean)
      : [];
    const managedExecution = managedExecutionOf(raw, commandPath, ownerSkills);
    const explicitAttribution = String(raw.attribution_skill ?? "").trim();
    if (ownerSkills.length > 1 && !explicitAttribution) {
      throw new Error(`multi-owner lxeskill command requires attribution_skill: ${entry.name}`);
    }
    if (explicitAttribution && !ownerSkills.includes(explicitAttribution)) {
      throw new Error(`lxeskill attribution_skill must be an owner: ${entry.name}`);
    }
    const attributionSkill = explicitAttribution || (ownerSkills.length === 1 ? ownerSkills[0] : "");
    return {
      command: `lxeskill ${commandPath.join(" ")}`,
      name: entry.name,
      ...(String(raw.module ?? "").trim() ? { module: String(raw.module).trim() } : {}),
      visibility,
      ownerSkills,
      ...(attributionSkill ? { attributionSkill } : {}),
      ...(artifactPaths.length ? { artifactPaths } : {}),
      ...(managedExecution ? { managedExecution, timeoutMs: Number(raw.timeout_ms) } : {}),
    };
  });
}

export interface LxeSkillInvocation {
  command: string;
  commandId: string;
  ownerSkills?: string[];
  attributionSkill?: string;
}

const normalize = (value: string): string => value.trim().replaceAll(/\s+/gu, " ");

export function matchLxeSkillInvocation(
  rawCommand: unknown,
  knownCommands?: ReadonlyMap<string, readonly string[]>,
  knownAttributions?: ReadonlyMap<string, string>,
): LxeSkillInvocation | undefined {
  const command = normalize(String(rawCommand ?? ""));
  if (!/^lxeskill(?:\.cmd)?\s+/iu.test(command)) return undefined;
  const canonical = command.replace(/^lxeskill\.cmd(?=\s)/iu, "lxeskill");
  if (knownCommands) {
    const matches = [...knownCommands.entries()]
      .filter(([candidate]) => {
        const normalizedCandidate = normalize(candidate);
        return canonical.toLowerCase() === normalizedCandidate.toLowerCase()
          || canonical.toLowerCase().startsWith(`${normalizedCandidate.toLowerCase()} `);
      })
      .sort((left, right) => right[0].length - left[0].length);
    const matched = matches[0];
    if (!matched) return undefined;
    const stableCommand = normalize(matched[0]);
    const attributionSkill = String(knownAttributions?.get(matched[0]) ?? "").trim();
    return {
      command: stableCommand,
      commandId: stableCommand.slice("lxeskill ".length),
      ownerSkills: [...matched[1]],
      ...(attributionSkill ? { attributionSkill } : {}),
    };
  }
  const tokens = canonical.split(" ");
  const commandTokens: string[] = [];
  for (const token of tokens.slice(1)) {
    if (token.startsWith("-")) break;
    commandTokens.push(token);
  }
  if (commandTokens.length === 0) return undefined;
  return {
    command: `lxeskill ${commandTokens.join(" ")}`,
    commandId: commandTokens.join(" "),
  };
}

export const classifyLxeSkillInput = (
  input: JsonObject,
  knownCommands: ReadonlyMap<string, readonly string[]>,
  knownAttributions?: ReadonlyMap<string, string>,
): LxeSkillInvocation | undefined => matchLxeSkillInvocation(
  input.command,
  knownCommands,
  knownAttributions,
);
