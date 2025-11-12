// src/main/rsync/rsync-path.ts
import fs from 'fs';
import os from 'os';
import { spawnSync } from 'node:child_process';
import path from 'path';
import { jl } from '../main';

type RsyncStartOpts = {
  id: string;
  src: string;           // local path (file or folder)
  host: string;
  user: string;
  destDir: string;       // remote directory (no filename)
  port?: number;
  keyPath?: string;      // ~/.ssh/id_ed25519 etc (optional if using agent)
  bwlimitKb?: number;    // optional bandwidth limit (KB/s)
  extraArgs?: string[];  // any other rsync flags
  knownHostsPath?: string; // <- pass from main (e.g., app.getPath('userData')/known_hosts)
};

function ensureTrailingSlash(p: string) {
  return p.endsWith('/') || p.endsWith('\\') ? p : p + '/';
}

function findScpPath(): string {
  // Prefer built-in OpenSSH (Win10+), then Git, then PATH
  const candidates = [
    'C:\\Windows\\System32\\OpenSSH\\scp.exe',
    'C:\\Program Files\\Git\\usr\\bin\\scp.exe',
    'C:\\Program Files\\Git\\mingw64\\bin\\scp.exe',
  ];
  for (const c of candidates) if (pathExists(c)) return c;

  const r = spawnSync('where', ['scp'], { encoding: 'utf8' });
  if (r.status === 0) {
    const fromPath = r.stdout.split(/\r?\n/).find(s => s.trim())?.trim();
    if (fromPath) return fromPath;
  }
  return 'scp'; // hope it's on PATH
}

const pathExists = (p: string) => { try { fs.accessSync(p); return true; } catch { return false; } };

function looksGitLikeRsync(cmdPath: string) {
  const p = cmdPath.toLowerCase();
  return p.includes('\\git\\') || p.includes('\\cygwin') || p.includes('\\cwrsync') || p.endsWith('rsync.exe');
}

