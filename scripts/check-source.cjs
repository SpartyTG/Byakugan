'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.join(__dirname, '..');

function filesUnder(directory) {
  const output = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) output.push(...filesUnder(full));
    else output.push(full);
  }
  return output;
}

const syntaxFiles = ['src', 'scripts', 'tests']
  .flatMap((directory) => filesUnder(path.join(root, directory)))
  .filter((file) => /\.(?:cjs|js)$/.test(file));

for (const file of syntaxFiles) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (result.status !== 0) {
    process.stderr.write(result.stderr || result.stdout || `Syntax check failed: ${file}\n`);
    process.exit(result.status || 1);
  }
}

const jsonFiles = [
  path.join(root, 'package.json'),
  path.join(root, 'package-lock.json'),
  ...filesUnder(path.join(root, 'src', 'main', 'sensei-brain', 'packs')).filter((file) => file.endsWith('.json'))
];
for (const file of jsonFiles) JSON.parse(fs.readFileSync(file, 'utf8'));

const project = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const releaseNotes = fs.readFileSync(path.join(root, 'RELEASE_NOTES.md'), 'utf8');
const expectedHeading = `# BYAKUGAN v${project.version}`;
if (!releaseNotes.startsWith(`${expectedHeading}\n`)) {
  process.stderr.write(`RELEASE_NOTES.md must begin with ${expectedHeading}\n`);
  process.exit(1);
}
if (!/^\s*[-*]\s+\S/m.test(releaseNotes)) {
  process.stderr.write('RELEASE_NOTES.md must include at least one patch-note bullet.\n');
  process.exit(1);
}

console.log(`Checked ${syntaxFiles.length} JavaScript files and ${jsonFiles.length} JSON files.`);
