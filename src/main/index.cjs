'use strict';

const path = require('node:path');
const fs = require('node:fs');
const { app, BrowserWindow, clipboard, dialog, ipcMain, Menu, nativeImage, powerSaveBlocker, shell, Tray } = require('electron');
const appMetadata = require('../../package.json');
const { SettingsStore } = require('./settings-store.cjs');
const { SenseiStore } = require('./sensei-store.cjs');
const { SenseiBrainStore } = require('./sensei-brain/store.cjs');
const { applySenseiBrain, planSenseiBrain, applySenseiVod } = require('./sensei-brain/hook.cjs');
const { LOOPBACK_HOST, OverlayServer, createOverlayToken, findLanHost } = require('./services/overlay-server.cjs');
const { RemoteViewerClient } = require('./services/remote-viewer-client.cjs');
const { RiotClientService } = require('./services/riot-client.cjs');
const { UpdateService } = require('./services/update-service.cjs');
const { SenseiService, FULL_VOD_ANALYSIS_VERSION, ADAPTIVE_VOD_ANALYSIS_VERSION, detectFfmpeg, detectFfprobe } = require('./services/sensei-service.cjs');
const { uiScaleFactor } = require('./ui-scale.cjs');

app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) app.quit();

let mainWindow = null;
let settings = null;
let senseiStore = null;
let senseiBrainStore = null;
let senseiService = null;
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
const senseiVodJobs = new Map();

function senseiAccountId() {
  const profile = snapshot?.profile || {};
  return `${profile.gameName || 'local'}#${profile.tagLine || 'player'}`.slice(0, 160);
}

function completedMatch(matchId) {
  const match = (snapshot?.matches || []).find((row) => String(row?.id || '') === String(matchId || ''));
  return match && ['VICTORY', 'DEFEAT', 'DRAW'].includes(match.result) ? match : null;
}

