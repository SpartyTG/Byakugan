'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('companion', Object.freeze({
  bootstrap: () => ipcRenderer.invoke('app:bootstrap'),
  connect: () => ipcRenderer.invoke('riot:connect'),
  disconnect: () => ipcRenderer.invoke('riot:disconnect'),
  refresh: () => ipcRenderer.invoke('riot:refresh'),
  inspectPlayer: (playerId) => ipcRenderer.invoke('riot:inspect-player', playerId),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  updateSettings: (patch) => ipcRenderer.invoke('settings:update', patch),
  getOverlayStatus: () => ipcRenderer.invoke('overlay:status'),
  copyOverlayUrl: () => ipcRenderer.invoke('overlay:copy-url'),
  regenerateOverlayToken: () => ipcRenderer.invoke('overlay:regenerate-token'),
  getUpdateStatus: () => ipcRenderer.invoke('update:status'),
  checkForUpdates: () => ipcRenderer.invoke('update:check'),
  downloadAndInstallUpdate: () => ipcRenderer.invoke('update:download-install'),
  windowAction: (action) => ipcRenderer.invoke('window:action', action),
  onLiveState: (callback) => {
    const handler = (_event, state) => callback(state);
    ipcRenderer.on('riot:live-state', handler);
    return () => ipcRenderer.removeListener('riot:live-state', handler);
  },
  onSnapshot: (callback) => {
    const handler = (_event, snapshot) => callback(snapshot);
    ipcRenderer.on('riot:snapshot', handler);
    return () => ipcRenderer.removeListener('riot:snapshot', handler);
  },
  onWarning: (callback) => {
    const handler = (_event, message) => callback(message);
    ipcRenderer.on('app:warning', handler);
    return () => ipcRenderer.removeListener('app:warning', handler);
  },
  onUpdateStatus: (callback) => {
    const handler = (_event, status) => callback(status);
    ipcRenderer.on('update:status', handler);
    return () => ipcRenderer.removeListener('update:status', handler);
  }
}));
