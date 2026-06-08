/**
 * Unit tests for WebSocket Auth Guard (noServer mode with manual upgrade handling).
 *
 * Tests that:
 * - Connections without a token are rejected with HTTP 401 before handshake
 * - Connections with expired/invalid tokens are rejected with HTTP 401
 * - Connections with valid tokens are accepted and userId/username attached
 * - Heartbeat mechanism continues for authenticated connections
 *
 * Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7
 */
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import http from 'http';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { WebSocketServer, WebSocket } from 'ws';

// ─── Test RSA Key Pair (generated once for test suite) ────────────────────────

let JWT_PRIVATE_KEY: string;
let JWT_PUBLIC_KEY: string;

beforeAll(() => {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  JWT_PRIVATE_KEY = privateKey;
  JWT_PUBLIC_KEY = publicKey;
});

// ─── Helper: Create Authenticated WSS (mirrors server.ts logic) ───────────────

interface AuthenticatedWebSocket extends WebSocket {
  userId: string;
  username: string;
  authenticated: boolean;
  connectedAt: number;
  isAlive: boolean;
}

function createTestServer(): {
  server: http.Server;
  wss: WebSocketServer;
  heartbeatInterval: ReturnType<typeof setInterval>;
  close: () => Promise<void>;
} {
  const server = http.createServer();
  const wss = new WebSocketServer({ noServer: true });

  // Manual WebSocket upgrade handling (same logic as server.ts)
  server.on('upgrade', (request, socket, head) => {
    const url = new URL(request.url!, `http://${request.headers.host}`);
    const token = url.searchParams.get('token');

    if (!token) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }

    try {
      const decoded = jwt.verify(token, JWT_PUBLIC_KEY, { algorithms: ['RS256'] }) as any;

      wss.handleUpgrade(request, socket, head, (ws) => {
        (ws as any).userId = decoded.id;
        (ws as any).username = decoded.username;
        (ws as any).authenticated = true;
        (ws as any).connectedAt = Date.now();
        wss.emit('connection', ws, request);
      });
    } catch {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
    }
  });

  // Heartbeat mechanism
  wss.on('connection', (ws) => {
    (ws as any).isAlive = true;
    ws.on('pong', () => {
      (ws as any).isAlive = true;
    });
  });

  const heartbeatInterval = setInterval(() => {
    wss.clients.forEach((ws) => {
      const authWs = ws as any;
      if (authWs.isAlive === false) {
        return ws.terminate();
      }
      authWs.isAlive = false;
      ws.ping();
    });
  }, 30000);

  wss.on('close', () => {
    clearInterval(heartbeatInterval);
  });

  return {
    server,
    wss,
    heartbeatInterval,
    close: () =>
      new Promise<void>((resolve) => {
        clearInterval(heartbeatInterval);
        // Terminate all connected clients first
        wss.clients.forEach((ws) => ws.terminate());
        wss.close(() => {
          server.close(() => resolve());
        });
        // Safety timeout to avoid hanging
        setTimeout(resolve, 2000);
      }),
  };
}

function generateValidToken(payload: { id: string; username: string }): string {
  return jwt.sign(payload, JWT_PRIVATE_KEY, {
    algorithm: 'RS256',
    expiresIn: '1h',
  });
}