function senseiEntry(matchId) {
  return senseiStore?.get(senseiAccountId(), matchId) || null;
}

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

  ipcMain.handle('sensei:status', async () => {
    const current = settings.get();
    const health = await senseiService.health();
    const ffmpeg = detectFfmpeg();
    const ffprobe = detectFfprobe(ffmpeg);
    const [textModel, visionModel] = health.connected
      ? await Promise.all([senseiService.modelInfo(current.senseiModel), senseiService.modelInfo(current.senseiVodModel)])
      : [{ name: current.senseiModel, installed: false, capabilities: [], visionCapable: false }, { name: current.senseiVodModel, installed: false, capabilities: [], visionCapable: false }];
    let freeStorage = 0;
    try {
      const storage = fs.statfsSync(app.getPath('userData'));
      freeStorage = Number(storage.bavail) * Number(storage.bsize);
    } catch {}
    const storageReady = freeStorage >= 512 * 1024 * 1024;
    const vodMissing = [
      ...(!health.connected ? ['Ollama is not running'] : []),
      ...(!current.senseiVodModel ? ['no Vision model is selected'] : visionModel.installed ? [] : ['the selected Vision model is not installed']),
      ...(visionModel.installed && !visionModel.visionCapable ? ['the selected model does not advertise vision support'] : []),
      ...(!ffmpeg ? ['FFmpeg was not detected'] : []),
      ...(!ffprobe ? ['FFprobe was not detected'] : []),
      ...(!storageReady ? ['less than 512 MB of free storage is available'] : [])
    ];
    return {
      ...health, ffmpegAvailable: Boolean(ffmpeg), ffprobeAvailable: Boolean(ffprobe), freeStorage, storageReady,
      textModel, visionModel, vodReady: vodMissing.length === 0, vodMissing,
      enabled: current.senseiEnabled, tier: current.senseiTier, vodEnabled: current.senseiVodEnabled
    };
  });
  ipcMain.handle('sensei:get', (_event, matchId) => senseiEntry(String(matchId || '')));
  ipcMain.handle('sensei:run', async (_event, request = {}) => {
    const current = settings.get();
    if (!current.senseiEnabled) throw new Error('Enable Sensei Vision in Settings first.');
    const matchId = String(request.matchId || '');
    const match = completedMatch(matchId);
    if (!match) throw new Error('Sensei Vision can only run on a completed match.');
    const existing = senseiEntry(matchId);
    if (existing?.status === 'ready' && request.regenerate !== true) return existing;
    const tier = current.senseiTier === 'sensei' ? 'sensei' : 'lite';
    senseiStore.save(senseiAccountId(), matchId, { status: 'analyzing', tier, error: '' });
    try {
              const plan = planSenseiBrain({
      store: senseiBrainStore,
      accountId: senseiAccountId(),
      match,
      rankName: match.rankName
    });
       const plannedMission = plan.curriculum && plan.curriculum.primaryMission ? plan.curriculum.primaryMission : null;
    const missionPrompt = plannedMission ? [
      'PRIMARY MISSION (already chosen; do not replace it):',
      JSON.stringify({
        title: plannedMission.title,
        why: plannedMission.why,
        drillName: plannedMission.drillName,
        drillSetup: plannedMission.drillSetup,
        successMetric: plannedMission.successMetric
      }),
      'focusRule must be 24 words or fewer and must restate this mission title.',
      'The first drill must be this mission drill. The other two drills must support the same mission.'
    ].join('\n') : '';
    const result = await senseiService.analyze({ match, matches: snapshot?.matches || [], tier, model: current.senseiModel, missionPrompt });
    const brain = applySenseiBrain({
      store: senseiBrainStore,
      accountId: senseiAccountId(),
      match,
      report: result.report,
      rankName: match.rankName
    });
        const notice = [result.notice || '', brain.notice || ''].filter(Boolean).join(' ');
    const mission = brain.curriculum && brain.curriculum.primaryMission ? brain.curriculum.primaryMission : null;
    return senseiStore.save(senseiAccountId(), matchId, {
      status: 'ready',
      tier: result.tier || tier,
      model: result.model,
      notice,
      report: result.report,
      error: '',
      chat: request.regenerate ? [] : existing?.chat || [],
      brain: mission ? {
        title: mission.title,
        why: mission.why,
        drillName: mission.drillName,
        drillSetup: mission.drillSetup,
        successMetric: mission.successMetric,
        keptOpenMission: Boolean(brain.curriculum.keptOpenMission)
      } : null
    });
    } catch (error) {
      senseiStore.save(senseiAccountId(), matchId, { status: 'failed', tier, error: error.message || 'Sensei analysis failed.' });
      throw error;
    }
  });
  ipcMain.handle('sensei:ask', async (_event, request = {}) => {
    const matchId = String(request.matchId || '');
    const match = completedMatch(matchId);
    const existing = senseiEntry(matchId);
    if (!match || existing?.status !== 'ready' || !existing.report) throw new Error('Run Sensei Vision on this match first.');
      const answer = await senseiService.ask({ question: request.question, report: existing.report, match, model: settings.get().senseiModel, tier: existing.tier, mission: existing.brain || null });
    const chat = [...(existing.chat || []), { role: 'user', text: String(request.question || '').trim(), createdAt: Date.now() }, { role: 'assistant', text: answer, createdAt: Date.now() }];
    return senseiStore.save(senseiAccountId(), matchId, { chat });
  });

  ipcMain.handle('sensei:mission-action', async (_event, request = {}) => {
    const matchId = String(request.matchId || '');
    const action = String(request.action || '');
    const existing = senseiEntry(matchId);
    if (!existing?.brain?.title) throw new Error('Run Sensei Vision on this match first.');
    if (action === 'keep') return existing;
    const reason = action === 'done' ? 'resolved_by_user' : action === 'wrong' ? 'wrong' : '';
    if (!reason) throw new Error('Choose Keep, Wrong, or Done.');
    if (senseiBrainStore) senseiBrainStore.closeMission(senseiAccountId(), reason);
    return senseiStore.save(senseiAccountId(), matchId, {
      brain: { ...existing.brain, status: reason, keptOpenMission: false }
    });
  });

  ipcMain.handle('sensei:vod-import', async (_event, matchIdValue) => {
    const current = settings.get();
    if (!current.senseiEnabled || !current.senseiVodEnabled) throw new Error('Enable the optional VOD Vision add-on in Settings first.');
    const matchId = String(matchIdValue || '');
    if (!completedMatch(matchId)) throw new Error('Select a completed match before importing a VOD.');
    const selection = await dialog.showOpenDialog(mainWindow || undefined, {
      title: 'Select the clean gameplay recording for this match', properties: ['openFile'],
      filters: [{ name: 'Gameplay recordings', extensions: ['mp4', 'mkv', 'mov', 'webm'] }]
    });
    if (selection.canceled || !selection.filePaths[0]) return { canceled: true };
    const source = path.resolve(selection.filePaths[0]);
    const extension = path.extname(source).toLowerCase();
    if (!['.mp4', '.mkv', '.mov', '.webm'].includes(extension)) throw new Error('Choose an MP4, MKV, MOV, or WebM recording.');
    const info = fs.statSync(source);
    if (!info.isFile() || info.size <= 0) throw new Error('The selected recording is empty or unavailable.');
    const existing = senseiEntry(matchId) || {};
    return senseiStore.save(senseiAccountId(), matchId, { vod: { path: source, name: path.basename(source), size: info.size, importedAt: Date.now(), analyzedAt: 0, deletedAt: 0, status: 'ready', error: '', report: null } });
  });
  ipcMain.handle('sensei:vod-analyze', async (event, matchIdValue) => {
    const current = settings.get();
    if (!current.senseiEnabled || !current.senseiVodEnabled) throw new Error('Enable the optional VOD Vision add-on in Settings first.');
    const matchId = String(matchIdValue || '');
    const match = completedMatch(matchId);
    const existing = senseiEntry(matchId);
    if (!match || !existing?.vod?.path || !fs.existsSync(existing.vod.path)) throw new Error('Import the gameplay recording for this match first.');
    if (!existing.report) throw new Error('Run the statistical Sensei report before adding VOD analysis.');
    const ffmpeg = detectFfmpeg();
    if (!ffmpeg) throw new Error('VOD Vision needs FFmpeg for local frame extraction. Install FFmpeg or set BYAKUGAN_FFMPEG_PATH, then restart BYAKUGAN.');
    if (!detectFfprobe(ffmpeg)) throw new Error('VOD Vision needs FFprobe. Install the complete FFmpeg package, fully quit BYAKUGAN, and reopen it.');
    if (!current.senseiVodModel) throw new Error('Choose an installed vision-capable Ollama model in Settings first.');
    const health = await senseiService.health();
    if (!health.connected) throw new Error('Ollama is not running. Start Ollama and retry.');
    const visionModel = await senseiService.modelInfo(current.senseiVodModel);
    if (!visionModel.installed) throw new Error(`The selected Vision model “${current.senseiVodModel}” is not installed in Ollama.`);
    if (!visionModel.visionCapable) throw new Error(`The selected model “${current.senseiVodModel}” does not advertise vision support. Choose a vision-capable model.`);
    const jobKey = `${senseiAccountId()}::${matchId}`;
    if (senseiVodJobs.has(jobKey)) throw new Error('VOD analysis is already running for this match.');
    const controller = new AbortController();
    senseiVodJobs.set(jobKey, controller);
    const analysisMode = current.senseiVodMode === 'exhaustive' ? 'exhaustive' : 'adaptive';
    const savedCheckpointMode = existing.vod.checkpoint?.mode || (Number(existing.vod.checkpoint?.version) === 2 ? 'exhaustive' : '');
    const expectedCheckpointVersion = analysisMode === 'adaptive' ? ADAPTIVE_VOD_ANALYSIS_VERSION : FULL_VOD_ANALYSIS_VERSION;
    const requestedCheckpoint = savedCheckpointMode === analysisMode && Number(existing.vod.checkpoint?.version) === expectedCheckpointVersion
      ? existing.vod.checkpoint
      : null;
    const checkpointElapsedMs = Math.max(0, Number(requestedCheckpoint?.elapsedMs) || 0);
    const legacyElapsedMs = checkpointElapsedMs ? 0 : Math.max(0,
      Number(requestedCheckpoint?.updatedAt || 0) - Number(requestedCheckpoint?.startedAt || 0));
    const analysisStartedAt = Date.now() - (checkpointElapsedMs || legacyElapsedMs);
    let powerBlockerId = null;
    try { powerBlockerId = powerSaveBlocker.start('prevent-app-suspension'); } catch {}
    const progress = (payload) => {
      if (!event.sender.isDestroyed()) event.sender.send('sensei:vod-progress', { matchId, at: Date.now(), analysisStartedAt, ...payload });
    };
    let vodState = { ...existing.vod, checkpoint: requestedCheckpoint, analysisStartedAt, status: 'analyzing', error: '' };
    senseiStore.save(senseiAccountId(), matchId, { vod: vodState });
    let temporary = '';
    try {
      temporary = fs.mkdtempSync(path.join(app.getPath('temp'), 'byakugan-sensei-'));
      const resumedSegments = Number(requestedCheckpoint?.completedSegments) || 0;
      const expectedSegments = Number(requestedCheckpoint?.totalSegments) || 0;
      progress({ phase: 'preparing', current: resumedSegments, total: expectedSegments, mode: analysisMode, message: resumedSegments ? `Preparing to resume after ${analysisMode === 'adaptive' ? 'review window' : 'segment'} ${resumedSegments}` : `Preparing ${analysisMode} full-match analysis` });
      progress({ phase: 'loading-model', current: resumedSegments, total: expectedSegments, mode: analysisMode, message: `Loading ${current.senseiVodModel}` });
      const repairModel = health.models.some((entry) => String(entry.name).toLowerCase() === String(current.senseiModel || '').toLowerCase())
        ? current.senseiModel
        : current.senseiVodModel;
      const vodReport = await senseiService.analyzeFullVod({
        match, statisticalReport: existing.report, source: existing.vod.path, ffmpeg, outputDirectory: temporary,
        checkpoint: requestedCheckpoint, model: current.senseiVodModel, repairModel, analysisMode, signal: controller.signal, onProgress: progress,
        onCheckpoint: (checkpoint) => {
          vodState = { ...vodState, checkpoint, status: 'analyzing', error: '' };
          senseiStore.save(senseiAccountId(), matchId, { vod: vodState });
        }
      });
      const totalSegments = Number(vodReport.coverage?.totalSegments) || 0;
      progress({ phase: 'saving', current: totalSegments, total: totalSegments, mode: analysisMode, message: 'Saving full-match report' });
      vodState = { ...vodState, checkpoint: null, status: 'analyzed', analyzedAt: Date.now(), report: vodReport, error: '' };
      const vodBrain = applySenseiVod({
        store: senseiBrainStore,
        accountId: senseiAccountId(),
        match,
        report: existing.report,
        vodReport,
        rankName: match.rankName
      });
      const vodMission = vodBrain.curriculum && vodBrain.curriculum.primaryMission ? vodBrain.curriculum.primaryMission : null;
      const saved = senseiStore.save(senseiAccountId(), matchId, {
        vod: vodState,
        brain: vodMission ? {
          title: vodMission.title,
          why: vodMission.why,
          drillName: vodMission.drillName,
          drillSetup: vodMission.drillSetup,
          successMetric: vodMission.successMetric,
          keptOpenMission: Boolean(vodBrain.curriculum.keptOpenMission),
          status: existing.brain && existing.brain.status ? existing.brain.status : 'pending'
        } : existing.brain || null
      });
      progress({ phase: 'complete', current: totalSegments, total: totalSegments, mode: analysisMode, message: 'Full-match analysis complete' });
      return saved;
    } catch (error) {
      const canceled = error?.code === 'SENSEI_CANCELED' || controller.signal.aborted;
      const message = canceled ? 'Full-match analysis paused safely. Resume it later from the saved checkpoint.' : error.message || 'VOD analysis failed.';
      const latestVod = senseiEntry(matchId)?.vod || vodState;
      const checkpoint = latestVod.checkpoint
        ? { ...latestVod.checkpoint, elapsedMs: Math.max(Number(latestVod.checkpoint.elapsedMs) || 0, Date.now() - analysisStartedAt), updatedAt: Date.now() }
        : null;
      senseiStore.save(senseiAccountId(), matchId, { vod: { ...latestVod, checkpoint, status: canceled ? 'canceled' : 'failed', error: message } });
      progress({ phase: canceled ? 'canceled' : 'failed', current: 0, total: 0, mode: analysisMode, message });
      throw error;
    } finally {
      senseiVodJobs.delete(jobKey);
      if (Number.isInteger(powerBlockerId) && powerSaveBlocker.isStarted(powerBlockerId)) powerSaveBlocker.stop(powerBlockerId);
      if (temporary) try { fs.rmSync(temporary, { recursive: true, force: true }); } catch {}
    }
  });
  ipcMain.handle('sensei:vod-cancel', (_event, matchIdValue) => {
    const matchId = String(matchIdValue || '');
    const controller = senseiVodJobs.get(`${senseiAccountId()}::${matchId}`);
    if (!controller) return { ok: false, message: 'No VOD analysis is running for this match.' };
    controller.abort();
    return { ok: true };
  });
  ipcMain.handle('sensei:vod-delete', async (_event, request = {}) => {
    const matchId = String(request.matchId || '');
    const existing = senseiEntry(matchId);
    const source = existing?.vod?.path;
    if (!source || request.confirmed !== true) throw new Error('VOD deletion was not confirmed.');
    if (fs.existsSync(source)) await shell.trashItem(source);
    return senseiStore.save(senseiAccountId(), matchId, { vod: { ...existing.vod, path: '', status: 'deleted', deletedAt: Date.now(), error: '' } });
  });

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
  ipcMain.handle('overlay:preview', async (_event, options = {}) => {
    const animationPreview = options?.animation === true;
    await overlayServer.start();
    overlayServer.publish();
    const overlaySettings = settings.get();
    const layout = overlaySettings.streamOverlayLayout || 'horizontal';
    const customCanvas = overlaySettings.streamOverlayCustom || { width: 960, height: 360, inGameWidth: 960, inGameHeight: 360, postMatchWidth: 960, postMatchHeight: 360 };
    const reactiveLayout = layout === 'reactive' || (layout === 'custom' && Boolean(customCanvas.reactive));
    if (animationPreview && !reactiveLayout) throw new Error('Choose Reactive Vision Dock or enable Reactive Vision Mode in the Custom Overlay Builder first.');
    if (animationPreview && overlaySettings.streamOverlaySmoothTransitions === false) throw new Error('Turn on BYAKUGAN Shift transitions before starting the animation preview.');
    const customPreviewWidth = customCanvas.reactive
      ? Math.max(Number(customCanvas.width) || 960, Number(customCanvas.inGameWidth) || 960, Number(customCanvas.postMatchWidth) || 960)
      : Number(customCanvas.width) || 960;
    const customPreviewHeight = customCanvas.reactive
      ? Math.max(Number(customCanvas.height) || 360, Number(customCanvas.inGameHeight) || 360, Number(customCanvas.postMatchHeight) || 360)
      : Number(customCanvas.height) || 360;
    const sizes = {
      rank: [590, 270], reactive: animationPreview ? [620, 300] : [620, overlaySettings.streamOverlayPostMatchRecap === false ? 490 : 700],
      custom: [Math.min(1400, Math.max(520, customPreviewWidth + 80)), Math.min(900, Math.max(300, customPreviewHeight + 100))],
      horizontal: [1420, 270], compact: [700, 390], vertical: [500, 800]
    };
    const [width, height] = sizes[layout] || sizes.horizontal;
    const previewUrl = new URL(overlayServer.status().url);
    previewUrl.searchParams.set('preview', '1');
    if (animationPreview) previewUrl.searchParams.set('animation', '1');
    if (overlayPreviewWindow && !overlayPreviewWindow.isDestroyed()) {
      overlayPreviewWindow.setTitle(animationPreview ? 'BYAKUGAN — Animation Preview' : 'BYAKUGAN — OBS Overlay Preview');
      overlayPreviewWindow.setSize(width, height, true);
      await overlayPreviewWindow.loadURL(previewUrl.href);
      overlayPreviewWindow.show();
      overlayPreviewWindow.focus();
      return { ok: true, animation: animationPreview };
    }
    overlayPreviewWindow = new BrowserWindow({
      width, height, minWidth: 460, minHeight: 260, resizable: true,
      show: false, autoHideMenuBar: true, backgroundColor: '#10121c',
      title: animationPreview ? 'BYAKUGAN — Animation Preview' : 'BYAKUGAN — OBS Overlay Preview',
      parent: mainWindow || undefined,
      webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true }
    });
    await overlayPreviewWindow.loadURL(previewUrl.href);
    overlayPreviewWindow.show();
    overlayPreviewWindow.on('closed', () => {
      overlayPreviewWindow = null;
      const current = settings.get();
      if (!current.streamOverlayEnabled && !(current.pcRole === 'gaming' && current.remoteViewerEnabled)) overlayServer.stop();
    });
    return { ok: true, animation: animationPreview };
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

if (hasSingleInstanceLock) {
  app.on('second-instance', () => {
    if (!app.isReady()) return;
    const window = openMainWindow();
    if (window?.isMinimized()) window.restore();
    window?.show();
    window?.focus();
  });
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
  if (!hasSingleInstanceLock) return;
  settings = new SettingsStore(app.getPath('userData'));
  senseiStore = new SenseiStore(app.getPath('userData'));
  senseiBrainStore = new SenseiBrainStore(app.getPath('userData'));
  senseiStore.recoverInterruptedVodAnalyses();
  senseiService = new SenseiService();
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
  for (const controller of senseiVodJobs.values()) controller.abort();
  senseiVodJobs.clear();
  clearPostMatchRefresh();
  clearRelayRefresh();
  service?.disconnect?.();
  updateService?.stop();
});
