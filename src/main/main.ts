import log from 'electron-log';
function initLogging(resolvedLogDir: string) {
  const dropNoisyMdns = format((info) => {
    if (process.env.NODE_ENV !== 'development') {
      if (info.event === 'mdns.upsert' && info.changed !== true) return false;
      if (info.event === 'mdns.response') return false;
    }
    return info;
  });

  jsonLogger = createLogger({
    level: 'info',
    format: format.combine(
      format.timestamp(),
      format((info) => {
        if (typeof info.message === 'string' &&
          info.message.includes('Warning: Setting the NODE_TLS_REJECT_UNAUTHORIZED')) return false;
        return info;
      })(),
      format.json()
    ),
    
    transports: [
      new DailyRotateFile({
        dirname: resolvedLogDir,
        filename: '45studio-share-client-%DATE%.json',
        datePattern: 'YYYY-MM-DD',
        maxFiles: '14d',
        zippedArchive: true,
        level: 'info',
        format: format.combine(dropNoisyMdns(), format.json())
      })
    ]
  });

 const originalConsole = {
  log: console.log,
  info: console.info,
  warn: console.warn,
  error: console.error,
  debug: console.debug,
};

const dual = (lvl: 'info' | 'warn' | 'error' | 'debug') =>
  (...args: any[]) => {
    const msg = args.map(String).join(' ');
    // write to JSON log only
    (jsonLogger as any)[lvl]({ message: msg });
    // optionally still mirror to terminal during dev
    if (process.env.NODE_ENV === 'development') {
      (originalConsole as any)[lvl](...args);
    }
  };

  console.log = dual('info');
  console.info = dual('info');
  console.warn = dual('warn');
  console.error = dual('error');
  console.debug = dual('debug');

  process.on('uncaughtException', (err) => {
    // log.error('Uncaught Exception:', err);
    jsonLogger.error({ event: 'uncaughtException', error: err.stack || err.message });
  });
  process.on('unhandledRejection', (reason, promise) => {
    // log.error('Unhandled Rejection at:', promise, 'reason:', reason);
    jsonLogger.error({ event: 'unhandledRejection', reason: String(reason) });
  });
  jl('info', 'logging.init.wired', {
    filePath: (log.transports.file as any).getFile().path
  });
}

// requires yarn add electron-updater (not added/implmemented yet)
// import { autoUpdater } from 'electron-updater';
import { app, BrowserWindow, ipcMain, dialog, shell, session } from 'electron';
import { createLogger, format } from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import path, { join } from 'path';
import mdns from 'multicast-dns';
import os from 'os';
import fs from 'fs';
import net from 'net';
import { Server } from './types';
import { IPCRouter } from '../../houston-common/houston-common-lib/lib/electronIPC/IPCRouter';
import { getOS } from './utils';
import { v4 as uuidv4 } from 'uuid';
import { getAgentSocket, getKeyDir, ensureKeyPair, regeneratePemKeyPair } from './crossPlatformSsh';
import { connectWithKey, connectWithPassword, setupSshKey } from './setupSsh'; 
import { server, unwrap } from '@45drives/houston-common-lib';
import { installServerDepsRemotely } from './installServerDeps';
import { checkSSH } from './setupSsh';
import { getPin, rememberPin } from './certPins'
import { ChildProcessWithoutNullStreams } from 'node:child_process'
import { NodeSSH } from 'node-ssh';
import { buildRsyncCmdAndArgs } from './transfers/rsync-path';
import { runRsync } from './transfers/rsync-runner';
import { runWinSftp } from './transfers/win-file-sftp';

let discoveredServers: Server[] = [];
export let jsonLogger: ReturnType<typeof createLogger>;
export function jl(level: 'info' | 'warn' | 'error' | 'debug', event: string, extra: Record<string, any> = {}) {
  try { (jsonLogger as any)[level]({ event, ...extra }); } catch {}
}

// ===== EventSource + SSE (Electron main) =====================================
// Requires: yarn add eventsource@^2
import EventSource from 'eventsource';

// Minimal event typings for our usage
type ESMessageEvent = { data: string };
type ESLike = {
  addEventListener(type: string, listener: (ev: ESMessageEvent) => void): void;
  close(): void;
  onerror?: (err: any) => void;
  onopen?: () => void;
  onmessage?: (ev: ESMessageEvent) => void;
};

// Track live SSE connections per IP
const setupStreams = new Map<string, ESLike>();

type SseState = {
  inFlight: boolean;      // we're currently attempting an attach
  nextAt: number;         // do not attempt before this timestamp
  backoffMs: number;      // current backoff window
  mutedUntil404: number;  // if a 404 was seen, mute + skip until this time
  lastErr?: string;       // last error label for diagnostics
};
const sseState = new Map<string, SseState>();

// Base backoff for reconnects
let sseBackoffMs = 2000;

function st(ip: string): SseState {
  const now = Date.now();
  const s = sseState.get(ip) || {
    inFlight: false,
    nextAt: 0,
    backoffMs: sseBackoffMs,
    mutedUntil404: 0,
    lastErr: undefined,
  };
  // ensure structure and store
  sseState.set(ip, s);
  return s;
}

export function attachSetupSSE(ip: string, seedDelayMs = 0) {
  // Schedule an attempt (optionally delayed); actual attach happens in tryAttach()
  const s = st(ip);
  const now = Date.now();
  s.nextAt = Math.max(s.nextAt, now + seedDelayMs);
  tryAttach(ip);
}

