import type { ReactNode } from "react";

export function WorkspaceView<T extends string>({
  activeView,
  actions,
  children,
  items,
  label,
  onSelect,
}: {
  activeView: T;
  actions?: ReactNode;
  children: ReactNode;
  items: ReadonlyArray<{ id: T; label: string }>;
  label: string;
  onSelect: (view: T) => void;
}) {
  return (
    <section className="workspace-view">
      <header className="workspace-view-header">
        <div className="workspace-header-actions"><nav aria-label={label} className="workspace-subnav">
          {items.map((item) => (
            <button
              aria-current={activeView === item.id ? "page" : undefined}
              className={activeView === item.id ? "workspace-subnav-item active" : "workspace-subnav-item"}
              key={item.id}
              onClick={() => onSelect(item.id)}
              type="button"
            >
              {item.label}
            </button>
          ))}
        </nav>{actions}</div>
      </header>
      <div className="workspace-view-content">{children}</div>
    </section>
  );
}
