// src/main/rsync/rsync-runner.ts
import { spawn, ChildProcessWithoutNullStreams } from 'node:child_process';
import type { BrowserWindow } from 'electron';
import { jl } from '../main';

export type RunOpts = {
  id: string;
  cmd: string;
  args: string[];
  env?: NodeJS.ProcessEnv;
  win?: BrowserWindow; // to send IPC events
  onLine?: (line: string) => void;
  onProgress?: (parsed: any) => void;
};

export type RunHandle = {
  child: ChildProcessWithoutNullStreams;
  done: Promise<number>;
};

// Parse rsync progress lines like:
// "73.01M   6%   69.59MB/s    0:00:14"
export function parseProgress(line: string) {
  const percentMatch = line.match(/(\d+(?:\.\d+)?)%/);
  const rateMatch = line.match(/([0-9.]+)\s*([KMG]i?)B\/s/i);
  const etaMatch = line.match(/\b(\d+:\d{2}:\d{2})\b/);
  const bytesMatch = line.trim().match(/^(\d[\d,]*)\s+/);

  return {
    percent: percentMatch ? Number(percentMatch[1]) : undefined,
    // Format as "69.59 MB/s", "70.0 kB/s", etc
    rate: rateMatch ? `${rateMatch[1]} ${rateMatch[2]}B/s` : undefined,
    eta: etaMatch ? etaMatch[1] : undefined,
    bytesTransferred: bytesMatch ? Number(bytesMatch[1].replace(/,/g, '')) : undefined,
    raw: line,
  };
}

export function runRsync(opts: RunOpts): RunHandle {
  const { id, cmd, args, env, win, onLine, onProgress } = opts;

  jl('info', 'rsync.exec', { id, cmd, args });

  const child: ChildProcessWithoutNullStreams = spawn(cmd, args, {
    env: { ...process.env, LC_ALL: 'C', LANG: 'C', COLUMNS: '200', ...env },
    windowsHide: true,
  });

  let bufErr = '';

  const emit = (parsed: any) => {
    onProgress?.(parsed);
    win?.webContents?.send(`upload:progress:${id}`, parsed);
  };

  child.stderr.on('data', (chunk) => {
    bufErr += chunk.toString().replace(/\r/g, '\n');
    const lines = bufErr.split('\n');
    bufErr = lines.pop() || '';
    for (const line of lines) {
      const t = line.trim();
      if (!t) continue;
      onLine?.(t);
      jl('info', 'rsync.out', { id, line: t });
      emit(parseProgress(t));
    }
  });

  child.stdout.on('data', (chunk) => {
    const text = chunk.toString().replace(/\r/g, '\n');
    const lines = text.split('\n');
    for (const line of lines) {
      const t = line.trim();
      if (!t) continue;
      onLine?.(t);
      jl('info', 'rsync.out.stdout', { id, line: t });
      emit(parseProgress(t));
    }
  });

  const done = new Promise<number>((resolve, reject) => {
    child.on('error', (err) => {
      jl('error', 'rsync.spawn.error', { id, error: err?.message || String(err) });
      reject(err);
    });
    child.on('close', (code) => {
      jl('info', 'rsync.exit', { id, code });
      resolve(code ?? -1);
    });
  });

  return { child, done };
}