async function tryAttach(ip: string) {
  const s = st(ip);
  const now = Date.now();

  // Already connected?
  if (setupStreams.has(ip)) return;

  // Currently trying?
  if (s.inFlight) return;

  // Respect cooldown
  if (now < s.nextAt) return;

  // Respect 404 mute period
  if (now < s.mutedUntil404) {
    // muted; don't log every time
    return;
  }

  s.inFlight = true;
  jl('info', 'sse.attach.attempt', { ip });

  // Preflight to avoid EventSource 404 floods
  const pf = await preflightSetupStatus(ip);
  if (pf.code === 404) {
    // Mute repeated 404s for a while, and push next attempt out
    const muteMs = 10 * 60 * 1000; // 10 minutes
    s.mutedUntil404 = now + muteMs;
    s.backoffMs = Math.min(Math.max(s.backoffMs * 2, 5000), 30000);
    s.nextAt = now + s.backoffMs;

    // Log once per mute window
    jl('warn', 'sse.preflight.404', { ip, muteMs, nextIn: s.backoffMs });
    s.inFlight = false;
    return;
  }

  if (pf.ok === false && pf.code !== 200) {
    // Network or non-200/404—use backoff but no mute
    s.backoffMs = Math.min(s.backoffMs * 2, 30000);
    s.nextAt = now + s.backoffMs;
    jl('warn', 'sse.preflight.fail', { ip, code: pf.code, nextIn: s.backoffMs });
    s.inFlight = false;
    return;
  }

  // Passed preflight → open EventSource
  const url = `http://${ip}:9095/setup-status/stream`;
  jl('debug', 'sse.attach.url', { ip, url });

  let es: ESLike | undefined;
  try {
    es = new (EventSource as any)(url) as ESLike;
  } catch (e: any) {
    s.lastErr = e?.message || String(e);
    jl('warn', 'sse.construct.error', { ip, error: s.lastErr });

    s.backoffMs = Math.min(s.backoffMs * 2, 30000);
    s.nextAt = Date.now() + s.backoffMs;
    s.inFlight = false;
    // schedule a later retry
    setTimeout(() => tryAttach(ip), s.backoffMs);
    return;
  }

  es.onopen = () => {
    s.backoffMs = 2000;      // reset backoff on healthy traffic
    s.inFlight = false;
    setupStreams.set(ip, es!);
    jl('info', 'sse.open', { ip, url });
  };

  es.addEventListener('status', (ev: ESMessageEvent) => {
    try {
      s.backoffMs = 2000; // healthy traffic resets backoff
      const payload = JSON.parse(String(ev.data) || '{}');
      const status = payload?.status ?? 'unknown';
      BrowserWindow.getAllWindows()[0]?.webContents.send('discovered-servers-status', {
        ip, status, ts: Date.now(),
      });
      jl('debug', 'sse.status', { ip, status });
    } catch (e: any) {
      jl('warn', 'sse.status.parse-error', { ip, error: e?.message || String(e) });
    }
  });

  es.onerror = (err: any) => {
    // Tear down stream and schedule a backoff’ed retry
    try { es?.close(); } catch {}
    setupStreams.delete(ip);

    // We cannot reliably get HTTP status from EventSource errors.
    // We rely on preflight to catch 404s before we open.
    s.lastErr = err && (err.message || String(err));
    jl('warn', 'sse.error', { ip, error: s.lastErr });

    s.backoffMs = Math.min(s.backoffMs * 2, 30000);
    s.nextAt = Date.now() + s.backoffMs;
    s.inFlight = false;

    // schedule a retry
    setTimeout(() => tryAttach(ip), s.backoffMs);
    jl('info', 'sse.reconnect.schedule', { ip, delay: s.backoffMs });
  };
}


export function detachSetupSSE(ip: string) {
  jl('info', 'sse.detach', { ip });
  const es = setupStreams.get(ip);
  if (es) {
    try { es.close(); } catch {}
    setupStreams.delete(ip);
  }
  // Optional: also clear inFlight to allow immediate reattach if caller wants
  const s = sseState.get(ip);
  if (s) s.inFlight = false;
}


// Stop and clear all streams (e.g., during app shutdown or rescan)
export function detachAllSetupSSE() {
  jl('info', 'sse.detach.all');

  for (const es of setupStreams.values()) {
    try { es.close(); } catch { }
  }
  setupStreams.clear();
}

async function preflightSetupStatus(ip: string): Promise<{ ok: boolean; code?: number }> {
  const url = `http://${ip}:9095/setup-status`;
  try {
    const r = await fetch(url, { method: 'GET', cache: 'no-store', signal: AbortSignal.timeout(2500) });
    return { ok: r.ok, code: r.status };
  } catch (e: any) {
    return { ok: false };
  }
}

const mdnsLastSigByIp = new Map<string, string>();
const mdnsLastLogAt = new Map<string, number>();
const MDNS_MIN_INTERVAL_MS = 60_000; // at most once/min per IP when nothing changes
function mdnsSignature(txt: Record<string,string>, ip: string, displayName: string) {
  // stable signature of what we care about
  const keys = Object.keys(txt).sort();
  const body = keys.map(k => `${k}=${txt[k]}`).join('&');
  return `${ip}|${displayName}|${body}`;
}

// Helper to connect via agent or password-planted key
async function connectForPreflight(host: string, username: string, password: string, port = 22) {
  const agentSock = getAgentSocket();
  // Try agent
  if (agentSock) {
    const trial = new NodeSSH();
    try {
      await trial.connect({ host, username, agent: agentSock, port, tryKeyboard: false, readyTimeout: 20000 });
      return trial;
    } catch { trial.dispose(); }
  }

  // Try password → plant key → reconnect with key
  const planted = await connectWithPassword({ host, username, password, port });
  try { planted.dispose(); } catch { }

  const keyDir = getKeyDir();
  const priv = path.join(keyDir, 'id_ed25519');
  await ensureKeyPair(priv, `${priv}.pub`);
  try {
    return await connectWithKey({ host, username, privateKey: priv, agent: agentSock || undefined, port });
  } catch (e: any) {
    const m = String(e?.message || e);
    if (/unsupported key format/i.test(m)) {
      await regeneratePemKeyPair(priv);
      return await connectWithKey({ host, username, privateKey: priv, agent: agentSock || undefined, port });
    }
    throw e;
  }
}

function isOwnedByCurrentUser(filePath: string): boolean {
  try {
    const st = fs.statSync(filePath);

    // On Unix / macOS, enforce ownership
    if (typeof process.getuid === 'function') {
      const uid = process.getuid();
      if (st.uid !== uid) {
        return false;
      }
    }

    // Also ensure we can read it (defensive)
    fs.accessSync(filePath, fs.constants.R_OK);
    return true;
  } catch {
    // stat/access failed, treat as not allowed
    return false;
  }
}

function defaultClientKey(): string | undefined {
  try {
    const dir = getKeyDir();
    const ed = path.join(dir, 'id_ed25519');
    const rs = path.join(dir, 'id_rsa');
    if (fs.existsSync(ed)) return ed;
    if (fs.existsSync(rs)) return rs;
    return undefined;
  } catch { return undefined; }
}


