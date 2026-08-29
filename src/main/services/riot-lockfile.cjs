'use strict';

const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');

function getLockfilePath(env = process.env, platform = process.platform) {
  if (env.BYAKUGAN_LOCKFILE_PATH) return path.resolve(env.BYAKUGAN_LOCKFILE_PATH);
  if (env.COMPANION_LOCKFILE_PATH) return path.resolve(env.COMPANION_LOCKFILE_PATH);

  if (platform === 'win32' && env.LOCALAPPDATA) {
    return path.join(env.LOCALAPPDATA, 'Riot Games', 'Riot Client', 'Config', 'lockfile');
  }

  // Useful for Wine-based development and explicit test fixtures.
  if (env.LOCALAPPDATA) {
    return path.join(env.LOCALAPPDATA, 'Riot Games', 'Riot Client', 'Config', 'lockfile');
  }

  return path.join(os.homedir(), 'AppData', 'Local', 'Riot Games', 'Riot Client', 'Config', 'lockfile');
}

function parseLockfile(raw) {
  if (typeof raw !== 'string') throw new TypeError('Lockfile contents must be text.');
  const parts = raw.trim().split(':');
  if (parts.length !== 5) throw new Error('Riot lockfile has an unexpected format.');

  const [name, pidText, portText, password, protocol] = parts;
  const pid = Number(pidText);
  const port = Number(portText);

  if (!name || !Number.isInteger(pid) || pid <= 0) throw new Error('Riot lockfile PID is invalid.');
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Riot lockfile port is invalid.');
  if (!password) throw new Error('Riot lockfile password is missing.');
  if (!['http', 'https'].includes(protocol)) throw new Error('Riot lockfile protocol is invalid.');

  return { name, pid, port, password, protocol };
}

function readLockfile(lockfilePath = getLockfilePath()) {
  try {
    return parseLockfile(fs.readFileSync(lockfilePath, 'utf8'));
  } catch (error) {
    if (error && error.code === 'ENOENT') return null;
    throw error;
  }
}

function canReachPort(port, host = '127.0.0.1', timeoutMs = 800) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(result);
    };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));
  });
}

module.exports = { getLockfilePath, parseLockfile, readLockfile, canReachPort };
