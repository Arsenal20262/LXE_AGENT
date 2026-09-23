import { useUiText } from "../shared/i18n";
import { BrandMark } from "../shared/ui/brand-mark";
import { UpdateControl } from "./update-control";

export function SidebarStatus({ onOpen }: { onOpen: () => void }) {
  const t = useUiText();
  return (
    <div className="sidebar-status-card">
      <button
        aria-label={t.sidebar.statusAndSettings}
        className="sidebar-settings-button"
        title={t.sidebar.statusAndSettings}
        type="button"
        onClick={onOpen}
      >
        <span className="sidebar-status-icon"><BrandMark /></span>
        <span className="sidebar-status-copy">
          <span className="sidebar-status-title">{t.sidebar.statusAndSettings}</span>
        </span>
      </button>
      <UpdateControl />
    </div>
  );
}
