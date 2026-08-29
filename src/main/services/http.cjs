'use strict';

const http = require('node:http');
const https = require('node:https');

function requestJson(url, options = {}) {
  const target = url instanceof URL ? url : new URL(url);
  const transport = target.protocol === 'http:' ? http : https;
  const timeout = options.timeout ?? 10_000;
  const body = options.body == null
    ? null
    : typeof options.body === 'string'
      ? options.body
      : JSON.stringify(options.body);

  const headers = { Accept: 'application/json', ...(options.headers || {}) };
  if (body && !Object.keys(headers).some((key) => key.toLowerCase() === 'content-type')) {
    headers['Content-Type'] = 'application/json';
  }
  if (body) headers['Content-Length'] = Buffer.byteLength(body);

  return new Promise((resolve, reject) => {
    const req = transport.request(target, {
      method: options.method || 'GET',
      headers,
      rejectUnauthorized: options.rejectUnauthorized !== false,
      timeout
    }, (res) => {
      const chunks = [];
      let size = 0;
      const maxBytes = options.maxBytes ?? 8 * 1024 * 1024;

      res.on('data', (chunk) => {
        size += chunk.length;
        if (size > maxBytes) {
          req.destroy(new Error('Response exceeded the configured size limit.'));
          return;
        }
        chunks.push(chunk);
      });

      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        let data = null;
        if (text) {
          try { data = JSON.parse(text); }
          catch { data = text; }
        }

        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve({ status: res.statusCode, headers: res.headers, data });
        } else {
          const error = new Error(`Request failed with HTTP ${res.statusCode}.`);
          error.status = res.statusCode;
          error.data = data;
          reject(error);
        }
      });
    });

    req.once('timeout', () => req.destroy(new Error('Request timed out.')));
    req.once('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

module.exports = { requestJson };
