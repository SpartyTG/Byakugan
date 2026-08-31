'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const main = fs.readFileSync(path.join(__dirname, '..', 'src', 'main', 'index.cjs'), 'utf8');
const riot = fs.readFileSync(path.join(__dirname, '..', 'src', 'main', 'services', 'riot-client.cjs'), 'utf8');
const preload = fs.readFileSync(path.join(__dirname, '..', 'src', 'main', 'preload.cjs'), 'utf8');
const renderer = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'app.js'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'index.html'), 'utf8');

test('Gaming PC Relay Mode is toggleable and restarts into a tray-only host', () => {
  assert.match(html, /id="gamingRelayMode"/);
  assert.match(html, /full-speed data collection/i);
  assert.match(preload, /restartApp:\s*\(\)\s*=>\s*ipcRenderer\.invoke\('app:restart'\)/);
  assert.match(main, /if \(relayModeEnabled\(\)\) await startRelayMode\(\)/);
  assert.match(main, /async function startRelayMode\(\)[\s\S]*await createTray\(\)[\s\S]*await connectDataSource\(\)/);
  assert.match(main, /Open full BYAKUGAN/);
  assert.match(main, /Disable Relay Mode and restart/);
  assert.match(main, /Copy Streaming PC URL/);
});

test('Relay Mode preserves production collection timing and avoids duplicate renderer refreshes', () => {
  assert.match(riot, /pollIntervalMs = options\.pollIntervalMs \|\| 5000/);
  assert.match(riot, /const batchSize = 40/);
  assert.match(riot, /mapWithConcurrency\(batch, 20,/);
  assert.match(riot, /mapWithConcurrency\(players, 5,/);
  assert.match(main, /const delays = \[6_000, 12_000, 24_000\]/);
  assert.match(main, /const seconds = Math\.max\(15, Number\(current\.refreshSeconds\) \|\| 30\)/);
  assert.match(renderer, /if \(state\.settings\?\.gamingRelayMode\) return;/);
});

test('Relay Mode keeps hosting and update recovery available without a dashboard window', () => {
  assert.match(main, /remoteViewerEnabled = true/);
  assert.match(main, /if \(status\.mandatory\) openMainWindow\(\)/);
  assert.match(main, /relayModeEnabled\(\) && mandatoryUpdate/);
  assert.match(main, /if \(relayModeEnabled\(\) && !quitting\)[\s\S]*return;/);
  assert.match(main, /scheduleRelayRefresh\(\)/);
});
