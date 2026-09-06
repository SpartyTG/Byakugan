"use strict";

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
    write("Setup bridge missing. Copy preload.cjs from the Phase 18 zip.");
    return;
  }
  const includeVod = Boolean(document.getElementById("senseiSetupVod")?.checked);
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
  } catch (error) {
    write(error && error.message ? error.message : String(error));
  }
}

function addSetupButton() {
  if (document.getElementById("senseiSetupOpen")) return;
  const enabled = document.getElementById("senseiEnabled");
  const host = enabled ? enabled.closest("label") || enabled.parentNode : document.getElementById("senseiSystemStatus");
  if (!host || !host.parentNode) return;
  const button = document.createElement("button");
  button.type = "button";
  button.id = "senseiSetupOpen";
  button.className = "primary-button";
  button.textContent = "Set up Sensei on this PC";
  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    showSenseiSetupModal();
  });
  host.parentNode.insertBefore(button, host.nextSibling);
}

function bindSenseiSetup() {
  ensureSenseiSetupModal();
  addSetupButton();
  if (!document.body.dataset.senseiSetupBound) {
    document.body.dataset.senseiSetupBound = "1";
    document.addEventListener("change", (event) => {
      if (event.target && event.target.id === "senseiEnabled" && event.target.checked) {
        event.target.checked = false;
        showSenseiSetupModal();
      }
    }, true);
    document.addEventListener("click", (event) => {
      if (event.target && event.target.id === "senseiSetupYes") runSenseiSetup();
      if (event.target && event.target.id === "senseiSetupNo") {
        hideSenseiSetupModal();
        const enabled = document.getElementById("senseiEnabled");
        if (enabled) enabled.checked = false;
      }
    });
  }
}

document.addEventListener("DOMContentLoaded", bindSenseiSetup);
if (document.readyState !== "loading") bindSenseiSetup();
setInterval(addSetupButton, 1500);
