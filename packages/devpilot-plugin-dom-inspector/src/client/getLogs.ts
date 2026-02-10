import type { ConsoleLogEntry, DomInspectorServerMethods } from '../shared-types';
import { getDevpilotClient } from 'unplugin-devpilot/client';

const pendingLogs: ConsoleLogEntry[] = [];

let syncTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleSyncToStorage() {
  if (syncTimer) { return; }
  syncTimer = setTimeout(() => {
    syncTimer = null;
    flushPendingLogs();
  }, 300);
}

function flushPendingLogs(): void {
  if (pendingLogs.length === 0) { return; }
  const client = getDevpilotClient<DomInspectorServerMethods>();
  if (!client) { return; }
  const batch = pendingLogs.splice(0);
  client.rpcCall('appendLogs', batch).catch(() => {});
}

function captureConsoleLogs() {
  const levels: Array<'error' | 'warn' | 'info' | 'debug'> = ['error', 'warn', 'info', 'debug'];

  levels.forEach((level) => {
    const originalMethod = console[level];

    console[level] = function (...args: any[]) {
      originalMethod.apply(console, args);

      const timestamp = Date.now();
      let message = '';

      try {
        message = args.map((arg) => {
          if (typeof arg === 'object') {
            try {
              return JSON.stringify(arg);
            }
            catch {
              return String(arg);
            }
          }
          return String(arg);
        }).join(' ');
      }
      catch {
        message = 'Unable to serialize log message';
      }

      const logEntry: ConsoleLogEntry = {
        level,
        message,
        timestamp,
        args: level === 'error'
          ? args
          : undefined,
      };

      if (level === 'error' && args[0] instanceof Error) {
        logEntry.stack = args[0].stack;
      }

      pendingLogs.push(logEntry);
      scheduleSyncToStorage();
    };
  });

  window.addEventListener('error', (event: ErrorEvent) => {
    pendingLogs.push({
      level: 'error',
      message: `${event.message} at ${event.filename}:${event.lineno}:${event.colno}`,
      timestamp: Date.now(),
      stack: event.error?.stack,
    });
    scheduleSyncToStorage();
  });

  window.addEventListener('unhandledrejection', (event: PromiseRejectionEvent) => {
    pendingLogs.push({
      level: 'error',
      message: `Unhandled Promise Rejection: ${String(event.reason)}`,
      timestamp: Date.now(),
      stack: event.reason instanceof Error
        ? event.reason.stack
        : undefined,
    });
    scheduleSyncToStorage();
  });
}

captureConsoleLogs();
