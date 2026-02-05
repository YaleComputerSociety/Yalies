import { env } from "@ycs/config";

type LogLevel = "debug" | "info" | "warn" | "error";

const levelOrder: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40
};

type LogPayload = {
  level: LogLevel;
  service: string;
  message: string;
  timestamp: string;
  meta?: Record<string, unknown>;
};

const shouldLog = (level: LogLevel): boolean =>
  levelOrder[level] >= levelOrder[env.LOG_LEVEL];

/**
 * Create a structured JSON logger scoped to a service.
 */
export const createLogger = (service: string) => {
  const log = (level: LogLevel, message: string, meta?: Record<string, unknown>) => {
    if (!shouldLog(level)) {
      return;
    }

    const payload: LogPayload = {
      level,
      service,
      message,
      timestamp: new Date().toISOString(),
      meta
    };

    process.stdout.write(`${JSON.stringify(payload)}\n`);
  };

  return {
    debug: (message: string, meta?: Record<string, unknown>) => log("debug", message, meta),
    info: (message: string, meta?: Record<string, unknown>) => log("info", message, meta),
    warn: (message: string, meta?: Record<string, unknown>) => log("warn", message, meta),
    error: (message: string, meta?: Record<string, unknown>) => log("error", message, meta)
  };
};
