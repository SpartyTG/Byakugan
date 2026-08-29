'use strict';

const path = require('node:path');
const { app, BrowserWindow, clipboard, ipcMain, shell } = require('electron');
const appMetadata = require('../../package.json');
const { SettingsStore } = require('./settings-store.cjs');
const { MockService } = require('./services/mock-data.cjs');
const { OverlayServer, createOverlayToken } = require('./services/overlay-server.cjs');
const { RiotClientService } = require('./services/riot-client.cjs');
const { UpdateService } = require('./services/update-service.cjs');

let mainWindow = null;
let settings = null;
let service = null;
let snapshot = null;
let overlayServer = null;
let updateService = null;
let overlayPreviewWindow = null;

function createUpdateService() {
  let updater = null;
  if (app.isPackaged) {
    try { ({ autoUpdater: updater } = require('electron-updater')); } catch {}
  }
  updateService = new UpdateService({
    app,
    updater,
    feedConfigured: appMetadata.updateFeedConfigured === true
  });
  updateService.on('status', (status) => mainWindow?.webContents.send('update:status', status));
  return updateService;
}

async function syncOverlay() {
  if (!overlayServer) return { enabled: false, running: false, url: '', error: '' };
  if (!settings.get().streamOverlayEnabled && !overlayPreviewWindow) {
    await overlayServer.stop();
    return overlayServer.status();
  }
  try {
    await overlayServer.start();
    overlayServer.publish();
  } catch (error) {
    mainWindow?.webContents.send('app:warning', `Stream overlay: ${error.message}`);
  }
  return overlayServer.status();
}

function createService(mode) {
  service?.disconnect?.();
  service = mode === 'live' ? new RiotClientService() : new MockService();

  if (service.on) {
    service.on('live-state', (state) => {
      if (snapshot) snapshot.live = state;
      overlayServer?.publish();
      mainWindow?.webContents.send('riot:live-state', state);
    });
    service.on('snapshot', (nextSnapshot) => {
      snapshot = nextSnapshot;
      overlayServer?.publish();
      mainWindow?.webContents.send('riot:snapshot', nextSnapshot);
    });
    service.on('warning', (message) => mainWindow?.webContents.send('app:warning', message));
  }
  return service;
}

async function connectCurrentMode() {
  const mode = settings.get().dataMode;
  if (!service || (mode === 'mock' && !(service instanceof MockService)) || (mode === 'live' && !(service instanceof RiotClientService))) {
    createService(mode);
  }
  snapshot = await service.connect();
  overlayServer?.publish();
  return snapshot;
}