ipcMain.handle('remote-check-broadcaster', async (_event, { host, username, password, sshPort }) => {
  const port = sshPort ?? 22;
  jl('info', 'ipc.remote-check-broadcaster.start', { host, username: !!username ? 'provided' : 'empty', port });

  let ssh: NodeSSH | null = null;
  try {
    ssh = await connectForPreflight(host, username, password, port);

    // Single portable script: checks pkg presence, unit presence/active, legacy presence/active, API health
    const script = `
set -euo pipefail

bool() { [ "$1" -eq 0 ] && echo true || echo false; }

is_rpm(){ command -v rpm >/dev/null 2>&1; }
is_dpkg(){ command -v dpkg >/dev/null 2>&1; }

pkg_installed=1
if is_rpm; then
  rpm -q houston-broadcaster >/dev/null 2>&1 && pkg_installed=0 || true
elif is_dpkg; then
  dpkg -s houston-broadcaster >/dev/null 2>&1 && pkg_installed=0 || true
fi

systemctl --version >/dev/null 2>&1 || { echo '{"hasPackage":false,"servicePresent":false,"serviceActive":false,"legacyPresent":false,"legacyActive":false,"apiHealthy":false}'; exit 0; }

systemctl status houston-broadcaster >/dev/null 2>&1; svc_present=$?
systemctl is-active --quiet houston-broadcaster >/dev/null 2>&1; svc_active=$? || true

systemctl status houston-broadcaster-legacy >/dev/null 2>&1; legacy_present=$? || true
systemctl is-active --quiet houston-broadcaster-legacy >/dev/null 2>&1; legacy_active=$? || true

apiHealthy=1
for i in {1..2}; do
  curl -fsS --max-time 2 http://127.0.0.1:9095/healthz >/dev/null 2>&1 && { apiHealthy=0; break; }
  sleep 1
done

printf '{"hasPackage":%s,"servicePresent":%s,"serviceActive":%s,"legacyPresent":%s,"legacyActive":%s,"apiHealthy":%s}\\n' \
  "$(bool $pkg_installed)" \
  "$(bool $svc_present)" \
  "$(bool $svc_active)" \
  "$(bool $legacy_present)" \
  "$(bool $legacy_active)" \
  "$(bool $apiHealthy)"
`.trim();

    const res = await ssh.execCommand(`bash -lc '${script.replace(/'/g, `'\"'\"'`)}'`);
    if ((res.code ?? 0) !== 0) throw new Error(res.stderr || res.stdout || 'preflight failed');
    // JSON parse in main so renderer doesn’t need to trust shell text
    let parsed: any = {};
    try { parsed = JSON.parse(res.stdout.trim()); } catch { }
    jl('info', 'ipc.remote-check-broadcaster.ok', { host, result: parsed });

    return parsed;
  } catch (e: any) {
    jsonLogger.warn({ event: 'remote-check-broadcaster.error', host, error: e?.message || String(e) });
    jl('error', 'ipc.remote-check-broadcaster.error', { host, error: e?.message || String(e) });

    throw e;
  } finally {
    try { ssh?.dispose(); } catch { }
  }
});

ipcMain.handle('probe-health', async (_e, { ip, port }) => {
  jl('info', 'ipc.probe-health.start', { ip, port });

  try {
    const r = await fetch(`http://${ip}:${port}/healthz`, { signal: AbortSignal.timeout(3000) });
    jl('info', 'ipc.probe-health.ok', { ip, port, status: r.status, ok: r.ok });

    return { ok: r.ok, status: r.status };
  } catch (err: any) {
    jl('warn', 'ipc.probe-health.error', { ip, port, error: err?.message || String(err) });

    return { ok: false, error: err?.message || String(err) };
  }
});

ipcMain.handle('ensure-ssh-ready', async (_e, { host, username, password, sshPort }) => {
  const port = sshPort ?? 22;
  const keyDir = getKeyDir();
  const edPriv = path.join(keyDir, 'id_ed25519');
  const edPub = `${edPriv}.pub`;
  const rsaPriv = path.join(keyDir, 'id_rsa');
  const rsaPub = `${rsaPriv}.pub`;

  jl('info', 'ensure-ssh-ready.start', {
    host, username, hasPassword: !!password, keyDir, port,
  });

  try {
    // 0) ensure we have an ed25519 pair on disk
    await ensureKeyPair(edPriv, edPub);

    const agentSock = getAgentSocket();

    // 1) Try agent first
    if (agentSock) {
      jl('info', 'ensure-ssh-ready.agent.try', { agentSock, port });
      const trial = new NodeSSH();
      try {
        await trial.connect({ host, username, agent: agentSock, port, tryKeyboard: false, readyTimeout: 20_000 });
        jl('info', 'ensure-ssh-ready.agent.ok', { host, username });

        // Even if agent works, plant our app key idempotently so future non-agent ops work
        if (password) {
          await setupSshKey(host, username, password, edPub, undefined, port);
          jl('info', 'ensure-ssh-ready.plant.after-agent', { pub: edPub });
        }

        try { trial.dispose(); } catch { }
        return { ok: true, keyPath: edPriv, via: 'agent(+planted-ed25519)' };
      } catch (e: any) {
        jl('warn', 'ensure-ssh-ready.agent.fail', { error: e?.message || String(e) });
        try { trial.dispose(); } catch { }
      }
    }

    // 2) No agent or agent failed → plant ed25519 using password
    if (!password) {
      const msg = 'No SSH agent and no password provided for initial key install.';
      jl('warn', 'ensure-ssh-ready.no-creds', { host, username });
      return { ok: false, error: msg };
    }

    await setupSshKey(host, username, password, edPub, undefined, port);
    jl('info', 'ensure-ssh-ready.plant.ed25519.ok', { pub: edPub });

    // 3) Verify with ed25519 file key
    const verify = new NodeSSH();
    try {
      await verify.connect({
        host, username,
        privateKey: fs.readFileSync(edPriv, 'utf8'),
        port,
        tryKeyboard: false,
        readyTimeout: 20_000,
      });
      jl('info', 'ensure-ssh-ready.verify.ok', { algo: 'ed25519' });
      try { verify.dispose(); } catch { }
      return { ok: true, keyPath: edPriv, via: 'password+ed25519' };
    } catch (e: any) {
      const msg = String(e?.message || e);
      jl('warn', 'ensure-ssh-ready.verify.ed25519.fail', { error: msg });

      // 4) Fallback once: generate RSA at the *RSA* filename
      jl('info', 'ensure-ssh-ready.rsa.fallback.begin', { rsaPriv });
      await regeneratePemKeyPair(rsaPriv);          // writes rsaPriv and rsaPriv.pub
      await setupSshKey(host, username, password, rsaPub, undefined, port);
      jl('info', 'ensure-ssh-ready.rsa.plant.ok', { pub: rsaPub });

      // Retry with RSA
      try {
        await verify.connect({
          host, username,
          privateKey: fs.readFileSync(rsaPriv, 'utf8'),
          port,
          tryKeyboard: false,
          readyTimeout: 20_000,
        });
        jl('info', 'ensure-ssh-ready.verify.ok', { algo: 'rsa-4096-pem' });
        try { verify.dispose(); } catch { }
        return { ok: true, keyPath: rsaPriv, via: 'password+rsa' };
      } catch (e2: any) {
        const msg2 = String(e2?.message || e2);
        jl('error', 'ensure-ssh-ready.verify.rsa.fail', { error: msg2 });
        try { verify.dispose(); } catch { }
        return { ok: false, error: msg2 };
      }
    }
  } catch (err: any) {
    const error = err?.message || String(err);
    jl('warn', 'ensure-ssh-ready.failed', { host, username, error });
    return { ok: false, error };
  }
});

const idFile = path.join(app.getPath('userData'), 'client-id.txt');
let installId = fs.existsSync(idFile) ? fs.readFileSync(idFile, 'utf-8').trim() : '';
if (!installId) { installId = uuidv4(); fs.writeFileSync(idFile, installId, 'utf-8'); }

const clientIdent = { installId };

ipcMain.on('renderer-ready', (e) => {
  e.sender.send('client-ident', clientIdent);
    jl('info', 'renderer.ready');

});

ipcMain.handle('get-client-ident', async () => ({ installId }))

function checkLogDir(): string {
  // LINUX: /home/<username>/.config/45studio-filesharing-app/logs       (IN DEV MODE: /home/<username>/config/Electron/logs/)
  // MAC:   /Users/<username>/Library/Application Support/45studio-filesharing-app/logs
  // WIN:   C:\Users\<username>\AppData\Roaming\45studio-filesharing-app\logs
  const baseLogDir = path.join(app.getPath('userData'), 'logs');
  try {
    if (!fs.existsSync(baseLogDir)) {
      fs.mkdirSync(baseLogDir, { recursive: true });
    }
    console.debug(` Log directory ensured: ${baseLogDir}`);
    jl('info', 'logs.dir.ensure.ok', { dir: baseLogDir });

  } catch (e: any) {
    console.error(` Failed to create log directory (${baseLogDir}):`, e.message);
    jl('error', 'logs.dir.ensure.error', { dir: baseLogDir, error: e?.message || String(e) });
  }
  return baseLogDir;
}

function isPortOpen(ip: string, port: number, timeout = 2000): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(timeout);

    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });

    socket.once('timeout', () => {
      socket.destroy();
      resolve(false);
    });

    socket.once('error', () => {
      socket.destroy();
      resolve(false);
    });

    socket.connect(port, ip);
  });
}

