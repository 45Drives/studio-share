// src/main/transfers/win-file-sftp.ts
import fs from 'fs';
import path from 'path';
import SftpClient from 'ssh2-sftp-client';
import { jl } from '../main';

// Match the rsync progress object shape
export type TransferProgress = {
  percent?: number;
  rate?: string;
  eta?: string;
  bytesTransferred?: number;
  raw?: string;
};

export type WinSftpOpts = {
  id: string;
  src: string;
  host: string;
  user: string;
  destDir: string;
  port?: number;
  keyPath?: string;
  // Same as RunOpts.onProgress in rsync-runner
  onProgress?: (p: TransferProgress) => void;
};

export async function runWinSftp(o: WinSftpOpts): Promise<number> {
  jl('info', 'sftp.start', {
    id: o.id,
    src: o.src,
    destDir: o.destDir,
    host: o.host,
    user: o.user,
  });

  const st = fs.statSync(o.src);
  const isDir = st.isDirectory();

  const destDir = o.destDir.replace(/\\/g, '/').replace(/\/+$/, '');
  const privateKey = o.keyPath ? fs.readFileSync(o.keyPath) : undefined;

  const sftp = new SftpClient();

  // This emitter converts raw byte counts into the rsync-like progress object
  const emitProgress = makeSftpProgressEmitter(o.id, o.onProgress);

  try {
    await sftp.connect({
      host: o.host,
      port: o.port ?? 22,
      username: o.user,
      privateKey,
    });

    jl('info', 'sftp.connected', { id: o.id });

    if (isDir) {
      jl('info', 'sftp.dir.upload.start', { id: o.id, src: o.src });
      await uploadDirSftp(sftp, o.src, destDir, emitProgress, o.id);
    } else {
      jl('info', 'sftp.file.upload.start', { id: o.id, src: o.src });
      await uploadSingleFileSftp(sftp, o.src, destDir, emitProgress, o.id);
    }

    jl('info', 'sftp.complete', { id: o.id });
    return 0;
  } catch (err: any) {
    jl('error', 'sftp.error', { id: o.id, error: err?.message || String(err) });
    throw err;
  } finally {
    try {
      await sftp.end();
      jl('info', 'sftp.closed', { id: o.id });
    } catch {
      jl('warn', 'sftp.close.error', { id: o.id });
    }
  }
}

