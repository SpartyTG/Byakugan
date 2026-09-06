"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const https = require("node:https");
const { spawn, spawnSync } = require("node:child_process");

const OLLAMA_SETUP_URL = "https://ollama.com/download/OllamaSetup.exe";
const TEXT_MODEL = "qwen3:8b";
const VISION_MODEL = "qwen3-vl:4b-instruct";
const MAX_REDIRECTS = 5;
const OLLAMA_DOWNLOAD_HOSTS = new Set([
  "ollama.com",
  "www.ollama.com",
  "github.com",
  "objects.githubusercontent.com",
  "release-assets.githubusercontent.com"
]);

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

function allowedInstallerUrl(value) {
  try {
    const parsed = new URL(String(value));
    return parsed.protocol === "https:" && OLLAMA_DOWNLOAD_HOSTS.has(parsed.hostname.toLowerCase());
  } catch {
    return false;
  }
}

function removeFile(filePath) {
  try { fs.unlinkSync(filePath); } catch {}
}

function downloadHttps({ url, target, onProgress, get, redirects = 0 }) {
  return new Promise((resolve, reject) => {
    if (!allowedInstallerUrl(url)) return reject(new Error("Ollama download redirected to an untrusted host."));
    const request = get(url, (response) => {
      const status = Number(response.statusCode) || 0;
      if (status >= 300 && status < 400 && response.headers.location) {
        response.resume?.();
        if (redirects >= MAX_REDIRECTS) return reject(new Error("Ollama download exceeded the redirect limit."));
        const next = new URL(response.headers.location, url).toString();
        return downloadHttps({ url: next, target, onProgress, get, redirects: redirects + 1 }).then(resolve, reject);
      }
      if (status !== 200) {
        response.resume?.();
        return reject(new Error(`Ollama download failed (${status || "no status"}).`));
      }

      const partial = `${target}.download`;
      removeFile(partial);
      const file = fs.createWriteStream(partial, { flags: "w" });
      const total = Number(response.headers["content-length"]) || 0;
      let received = 0;
      let settled = false;
      const fail = (error) => {
        if (settled) return;
        settled = true;
        file.destroy();
        removeFile(partial);
        reject(error);
      };
      response.on("data", (chunk) => {
        received += chunk.length;
        onProgress({
          phase: "download-ollama",
          received,
          total,
          percent: total ? Math.round((received / total) * 100) : null
        });
      });
      response.on("error", fail);
      response.on("aborted", () => fail(new Error("The Ollama download was interrupted.")));
      file.on("error", fail);
      file.on("close", () => {
        if (settled) return;
        try {
          const signature = fs.readFileSync(partial).subarray(0, 2).toString("ascii");
          if (signature !== "MZ") throw new Error("The downloaded Ollama installer is not a valid Windows executable.");
          removeFile(target);
          fs.renameSync(partial, target);
          settled = true;
          resolve(target);
        } catch (error) {
          fail(error);
        }
      });
      response.pipe(file);
    });
    request.on("error", reject);
  });
}

class SenseiSetupService {
  constructor({ userData, setupUrl = OLLAMA_SETUP_URL, httpsGet = https.get, resolveOllamaBinary = resolveOllama, spawnProcess = spawn } = {}) {
    this.userData = userData || path.join(os.tmpdir(), "byakugan-sensei-setup");
    this.setupUrl = setupUrl;
    this.httpsGet = httpsGet;
    this.resolveOllama = resolveOllamaBinary;
    this.spawn = spawnProcess;
    this.busy = false;
  }

  status() {
    const binary = this.resolveOllama();
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
    removeFile(`${target}.download`);
    return downloadHttps({ url: this.setupUrl, target, onProgress, get: this.httpsGet });
  }

  async installOllama(onProgress = () => {}) {
    if (this.busy) throw new Error("Sensei setup is already running.");
    const existing = this.resolveOllama();
    if (existing) return { ok: true, ollamaPath: existing, alreadyInstalled: true };
    this.busy = true;
    try {
      onProgress({ phase: "download-ollama", message: "Downloading the official Ollama installer." });
      const installer = await this.downloadInstaller(onProgress);
      onProgress({ phase: "install-ollama", message: "Starting OllamaSetup.exe. Accept the official installer if Windows asks." });
      try {
        await new Promise((resolve, reject) => {
          const child = this.spawn(installer, ["/VERYSILENT", "/NORESTART"], { windowsHide: false, detached: false });
          child.on("error", reject);
          child.on("exit", (code) => {
            if (code === 0 || code === null) resolve();
            else reject(new Error(`Ollama installer exited with code ${code}.`));
          });
        });
      } finally {
        removeFile(installer);
      }
      const installed = this.resolveOllama();
      if (!installed) throw new Error("Ollama installed, but BYAKUGAN cannot see ollama.exe yet. Sign out or reboot, then click Retry.");
      return { ok: true, ollamaPath: installed, alreadyInstalled: false };
    } finally {
      this.busy = false;
    }
  }

  async pullModel(model, onProgress = () => {}) {
    if (this.busy) throw new Error("Sensei setup is already running.");
    const binary = this.resolveOllama();
    if (!binary) throw new Error("Install Ollama first.");
    const name = String(model || "").trim();
    if (!name) throw new Error("No model name was provided.");
    this.busy = true;
    try {
      return await new Promise((resolve, reject) => {
        const child = this.spawn(binary, ["pull", name], { windowsHide: true });
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
    } finally {
      this.busy = false;
    }
  }
}

module.exports = {
  TEXT_MODEL,
  VISION_MODEL,
  OLLAMA_SETUP_URL,
  allowedInstallerUrl,
  downloadHttps,
  parsePullProgress,
  SenseiSetupService,
  resolveOllama
};
