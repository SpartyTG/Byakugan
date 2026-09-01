'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

test('README presents BYAKUGAN as an original professional companion product', () => {
  assert.match(readme, /player and act\s+statistics/i);
  assert.match(readme, /post-game tactical heat maps/i);
  assert.match(readme, /dual-PC support/i);
  assert.doesNotMatch(readme, /clean-room/i);
  assert.doesNotMatch(readme, /rather than a copy/i);
  assert.doesNotMatch(packageJson.description, /clean-room|copy/i);
});

test('README preserves creator, inspiration, and AI-development disclosures', () => {
  assert.match(readme, /Tyler Ganza\s+\(A\.K\.A\. Spartan\)/i);
  assert.match(readme, /Valorant Tracker/i);
  assert.match(readme, /ValRadiant/i);
  assert.match(readme, /99% of BYAKUGAN's implementation code has been written with AI\s+assistance/i);
  assert.match(readme, /ChatGPT Work, Grok Build, and Claude/i);
});

test('README includes Riot legal and approval-readiness notices', () => {
  assert.match(readme, /BYAKUGAN isn't endorsed by Riot Games/);
  assert.match(readme, /Riot Games, and all associated properties are trademarks or\s+registered trademarks of Riot Games, Inc\./);
  assert.match(readme, /Require player opt-in before exposing identifiable player statistics/i);
  assert.match(readme, /Riot Sign\s+On \(RSO\)/i);
});

test('README accurately documents the permanent read-only game boundary', () => {
  assert.match(readme, /read-only with respect to VALORANT, the Riot Client, and Riot\s+account or game state/i);
  assert.match(readme, /does \*\*not\*\* inject code or DLLs/i);
  assert.match(readme, /No BYAKUGAN file is injected into a VALORANT or Riot\s+Client process or installation directory/i);
  assert.match(readme, /settings, session-recovery\s+records, and local statistics caches/i);
  assert.match(readme, /permanent BYAKUGAN design\s+boundary/i);
});
