import { useSyncExternalStore } from "react";
import type { FileApplication, SessionFileRef } from "@lxe/desktop-protocol";
import { errorText, filesApi } from "./api";
interface Snapshot { apps: FileApplication[]; loaded: boolean; error: string }
interface Entry { value: Snapshot; listeners: Set<() => void>; pending?: Promise<void>; expires: number }
const entries = new Map<string, Entry>();
export function useFileApplications(file: SessionFileRef) {
  const key = JSON.stringify(file);
  let entry = entries.get(key);
  if (!entry) { entry = { value: { apps: [], loaded: false, error: "" }, listeners: new Set(), expires: 0 }; entries.set(key, entry); }
  const shared = entry;
  const snapshot = useSyncExternalStore(callback => { shared.listeners.add(callback); return () => { shared.listeners.delete(callback); }; }, () => shared.value);
  const load = async () => {
    if (shared.pending) return shared.pending;
    if (shared.expires > Date.now()) return;
    shared.pending = filesApi().call({ operation: "applications", input: { ref: file } }).then(apps => { shared.value = { apps, loaded: true, error: "" }; shared.expires = Date.now() + 30000; }, error => { shared.value = { apps: [], loaded: true, error: errorText(error) }; }).finally(() => {
      shared.pending = undefined; shared.listeners.forEach(callback => callback());
      if (entries.size > 128) for (const [id, value] of entries) { if (entries.size <= 128) break; if (!value.listeners.size && !value.pending) entries.delete(id); }
    });
    return shared.pending;
  };
  return { ...snapshot, load };
}
