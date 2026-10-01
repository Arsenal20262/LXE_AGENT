export const SIDEBAR_EXPANDED_STORAGE_KEY = "lxe.dashboard.sidebar.expanded";
export const SIDEBAR_WIDTH_STORAGE_KEY = "lxe.dashboard.sidebar.width";
export const SIDEBAR_DEFAULT_WIDTH = 256;
export const SIDEBAR_MIN_WIDTH = 256;
export const SIDEBAR_MAX_WIDTH = 420;

type SidebarStorage = Pick<Storage, "getItem" | "setItem">;

export function initialSidebarWidth(storage?: SidebarStorage): number {
  try {
    const value = Number(storage?.getItem(SIDEBAR_WIDTH_STORAGE_KEY));
    return Number.isFinite(value) && value >= SIDEBAR_MIN_WIDTH && value <= SIDEBAR_MAX_WIDTH
      ? Math.round(value) : SIDEBAR_DEFAULT_WIDTH;
  } catch {
    return SIDEBAR_DEFAULT_WIDTH;
  }
}

export function storeSidebarWidth(width: number, storage?: SidebarStorage): void {
  try {
    storage?.setItem(SIDEBAR_WIDTH_STORAGE_KEY, String(width));
  } catch {
    // Resizing still works when local preferences cannot be saved.
  }
}

export function initialSidebarExpanded(storage?: SidebarStorage): boolean {
  if (!storage) return true;
  try {
    const value = storage.getItem(SIDEBAR_EXPANDED_STORAGE_KEY);
    if (value === null) return true;
    if (value === "false") return false;
    return true;
  } catch {
    return true;
  }
}

export function storeSidebarExpanded(expanded: boolean, storage?: SidebarStorage): void {
  if (!storage) return;
  try {
    storage.setItem(SIDEBAR_EXPANDED_STORAGE_KEY, String(expanded));
  } catch {
    // The current layout still works when persistent storage is unavailable.
  }
}
