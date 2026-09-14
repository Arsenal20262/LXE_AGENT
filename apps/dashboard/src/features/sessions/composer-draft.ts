import { useEffect, useState, type Dispatch, type SetStateAction } from "react";

const keyFor = (conversationKey: string) => `lxe.composer-draft.${conversationKey}`;
function read(key: string): string {
  try { return (sessionStorage.getItem(keyFor(key)) ?? "").slice(0, 8192); } catch { return ""; }
}

/** Preserve text when a question replaces the composer, across session switches and renderer reloads. */
export function useComposerDraft(key: string): [string, Dispatch<SetStateAction<string>>, (key: string, sent: string) => void] {
  const [draft, setDraft] = useState(() => ({ key, text: read(key) }));
  const text = draft.key === key ? draft.text : read(key);
  useEffect(() => {
    try {
      if (text) sessionStorage.setItem(keyFor(key), text);
      else sessionStorage.removeItem(keyFor(key));
    } catch { /* Storage may be unavailable; the in-memory draft still works. */ }
  }, [key, text]);
  return [text, value => setDraft(current => ({ key, text: typeof value === "function"
    ? value(current.key === key ? current.text : read(key)) : value })), (target, sent) => {
    try { if (read(target) === sent) sessionStorage.removeItem(keyFor(target)); } catch { /* optional */ }
    setDraft(current => current.key === target && current.text === sent ? { key: target, text: "" } : current);
  }];
}

/** Called only from a user click, before opening the composer; never during render. */
export function appendComposerDraftPrompt(storage: Pick<Storage, "getItem" | "setItem">, key: string, prompt: string): void {
  const previous = storage.getItem(keyFor(key)) ?? "";
  const next = previous ? `${previous}\n\n${prompt}` : prompt;
  if (next.length > 8192) throw new Error("Draft exceeds 8192 characters; shorten it before adding a skill prompt.");
  storage.setItem(keyFor(key), next);
}
