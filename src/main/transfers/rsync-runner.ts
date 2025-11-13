// src/main/rsync/rsync-runner.ts
import { spawn, ChildProcessWithoutNullStreams } from 'node:child_process';
import type { BrowserWindow } from 'electron';

export type RunOpts = {
  id: string;
  cmd: string;
  args: string[];
  env?: NodeJS.ProcessEnv;
  win?: BrowserWindow; // to send IPC events
  onLine?: (line: string) => void; // optional
  onProgress?: (parsed: any) => void; // optional parsed progress
  logger?: { info: Function; warn: Function; error: Function };
};

// same parser you already have
export function parseProgress(line: string) {
  const percentMatch = line.match(/(\d+(?:\.\d+)?)%/);
  const rateMatch    = line.match(/([0-9.]+)\s*([KMG]i?)B\/s/i);
  const etaMatch     = line.match(/\b(\d+:\d{2}:\d{2})\b/);
  const bytesMatch   = line.trim().match(/^(\d[\d,]*)\s+/);
  return {
    percent: percentMatch ? Number(percentMatch[1]) : undefined,
    rate: rateMatch ? `${rateMatch[1]} ${rateMatch[2]}B/s` : undefined,
    eta: etaMatch ? etaMatch[1] : undefined,
    bytesTransferred: bytesMatch ? Number(bytesMatch[1].replace(/,/g, '')) : undefined,
    raw: line,
  };
}

export function runRsync(opts: RunOpts): Promise<number> {
  const { id, cmd, args, env, win, onLine, onProgress, logger } = opts;

  logger?.info({ event: 'rsync.exec', id, cmd, args });

  const child: ChildProcessWithoutNullStreams = spawn(cmd, args, {
    env: { ...process.env, LC_ALL: 'C', LANG: 'C', COLUMNS: '200', ...env },
    windowsHide: true,
  });

  let buf = '';

  const emit = (parsed: any) => {
    onProgress?.(parsed);
    win?.webContents?.send(`upload:progress:${id}`, parsed);
  };

  child.stderr.on('data', (chunk) => {
    buf += chunk.toString().replace(/\r/g, '\n');
    const lines = buf.split('\n');
    buf = lines.pop() || '';
    for (const line of lines) {
      const t = line.trim();
      if (!t) continue;
      onLine?.(t);
      logger?.info({ event: 'rsync.out', id, line: t });
      emit(parseProgress(t));
    }
  });

  child.stdout.on('data', (chunk) => {
    const line = String(chunk).trim();
    if (!line) return;
    onLine?.(line);
    logger?.info({ event: 'rsync.out.stdout', id, line });
    emit({ raw: line });
  });

  return new Promise((resolve, reject) => {
    child.on('error', (err) => {
      logger?.error({ event: 'rsync.spawn.error', id, error: err?.message || String(err) });
      reject(err);
    });
    child.on('close', (code) => {
      logger?.info({ event: 'rsync.exit', id, code });
      resolve(code ?? -1);
    });
  });
}
