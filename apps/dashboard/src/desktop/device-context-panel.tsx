import type { DesktopCloudState } from "@lxe/desktop-protocol";
import { useUiText } from "../shared/i18n";

export function DeviceContextPanel({ cloud, busy, onRefresh, onConfirm }: {
  cloud: DesktopCloudState; busy: boolean; onRefresh: () => void; onConfirm: () => void;
}) {
  const t = useUiText().desktop.cloud.permission;
  const context = cloud.device_context;
  const device = context?.device;
  const list = (values: string[] | null | undefined) => values == null ? t.unknown : values.length ? values.join(" · ") : t.empty;
  return <section className={`desktop-cloud-permission desktop-device-context ${cloud.permission_status}`} aria-label={t.contextTitle}>
    <div><strong>{t.contextTitle}</strong><span>{t.status[cloud.permission_status]}</span></div>
    <button disabled={busy} onClick={onRefresh} type="button">{t.refresh}</button>
    {context?.pending_device ? <div role="alert"><p>{t.changed}</p>
      <p>{context.pending_device.display_name} · {context.pending_device.wireguard_ip}</p>
      <button disabled={busy} onClick={onConfirm} type="button">{t.confirm}</button></div> : null}
    {cloud.permission_error ? <p role="alert">{cloud.permission_error}</p> : null}
    <dl>
      <div><dt>{t.server}</dt><dd>{context?.server_url || t.unknown}</dd></div>
      <div><dt>{t.device}</dt><dd>{device ? `${device.display_name} · ${device.wireguard_ip}` : cloud.device_name || t.unknown}</dd></div>
      <div><dt>{t.profile}</dt><dd>{cloud.permission_profile ? cloud.profile_labels[t.labelLocale] ?? cloud.permission_profile : t.unassigned}</dd></div>
      <div><dt>{t.version}</dt><dd>{cloud.permission_version > 0 ? `v${cloud.permission_version} / r${cloud.profile_revision}` : "—"}</dd></div>
      <div><dt>{t.checked}</dt><dd>{cloud.permission_verified_at ? new Date(cloud.permission_verified_at * 1000).toLocaleString(t.labelLocale) : t.unknown}</dd></div>
      <div><dt>{t.skills}</dt><dd>{list(context?.skill_types)}</dd></div>
      <div><dt>{t.features}</dt><dd>{list(cloud.desktop_features)}</dd></div>
      <div><dt>{t.services}</dt><dd>{list(context?.server_capabilities)}</dd></div>
      <div><dt>{t.actions}</dt><dd>{list(context?.erp_actions)}</dd></div>
    </dl>
    {!cloud.configured && cloud.desktop_features.length > 0 ? <p>{t.loginMissing}</p> : null}
  </section>;
}
