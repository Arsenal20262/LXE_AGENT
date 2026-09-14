import { expect, test } from "bun:test";
import { resolveUserSkillsRoot } from "../src/user-skills-path";

test("managed skill roots use the host data directory and respect explicit overrides", () => {
  expect(resolveUserSkillsRoot("/应用/LXE Agent/var", {}, "darwin")).toBe("/应用/LXE Agent/var/skills");
  expect(resolveUserSkillsRoot("D:\\应用\\LXE Agent\\var", {}, "win32")).toBe("D:\\应用\\LXE Agent\\var\\skills");
  expect(resolveUserSkillsRoot("/app/var", { LXE_USER_SKILLS_ROOT: " /shared/skills " }, "linux")).toBe("/shared/skills");
  expect(resolveUserSkillsRoot("C:\\LXE\\var", { LXE_USER_SKILLS_ROOT: "E:\\我的技能" }, "win32")).toBe("E:\\我的技能");
});
