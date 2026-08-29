'use strict';

const SHARD_BY_REGION = Object.freeze({
  na: 'na', latam: 'na', br: 'na',
  eu: 'eu',
  ap: 'ap', kr: 'kr',
  pbe: 'pbe'
});

function normalizeRegion(input) {
  const value = String(input || '').trim().toLowerCase();
  if (!value) return null;
  if (value === 'northamerica') return 'na';
  if (value === 'europe') return 'eu';
  if (value === 'asia-pacific' || value === 'asiapacific') return 'ap';
  return Object.hasOwn(SHARD_BY_REGION, value) ? value : null;
}

function shardForRegion(region) {
  return SHARD_BY_REGION[normalizeRegion(region)] || 'na';
}

function findStringDeep(value, predicate) {
  if (typeof value === 'string' && predicate(value)) return value;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findStringDeep(item, predicate);
      if (found) return found;
    }
  } else if (value && typeof value === 'object') {
    for (const item of Object.values(value)) {
      const found = findStringDeep(item, predicate);
      if (found) return found;
    }
  }
  return null;
}

function deriveRegion(metadata, sessions) {
  const candidates = [
    metadata?.region,
    metadata?.webRegion,
    metadata?.productRegion,
    metadata?.rsoPlatformId
  ];

  for (const candidate of candidates) {
    const normalized = normalizeRegion(candidate);
    if (normalized) return { region: normalized, shard: shardForRegion(normalized) };
  }

  const deployment = findStringDeep(sessions, (text) => /(?:ares-deployment|riotclient_region)=/i.test(text));
  if (deployment) {
    const match = deployment.match(/(?:ares-deployment|riotclient_region)=([a-z-]+)/i);
    const normalized = normalizeRegion(match?.[1]);
    if (normalized) return { region: normalized, shard: shardForRegion(normalized) };
  }

  return { region: 'na', shard: 'na' };
}

module.exports = { normalizeRegion, shardForRegion, deriveRegion };