// Convert Windows "C:\Users\Name\..." → "/c/Users/Name/..."
function toMSYS(p: string) {
  return p
    .replace(/\\/g, '/')
    .replace(/^([A-Za-z]):\//, (_m, d) => `/${String(d).toLowerCase()}/`);
}

// Convert only when needed
function maybeToMSYS(p: string | undefined, enable: boolean) {
  if (!p) return p;
  return enable ? toMSYS(p) : p;
}

export function findRsyncPath(): { cmd: string; useWSL: boolean } {
  const macCandidates = [
    '/opt/homebrew/bin/rsync',
    '/usr/local/bin/rsync',
    '/usr/bin/rsync',
  ];
  const winCandidates = [
    'C:\\Program Files\\Git\\usr\\bin\\rsync.exe',
    'C:\\Program Files\\Git\\mingw64\\bin\\rsync.exe',
    'C:\\Program Files\\cwRsync\\rsync.exe',
    'C:\\cygwin64\\bin\\rsync.exe',
    'C:\\cygwin\\bin\\rsync.exe',
  ];
  const which = (bin: string) => {
    const r = spawnSync(process.platform === 'win32' ? 'where' : 'which', [bin], { encoding: 'utf8' });
    return r.status === 0 ? r.stdout.split(/\r?\n/).find(s => s.trim())?.trim() : '';
  };

  if (process.platform === 'darwin') {
    for (const p of macCandidates) if (pathExists(p)) return { cmd: p, useWSL: false };
    const fromPath = which('rsync');
    if (fromPath) return { cmd: fromPath, useWSL: false };
    return { cmd: 'rsync', useWSL: false };
  }

  if (process.platform === 'win32') {
    for (const p of winCandidates) if (pathExists(p)) return { cmd: p, useWSL: false };
    const wsl = which('wsl.exe');
    if (wsl) return { cmd: wsl, useWSL: true };
    const fromPath = which('rsync.exe') || which('rsync');
    if (fromPath) return { cmd: fromPath, useWSL: false };
    return { cmd: 'rsync', useWSL: false };
  }

  const fromPath = which('rsync');
  return { cmd: fromPath || 'rsync', useWSL: false };
}

export function rsyncSupportsProgress2(cmd: string, useWSL: boolean): boolean {
  const args = useWSL ? ['bash', '-lc', 'rsync --version'] : ['--version'];
  const res = spawnSync(cmd, args, { encoding: 'utf8' });
  if (res.status !== 0) return false;
  const out = res.stdout || res.stderr || '';
  const m = out.match(/rsync\s+version\s+(\d+)\.(\d+)\.(\d+)/i);
  if (!m) return false;
  const major = parseInt(m[1], 10), minor = parseInt(m[2], 10);
  jl('debug', 'rsync.version.stdout', { cmd, useWSL, status: res.status, out: (res.stdout || '').split('\n')[0] });
  return major > 3 || (major === 3 && minor >= 1);
}

function makeDarwinSshWrapper(args: {
  sshBin?: string;
  port?: number;
  keyPath?: string;
  knownHosts: string;
}): string {
  const ssh = args.sshBin || '/usr/bin/ssh'; // or just 'ssh'
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rs-ssh-'));
  const wrapper = path.join(tmp, 'sshwrap.sh');

  const q = (s: string) => `"${s.replace(/"/g, '\\"')}"`; // defensive

  const lines: string[] = [];
  lines.push('#!/bin/sh');
  // Uncomment to debug argv coming from rsync:
  // lines.push('echo "[sshwrap] $0 $@" >> ' + q(path.join(tmp, 'sshwrap.log')));

  const parts: string[] = [ssh];

  if (args.port) parts.push('-p', String(args.port));
  if (args.keyPath) {
    // Use -i "path with spaces" + force identity-only
    parts.push('-i', q(args.keyPath), '-o', 'IdentitiesOnly=yes');
  }

  parts.push(
    '-o', 'BatchMode=yes',
    '-o', 'PreferredAuthentications=publickey',
    '-o', 'StrictHostKeyChecking=accept-new',
    '-o', `UserKnownHostsFile=${q(args.knownHosts)}`,
    '-o', 'ConnectTimeout=10',
    '-o', 'ServerAliveInterval=15',
    '-o', 'ServerAliveCountMax=2'
  );

  // pass through whatever rsync adds (host, command, etc.)
  parts.push('"$@"');

  lines.push(parts.join(' '), '');
  fs.writeFileSync(wrapper, lines.join('\n'), { mode: 0o700 });
  return wrapper;
}

export function buildRsyncCmdAndArgs(o: RsyncStartOpts): { cmd: string; args: string[]; useWSL: boolean } {
  const pick = findRsyncPath();
  const supportsP2 = rsyncSupportsProgress2(pick.cmd, pick.useWSL);

  const fallbackKH = path.join(process.env.HOME || process.env.USERPROFILE || '', '.ssh', 'known_hosts');
  const knownHosts = o.knownHostsPath || fallbackKH;

  const baseArgs = [
    '-az',
    '--human-readable',
    '--partial',
    '--inplace',
    supportsP2 ? '--info=progress2' : '--progress',
  ];
  if (o.bwlimitKb && o.bwlimitKb > 0) baseArgs.push(`--bwlimit=${o.bwlimitKb}`);
  if (o.extraArgs?.length) baseArgs.push(...o.extraArgs);

  const srcIsDir = (() => { try { return fs.statSync(o.src).isDirectory(); } catch { return false; } })();
  const srcFinalRaw = srcIsDir ? (o.src.endsWith('/') ? o.src : o.src + '/') : o.src;
  const dest = `${o.user}@${o.host}:${o.destDir.endsWith('/') ? o.destDir : o.destDir + '/'}`;

  if (pick.useWSL) {
    const toWSL = (p: string) => p.replace(/\\/g, '/').replace(/^([A-Za-z]):\//, (_m, d) => `/mnt/${String(d).toLowerCase()}/`);
    const srcWSL  = toWSL(srcFinalRaw);
    const destWSL = dest;

    const wrapper = [
      'ssh',
      o.port ? `-p ${o.port}` : '',
      o.keyPath ? `-o IdentityFile='${toWSL(o.keyPath)}' -o IdentitiesOnly=yes` : '',
      '-o BatchMode=yes',
      '-o PreferredAuthentications=publickey',
      '-o StrictHostKeyChecking=accept-new',
      `-o UserKnownHostsFile='${toWSL(knownHosts)}'`,
      '-o ConnectTimeout=10',
      '-o ServerAliveInterval=15',
      '-o ServerAliveCountMax=2'
    ].filter(Boolean).join(' ');

    const baseArgsWSL = [...baseArgs, '-e', wrapper];

    const cmdline = [
      'rsync',
      ...baseArgsWSL.map(a => a.includes(' ') ? `'${a.replace(/'/g, `'\\''`)}'` : a),
      srcWSL.includes(' ') ? `'${srcWSL.replace(/'/g, `'\\''`)}'` : srcWSL,
      destWSL.includes(' ') ? `'${destWSL.replace(/'/g, `'\\''`)}'` : destWSL,
    ].join(' ');

    return { cmd: pick.cmd, args: ['bash', '-lc', cmdline], useWSL: true };
  }

  // ── macOS: wrapper script to avoid spaces/quoting issues ────────────────────
  if (process.platform === 'darwin') {
    const wrapperPath = makeDarwinSshWrapper({
      port: o.port,
      keyPath: o.keyPath,
      knownHosts
    });
    const args = [...baseArgs, '-e', wrapperPath, srcFinalRaw, dest];
    return { cmd: pick.cmd, args, useWSL: false };
  }

  // ── Windows: use SCP over SSH ────────────────────────────────────────────────
  if (process.platform === 'win32') {
    const scp = findScpPath();

    const srcIsDir = (() => { try { return fs.statSync(o.src).isDirectory(); } catch { return false; } })();
    const srcFinal = o.src; // raw Windows path; passing as separate arg avoids quoting issues

    const fallbackKH = path.join(process.env.HOME || process.env.USERPROFILE || '', '.ssh', 'known_hosts');
    const knownHosts = o.knownHostsPath || fallbackKH;

    // Remote destination uses POSIX form (as with rsync): user@host:/dir/
    const destRemote = `${o.user}@${o.host}:${ensureTrailingSlash(o.destDir).replace(/\\/g, '/')}`;

    const args: string[] = [];

    // Recurse if directory
    if (srcIsDir) args.push('-r');

    // Progress is shown by default in a console; add -v if you want noisy logs:
    // args.push('-v');

    // Bandwidth limit: scp expects Kbit/s; our value is KB/s
    if (o.bwlimitKb && o.bwlimitKb > 0) {
      const kbit = Math.max(1, o.bwlimitKb * 8);
      args.push('-l', String(kbit));
    }

    // Port/key/ssh options (mirror your rsync ssh settings)
    if (o.port) args.push('-P', String(o.port)); // NOTE: scp uses uppercase -P
    if (o.keyPath) args.push('-i', o.keyPath);

    args.push(
      '-o', 'BatchMode=yes',
      '-o', 'IdentitiesOnly=yes',
      '-o', 'PreferredAuthentications=publickey',
      '-o', 'StrictHostKeyChecking=accept-new',
      '-o', `UserKnownHostsFile=${knownHosts}`,
      '-o', 'ConnectTimeout=10',
      '-o', 'ServerAliveInterval=15',
      '-o', 'ServerAliveCountMax=2'
    );

    // src then dest
    args.push(srcFinal, destRemote);

    return { cmd: scp, args, useWSL: false };
  }

  // ── Linux native ────────────────────────────────────────────────────────────
  const sshParts = ['ssh'];
  if (o.port) sshParts.push('-p', String(o.port));
  if (o.keyPath) sshParts.push('-i', o.keyPath, '-o', 'IdentitiesOnly=yes'); // Linux fine with -i
  sshParts.push(
    '-o', 'BatchMode=yes',
    '-o', 'PreferredAuthentications=publickey',
    '-o', 'StrictHostKeyChecking=accept-new',
    '-o', `UserKnownHostsFile=${knownHosts}`,
    '-o', 'ConnectTimeout=10',
    '-o', 'ServerAliveInterval=15',
    '-o', 'ServerAliveCountMax=2'
  );

  const args = [...baseArgs, '-e', sshParts.join(' '), srcFinalRaw, dest];
  return { cmd: pick.cmd, args, useWSL: false };
}
