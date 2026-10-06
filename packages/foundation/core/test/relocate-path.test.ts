import { expect, test } from "bun:test";
import { relocateStoredPath } from "../src/relocate-path";

test("Windows relocation respects case and path boundaries without changing external paths", () => {
  const source = "D:\\Old App\\var", target = "C:\\Users\\用户\\AppData\\Local\\LXE Agent";
  expect(relocateStoredPath("d:/old app/VAR/workspace/中文.txt", source, target, "win32")).toBe(target + "\\workspace\\中文.txt");
  for (const value of ["D:\\Old App\\var-other\\x", "E:\\external", "relative.txt", "https://example.org", "D:\\Old App\\var\\..\\external"]) {
    expect(relocateStoredPath(value,source,target,"win32")).toBe(value);
  }
});
