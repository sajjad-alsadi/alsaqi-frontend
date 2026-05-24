import { describe, it, expect, beforeEach } from 'vitest';
import { ReadWriteLock, isReadQuery } from '../db/index';

describe('ReadWriteLock', () => {
  let lock: ReadWriteLock;

  beforeEach(() => {
    lock = new ReadWriteLock();
  });

  describe('acquireRead', () => {
    it('should grant read lock immediately when no writer is active', async () => {
      const release = await lock.acquireRead();
      expect(lock.readers).toBe(1);
      release();
      expect(lock.readers).toBe(0);
    });

    it('should allow multiple concurrent readers', async () => {
      const release1 = await lock.acquireRead();
      const release2 = await lock.acquireRead();
      const release3 = await lock.acquireRead();
      expect(lock.readers).toBe(3);
      release1();
      release2();
      release3();
      expect(lock.readers).toBe(0);
    });

    it('should queue readers when a writer is active', async () => {
      const writeRelease = await lock.acquireWrite();
      expect(lock.writing).toBe(true);

      let readGranted = false;
      const readPromise = lock.acquireRead().then(release => {
        readGranted = true;
        return release;
      });

      // Give the event loop a tick
      await new Promise(r => setTimeout(r, 10));
      expect(readGranted).toBe(false);
      expect(lock.readQueueLength).toBe(1);

      writeRelease();
      const readRelease = await readPromise;
      expect(readGranted).toBe(true);
      expect(lock.readers).toBe(1);
      readRelease();
    });

    it('should queue readers when a writer is waiting', async () => {
      // Acquire a read lock first
      const readRelease1 = await lock.acquireRead();

      // Now a writer tries to acquire - it should queue
      let writeGranted = false;
      const writePromise = lock.acquireWrite().then(release => {
        writeGranted = true;
        return release;
      });

      await new Promise(r => setTimeout(r, 10));
      expect(writeGranted).toBe(false);

      // A new reader should also queue (writer priority)
      let readGranted2 = false;
      const readPromise2 = lock.acquireRead().then(release => {
        readGranted2 = true;
        return release;
      });

      await new Promise(r => setTimeout(r, 10));
      expect(readGranted2).toBe(false);

      // Release the first reader - writer should get the lock
      readRelease1();
      const writeRelease = await writePromise;
      expect(writeGranted).toBe(true);
      expect(readGranted2).toBe(false);

      // Release writer - queued reader should get the lock
      writeRelease();
      const readRelease2 = await readPromise2;
      expect(readGranted2).toBe(true);
      readRelease2();
    });
  });

  describe('acquireWrite', () => {
    it('should grant write lock immediately when no readers or writers', async () => {
      const release = await lock.acquireWrite();
      expect(lock.writing).toBe(true);
      release();
      expect(lock.writing).toBe(false);
    });

    it('should queue writer when readers are active', async () => {
      const readRelease = await lock.acquireRead();

      let writeGranted = false;
      const writePromise = lock.acquireWrite().then(release => {
        writeGranted = true;
        return release;
      });

      await new Promise(r => setTimeout(r, 10));
      expect(writeGranted).toBe(false);
      expect(lock.writeQueueLength).toBe(1);

      readRelease();
      const writeRelease = await writePromise;
      expect(writeGranted).toBe(true);
      writeRelease();
    });

    it('should queue writer when another writer is active', async () => {
      const writeRelease1 = await lock.acquireWrite();

      let writeGranted2 = false;
      const writePromise2 = lock.acquireWrite().then(release => {
        writeGranted2 = true;
        return release;
      });

      await new Promise(r => setTimeout(r, 10));
      expect(writeGranted2).toBe(false);

      writeRelease1();
      const writeRelease2 = await writePromise2;
      expect(writeGranted2).toBe(true);
      writeRelease2();
    });

    it('should block all operations while write lock is held', async () => {
      const writeRelease = await lock.acquireWrite();

      let readGranted = false;
      let write2Granted = false;

      lock.acquireRead().then(release => {
        readGranted = true;
        return release;
      });
      lock.acquireWrite().then(release => {
        write2Granted = true;
        return release;
      });

      await new Promise(r => setTimeout(r, 10));
      expect(readGranted).toBe(false);
      expect(write2Granted).toBe(false);

      writeRelease();
      // After releasing, queued operations should proceed
      await new Promise(r => setTimeout(r, 10));
      // Writer has priority, so write2 should be granted first
      expect(write2Granted).toBe(true);
    });
  });

  describe('timeout', () => {
    it('should reject with 503 status when lock cannot be acquired within timeout', async () => {
      // Override timeout for testing
      const originalTimeout = ReadWriteLock.LOCK_TIMEOUT_MS;
      (ReadWriteLock as any).LOCK_TIMEOUT_MS = 50; // 50ms for fast test

      const lock = new ReadWriteLock();
      const writeRelease = await lock.acquireWrite();

      try {
        await lock.acquireRead();
        expect.fail('Should have thrown');
      } catch (error: any) {
        expect(error.message).toContain('Lock acquisition timeout');
        expect(error.message).toContain('read');
        expect(error.statusCode).toBe(503);
      } finally {
        writeRelease();
        (ReadWriteLock as any).LOCK_TIMEOUT_MS = originalTimeout;
      }
    });

    it('should reject write lock with 503 on timeout', async () => {
      const originalTimeout = ReadWriteLock.LOCK_TIMEOUT_MS;
      (ReadWriteLock as any).LOCK_TIMEOUT_MS = 50;

      const lock = new ReadWriteLock();
      const writeRelease = await lock.acquireWrite();

      try {
        await lock.acquireWrite();
        expect.fail('Should have thrown');
      } catch (error: any) {
        expect(error.message).toContain('Lock acquisition timeout');
        expect(error.message).toContain('write');
        expect(error.statusCode).toBe(503);
      } finally {
        writeRelease();
        (ReadWriteLock as any).LOCK_TIMEOUT_MS = originalTimeout;
      }
    });

    it('should not timeout if lock is acquired before deadline', async () => {
      const originalTimeout = ReadWriteLock.LOCK_TIMEOUT_MS;
      (ReadWriteLock as any).LOCK_TIMEOUT_MS = 200;

      const lock = new ReadWriteLock();
      const writeRelease = await lock.acquireWrite();

      // Release after 50ms (well before 200ms timeout)
      setTimeout(() => writeRelease(), 50);

      const readRelease = await lock.acquireRead();
      expect(lock.readers).toBe(1);
      readRelease();

      (ReadWriteLock as any).LOCK_TIMEOUT_MS = originalTimeout;
    });
  });

  describe('fairness and ordering', () => {
    it('should drain all queued readers when writer releases and no writer is waiting', async () => {
      const writeRelease = await lock.acquireWrite();

      const readPromises: Promise<() => void>[] = [];
      for (let i = 0; i < 5; i++) {
        readPromises.push(lock.acquireRead());
      }

      await new Promise(r => setTimeout(r, 10));
      expect(lock.readQueueLength).toBe(5);

      writeRelease();
      const releases = await Promise.all(readPromises);
      expect(lock.readers).toBe(5);

      releases.forEach(r => r());
      expect(lock.readers).toBe(0);
    });

    it('should prioritize writers over readers in queue', async () => {
      const readRelease1 = await lock.acquireRead();
      const order: string[] = [];

      // Queue a writer
      const writePromise = lock.acquireWrite().then(release => {
        order.push('write');
        return release;
      });

      await new Promise(r => setTimeout(r, 10));

      // Queue a reader (should go after writer)
      const readPromise = lock.acquireRead().then(release => {
        order.push('read');
        return release;
      });

      await new Promise(r => setTimeout(r, 10));

      // Release initial reader - writer should go first
      readRelease1();

      const writeRelease = await writePromise;
      writeRelease();

      const readRelease2 = await readPromise;
      readRelease2();

      expect(order).toEqual(['write', 'read']);
    });
  });
});

