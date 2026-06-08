import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import { AsyncLocalStorage } from 'async_hooks';
import os from 'os';

const { combine, timestamp, colorize, json } = winston.format;

// Request context storage for correlation ID and HTTP metadata
export const requestContext = new AsyncLocalStorage<{
  correlationId: string;
  userId?: string;
  method?: string;
  path?: string;
  statusCode?: number;
  responseTimeMs?: number;
}>();

// Custom format that injects pid, hostname, service, and correlationId into every log entry
const addMetadata = winston.format((info) => {
  info.pid = process.pid;
  info.hostname = os.hostname();
  info.service = 'alsaqi-api';

  const store = requestContext.getStore();
  if (store) {
    info.correlationId = store.correlationId;
    if (store.userId) info.userId = store.userId;
    if (store.method) info.method = store.method;
    if (store.path) info.path = store.path;
    if (store.statusCode) info.statusCode = store.statusCode;
    if (store.responseTimeMs) info.responseTimeMs = store.responseTimeMs;
  }

  return info;
});

// Build file transports for production
const fileTransports: winston.transport[] = [];

if (process.env.NODE_ENV === 'production') {
  // Combined log — daily rotation, 14-day retention
  fileTransports.push(
    new DailyRotateFile({
      filename: '/app/logs/combined-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      maxSize: '20m',
      maxFiles: '14d',
      format: combine(
        timestamp(),
        addMetadata(),
        json()
      ),
    })
  );

  // Error log — size-based rotation, max 5 files
  fileTransports.push(
    new winston.transports.File({
      filename: '/app/logs/error.log',
      level: 'error',
      maxsize: 20 * 1024 * 1024, // 20 MB
      maxFiles: 5,
      format: combine(
        timestamp(),
        addMetadata(),
        json()
      ),
    })
  );
}

const logger = winston.createLogger({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  format: combine(
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    addMetadata(),
    json()
  ),
  defaultMeta: { service: 'alsaqi-api' },
  transports: [
    new winston.transports.Console({
      format: process.env.NODE_ENV === 'production'
        ? combine(timestamp(), addMetadata(), json())
        : combine(colorize(), timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }), winston.format.simple()),
    }),
    ...fileTransports,
  ],
});

export default logger;
