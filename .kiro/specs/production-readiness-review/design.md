# Design Document: Production Readiness Review

## Overview

This design addresses 11 production-readiness requirements across CI/CD automation, observability, security hardening, error tracking, performance validation, and infrastructure finalization for the AL-SAQI internal audit management system. The implementation extends existing infrastructure (Docker Compose, Winston logger, ErrorBoundary, BullMQ, Nginx proxy) rather than replacing it.

## Architecture

### System Context

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         GitLab CI/CD Pipeline                           │
│  [validate] → [test] → [build] → [deploy] → [smoke-load-test]         │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                      Docker Compose (Production)                        │
│                                                                         │
│  ┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────────────┐   │
│  │  Nginx   │──▶│   API    │   │   Web    │   │   Prometheus     │   │
│  │  Proxy   │   │  Server  │──▶│ Frontend │   │   + Grafana      │   │
│  └──────────┘   └──────────┘   └──────────┘   └──────────────────┘   │
│       │              │                                │                 │
│       │              ▼                                │                 │
│       │    ┌──────────────────┐                      │                 │
│       │    │  PostgreSQL      │                      │                 │
│       │    │  + Backup Svc    │                      │                 │
│       │    └──────────────────┘                      │                 │
│       │              │                                │                 │
│       ▼              ▼                                ▼                 │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────────┐      │
│  │  Loki    │  │  MinIO   │  │  Redis   │  │  Alertmanager    │      │
│  │ (Logs)   │  │(Objects) │  │ (Queue)  │  │  (Notifications) │      │
│  └──────────┘  └──────────┘  └──────────┘  └──────────────────┘      │
└─────────────────────────────────────────────────────────────────────────┘
```

### Technology Decisions

| Concern | Choice | Rationale |
|---------|--------|-----------|
| Log Aggregation | Loki + Promtail | Lightweight, integrates with Grafana already needed for metrics |
| Metrics | Prometheus + prom-client | Industry standard, native Grafana support |
| Alerting | Alertmanager | Native Prometheus integration, supports webhook/email |
| Load Testing | k6 | JavaScript-based (matches team skills), CLI-friendly for CI |
| Log Rotation | winston-daily-rotate-file | Drop-in Winston transport, already npm ecosystem |
| Backup Scheduling | node-cron (existing) | BackupScheduler already uses it |
| Frontend Error Tracking | Custom endpoint | Avoids third-party dependency, integrates with existing API |

---

## Components and Interfaces

### 1. CI/CD Deployment Pipeline

**File:** `.gitlab-ci.yml`

The existing deploy job is a placeholder (`echo "TODO"`). Replace with actual deployment logic using Docker-in-Docker and SSH.

```yaml
# deploy stage (updated)
deploy:
  stage: deploy
  image: docker:24-dind
  services:
    - docker:24-dind
  variables:
    DOCKER_TLS_CERTDIR: "/certs"
  before_script: []
  script:
    # Push to registry
    - docker login -u "$CI_REGISTRY_USER" -p "$CI_REGISTRY_PASSWORD" "$CI_REGISTRY"
    - docker build -t "$CI_REGISTRY_IMAGE:$CI_COMMIT_SHA" .
    - docker tag "$CI_REGISTRY_IMAGE:$CI_COMMIT_SHA" "$CI_REGISTRY_IMAGE:latest"
    - docker push "$CI_REGISTRY_IMAGE:$CI_COMMIT_SHA"
    - docker push "$CI_REGISTRY_IMAGE:latest"
    # Deploy via SSH
    - apk add --no-cache openssh-client
    - eval $(ssh-agent -s)
    - echo "$DEPLOY_SSH_PRIVATE_KEY" | ssh-add -
    - mkdir -p ~/.ssh && echo "$DEPLOY_SSH_KNOWN_HOSTS" > ~/.ssh/known_hosts
    - |
      ssh "$DEPLOY_USER@$DEPLOY_HOST" "
        cd /opt/alsaqi &&
        docker compose pull &&
        docker compose up -d
      "
    # Health check
    - |
      for i in $(seq 1 12); do
        if wget --spider --quiet "http://$DEPLOY_HOST/api/health" 2>/dev/null; then
          echo "Health check passed"
          exit 0
        fi
        echo "Waiting for health... attempt $i/12"
        sleep 5
      done
      echo "Health check failed after 60 seconds"
      exit 1
  environment:
    name: production
  when: manual
  rules:
    - if: $CI_COMMIT_BRANCH == "main"
