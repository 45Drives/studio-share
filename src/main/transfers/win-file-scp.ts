// src/main/transfers/win-scp.ts
import fs from 'fs';
import path from 'path';
import { spawn } from 'node:child_process';

export type WinScpOpts = {
    id: string;
    src: string;                 // file or directory
    host: string;
    user: string;
    destDir: string;             // remote POSIX directory
    port?: number;
    keyPath?: string;
    knownHostsPath?: string;
    onProgress?: (pct?: number, sentBytes?: number, totalBytes?: number) => void; // best-effort (single-file)
};

export async function runWinScp(o: WinScpOpts): Promise<number> {
    const st = fs.statSync(o.src);
    const scp = findScp();
    const args = buildScpArgs({
        isDir: st.isDirectory(),
        port: o.port,
        keyPath: o.keyPath,
        knownHostsPath: o.knownHostsPath
    });

    const destDir = o.destDir.replace(/\\/g, '/').replace(/\/+$/, '');
    const remote = `${o.user}@${o.host}:${destDir}/`;

    // Optional remote polling for single large file
    const singleFile = st.isFile();
    const total = singleFile ? st.size : undefined;
    let poller: NodeJS.Timeout | undefined;
    let done = false;

    if (singleFile && o.onProgress) {
        const remotePath = `${destDir}/${path.basename(o.src)}`;
        poller = setInterval(async () => {
            if (done) return;
            try {
                const bytes = await remoteSize(o.host, o.user, remotePath, o.keyPath, o.port);
                const pct = total && total > 0 ? (bytes / total) * 100 : undefined;
                o.onProgress!(
                    typeof pct === 'number' ? Math.max(0, Math.min(100, pct)) : undefined,
                    bytes,
                    total
                );
            } catch { /* ignore */ }
        }, 400);
    }

    return new Promise<number>((resolve, reject) => {
        const child = spawn(scp, [...args, o.src, remote], {
            stdio: ['ignore', 'ignore', 'pipe'],
            windowsHide: true,
        });

        let err = '';
        child.stderr.on('data', d => { err += String(d); });

        child.on('error', (e) => {
            if (poller) clearInterval(poller);
            reject(e);
        });
        child.on('close', (code) => {
            done = true;
            if (poller) clearInterval(poller);
            // fire final 100% for single file
            if (singleFile && o.onProgress && typeof total === 'number') {
                o.onProgress(100, total, total);
            }

            if (code === 0) resolve(0);
            else reject(new Error(err.trim() || `scp exited ${code}`));
        });
    });
}

function findScp(): string {
    const cands = [
        'C:\\Windows\\System32\\OpenSSH\\scp.exe',
        'scp'
    ];
    for (const c of cands) {
        try {
            if (c.includes(':') || c.startsWith('\\')) {
                if (fs.existsSync(c)) return c;
            } else {
                return c;
            }
        } catch { }
    }
    return 'scp';
}

function buildScpArgs(o: { isDir: boolean; port?: number; keyPath?: string; knownHostsPath?: string }) {
    const args: string[] = ['-p']; // preserve times/mode
    if (o.isDir) args.push('-r');
    if (o.port) args.push('-P', String(o.port));
    if (o.keyPath) args.push('-i', o.keyPath, '-o', 'IdentitiesOnly=yes');
    if (o.knownHostsPath) args.push('-o', `UserKnownHostsFile=${o.knownHostsPath}`);
    args.push(
        '-o', 'BatchMode=yes',
        '-o', 'StrictHostKeyChecking=accept-new',
    );
    return args;
}

function remoteSize(host: string, user: string, remotePath: string, keyPath?: string, port?: number): Promise<number> {
    return new Promise<number>((resolve) => {
        const ssh = findSsh();
        const args: string[] = [];
        if (port) args.push('-p', String(port));
        if (keyPath) args.push('-i', keyPath, '-o', 'IdentitiesOnly=yes');
        args.push('-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=accept-new');

        const cmd = `bash -lc "stat -c %s ${remotePath.replace(/"/g, '\\"')}"`;
        const child = spawn(ssh, [...args, `${user}@${host}`, cmd], { stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true });

        let out = '';
        child.stdout.on('data', d => out += String(d));
        child.on('close', () => resolve(Number(out.trim()) || 0));
        child.on('error', () => resolve(0));
    });
}

function findSsh(): string {
    const cands = ['C:\\Windows\\System32\\OpenSSH\\ssh.exe', 'ssh'];
    for (const c of cands) {
        try {
            if (c.includes(':') || c.startsWith('\\')) {
                if (fs.existsSync(c)) return c;
            } else {
                return c;
            }
        } catch { }
    }
    return 'ssh';
}
