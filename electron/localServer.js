import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';

import { ServerInstaller } from './serverInstaller.js';

const DEFAULT_PORT = 3001;
const HOST = '127.0.0.1';
const DISPLAY_HOST = 'localhost';
const HEALTH_TIMEOUT_MS = 3000;
const SERVER_START_TIMEOUT_MS = 30000;
const MAX_STARTUP_LOG_LINES = 300;
const LOCAL_SERVER_URL_ENV = 'GAJAE_APP_LOCAL_SERVER_URL';
const LOCAL_SERVER_PORT_ENV = 'GAJAE_APP_LOCAL_SERVER_PORT';

function requestJson(url, timeoutMs = HEALTH_TIMEOUT_MS) {
  return new Promise((resolve) => {
    const req = http.get(url, { timeout: timeoutMs }, (res) => {
      let body = '';

      res.setEncoding('utf8');
      res.on('data', (chunk) => {
        body += chunk;
      });
      res.on('end', () => {
        try {
          resolve({
            ok: res.statusCode >= 200 && res.statusCode < 300,
            json: JSON.parse(body),
          });
        } catch {
          resolve({ ok: false, json: null });
        }
      });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({ ok: false, json: null });
    });
    req.on('error', () => resolve({ ok: false, json: null }));
  });
}

async function isGajaeAppServer(baseUrl) {
  const response = await requestJson(`${baseUrl}/health`);
  return response.ok && response.json?.status === 'ok';
}

function isPortAvailable(port, host = HOST) {
  return new Promise((resolve) => {
    const server = net.createServer();

    server.once('error', () => resolve(false));
    server.once('listening', () => {
      server.close(() => resolve(true));
    });
    server.listen(port, host);
  });
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();

    server.once('error', reject);
    server.once('listening', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : DEFAULT_PORT;
      server.close(() => resolve(port));
    });
    server.listen(0, HOST);
  });
}

function getDesktopPath() {
  const currentPath = process.env.PATH || '';
  const home = os.homedir();
  const commonPaths = process.platform === 'win32'
    ? []
    : [
        path.join(home, '.local', 'bin'),
        path.join(home, '.bun', 'bin'),
        '/opt/homebrew/bin', '/usr/local/bin', '/usr/bin', '/bin', '/usr/sbin', '/sbin',
      ];

  return [...commonPaths, currentPath].filter(Boolean).join(path.delimiter);
}

function getNodeRuntime(usePackagedElectronRuntime) {
  if (process.env.GAJAE_APP_NODE_PATH) {
    return { command: process.env.GAJAE_APP_NODE_PATH, env: {}, label: 'GAJAE_APP_NODE_PATH' };
  }

  if (usePackagedElectronRuntime && process.versions.electron) {
    return {
      command: process.execPath,
      env: { ELECTRON_RUN_AS_NODE: '1' },
      label: `Electron ${process.versions.electron} Node ${process.versions.node}`,
    };
  }

  if (process.env.npm_node_execpath) {
    return { command: process.env.npm_node_execpath, env: {}, label: 'npm_node_execpath' };
  }

  return { command: 'node', env: {}, label: 'PATH node' };
}

function stripTrailingSlash(value) {
  return value.endsWith('/') ? value.slice(0, -1) : value;
}

function getDisplayUrl(baseUrl) {
  const parsed = new URL(baseUrl);
  if (parsed.hostname === HOST) parsed.hostname = DISPLAY_HOST;
  return stripTrailingSlash(parsed.toString());
}

function isLoopbackHost(hostname) {
  return hostname === HOST || hostname === DISPLAY_HOST || hostname === '[::1]';
}

function getConfiguredLocalUrl() {
  const rawUrl = process.env[LOCAL_SERVER_URL_ENV];
  if (rawUrl && rawUrl.trim()) {
    let parsed;
    try {
      parsed = new URL(rawUrl.trim());
    } catch {
      throw new Error(`${LOCAL_SERVER_URL_ENV} must be a valid loopback HTTP URL.`);
    }

    if (
      parsed.protocol !== 'http:'
      || !isLoopbackHost(parsed.hostname)
      || parsed.username
      || parsed.password
      || parsed.pathname !== '/'
      || parsed.search
      || parsed.hash
    ) {
      throw new Error(`${LOCAL_SERVER_URL_ENV} must be a loopback HTTP origin without credentials or a path.`);
    }

    return stripTrailingSlash(parsed.toString());
  }

  const rawPort = process.env[LOCAL_SERVER_PORT_ENV];
  if (!rawPort) return `http://${HOST}:${DEFAULT_PORT}`;
  const port = Number.parseInt(rawPort, 10);
  if (!Number.isInteger(port) || port < 1 || port > 65535 || String(port) !== rawPort) {
    throw new Error(`${LOCAL_SERVER_PORT_ENV} must be an integer between 1 and 65535.`);
  }
  return `http://${HOST}:${port}`;
}

