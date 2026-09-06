'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const { PassThrough } = require('node:stream');
const {
  allowedInstallerUrl,
  downloadHttps,
  parsePullProgress
} = require('../src/main/services/sensei-setup.cjs');

function response(statusCode, headers = {}, body = '') {
  const stream = new PassThrough();
  stream.statusCode = statusCode;
  stream.headers = headers;
  queueMicrotask(() => stream.end(body));
  return stream;
}

test('Sensei setup accepts only HTTPS Ollama release hosts', () => {
  assert.equal(allowedInstallerUrl('https://ollama.com/download/OllamaSetup.exe'), true);
  assert.equal(allowedInstallerUrl('https://github.com/ollama/ollama/releases/file.exe'), true);
  assert.equal(allowedInstallerUrl('http://ollama.com/download/OllamaSetup.exe'), false);
  assert.equal(allowedInstallerUrl('https://ollama.com.attacker.example/file.exe'), false);
});

test('Sensei setup follows a trusted redirect and writes a fresh complete installer stream', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'byakugan-setup-download-'));
  const target = path.join(directory, 'OllamaSetup.exe');
  const urls = [];
  const progress = [];
  const get = (url, callback) => {
    urls.push(String(url));
    const request = new EventEmitter();
    queueMicrotask(() => callback(urls.length === 1
      ? response(302, { location: 'https://github.com/ollama/ollama/releases/download/test/OllamaSetup.exe' })
      : response(200, { 'content-length': '4' }, 'MZok')));
    return request;
  };
  try {
    const result = await downloadHttps({
      url: 'https://ollama.com/download/OllamaSetup.exe',
      target,
      onProgress: (item) => progress.push(item),
      get
    });
    assert.equal(result, target);
    assert.equal(fs.readFileSync(target, 'utf8'), 'MZok');
    assert.equal(urls.length, 2);
    assert.equal(progress.at(-1).percent, 100);
    assert.equal(fs.existsSync(`${target}.download`), false);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('Sensei setup parses Ollama pull progress without trusting arbitrary output', () => {
  assert.deepEqual(parsePullProgress('pulling layers 42%'), { raw: 'pulling layers 42%', percent: 42 });
  assert.equal(parsePullProgress('working').percent, null);
  assert.equal(parsePullProgress('999%').percent, 100);
});
