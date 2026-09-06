"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const https = require("node:https");
const { spawn, spawnSync } = require("node:child_process");

const OLLAMA_SETUP_URL = "https://ollama.com/download/OllamaSetup.exe";
const TEXT_MODEL = "qwen3:8b";
const VISION_MODEL = "qwen3-vl:4b-instruct";

function ollamaCandidates() {
  const home = os.homedir();
  const local = process.env.LOCALAPPDATA || path.join(home, "AppData", "Local");
  return [
    "ollama",
    path.join(local, "Programs", "Ollama", "ollama.exe"),
    path.join(home, "AppData", "Local", "Programs", "Ollama", "ollama.exe")
  ];
}

function resolveOllama() {
  for (const candidate of ollamaCandidates()) {
    try {
      const result = spawnSync(candidate, ["-v"], { encoding: "utf8", windowsHide: true, timeout: 8_000 });
      if (result.status === 0 || String(result.stdout || result.stderr || "").toLowerCase().includes("ollama")) {
        return candidate;
      }
    } catch {}
  }
  return "";
}

function parsePullProgress(chunk) {
  const text = String(chunk || "");
  const percent = text.match(/(\d{1,3})\s*%/);
  return {
    raw: text.trim().slice(-240),
    percent: percent ? Math.min(100, Number(percent[1])) : null
  };
}

class SenseiSetupService {
  constructor({ userData } = {}) {
    this.userData = userData || path.join(os.tmpdir(), "byakugan-sensei-setup");
    this.busy = false;
  }

  status() {
    const binary = resolveOllama();
    return {
      ollamaPath: binary,
      ollamaInstalled: Boolean(binary),
      textModel: TEXT_MODEL,
      visionModel: VISION_MODEL,
      busy: this.busy
    };
  }

  downloadInstaller(onProgress = () => {}) {
    fs.mkdirSync(this.userData, { recursive: true });
    const target = path.join(this.userData, "OllamaSetup.exe");
    return new Promise((resolve, reject) => {
      const file = fs.createWriteStream(target);
      const request = https.get(OLLAMA_SETUP_URL, (response) => {
        const final = response.statusCode >= 300 && response.statusCode < 400 && response.headers.location
          ? response.headers.location
          : null;
        if (final) {
          file.close();
          try { fs.unlinkSync(target); } catch {}
          return https.get(final, (redirected) => pipe(redirected)).on("error", reject);
        }
        return pipe(response);
      });
      function pipe(response) {
        if (response.statusCode !== 200) {
          file.close();
          return reject(new Error(`Ollama download failed (${response.statusCode}).`));
        }
        const total = Number(response.headers["content-length"]) || 0;
        let received = 0;
        response.on("data", (chunk) => {
          received += chunk.length;
          onProgress({
            phase: "download-ollama",
            received,
            total,
            percent: total ? Math.round((received / total) * 100) : null
          });
        });
        response.pipe(file);
        file.on("finish", () => file.close(() => resolve(target)));
      }
      request.on("error", (error) => {
        file.close();
        reject(error);
      });
    });
  }

  async installOllama(onProgress = () => {}) {
    if (this.busy) throw new Error("Sensei setup is already running.");
    const existing = resolveOllama();
    if (existing) return { ok: true, ollamaPath: existing, alreadyInstalled: true };
    this.busy = true;
    try {
      onProgress({ phase: "download-ollama", message: "Downloading the official Ollama installer." });
      const installer = await this.downloadInstaller(onProgress);
      onProgress({ phase: "install-ollama", message: "Starting OllamaSetup.exe. Accept the official installer if Windows asks." });
      await new Promise((resolve, reject) => {
        const child = spawn(installer, ["/VERYSILENT", "/NORESTART"], { windowsHide: false, detached: false });
        child.on("error", reject);
        child.on("exit", (code) => {
          if (code === 0 || code === null) resolve();
          else reject(new Error(`Ollama installer exited with code ${code}.`));
        });
      });
      const installed = resolveOllama();
      if (!installed) throw new Error("Ollama installed, but BYAKUGAN cannot see ollama.exe yet. Sign out or reboot, then click Retry.");
      return { ok: true, ollamaPath: installed, alreadyInstalled: false };
    } finally {
      this.busy = false;
    }
  }

  pullModel(model, onProgress = () => {}) {
    const binary = resolveOllama();
    if (!binary) throw new Error("Install Ollama first.");
    const name = String(model || "").trim();
    if (!name) throw new Error("No model name was provided.");
    return new Promise((resolve, reject) => {
      const child = spawn(binary, ["pull", name], { windowsHide: true });
      let log = "";
      child.stdout.on("data", (chunk) => {
        log += chunk;
        onProgress({ phase: "pull-model", model: name, ...parsePullProgress(chunk) });
      });
      child.stderr.on("data", (chunk) => {
        log += chunk;
        onProgress({ phase: "pull-model", model: name, ...parsePullProgress(chunk) });
      });
      child.on("error", reject);
      child.on("exit", (code) => {
        if (code === 0) resolve({ ok: true, model: name });
        else reject(new Error(`ollama pull ${name} failed.\n${log.slice(-600)}`));
      });
    });
  }
}

module.exports = {
  TEXT_MODEL,
  VISION_MODEL,
  OLLAMA_SETUP_URL,
  SenseiSetupService,
  resolveOllama
};
