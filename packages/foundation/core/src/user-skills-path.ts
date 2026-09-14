import { posix, win32 } from "node:path";

export function resolveUserSkillsRoot(dataRoot: string, environment: Record<string, string | undefined>, platform: NodeJS.Platform = process.platform): string {
  const paths = platform === "win32" ? win32 : posix;
  return paths.resolve(environment.LXE_USER_SKILLS_ROOT?.trim() || paths.join(dataRoot, "skills"));
}
