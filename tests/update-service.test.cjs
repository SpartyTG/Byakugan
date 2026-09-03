'use strict';

const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const test = require('node:test');
const project = require('../package.json');
const { UpdateService } = require('../src/main/services/update-service.cjs');

class FakeUpdater extends EventEmitter {
  constructor() {
    super();
    this.checked = 0;
    this.downloaded = 0;
    this.installed = 0;
    this.installArguments = [];
  }
  async checkForUpdates() { this.checked += 1; }
  async downloadUpdate() { this.downloaded += 1; }
  quitAndInstall(...arguments_) {
    this.installed += 1;
    this.installArguments.push(arguments_);
  }
}

const packagedApp = { isPackaged: true, getVersion: () => '0.7.0-beta.1' };

test('Windows release uses a one-click per-user installer for the legacy updater path', () => {
  assert.equal(project.build.nsis.oneClick, true);
  assert.equal(project.build.nsis.perMachine, false);
});

test('installed beta checks without downloading automatically', async () => {
  const updater = new FakeUpdater();
  const service = new UpdateService({ app: packagedApp, updater, feedConfigured: true });
  service.initialize({ schedule: false });
  await service.check();
  assert.equal(updater.checked, 1);
  assert.equal(updater.downloaded, 0);
  assert.equal(updater.autoDownload, false);
  assert.equal(updater.allowPrerelease, true);
});

test('update availability is normalized for the renderer', () => {
  const updater = new FakeUpdater();
  const service = new UpdateService({ app: packagedApp, updater, feedConfigured: true });
  service.initialize({ schedule: false });
  updater.emit('update-available', {
    version: '0.7.0-beta.2', releaseName: 'Beta 2',
    releaseNotes: [{ note: 'Fixes live ranks.' }, { note: 'Improves the overlay.' }]
  });
  assert.deepEqual(service.status(), {
    state: 'available', currentVersion: '0.7.0-beta.1', version: '0.7.0-beta.2',
    releaseName: 'Beta 2', releaseNotes: 'Fixes live ranks.\nImproves the overlay.',
    percent: 0, transferred: 0, total: 0, bytesPerSecond: 0, mandatory: false,
    message: 'BYAKUGAN 0.7.0-beta.2 is available.', checkedAt: service.status().checkedAt
  });
});

test('an update found during the startup check is mandatory', async () => {
  const updater = new FakeUpdater();
  const service = new UpdateService({ app: packagedApp, updater, feedConfigured: true });
  service.initialize({ schedule: false });
  await service.check(false, true);
  updater.emit('update-available', { version: '0.7.0-beta.2' });
  assert.equal(service.status().state, 'available');
  assert.equal(service.status().mandatory, true);
  assert.match(service.status().message, /required before continuing/);
});

test('confirmed updates download, install, and request an app restart', async () => {
  const updater = new FakeUpdater();
  const service = new UpdateService({ app: packagedApp, updater, feedConfigured: true, installDelayMs: 5 });
  service.initialize({ schedule: false });
  updater.emit('update-available', { version: '0.7.0-beta.2' });
  await service.downloadAndInstall();
  assert.equal(updater.downloaded, 1);
  updater.emit('download-progress', { percent: 52, transferred: 520, total: 1000, bytesPerSecond: 80 });
  assert.equal(service.status().state, 'downloading');
  assert.equal(service.status().percent, 52);
  updater.emit('update-downloaded', { version: '0.7.0-beta.2' });
  await new Promise((resolve) => setTimeout(resolve, 15));
  assert.equal(updater.installed, 1);
  assert.deepEqual(updater.installArguments, [[true, true]]);
  assert.equal(service.status().state, 'installing');
});

test('development and unconfigured builds do not contact an update feed', async () => {
  const updater = new FakeUpdater();
  const development = new UpdateService({ app: { isPackaged: false, getVersion: () => '0.7.0-beta.1' }, updater, feedConfigured: true });
  assert.equal(development.initialize({ schedule: false }).state, 'unavailable');
  await development.check();
  assert.equal(updater.checked, 0);

  const unconfigured = new UpdateService({ app: packagedApp, updater, feedConfigured: false });
  assert.equal(unconfigured.initialize({ schedule: false }).state, 'unavailable');
  await unconfigured.check();
  assert.equal(updater.checked, 0);
});
