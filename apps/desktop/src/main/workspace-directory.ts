import { realpathSync, statSync } from "node:fs";
import { isAbsolute } from "node:path";

export function workspaceDirectory(value: unknown): string {
  if (typeof value !== "string" || !isAbsolute(value) || value.includes("\0")) {
    throw new Error("Workspace must be an absolute directory path");
  }
  if (!statSync(value).isDirectory()) throw new Error(`Workspace is not a directory: ${value}`);
  return realpathSync.native(value);
}

export async function openWorkspaceDirectory(value: unknown, open: (path: string) => Promise<string>): Promise<void> {
  const error = await open(workspaceDirectory(value));
  if (error) throw new Error(error);
}
