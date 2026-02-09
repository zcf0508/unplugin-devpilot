import type { ConsoleLogEntry, GetLogsResult } from '../shared-types';

// Store captured logs
const capturedLogs: ConsoleLogEntry[] = [];
const maxLogBufferSize = 1000;

// Note: STRUCTURAL_ROLES removed as they were not used in the current implementation

// Capture console logs
function captureConsoleLogs() {
  const levels: Array<'error' | 'warn' | 'info' | 'debug'> = ['error', 'warn', 'info', 'debug'];

  levels.forEach((level) => {
    const originalMethod = console[level];

    console[level] = function (...args: any[]) {
      // Call original method
      originalMethod.apply(console, args);

      // Capture the log
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

      // Capture stack trace for errors
      if (level === 'error' && args[0] instanceof Error) {
        logEntry.stack = args[0].stack;
      }

      capturedLogs.push(logEntry);

      // Keep buffer size manageable
      if (capturedLogs.length > maxLogBufferSize) {
        capturedLogs.shift();
      }
    };
  });

  // Capture window errors
  window.addEventListener('error', (event: ErrorEvent) => {
    const logEntry: ConsoleLogEntry = {
      level: 'error',
      message: `${event.message} at ${event.filename}:${event.lineno}:${event.colno}`,
      timestamp: Date.now(),
      stack: event.error?.stack,
    };

    capturedLogs.push(logEntry);

    if (capturedLogs.length > maxLogBufferSize) {
      capturedLogs.shift();
    }
  });

  // Capture unhandled promise rejections
  window.addEventListener('unhandledrejection', (event: PromiseRejectionEvent) => {
    const logEntry: ConsoleLogEntry = {
      level: 'error',
      message: `Unhandled Promise Rejection: ${String(event.reason)}`,
      timestamp: Date.now(),
      stack: event.reason instanceof Error
        ? event.reason.stack
        : undefined,
    };

    capturedLogs.push(logEntry);

    if (capturedLogs.length > maxLogBufferSize) {
      capturedLogs.shift();
    }
  });
}

// Create extended RPC handlers for the DOM inspector - Note: captureConsoleLogs() will be called when this module is imported
captureConsoleLogs();

export async function getLogs(
  options?: {
    level?: 'all' | 'error' | 'warn' | 'info' | 'debug'
    limit?: number
    keyword?: string
    regex?: string
  },
): Promise<GetLogsResult> {
  try {
    const { level = 'all', limit = 100, keyword, regex } = options || {};

    // Filter logs by level
    let filteredLogs = capturedLogs;
    if (level !== 'all') {
      filteredLogs = capturedLogs.filter(log => log.level === level);
    }

    // Filter by keyword (case-insensitive substring match)
    if (keyword) {
      const lowerKeyword = keyword.toLowerCase();
      filteredLogs = filteredLogs.filter(log =>
        log.message.toLowerCase().includes(lowerKeyword),
      );
    }

    // Filter by regex pattern
    if (regex) {
      try {
        const regexPattern = new RegExp(regex);
        filteredLogs = filteredLogs.filter(log =>
          regexPattern.test(log.message),
        );
      }
      catch (e) {
        // Invalid regex pattern - return empty result with error
        return {
          success: false,
          error: `Invalid regex pattern: ${e instanceof Error
            ? e.message
            : String(e)}`,
          logs: [],
          total: capturedLogs.length,
          filtered: 0,
          level,
          keyword,
          regex,
        };
      }
    }

    // Apply limit
    const limitedLogs = filteredLogs.slice(-limit);

    return {
      success: true,
      logs: limitedLogs,
      total: capturedLogs.length,
      filtered: limitedLogs.length,
      level,
      keyword,
      regex,
    };
  }
  catch (error) {
    return {
      success: false,
      error: error instanceof Error
        ? error.message
        : String(error),
      logs: [],
      total: 0,
      filtered: 0,
      level: options?.level || 'all',
      keyword: options?.keyword,
      regex: options?.regex,
    };
  }
}

/**
 * Clear all captured logs
 * This is useful for testing purposes
 */
export function clearLogs(): void {
  capturedLogs.length = 0;
}
