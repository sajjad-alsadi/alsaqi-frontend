import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { registerShutdownHandlers, _resetShutdownState } from '../shutdown.js';
import type { ShutdownDependencies } from '../shutdown.js';

// Mock logger
vi.mock('../../utils/logger.js', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

describe('shutdown', () => {
  let mockCertificateManager: any;
  let mockWorkerManager: any;
  let mockQueueService: any;
  let processExitSpy: any;
  let processOnSpy: any;
  let registeredHandlers: Map<string, Function>;

  beforeEach(() => {
    _resetShutdownState();
    registeredHandlers = new Map();

    mockCertificateManager = {
      stopExpiryChecks: vi.fn(),
      stopWatching: vi.fn(),
    };

    mockWorkerManager = {
      shutdown: vi.fn().mockResolvedValue(undefined),
    };

    mockQueueService = {
      close: vi.fn().mockResolvedValue(undefined),
    };

    processExitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as any);
    processOnSpy = vi.spyOn(process, 'on').mockImplementation((event: string, handler: any) => {
      registeredHandlers.set(event, handler);
      return process;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('registers SIGTERM and SIGINT handlers', () => {
    const dependencies: ShutdownDependencies = {
      certificateManager: mockCertificateManager,
      workerManager: mockWorkerManager,
      queueService: mockQueueService,
    };

    registerShutdownHandlers(dependencies);

    expect(registeredHandlers.has('SIGTERM')).toBe(true);
    expect(registeredHandlers.has('SIGINT')).toBe(true);
  });

  it('stops certificate expiry checks and file watchers on SIGTERM', async () => {
    const dependencies: ShutdownDependencies = {
      certificateManager: mockCertificateManager,
      workerManager: mockWorkerManager,
      queueService: mockQueueService,
    };

    registerShutdownHandlers(dependencies, { exitProcess: false });

    const handler = registeredHandlers.get('SIGTERM')!;
    await handler();

    // Allow microtask to complete
    await new Promise((r) => setTimeout(r, 10));

    expect(mockCertificateManager.stopExpiryChecks).toHaveBeenCalledOnce();
    expect(mockCertificateManager.stopWatching).toHaveBeenCalledOnce();
  });

  it('drains workers with default 30s timeout on SIGTERM', async () => {
    const dependencies: ShutdownDependencies = {
      certificateManager: mockCertificateManager,
      workerManager: mockWorkerManager,
      queueService: mockQueueService,
    };

    registerShutdownHandlers(dependencies, { exitProcess: false });

    const handler = registeredHandlers.get('SIGTERM')!;
    await handler();
    await new Promise((r) => setTimeout(r, 10));

    expect(mockWorkerManager.shutdown).toHaveBeenCalledWith(30_000);
  });

  it('drains workers with custom timeout when specified', async () => {
    const dependencies: ShutdownDependencies = {
      certificateManager: mockCertificateManager,
      workerManager: mockWorkerManager,
      queueService: mockQueueService,
    };

    registerShutdownHandlers(dependencies, {
      workerDrainTimeoutMs: 15_000,
      exitProcess: false,
    });

    const handler = registeredHandlers.get('SIGTERM')!;
    await handler();
    await new Promise((r) => setTimeout(r, 10));

    expect(mockWorkerManager.shutdown).toHaveBeenCalledWith(15_000);
  });

  it('closes queue service after draining workers', async () => {
    const dependencies: ShutdownDependencies = {
      certificateManager: mockCertificateManager,
      workerManager: mockWorkerManager,
      queueService: mockQueueService,
    };

    registerShutdownHandlers(dependencies, { exitProcess: false });

    const handler = registeredHandlers.get('SIGTERM')!;
    await handler();
    await new Promise((r) => setTimeout(r, 10));

    expect(mockQueueService.close).toHaveBeenCalledOnce();
  });

  it('calls process.exit(0) by default after shutdown completes', async () => {
    const dependencies: ShutdownDependencies = {
      certificateManager: mockCertificateManager,
      workerManager: mockWorkerManager,
      queueService: mockQueueService,
    };

    registerShutdownHandlers(dependencies);

    const handler = registeredHandlers.get('SIGTERM')!;
    await handler();
    await new Promise((r) => setTimeout(r, 10));

    expect(processExitSpy).toHaveBeenCalledWith(0);
  });

  it('handles missing dependencies gracefully', async () => {
    const dependencies: ShutdownDependencies = {};

    registerShutdownHandlers(dependencies, { exitProcess: false });

    const handler = registeredHandlers.get('SIGTERM')!;
    await handler();
    await new Promise((r) => setTimeout(r, 10));

    // Should not throw — just skip missing services
    expect(mockCertificateManager.stopExpiryChecks).not.toHaveBeenCalled();
    expect(mockWorkerManager.shutdown).not.toHaveBeenCalled();
    expect(mockQueueService.close).not.toHaveBeenCalled();
  });

  it('is idempotent — second signal call is ignored', async () => {
    const dependencies: ShutdownDependencies = {
      certificateManager: mockCertificateManager,
      workerManager: mockWorkerManager,
      queueService: mockQueueService,
    };

    registerShutdownHandlers(dependencies, { exitProcess: false });

    const handler = registeredHandlers.get('SIGTERM')!;
    await handler();
    await new Promise((r) => setTimeout(r, 10));

    // Reset mock call counts to check second invocation
    mockWorkerManager.shutdown.mockClear();
    mockQueueService.close.mockClear();

    await handler();
    await new Promise((r) => setTimeout(r, 10));

    expect(mockWorkerManager.shutdown).not.toHaveBeenCalled();
    expect(mockQueueService.close).not.toHaveBeenCalled();
  });

  it('continues shutdown if certificate manager throws', async () => {
    mockCertificateManager.stopExpiryChecks.mockImplementation(() => {
      throw new Error('cert error');
    });

    const dependencies: ShutdownDependencies = {
      certificateManager: mockCertificateManager,
      workerManager: mockWorkerManager,
      queueService: mockQueueService,
    };

    registerShutdownHandlers(dependencies, { exitProcess: false });

    const handler = registeredHandlers.get('SIGTERM')!;
    await handler();
    await new Promise((r) => setTimeout(r, 10));

    // Should still proceed to drain workers and close queue
    expect(mockWorkerManager.shutdown).toHaveBeenCalledOnce();
    expect(mockQueueService.close).toHaveBeenCalledOnce();
  });

  it('continues shutdown if worker manager shutdown rejects', async () => {
    mockWorkerManager.shutdown.mockRejectedValue(new Error('worker timeout'));

    const dependencies: ShutdownDependencies = {
      certificateManager: mockCertificateManager,
      workerManager: mockWorkerManager,
      queueService: mockQueueService,
    };

    registerShutdownHandlers(dependencies, { exitProcess: false });

    const handler = registeredHandlers.get('SIGTERM')!;
    await handler();
    await new Promise((r) => setTimeout(r, 10));

    // Should still proceed to close queue
    expect(mockQueueService.close).toHaveBeenCalledOnce();
  });

  it('SIGINT handler works the same as SIGTERM', async () => {
    const dependencies: ShutdownDependencies = {
      certificateManager: mockCertificateManager,
      workerManager: mockWorkerManager,
      queueService: mockQueueService,
    };

    registerShutdownHandlers(dependencies, { exitProcess: false });

    const handler = registeredHandlers.get('SIGINT')!;
    await handler();
    await new Promise((r) => setTimeout(r, 10));

    expect(mockCertificateManager.stopExpiryChecks).toHaveBeenCalledOnce();
    expect(mockCertificateManager.stopWatching).toHaveBeenCalledOnce();
    expect(mockWorkerManager.shutdown).toHaveBeenCalledWith(30_000);
    expect(mockQueueService.close).toHaveBeenCalledOnce();
  });

  it('executes steps in correct order', async () => {
    const callOrder: string[] = [];

    mockCertificateManager.stopExpiryChecks.mockImplementation(() => {
      callOrder.push('stopExpiryChecks');
    });
    mockCertificateManager.stopWatching.mockImplementation(() => {
      callOrder.push('stopWatching');
    });
    mockWorkerManager.shutdown.mockImplementation(async () => {
      callOrder.push('workerShutdown');
    });
    mockQueueService.close.mockImplementation(async () => {
      callOrder.push('queueClose');
    });

    const dependencies: ShutdownDependencies = {
      certificateManager: mockCertificateManager,
      workerManager: mockWorkerManager,
      queueService: mockQueueService,
    };

    registerShutdownHandlers(dependencies, { exitProcess: false });

    const handler = registeredHandlers.get('SIGTERM')!;
    await handler();
    await new Promise((r) => setTimeout(r, 10));

    expect(callOrder).toEqual([
      'stopExpiryChecks',
      'stopWatching',
      'workerShutdown',
      'queueClose',
    ]);
  });
});