// Timeout duration in milliseconds (e.g., 30 seconds)
const TIMEOUT_DURATION = 30000;
const serviceType = '_houstonserver._tcp.local';

const getLocalIP = () => {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    const something = nets[name];
    if (something) {
      for (const net of something) {
        if (net.family === "IPv4" && !net.internal && net.address.startsWith("192")) {
          return net.address;
        }
      }
    }
  }
  return "127.0.0.1"; // Fallback
};


function getSubnetBase(ip: string): string {
  const parts = ip.split('.');
  return `${parts[0]}.${parts[1]}.${parts[2]}`;
}


function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      sandbox: false,
      preload: join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      webviewTag: true,
      javascript: true,
      backgroundThrottling: false,  // Disable throttling
      webSecurity: true,                  // Enforces origin security
      allowRunningInsecureContent: false, // Prevents HTTP inside HTTPS
    }
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      shell.openExternal(url); // Opens in the user's default browser
    }

    return { action: 'deny' }; // Prevent Electron from opening a new window
  });

  async function doFallbackScan(): Promise<Server[]> {
    
    const ip = getLocalIP();
    const subnet = getSubnetBase(ip);
    jl('info', 'fallback.scan.start', { subnet, localIP: ip });

    const ips = Array
      .from({ length: 256 }, (_, i) => `${subnet}.${i}`)
      .filter(candidate => candidate !== ip);

    const scanned = await Promise.allSettled(
      ips.map(async candidateIp => {

        // console.debug("checking for server at ", candidateIp);

        const portOpen = await isPortOpen(candidateIp, 9090);
        if (!portOpen) return null;
        console.debug("port open at 9090 ", candidateIp);
        jl('info', 'fallback.scan.start', { subnet, localIP: ip });

        try {
          const res = await fetch(`https://${candidateIp}:9090/`, {
            method: 'GET',
            cache: 'no-store',
            signal: AbortSignal.timeout(3000),
            
          });
          if (!res.ok) return null;

          console.debug("https at 9090 ", candidateIp);
          jl('debug', 'fallback.scan.https-ok', { ip: candidateIp });
          jl('info', 'fallback.scan.done', { found: fallbackServers.length });

          return {
            ip: candidateIp,
            name: candidateIp,
            status: 'unknown',
            setupComplete: false,
            serverName: candidateIp,
            shareName: '',
            setupTime: '',
            serverInfo: {
              moboMake: '',
              moboModel: '',
              serverModel: '',
              aliasStyle: '',
              chassisSize: '',
            },
            lastSeen: Date.now(),
            fallbackAdded: true
          } as Server;

        } catch {
          return null;
        }
      })
    );

    const fallbackServers = scanned
      .map(r => r.status === 'fulfilled' ? r.value : null)
      .filter((s): s is Server => s !== null);

    if (fallbackServers.length) {
      discoveredServers = fallbackServers;
      mainWindow.webContents.send('discovered-servers', discoveredServers);
    }

    return fallbackServers;
  }

  IPCRouter.initBackend(mainWindow.webContents, ipcMain);

  let rendererIsReady = false;
  let bufferedNotifications: string[] = [];

  ipcMain.on('renderer-ready', (e) => {
    if (rendererIsReady) return;          // guard
    rendererIsReady = true;
    bufferedNotifications.forEach(msg => e.sender.send('notification', msg));
    bufferedNotifications = [];
  });


  ipcMain.on('log:info', (_e, payload) => {
    jsonLogger.info(payload);
    // log.info(payload.event, payload.data);
  });
  ipcMain.on('log:warn', (_e, payload) => {
    jsonLogger.warn(payload);
    // log.warn(payload.event, payload.data);
  });
  ipcMain.on('log:error', (_e, payload) => {
    jsonLogger.error(payload);
    // log.error(payload.event, payload.data);
  });

  ipcMain.handle('run-remote-bootstrap', async (event, { host, username, password, id, sshPort, bcastPort, httpsPort }) => {
    const port = sshPort ?? 22;
    jl('info', 'ipc.run-remote-bootstrap.start', { host, username, id, port, bcastPort, httpsPort });

    const send = (label: string, step?: string) =>
      event.sender.send('bootstrap-progress', { id, ts: Date.now(), step, label });

    try {
      const res = await installServerDepsRemotely({
        host,
        username,
        password,
        sshPort: port,
        bcastPort,
        httpsPort,
        onProgress: ({ step, label }: any) => send(label, step),
      });

      send(res.success ? 'Bootstrap complete.' : 'Bootstrap failed.', res.success ? 'done' : 'error');
      jl('info', 'ipc.run-remote-bootstrap.done', { host, id, success: !!res?.success });

      return res;
    } catch (err: any) {
      send('Bootstrap failed.', 'error');
      jl('error', 'ipc.run-remote-bootstrap.error', { host, id, error: err?.message || String(err) });

      return { success: false, error: err?.message || String(err) };
    }
  });

  
  ipcMain.handle('get-os', () => {
    const os = getOS();
    jl('debug', `ipc.get-os: ${os}`);
    return os;
  });
  
  ipcMain.handle('scan-network-fallback', async () => {
    jl('info', 'ipc.scan-network-fallback.start');

    const res = await doFallbackScan();
    jl('info', 'ipc.scan-network-fallback.done', { count: (res || []).length });
    return res;
  });


  function notify(message: string) {
    if (!mainWindow || mainWindow.webContents?.isDestroyed()) return;

    mainWindow.webContents.send("notification", message);

    try {
      IPCRouter.getInstance().send(
        'renderer', 'action',
        JSON.stringify({ type: 'notification', message })
        
      );
    } catch { }
    jl('info', 'notify.push', { message, buffered: !rendererIsReady });

    if (!rendererIsReady) bufferedNotifications.push(message);
  }


  IPCRouter.getInstance().addEventListener('action', async (data) => {
  jl('debug', 'ipcrouter.action.received', { data: String(data).slice(0, 200) });

    if (data === "requestHostname") {
          jl('debug', 'ipcrouter.action.requestHostname');

      IPCRouter.getInstance().send('renderer', 'action', JSON.stringify({
        type: "sendHostname",
        hostname: await unwrap(server.getHostname())
      }));
    } else if (data === "show_dashboard") {
          jl('debug', 'ipcrouter.action.show_dashboard');

      IPCRouter.getInstance().send('renderer', 'action', 'show_dashboard');
    }
    else {
      try {
        const message = JSON.parse(data);
              jl('debug', 'ipcrouter.action.parsed', { type: message?.type });

        if (message.type === 'addManualIP') {
                  
          const { ip, manuallyAdded } = message as { ip: string; manuallyAdded?: boolean };
          jl('info', 'ipcrouter.addManualIP.start', { ip });

          // 1) Try Cockpit’s HTTPS on 9090, but DON’T let a throw skip the SSH probe
          let httpsReachable = false;
          try {
            const res = await fetch(`https://${ip}:9090/`, {
              method: 'GET',
              cache: 'no-store',
              signal: AbortSignal.timeout(3000),
            });
            httpsReachable = res.ok;
            // console.debug('HTTPS check:', res.ok ? 'OK' : `status ${res.status}`);
          } catch (err) {
            console.warn('HTTPS check failed:', err);
          }

          // 2) If no HTTPS, fall back to SSH
          let reachable = httpsReachable;
          if (!reachable) {
            // console.debug('Falling back to SSH probe on port 22…');
            reachable = await checkSSH(ip, 3000, 22);
            // console.debug(`SSH probe ${reachable ? 'succeeded' : 'failed'}`);
          }

          // 3) If still unreachable, bail
          if (!reachable) {
            return notify(`Error: Unable to reach ${ip} via HTTPS (9090) or SSH (22)`);
          }

          // 4) success! add to discoveredServers
          const server: Server = {
            ip,
            name: ip,
            status: 'unknown',
            setupComplete: false,
            lastSeen: Date.now(),
            serverName: ip,
            shareName: '',
            setupTime: '',
            serverInfo: {
              moboMake: '',
              moboModel: '',
              serverModel: '',
              aliasStyle: '',
              chassisSize: '',
            },
            manuallyAdded: true,
            fallbackAdded: false,
          };

          let existingServer = discoveredServers.find(eServer => eServer.ip === server.ip);

          try {
            if (!existingServer) {
              discoveredServers.push(server);
            } else {
              existingServer.lastSeen = Date.now();
              existingServer.status = server.status;
              existingServer.setupComplete = server.status == 'complete' ? true : false;
              existingServer.serverName = server.serverName;
              existingServer.shareName = server.shareName;
              existingServer.setupTime = server.setupTime;
              existingServer.serverInfo = server.serverInfo;
            }

          } catch (error) {
            console.error('Add Manual Server-> Fetch error:', error);
          }
          
          attachSetupSSE(ip);

          mainWindow.webContents.send('discovered-servers', discoveredServers);
        jl('info', 'ipcrouter.addManualIP.result', { ip, reachable, httpsReachable });

        } else if (message.type === 'rescanServers') {
          jl('info', 'ipcrouter.rescanServers.start', { countBefore: discoveredServers.length });

          // close any live SSE streams first
          for (const s of discoveredServers) detachSetupSSE(s.ip);
          // clear & notify
          discoveredServers = [];
          mainWindow.webContents.send('discovered-servers', discoveredServers);

          // kick mDNS
          mDNSClient.query({ questions: [{ name: serviceType, type: 'PTR' }] });

          // after timeout: if still empty, call the same fallback fn
          setTimeout(async () => {
            if (discoveredServers.length === 0) {
              const fallback = await doFallbackScan();
              if (fallback.length) {
                mainWindow.webContents.send('discovered-servers', fallback);
              }
            }
          }, TIMEOUT_DURATION);
            jl('info', 'ipcrouter.rescanServers.done', { countAfter: discoveredServers.length });

        } 
      } catch (error) {
        console.error("Failed to handle IPC action:", data, error);
        jl('error', 'ipcrouter.action.parse-error', { data: String(data).slice(0, 200), error: String(error) });

      }
    }
  });

  mainWindow.maximize();

  mainWindow.webContents.setUserAgent(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0'
  );

  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools();
    const rendererPort = process.argv[2];

    mainWindow.loadURL(`http://localhost:${rendererPort}`);
  } else {
    mainWindow.setMenu(null);

    mainWindow.loadFile(join(app.getAppPath(), 'renderer', 'index.html'));
  }

  mainWindow.webContents.send('client-ip', getLocalIP());

  // Set up mDNS for service discovery
  const mDNSClient = mdns();
  jl('info', 'mdns.client.created');

  mDNSClient.query({ questions: [{ name: serviceType, type: 'PTR' }] });
  jl('debug', 'mdns.query.ptr', { serviceType });

  const SERVICE_TYPE = '_houstonserver._tcp.local'; 

  const norm = (s?: string) =>
    (s || '').toLowerCase().replace(/\.$/, ''); // strip trailing dot

  const isGoodV4 = (ip: string) =>
    /^\d+\.\d+\.\d+\.\d+$/.test(ip) && !ip.startsWith('169.254.');

  type SrvRec = { target: string, port: number };
  type TxtMap = Record<string, string>;

  const srvByInstance = new Map<string, SrvRec>();   // key: instance (SRV.name)
  const txtByInstance = new Map<string, TxtMap>();   // key: instance (SRV.name)
  const aByHost = new Map<string, string>();         // key: A.name (host) → IPv4

  function parseTxt(answer: any): TxtMap {
    const out: TxtMap = {};
    if (answer && Array.isArray(answer.data)) {
      for (const buf of answer.data) {
        const [k, v] = String(buf).split('=');
        if (k) out[k] = v ?? '';
      }
    }
    return out;
  }

  function upsertServerFrom(instanceRaw: string) {
    const instance = norm(instanceRaw);
    const srv = srvByInstance.get(instance);
    if (!srv) return;

    const txt = txtByInstance.get(instance) || {};
    let ip = txt.ip && isGoodV4(txt.ip) ? txt.ip : null;

    if (!ip) {
      const target = norm(srv.target);
      const a = aByHost.get(target);
      if (a && isGoodV4(a)) ip = a;
    }

    if (!ip) return;
    // Nice display name from the SRV instance
    const [bare] = instance.split('._');
    const displayName = bare.endsWith('.local') ? bare : `${bare}.local`;

    const s: Server = {
      ip,
      name: displayName,
      status: 'unknown',
      lastSeen: Date.now(),
      setupComplete: txt.setupComplete === 'true',
      serverName: txt.serverName || displayName,
      shareName: txt.shareName,
      setupTime: txt.setupTime,
      serverInfo: {
        moboMake: txt.moboMake,
        moboModel: txt.moboModel,
        serverModel: txt.serverModel,
        aliasStyle: txt.aliasStyle,
        chassisSize: txt.chassisSize,
      },
      manuallyAdded: false,
      fallbackAdded: false,
    };

    (async () => {
      try {
        // const r = await fetch(`http://${s.ip}:9095/setup-status`);
        // if (r.ok) {
        //   const j = await r.json();
        //   s.status = j.status ?? 'unknown';
        // }
      } catch { }
      // upsert and notify after probe too
      const existing = discoveredServers.find(x => x.ip === s.ip);
      if (!existing) discoveredServers.push(s);
      else Object.assign(existing, s, { lastSeen: Date.now(), fallbackAdded: false });

      mainWindow?.webContents.send('discovered-servers', discoveredServers);
      mainWindow?.webContents.send('client-ip', getLocalIP());
    })();

    const existing = discoveredServers.find(x => x.ip === s.ip);
    if (!existing) discoveredServers.push(s);
    else Object.assign(existing, s, { lastSeen: Date.now(), fallbackAdded: false });
    mainWindow?.webContents.send('discovered-servers', discoveredServers);
    mainWindow?.webContents.send('client-ip', getLocalIP());
    attachSetupSSE(s.ip);   // initial status comes via SSE immediately
    const sig = mdnsSignature(txt, ip, displayName);
    const prev = mdnsLastSigByIp.get(ip);
    const now  = Date.now();
    const last = mdnsLastLogAt.get(ip) || 0;

    const changed = sig !== prev;
    const frequent = now - last < MDNS_MIN_INTERVAL_MS;

    if (changed || !frequent) {
      jl(changed ? 'info' : 'debug', 'mdns.upsert', {
        instance: instanceRaw,
        ip,
        displayName,
        // log just what changed is fine; avoid huge TXT payloads
        keys: Object.keys(txt),
        changed
      });
      mdnsLastSigByIp.set(ip, sig);
      mdnsLastLogAt.set(ip, now);
    }
  }

  mDNSClient.on('response', (response) => {
    const items = [...(response.answers || []), ...(response.additionals || [])];

    // 1) Cache what we got in this frame
    for (const r of items) {
      if (r.type === 'SRV' && r.name && r.name.toLowerCase().includes(SERVICE_TYPE)) {
        const inst = norm(r.name);
        const data = r.data as any;
        const target = norm(data?.target);
        srvByInstance.set(inst, { target, port: Number(data?.port || 0) });
        mDNSClient.query([
          { name: target, type: 'A' },
          { name: target, type: 'AAAA' },
        ]);
      } else if (r.type === 'TXT' && r.name && r.name.toLowerCase().includes(SERVICE_TYPE)) {
        txtByInstance.set(norm(r.name), parseTxt(r));
      } else if (r.type === 'A' && r.name && typeof r.data === 'string') {
        const host = norm(r.name);
        const ip = r.data;
        if (isGoodV4(ip)) aByHost.set(host, ip);
      }
    }
    jl('debug', 'mdns.response', {
      answers: (response.answers || []).length,
      additionals: (response.additionals || []).length
    });
    // 2) Try to build/refresh any instances we know about
    for (const instance of srvByInstance.keys()) {
      upsertServerFrom(instance);
    }
  });


  const mdnsInterval = setInterval(() => {
    mDNSClient.query({
      questions: [{ name: '_houstonserver._tcp.local', type: 'PTR' }],
    })
    jl('debug', 'mdns.interval.query');

  }, 5000);


  const clearInactiveServerInterval = setInterval(() => {
    const now = Date.now()
    const stale = discoveredServers.filter(
      srv => (now - srv.lastSeen > TIMEOUT_DURATION) && !(srv as any).manuallyAdded
    );

    // close streams for those we’re about to remove
    for (const s of stale) detachSetupSSE(s.ip);
    // keep the rest
    discoveredServers = discoveredServers.filter(
      srv => (now - srv.lastSeen <= TIMEOUT_DURATION) || (srv as any).manuallyAdded === true
    );

    // push the updated list back to the renderer
    mainWindow.webContents.send('discovered-servers', discoveredServers)
    jl('debug', 'servers.cleanup.tick', {
      current: discoveredServers.length,
      stale: stale.length
    });

  }, 5000)


  app.on('window-all-closed', function () {
    ipcMain.removeAllListeners('message');
    clearInterval(clearInactiveServerInterval);
    clearInterval(mdnsInterval);
    detachAllSetupSSE();
    mDNSClient.destroy();

    for (const es of setupStreams.values()) {
      try { es.close(); } catch { }
    }
    setupStreams.clear();

    if (process.platform !== 'darwin') {
      app.quit();
    }
  });
}

