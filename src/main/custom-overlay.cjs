'use strict';

const CUSTOM_ELEMENT_TYPES = Object.freeze([
  'branding', 'playerName', 'currentRank', 'currentRR', 'peakRank',
  'sessionWL', 'sessionKD', 'rrChange', 'lastMatch', 'agent', 'map', 'rrBeam'
]);

const DEFAULT_CUSTOM_OVERLAY = Object.freeze({
  width: 960,
  height: 360,
  inGameWidth: 960,
  inGameHeight: 360,
  backgroundColor: '#0b0d1d',
  elements: Object.freeze([
    { id: 'branding', visible: true, x: 3, y: 5, width: 27, height: 18, fontSize: 28, opacity: 100, align: 'left', color: '#ffffff' },
    { id: 'playerName', visible: false, x: 3, y: 27, width: 25, height: 12, fontSize: 24, opacity: 100, align: 'left', color: '#c9bcff' },
    { id: 'currentRank', visible: true, x: 58, y: 5, width: 39, height: 25, fontSize: 34, opacity: 100, align: 'left', color: '#ffffff' },
    { id: 'currentRR', visible: true, x: 78, y: 31, width: 18, height: 11, fontSize: 22, opacity: 100, align: 'right', color: '#c9bcff' },
    { id: 'peakRank', visible: true, x: 58, y: 44, width: 39, height: 17, fontSize: 20, opacity: 100, align: 'left', color: '#eeeaff' },
    { id: 'sessionWL', visible: true, x: 3, y: 48, width: 22, height: 14, fontSize: 25, opacity: 100, align: 'left', color: '#ffffff' },
    { id: 'sessionKD', visible: true, x: 27, y: 48, width: 18, height: 14, fontSize: 25, opacity: 100, align: 'left', color: '#ffffff' },
    { id: 'rrChange', visible: false, x: 78, y: 65, width: 18, height: 12, fontSize: 22, opacity: 100, align: 'right', color: '#38e6c1' },
    { id: 'lastMatch', visible: true, x: 58, y: 65, width: 38, height: 13, fontSize: 20, opacity: 100, align: 'right', color: '#ffffff' },
    { id: 'agent', visible: false, x: 3, y: 65, width: 20, height: 27, fontSize: 20, opacity: 100, align: 'left', color: '#ffffff' },
    { id: 'map', visible: false, x: 25, y: 69, width: 20, height: 16, fontSize: 22, opacity: 100, align: 'left', color: '#ffffff' },
    { id: 'rrBeam', visible: true, x: 3, y: 82, width: 94, height: 13, fontSize: 16, opacity: 100, align: 'left', color: '#70dfff', showMarker: true }
  ]),
  reactive: false,
  inGameElements: Object.freeze([
    { id: 'branding', visible: false, x: 3, y: 5, width: 24, height: 18, fontSize: 24, opacity: 100, align: 'left', color: '#ffffff' },
    { id: 'playerName', visible: false, x: 3, y: 27, width: 25, height: 12, fontSize: 22, opacity: 100, align: 'left', color: '#c9bcff' },
    { id: 'currentRank', visible: true, x: 3, y: 7, width: 51, height: 28, fontSize: 30, opacity: 100, align: 'left', color: '#ffffff' },
    { id: 'currentRR', visible: false, x: 78, y: 31, width: 18, height: 11, fontSize: 22, opacity: 100, align: 'right', color: '#c9bcff' },
    { id: 'peakRank', visible: false, x: 58, y: 44, width: 39, height: 17, fontSize: 20, opacity: 100, align: 'left', color: '#eeeaff' },
    { id: 'sessionWL', visible: true, x: 58, y: 8, width: 22, height: 22, fontSize: 24, opacity: 100, align: 'center', color: '#ffffff' },
    { id: 'sessionKD', visible: true, x: 81, y: 8, width: 16, height: 22, fontSize: 24, opacity: 100, align: 'center', color: '#ffffff' },
    { id: 'rrChange', visible: false, x: 78, y: 65, width: 18, height: 12, fontSize: 22, opacity: 100, align: 'right', color: '#38e6c1' },
    { id: 'lastMatch', visible: false, x: 58, y: 65, width: 38, height: 13, fontSize: 20, opacity: 100, align: 'right', color: '#ffffff' },
    { id: 'agent', visible: false, x: 3, y: 65, width: 20, height: 27, fontSize: 20, opacity: 100, align: 'left', color: '#ffffff' },
    { id: 'map', visible: false, x: 25, y: 69, width: 20, height: 16, fontSize: 22, opacity: 100, align: 'left', color: '#ffffff' },
    { id: 'rrBeam', visible: true, x: 3, y: 58, width: 94, height: 28, fontSize: 20, opacity: 100, align: 'left', color: '#70dfff', showMarker: true }
  ])
});

