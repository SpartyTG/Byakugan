'use strict';

const { EventEmitter } = require('node:events');

const CHECK_DELAY_MS = 2_500;
const CHECK_INTERVAL_MS = 4 * 60 * 60_000;

function cleanMessage(value, fallback = '') {
  return String(value || fallback).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 300);
}

function releaseNotes(value) {
  if (Array.isArray(value)) return value.map((item) => cleanMessage(item?.note || item)).filter(Boolean).join('\n');
  return cleanMessage(value);
}

class UpdateService extends EventEmitter {
  constructor({ app, updater, feedConfigured = false, checkDelayMs = CHECK_DELAY_MS, checkIntervalMs = CHECK_INTERVAL_MS, installDelayMs = 1_200 } = {}) {
    super();
    this.app = app;
    this.updater = updater;
    this.feedConfigured = Boolean(feedConfigured);
    this.checkDelayMs = checkDelayMs;
    this.checkIntervalMs = checkIntervalMs;
    this.installDelayMs = installDelayMs;
    this.checkTimer = null;
    this.intervalTimer = null;
    this.installTimer = null;
    this.installApproved = false;
    this.pendingMandatory = false;
    this.started = false;
    this.data = {
      state: 'idle',
      currentVersion: app?.getVersion?.() || '0.0.0',
      version: '',
      releaseName: '',
      releaseNotes: '',
      percent: 0,
      transferred: 0,
      total: 0,
      bytesPerSecond: 0,
      mandatory: false,
      message: '',
      checkedAt: ''
    };
  }

  status() {
    return { ...this.data };
  }

  setState(state, patch = {}) {
    this.data = { ...this.data, ...patch, state };
    this.emit('status', this.status());
    return this.status();
  }

  initialize({ schedule = true } = {}) {
    if (this.started) return this.status();
    this.started = true;

    if (!this.app?.isPackaged) {
      return this.setState('unavailable', { message: 'Updates are available in installed builds.' });
    }
    if (!this.feedConfigured) {
      return this.setState('unavailable', { message: 'The beta update feed has not been connected yet.' });
    }
    if (!this.updater) {
      return this.setState('unavailable', { message: 'The update component is unavailable.' });
    }

    this.updater.autoDownload = false;
    this.updater.autoInstallOnAppQuit = false;
    this.updater.autoRunAppAfterInstall = true;
    this.updater.allowPrerelease = true;
    if ('autoInstallEvent' in this.updater) this.updater.autoInstallEvent = 'manual';

    this.updater.on('checking-for-update', () => this.setState('checking', { message: 'Checking for a beta update…' }));
    this.updater.on('update-available', (info = {}) => {
      const mandatory = this.pendingMandatory;
      this.pendingMandatory = false;
      this.setState('available', {
        version: cleanMessage(info.version),
        releaseName: cleanMessage(info.releaseName || `BYAKUGAN ${info.version || ''}`),
        releaseNotes: releaseNotes(info.releaseNotes),
        percent: 0,
        mandatory,
        message: mandatory
          ? `BYAKUGAN ${cleanMessage(info.version, 'update')} is required before continuing.`
          : `BYAKUGAN ${cleanMessage(info.version, 'update')} is available.`,
        checkedAt: new Date().toISOString()
      });
    });
    this.updater.on('update-not-available', () => this.setState('up-to-date', {
      version: '', releaseName: '', releaseNotes: '', percent: 0,
      mandatory: false, message: 'BYAKUGAN is up to date.', checkedAt: new Date().toISOString()
    }));
    this.updater.on('download-progress', (progress = {}) => this.setState('downloading', {
      percent: Math.max(0, Math.min(100, Number(progress.percent) || 0)),
      transferred: Number(progress.transferred) || 0,
      total: Number(progress.total) || 0,
      bytesPerSecond: Number(progress.bytesPerSecond) || 0,
      message: 'Downloading the update…'
    }));
    this.updater.on('update-downloaded', (info = {}) => {
      this.setState('downloaded', {
        version: cleanMessage(info.version || this.data.version),
        percent: 100,
        message: 'Update downloaded. BYAKUGAN is restarting…'
      });
      if (this.installApproved) {
        this.installTimer = setTimeout(() => this.install(), this.installDelayMs);
        this.installTimer.unref?.();
      }
    });
    this.updater.on('error', (error) => this.setState('error', {
      message: cleanMessage(error?.message, 'The update could not be completed.')
    }));

    if (schedule) {
      this.checkTimer = setTimeout(() => this.check(false, true), this.checkDelayMs);
      this.checkTimer.unref?.();
      this.intervalTimer = setInterval(() => this.check(false, false), this.checkIntervalMs);
      this.intervalTimer.unref?.();
    }
    return this.status();
  }

  async check(manual = true, mandatory = false) {
    if (!this.app?.isPackaged || !this.feedConfigured || !this.updater) return this.status();
    if (['checking', 'downloading', 'downloaded', 'installing'].includes(this.data.state)) return this.status();
    try {
      this.pendingMandatory = Boolean(mandatory);
      if (manual) this.setState('checking', { message: 'Checking for a beta update…' });
      await this.updater.checkForUpdates();
    } catch (error) {
      this.pendingMandatory = false;
      this.setState('error', { message: cleanMessage(error?.message, 'Unable to check for updates.') });
    }
    return this.status();
  }

  async downloadAndInstall() {
    if (!['available', 'error'].includes(this.data.state) || !this.data.version) throw new Error('No update is ready to download.');
    this.installApproved = true;
    this.setState('downloading', { percent: 0, message: 'Downloading the update…' });
    try {
      await this.updater.downloadUpdate();
    } catch (error) {
      this.installApproved = false;
      this.setState('error', { message: cleanMessage(error?.message, 'The update download failed.') });
    }
    return this.status();
  }

  install() {
    if (!this.installApproved || !['downloaded', 'installing'].includes(this.data.state)) return this.status();
    this.setState('installing', { percent: 100, message: 'Applying update and restarting BYAKUGAN…' });
    this.updater.quitAndInstall(false, true);
    return this.status();
  }

  stop() {
    if (this.checkTimer) clearTimeout(this.checkTimer);
    if (this.intervalTimer) clearInterval(this.intervalTimer);
    if (this.installTimer) clearTimeout(this.installTimer);
    this.checkTimer = null;
    this.intervalTimer = null;
    this.installTimer = null;
  }
}

module.exports = { CHECK_DELAY_MS, CHECK_INTERVAL_MS, UpdateService, cleanMessage, releaseNotes };
