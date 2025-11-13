// src/main/transfers/win-file-ssh.ts
import fs from 'fs';
import path from 'path';
import { spawn } from 'node:child_process';

export type WinSshCopyOpts = {
    id: string;
    src: string;                 // local FILE path
    host: string;
    user: string;
    destDir: string;             // remote POSIX directory
    port?: number;
    keyPath?: string;            // OpenSSH key
    knownHostsPath?: string;
    bwlimitKb?: number;          // throttle chunk size (KB/s) best-effort
    onProgress?: (pct: number, sent: number, total: number) => void;
};

export async function runWinSshCopyFile(o: WinSshCopyOpts): Promise<number> {
    const stat = fs.statSync(o.src);
    if (!stat.isFile()) throw new Error('win-file-ssh: src must be a file');

    const total = stat.size;
    const name = path.basename(o.src);

    // permissions + times to preserve
    const mode = (stat.mode & 0o777).toString(8);     // e.g. "0644"
    const mtimeSec = Math.floor(stat.mtimeMs / 1000); // GNU touch -d @EPOCH works on Linux servers

    const remoteDir = o.destDir.replace(/\\/g, '/').replace(/\/+$/, '');
    const remoteFinal = `${remoteDir}/${name}`;
    const remoteTmp = `${remoteFinal}.part-${Date.now()}`;

    const sshExe = findWindowsSsh();
    const sshArgs = buildSshArgs({
        port: o.port,
        keyPath: o.keyPath,
        knownHostsPath: o.knownHostsPath,
    });

    // Remote shell: ensure dir, write to tmp, set metadata, atomic move
    const remoteCmd =
        `bash -lc 'set -euo pipefail; ` +
        `mkdir -p ${sq(remoteDir)}; ` +
        `cat > ${sq(remoteTmp)}; ` +
        `chmod ${mode} ${sq(remoteTmp)}; ` +
        `touch -d @${mtimeSec} ${sq(remoteTmp)}; ` +
        `mv -f ${sq(remoteTmp)} ${sq(remoteFinal)}'`;

    const child = spawn(sshExe, [...sshArgs, `${o.user}@${o.host}`, remoteCmd], {
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
    });

    let sent = 0;
    let lastEmit = 0;

    const highWaterMark = (() => {
        if (o.bwlimitKb && o.bwlimitKb > 0) {
            const kb = Math.max(8, Math.min(o.bwlimitKb, 1024)); // clamp 8KB..1MB
            return kb * 1024;
        }
        return 1024 * 1024;
    })();

    const rs = fs.createReadStream(o.src, { highWaterMark });

    function emit() {
        if (!o.onProgress) return;
        const now = Date.now();
        if (now - lastEmit < 90) return; // coalesce a bit
        lastEmit = now;
        const pct = total ? (sent / total) * 100 : 0;
        o.onProgress(Math.min(100, pct), sent, total);
    }

    return new Promise<number>((resolve, reject) => {
        rs.on('data', (chunk) => {
            sent += chunk.length;
            if (!child.stdin.write(chunk)) rs.pause();
            emit();
        });
        child.stdin.on('drain', () => rs.resume());

        rs.on('error', (e) => {
            try { child.stdin.destroy(); } catch { }
            try { child.kill('SIGINT'); } catch { }
            reject(e);
        });

        rs.on('end', () => {
            try { child.stdin.end(); } catch { }
        });

        let stderrBuf = '';
        child.stderr.on('data', (d) => { stderrBuf += String(d); });

        child.on('error', reject);
        child.on('close', (code) => {
            if (o.onProgress) o.onProgress(100, total, total);
            if (code === 0) resolve(0);
            else reject(new Error(stderrBuf.trim() || `ssh exited ${code}`));
        });
    });
}

function findWindowsSsh(): string {
    const cands = [
        'C:\\Windows\\System32\\OpenSSH\\ssh.exe',
        'ssh'
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
    return 'ssh';
}

function buildSshArgs(o: { port?: number; keyPath?: string; knownHostsPath?: string; }) {
    const args: string[] = [];
    if (o.port) args.push('-p', String(o.port));
    if (o.keyPath) args.push('-i', o.keyPath, '-o', 'IdentitiesOnly=yes');
    if (o.knownHostsPath) args.push('-o', `UserKnownHostsFile=${o.knownHostsPath}`);
    args.push(
        '-o', 'BatchMode=yes',
        '-o', 'PreferredAuthentications=publickey',
        '-o', 'StrictHostKeyChecking=accept-new',
        '-o', 'ConnectTimeout=10',
        '-o', 'ServerAliveInterval=15',
        '-o', 'ServerAliveCountMax=2'
    );
    return args;
}

function sq(s: string) { return `'${s.replace(/'/g, `'\\''`)}'`; }
