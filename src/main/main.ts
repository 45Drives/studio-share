// 1) capture originals
const _origWarn = console.warn.bind(console)
const _origError = console.error.bind(console)

// 2) override warn & error
console.warn = (...args: any[]) => {
  const msg = args.map(String).join(' ')
  if (
    msg.includes('APPIMAGE env is not defined') ||
    msg.includes('NODE_TLS_REJECT_UNAUTHORIZED')
  ) return
  _origWarn(...args)
}

console.error = (...args: any[]) => {
  const msg = args.map(String).join(' ')
  if (msg.includes('NODE_TLS_REJECT_UNAUTHORIZED')) return
  _origError(...args)
}

import log from 'electron-log';
log.transports.console.level = false;
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
// process.env.NODE_ENV = 'development';
console.log = (...args) => log.info(...args);
console.error = (...args) => log.error(...args);
console.warn = (...args) => log.warn(...args);
console.debug = (...args) => log.debug(...args);

process.on('uncaughtException', (error) => {
  log.error('Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  log.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

import { app, BrowserWindow, ipcMain, dialog, shell, session } from 'electron';
import { autoUpdater } from 'electron-updater';
import { createLogger, format } from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import path, { join } from 'path';
import mdns from 'multicast-dns';
import os from 'os';
import fs from 'fs';
import net from 'net';
import { Server } from './types';
import mountSmbPopup from './smbMountPopup';
import { IPCRouter } from '../../houston-common/houston-common-lib/lib/electronIPC/IPCRouter';
import { getOS } from './utils';
import { v4 as uuidv4 } from 'uuid';
// import { BackUpManager, BackUpManagerLin, BackUpManagerMac, BackUpManagerWin, BackUpSetupConfigurator } from './backup';
import { BackUpSetupConfig, BackUpTask, server, unwrap } from '@45drives/houston-common-lib';
import { installServerDepsRemotely } from './installServerDeps';
import { checkSSH } from './setupSsh';
import { registerCredsIPC } from './creds.ipc';
import { getPin, isHostPinned, rememberPin } from './certPins'

let discoveredServers: Server[] = [];
export let jsonLogger: ReturnType<typeof createLogger>;

// const blockerId = powerSaveBlocker.start("prevent-app-suspension");

const idFile = path.join(app.getPath('userData'), 'client-id.txt');
let installId = fs.existsSync(idFile) ? fs.readFileSync(idFile, 'utf-8').trim() : '';
if (!installId) { installId = uuidv4(); fs.writeFileSync(idFile, installId, 'utf-8'); }

const clientIdent = { installId };

ipcMain.on('renderer-ready', (e) => {
  e.sender.send('client-ident', clientIdent);
});

// NEW: request/response path
ipcMain.handle('get-client-ident', async () => ({ installId }))

app.commandLine.appendSwitch('ignore-certificate-errors', 'true');

function checkLogDir(): string {
  // LINUX: /home/<username>/.config/45drives-setup-wizard/logs       (IN DEV MODE: /home/<username>/config/Electron/logs/)
  // MAC:   /Users/<username>/Library/Application Support/45drives-setup-wizard/logs
  // WIN:   C:\Users\<username>\AppData\Roaming\45drives-setup-wizard\logs
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
const serviceType = '_houstonserver._tcp.local'; // Define the service you're looking for

const getLocalIP = () => {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    const something = nets[name];
    if (something) {
      for (const net of something) {
        // Only return the IPv4 address (ignoring internal/loopback addresses)
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
      partition: 'persist:your-cookie-partition',
      webSecurity: true,                  // Enforces origin security
      allowRunningInsecureContent: false, // Prevents HTTP inside HTTPS
    }
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    // Only allow URLs we trust (optional but recommended)
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

    // exactly your old logic, with proper serverInfo defaults
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

  ipcMain.on('check-for-updates', () => {
    autoUpdater.checkForUpdatesAndNotify();
  });

  ipcMain.handle('install-cockpit-module', async (_event, { host, username, password }) => {
    // 4. Store manual creds for login UI (if needed)
    mainWindow.webContents.send('store-manual-creds', {
      ip: host,
      username,
      password,
    });

    try {
      const res = await installServerDepsRemotely({ host, username, password });
      console.debug(" install-cockpit-module →", res);
      return res;
    } catch (err) {
      console.error(" install-cockpit-module error:", err);
      throw err;            // so the renderer gets the real stack
    }
  });
  
  ipcMain.handle('get-os', () => getOS());
  
  ipcMain.handle('scan-network-fallback', async () => {
    return await doFallbackScan();
  });


  function notify(message: string) {
    if (!mainWindow || mainWindow.webContents?.isDestroyed()) return;

    // always send to the standard channel
    mainWindow.webContents.send("notification", message);

    // mirror to your IPCRouter bus; if nothing is listening, no harm done
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
        // console.debug("[Main] 📩 Raw message received:", data);

        const message = JSON.parse(data);
        // console.debug("[Main] 📩 Parsed message:", message);
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

          // 3) If _still_ unreachable, bail
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
            manuallyAdded: manuallyAdded === true,
            fallbackAdded: false,
          };

          // let existingServer = discoveredServers.find((eServer) => eServer.ip === server.ip && eServer.name === server.name);
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

          mainWindow.webContents.send('discovered-servers', discoveredServers);

        } else if (message.type === 'rescanServers') {
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
  const mDNSClient = mdns(); // Correctly call as a function
  mDNSClient.query({ questions: [{ name: serviceType, type: 'PTR' }] });
  
  // ---- Add these utilities near the top (once) -------------------------------
  const SERVICE_TYPE = '_houstonserver._tcp.local'; // your existing value

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
    const instance = norm(instanceRaw);                   // e.g. "f8x1-rnd._houstonserver._tcp.local"
    const srv = srvByInstance.get(instance);
    if (!srv) return;

    const txt = txtByInstance.get(instance) || {};
    let ip = txt.ip && isGoodV4(txt.ip) ? txt.ip : null;

    if (!ip) {
      const target = norm(srv.target);                   // e.g. "f8x1-rnd.local"
      const a = aByHost.get(target);
      if (a && isGoodV4(a)) ip = a;
    }

    if (!ip) return;                                     // not ready yet

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

    // Optional probe to label 'complete'
    (async () => {
      try {
        const r = await fetch(`http://${s.ip}:9095/setup-status`);
        if (r.ok) {
          const j = await r.json();
          s.status = j.status ?? 'unknown';
        }
      } catch { }
      // upsert and notify after probe too
      const existing = discoveredServers.find(x => x.ip === s.ip);
      if (!existing) discoveredServers.push(s);
      else Object.assign(existing, s, { lastSeen: Date.now(), fallbackAdded: false });

      mainWindow?.webContents.send('discovered-servers', discoveredServers);
      mainWindow?.webContents.send('client-ip', getLocalIP());
    })();
  }

  // ---- Replace your current handler with this --------------------------------
  mDNSClient.on('response', (response) => {
    const items = [...(response.answers || []), ...(response.additionals || [])];

    // 1) Cache what we got in this frame
    for (const r of items) {
      if (r.type === 'SRV' && r.name && r.name.toLowerCase().includes(SERVICE_TYPE)) {
        const inst = norm(r.name);
        const data = r.data as any;
        srvByInstance.set(inst, {
          target: norm(data?.target),                     // normalize host
          port: Number(data?.port || 0),
        });
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

    // only keep servers that are still “fresh” OR that have manuallyAdded === true
    discoveredServers = discoveredServers.filter(srv =>
      now - srv.lastSeen <= TIMEOUT_DURATION
      || (srv as any).manuallyAdded === true
    )

    // push the updated list back to the renderer
    mainWindow.webContents.send('discovered-servers', discoveredServers)
  }, 5000)
  

  async function pollActions(server: Server) {
    try {
      const response = await fetch(`http://${server.ip}:9095/actions?client_ip=${getLocalIP()}`);
      const data = await response.json();

      if (data.action) {
        // console.debug("New action received:", server, data);

        if (data.action === "mount_samba_client") {
          mountSmbPopup(data.smb_host, data.smb_share, data.smb_user, data.smb_pass, mainWindow);
        } else {
          console.debug("Unknown new actions.", server);
        }
      }
    } catch (error) {
      // console.error(` [pollActions] fetch failed for ${server.ip}`, error);
    }
  }

  IPCRouter.getInstance().addEventListener('mountSambaClient', async (data) => {
    let result
    try {
     result = await mountSmbPopup(data.smb_host, data.smb_share, data.smb_user, data.smb_pass, mainWindow, "silent");

    } catch (e: any) {
      result = { error: e && e.message ? e.message : "Failed to mount" };
    }
    IPCRouter.getInstance().send("renderer", "action", JSON.stringify({
      action: "mountSmbResult",
      result: result
    }))
  });

  const pollActionInterval = setInterval(async () => {
    for (let server of discoveredServers) {
      if ((server as any).manuallyAdded || (server as any).fallbackAdded) continue
      await pollActions(server)
    }
  }, 5000);


  app.on('window-all-closed', function () {
    ipcMain.removeAllListeners('message')
    clearInterval(pollActionInterval);
    clearInterval(clearInactiveServerInterval);
    clearInterval(mdnsInterval);
    mDNSClient.destroy();
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
  console.debug('userData is here:', app.getPath('userData'))
  console.debug('log dir:', resolvedLogDir);
  log.transports.file.resolvePathFn = () =>
    path.join(resolvedLogDir, 'main.log');
  log.info("🟢 Logging initialized.");
  log.info("Log file path:", log.transports.file.getFile().path);


  const { combine, timestamp, json } = format;
  // structured JSON logger used alongside electron-log
  // jsonLogger = createLogger({
  //   level: 'info',
  //   format: format.combine(
  //     format.timestamp(),
  //     format.json()
  //   ),
  //   transports: [
  //     new DailyRotateFile({
  //       dirname: resolvedLogDir,
  //       filename: '45drives-setup-wizard-%DATE%.json',
  //       datePattern: 'YYYY-MM-DD',
  //       maxFiles: '14d',
  //       zippedArchive: true,
  //     })
  //   ]
  // });

  // only let through events (which all have an "event" field)
  const preserveEventsOrErrors = format((info) => {
    // keep if it's an error or warning,
    // or if we've attached an "event" property
    if (['error', 'warn'].includes(info.level) || info.event) {
      return info;
    }
    return false;
  });

  jsonLogger = createLogger({
    level: 'info',
    format: format.combine(
      format.timestamp(),
      // <-- this filter will DROP any record whose message includes your TLS warning
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
        filename: '45drives-setup-wizard-%DATE%.json',
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
  
  // const origConsole = {
  //   log: console.debug,
  //   warn: console.warn,
  //   error: console.error,
  //   debug: console.debug,
  // };

  // Monkey‐patch so calls go to both electron-log + jsonLogger
  console.debug = (...args: any[]) => {
    log.info(...args);
    jsonLogger.info({ message: args.map(String).join(' ') });
  };
  console.warn = (...args: any[]) => {
    log.warn(...args);
    jsonLogger.warn({ message: args.map(String).join(' ') });
  };
  console.error = (...args: any[]) => {
    log.error(...args);
    jsonLogger.error({ message: args.map(String).join(' ') });
  };
  console.debug = (...args: any[]) => {
    log.debug(...args);
    jsonLogger.debug({ message: args.map(String).join(' ') });
  };

  process.on('uncaughtException', (err) => {
    log.error('Uncaught Exception:', err);
    jsonLogger.error({ event: 'uncaughtException', error: err.stack || err.message });
  });

  process.on('unhandledRejection', (reason, promise) => {
    log.error('Unhandled Rejection at:', promise, 'reason:', reason);
    jsonLogger.error({ event: 'unhandledRejection', reason, promise: String(promise) });
  });

  autoUpdater.logger = log;
  (autoUpdater.logger as typeof log).transports.file.level = 'info';

  autoUpdater.on('checking-for-update', () => {
    log.info('🔄 Checking for update...');
  });

  autoUpdater.on('update-available', (info) => {
    log.info('⬇️ Update available:', info);

    if (process.platform === 'linux') {
      // Notify renderer that a manual download is needed
      const url = 'https://github.com/45Drives/houston-client-manager/releases/latest';
      const win = BrowserWindow.getAllWindows()[0];
      win?.webContents.send('update-available-linux', url);
    }
  });

  autoUpdater.on('update-not-available', (info) => {
    log.info(' No update available:', info);
  });

  autoUpdater.on('error', (err) => {
    log.error(' Update error:', err);
  });

  autoUpdater.on('download-progress', (progressObj) => {
    const logMsg = `📦 Download speed: ${progressObj.bytesPerSecond} - Downloaded ${progressObj.percent.toFixed(
      1
    )}% (${progressObj.transferred}/${progressObj.total})`;
    log.info(logMsg);
  });

  if (process.platform !== 'linux') {
    autoUpdater.on('update-downloaded', (info) => {
      log.info(' Update downloaded. Will install on quit:', info);
      // autoUpdater.quitAndInstall(); // Optional
    });

    autoUpdater.checkForUpdatesAndNotify();
  } else {
    autoUpdater.checkForUpdates(); // Only checks, doesn't download
  }

  // Automatically check for updates and notify user if one is downloaded
  autoUpdater.checkForUpdatesAndNotify();

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
ipcMain.on('check-for-updates', () => {
  autoUpdater.checkForUpdatesAndNotify();
});

app.on('window-all-closed', () => {
  //  This ensures your app fully quits on Windows
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

