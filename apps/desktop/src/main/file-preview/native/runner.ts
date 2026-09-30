import { execFile } from "node:child_process";
export type NativeCommandRunner = (file: string, args: readonly string[], signal: AbortSignal, visibility?: string) => Promise<{ stdout: string; stderr: string }>;
export const runNativeCommand: NativeCommandRunner = (file, args, signal) => new Promise((resolve, reject) => {
  execFile(file, [...args], { signal, windowsHide: true, timeout: 20000, maxBuffer: 8 * 1024 * 1024, encoding: "utf8" }, (error, stdout, stderr) => {
    if (error) reject(new Error([error.message, stderr.trim()].filter(Boolean).join("\n"), { cause: error }));
    else resolve({ stdout, stderr });
  });
});
