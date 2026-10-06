import { posix, win32 } from "node:path";

/** Relocate only absolute paths inside the old data root, respecting component boundaries. */
export function relocateStoredPath(value: string, source: string, target: string, platform: NodeJS.Platform = process.platform): string {
  const paths = platform === "win32" ? win32 : posix;
  if (!paths.isAbsolute(value)) return value;
  const relative = paths.relative(source, value);
  if (relative === ".." || relative.startsWith(`..${paths.sep}`) || paths.isAbsolute(relative)) return value;
  return paths.join(target, relative);
}