function getPortFromUrl(baseUrl) {
  const parsed = new URL(baseUrl);
  return parsed.port ? Number.parseInt(parsed.port, 10) : 80;
}

async function waitForGajaeAppServer(baseUrl, timeoutMs) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    if (await isGajaeAppServer(baseUrl)) return true;
    await new Promise((resolve) => setTimeout(resolve, 300));
  }

  return false;
}

export class LocalServerController {
  constructor({ appRoot, settingsPath, isPackaged = false, appVersion, onChange }) {
    this.appRoot = appRoot;
    this.settingsPath = settingsPath;
    this.isPackaged = isPackaged;
    this.appVersion = appVersion;
    this.onChange = onChange;
    this.localServerUrl = null;
    this.localServerPort = null;
    this.ownedServerProcess = null;
    this.startupLogs = [];
    this.desktopSettings = {
      keepLocalServerRunning: false,
      themeMode: 'system',
    };
  }

  getSettings() {
    return this.desktopSettings;
  }

  getLocalServerUrl() {
    return this.localServerUrl;
  }

  getShareableWebUrl() {
    return this.localServerUrl;
  }

  getHealthCheckUrl() {
    if (!this.localServerPort) return this.localServerUrl;
    return `http://${HOST}:${this.localServerPort}`;
  }

  appendStartupLog(line) {
    const text = String(line || '').trimEnd();
    if (!text) return;
    const timestamp = new Date().toLocaleTimeString();
    this.startupLogs.push(`[${timestamp}] ${text}`);
    if (this.startupLogs.length > MAX_STARTUP_LOG_LINES) {
      this.startupLogs.splice(0, this.startupLogs.length - MAX_STARTUP_LOG_LINES);
    }
    this.onChange?.();
  }

  getStartupLogs() {
    return [...this.startupLogs];
  }

  getPendingTarget() {
    let url = `http://${DISPLAY_HOST}:${DEFAULT_PORT}`;
    try {
      url = getDisplayUrl(getConfiguredLocalUrl());
    } catch {
      // The explicit Open action reports malformed configuration.
    }
    return {
      kind: 'local',
      name: 'Gajae App Local',
      url: this.localServerUrl || url,
    };
  }

  async loadDesktopSettings() {
    try {
      const raw = await fs.readFile(this.settingsPath, 'utf8');
      const stored = JSON.parse(raw);
      this.desktopSettings = {
        keepLocalServerRunning: Boolean(stored.keepLocalServerRunning),
        themeMode: stored.themeMode === 'light' || stored.themeMode === 'dark' ? stored.themeMode : 'system',
      };
    } catch {
      this.desktopSettings = {
        keepLocalServerRunning: false,
        themeMode: 'system',
      };
    }
  }

  async saveDesktopSettings(nextSettings = this.desktopSettings) {
    this.desktopSettings = {
      keepLocalServerRunning: Boolean(nextSettings.keepLocalServerRunning),
      themeMode: nextSettings.themeMode === 'light' || nextSettings.themeMode === 'dark' ? nextSettings.themeMode : 'system',
    };
    await fs.mkdir(path.dirname(this.settingsPath), { recursive: true });
    await fs.writeFile(this.settingsPath, JSON.stringify(this.desktopSettings, null, 2), 'utf8');
    this.onChange?.();
  }

  async updateDesktopSetting(key, value) {
    if (!Object.prototype.hasOwnProperty.call(this.desktopSettings, key)) {
      throw new Error(`Unknown desktop setting: ${key}`);
    }

    const nextValue = key === 'themeMode' ? value : Boolean(value);
    await this.saveDesktopSettings({ ...this.desktopSettings, [key]: nextValue });
    return {
      desktopSettings: this.desktopSettings,
    };
  }

  async resolveServerEntry() {
    const installer = new ServerInstaller({
      appRoot: this.appRoot,
      onLog: (line) => this.appendStartupLog(line),
    });
    return installer.ensureInstalled();
  }

