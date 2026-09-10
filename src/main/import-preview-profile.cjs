'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { RemoteViewerClient } = require('./services/remote-viewer-client.cjs');

// Local preview builds have a separate Electron profile and no update feed.
// Read the installed PC's role and connection on first launch. Copy only the
// match caches needed for this preview; never modify the installed profile.
function copyJson(source, destination) {
  try {
    const stat = fs.statSync(source);
    if (!stat.isFile() || stat.size > 20 * 1024 * 1024) return;
    JSON.parse(fs.readFileSync(source, 'utf8'));
    fs.copyFileSync(source, destination);
  } catch { /* Missing or unreadable caches can be collected again. */ }
}

function initializeImportPreview(appData, directory) {
  const destination = path.join(directory, 'settings.json');
  if (fs.existsSync(destination)) return;
  fs.mkdirSync(directory, { recursive: true });
  let settings = { pcRole: 'viewer', launchAtStartup: false, autoRefresh: true,
    gamingRelayMode: false, remoteViewerEnabled: false, streamOverlayEnabled: false };
  for (const name of ['BYAKUGAN', 'byakugan']) {
    const installed = path.join(appData, name);
    if (path.resolve(installed) === path.resolve(directory)) continue;
    try {
      const previous = JSON.parse(fs.readFileSync(path.join(installed, 'settings.json'), 'utf8'));
      if (previous.pcRole === 'gaming' || previous.pcRole === undefined) {
        settings = { ...settings, pcRole: 'gaming',
          remoteViewerEnabled: previous.remoteViewerEnabled === true,
          privacyMode: previous.privacyMode === true, uiScale: previous.uiScale || 100 };
        if (/^[a-f0-9]{48}$/.test(previous.remoteViewerToken || '')) settings.remoteViewerToken = previous.remoteViewerToken;
        for (const file of fs.readdirSync(installed).filter(name =>
          ['act-stats-cache.json', 'act-stats-archive.json', 'party-history.json'].includes(name)
          || /^encounters-riot-[a-f0-9]{32}\.json$/.test(name))) {
          copyJson(path.join(installed, file), path.join(directory, file));
        }
        break;
      }
      if (previous.pcRole !== 'viewer') continue;
      const reader = new RemoteViewerClient({ sourceUrl: previous.remoteSourceUrl, cacheDirectory: installed });
      const cache = reader.cachePath(); // validates the private LAN connection URL
      settings = { ...settings, remoteSourceUrl: previous.remoteSourceUrl, privacyMode: previous.privacyMode === true,
        uiScale: previous.uiScale || 100 };
      try {
        if (fs.statSync(cache).size <= 20 * 1024 * 1024 && reader.restoreSnapshot()) {
          fs.copyFileSync(cache, path.join(directory, path.basename(cache)));
        }
      } catch { /* The preview can still fetch a new snapshot from the host. */ }
      break;
    } catch { /* The installed app may not have a readable profile. */ }
  }
  fs.writeFileSync(destination, JSON.stringify(settings, null, 2));
}

module.exports = { initializeImportPreview };
