import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, realpathSync, statSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";

export function skillPathKey(path: string): string {
  const absolute = resolve(path);
  const canonical = existsSync(absolute) ? realpathSync(absolute) : absolute;
  return process.platform === "win32" ? canonical.toLowerCase() : canonical;
}

export function skillFileList(root: string): Array<{ path: string; size: number }> {
  const files: Array<{ path: string; size: number }> = [];
  const walk = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if ([".git", ".venv", "node_modules", "__pycache__"].includes(entry.name)) continue;
      const path = join(directory, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (entry.isFile()) files.push({ path: relative(root, path).split(sep).join("/"), size: statSync(path).size });
      // Linked resources are validated when explicitly referenced; never recursively follow links.
    }
  };
  walk(root);
  return files.sort((a, b) => a.path.localeCompare(b.path));
}

export function skillTreeFingerprint(root: string): string {
  const hash = createHash("sha256");
  for (const file of skillFileList(root)) {
    const info = statSync(join(root, file.path), { bigint: true });
    hash.update(`${file.path}\0${info.dev}:${info.ino}:${info.size}:${info.mtimeNs}\0`);
  }
  return hash.digest("hex");
}

export function readSkillStates(path: string): Record<string, false> {
  if (!existsSync(path)) return {};
  const value: unknown = JSON.parse(readFileSync(path, "utf8"));
  if (!value || typeof value !== "object" || !("version" in value) || value.version !== 1
    || !("disabled" in value) || !Array.isArray(value.disabled)
    || value.disabled.some(item => typeof item !== "string" || !item.trim())) {
    throw new Error(`Invalid skill state file: ${path}; expected {version: 1, disabled: string[]}`);
  }
  return Object.fromEntries(value.disabled.map(item => [skillPathKey(item as string), false]));
}