```

**Protected CI/CD Variables Required:**
- `CI_REGISTRY` / `CI_REGISTRY_USER` / `CI_REGISTRY_PASSWORD`
- `DEPLOY_SSH_PRIVATE_KEY` (SSH key, masked)
- `DEPLOY_SSH_KNOWN_HOSTS`
- `DEPLOY_USER` / `DEPLOY_HOST`

---

### 2. Structured Logging Transport (Requirements 2 & 9)

**File:** `src/server/utils/logger.ts` (enhancement)

Extend the existing Winston logger with file transports and additional metadata fields.

```typescript
import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import { AsyncLocalStorage } from 'async_hooks';
import os from 'os';

export const requestContext = new AsyncLocalStorage<{
  correlationId: string;
  userId?: string;
  method?: string;
  path?: string;
  statusCode?: number;
  responseTimeMs?: number;
}>();

const addMetadata = winston.format((info) => {
  // Always include PID and hostname
  info.pid = process.pid;
  info.hostname = os.hostname();
  info.service = 'alsaqi-api';

  // Add correlation context if available
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

const fileTransports: winston.transport[] = [];

if (process.env.NODE_ENV === 'production') {
  // Combined log — daily rotation, 14-day retention
  fileTransports.push(
    new DailyRotateFile({
      filename: '/app/logs/combined-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      maxSize: '20m',
      maxFiles: '14d',
      format: winston.format.combine(
        winston.format.timestamp(),
        addMetadata(),
        winston.format.json()
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
      format: winston.format.combine(
        winston.format.timestamp(),
        addMetadata(),
        winston.format.json()
      ),
    })
  );
}

const logger = winston.createLogger({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    addMetadata(),
    winston.format.json()
  ),
  defaultMeta: { service: 'alsaqi-api' },
  transports: [
    new winston.transports.Console({
      format: process.env.NODE_ENV === 'production'
        ? winston.format.combine(winston.format.timestamp(), addMetadata(), winston.format.json())
        : winston.format.combine(winston.format.colorize(), winston.format.simple()),
    }),
    ...fileTransports,
  ],
});

export default logger;
```

**HTTP Request Logging Middleware** (`src/server/middleware/requestLogger.ts`):

```typescript
import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import logger, { requestContext } from '../utils/logger';

export function requestLoggerMiddleware(req: Request, res: Response, next: NextFunction) {
  const correlationId = (req.headers['x-correlation-id'] as string) || uuidv4();
  const start = Date.now();

  res.on('finish', () => {
    const responseTimeMs = Date.now() - start;
    requestContext.run(
      { correlationId, method: req.method, path: req.path, statusCode: res.statusCode, responseTimeMs },
      () => {
        logger.info(`${req.method} ${req.path} ${res.statusCode} ${responseTimeMs}ms`);
      }
    );
  });

  requestContext.run({ correlationId }, () => next());
}
```

---

### 3. Metrics and Alerting (Requirement 3)

**File:** `src/server/metrics/prometheus.ts`

```typescript
import { Registry, Counter, Histogram, Gauge, collectDefaultMetrics } from 'prom-client';

export const metricsRegistry = new Registry();

collectDefaultMetrics({ register: metricsRegistry });

export const httpRequestsTotal = new Counter({
  name: 'http_requests_total',
  help: 'Total HTTP requests',
  labelNames: ['method', 'path', 'status'],
  registers: [metricsRegistry],
});

export const httpRequestDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'path', 'status'],
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10],
  registers: [metricsRegistry],
});

