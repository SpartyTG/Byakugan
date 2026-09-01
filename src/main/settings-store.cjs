'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { UI_SCALE_OPTIONS, normalizeUiScale } = require('./ui-scale.cjs');

const DEFAULTS = Object.freeze({
  launchAtStartup: false,
  minimizeToTray: true,
  autoRefresh: true,
  refreshSeconds: 30,
  compactMatches: false,
  privacyMode: false,
  uiScale: 100,
  pcRole: 'gaming',
  gamingRelayMode: false,
  remoteViewerEnabled: false,
  remoteViewerToken: '',
  remoteSourceUrl: '',
  streamOverlayEnabled: false,
  streamOverlayLanEnabled: false,
  streamOverlayLayout: 'horizontal',
  streamOverlayShowIdentity: false,
  streamOverlayShowWl: true,
  streamOverlayShowKd: true,
  streamOverlayShowAgent: true,
  streamOverlayShowMap: true,
  streamOverlayShowRR: true,
  streamOverlayShowPeakRank: true,
  streamOverlayShowRrChange: true,
  streamOverlayAnimatedRrBeam: true,
  streamOverlayBackgroundOpacity: 70,
  streamOverlayToken: ''
});

class SettingsStore {
  constructor(directory) {
    this.file = path.join(directory, 'settings.json');
    this.data = { ...DEFAULTS };
    this.load();
  }

  load() {
    try {
      const parsed = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      if (typeof parsed.streamOverlayShowAgentMap === 'boolean') {
        if (parsed.streamOverlayShowAgent === undefined) parsed.streamOverlayShowAgent = parsed.streamOverlayShowAgentMap;
        if (parsed.streamOverlayShowMap === undefined) parsed.streamOverlayShowMap = parsed.streamOverlayShowAgentMap;
      }
      delete parsed.streamOverlayShowAgentMap;
      delete parsed.dataMode;
      parsed.uiScale = normalizeUiScale(parsed.uiScale);
      this.data = { ...DEFAULTS, ...parsed };
    } catch {}
  }

  get() { return { ...this.data }; }

  update(patch) {
    const allowed = Object.keys(DEFAULTS);
    for (const [key, value] of Object.entries(patch || {})) {
      if (!allowed.includes(key)) continue;
      if (typeof DEFAULTS[key] === 'boolean' && typeof value !== 'boolean') continue;
      if (typeof DEFAULTS[key] === 'number') {
        if (!Number.isFinite(value)) continue;
        if (key === 'uiScale') {
          if (!UI_SCALE_OPTIONS.includes(value)) continue;
        } else if (key === 'streamOverlayBackgroundOpacity') {
          if (value < 0 || value > 100) continue;
        } else if (value < 1) continue;
      }
      if (key === 'streamOverlayLayout' && !['rank', 'reactive', 'horizontal', 'compact', 'vertical'].includes(value)) continue;
      if (key === 'pcRole' && !['gaming', 'viewer'].includes(value)) continue;
      if (['streamOverlayToken', 'remoteViewerToken'].includes(key) && !/^[a-f0-9]{48}$/.test(value)) continue;
      if (key === 'remoteSourceUrl') {
        if (typeof value !== 'string' || value.length > 300) continue;
        if (value && !/^http:\/\/(?:10\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.|100\.(?:6[4-9]|[789]\d|1[01]\d|12[0-7])\.)/.test(value)) continue;
      }
      this.data[key] = value;
    }
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const temporary = `${this.file}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify(this.data, null, 2), 'utf8');
    fs.renameSync(temporary, this.file);
    return this.get();
  }
}

module.exports = { SettingsStore, DEFAULTS };
