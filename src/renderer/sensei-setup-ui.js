"use strict";

let senseiSetupBusy = false;
let removeSenseiSetupProgress = null;

function ensureSenseiSetupModal() {
  if (document.getElementById("senseiSetupModal")) return;
  const wrap = document.createElement("div");
  wrap.id = "senseiSetupModal";
  wrap.className = "sensei-setup-modal";
  wrap.hidden = true;
  wrap.innerHTML = `
    <div class="sensei-setup-card">
      <h2>Enable Sensei Vision?</h2>
      <p>This stays on this computer. No cloud API. No live mid-round coaching.</p>
      <p>If you choose Yes, BYAKUGAN will install official Ollama if it is missing and download:</p>
      <ul>
        <li>qwen3:8b — Full Sensei, about 5 GB</li>
        <li>qwen3-vl:4b-instruct — only if VOD is checked, about 3 GB</li>
      </ul>
      <label><input id="senseiSetupVod" type="checkbox"> Also set up VOD Vision (FFmpeg is separate)</label>
      <p class="sensei-setup-log" id="senseiSetupLog"></p>
      <div class="sensei-setup-actions">
        <button type="button" class="ghost-button" id="senseiSetupNo">No</button>
        <button type="button" class="primary-button" id="senseiSetupYes">Yes, install on this PC</button>
      </div>
    </div>`;
  document.body.appendChild(wrap);
}

function showSenseiSetupModal() {
  ensureSenseiSetupModal();
  document.getElementById("senseiSetupModal").hidden = false;
}

function hideSenseiSetupModal() {
  const modal = document.getElementById("senseiSetupModal");
  if (modal) modal.hidden = true;
}

async function runSenseiSetup() {
  const log = document.getElementById("senseiSetupLog");
  const write = (text) => { if (log) log.textContent = text; };
  if (!window.companion || !window.companion.installSenseiOllama) {
    write("Sensei setup is unavailable in this installation. Update BYAKUGAN and try again.");
    return;
  }
  if (senseiSetupBusy) return;
  const includeVod = Boolean(document.getElementById("senseiSetupVod")?.checked);
  const yes = document.getElementById("senseiSetupYes");
  const no = document.getElementById("senseiSetupNo");
  const vod = document.getElementById("senseiSetupVod");
  senseiSetupBusy = true;
  if (yes) { yes.disabled = true; yes.textContent = "Setting up…"; }
  if (no) no.disabled = true;
  if (vod) vod.disabled = true;
  try {
    write("Checking for Ollama…");
    await window.companion.installSenseiOllama();
    write("Pulling qwen3:8b if needed…");
    await window.companion.pullSenseiModel("qwen3:8b");
    if (includeVod) {
      write("Pulling qwen3-vl:4b-instruct…");
      await window.companion.pullSenseiModel("qwen3-vl:4b-instruct");
    }
    await window.companion.updateSettings({
      senseiEnabled: true,
      senseiTier: "sensei",
      senseiModel: "qwen3:8b",
      senseiVodEnabled: includeVod,
      senseiVodModel: includeVod ? "qwen3-vl:4b-instruct" : ""
    });
    const enabled = document.getElementById("senseiEnabled");
    if (enabled) enabled.checked = true;
    write("Sensei is ready on this PC.");
    hideSenseiSetupModal();
    await refreshSetupButton();
  } catch (error) {
    write(error && error.message ? error.message : String(error));
  } finally {
    senseiSetupBusy = false;
    if (yes) { yes.disabled = false; yes.textContent = "Yes, install on this PC"; }
    if (no) no.disabled = false;
    if (vod) vod.disabled = false;
  }
}

async function senseiReadiness() {
  try {
    if (!window.companion?.getSettings || !window.companion?.getSenseiStatus) return { ready: false, vodMissing: false };
    const [settings, status] = await Promise.all([
      window.companion.getSettings(),
      window.companion.getSenseiStatus()
    ]);
    const textReady = settings?.senseiTier !== "sensei" || Boolean(status?.connected && status?.textModel?.installed);
    const vodReady = !settings?.senseiVodEnabled || Boolean(status?.vodReady);
    return {
      ready: Boolean(settings?.senseiEnabled && textReady),
      vodMissing: Boolean(settings?.senseiEnabled && textReady && !vodReady)
    };
  } catch {
    return { ready: false, vodMissing: false };
  }
}

async function refreshSetupButton() {
  const button = document.getElementById("senseiSetupOpen");
  if (!button) return;
  const status = await senseiReadiness();
  button.textContent = status.vodMissing ? "Sensei Ready • VOD setup incomplete" : status.ready ? "Sensei Vision Ready" : "Set up Sensei on this PC";
  button.className = status.ready ? "ghost-button" : "primary-button";
}

function addSetupButton() {
  const enabled = document.getElementById("senseiEnabled");
  const host = enabled ? enabled.closest("label") || enabled.parentNode : document.getElementById("senseiSystemStatus");
  if (!host || !host.parentNode) return;
  let button = document.getElementById("senseiSetupOpen");
  if (!button) {
    button = document.createElement("button");
    button.type = "button";
    button.id = "senseiSetupOpen";
    button.className = "primary-button";
    button.textContent = "Set up Sensei on this PC";
    button.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopPropagation();
      const status = await senseiReadiness();
      if (status.ready && !status.vodMissing) return;
      showSenseiSetupModal();
    });
    host.parentNode.insertBefore(button, host.nextSibling);
  }
  refreshSetupButton();
}

function bindSenseiSetup() {
  ensureSenseiSetupModal();
  addSetupButton();
  if (!document.body.dataset.senseiSetupBound) {
    document.body.dataset.senseiSetupBound = "1";
    document.addEventListener("click", (event) => {
      if (event.target && event.target.id === "senseiSetupYes") runSenseiSetup();
      if (event.target && event.target.id === "senseiSetupNo") {
        hideSenseiSetupModal();
      }
    });
    document.addEventListener("change", (event) => {
      if (["senseiEnabled", "senseiTier", "senseiModel", "senseiVodEnabled", "senseiVodModel"].includes(event.target?.id)) refreshSetupButton();
    });
    if (window.companion?.onSenseiSetupProgress) {
      removeSenseiSetupProgress?.();
      removeSenseiSetupProgress = window.companion.onSenseiSetupProgress((progress = {}) => {
        const log = document.getElementById("senseiSetupLog");
        if (!log) return;
        if (progress.phase === "download-ollama") {
          log.textContent = Number.isFinite(progress.percent) ? `Downloading Ollama… ${progress.percent}%` : "Downloading Ollama…";
        } else if (progress.phase === "pull-model") {
          log.textContent = Number.isFinite(progress.percent)
            ? `Downloading ${progress.model}… ${progress.percent}%`
            : `Downloading ${progress.model}… ${progress.raw || "working"}`;
        } else if (progress.message) log.textContent = progress.message;
      });
    }
  }
}

document.addEventListener("DOMContentLoaded", bindSenseiSetup);
if (document.readyState !== "loading") bindSenseiSetup();