function registerIpc() {
  ipcMain.handle('app:bootstrap', async () => {
    if (!snapshot) snapshot = await connectCurrentMode();
    return {
      snapshot,
      settings: settings.get(),
      overlay: overlayServer?.status(),
      update: updateService?.status(),
      version: app.getVersion()
    };
  });

  ipcMain.handle('riot:connect', connectCurrentMode);
  ipcMain.handle('riot:refresh', async () => {
    if (!service) return connectCurrentMode();
    snapshot = await service.refresh();
    overlayServer?.publish();
    return snapshot;
  });
  ipcMain.handle('riot:disconnect', () => {
    service?.disconnect?.();
    snapshot = null;
    overlayServer?.publish();
    return { ok: true };
  });
  ipcMain.handle('riot:inspect-player', (_event, playerId) => {
    if (!service?.inspectPlayer) throw new Error('Player inspection is unavailable for this data source.');
    return service.inspectPlayer(String(playerId || ''));
  });

  ipcMain.handle('settings:get', () => settings.get());
  ipcMain.handle('settings:update', async (_event, patch) => {
    const before = settings.get();
    const after = settings.update(patch);

    if (before.dataMode !== after.dataMode) {
      snapshot = null;
      createService(after.dataMode);
    }

    if (process.platform === 'win32' && before.launchAtStartup !== after.launchAtStartup) {
      app.setLoginItemSettings({ openAtLogin: Boolean(after.launchAtStartup), args: ['--hidden'] });
    }
    await syncOverlay();
    return after;
  });

  ipcMain.handle('overlay:status', () => overlayServer?.status() || { enabled: false, running: false, url: '', error: '' });
  ipcMain.handle('overlay:copy-url', () => {
    const status = overlayServer?.status();
    if (!status?.running || !status.url) throw new Error(status?.error || 'Enable the stream overlay first.');
    clipboard.writeText(status.url);
    return status;
  });
  ipcMain.handle('overlay:regenerate-token', async () => {
    settings.update({ streamOverlayToken: createOverlayToken() });
    await overlayServer?.stop();
    return syncOverlay();
  });
  ipcMain.handle('overlay:preview', async () => {
    if (overlayPreviewWindow && !overlayPreviewWindow.isDestroyed()) {
      overlayPreviewWindow.focus();
      return { ok: true };
    }
    await overlayServer.start();
    overlayServer.publish();
    const layout = settings.get().streamOverlayLayout || 'horizontal';
    const sizes = {
      rank: [680, 300], horizontal: [1420, 270], compact: [700, 390], vertical: [500, 800]
    };
    const [width, height] = sizes[layout] || sizes.horizontal;
    overlayPreviewWindow = new BrowserWindow({
      width, height, minWidth: 460, minHeight: 260, resizable: true,
      show: false, autoHideMenuBar: true, backgroundColor: '#10121c',
      title: 'BYAKUGAN — OBS Overlay Preview',
      parent: mainWindow || undefined,
      webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true }
    });
    const previewUrl = new URL(overlayServer.status().url);
    previewUrl.searchParams.set('preview', '1');
    await overlayPreviewWindow.loadURL(previewUrl.href);
    overlayPreviewWindow.show();
    overlayPreviewWindow.on('closed', () => {
      overlayPreviewWindow = null;
      if (!settings.get().streamOverlayEnabled) overlayServer.stop();
    });
    return { ok: true };
  });

  ipcMain.handle('update:status', () => updateService?.status() || { state: 'unavailable', message: 'Update service unavailable.' });
  ipcMain.handle('update:check', () => updateService?.check(true));
  ipcMain.handle('update:download-install', () => updateService?.downloadAndInstall());

  ipcMain.handle('window:action', (_event, action) => {
    if (!mainWindow) return;
    if (action === 'minimize') mainWindow.minimize();
    if (action === 'maximize') mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize();
    if (action === 'close') mainWindow.close();
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1480,
    height: 920,
    minWidth: 1080,
    minHeight: 700,
    show: false,
    backgroundColor: '#090b12',
    title: 'BYAKUGAN',
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#090b12', symbolColor: '#9ca1b7', height: 42 },
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true
    }
  });

  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  mainWindow.once('ready-to-show', () => {
    if (process.argv.includes('--hidden')) return;
    mainWindow.show();
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const parsed = new URL(url);
      if (parsed.protocol === 'https:') shell.openExternal(url);
    } catch {}
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (url !== mainWindow.webContents.getURL()) event.preventDefault();
  });

  mainWindow.on('closed', () => {
    overlayPreviewWindow?.close();
    overlayPreviewWindow = null;
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  settings = new SettingsStore(app.getPath('userData'));
  if (!settings.get().streamOverlayToken) settings.update({ streamOverlayToken: createOverlayToken() });
  overlayServer = new OverlayServer({
    getSnapshot: () => snapshot || {},
    getSettings: () => settings.get(),
    assetDirectory: path.join(__dirname, '..', 'overlay')
  });
  createService(settings.get().dataMode);
  createUpdateService();
  registerIpc();
  createWindow();
  syncOverlay();
  updateService.initialize();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  service?.disconnect?.();
  overlayServer?.stop();
  updateService?.stop();
  overlayPreviewWindow = null;
  if (process.platform !== 'darwin') app.quit();
});