export const activeConnections = new Gauge({
  name: 'active_connections',
  help: 'Number of active connections',
  registers: [metricsRegistry],
});
```

**Prometheus Alert Rules** (`deploy/prometheus/alerts.yml`):

```yaml
groups:
  - name: alsaqi-alerts
    rules:
      - alert: HighErrorRate
        expr: |
          sum(rate(http_requests_total{status=~"5.."}[5m]))
          /
          sum(rate(http_requests_total[5m]))
          > 0.05
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "API error rate exceeds 5%"

      - alert: HighLatency
        expr: |
          histogram_quantile(0.95, sum(rate(http_request_duration_seconds_bucket[5m])) by (le))
          > 2.0
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "API p95 latency exceeds 2000ms"

      - alert: LowDiskSpace
        expr: |
          (node_filesystem_avail_bytes / node_filesystem_size_bytes) < 0.20
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "Disk space below 20% on {{ $labels.mountpoint }}"
```

---

### 4. WebSocket Rate Limiting (Requirement 4)

**Addition to Nginx configuration** (`deploy/nginx/nginx.conf`):

```nginx
# WebSocket connection rate limiting (5/sec per IP, burst of 10)
limit_req_zone $binary_remote_addr zone=ws_upgrade_limit:10m rate=5r/s;

# WebSocket concurrent connection limiting (10 per IP)
limit_conn_zone $binary_remote_addr zone=ws_conn_limit:10m;

# ... inside the server block:
location /ws {
    # Rate limit on upgrade requests
    limit_req zone=ws_upgrade_limit burst=10 nodelay;
    limit_req_status 429;

    # Concurrent connection limit
    limit_conn ws_conn_limit 10;
    limit_conn_status 503;

    proxy_pass http://api_backend;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 3600s;
    proxy_send_timeout 3600s;
    proxy_buffering off;
}
```

---

### 5. Docker Secrets Hardening (Requirement 5)

**Changes to `deploy/docker-compose.yml`:**

```yaml
services:
  minio:
    # Remove default passwords
    environment:
      MINIO_ROOT_USER: ${MINIO_ROOT_USER}       # No default
      MINIO_ROOT_PASSWORD: ${MINIO_ROOT_PASSWORD} # No default
    # Remove host port mappings — internal only
    expose:
      - "9000"
      - "9001"
    # ports: removed entirely

  redis:
    command: redis-server --requirepass ${REDIS_PASSWORD}  # No default
    # Remove host port mapping — internal only
    expose:
      - "6379"
    # ports: removed entirely

  api:
    environment:
      - DATABASE_URL=${DATABASE_URL}          # Required, no default
      - JWT_SECRET=${JWT_SECRET}              # Required, no default
      - MINIO_ROOT_USER=${MINIO_ROOT_USER}   # Required, no default
      - MINIO_ROOT_PASSWORD=${MINIO_ROOT_PASSWORD}  # Required
      - REDIS_PASSWORD=${REDIS_PASSWORD}      # Required, no default
```

**Startup Validation** (`src/server/utils/envValidator.ts`):

```typescript
interface EnvRequirement {
  name: string;
  minLength?: number;
}

const REQUIRED_VARS: EnvRequirement[] = [
  { name: 'DATABASE_URL' },
  { name: 'JWT_SECRET', minLength: 64 },
  { name: 'MINIO_ROOT_USER', minLength: 8 },
  { name: 'MINIO_ROOT_PASSWORD', minLength: 32 },
  { name: 'REDIS_PASSWORD', minLength: 32 },
];