function numberWithin(value, fallback, minimum, maximum) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(Math.max(minimum, Math.min(maximum, parsed)) * 10) / 10 : fallback;
}

function safeColor(value, fallback) {
  return /^#[a-f0-9]{6}$/i.test(String(value || '')) ? String(value).toLowerCase() : fallback;
}

function normalizeElement(candidate, fallback) {
  const source = candidate && typeof candidate === 'object' ? candidate : {};
  const width = numberWithin(source.width, fallback.width, 4, 100);
  const height = numberWithin(source.height, fallback.height, 4, 100);
  const defaultLabelFontSize = fallback.labelFontSize || Math.max(6, Math.round(fallback.fontSize * 0.38));
  const defaultDetailFontSize = fallback.detailFontSize || Math.max(6, Math.round(fallback.fontSize * 0.42));
  const normalized = {
    id: fallback.id,
    visible: typeof source.visible === 'boolean' ? source.visible : fallback.visible,
    x: numberWithin(source.x, fallback.x, 0, 100 - width),
    y: numberWithin(source.y, fallback.y, 0, 100 - height),
    width,
    height,
    fontSize: numberWithin(source.fontSize, fallback.fontSize, 8, 96),
    labelFontSize: numberWithin(source.labelFontSize, defaultLabelFontSize, 6, 72),
    detailFontSize: numberWithin(source.detailFontSize, defaultDetailFontSize, 6, 72),
    opacity: numberWithin(source.opacity, fallback.opacity, 10, 100),
    align: ['left', 'center', 'right'].includes(source.align) ? source.align : fallback.align,
    color: safeColor(source.color, fallback.color)
  };
  if (fallback.id === 'rrBeam') {
    normalized.showMarker = typeof source.showMarker === 'boolean' ? source.showMarker : fallback.showMarker !== false;
  }
  return normalized;
}

function normalizeCustomOverlay(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const supplied = Array.isArray(source.elements) ? source.elements : [];
  const suppliedInGame = Array.isArray(source.inGameElements) ? source.inGameElements : [];
  const legacyReactiveDock = supplied.find((element) => element?.id === 'reactiveDock');
  const legacyReactiveBetween = supplied.find((element) => element?.id === 'reactiveBetween');
  const legacyReactiveInGame = supplied.find((element) => element?.id === 'reactiveInGame');
  return {
    width: numberWithin(source.width, DEFAULT_CUSTOM_OVERLAY.width, 320, 1920),
    height: numberWithin(source.height, DEFAULT_CUSTOM_OVERLAY.height, 120, 1080),
    inGameWidth: numberWithin(source.inGameWidth, source.width || DEFAULT_CUSTOM_OVERLAY.inGameWidth, 320, 1920),
    inGameHeight: numberWithin(source.inGameHeight, source.height || DEFAULT_CUSTOM_OVERLAY.inGameHeight, 120, 1080),
    backgroundColor: safeColor(source.backgroundColor, DEFAULT_CUSTOM_OVERLAY.backgroundColor),
    reactive: typeof source.reactive === 'boolean'
      ? source.reactive
      : Boolean(legacyReactiveDock?.visible || legacyReactiveBetween?.visible || legacyReactiveInGame?.visible),
    elements: DEFAULT_CUSTOM_OVERLAY.elements.map((fallback) => normalizeElement(
      supplied.find((element) => element?.id === fallback.id), fallback
    )),
    inGameElements: DEFAULT_CUSTOM_OVERLAY.inGameElements.map((fallback) => normalizeElement(
      suppliedInGame.find((element) => element?.id === fallback.id), fallback
    ))
  };
}

function customElementVisible(config, id, inGame = false) {
  const elements = inGame && config?.reactive ? config?.inGameElements : config?.elements;
  return Boolean(elements?.find((element) => element.id === id)?.visible);
}

module.exports = { CUSTOM_ELEMENT_TYPES, DEFAULT_CUSTOM_OVERLAY, normalizeCustomOverlay, customElementVisible };
