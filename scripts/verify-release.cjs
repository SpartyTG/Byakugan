'use strict';

const fs = require('node:fs');
const path = require('node:path');
const project = require('../package.json');

const requireFeed = process.argv.includes('--require-feed');
const releaseDirectory = path.join(__dirname, '..', 'release');
const files = fs.existsSync(releaseDirectory) ? fs.readdirSync(releaseDirectory) : [];
const expectedInstaller = `BYAKUGAN-Setup-${project.version}-x64.exe`;
const errors = [];

if (!files.includes(expectedInstaller)) errors.push(`Missing installer: ${expectedInstaller}`);
if (requireFeed && !files.includes('beta.yml')) errors.push('Missing beta.yml update manifest.');
if (requireFeed && !files.some((name) => name.endsWith('.exe.blockmap'))) errors.push('Missing installer blockmap.');

if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}

console.log(`Verified BYAKUGAN ${project.version} release artifacts.`);
