import { expect, test } from "bun:test";
import { appendComposerDraftPrompt } from "../../../src/features/sessions/composer-draft";
import { ConversationDisplayController } from "../../../src/features/sessions/display-controller";

test("skill clicks append to the new-conversation draft without sending or overwriting another draft", () => {
  const data = new Map<string, string>([["lxe.composer-draft.existing", "unfinished existing task"]]);
  const storage = { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, text: string) => { data.set(key, text); } };
  const display = new ConversationDisplayController(); display.select("", true);
  const key = display.getSnapshot().viewKey;
  appendComposerDraftPrompt(storage, key, "my unfinished new task");
  appendComposerDraftPrompt(storage, key, "Use weekly-report");
  expect(data.get(`lxe.composer-draft.${key}`)).toBe("my unfinished new task\n\nUse weekly-report");
  expect(data.get("lxe.composer-draft.existing")).toBe("unfinished existing task");
  expect(display.getSnapshot().pending).toEqual([]);
  expect(display.getSnapshot().sessionId).toBe("");
  // Merely reading the display during a re-render cannot inject a second prompt.
  display.getSnapshot(); display.getSnapshot();
  expect(data.get(`lxe.composer-draft.${key}`)?.match(/Use weekly-report/g)).toHaveLength(1);
});


test("returning from another session restores the unsent new draft before adding a skill", () => {
  const data = new Map<string, string>();
  const storage = { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, text: string) => { data.set(key, text); } };
  const display = new ConversationDisplayController(); display.select("", true);
  const draftKey = display.getSnapshot().viewKey;
  appendComposerDraftPrompt(storage, draftKey, "Already written");
  display.select("another-session");
  display.select("", true, draftKey);
  appendComposerDraftPrompt(storage, display.getSnapshot().viewKey, "Use weekly-report");
  expect(data.get(`lxe.composer-draft.${draftKey}`)).toBe("Already written\n\nUse weekly-report");
  expect(display.getSnapshot().pending).toEqual([]);
});
