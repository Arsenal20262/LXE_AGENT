/** Only these native caption menus and application actions cross the desktop bridge. */
export interface DesktopTitlebarMenuRequest {
  menu: "application" | "edit";
  language: "zh" | "en";
  x: number;
  y: number;
}

export type DesktopTitlebarAction = "settings" | "check-updates" | null;