app.on('web-contents-created', (_event, contents) => {
  contents.on('will-attach-webview', (_wawevent, webPreferences, _params) => {
    webPreferences.preload = `${__dirname}/webview-preload.js`;
  });
});


app.whenReady().then(() => {
  const resolvedLogDir = checkLogDir();
  initLogging(resolvedLogDir);
  jl('info', 'app.ready', {
    userData: app.getPath('userData'),
    logsDir: resolvedLogDir,
    env: process.env.NODE_ENV || 'production'
  });

  console.debug('userData is here:', app.getPath('userData'))
  console.debug('log dir:', resolvedLogDir);

  // log.info("🟢 Logging initialized.");
  // log.info("Log file path:", // log.transports.file.getFile().path);

  const isInternalHost = (hostname: string) => {
    // plain IPv4 or .local – adjust for your environment
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(hostname)) return true;
    if (hostname.endsWith('.local')) return true;
    // if you have a corporate domain, add it here:
    // if (hostname.endsWith('.45drives.internal')) return true;
    return false;
  };

  session.defaultSession.setCertificateVerifyProc((req, cb) => {
    // Let Chromium handle all non-internal hosts (gvt1.com, GitHub, etc.)
    if (!isInternalHost(req.hostname)) {
      return cb(-3); // “use default verification”
    }

    jl('info', 'cert.verify.start', { hostname: req.hostname, pid: process.pid });

    const presented = req.certificate.fingerprint;
    const pinned = getPin(req.hostname);

    // known & matches → allow
    if (pinned && pinned.fingerprint === presented) return cb(0);

    // known & changed → ask to update or block
    if (pinned && pinned.fingerprint !== presented) {
      dialog.showMessageBox({
        type: 'warning',
        message: `Certificate changed for ${req.hostname}`,
        detail: `Pinned: ${pinned.fingerprint}\nPresented: ${presented}\n\nBlock unless you know the cert rotated.`,
        buttons: ['Block', 'Trust & Update Pin'],
        cancelId: 0, defaultId: 0, noLink: true
      }).then(({ response }) => {
        if (response === 1) { rememberPin(req.hostname, presented); cb(0); }
        else cb(-2);
      });
      return;
    }

    // first seen internal host → TOFU prompt
    dialog.showMessageBox({
      type: 'question',
      message: `Trust this server?`,
      detail: `Host: ${req.hostname}\nFingerprint: ${presented}`,
      buttons: ['Cancel', 'Trust'],
      cancelId: 0, defaultId: 1, noLink: true
    }).then(({ response }) => {
      if (response === 1) { rememberPin(req.hostname, presented); cb(0); }
      else cb(-2);
    });
  });
  // ─────────────────────────────────────────────────────────────────────────────
  // AUTO-UPDATE DISABLED (commented out to avoid noisy logs / not implemented yet)
  // ─────────────────────────────────────────────────────────────────────────────

  // autoUpdater.logger = log;
  // (autoUpdater.logger as typeof log).transports.file.level = 'info';

  // autoUpdater.on('checking-for-update', () => {
  //   // log.info('🔄 Checking for update...');
  // });

  // autoUpdater.on('update-available', (info) => {
  //   // log.info('⬇️ Update available:', info);

  //   if (process.platform === 'linux') {
  //     // Notify renderer that a manual download is needed
  //     const url = 'https://github.com/45Drives/houston-client-manager/releases/latest';
  //     const win = BrowserWindow.getAllWindows()[0];
  //     win?.webContents.send('update-available-linux', url);
  //   }
  // });

  // autoUpdater.on('update-not-available', (info) => {
  //   // log.info(' No update available:', info);
  // });

  // autoUpdater.on('error', (err) => {
  //   // log.error(' Update error:', err);
  // });

  // autoUpdater.on('download-progress', (progressObj) => {
  //   const logMsg = `📦 Download speed: ${progressObj.bytesPerSecond} - Downloaded ${progressObj.percent.toFixed(
  //     1
  //   )}% (${progressObj.transferred}/${progressObj.total})`;
  //   // log.info(logMsg);
  // });

  // if (process.platform !== 'linux') {
  //   autoUpdater.on('update-downloaded', (info) => {
  //     // log.info(' Update downloaded. Will install on quit:', info);
  //     // autoUpdater.quitAndInstall(); // Optional
  //   });

  //   autoUpdater.checkForUpdatesAndNotify();
  // } else {
  //   autoUpdater.checkForUpdates(); // Only checks, doesn't download
  // }

  // // Automatically check for updates and notify user if one is downloaded
  // autoUpdater.checkForUpdatesAndNotify();
  // ─────────────────────────────────────────────────────────────────────────────

  ipcMain.handle("is-dev", async () => process.env.NODE_ENV === 'development');

  ipcMain.handle('dialog:openFolder', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory'], // Opens folder selection dialog
    });

    return result.canceled ? null : result.filePaths[0]; // Return full folder path
  });

  createWindow();
  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
    jl('info', 'app.activate', { openWindows: BrowserWindow.getAllWindows().length });
  });
  jl('info', 'window.created');


});

