'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { inspectWindowsExecutable } = require('../scripts/windows-executable.cjs');

// Minimal PE fixture for structural validation only; it is not a runnable program.
function fixture() {
  const bytes = Buffer.alloc(0x400);
  bytes.write('MZ'); bytes.writeUInt32LE(0x80, 0x3c);
  bytes.writeUInt32LE(0x00004550, 0x80);
  bytes.writeUInt16LE(0x8664, 0x84); bytes.writeUInt16LE(1, 0x86);
  bytes.writeUInt16LE(240, 0x94); bytes.writeUInt16LE(0x22, 0x96);
  const optional = 0x98;
  bytes.writeUInt16LE(0x20b, optional); bytes.writeUInt32LE(0x1000, optional + 16);
  bytes.writeUInt32LE(0x2000, optional + 56); bytes.writeUInt32LE(0x200, optional + 60);
  bytes.writeUInt32LE(16, optional + 108);
  const section = optional + 240;
  bytes.write('.text', section); bytes.writeUInt32LE(0x100, section + 8);
  bytes.writeUInt32LE(0x1000, section + 12); bytes.writeUInt32LE(0x200, section + 16);
  bytes.writeUInt32LE(0x200, section + 20);
  return bytes;
}

test('Windows packaging guard accepts complete PE sections and the intended architecture', () => {
  assert.equal(inspectWindowsExecutable(fixture(), { expectedMachine: 0x8664 }).bytes, 1024);
  assert.throws(() => inspectWindowsExecutable(fixture(), { expectedMachine: 0x14c }), /architecture/);
});

test('Windows packaging guard rejects truncation even when MZ, PE and the entry point survive', () => {
  const complete = fixture();
  assert.throws(() => inspectWindowsExecutable(complete.subarray(0, 0x380)), /section .text extends beyond/);
  const shifted = fixture(); shifted.writeUInt32LE(0x300, 0x188 + 20);
  assert.throws(() => inspectWindowsExecutable(shifted), /section .text extends beyond/);
});

test('Windows packaging guard rejects incomplete headers and missing program data', () => {
  for (const end of [1, 63, 140, 210, 410]) assert.throws(() => inspectWindowsExecutable(fixture().subarray(0, end)));
  const badEntry = fixture(); badEntry.writeUInt32LE(0x1900, 0x98 + 16);
  assert.throws(() => inspectWindowsExecutable(badEntry), /entry point/);
  const badHeader = fixture(); badHeader.writeUInt32LE(0xffffffff, 0x3c);
  assert.throws(() => inspectWindowsExecutable(badHeader), /PE header/);
});

test('Windows packaging guard rejects truncated certificates and oversized virtual sections', () => {
  const certificate = fixture();
  certificate.writeUInt32LE(0x3f0, 0x98 + 112 + 4 * 8);
  certificate.writeUInt32LE(0x30, 0x98 + 112 + 4 * 8 + 4);
  assert.throws(() => inspectWindowsExecutable(certificate), /certificate/);
  const section = fixture(); section.writeUInt32LE(0x2000, 0x188 + 8);
  assert.throws(() => inspectWindowsExecutable(section), /image size/);
});
