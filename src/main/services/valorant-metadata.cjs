'use strict';

const { requestJson } = require('./http.cjs');

const EMPTY = Object.freeze({
  maps: new Map(), agents: new Map(), weapons: new Map(), skins: new Map(), tiers: new Map(), seasons: new Map()
});

let cached = null;
let cachedAt = 0;

function put(map, key, value) {
  if (key) map.set(String(key).toLowerCase(), value);
}

async function fetchMetadata(force = false) {
  if (!force && cached && Date.now() - cachedAt < 6 * 60 * 60 * 1000) return cached;

  try {
    const options = { timeout: 12_000, maxBytes: 30 * 1024 * 1024 };
    const [mapsResponse, agentsResponse, weaponsResponse, tiersResponse, seasonsResponse] = await Promise.all([
      requestJson('https://valorant-api.com/v1/maps', options),
      requestJson('https://valorant-api.com/v1/agents?isPlayableCharacter=true', options),
      requestJson('https://valorant-api.com/v1/weapons', options),
      requestJson('https://valorant-api.com/v1/competitivetiers', options),
      requestJson('https://valorant-api.com/v1/seasons', options)
    ]);

    const metadata = {
      maps: new Map(), agents: new Map(), weapons: new Map(), skins: new Map(), tiers: new Map(), seasons: new Map()
    };

    for (const map of mapsResponse.data?.data || []) {
      const item = { name: map.displayName, image: map.splash || map.listViewIcon || '' };
      put(metadata.maps, map.uuid, item);
      put(metadata.maps, map.mapUrl, item);
      put(metadata.maps, String(map.mapUrl || '').split('/').at(-1), item);
    }

    for (const agent of agentsResponse.data?.data || []) {
      put(metadata.agents, agent.uuid, {
        name: agent.displayName,
        role: agent.role?.displayName || 'Agent',
        image: agent.displayIcon || agent.fullPortraitV2 || '',
        color: agent.backgroundGradientColors?.[0] ? `#${agent.backgroundGradientColors[0].slice(0, 6)}` : '#7b67f6'
      });
    }

    for (const weapon of weaponsResponse.data?.data || []) {
      put(metadata.weapons, weapon.uuid, {
        name: weapon.displayName,
        image: weapon.displayIcon || ''
      });
      for (const skin of weapon.skins || []) {
        const item = {
          name: skin.displayName,
          weapon: weapon.displayName,
          image: skin.displayIcon || skin.chromas?.[0]?.fullRender || weapon.displayIcon || ''
        };
        put(metadata.skins, skin.uuid, item);
        for (const chroma of skin.chromas || []) put(metadata.skins, chroma.uuid, item);
      }
    }

    const tierSets = tiersResponse.data?.data || [];
    const latest = tierSets.at(-1) || {};
    for (const tier of latest.tiers || []) {
      metadata.tiers.set(Number(tier.tier), {
        name: tier.tierName || `Competitive tier ${tier.tier}`,
        image: tier.largeIcon || tier.smallIcon || '',
        color: tier.color ? `#${tier.color.slice(0, 6)}` : '#7b67f6'
      });
    }

    for (const season of seasonsResponse.data?.data || []) {
      put(metadata.seasons, season.uuid, {
        id: season.uuid,
        name: season.displayName || 'Unknown act',
        type: String(season.type || ''),
        parentId: season.parentUuid || '',
        startTime: season.startTime || '',
        endTime: season.endTime || ''
      });
    }

    cached = metadata;
    cachedAt = Date.now();
    return metadata;
  } catch {
    return cached || EMPTY;
  }
}

function resolveById(map, id, fallback) {
  const value = String(id || '').toLowerCase();
  if (!value) return fallback;
  if (map.has(value)) return map.get(value);
  for (const [key, item] of map) {
    if (value.endsWith(key) || key.endsWith(value)) return item;
  }
  return fallback;
}

module.exports = { fetchMetadata, resolveById };
