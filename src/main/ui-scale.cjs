'use strict';

const UI_SCALE_OPTIONS = Object.freeze([100, 125, 150, 175, 200]);

function normalizeUiScale(value) {
  const scale = Number(value);
  return UI_SCALE_OPTIONS.includes(scale) ? scale : 100;
}

function uiScaleFactor(value) {
  return normalizeUiScale(value) / 100;
}

module.exports = { UI_SCALE_OPTIONS, normalizeUiScale, uiScaleFactor };
