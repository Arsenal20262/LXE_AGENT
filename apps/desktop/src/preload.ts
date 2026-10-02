import { contextBridge, ipcRenderer, webUtils } from "electron";
import { createDesktopBridge } from "./preload-bridge";
import { normalizeDesktopPlatform } from "./platform";

if (process.isMainFrame) {
  const bridge = createDesktopBridge(
    {
      invoke: (channel, ...arguments_) => ipcRenderer.invoke(channel, ...arguments_),
      on: (channel, listener) => { ipcRenderer.on(channel, listener); },
      removeListener: (channel, listener) => { ipcRenderer.removeListener(channel, listener); },
    },
    normalizeDesktopPlatform(process.platform),
    { getPathForFile: (file) => webUtils.getPathForFile(file) },
  );

  contextBridge.exposeInMainWorld("lxe", bridge);
}