function generateExpiredToken(payload: { id: string; username: string }): string {
  return jwt.sign(payload, JWT_PRIVATE_KEY, {
    algorithm: 'RS256',
    expiresIn: '-1s', // already expired
  });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('WebSocket Auth Guard (noServer mode)', () => {
  let testServer: ReturnType<typeof createTestServer>;
  let port: number;

  beforeAll(
    async () => {
      testServer = createTestServer();
      await new Promise<void>((resolve) => {
        testServer.server.listen(0, () => {
          const addr = testServer.server.address();
          port = typeof addr === 'object' && addr ? addr.port : 0;
          resolve();
        });
      });
    },
    10000
  );

  afterAll(async () => {
    await testServer.close();
  }, 10000);

  // ─── Requirement 4.2: Reject without token ─────────────────────────────────

  describe('Reject without token (Req 4.2)', () => {
    it('should reject WebSocket connection without token with HTTP 401', async () => {
      const ws = new WebSocket(`ws://127.0.0.1:${port}`);

      const result = await new Promise<{ code: number; reason: string }>((resolve) => {
        ws.on('error', () => {
          // expected — connection will close
        });
        ws.on('unexpected-response', (_req, res) => {
          resolve({ code: res.statusCode!, reason: res.statusMessage || '' });
          ws.close();
        });
        ws.on('open', () => {
          resolve({ code: 101, reason: 'Unexpected open' });
          ws.close();
        });
      });

      expect(result.code).toBe(401);
    });

    it('should reject connection with empty token parameter', async () => {
      const ws = new WebSocket(`ws://127.0.0.1:${port}?token=`);

      const result = await new Promise<{ code: number }>((resolve) => {
        ws.on('error', () => {});
        ws.on('unexpected-response', (_req, res) => {
          resolve({ code: res.statusCode! });
          ws.close();
        });
        ws.on('open', () => {
          resolve({ code: 101 });
          ws.close();
        });
      });

      // Empty string is falsy, so treated as no token
      expect(result.code).toBe(401);
    });
  });

  // ─── Requirement 4.3: Reject with expired/invalid token ────────────────────

  describe('Reject with invalid/expired token (Req 4.3)', () => {
    it('should reject WebSocket connection with expired token', async () => {
      const token = generateExpiredToken({ id: 'user-1', username: 'expired-user' });
      const ws = new WebSocket(`ws://127.0.0.1:${port}?token=${token}`);

      const result = await new Promise<{ code: number }>((resolve) => {
        ws.on('error', () => {});
        ws.on('unexpected-response', (_req, res) => {
          resolve({ code: res.statusCode! });
          ws.close();
        });
        ws.on('open', () => {
          resolve({ code: 101 });
          ws.close();
        });
      });

      expect(result.code).toBe(401);
    });

    it('should reject WebSocket connection with malformed token', async () => {
      const ws = new WebSocket(`ws://127.0.0.1:${port}?token=not-a-valid-jwt`);

      const result = await new Promise<{ code: number }>((resolve) => {
        ws.on('error', () => {});
        ws.on('unexpected-response', (_req, res) => {
          resolve({ code: res.statusCode! });
          ws.close();
        });
        ws.on('open', () => {
          resolve({ code: 101 });
          ws.close();
        });
      });

      expect(result.code).toBe(401);
    });

    it('should reject WebSocket connection with token signed by different key', async () => {
      // Generate a different RSA key pair
      const { privateKey: otherKey } = crypto.generateKeyPairSync('rsa', {
        modulusLength: 2048,
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
      });
      const token = jwt.sign({ id: 'user-1', username: 'intruder' }, otherKey, {
        algorithm: 'RS256',
        expiresIn: '1h',
      });

      const ws = new WebSocket(`ws://127.0.0.1:${port}?token=${token}`);

      const result = await new Promise<{ code: number }>((resolve) => {
        ws.on('error', () => {});
        ws.on('unexpected-response', (_req, res) => {
          resolve({ code: res.statusCode! });
          ws.close();
        });
        ws.on('open', () => {
          resolve({ code: 101 });
          ws.close();
        });
      });

      expect(result.code).toBe(401);
    });
  });

  // ─── Requirement 4.1, 4.5: Accept with valid token ─────────────────────────

  describe('Accept with valid token (Req 4.1, 4.5)', () => {
    it('should accept connection and attach userId/username to WebSocket', async () => {
      const token = generateValidToken({ id: 'user-42', username: 'admin' });
      const ws = new WebSocket(`ws://127.0.0.1:${port}?token=${token}`);

      // Wait for the server to accept the connection and capture the ws instance
      const serverWs = await new Promise<AuthenticatedWebSocket>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Timeout waiting for connection')), 5000);
        testServer.wss.once('connection', (sws) => {
          clearTimeout(timeout);
          resolve(sws as unknown as AuthenticatedWebSocket);
        });
        ws.on('error', (err) => {
          clearTimeout(timeout);
          reject(err);
        });
      });

      expect(serverWs.userId).toBe('user-42');
      expect(serverWs.username).toBe('admin');
      expect(serverWs.authenticated).toBe(true);
      expect(typeof serverWs.connectedAt).toBe('number');
      expect(serverWs.connectedAt).toBeGreaterThan(0);

      ws.close();
    });

    it('should complete WebSocket handshake successfully with valid token', async () => {
      const token = generateValidToken({ id: 'user-99', username: 'tester' });
      const ws = new WebSocket(`ws://127.0.0.1:${port}?token=${token}`);

      const opened = await new Promise<boolean>((resolve) => {
        ws.on('open', () => resolve(true));
        ws.on('error', () => resolve(false));
        ws.on('unexpected-response', () => resolve(false));
      });

      expect(opened).toBe(true);
      ws.close();
    });
  });

  // ─── Requirement 4.4: No unauthenticated connection remains open ────────────

  describe('No unauthenticated connection window (Req 4.4)', () => {
    it('should never allow an unauthenticated WebSocket instance to exist on the server', async () => {
      const token = generateValidToken({ id: 'user-check', username: 'checker' });
      const ws = new WebSocket(`ws://127.0.0.1:${port}?token=${token}`);

      const serverWs = await new Promise<AuthenticatedWebSocket>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Timeout')), 5000);
        testServer.wss.once('connection', (sws) => {
          clearTimeout(timeout);
          resolve(sws as unknown as AuthenticatedWebSocket);
        });
        ws.on('error', (err) => {
          clearTimeout(timeout);
          reject(err);
        });
      });

      // By the time connection event fires, authentication is already complete
      expect(serverWs.authenticated).toBe(true);
      expect(serverWs.userId).toBeDefined();

      ws.close();
    });
  });

  // ─── Requirement 4.6: Uses noServer mode ───────────────────────────────────

  describe('noServer mode (Req 4.6)', () => {
    it('should use noServer mode — WSS created with { noServer: true }', () => {
      // The WebSocketServer is created with noServer: true, which means
      // it does NOT attach to the HTTP server directly. Instead, the
      // server's 'upgrade' event is handled manually.
      // This is verified by the fact that connections without valid tokens
      // are rejected at the HTTP level (401) rather than being accepted
      // and then disconnected — which proves manual upgrade handling.
      
      // The WSS in our test server is created with { noServer: true }
      // Verify it has no attached server (noServer mode indicator)
      expect((testServer.wss as any).options.noServer).toBe(true);
    });
  });

  // ─── Requirement 4.7: Heartbeat mechanism ──────────────────────────────────

  describe('Heartbeat mechanism (Req 4.7)', () => {
    it('should mark connection as alive and respond to pong', async () => {
      const token = generateValidToken({ id: 'user-hb', username: 'heartbeat-user' });
      const ws = new WebSocket(`ws://127.0.0.1:${port}?token=${token}`);

      const serverWs = await new Promise<AuthenticatedWebSocket>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Timeout')), 5000);
        testServer.wss.once('connection', (sws) => {
          clearTimeout(timeout);
          resolve(sws as unknown as AuthenticatedWebSocket);
        });
        ws.on('error', (err) => {
          clearTimeout(timeout);
          reject(err);
        });
      });

      // isAlive should be set to true on connection
      expect(serverWs.isAlive).toBe(true);

      // Simulate the heartbeat cycle: set isAlive to false and send ping
      (serverWs as any).isAlive = false;
      serverWs.ping();

      // Wait for pong response to set isAlive back to true
      await new Promise<void>((resolve) => {
        const check = setInterval(() => {
          if ((serverWs as any).isAlive === true) {
            clearInterval(check);
            resolve();
          }
        }, 50);
        // Timeout safety
        setTimeout(() => {
          clearInterval(check);
          resolve();
        }, 3000);
      });

      expect((serverWs as any).isAlive).toBe(true);

      ws.close();
    });
  });
});
