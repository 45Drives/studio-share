// src/renderer/composables/useLog.ts
// Structured logging composable for the renderer process.
// Routes events to the main-process Winston logger via window.appLog (Electron)
// or falls back to console in web/dev mode.

type LogData = Record<string, unknown>;

function send(level: 'info' | 'warn' | 'error', event: string, data?: LogData) {
  const appLog = (window as any).appLog;
  if (appLog?.[level]) {
    appLog[level](event, data);
  } else {
    // Fallback for web dev mode / non-Electron
    const fn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
    fn(`[${level}] ${event}`, data ?? '');
  }
}

export function useLog() {
  return {
    info: (event: string, data?: LogData) => send('info', event, data),
    warn: (event: string, data?: LogData) => send('warn', event, data),
    error: (event: string, data?: LogData) => send('error', event, data),
  };
}

/** Standalone (non-composable) logger for use outside setup() */
export const appLog = {
  info: (event: string, data?: LogData) => send('info', event, data),
  warn: (event: string, data?: LogData) => send('warn', event, data),
  error: (event: string, data?: LogData) => send('error', event, data),
};