export function validateRequiredEnv(): void {
  const missing: string[] = [];
  const tooShort: string[] = [];

  for (const req of REQUIRED_VARS) {
    const value = process.env[req.name];
    if (!value) {
      missing.push(req.name);
    } else if (req.minLength && value.length < req.minLength) {
      tooShort.push(`${req.name} (minimum ${req.minLength} characters)`);
    }
  }

  if (missing.length > 0 || tooShort.length > 0) {
    const errors: string[] = [];
    if (missing.length) errors.push(`Missing: ${missing.join(', ')}`);
    if (tooShort.length) errors.push(`Too short: ${tooShort.join(', ')}`);
    
    console.error(`[FATAL] Environment validation failed:\n${errors.join('\n')}`);
    process.exit(1);
  }
}
```

---

### 6. Frontend .env Hygiene (Requirement 6)

**File:** `apps/web/.env.example`

```dotenv
# AL-SAQI Frontend Environment Variables
# Copy this file to .env and configure values

# API base URL (relative for same-origin, absolute for external)
VITE_API_URL=/api

# Application version (set during build)
VITE_APP_VERSION=

# Error reporting endpoint
VITE_ERROR_REPORT_URL=/api/system-errors

# WebSocket URL (ws:// or wss://)
VITE_WS_URL=
```

**Vite Build Validation Plugin** (`apps/web/vite-env-validator.ts`):

```typescript
import { Plugin } from 'vite';

const REQUIRED_VARS = ['VITE_API_URL'];

export function envValidatorPlugin(): Plugin {
  return {
    name: 'env-validator',
    configResolved(config) {
      if (config.command === 'build') {
        const missing = REQUIRED_VARS.filter(
          (v) => !process.env[v] && !config.env[v]
        );
        if (missing.length > 0) {
          throw new Error(
            `[env-validator] Missing required environment variables: ${missing.join(', ')}.\n` +
            `Copy apps/web/.env.example to apps/web/.env and configure values.`
          );
        }
      }
    },
  };
}
```

---

### 7. Automated Database Backup Enhancement (Requirement 7)

The `BackupScheduler` class already exists in `src/server/utils/backup.ts`. Enhancements needed:

1. **MinIO upload** after local backup creation
2. **Retry logic** with 5-minute delay on failure
3. **pg_dump integration** for production PostgreSQL (currently JSON-export for PGlite)

**MinIO Upload Addition:**

```typescript
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import fs from 'fs';

async function uploadToMinIO(filePath: string, objectKey: string): Promise<void> {
  const s3 = new S3Client({
    endpoint: `http://${process.env.MINIO_ENDPOINT}:${process.env.MINIO_PORT}`,
    region: process.env.MINIO_REGION || 'us-east-1',
    credentials: {
      accessKeyId: process.env.MINIO_ROOT_USER!,
      secretAccessKey: process.env.MINIO_ROOT_PASSWORD!,
    },
    forcePathStyle: true,
  });

  const fileStream = fs.createReadStream(filePath);
  await s3.send(new PutObjectCommand({
    Bucket: 'backups',
    Key: objectKey,
    Body: fileStream,
  }));
}
```

**Retry Logic:**

```typescript
async function runWithRetry(): Promise<BackupResult> {
  try {
    return await this.executeBackup();
  } catch (error) {
    logger.error('Backup failed, retrying in 5 minutes', { error: String(error) });
    await new Promise(resolve => setTimeout(resolve, 5 * 60 * 1000));
    return await this.executeBackup(); // Second attempt — no further retry
  }
}
```

---

### 8. Frontend Error Tracking (Requirement 8)

**Frontend Error Reporter** (`apps/web/src/utils/errorReporter.ts`):

```typescript
interface ErrorReport {
  message: string;
  stack?: string;
  componentStack?: string;
  appVersion: string;
  sessionId: string;
  userAgent: string;
  routePath: string;
  timestamp: string;
  type: 'boundary' | 'uncaught' | 'unhandled-rejection';
}

