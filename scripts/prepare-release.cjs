'use strict';

const fs = require('node:fs');
const path = require('node:path');
const project = require('../package.json');

const requireFeed = process.argv.includes('--require-feed');
const owner = String(process.env.BYAKUGAN_GH_OWNER || project.updateRepository?.owner || '').trim();
const repo = String(process.env.BYAKUGAN_GH_REPO || project.updateRepository?.repo || '').trim();
const safeRepositoryPart = /^[A-Za-z0-9_.-]+$/;

if ((owner && !safeRepositoryPart.test(owner)) || (repo && !safeRepositoryPart.test(repo))) {
  console.error('GitHub owner and repository names may contain letters, numbers, dots, hyphens, and underscores only.');
  process.exit(1);
}

if (requireFeed && (!owner || !repo)) {
  console.error('BYAKUGAN_GH_OWNER and BYAKUGAN_GH_REPO are required for an update-enabled release build.');
  process.exit(1);
}

const feedConfigured = Boolean(owner && repo && project.updateFeedConfigured !== false);
const config = {
  ...project.build,
  extraMetadata: {
    updateFeedConfigured: feedConfigured
  },
  publish: feedConfigured
    ? [{ provider: 'github', owner, repo, channel: 'beta', releaseType: 'prerelease' }]
    : [{ provider: 'generic', url: 'https://updates.invalid/byakugan/beta', channel: 'beta' }]
};

const output = path.join(__dirname, '..', 'release-config.json');
fs.writeFileSync(output, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
console.log(feedConfigured
  ? `Beta update source: https://github.com/${owner}/${repo}/releases`
  : 'Installer-only beta build: the in-app updater will remain disabled until a release feed is configured.');
