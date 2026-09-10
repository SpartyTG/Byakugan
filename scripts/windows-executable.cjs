'use strict';

const fs = require('node:fs');

// Structural checks are a packaging gate, not a substitute for launching on Windows.
// In particular, an MZ/PE signature alone does not detect a truncated executable.
function inspectWindowsExecutable(bytes, { expectedMachine } = {}) {
  const fail = message => { throw new Error(`Invalid Windows executable: ${message}`); };
  if (!Buffer.isBuffer(bytes) || bytes.length < 64 || bytes.toString('ascii', 0, 2) !== 'MZ') fail('missing DOS header');
  const pe = bytes.readUInt32LE(0x3c);
  if (pe < 64 || pe + 24 > bytes.length || bytes.readUInt32LE(pe) !== 0x00004550) fail('missing PE header');
  const machine = bytes.readUInt16LE(pe + 4);
  if (expectedMachine != null && machine !== expectedMachine) fail('unexpected processor architecture');
  const count = bytes.readUInt16LE(pe + 6);
  const optionalBytes = bytes.readUInt16LE(pe + 20);
  if (!(bytes.readUInt16LE(pe + 22) & 0x0002)) fail('image is not executable');
  const optional = pe + 24;
  if (optionalBytes < 96 || optional + optionalBytes > bytes.length) fail('truncated optional header');
  const magic = bytes.readUInt16LE(optional);
  if (![0x10b, 0x20b].includes(magic)) fail('unsupported PE format');
  const directoryOffset = magic === 0x20b ? 112 : 96;
  if (optionalBytes < directoryOffset) fail('truncated data directory');
  const directories = bytes.readUInt32LE(optional + directoryOffset - 4);
  if (directoryOffset + directories * 8 > optionalBytes) fail('data directory exceeds its header');
  const sectionTable = optional + optionalBytes;
  const headerBytes = bytes.readUInt32LE(optional + 60);
  const imageBytes = bytes.readUInt32LE(optional + 56);
  if (!count || sectionTable + count * 40 > headerBytes || headerBytes > bytes.length) fail('truncated section table');
  const entryPoint = bytes.readUInt32LE(optional + 16);
  let entryBackedByFile = false;
  for (let index = 0; index < count; index++) {
    const offset = sectionTable + index * 40;
    const name = bytes.toString('ascii', offset, offset + 8).replace(/\0.*$/, '') || String(index);
    const virtualBytes = bytes.readUInt32LE(offset + 8);
    const virtualAddress = bytes.readUInt32LE(offset + 12);
    const rawBytes = bytes.readUInt32LE(offset + 16);
    const rawAddress = bytes.readUInt32LE(offset + 20);
    if (rawBytes && (rawAddress < headerBytes || rawAddress + rawBytes > bytes.length)) {
      fail(`section ${name} extends beyond the file or overlaps its headers`);
    }
    if (virtualAddress + Math.max(virtualBytes, rawBytes) > imageBytes) fail(`section ${name} exceeds the image size`);
    if (entryPoint >= virtualAddress && entryPoint - virtualAddress < rawBytes) entryBackedByFile = true;
  }
  if (!entryBackedByFile) fail('entry point has no file-backed section');
  // The certificate directory stores a file offset, not a virtual address.
  if (directories > 4) {
    const certificate = optional + directoryOffset + 4 * 8;
    const address = bytes.readUInt32LE(certificate);
    const size = bytes.readUInt32LE(certificate + 4);
    if (size && (address < headerBytes || address + size > bytes.length)) fail('truncated certificate table');
  }
  return { machine, sections: count, bytes: bytes.length, entryPoint };
}

function verifyWindowsExecutable(file, options) {
  return inspectWindowsExecutable(fs.readFileSync(file), options);
}

module.exports = { inspectWindowsExecutable, verifyWindowsExecutable };
