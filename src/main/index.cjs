'use strict';

const path = require('node:path');
const fs = require('node:fs');
const { app, BrowserWindow, clipboard, ipcMain, Menu, nativeImage, shell, Tray } = require('electron');
const appMetadata = require('../../package.json');
const { SettingsStore } = require('./settings-store.cjs');
const { LOOPBACK_HOST, OverlayServer, createOverlayToken, findLanHost } = require('./services/overlay-server.cjs');
const { RemoteViewerClient } = require('./services/remote-viewer-client.cjs');
const { RiotClientService } = require('./services/riot-client.cjs');
const { UpdateService } = require('./services/update-service.cjs');
const { uiScaleFactor } = require('./ui-scale.cjs');

let mainWindow = null;
let settings = null;
let service = null;
let snapshot = null;
let overlayServer = null;
let updateService = null;
let overlayPreviewWindow = null;
let postMatchRefreshTimer = null;
let relayRefreshTimer = null;
let relayRefreshBusy = false;
let relayError = '';
let tray = null;
let trayBusy = false;
let quitting = false;
let lastTrayUpdateNotice = '';

function relayModeEnabled() {
  const current = settings?.get?.() || {};
  return current.pcRole === 'gaming' && current.gamingRelayMode === true;
}

function requestRestart() {
  quitting = true;
  app.relaunch();
  app.exit(0);
}

function trayNotice(title, body) {
  if (!tray || tray.isDestroyed()) return;
  try { tray.displayBalloon({ iconType: 'info', title, content: body }); } catch {}
}

function connectionSummary() {
  if (relayError) return relayError;
  const status = snapshot?.connection?.status;
  if (status === 'connected') return 'Riot connected • full-speed collection active';
  if (status === 'disconnected') return 'Riot disconnected';
  return snapshot ? 'Riot data available' : 'Connecting to Riot…';
}

function rebuildTrayMenu() {
  if (!tray || tray.isDestroyed()) return;
  const remote = overlayServer?.status?.() || {};
  const update = updateService?.status?.() || {};
  const updateBusy = ['checking', 'downloading', 'downloaded', 'installing'].includes(update.state);
  const updateAvailable = update.state === 'available';
  const remoteReady = Boolean(remote.running && remote.remoteEnabled && remote.remoteUrl);
  const menu = Menu.buildFromTemplate([
    { label: 'BYAKUGAN Gaming PC Relay', enabled: false },
    { label: connectionSummary(), enabled: false },
    { label: remoteReady ? `Streaming link ready • ${remote.host}:${remote.port}` : 'Streaming link is starting…', enabled: false },
    { type: 'separator' },
    { label: 'Open full BYAKUGAN', click: () => openMainWindow() },
    {
      label: 'Refresh Data', enabled: !trayBusy,
      click: () => runTrayTask('Data refreshed', async () => { await refreshDataSource(); })
    },
    {
      label: 'Reconnect Riot', enabled: !trayBusy,
      click: () => runTrayTask('Riot reconnected', async () => { await reconnectDataSource(); })
    },
    {
      label: 'Copy Streaming PC URL', enabled: remoteReady,
      click: () => {
        clipboard.writeText(remote.remoteUrl);
        trayNotice('Connection URL copied', 'Paste it into BYAKUGAN on the streaming PC.');
      }
    },
    { type: 'separator' },
    {
      label: updateAvailable ? `Update available • ${update.version}` : updateBusy ? (update.message || 'Update in progress…') : 'Check for updates',
      enabled: !updateBusy,
      click: () => updateAvailable
        ? openMainWindow()
        : runTrayTask('Update check complete', async () => {
          const status = await updateService?.check(true, false);
          if (status?.state === 'available') openMainWindow();
        })
    },
    { type: 'separator' },
    {
      label: 'Disable Relay Mode and restart',
      click: () => {
        settings.update({ gamingRelayMode: false });
        requestRestart();
      }
    },
    { label: 'Quit BYAKUGAN', click: () => { quitting = true; app.quit(); } }
  ]);
  tray.setContextMenu(menu);
  tray.setToolTip(`BYAKUGAN Relay — ${connectionSummary()}`);
}

