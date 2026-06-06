/**
 * cleanup-temp worker - Deletes stale temporary objects from the temp bucket.
 *
 * Lists all objects in the temp bucket, filters those older than the configured
 * threshold (job.data.olderThanMs), and deletes them individually. Continues
 * deleting remaining objects even if individual deletes fail.
 *
 * Requirements: 10.2, 10.3, 10.4, 10.5
 */

import type { JobProcessor } from '../services/worker-manager.js';

/**
 * Cleanup-temp worker processor.
 *
 * Steps:
 * 1. List all objects in the temp bucket
 * 2. Filter objects where lastModified is older than olderThanMs from job start time
 * 3. If no stale objects: log info, reportProgress(100), return
 * 4. Delete each stale object, tracking successes and failures
 * 5. Continue deleting even if individual deletes fail
 * 6. Log failed keys at error level
 * 7. Log deleted count and bytes reclaimed at info level
 * 8. reportProgress incrementally based on deletion progress
 * 9. Complete successfully even if some deletes fail
 */
export const cleanupTempWorker: JobProcessor<'cleanup-temp'> = async (job, context) => {
  const { olderThanMs } = job.data;
  const { storage, logger, reportProgress } = context;

  const jobStartTime = Date.now();
  const cutoffTime = jobStartTime - olderThanMs;

  // Step 1: List all objects in temp bucket
  const allObjects = await storage.listObjects('', 'temp');
  await reportProgress(10);

  // Step 2: Filter stale objects (older than cutoff)
  const staleObjects = allObjects.filter(
    (obj) => obj.lastModified.getTime() < cutoffTime,
  );

  // Step 3: If no stale objects, log and complete
  if (staleObjects.length === 0) {
    logger.info('[cleanup-temp] Zero files required cleanup', {
      totalObjects: allObjects.length,
      olderThanMs,
    });
    await reportProgress(100);
    return;
  }

  // Step 4–8: Delete each stale object, tracking results
  let deletedCount = 0;
  let bytesReclaimed = 0;
  const failedKeys: string[] = [];

  for (let i = 0; i < staleObjects.length; i++) {
    const obj = staleObjects[i];

    try {
      await storage.delete(obj.key, 'temp');
      deletedCount++;
      bytesReclaimed += obj.size;
    } catch (error) {
      // Step 5: Continue deleting even if individual deletes fail
      failedKeys.push(obj.key);
    }

    // Step 8: Report progress incrementally (10% reserved for listing, 90% for deletions)
    const deletionProgress = 10 + Math.round(((i + 1) / staleObjects.length) * 90);
    await reportProgress(deletionProgress);
  }

  // Step 6: Log failed keys at error level
  if (failedKeys.length > 0) {
    logger.error('[cleanup-temp] Failed to delete some temp objects', {
      failedCount: failedKeys.length,
      failedKeys,
    });
  }

  // Step 7: Log deleted count and bytes reclaimed at info level
  logger.info('[cleanup-temp] Cleanup completed', {
    deletedCount,
    bytesReclaimed,
    failedCount: failedKeys.length,
    totalStale: staleObjects.length,
  });
};