describe('isReadQuery', () => {
  it('should identify SELECT as read', () => {
    expect(isReadQuery('SELECT * FROM users')).toBe(true);
    expect(isReadQuery('  SELECT id FROM tasks')).toBe(true);
    expect(isReadQuery('select count(*) from items')).toBe(true);
  });

  it('should identify EXPLAIN as read', () => {
    expect(isReadQuery('EXPLAIN SELECT * FROM users')).toBe(true);
    expect(isReadQuery('EXPLAIN ANALYZE SELECT 1')).toBe(true);
  });

  it('should identify SHOW as read', () => {
    expect(isReadQuery('SHOW TABLES')).toBe(true);
  });

  it('should identify WITH ... SELECT as read', () => {
    expect(isReadQuery('WITH cte AS (SELECT 1) SELECT * FROM cte')).toBe(true);
  });

  it('should identify WITH ... INSERT as write', () => {
    expect(isReadQuery('WITH cte AS (SELECT 1) INSERT INTO t SELECT * FROM cte')).toBe(false);
  });

  it('should identify INSERT as write', () => {
    expect(isReadQuery('INSERT INTO users (name) VALUES ($1)')).toBe(false);
  });

  it('should identify UPDATE as write', () => {
    expect(isReadQuery('UPDATE users SET name = $1 WHERE id = $2')).toBe(false);
  });

  it('should identify DELETE as write', () => {
    expect(isReadQuery('DELETE FROM users WHERE id = $1')).toBe(false);
  });

  it('should identify CREATE as write', () => {
    expect(isReadQuery('CREATE TABLE test (id INT)')).toBe(false);
  });

  it('should identify ALTER as write', () => {
    expect(isReadQuery('ALTER TABLE users ADD COLUMN email TEXT')).toBe(false);
  });

  it('should identify DROP as write', () => {
    expect(isReadQuery('DROP TABLE IF EXISTS temp')).toBe(false);
  });

  it('should identify BEGIN/COMMIT/ROLLBACK as write', () => {
    expect(isReadQuery('BEGIN')).toBe(false);
    expect(isReadQuery('COMMIT')).toBe(false);
    expect(isReadQuery('ROLLBACK')).toBe(false);
  });
});
