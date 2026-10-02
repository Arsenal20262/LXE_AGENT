// Gesture grammar adapted from DeepSeek Harness tool-skill (MIT).
export function invokedSkillNames(text: string): string[] {
  return [...new Set([...text.matchAll(/(^|\s)\/([a-z0-9]+(?:-[a-z0-9]+)*)(?=\s|$)/g)].map(match => match[2]!))];
}
const escape = (value: string) => value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
export function renderInvokedSkill(skill: { name: string; root: string; content: string }): string {
  return `<skill_content name="${escape(skill.name)}">\n<skill_resources>\nBase directory: ${skill.root}\nResolve relative resource paths against this directory. Load referenced resources only as needed.\n</skill_resources>\n<skill_instructions>\n${skill.content}\n</skill_instructions>\n</skill_content>`;
}
