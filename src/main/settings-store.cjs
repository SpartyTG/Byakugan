'use strict';

const fs = require('node:fs');
const path = require('node:path');

const DEFAULTS = Object.freeze({
  launchAtStartup: false,
  minimizeToTray: true,
  autoRefresh: true,
  refreshSeconds: 30,
  compactMatches: false,
  privacyMode: false,
  streamOverlayEnabled: false,
  streamOverlayLanEnabled: false,
  streamOverlayLayout: 'horizontal',
  streamOverlayShowIdentity: false,
  streamOverlayShowWl: true,
  streamOverlayShowKd: true,
  streamOverlayShowAgent: true,
  streamOverlayShowMap: true,
  streamOverlayShowRR: true,
  streamOverlayShowRrChange: true,
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
      this.data = { ...DEFAULTS, ...parsed };
    } catch {}
  }

  get() { return { ...this.data }; }

  update(patch) {
    const allowed = Object.keys(DEFAULTS);
    for (const [key, value] of Object.entries(patch || {})) {
      if (!allowed.includes(key)) continue;
      if (typeof DEFAULTS[key] === 'boolean' && typeof value !== 'boolean') continue;
      if (typeof DEFAULTS[key] === 'number' && (!Number.isFinite(value) || value < 1)) continue;
      if (key === 'streamOverlayLayout' && !['rank', 'horizontal', 'compact', 'vertical'].includes(value)) continue;
      if (key === 'streamOverlayToken' && !/^[a-f0-9]{48}$/.test(value)) continue;
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
