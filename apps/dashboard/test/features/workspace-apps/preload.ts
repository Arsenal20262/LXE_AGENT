import { contextBridge, ipcRenderer } from 'electron';
import { createDesktopBridge } from '../../../../desktop/src/preload-bridge';
contextBridge.exposeInMainWorld('native', createDesktopBridge(ipcRenderer, process.platform as 'darwin'|'win32'));