class ErrorReporter {
  private endpoint: string;
  private sessionId: string;

  constructor() {
    this.endpoint = import.meta.env.VITE_ERROR_REPORT_URL || '/api/system-errors';
    this.sessionId = this.getOrCreateSessionId();
  }

  report(error: Partial<ErrorReport>): void {
    const payload: ErrorReport = {
      message: error.message || 'Unknown error',
      stack: error.stack,
      componentStack: error.componentStack,
      appVersion: import.meta.env.VITE_APP_VERSION || 'unknown',
      sessionId: this.sessionId,
      userAgent: navigator.userAgent,
      routePath: window.location.pathname,
      timestamp: new Date().toISOString(),
      type: error.type || 'uncaught',
    };

    // Fire-and-forget — don't let reporting errors cascade
    fetch(this.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).catch(() => {}); // Silently ignore reporting failures
  }

  private getOrCreateSessionId(): string {
    const key = 'alsaqi_error_session';
    let id = sessionStorage.getItem(key);
    if (!id) {
      id = crypto.randomUUID();
      sessionStorage.setItem(key, id);
    }
    return id;
  }
}

export const errorReporter = new ErrorReporter();
```

**Global Error Handlers** (`apps/web/src/utils/globalErrorHandlers.ts`):

```typescript
import { errorReporter } from './errorReporter';

export function registerGlobalErrorHandlers(): void {
  window.onerror = (message, source, lineno, colno, error) => {
    errorReporter.report({
      message: String(message),
      stack: error?.stack || `${source}:${lineno}:${colno}`,
      type: 'uncaught',
    });
  };

  window.addEventListener('unhandledrejection', (event) => {
    const error = event.reason;
    errorReporter.report({
      message: error?.message || String(error),
      stack: error?.stack,
      type: 'unhandled-rejection',
    });
  });
}
```

**Backend Error Storage** (`src/server/routes/systemErrors.ts`):

```typescript
interface StoredError {
  id: string;
  signature: string; // hash(message + stack first line)
  message: string;
  stack?: string;
  count: number;
  firstSeen: string;
  lastSeen: string;
  isRecurring: boolean;
  metadata: {
    appVersion: string;
    sessionId: string;
    userAgent: string;
    routePath: string;
  };
}
```

The error endpoint computes a signature from message + first stack frame, increments a frequency counter, and marks errors as recurring when count > 10 within a 1-hour window.

---

### 9. Nginx Configuration Finalization (Requirement 11)

**Template-based configuration** using `envsubst` at container startup.

**`deploy/nginx/nginx.conf.template`** — parameterized config with:

```nginx
server_name ${SERVER_NAME};

# HSTS
add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

# CSP for SPA
add_header Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self' wss://${SERVER_NAME}; img-src 'self' data: blob:; font-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'" always;

# Structured access log
log_format structured '$remote_addr - $remote_user [$time_local] '
                      '"$request" $status $body_bytes_sent '
                      '"$http_referer" "$http_user_agent" '
                      'rt=$request_time uct=$upstream_connect_time urt=$upstream_response_time';

access_log /var/log/nginx/access.log structured;
```

**`deploy/nginx/Dockerfile`** (updated entrypoint):

```dockerfile
FROM nginx:1.27-alpine

# Install envsubst (part of gettext)
RUN apk add --no-cache gettext

COPY nginx.conf.template /etc/nginx/templates/default.conf.template

# Entrypoint: validate config after envsubst
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["nginx", "-g", "daemon off;"]
```

**`deploy/nginx/docker-entrypoint.sh`:**

```bash
#!/bin/sh
set -e

# Substitute environment variables in config template
envsubst '${SERVER_NAME}' < /etc/nginx/templates/default.conf.template > /etc/nginx/conf.d/default.conf

# Validate configuration syntax
nginx -t || { echo "ERROR: Nginx configuration is invalid"; exit 1; }

