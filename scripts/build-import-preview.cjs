'use strict';

const path = require('node:path');
const { build, Platform, Arch } = require('electron-builder');
const project = require('../package.json');
const { verifyWindowsExecutable } = require('./windows-executable.cjs');

build({
  targets: Platform.WINDOWS.createTarget(['dir'], Arch.x64),
  publish: 'never',
  config: {
    ...project.build, extends: null,
    // The Linux resource rewrite truncated the Electron 44 executable in import.1.
    // Use Electron's supported resources/app layout and leave its runtime intact.
    asar: false,
    appId: 'com.tyler.byakugan.importpreview', productName: 'BYAKUGAN Import Preview',
    directories: { output: path.join(__dirname, '..', '.local-build', 'import-preview') },
    extraMetadata: { name: 'byakugan-import-preview', version: `${project.version}.import.3`,
      localImportPreview: true, updateFeedConfigured: false, updateRepository: null },
    win: { target: [{ target: 'dir', arch: ['x64'] }], signAndEditExecutable: false },
    publish: null
  }
}).then(() => {
  const executable = path.join(__dirname, '..', '.local-build', 'import-preview', 'win-unpacked', 'BYAKUGAN Import Preview.exe');
  const result = verifyWindowsExecutable(executable, { expectedMachine: 0x8664 });
  console.log(`Verified Windows x64 executable: ${result.bytes} bytes, ${result.sections} complete sections.`);
}).catch(error => { console.error(error.message); process.exitCode = 1; });
