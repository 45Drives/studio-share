import log from 'electron-log';
function initLogging(resolvedLogDir: string) {
  log.transports.console.level = false;
  log.transports.file.resolvePathFn = () => path.join(resolvedLogDir, 'main.log');

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
    transports: [new DailyRotateFile({
      dirname: resolvedLogDir,
      filename: '45studio-share-%DATE%.json',
      datePattern: 'YYYY-MM-DD',
      maxFiles: '14d',
      zippedArchive: true,
    })],
  });

  const dual = (lvl: 'info' | 'warn' | 'error' | 'debug') =>
    (...args: any[]) => {
      const msg = args.map(String).join(' ');
      (log as any)[lvl](...args);
      (jsonLogger as any)[lvl]({ message: msg });
    };

  console.log = dual('info');
  console.info = dual('info');
  console.warn = dual('warn');
  console.error = dual('error');
  console.debug = dual('debug');

  process.on('uncaughtException', (err) => {
    log.error('Uncaught Exception:', err);
    jsonLogger.error({ event: 'uncaughtException', error: err.stack || err.message });
  });
  process.on('unhandledRejection', (reason, promise) => {
    log.error('Unhandled Rejection at:', promise, 'reason:', reason);
    jsonLogger.error({ event: 'unhandledRejection', reason: String(reason) });
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
import { connectWithKey, connectWithPassword } from './setupSsh'; 
import { server, unwrap } from '@45drives/houston-common-lib';
import { installServerDepsRemotely } from './installServerDeps';
import { checkSSH } from './setupSsh';
import { registerCredsIPC } from './creds.ipc';
import { getPin, rememberPin } from './certPins'
import { spawn, ChildProcessWithoutNullStreams } from 'node:child_process'
import { NodeSSH } from 'node-ssh';

let discoveredServers: Server[] = [];
export let jsonLogger: ReturnType<typeof createLogger>;

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

// Ensure the constructor exists (defensive)
const hasEventSource = typeof (EventSource as any) === 'function';

// Track live SSE connections per IP
const setupStreams = new Map<string, ESLike>();

// Base backoff for reconnects
let sseBackoffMs = 2000;

// Call this to start listening for bootstrap status updates from a host
export function attachSetupSSE(ip: string) {
  if (!hasEventSource) {
    console.warn(`[SSE] EventSource unavailable; cannot attach for ${ip}`);
    return;
  }
  if (setupStreams.has(ip)) {
    return; // already connected
  }

  // Use HTTP during bootstrap (no TLS agent needed)
  const url = `http://${ip}:9095/setup-status/stream`;

  let es: ESLike;
  try {
    es = new (EventSource as any)(url) as ESLike;
  } catch (e: any) {
    console.warn(`[SSE] Failed to construct EventSource for ${ip}:`, e?.message || e);
    return;
  }

  es.onopen = () => {
    console.debug(`[SSE] open ${ip} ${url}`);
  };

  // Server sends:  event: status\n data: {"status":"..."}\n\n
  es.addEventListener('status', (ev: ESMessageEvent) => {
    try {
      sseBackoffMs = 2000; // reset backoff on healthy traffic
      const payload = JSON.parse(String(ev.data) || '{}');
      const status = payload?.status ?? 'unknown';
      BrowserWindow.getAllWindows()[0]?.webContents.send('discovered-servers-status', {
        ip,
        status,
        ts: Date.now(),
      });
    } catch (e: any) {
      console.warn(`[SSE] parse error (${ip}):`, e?.message || e);
    }
  });

  es.onerror = (err: any) => {
    console.warn(`[SSE] error ${ip} ${url}:`, err && (err.message || err));
    try { es.close(); } catch { }
    setupStreams.delete(ip);

    // simple capped exponential backoff
    const delay = Math.min(sseBackoffMs, 30000);
    setTimeout(() => attachSetupSSE(ip), delay);
    sseBackoffMs = delay * 2;
  };

  setupStreams.set(ip, es);
}

// Stop and remove a single stream
export function detachSetupSSE(ip: string) {
  const es = setupStreams.get(ip);
  if (!es) return;
  try { es.close(); } catch { }
  setupStreams.delete(ip);
}

// Stop and clear all streams (e.g., during app shutdown or rescan)
export function detachAllSetupSSE() {
  for (const es of setupStreams.values()) {
    try { es.close(); } catch { }
  }
  setupStreams.clear();
}


// Helper to connect via agent or password-planted key
async function connectForPreflight(host: string, username: string, password: string) {
  const agentSock = getAgentSocket();
  // Try agent
  if (agentSock) {
    const trial = new NodeSSH();
    try {
      await trial.connect({ host, username, agent: agentSock, tryKeyboard: false, readyTimeout: 20000 });
      return trial;
    } catch { trial.dispose(); }
  }

  // Try password → plant key → reconnect with key
  const planted = await connectWithPassword({ host, username, password });
  try { planted.dispose(); } catch { }

  const keyDir = getKeyDir();
  const priv = path.join(keyDir, 'id_rsa');
  await ensureKeyPair(priv, `${priv}.pub`);
  try {
    return await connectWithKey({ host, username, privateKey: priv, agent: agentSock || undefined });
  } catch (e: any) {
    const m = String(e?.message || e);
    if (/unsupported key format/i.test(m)) {
      await regeneratePemKeyPair(priv);
      return await connectWithKey({ host, username, privateKey: priv, agent: agentSock || undefined });
    }
    throw e;
  }
}

ipcMain.handle('remote-check-broadcaster', async (_event, { host, username, password }) => {
  let ssh: NodeSSH | null = null;
  try {
    ssh = await connectForPreflight(host, username, password);

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
    return parsed;
  } catch (e: any) {
    jsonLogger.warn({ event: 'remote-check-broadcaster.error', host, error: e?.message || String(e) });
    throw e;
  } finally {
    try { ssh?.dispose(); } catch { }
  }
});

ipcMain.handle('probe-health', async (_e, { ip, port }) => {
  try {
    const r = await fetch(`http://${ip}:${port}/healthz`, { signal: AbortSignal.timeout(3000) });
    return { ok: r.ok, status: r.status };
  } catch (err: any) {
    return { ok: false, error: err?.message || String(err) };
  }
});

const idFile = path.join(app.getPath('userData'), 'client-id.txt');
let installId = fs.existsSync(idFile) ? fs.readFileSync(idFile, 'utf-8').trim() : '';
if (!installId) { installId = uuidv4(); fs.writeFileSync(idFile, installId, 'utf-8'); }

const clientIdent = { installId };

ipcMain.on('renderer-ready', (e) => {
  e.sender.send('client-ident', clientIdent);
});

ipcMain.handle('get-client-ident', async () => ({ installId }))

app.commandLine.appendSwitch('ignore-certificate-errors', 'true');

function checkLogDir(): string {
  // LINUX: /home/<username>/.config/studio-share/logs       (IN DEV MODE: /home/<username>/config/Electron/logs/)
  // MAC:   /Users/<username>/Library/Application Support/studio-share/logs
  // WIN:   C:\Users\<username>\AppData\Roaming\studio-share\logs
  const baseLogDir = path.join(app.getPath('userData'), 'logs');
  try {
    if (!fs.existsSync(baseLogDir)) {
      fs.mkdirSync(baseLogDir, { recursive: true });
    }
    console.debug(` Log directory ensured: ${baseLogDir}`);
  } catch (e: any) {
    console.error(` Failed to create log directory (${baseLogDir}):`, e.message);
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
    const ips = Array
      .from({ length: 256 }, (_, i) => `${subnet}.${i}`)
      .filter(candidate => candidate !== ip);

    const scanned = await Promise.allSettled(
      ips.map(async candidateIp => {

        // console.debug("checking for server at ", candidateIp);

        const portOpen = await isPortOpen(candidateIp, 9090);
        if (!portOpen) return null;
        console.debug("port open at 9090 ", candidateIp);
        
        try {
          const res = await fetch(`https://${candidateIp}:9090/`, {
            method: 'GET',
            cache: 'no-store',
            signal: AbortSignal.timeout(3000),
            
          });
          if (!res.ok) return null;

          console.debug("https at 9090 ", candidateIp);
          
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
    log.info(payload.event, payload.data);
  });
  ipcMain.on('log:warn', (_e, payload) => {
    jsonLogger.warn(payload);
    log.warn(payload.event, payload.data);
  });
  ipcMain.on('log:error', (_e, payload) => {
    jsonLogger.error(payload);
    log.error(payload.event, payload.data);
  });

  ipcMain.handle('run-remote-bootstrap', async (event, { host, username, password, id }) => {
    const send = (label: string, step?: string) =>
      event.sender.send('bootstrap-progress', { id, ts: Date.now(), step, label });

    try {
      send('Probing SSH…', 'probe');
      const res = await installServerDepsRemotely({
        host, username, password,
        onProgress: ({ step, label }: any) => send(label, step),
      });
      send(res.success ? 'Bootstrap complete.' : 'Bootstrap failed.', res.success ? 'done' : 'error');
      return res;
    } catch (err: any) {
      send('Bootstrap failed.', 'error');
      return { success: false, error: err?.message || String(err) };
    }
  });
  
  ipcMain.handle('get-os', () => getOS());
  
  ipcMain.handle('scan-network-fallback', async () => {
    return await doFallbackScan();
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

    if (!rendererIsReady) bufferedNotifications.push(message);
  }


  IPCRouter.getInstance().addEventListener('action', async (data) => {

    if (data === "requestHostname") {
      IPCRouter.getInstance().send('renderer', 'action', JSON.stringify({
        type: "sendHostname",
        hostname: await unwrap(server.getHostname())
      }));
    } else if (data === "show_dashboard") {
      IPCRouter.getInstance().send('renderer', 'action', 'show_dashboard');
    }
    else {
      try {
        const message = JSON.parse(data);
        if (message.type === 'addManualIP') {
          const { ip, manuallyAdded } = message as { ip: string; manuallyAdded?: boolean };

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
            reachable = await checkSSH(ip, 3000);
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

        } else if (message.type === 'rescanServers') {
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
        } 
      } catch (error) {
        console.error("Failed to handle IPC action:", data, error);
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
  mDNSClient.query({ questions: [{ name: serviceType, type: 'PTR' }] });
  
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
    const displayName = `${bare}.local`;

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

    // 2) Try to build/refresh any instances we know about
    for (const instance of srvByInstance.keys()) {
      upsertServerFrom(instance);
    }
  });


  const mdnsInterval = setInterval(() => {
    mDNSClient.query({
      questions: [{ name: '_houstonserver._tcp.local', type: 'PTR' }],
    })
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

  console.debug('userData is here:', app.getPath('userData'))
  console.debug('log dir:', resolvedLogDir);

  log.info("🟢 Logging initialized.");
  log.info("Log file path:", log.transports.file.getFile().path);

  jsonLogger = createLogger({
    level: 'info',
    format: format.combine(
      format.timestamp(),
      // <-- this filter will DROP any record whose message includes the TLS warning
      format((info) => {
        if (
          typeof info.message === 'string' &&
          info.message.includes(
            'Warning: Setting the NODE_TLS_REJECT_UNAUTHORIZED'
          )
        ) {
          return false;
        }
        return info;
      })(),
      format.json()
    ),
    transports: [
      new DailyRotateFile({
        dirname: resolvedLogDir,
        filename: 'studio-share-%DATE%.json',
        datePattern: 'YYYY-MM-DD',
        maxFiles: '14d',
        zippedArchive: true,
      })
    ]
  });


  session.defaultSession.setCertificateVerifyProc((req, cb) => {
    // Quick dev escape for localhost
    if (process.env.NODE_ENV === 'development' &&
      (req.hostname === 'localhost' || req.hostname.startsWith('127.')))
      return cb(0);

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

    // first seen → TOFU prompt
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
  //   log.info('🔄 Checking for update...');
  // });

  // autoUpdater.on('update-available', (info) => {
  //   log.info('⬇️ Update available:', info);

  //   if (process.platform === 'linux') {
  //     // Notify renderer that a manual download is needed
  //     const url = 'https://github.com/45Drives/houston-client-manager/releases/latest';
  //     const win = BrowserWindow.getAllWindows()[0];
  //     win?.webContents.send('update-available-linux', url);
  //   }
  // });

  // autoUpdater.on('update-not-available', (info) => {
  //   log.info(' No update available:', info);
  // });

  // autoUpdater.on('error', (err) => {
  //   log.error(' Update error:', err);
  // });

  // autoUpdater.on('download-progress', (progressObj) => {
  //   const logMsg = `📦 Download speed: ${progressObj.bytesPerSecond} - Downloaded ${progressObj.percent.toFixed(
  //     1
  //   )}% (${progressObj.transferred}/${progressObj.total})`;
  //   log.info(logMsg);
  // });

  // if (process.platform !== 'linux') {
  //   autoUpdater.on('update-downloaded', (info) => {
  //     log.info(' Update downloaded. Will install on quit:', info);
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

  registerCredsIPC(ipcMain, app);
  createWindow();
  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });

});

// ipcMain.on('check-for-updates', () => {
//   autoUpdater.checkForUpdatesAndNotify();
// });

ipcMain.handle('dialog:pickFiles', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    properties: ['openFile', 'multiSelections']
  });
  if (canceled) return [];
  return filePaths.map(p => ({ path: p, name: path.basename(p), size: fs.statSync(p).size }));
});

ipcMain.handle('dialog:pickFolder', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    properties: ['openDirectory']
  });
  if (canceled || !filePaths.length) return [];
  const dir = filePaths[0];
  const files = fs.readdirSync(dir);
  return files.map(f => {
    const fp = path.join(dir, f);
    const s = fs.statSync(fp);
    return { path: fp, name: f, size: s.size };
  });
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
        sent += chunk.length
        event.sender.send(`upload-progress-${id}`, Math.floor((sent / total) * 100))
      })
      stream.on('error', (err) => {
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

      // Try to parse JSON; if not JSON, return a minimal shape
      let json: any = {}
      try { json = await res.json() } catch { json = { ok: res.ok, status: res.status } }

      event.sender.send(`upload-done-${id}`, json)
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
})


type RsyncStartOpts = {
  id: string
  src: string           // local path (file or folder)
  host: string
  user: string
  destDir: string       // remote directory (no filename)
  port?: number
  keyPath?: string      // ~/.ssh/id_rsa etc (optional if using agent)
  bwlimitKb?: number    // optional bandwidth limit (KB/s)
  extraArgs?: string[]  // any other rsync flags
}

const inflightRsync = new Map<string, ChildProcessWithoutNullStreams>()

function buildRsyncArgs(o: RsyncStartOpts) {
  const sshParts = ['ssh']
  if (o.port) sshParts.push('-p', String(o.port))
  if (o.keyPath) sshParts.push('-i', o.keyPath)

  const args = [
    '-az',
    '--info=progress2',     // total-progress line
    '--human-readable',     // 10.5MB/s, etc
    '--partial',
    '--inplace',
    '-e', sshParts.join(' '),
  ]

  if (o.bwlimitKb && o.bwlimitKb > 0) args.push(`--bwlimit=${o.bwlimitKb}`)
  if (o.extraArgs?.length) args.push(...o.extraArgs)

  const srcIsDir = (() => { try { return fs.statSync(o.src).isDirectory() } catch { return false } })()
  const srcFinal = srcIsDir ? (o.src.endsWith('/') ? o.src : o.src + '/') : o.src

  const dest = `${o.user}@${o.host}:${o.destDir.endsWith('/') ? o.destDir : o.destDir + '/'}`
  args.push(srcFinal, dest)
  return args
}


function parseProgress(line: string) {
  // Examples (progress2):
  // "  42,123,456  12%   12.34MB/s    0:10:01 (xfr#1, to-chk=0/5)"
  // "123,456,789  55%    9.8MiB/s    0:03:21"
  const percentMatch = line.match(/(\d+)%/)
  const rateMatch    = line.match(/([0-9.]+)\s*([KMG]i?)B\/s/i)     // KiB/s, MiB/s, MB/s, etc
  const etaMatch     = line.match(/(\d+:\d{2}:\d{2})/)              // 0:10:01
  const bytesMatch   = line.trim().match(/^(\d[\d,]*)\s+/)          // leading bytes count

  const percent = percentMatch ? Number(percentMatch[1]) : undefined
  const rate = rateMatch ? `${rateMatch[1]} ${rateMatch[2]}B/s` : undefined
  const eta = etaMatch ? etaMatch[1] : undefined
  const bytesTransferred = bytesMatch ? Number(bytesMatch[1].replace(/,/g, '')) : undefined

  return { percent, rate, eta, bytesTransferred, raw: line }
}

// Start
ipcMain.on('rsync:start', (event, opts: RsyncStartOpts) => {
  const { id } = opts
  if (inflightRsync.has(id)) {
    event.sender.send(`rsync:done:${id}`, { error: 'duplicate id' })
    return
  }

  const args = buildRsyncArgs(opts)

  const child = spawn('rsync', args, {
    env: { ...process.env, LC_ALL: 'C', LANG: 'C', COLUMNS: '200' },
    })
  inflightRsync.set(id, child)
  let buf = ''

  // rsync prints progress on stderr with --info=progress2
  child.stderr.on('data', (chunk) => {
    buf += chunk.toString()
    // normalize CR to NL so we can split uniformly
    buf = buf.replace(/\r/g, '\n')
    const lines = buf.split('\n')
    buf = lines.pop() || '' // keep last partial
    for (const line of lines) {
      const t = line.trim()
      if (!t) continue
      const parsed = parseProgress(t)
      event.sender.send(`rsync:progress:${id}`, parsed)
    }
  })

  child.stdout.on('data', (chunk) => {
    // Not typically used with --info=progress2, but forward in case useful
    const line = chunk.toString().trim()
    if (line) {
      event.sender.send(`rsync:progress:${id}`, { raw: line })
    }
  })

  child.on('error', (err) => {
    inflightRsync.delete(id)
    event.sender.send(`rsync:done:${id}`, { error: err?.message || 'spawn error' })
  })

  child.on('close', (code) => {
    inflightRsync.delete(id)
    if (code === 0) event.sender.send(`rsync:done:${id}`, { ok: true })
    else event.sender.send(`rsync:done:${id}`, { error: `rsync exited ${code}` })
  })
})

// Cancel
ipcMain.on('rsync:cancel', (_event, { id }) => {
  const p = inflightRsync.get(id)
  if (p) {
    try { p.kill('SIGINT') } catch {}
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
});