// ipcMain.on('check-for-updates', () => {
//   autoUpdater.checkForUpdatesAndNotify();
// });

ipcMain.handle('dialog:pickFiles', async () => {
  jl('debug', 'dialog.pickFiles.open');

  const { canceled, filePaths } = await dialog.showOpenDialog({
    properties: ['openFile', 'multiSelections'],
  });
  if (canceled) return [];

  const allowed: { path: string; name: string; size: number }[] = [];
  let skipped = 0;

  for (const p of filePaths) {
    if (!isOwnedByCurrentUser(p)) {
      skipped++;
      continue;
    }

    const st = fs.statSync(p);
    allowed.push({
      path: p,
      name: path.basename(p),
      size: st.size,
    });
  }

  jl('info', 'dialog.pickFiles.done', {
    requested: filePaths.length,
    allowed: allowed.length,
    skipped,
  });

  // Optional: surface a one-shot notification if items were skipped
  if (skipped > 0) {
    const msg = `Skipped ${skipped} item(s) you don't own or can't read.`;
    const win = BrowserWindow.getAllWindows()[0];
    win?.webContents.send('notification', msg);
    jl('warn', 'dialog.pickFiles.skipped', { skipped });
  }

  return allowed;
});

ipcMain.handle('dialog:pickFolder', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    properties: ['openDirectory'],
  });
  if (canceled || !filePaths.length) return [];

  const dir = filePaths[0];
  const entries = fs.readdirSync(dir);

  const allowed: { path: string; name: string; size: number }[] = [];
  let skipped = 0;

  for (const name of entries) {
    const fp = path.join(dir, name);
    let st: fs.Stats;
    try {
      st = fs.statSync(fp);
    } catch {
      skipped++;
      continue;
    }

    if (!st.isFile()) continue; // your original behaviour

    if (!isOwnedByCurrentUser(fp)) {
      skipped++;
      continue;
    }

    allowed.push({ path: fp, name, size: st.size });
  }

  jl('info', 'dialog.pickFolder.done', {
    dir,
    requested: entries.length,
    allowed: allowed.length,
    skipped,
  });

  if (skipped > 0) {
    const msg = `Skipped ${skipped} item(s) in ${dir} you don't own or can't read.`;
    const win = BrowserWindow.getAllWindows()[0];
    win?.webContents.send('notification', msg);
    jl('warn', 'dialog.pickFolder.skipped', { dir, skipped });
  }

  return allowed;
});

