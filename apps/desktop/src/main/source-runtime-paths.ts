import { posix, win32 } from "node:path";

/** Source resources belong to one checkout; this resolver never touches disk. */
export function sourceRuntimePaths(sourceRoot: string, platform: NodeJS.Platform = process.platform, arch: string = process.arch) {
  const path = platform === "win32" ? win32 : posix;
  const target = `${platform}-${arch}`;
  const runtimeRoot = path.join(sourceRoot, "build", "desktop-runtime", target);
  const toolsRoot = path.join(runtimeRoot, "tools");
  const officeRoot = path.join(runtimeRoot, "office");
  const sandboxRoot = path.join(sourceRoot, "build", "exec-sandbox");
  return {
    runtimeRoot,
    cacheRoot: path.join(sourceRoot, "build", "desktop-runtime-cache", target),
    descriptor: path.join(sourceRoot, "build", "desktop-runtime-inputs.json"),
    node: path.join(runtimeRoot, "node", platform === "win32" ? "node.exe" : "node"),
    officeRoot,
    officeCli: path.join(officeRoot, "node_modules", "@deepseek-ai", "libreoffice-kit", "lib", "cli.js"),
    toolsRoot,
    exifTool: path.join(toolsRoot, "exiftool", platform === "win32" ? "exiftool.exe" : "exiftool"),
    fd: path.join(toolsRoot, platform === "win32" ? "fd.exe" : "fd"),
    sandboxRoot,
    sandboxRunner: path.join(sandboxRoot, "runner.mjs"),
  };
}
