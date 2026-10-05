export interface DesktopBuilderConfiguration {
  extraMetadata?: unknown;
  [key: string]: unknown;
}

const desktopProductVersionPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/u;

export function applyDesktopProductVersion(
  builderConfig: DesktopBuilderConfiguration,
  rawVersion: string | undefined,
  identity?: {build_id:string;source_commit:string},
): void {
  const version = rawVersion?.trim() ?? "";
  if (!desktopProductVersionPattern.test(version)) {
    throw new Error(
      `LXE_DESKTOP_PRODUCT_VERSION must use x.y.z for Windows packaging: ${version || "<missing>"}`,
    );
  }

  const existingExtraMetadata = typeof builderConfig.extraMetadata === "object"
      && builderConfig.extraMetadata !== null
      && !Array.isArray(builderConfig.extraMetadata)
    ? builderConfig.extraMetadata as Record<string, unknown>
    : {};
  if (identity && (!/^[a-zA-Z0-9_-]{1,100}$/.test(identity.build_id) || !/^[a-f0-9]{40}$/.test(identity.source_commit))) throw new Error("Invalid desktop build identity");
  builderConfig.extraMetadata = { ...existingExtraMetadata, version, ...(identity ? {lxeBuildId:identity.build_id,lxeSourceCommit:identity.source_commit} : {}) };
}
