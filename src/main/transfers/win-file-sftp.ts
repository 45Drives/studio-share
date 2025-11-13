// src/main/transfers/win-file-sftp.ts
import fs from 'fs';
import path from 'path';
import SftpClient from 'ssh2-sftp-client';

// Reuse your WinScpOpts shape so you don’t have to touch callers
export type WinSftpOpts = {
  id: string;
  src: string;                
  host: string;
  user: string;
  destDir: string;             // remote POSIX directory
  port?: number;
  keyPath?: string;
  knownHostsPath?: string;     // not used by ssh2-sftp-client, but kept for API symmetry
  onProgress?: (pct?: number, sentBytes?: number, totalBytes?: number) => void;
};

export async function runWinSftp(o: WinSftpOpts): Promise<number> {
    const st = fs.statSync(o.src);
    const isDir = st.isDirectory();
  
    const destDir = o.destDir.replace(/\\/g, '/').replace(/\/+$/, '');
    const privateKey = o.keyPath ? fs.readFileSync(o.keyPath) : undefined;
  
    const sftp = new SftpClient();
  
    await sftp.connect({
      host: o.host,
      port: o.port ?? 22,
      username: o.user,
      privateKey,
      // add passphrase/agent options here if needed
    });
  
    try {
      if (isDir) {
        await uploadDirSftp(sftp, o.src, destDir, o.onProgress);
      } else {
        await uploadSingleFileSftp(sftp, o.src, destDir, o.onProgress);
      }
      return 0;
    } finally {
      try { await sftp.end(); } catch { }
    }
  }

  async function uploadSingleFileSftp(
    sftp: SftpClient,
    localPath: string,
    destDir: string,
    onProgress?: (pct?: number, sentBytes?: number, totalBytes?: number) => void,
  ) {
    const st = fs.statSync(localPath);
    if (!st.isFile()) {
      throw new Error(`uploadSingleFileSftp expected a file, got: ${localPath}`);
    }
  
    const totalBytes = st.size;
    const remotePath = `${destDir}/${path.basename(localPath)}`;
  
    await ensureRemoteDir(sftp, destDir);
  
    await sftp.fastPut(localPath, remotePath, {
      step(transferred: number, _chunk: number, total: number) {
        if (!onProgress) return;
  
        const pct = total > 0 ? (transferred / total) * 100 : undefined;
        onProgress(
          typeof pct === 'number' ? clampPct(pct) : undefined,
          transferred,
          total
        );
      },
    });
  
    if (onProgress) {
      onProgress(100, totalBytes, totalBytes);
    }
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
    onProgress?: (pct?: number, sentBytes?: number, totalBytes?: number) => void,
  ) {
    const files = walkLocalDir(localRoot, remoteRoot);
    const totalBytes = files.reduce((sum, f) => sum + f.size, 0);
    let globalTransferred = 0;
  
    await ensureRemoteDir(sftp, remoteRoot);
  
    for (const file of files) {
      const remoteDir = path.posix.dirname(file.remote);
      await ensureRemoteDir(sftp, remoteDir);
  
      let lastFileTransferred = 0;
  
      await sftp.fastPut(file.local, file.remote, {
        step(transferred: number, _chunk: number, _total: number) {
          if (!onProgress) return;
  
          const delta = transferred - lastFileTransferred;
          lastFileTransferred = transferred;
  
          globalTransferred += delta;
          const pct = totalBytes > 0 ? (globalTransferred / totalBytes) * 100 : undefined;
  
          onProgress(
            typeof pct === 'number' ? clampPct(pct) : undefined,
            globalTransferred,
            totalBytes
          );
        },
      });
    }
  
    if (onProgress) {
      onProgress(100, totalBytes, totalBytes);
    }
  }
  
function clampPct(p: number) {
  return Math.max(0, Math.min(100, p));
}

async function ensureRemoteDir(sftp: SftpClient, dir: string) {
  if (!dir || dir === '.' || dir === '/') return;

  const parts = dir.split('/').filter(Boolean);
  let current = '';
  for (const part of parts) {
    current += '/' + part;
    try {
      const st = await sftp.stat(current);
      if (!st.isDirectory) {
        throw new Error(`Remote path ${current} exists and is not a directory`);
      }
    } catch {
      try { await sftp.mkdir(current); } catch { /* ignore race */ }
    }
  }
}