# Start nginx
exec "$@"
```

---

### 10. Load Testing (Requirement 10)

**Directory:** `tests/load/`

**k6 Script** (`tests/load/api-load-test.js`):

```javascript
import http from 'k6/http';
import { check, sleep } from 'k6';
import ws from 'k6/ws';

export const options = {
  scenarios: {
    standard_load: {
      executor: 'constant-vus',
      vus: 50,
      duration: '5m',
    },
    smoke: {
      executor: 'constant-vus',
      vus: 10,
      duration: '30s',
      tags: { type: 'smoke' },
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<500'],
    http_req_failed: ['rate<0.01'],
    http_reqs: ['rate>100'],
  },
};

export default function () {
  // Login
  const loginRes = http.post(`${__ENV.BASE_URL}/api/auth/login`, JSON.stringify({
    username: __ENV.TEST_USER,
    password: __ENV.TEST_PASS,
  }), { headers: { 'Content-Type': 'application/json' } });

  check(loginRes, { 'login 200': (r) => r.status === 200 });
  const token = loginRes.json('token');

  // List audits
  const headers = { Authorization: `Bearer ${token}` };
  const auditsRes = http.get(`${__ENV.BASE_URL}/api/audit-plans`, { headers });
  check(auditsRes, { 'list audits 200': (r) => r.status === 200 });

  sleep(1);
}
```

**WebSocket Stress Test** (`tests/load/ws-stress-test.js`):

```javascript
import ws from 'k6/ws';
import { check } from 'k6';

export const options = {
  scenarios: {
    ws_stress: {
      executor: 'constant-vus',
      vus: 100,
      duration: '1m',
    },
  },
};

export default function () {
  const res = ws.connect(`${__ENV.WS_URL}/ws`, {}, function (socket) {
    socket.on('open', () => socket.send(JSON.stringify({ type: 'ping' })));
    socket.on('message', (msg) => {
      check(msg, { 'received message': (m) => m.length > 0 });
    });
    socket.setTimeout(() => socket.close(), 55000);
  });

  check(res, { 'ws connected': (r) => r && r.status === 101 });
}
```

---

### 11. Observability Stack (Docker Compose Additions)

```yaml
# Added to deploy/docker-compose.yml

  # Prometheus — metrics collection
  prometheus:
    image: prom/prometheus:v2.51.0
    container_name: alsaqi-prometheus
    restart: unless-stopped
    expose:
      - "9090"
    volumes:
      - ./prometheus/prometheus.yml:/etc/prometheus/prometheus.yml:ro
      - ./prometheus/alerts.yml:/etc/prometheus/alerts.yml:ro
      - prometheus-data:/prometheus
    networks:
      - alsaqi-network
    command:
      - '--config.file=/etc/prometheus/prometheus.yml'
      - '--storage.tsdb.retention.time=30d'

  # Grafana — dashboards
  grafana:
    image: grafana/grafana:10.4.0
    container_name: alsaqi-grafana
    restart: unless-stopped
    expose:
      - "3001"
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=${GRAFANA_ADMIN_PASSWORD}
    volumes:
      - ./grafana/provisioning:/etc/grafana/provisioning:ro
      - grafana-data:/var/lib/grafana
    networks:
      - alsaqi-network

  # Loki — log aggregation
  loki:
    image: grafana/loki:2.9.6
    container_name: alsaqi-loki
    restart: unless-stopped
    expose:
      - "3100"
    volumes:
      - loki-data:/loki
    networks:
      - alsaqi-network

  # Promtail — log shipping
  promtail:
    image: grafana/promtail:2.9.6
    container_name: alsaqi-promtail
    restart: unless-stopped
    volumes:
      - ./promtail/config.yml:/etc/promtail/config.yml:ro
      - app-logs:/var/log/alsaqi:ro
      - /var/run/docker.sock:/var/run/docker.sock:ro
    networks:
      - alsaqi-network

  # Alertmanager — alert routing
  alertmanager:
    image: prom/alertmanager:v0.27.0
    container_name: alsaqi-alertmanager
    restart: unless-stopped
    expose:
      - "9093"
    volumes:
      - ./alertmanager/alertmanager.yml:/etc/alertmanager/alertmanager.yml:ro
    networks:
      - alsaqi-network

volumes:
  app-logs:
    driver: local
  prometheus-data:
    driver: local
  grafana-data:
    driver: local
  loki-data:
    driver: local
```

---

## Data Models

### Frontend Error Record (PostgreSQL)

```sql
CREATE TABLE system_errors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  signature VARCHAR(64) NOT NULL,      -- SHA-256 of message + first stack frame
  message TEXT NOT NULL,
  stack TEXT,
  component_stack TEXT,
  count INTEGER DEFAULT 1,
  first_seen TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_recurring BOOLEAN DEFAULT FALSE,
  app_version VARCHAR(32),
  session_id VARCHAR(64),
  user_agent TEXT,
  route_path VARCHAR(255),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_system_errors_signature ON system_errors(signature);
CREATE INDEX idx_system_errors_last_seen ON system_errors(last_seen DESC);
CREATE INDEX idx_system_errors_recurring ON system_errors(is_recurring) WHERE is_recurring = TRUE;
```

### Backup History Record (existing, verify schema)

The existing `backup_history` table in the BackupScheduler already stores: `id`, `started_at`, `completed_at`, `status`, `type`, `size_bytes`, `tables_count`, `file_path`, `error_message`, `verified`.

---

## Interfaces

### `/metrics` Endpoint

```
GET /metrics
Response: text/plain; version=0.0.4 (Prometheus exposition format)
```

### `/api/system-errors` Endpoint

```
POST /api/system-errors
Content-Type: application/json

{
  "message": "string",
  "stack": "string?",
  "componentStack": "string?",
  "appVersion": "string",
  "sessionId": "string",
  "userAgent": "string",
  "routePath": "string",
  "timestamp": "ISO-8601",
  "type": "boundary | uncaught | unhandled-rejection"
}

Response: 201 Created
```

### Environment Validator Interface

```typescript
function validateRequiredEnv(): void
// Throws and exits process if any required variable is missing
// Called at server startup before any service initialization
```

---

## Error Handling

| Scenario | Handling |
|----------|----------|
| Deploy health check timeout | CI job exits non-zero, previous containers preserved |
| Logger file transport failure | Falls back to console-only, logs warning |
| Backup pg_dump failure | Logs error, retries once after 5 minutes, marks as failed |
| MinIO upload failure | Backup still stored locally, error logged |
| Frontend error report fails | Silently ignored (fire-and-forget) |
| Prometheus scrape failure | Alertmanager notifies on `up == 0` |
| Missing env var at startup | Server refuses to start, logs which variable is missing |
| Nginx config syntax error | Container fails to start, entrypoint exits with error message |
| WebSocket rate limit exceeded | 429 returned to client, connection not upgraded |

---

## Testing Strategy

**Dual Testing Approach:**

- **Property-based tests** (fast-check): Validate universal properties across randomized inputs — log field presence, encryption round-trips, retention logic, error report payloads, rate limiting behavior, and alert rule thresholds.
- **Integration tests**: Verify infrastructure wiring — CI/CD pipeline execution, Docker Compose service health, Prometheus scraping, Grafana dashboards, MinIO upload, and Nginx proxying.
- **Smoke tests**: Validate one-time configuration correctness — env var presence in docker-compose.yml, .gitignore patterns, log rotation config, port restrictions.

**Property Test Configuration:**
- Minimum 100 iterations per property test
- Uses `fast-check` (already in devDependencies)
- Test files located alongside source or in `__tests__/` directories
- Tag format: **Feature: production-readiness-review, Property {N}: {title}**

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Log entries contain mandatory fields

*For any* log message written by the Logger (regardless of level or content), the JSON output SHALL contain the fields: `timestamp`, `level`, `correlationId` (when in request context), `service`, `message`, `pid`, and `hostname`.

**Validates: Requirements 2.4, 9.5**

### Property 2: HTTP request logs contain request metadata

*For any* HTTP request processed by the API server (with any method, path, or status code), the corresponding log entry SHALL include `method`, `path`, `statusCode`, and `responseTimeMs` fields with correct types.

**Validates: Requirements 2.5**

### Property 3: Missing environment variable prevents startup

*For any* single required environment variable removed from the set {DATABASE_URL, JWT_SECRET, MINIO_ROOT_USER, MINIO_ROOT_PASSWORD, REDIS_PASSWORD}, the API server SHALL refuse to start and the error output SHALL identify the specific missing variable by name.

**Validates: Requirements 5.3**

### Property 4: Frontend build fails on missing required env vars

*For any* required frontend environment variable (VITE_API_URL) that is undefined at build time, the Vite build process SHALL exit with a non-zero status and emit an error message naming the missing variable.

**Validates: Requirements 6.4**

### Property 5: Backup encryption round-trip preserves data

*For any* valid backup payload (byte sequence), encrypting with AES-256-GCM using a given key and then decrypting with the same key SHALL produce the original byte sequence.

**Validates: Requirements 7.2**

### Property 6: Backup retention deletes only expired records

*For any* set of backup records with varying timestamps and *for any* retention period N days, executing the retention cleanup SHALL delete exactly those records whose `started_at` is older than N days and preserve all records newer than N days.

**Validates: Requirements 7.3**

### Property 7: Successful backup log contains required metadata

*For any* backup that completes without error (regardless of database size), the completion log entry SHALL contain `filename` (non-empty string), `size_bytes` (non-negative number), and `duration_ms` (non-negative number).

**Validates: Requirements 7.6**

### Property 8: Error report payload contains required metadata

*For any* error captured by the frontend error reporter (regardless of error message content or stack trace), the POST payload sent to `/api/system-errors` SHALL include non-empty values for `appVersion`, `sessionId`, `userAgent`, `routePath`, and `timestamp`.

**Validates: Requirements 8.4**

### Property 9: Error storage preserves required fields

*For any* valid error report submitted to `/api/system-errors`, the stored record SHALL contain a `signature`, `message`, `count` (≥ 1), `first_seen` timestamp, and `last_seen` timestamp.

**Validates: Requirements 8.5**

### Property 10: Recurring incident detection threshold

*For any* error signature that appears N times within a 1-hour window: if N > 10, the error SHALL be marked as `is_recurring = true`; if N ≤ 10, the error SHALL remain `is_recurring = false`.

**Validates: Requirements 8.6**

### Property 11: WebSocket rate limiting rejects excess connections

*For any* single IP address that attempts more than 15 WebSocket upgrade requests within 1 second (exceeding rate=5/s + burst=10), the requests beyond the burst capacity SHALL be rejected with HTTP 429.

**Validates: Requirements 4.1, 4.2**

### Property 12: WebSocket concurrent connection limit

*For any* single IP address with 10 active WebSocket connections, any additional connection attempt from that IP SHALL be rejected with HTTP 503.

**Validates: Requirements 4.3, 4.4**

### Property 13: Alert rule fires on high error rate

*For any* combination of total_requests and error_requests over a 5-minute window where (error_requests / total_requests) > 0.05, the HighErrorRate alert expression SHALL evaluate to a firing state.

**Validates: Requirements 3.4**

### Property 14: Alert rule fires on high latency

*For any* response time distribution where the 95th percentile exceeds 2000 milliseconds over a 5-minute window, the HighLatency alert expression SHALL evaluate to a firing state.

**Validates: Requirements 3.5**
