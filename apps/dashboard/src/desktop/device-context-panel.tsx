import { ChevronDown, Monitor, RotateCcw } from "lucide-react";
import type { DesktopCloudState } from "@lxe/desktop-protocol";
import { useUiText } from "../shared/i18n";
import { skillTypeLabel } from "../shared/format";

export function DeviceContextPanel({ cloud, busy, onRefresh, onConfirm }: {
  cloud: DesktopCloudState; busy: boolean; onRefresh: () => void; onConfirm: () => void;
}) {
  const text = useUiText();
  const t = text.desktop.cloud.permission;
  const context = cloud.device_context;
  const device = context?.device;
  const pending = context?.pending_device;
  const known = cloud.permission_verified_at > 0 && cloud.permission_status !== "denied" && !pending;
  // Presentation only: never change grants, infer permissions, or hide unknown identifiers.
  const label = (group: keyof typeof t.labels, value: string) => {
    const labels: Readonly<Record<string, string>> = t.labels[group];
    return Object.hasOwn(labels, value) ? labels[value]! : value;
  };
  const skillLabel = (value: string) => value === "*" ? t.allSkills : Object.hasOwn(t.labels.skills, value) ? label("skills", value) : skillTypeLabel(value, text);
  const grantList = (group: keyof typeof t.labels, values: string[] | null | undefined, all: string) =>
    !known || values == null ? t.unknown : !values.length ? t.empty : values.map(value => value === "*" ? all : label(group, value)).join(" · ");
  const note = t.notes[cloud.permission_status];
  const profile = cloud.permission_profile ? cloud.profile_labels[t.labelLocale] ?? cloud.permission_profile : known ? t.unassigned : t.unknown;

  return <section className={`desktop-cloud-permission desktop-device-context ${cloud.permission_status}`} aria-label={t.contextTitle}>
    <header className="device-permission-header">
      <span className="device-permission-icon"><Monitor size={20} aria-hidden /></span>
      <div className="device-permission-identity">
        <span className="device-permission-eyebrow">{pending ? t.previousDevice : t.contextTitle}</span>
        <div className="device-permission-title">
          <h3>{device?.display_name || cloud.device_name || t.unknown}</h3>
          <span className={`device-permission-status ${cloud.permission_status}`}>{t.status[cloud.permission_status]}</span>
        </div>
      </div>
      <button disabled={busy} onClick={onRefresh} type="button" className="device-permission-refresh"><RotateCcw size={14} aria-hidden />{t.refresh}</button>
    </header>

    {note ? <p className="device-permission-note" role={cloud.permission_status === "denied" ? "alert" : "status"}>{note}</p> : null}
    {pending ? <div className="device-permission-change" role="alert">
      <p>{t.changed}</p><strong>{pending.display_name} · {pending.wireguard_ip}</strong>
      <button disabled={busy} onClick={onConfirm} type="button">{t.confirm}</button>
    </div> : null}

    <div className="device-permission-profile"><span>{t.profile}</span><span>{profile}</span></div>
    <div className="device-permission-skills">
      <span className="device-permission-label">{t.skills}</span>
      {known && context?.skill_types?.length ? <ul aria-label={t.skills}>
        {context.skill_types.map(value => <li key={value}>{skillLabel(value)}</li>)}
      </ul> : <span className="device-permission-empty">{!known || context?.skill_types == null ? t.unknown : t.empty}</span>}
    </div>
    <p className="device-permission-checked">{t.checked} · {cloud.permission_verified_at ? new Date(cloud.permission_verified_at * 1000).toLocaleString(t.labelLocale) : t.unknown}</p>

    <details className="device-permission-details">
      <summary><ChevronDown size={15} aria-hidden />{t.details}</summary>
      <dl>
        <div><dt>{t.features}</dt><dd>{grantList("features", cloud.desktop_features, t.allFeatures)}</dd></div>
        <div><dt>{t.services}</dt><dd>{grantList("services", context?.server_capabilities, t.allServices)}</dd></div>
        <div><dt>{t.actions}</dt><dd>{grantList("actions", context?.erp_actions, t.allActions)}</dd></div>
      </dl>
      <p className="device-permission-versions">{t.assignmentVersion} · {known ? cloud.permission_version : "—"}<span aria-hidden> / </span>{t.profileRevision} · {known ? cloud.profile_revision : "—"}</p>
    </details>
    {cloud.permission_error ? <details className="device-permission-error">
      <summary><ChevronDown size={15} aria-hidden />{t.errorDetails}</summary>
      <pre>{cloud.permission_error}</pre>
    </details> : null}
    {!cloud.configured && known && cloud.desktop_features.length > 0 ? <p className="device-permission-note">{t.loginMissing}</p> : null}
  </section>;
}