function makeSftpProgressEmitter(
  id: string,
  onProgress?: (p: TransferProgress) => void
) {
  const startTime = Date.now();
  let lastPercent = -1;

  return (sentBytes: number, totalBytes: number) => {
    const now = Date.now();
    const elapsed = (now - startTime) / 1000; // seconds

    let rate: string | undefined;
    let eta: string | undefined;

    if (elapsed > 0 && sentBytes >= 0) {
      const bps = sentBytes / elapsed;
      const kbps = bps / 1024;
      const mbps = kbps / 1024;

      if (mbps >= 1) {
        rate = `${mbps.toFixed(2)}MB/s`;
      } else if (kbps >= 1) {
        rate = `${kbps.toFixed(1)}kB/s`;
      } else {
        rate = `${bps.toFixed(0)}B/s`;
      }

      if (totalBytes > 0 && sentBytes > 0 && sentBytes <= totalBytes && bps > 0) {
        const remaining = totalBytes - sentBytes;
        const sec = remaining / bps;
        const h = Math.floor(sec / 3600);
        const m = Math.floor((sec % 3600) / 60);
        const s = Math.floor(sec % 60);
        eta = `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
      }
    }

    const percent =
      totalBytes > 0 ? clampPct((sentBytes / totalBytes) * 100) : undefined;

    const progress: TransferProgress = {
      percent,
      rate,
      eta,
      bytesTransferred: sentBytes,
      raw: `sftp ${sentBytes}/${totalBytes}`,
    };

    // Avoid logging every tiny tick; only when percent changes
    if (percent != null && percent !== lastPercent) {
      lastPercent = percent;
      jl('debug', 'sftp.progress', { id, ...progress });
    }

    onProgress?.(progress);
  };
}

async function uploadSingleFileSftp(
  sftp: SftpClient,
  localPath: string,
  destDir: string,
  emitProgress: (sentBytes: number, totalBytes: number) => void,
  id: string
) {
  const st = fs.statSync(localPath);
  if (!st.isFile()) {
    jl('error', 'sftp.single.invalid', { id, localPath });
    throw new Error(`uploadSingleFileSftp expected a file, got: ${localPath}`);
  }

  const totalBytes = st.size;
  const remotePath = `${destDir}/${path.basename(localPath)}`;

  jl('info', 'sftp.single.ensureDir', { id, destDir });
  await ensureRemoteDir(sftp, destDir, id);

  jl('info', 'sftp.single.put.start', { id, localPath, remotePath, totalBytes });

  await sftp.fastPut(localPath, remotePath, {
    step(transferred: number, _chunk: number, total: number) {
      emitProgress(transferred, total);
    },
  });

  jl('info', 'sftp.single.put.done', { id, localPath });

  emitProgress(totalBytes, totalBytes);
}

// ── Directory upload with global progress ─────────────────────────────

type FileInfo = { local: string; remote: string; size: number };

function walkLocalDir(root: string, remoteRoot: string): FileInfo[] {
  const out: FileInfo[] = [];

  function walk(dir: string) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const e of entries) {
      const localPath = path.join(dir, e.name);
      if (e.isDirectory()) {
        walk(localPath);
      } else if (e.isFile()) {
        const st = fs.statSync(localPath);
        const rel = path
          .relative(root, localPath)
          .split(path.sep)
          .join('/'); // POSIX separators
        const remotePath = `${remoteRoot}/${rel}`;
        out.push({ local: localPath, remote: remotePath, size: st.size });
      }
    }
  }

  walk(root);
  return out;
}

async function uploadDirSftp(
  sftp: SftpClient,
  localRoot: string,
  remoteRoot: string,
  emitProgress: (sentBytes: number, totalBytes: number) => void,
  id: string
) {
  const files = walkLocalDir(localRoot, remoteRoot);
  const totalBytes = files.reduce((sum, f) => sum + f.size, 0);
  let globalTransferred = 0;

  jl('info', 'sftp.dir.ensureRoot', { id, remoteRoot });
  await ensureRemoteDir(sftp, remoteRoot, id);

  jl('info', 'sftp.dir.upload.count', { id, files: files.length, totalBytes });

  for (const file of files) {
    const remoteDir = path.posix.dirname(file.remote);
    jl('debug', 'sftp.dir.ensureSubdir', { id, remoteDir });
    await ensureRemoteDir(sftp, remoteDir, id);

    jl('info', 'sftp.dir.file.start', {
      id,
      local: file.local,
      remote: file.remote,
      size: file.size,
    });

    let lastFileTransferred = 0;

    await sftp.fastPut(file.local, file.remote, {
      step(transferred: number, _chunk: number, _total: number) {
        const delta = transferred - lastFileTransferred;
        lastFileTransferred = transferred;

        globalTransferred += delta;
        emitProgress(globalTransferred, totalBytes);
      },
    });

    jl('info', 'sftp.dir.file.done', { id, remote: file.remote });
  }

  jl('info', 'sftp.dir.complete', { id });
  emitProgress(totalBytes, totalBytes);
}

function clampPct(p: number) {
  return Math.max(0, Math.min(100, Math.round(p)));
}

async function ensureRemoteDir(sftp: SftpClient, dir: string, id: string) {
  if (!dir || dir === '.' || dir === '/') return;

  const parts = dir.split('/').filter(Boolean);
  let current = '';
  for (const part of parts) {
    current += '/' + part;
    try {
      const st = await sftp.stat(current);
      if (!st.isDirectory) {
        jl('error', 'sftp.ensureDir.notDir', { id, path: current });
        throw new Error(`Remote path ${current} exists and is not a directory`);
      }
    } catch {
      try {
        jl('debug', 'sftp.ensureDir.mkdir', { id, path: current });
        await sftp.mkdir(current);
      } catch {
        jl('warn', 'sftp.ensureDir.mkdir.race', { id, path: current });
      }
    }
  }
}
