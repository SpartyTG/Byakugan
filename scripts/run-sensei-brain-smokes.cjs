'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const scriptsDirectory = __dirname;
const scripts = fs.readdirSync(scriptsDirectory)
  .filter((name) => /^sensei-brain(?:-.+)?-smoke\.cjs$/.test(name) || name === 'sensei-brain-smoke.cjs')
  .sort();

for (const script of scripts) {
  const result = spawnSync(process.execPath, [path.join(scriptsDirectory, script)], { encoding: 'utf8' });
  if (result.status !== 0) {
    process.stderr.write(result.stdout || '');
    process.stderr.write(result.stderr || '');
    process.exit(result.status || 1);
  }
}

console.log(`Passed ${scripts.length} Sensei Brain smoke checks.`);
