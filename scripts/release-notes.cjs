'use strict';

function normalizeReleaseNotes(value) {
  return String(value || '').replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
}

function validateReleaseNotes(value, version) {
  const notes = normalizeReleaseNotes(value);
  const expectedHeading = `# BYAKUGAN v${version}`;
  if (!notes.startsWith(`${expectedHeading}\n`)) {
    return `RELEASE_NOTES.md must begin with ${expectedHeading}`;
  }
  if (!/^\s*[-*]\s+\S/m.test(notes)) {
    return 'RELEASE_NOTES.md must include at least one patch-note bullet.';
  }
  return '';
}

module.exports = { normalizeReleaseNotes, validateReleaseNotes };
