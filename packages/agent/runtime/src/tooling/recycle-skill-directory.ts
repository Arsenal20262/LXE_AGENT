import { cpSync, mkdirSync, readdirSync, renameSync, rmSync } from "node:fs";
import { join } from "node:path";

const message = (error: unknown): string => error instanceof Error ? error.message : String(error);

/** Same-volume moves remain atomic; cross-volume moves retain a recovery copy on removal failure. */
export function recycleSkillDirectory(
  source: string,
  destination: string,
  assertSourceUnchanged: () => void,
  renameDirectory: typeof renameSync = renameSync,
): void {
  try {
    renameDirectory(source, destination);
    return;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EXDEV") throw error;
  }

  // Own the destination before any cleanup; never erase an already-existing directory.
  mkdirSync(destination);
  try {
    for (const child of readdirSync(source)) {
      cpSync(join(source, child), join(destination, child),
        { recursive: true, force: false, errorOnExist: true, verbatimSymlinks: true });
    }
    // Copying can take time. An external edit must cancel deletion and preserve the original.
    assertSourceUnchanged();
  } catch (error) {
    try { rmSync(destination, { recursive: true, force: true }); }
    catch (cleanup) {
      throw new Error(`${message(error)}; could not clean partial recycle copy ${destination}: ${message(cleanup)}`, { cause: error });
    }
    throw error;
  }
  try {
    rmSync(source, { recursive: true });
  } catch (error) {
    throw new Error(`${message(error)}; complete recovery copy retained at ${destination}`, { cause: error });
  }
}
