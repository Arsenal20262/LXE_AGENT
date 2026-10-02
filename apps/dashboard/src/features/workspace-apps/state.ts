import type { WorkspaceApplication } from '@lxe/desktop-protocol';
export const CHOICE_KEY = 'lxe.workspace-open.application.v1';
interface Api {
  getWorkspaceApplications(input?: { refresh?: boolean }): Promise<WorkspaceApplication[]>;
  openWorkspace(directory: string, applicationId?: string): Promise<void>;
}
interface Snapshot { apps: WorkspaceApplication[]; loaded: boolean; loading: boolean; error: string; choice: string; busy: boolean }
const errorText = (error: unknown) => error instanceof Error ? error.message : String(error);
export class WorkspaceApplicationState {
  private listeners = new Set<() => void>();
  private pending?: Promise<void>;
  private snapshot: Snapshot;
  constructor(private readonly api: () => Api, private readonly storage: () => Pick<Storage,'getItem'|'setItem'> | undefined) {
    let choice = ''; try { choice = storage()?.getItem(CHOICE_KEY) ?? ''; } catch { /* Preference is optional. */ }
    this.snapshot = { apps: [], loaded: false, loading: false, error: '', choice, busy: false };
  }
  getSnapshot = () => this.snapshot;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private update(patch: Partial<Snapshot>) { this.snapshot = { ...this.snapshot, ...patch }; this.listeners.forEach(listener => listener()); }
  load(refresh = false): Promise<void> {
    if (this.pending) return this.pending;
    if (this.snapshot.loaded && !refresh) return Promise.resolve();
    this.update({ loading: true });
    this.pending = Promise.resolve().then(() => this.api().getWorkspaceApplications({ refresh })).then(apps => {
      this.update({ apps, error: '', loaded: true });
    }, error => this.update({ error: errorText(error), loaded: true })).finally(() => { this.pending = undefined; this.update({ loading: false }); });
    return this.pending;
  }
  async open(directory: string, applicationId: string, remember: boolean): Promise<void> {
    if (this.snapshot.busy) throw new Error('A workspace application launch is already in progress');
    this.update({ busy: true });
    try {
      // A system-open action must remain usable even if optional app discovery failed.
      await this.api().openWorkspace(directory, ['finder','explorer','system'].includes(applicationId) ? undefined : applicationId);
      if (remember) {
        this.update({ choice: applicationId });
        try { this.storage()?.setItem(CHOICE_KEY, applicationId); } catch { /* Keep the in-memory choice. */ }
      }
    } catch (error) {
      this.update({ loaded: false }); await this.load(); // Pick up a launcher removed by the host after ENOENT.
      throw error;
    } finally { this.update({ busy: false }); }
  }
}
export const workspaceApplications = new WorkspaceApplicationState(
  () => { if (!window.lxe?.desktop) throw new Error('Desktop workspace applications are unavailable'); return window.lxe.desktop; },
  () => typeof window === 'undefined' ? undefined : window.localStorage,
);