// upload file (streamed)
// Track inflight streams so we can cancel
const inflightUploads = new Map<string, fs.ReadStream>()

type UploadTarget = {
  host: string            // IP or hostname, e.g. "192.168.1.50" or "server.local"
  port?: number           // defaults to 9095
  protocol?: 'http' | 'https' // defaults to 'http' (bootstrap API is typically http)
}

ipcMain.on(
  'upload-file',
  async (
    event,
    {
      filePath,
      destDir,
      id,
      target,
    }: {
      filePath: string
      destDir: string
      id: string
      target: UploadTarget
    }
  ) => {
    jl('info', 'upload.start', { id, filePath, destDir, target });

    try {
      if (!target || !target.host) {
        event.sender.send(`upload-done-${id}`, { error: 'missing upload target host' })
        return
      }

      const protocol = target.protocol ?? 'http'
      const port = target.port ?? 9095
      const base = `${protocol}://${target.host}:${port}`

      const fileName = path.basename(filePath)
      const stat = fs.statSync(filePath)
      const total = stat.size

      const url =
        `${base}/api/upload` +
        `?dest=${encodeURIComponent(destDir)}` +
        `&name=${encodeURIComponent(fileName)}`

      let sent = 0
      const stream = fs.createReadStream(filePath)
      inflightUploads.set(id, stream)

      stream.on('data', (chunk) => {
          if (sent === 0) jl('debug', 'upload.first-bytes', { id });

        sent += chunk.length
        event.sender.send(`upload-progress-${id}`, Math.floor((sent / total) * 100))
      })
      stream.on('error', (err) => {
          jl('error', 'upload.stream.error', { id, error: err?.message || String(err) });

        event.sender.send(`upload-done-${id}`, { error: err?.message || 'stream error' })
        inflightUploads.delete(id)
      })

      // Some servers prefer a Content-Length for streamed bodies; provide it.
      const res = await fetch(url, {
        method: 'POST',
        body: stream as any,
        headers: {
          'Content-Type': 'application/octet-stream',
          'Content-Length': String(total),
        },
      })
      jl('info', 'upload.http.response', { id, status: res.status, ok: res.ok });

      // Try to parse JSON; if not JSON, return a minimal shape
      let json: any = {}
      try { json = await res.json() } catch { 
        jl('warn', 'upload.http.nonjson', { id, status: res.status });
        json = { ok: res.ok, status: res.status } }

      event.sender.send(`upload-done-${id}`, json)
      jl('info', 'upload.done', { id, ok: !!json?.ok, status: json?.status });

    } catch (err: any) {
      event.sender.send(`upload-done-${id}`, { error: err?.message || String(err) })
    } finally {
      inflightUploads.delete(id)
    }
  }
)