async function runTrayTask(successTitle, task) {
  if (trayBusy) return;
  trayBusy = true;
  rebuildTrayMenu();
  try {
    await task();
    relayError = '';
    trayNotice(successTitle, connectionSummary());
  } catch (error) {
    relayError = String(error?.message || 'The relay task failed.');
    trayNotice('BYAKUGAN Relay', relayError);
  } finally {
    trayBusy = false;
    rebuildTrayMenu();
  }
}

async function createTray() {
  if (tray && !tray.isDestroyed()) return tray;
  const svg = fs.readFileSync(path.join(__dirname, '..', '..', 'assets', 'app-icon.svg'), 'utf8');
  let icon = nativeImage.createFromDataURL(`data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`);
  if (icon.isEmpty()) icon = await app.getFileIcon(process.execPath, { size: 'small' });
  tray = new Tray(icon.resize({ width: 32, height: 32 }));
  tray.on('double-click', () => openMainWindow());
  rebuildTrayMenu();
  return tray;
}

function applyUiScale(value) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const factor = uiScaleFactor(value);
  mainWindow.webContents.setZoomFactor(factor);
  mainWindow.setTitleBarOverlay({ color: '#090b12', symbolColor: '#9ca1b7', height: Math.round(42 * factor) });
}

function clearPostMatchRefresh() {
  if (postMatchRefreshTimer) clearTimeout(postMatchRefreshTimer);
  postMatchRefreshTimer = null;
}

function clearRelayRefresh() {
  if (relayRefreshTimer) clearInterval(relayRefreshTimer);
  relayRefreshTimer = null;
}

function scheduleRelayRefresh() {
  clearRelayRefresh();
  const current = settings?.get?.() || {};
  if (!relayModeEnabled() || !current.autoRefresh) return;
  const seconds = Math.max(15, Number(current.refreshSeconds) || 30);
  relayRefreshTimer = setInterval(async () => {
    if (relayRefreshBusy) return;
    relayRefreshBusy = true;
    try {
      await refreshDataSource();
      relayError = '';
    } catch (error) {
      relayError = String(error?.message || 'Automatic relay refresh failed.');
    } finally {
      relayRefreshBusy = false;
      rebuildTrayMenu();
    }
  }, seconds * 1000);
  relayRefreshTimer.unref?.();
}

function snapshotHasMatch(matchId) {
  return Boolean(matchId
    && (snapshot?.matches || []).some((match) => match?.id === matchId)
    && (snapshot?.analytics?.session?.matchIds || []).includes(matchId));
}

function schedulePostMatchRefresh(matchId, attempt = 0) {
  const delays = [6_000, 12_000, 24_000];
  clearPostMatchRefresh();
  postMatchRefreshTimer = setTimeout(async () => {
    postMatchRefreshTimer = null;
    if (!(service instanceof RiotClientService)) return;
    try {
      snapshot = await service.refresh();
      overlayServer?.publish();
      mainWindow?.webContents.send('riot:snapshot', snapshot);
      if (!snapshotHasMatch(matchId) && attempt + 1 < delays.length) schedulePostMatchRefresh(matchId, attempt + 1);
    } catch (error) {
      mainWindow?.webContents.send('app:warning', `Post-match refresh: ${error.message}`);
      if (attempt + 1 < delays.length) schedulePostMatchRefresh(matchId, attempt + 1);
    }
  }, delays[attempt] || delays.at(-1));
  postMatchRefreshTimer.unref?.();
}

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
  updateService.on('status', (status) => {
    mainWindow?.webContents.send('update:status', status);
    rebuildTrayMenu();
    if (!relayModeEnabled() || status.state !== 'available') return;
    const noticeKey = `${status.version}:${status.mandatory}`;
    if (lastTrayUpdateNotice !== noticeKey) {
      lastTrayUpdateNotice = noticeKey;
      trayNotice(status.mandatory ? 'BYAKUGAN update required' : 'BYAKUGAN update available', status.message);
    }
    if (status.mandatory) openMainWindow();
  });
  return updateService;
}

