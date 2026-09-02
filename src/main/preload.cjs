'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('companion', Object.freeze({
  bootstrap: () => ipcRenderer.invoke('app:bootstrap'),
  restartApp: () => ipcRenderer.invoke('app:restart'),
  connect: () => ipcRenderer.invoke('riot:connect'),
  reconnect: () => ipcRenderer.invoke('riot:reconnect'),
  disconnect: () => ipcRenderer.invoke('riot:disconnect'),
  refresh: () => ipcRenderer.invoke('riot:refresh'),
  inspectPlayer: (playerId) => ipcRenderer.invoke('riot:inspect-player', playerId),
  updateSession: (selection) => ipcRenderer.invoke('session:update', selection),
  getSenseiStatus: () => ipcRenderer.invoke('sensei:status'),
  getSenseiReport: (matchId) => ipcRenderer.invoke('sensei:get', matchId),
  runSensei: (request) => ipcRenderer.invoke('sensei:run', request),
  askSensei: (request) => ipcRenderer.invoke('sensei:ask', request),
  importSenseiVod: (matchId) => ipcRenderer.invoke('sensei:vod-import', matchId),
  analyzeSenseiVod: (matchId) => ipcRenderer.invoke('sensei:vod-analyze', matchId),
  cancelSenseiVod: (matchId) => ipcRenderer.invoke('sensei:vod-cancel', matchId),
  deleteSenseiVod: (request) => ipcRenderer.invoke('sensei:vod-delete', request),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  updateSettings: (patch) => ipcRenderer.invoke('settings:update', patch),
  getOverlayStatus: () => ipcRenderer.invoke('overlay:status'),
  copyOverlayUrl: () => ipcRenderer.invoke('overlay:copy-url'),
  regenerateOverlayToken: () => ipcRenderer.invoke('overlay:regenerate-token'),
  previewOverlay: (options = {}) => ipcRenderer.invoke('overlay:preview', options),
  getRemoteStatus: () => ipcRenderer.invoke('remote:status'),
  copyRemoteUrl: () => ipcRenderer.invoke('remote:copy-url'),
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
  onActProgress: (callback) => {
    const handler = (_event, progress) => callback(progress);
    ipcRenderer.on('riot:act-progress', handler);
    return () => ipcRenderer.removeListener('riot:act-progress', handler);
  },
  onSenseiVodProgress: (callback) => {
    const handler = (_event, progress) => callback(progress);
    ipcRenderer.on('sensei:vod-progress', handler);
    return () => ipcRenderer.removeListener('sensei:vod-progress', handler);
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