  startLocalServer(port, serverEntry) {
    const runtime = getNodeRuntime(this.isPackaged);
    const serverCwd = this.appRoot;
    const command = `${runtime.command} ${serverEntry}`;

    this.appendStartupLog(`$ ${command}`);
    this.appendStartupLog(`runtime: ${runtime.label}`);
    this.appendStartupLog(`cwd: ${serverCwd}`);
    this.appendStartupLog(`HOST=${HOST} SERVER_PORT=${port} NODE_ENV=production`);

    this.ownedServerProcess = spawn(runtime.command, [serverEntry], {
      cwd: serverCwd,
      detached: true,
      env: {
        ...process.env,
        ...runtime.env,
        HOST,
        SERVER_PORT: String(port),
        [LOCAL_SERVER_PORT_ENV]: String(port),
        NODE_ENV: 'production',
        PATH: getDesktopPath(),
      },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });

    this.ownedServerProcess.once('error', (error) => {
      this.appendStartupLog(`failed to start process: ${error.message}`);
      this.ownedServerProcess = null;
    });

    this.ownedServerProcess.stdout?.on('data', (chunk) => {
      for (const line of String(chunk).split(/\r?\n/)) this.appendStartupLog(line);
    });

    this.ownedServerProcess.stderr?.on('data', (chunk) => {
      for (const line of String(chunk).split(/\r?\n/)) this.appendStartupLog(`stderr: ${line}`);
    });

    this.ownedServerProcess.once('exit', (code, signal) => {
      this.appendStartupLog(`process exited with code ${code ?? 'null'} and signal ${signal ?? 'null'}`);
      if (this.ownedServerProcess) {
        console.error(`Gajae App local server exited with code ${code ?? 'null'} and signal ${signal ?? 'null'}`);
      }
      this.ownedServerProcess = null;
    });
  }

  async resolveLocalServerUrl() {
    const devUrl = process.env.ELECTRON_DEV_URL;
    const configuredUrl = getConfiguredLocalUrl();
    const configuredPort = getPortFromUrl(configuredUrl);

    if (devUrl) {
      const ready = await waitForGajaeAppServer(configuredUrl, SERVER_START_TIMEOUT_MS);
      if (!ready) {
        throw new Error(`Development server did not become ready at ${getDisplayUrl(configuredUrl)}.`);
      }
      this.localServerPort = configuredPort;
      return devUrl;
    }

    // This health check is made only as part of the user-triggered Local Open
    // action. It allows a separately started loopback Gajae App server to stay
    // in charge of its own lifecycle.
    if (await isGajaeAppServer(configuredUrl)) {
      this.localServerPort = configuredPort;
      const displayUrl = getDisplayUrl(configuredUrl);
      this.appendStartupLog(`Using Gajae App Local at ${displayUrl}`);
      return displayUrl;
    }

    let port = configuredPort;
    if (!await isPortAvailable(port, HOST)) {
      if (process.env[LOCAL_SERVER_URL_ENV] || process.env[LOCAL_SERVER_PORT_ENV]) {
        throw new Error(`Gajae App Local is unavailable at ${getDisplayUrl(configuredUrl)}.`);
      }
      port = await getFreePort();
    }

    const serverEntry = await this.resolveServerEntry();
    const serverUrl = `http://${HOST}:${port}`;
    const displayUrl = `http://${DISPLAY_HOST}:${port}`;
    this.localServerPort = port;
    this.startLocalServer(port, serverEntry);

    const ready = await waitForGajaeAppServer(serverUrl, SERVER_START_TIMEOUT_MS);
    if (!ready) {
      const recentLogs = this.getStartupLogs().slice(-20).join('\n');
      await this.shutdownOwnedServer();
      this.localServerPort = null;
      throw new Error([
        `Gajae App Local did not become ready at ${displayUrl}.`,
        recentLogs ? `Recent startup output:\n${recentLogs}` : 'No startup output was captured.',
      ].join('\n\n'));
    }

    this.appendStartupLog(`Gajae App Local ready at ${displayUrl}`);
    return displayUrl;
  }

  async ensureLocalServer() {
    if (!this.localServerUrl) this.localServerUrl = await this.resolveLocalServerUrl();
    return this.localServerUrl;
  }

  async getResolvedTarget() {
    await this.ensureLocalServer();
    return {
      kind: 'local',
      name: 'Gajae App Local',
      url: this.localServerUrl,
    };
  }

  async loadLocalTarget() {
    return {
      pendingTarget: this.getPendingTarget(),
      target: await this.getResolvedTarget(),
    };
  }

  hasOwnedServer() {
    return Boolean(this.ownedServerProcess);
  }

  detachOwnedServer() {
    if (!this.ownedServerProcess) return;
    this.ownedServerProcess.unref();
    this.ownedServerProcess = null;
  }

  async shutdownOwnedServer() {
    if (!this.ownedServerProcess) return;

    const child = this.ownedServerProcess;
    this.ownedServerProcess = null;
    child.kill('SIGTERM');

    await new Promise((resolve) => {
      const timeout = setTimeout(resolve, 3000);
      child.once('exit', () => {
        clearTimeout(timeout);
        resolve();
      });
    });
  }
}

export { DEFAULT_PORT, HOST };