async function syncOverlay() {
  if (!overlayServer) return { enabled: false, running: false, url: '', error: '' };
  const current = settings.get();
  const remoteHostEnabled = current.pcRole === 'gaming' && current.remoteViewerEnabled;
  if (!current.streamOverlayEnabled && !remoteHostEnabled && !overlayPreviewWindow) {
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

function wireService(nextService) {
  service = nextService;
  if (service.on) {
    service.on('live-state', (state) => {
      if (snapshot) snapshot.live = state;
      overlayServer?.publish();
      mainWindow?.webContents.send('riot:live-state', state);
      rebuildTrayMenu();
    });
    service.on('snapshot', (nextSnapshot) => {
      snapshot = nextSnapshot;
      overlayServer?.publish();
      mainWindow?.webContents.send('riot:snapshot', nextSnapshot);
      relayError = '';
      rebuildTrayMenu();
    });
    service.on('match-ended', ({ matchId } = {}) => schedulePostMatchRefresh(matchId));
    service.on('act-progress', (progress) => {
      if (snapshot?.profile) {
        snapshot.profile.actStatsLoading = progress.loading !== false;
        snapshot.profile.actStatsLoaded = progress.loaded || 0;
        snapshot.profile.actStatsTotal = progress.total || 0;
        if (progress.stats) {
          snapshot.profile.wins = progress.stats.wins;
          snapshot.profile.losses = progress.stats.losses;
          snapshot.profile.kd = progress.stats.kd;
          snapshot.profile.headshot = progress.stats.headshot;
          snapshot.profile.statsScope = progress.stats.scope;
        }
      }
      mainWindow?.webContents.send('riot:act-progress', progress);
    });
    service.on('warning', (message) => {
      mainWindow?.webContents.send('app:warning', message);
      relayError = String(message || 'Riot connector warning.');
      rebuildTrayMenu();
    });
  }
  return service;
}

function createService({ preserveSession = false } = {}) {
  clearPostMatchRefresh();
  const previousSession = preserveSession ? service?.session : null;
  service?.removeAllListeners?.();
  service?.disconnect?.();
  const nextService = new RiotClientService({ cacheDirectory: app.getPath('userData') });
  if (previousSession) nextService.session = previousSession;
  return wireService(nextService);
}

function createRemoteService() {
  service?.removeAllListeners?.();
  service?.disconnect?.();
  return wireService(new RemoteViewerClient({ sourceUrl: settings.get().remoteSourceUrl }));
}

function remoteMode() { return settings.get().pcRole === 'viewer'; }

async function connectDataSource() {
  if (remoteMode()) {
    if (!(service instanceof RemoteViewerClient)) createRemoteService();
  } else if (!(service instanceof RiotClientService)) createService();
  snapshot = await service.connect();
  overlayServer?.publish();
  return snapshot;
}

async function reconnectDataSource() {
  if (remoteMode()) createRemoteService();
  else createService({ preserveSession: true });
  snapshot = await service.connect();
  overlayServer?.publish();
  return snapshot;
}

async function refreshDataSource() {
  if (!service || (remoteMode() && !(service instanceof RemoteViewerClient))
    || (!remoteMode() && !(service instanceof RiotClientService))) return connectDataSource();
  snapshot = await service.refresh();
  overlayServer?.publish();
  return snapshot;
}

async function updateSessionDataSource(selection) {
  if (!service?.updateSession) throw new Error('Session recovery is unavailable for this data source.');
  snapshot = await service.updateSession(selection || {});
  overlayServer?.publish();
  mainWindow?.webContents.send('riot:snapshot', snapshot);
  rebuildTrayMenu();
  return snapshot;
}

function registerIpc() {
  ipcMain.handle('app:restart', () => {
    setTimeout(requestRestart, 100);
    return { ok: true };
  });

  ipcMain.handle('app:bootstrap', async () => {
    if (!snapshot) snapshot = await connectDataSource();
    return {
      snapshot,
      settings: settings.get(),
      overlay: overlayServer?.status(),
      update: updateService?.status(),
      version: app.getVersion()
    };
  });

  ipcMain.handle('riot:connect', connectDataSource);
  ipcMain.handle('riot:reconnect', reconnectDataSource);
  ipcMain.handle('riot:refresh', refreshDataSource);
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
  ipcMain.handle('session:update', (_event, selection) => updateSessionDataSource(selection));

  ipcMain.handle('settings:get', () => settings.get());
  ipcMain.handle('settings:update', async (_event, patch) => {
    const before = settings.get();
    const normalizedPatch = { ...(patch || {}) };
    if (normalizedPatch.pcRole === 'viewer') normalizedPatch.gamingRelayMode = false;
    const relayRequested = normalizedPatch.gamingRelayMode === undefined
      ? before.gamingRelayMode
      : normalizedPatch.gamingRelayMode;
    if (relayRequested && normalizedPatch.pcRole !== 'viewer') {
      normalizedPatch.pcRole = 'gaming';
      normalizedPatch.remoteViewerEnabled = true;
    }
    const after = settings.update(normalizedPatch);

    if (before.pcRole !== after.pcRole || before.remoteSourceUrl !== after.remoteSourceUrl) {
      service?.removeAllListeners?.();
      service?.disconnect?.();
      service = null;
      snapshot = null;
    }

    if (process.platform === 'win32' && before.launchAtStartup !== after.launchAtStartup) {
      app.setLoginItemSettings({ openAtLogin: Boolean(after.launchAtStartup), args: ['--hidden'] });
    }
    if (before.uiScale !== after.uiScale) applyUiScale(after.uiScale);
    if (before.autoRefresh !== after.autoRefresh || before.refreshSeconds !== after.refreshSeconds
      || before.gamingRelayMode !== after.gamingRelayMode) scheduleRelayRefresh();
    const overlay = await syncOverlay();
    if (before.streamOverlayLanEnabled !== after.streamOverlayLanEnabled
      && overlayPreviewWindow && !overlayPreviewWindow.isDestroyed() && overlay.url) {
      const previewUrl = new URL(overlay.url);
      previewUrl.searchParams.set('preview', '1');
      await overlayPreviewWindow.loadURL(previewUrl.href);
    }
    rebuildTrayMenu();
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
  ipcMain.handle('remote:status', () => overlayServer?.status() || { remoteEnabled: false, running: false, remoteUrl: '', error: '' });
  ipcMain.handle('remote:copy-url', () => {
    const status = overlayServer?.status();
    if (!status?.remoteEnabled || !status?.running || !status.remoteUrl) {
      throw new Error(status?.error || 'Enable Remote Viewer hosting on the gaming PC first.');
    }
    clipboard.writeText(status.remoteUrl);
    return status;
  });
  ipcMain.handle('overlay:preview', async () => {
    if (overlayPreviewWindow && !overlayPreviewWindow.isDestroyed()) {
      overlayPreviewWindow.focus();
      return { ok: true };
    }
    await overlayServer.start();
    overlayServer.publish();
    const overlaySettings = settings.get();
    const layout = overlaySettings.streamOverlayLayout || 'horizontal';
    const customCanvas = overlaySettings.streamOverlayCustom || { width: 960, height: 360 };
    const sizes = {
      rank: [590, 270], reactive: [590, 270],
      custom: [Math.min(1400, Math.max(520, Number(customCanvas.width) + 80)), Math.min(900, Math.max(300, Number(customCanvas.height) + 100))],
      horizontal: [1420, 270], compact: [700, 390], vertical: [500, 800]
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
      const current = settings.get();
      if (!current.streamOverlayEnabled && !(current.pcRole === 'gaming' && current.remoteViewerEnabled)) overlayServer.stop();
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

function createWindow({ showOnReady = !process.argv.includes('--hidden') } = {}) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (showOnReady) {
      mainWindow.show();
      mainWindow.focus();
    }
    return mainWindow;
  }
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

  applyUiScale(settings.get().uiScale);
  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  mainWindow.once('ready-to-show', () => {
    if (!showOnReady) return;
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

  mainWindow.on('close', (event) => {
    const mandatoryUpdate = updateService?.status?.().state === 'available'
      && updateService.status().mandatory === true;
    if (!quitting && relayModeEnabled() && mandatoryUpdate) {
      event.preventDefault();
      mainWindow.show();
      mainWindow.focus();
    }
  });

  mainWindow.on('closed', () => {
    overlayPreviewWindow?.close();
    overlayPreviewWindow = null;
    mainWindow = null;
    rebuildTrayMenu();
  });
  return mainWindow;
}

function openMainWindow() {
  return createWindow({ showOnReady: true });
}

async function startRelayMode() {
  await createTray();
  await syncOverlay();
  try {
    await connectDataSource();
    relayError = '';
    rebuildTrayMenu();
    trayNotice('BYAKUGAN Relay is active', 'Full-speed Riot collection is running for your streaming PC.');
  } catch (error) {
    relayError = String(error?.message || 'Could not connect to Riot.');
    rebuildTrayMenu();
    trayNotice('BYAKUGAN Relay needs attention', relayError);
  }
  scheduleRelayRefresh();
}

app.whenReady().then(async () => {
  settings = new SettingsStore(app.getPath('userData'));
  if (settings.get().gamingRelayMode && (settings.get().pcRole !== 'gaming' || !settings.get().remoteViewerEnabled)) {
    settings.update({ pcRole: 'gaming', remoteViewerEnabled: true });
  }
  if (!settings.get().streamOverlayToken) settings.update({ streamOverlayToken: createOverlayToken() });
  if (!settings.get().remoteViewerToken) settings.update({ remoteViewerToken: createOverlayToken() });
  overlayServer = new OverlayServer({
    getSnapshot: () => snapshot || {},
    getSettings: () => {
      const current = settings.get();
      return { ...current, remoteViewerEnabled: current.pcRole === 'gaming' && current.remoteViewerEnabled };
    },
    getHost: () => {
      const current = settings.get();
      return current.streamOverlayLanEnabled || (current.pcRole === 'gaming' && current.remoteViewerEnabled)
        ? findLanHost()
        : LOOPBACK_HOST;
    },
    inspectPlayer: (playerId) => service?.inspectPlayer?.(playerId),
    updateSession: (selection) => updateSessionDataSource(selection),
    assetDirectory: path.join(__dirname, '..', 'overlay')
  });
  if (remoteMode()) createRemoteService();
  else createService();
  createUpdateService();
  registerIpc();
  if (relayModeEnabled()) await startRelayMode();
  else {
    createWindow();
    await syncOverlay();
  }
  updateService.initialize();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) openMainWindow();
  });
});

app.on('window-all-closed', () => {
  if (relayModeEnabled() && !quitting) {
    overlayPreviewWindow = null;
    rebuildTrayMenu();
    return;
  }
  clearPostMatchRefresh();
  clearRelayRefresh();
  service?.disconnect?.();
  overlayServer?.stop();
  updateService?.stop();
  overlayPreviewWindow = null;
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  quitting = true;
  clearPostMatchRefresh();
  clearRelayRefresh();
  service?.disconnect?.();
  updateService?.stop();
});