ipcMain.on('upload:file:cancel', (event, { id }) => {
  const s = inflightUploads.get(id)
  if (s) {
    try { s.destroy(new Error('canceled')) } catch { }
    inflightUploads.delete(id)
  }
  event.sender.send(`upload-done-${id}`, { error: 'canceled' })
  jl('info', 'upload.cancel', { id });

})

type RsyncStartOpts = {
  id: string
  src: string           // local path (file or folder)
  host: string
  user: string
  destDir: string       // remote directory (no filename)
  port?: number
  keyPath?: string      // ~/.ssh/id_ed25519 etc (optional if using agent)
  bwlimitKb?: number    // optional bandwidth limit (KB/s)
  extraArgs?: string[]  // any other rsync flags
}

const inflightRsync = new Map<string, ChildProcessWithoutNullStreams | null>()

ipcMain.on('upload:start', async (event, opts: RsyncStartOpts) => {
  const { id } = opts
  const knownHostsPath = path.join(app.getPath('userData'), 'known_hosts')
  const keyPath = opts.keyPath || defaultClientKey()
  const src = opts.src;

  if (!isOwnedByCurrentUser(src)) {
    const msg = 'Source is not owned by this user or is not readable.';
    jl('warn', 'rsync.src.denied', { id, src });
    event.sender.send(`upload:done:${id}`, { error: msg });
    return;
  }

  try { if (!fs.existsSync(knownHostsPath)) fs.writeFileSync(knownHostsPath, '') } catch { }

  if (inflightRsync.has(id)) {
    event.sender.send(`upload:done:${id}`, { error: 'duplicate id' })
    return
  }

  jl('info', 'rsync.start', { id, host: opts.host, user: opts.user, src: opts.src, destDir: opts.destDir })

  inflightRsync.set(id, null)

  try {
    if (process.platform === 'win32') {

        // ── Windows SSH-stream path (file only) ────────────────
        event.sender.send(`upload:progress:${id}`, { percent: 0, raw: 'starting' })

      await runWinSftp({
        id,
        src: opts.src,
        host: opts.host,
        user: opts.user,
        destDir: opts.destDir,
        port: opts.port,
        keyPath,
        onProgress: (p) => {
          // p is TransferProgress: { percent, rate, eta, bytesTransferred, raw }
          event.sender.send(`upload:progress:${id}`, p);
        },
      });
        
        event.sender.send(`upload:progress:${id}`, { percent: 100, raw: 'done' })
        event.sender.send(`upload:done:${id}`, { ok: true })
        jl('info', 'sshstream.close', { id, code: 0 })
        return
    }

    // ── Non-Windows → rsync ───────────────────────────────────
    const picked = buildRsyncCmdAndArgs({ ...opts, keyPath, knownHostsPath })

    const code = await runRsync({
      id,
      cmd: picked.cmd,
      args: picked.args,
      win: BrowserWindow.getAllWindows()[0]
    })

    if (code === 0) {
      event.sender.send(`upload:done:${id}`, { ok: true })
    } else {
      event.sender.send(`upload:done:${id}`, { error: `rsync exited ${code}` })
    }
    jl('info', 'rsync.close', { id, code })
  } catch (err: any) {
    event.sender.send(`upload:done:${id}`, { error: err?.message || 'spawn error' })
    jl('error', 'rsync.error', { id, error: err?.message || String(err) })
  } finally {
    inflightRsync.delete(id)
  }
})

// Cancel (only effective for rsync child processes for now)
ipcMain.on('upload:cancel', (_event, { id }) => {
  const p = inflightRsync.get(id)
  if (p) {
    try { p.kill('SIGINT') } catch { }
  }
})

app.on('window-all-closed', () => {
  for (const es of setupStreams.values()) {
    try { es.close(); } catch { }
  }
  setupStreams.clear();
  //  This ensures the app fully quits on Windows
  if (process.platform !== 'darwin') {
    app.quit();
  }
  jl('info', 'app.window-all-closed', { platform: process.platform });

});

