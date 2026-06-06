/**
 * StorageService - MinIO/S3-compatible object storage abstraction.
 *
 * Provides a unified interface for all object storage operations:
 * upload (streaming), download, delete, copy, exists, listObjects.
 *
 * Uses @aws-sdk/client-s3 with path-style access for MinIO compatibility
 * and CertificateManager for TLS configuration.
 *
 * Requirements: 1.4, 2.2, 2.5, 10.2
 */

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  CopyObjectCommand,
  ListObjectsV2Command,
  AbortMultipartUploadCommand,
  ListMultipartUploadsCommand,
  type S3ClientConfig,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { NodeHttpHandler } from '@smithy/node-http-handler';
import { Agent as HttpsAgent } from 'https';
import { Readable } from 'stream';
import logger from '../utils/logger.js';
import { type StorageConfig, getStorageConfig } from '../config/storage.config.js';
import { type CertificateManager } from './certificate-manager.js';
import { type BucketName, type FileRecord } from '../../models/file-record.model.js';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface UploadParams {
  key: string;
  body: Buffer | Readable | ReadableStream;
  contentType: string;
  bucket?: BucketName;
  metadata?: Record<string, string>;
}

export interface StorageResult {
  key: string;
  bucket: BucketName;
  etag: string;
  size: number;
  url: string;
}

export interface StorageObject {
  key: string;
  size: number;
  lastModified: Date;
  etag: string;
}

// ─── Errors ──────────────────────────────────────────────────────────────────

/**
 * Error thrown when a presigned URL is requested for a FileRecord
 * that does not have status 'ready'.
 *
 * Requirements: 3.4, 3.5
 */
export class FileNotReadyError extends Error {
  public readonly fileId: string;
  public readonly fileStatus: string;

  constructor(message: string, fileId: string, fileStatus: string) {
    super(message);
    this.name = 'FileNotReadyError';
    this.fileId = fileId;
    this.fileStatus = fileStatus;
  }
}

/**
 * Error thrown when a file upload exceeds the configured timeout (120s).
 * The multipart upload is aborted and incomplete parts are cleaned up.
 *
 * Requirements: 9.4
 */
export class UploadTimeoutError extends Error {
  public readonly key: string;
  public readonly bucket: string;
  public readonly timeoutMs: number;

  constructor(message: string, key: string, bucket: string, timeoutMs: number) {
    super(message);
    this.name = 'UploadTimeoutError';
    this.key = key;
    this.bucket = bucket;
    this.timeoutMs = timeoutMs;
  }
}

// ─── StorageService Class ────────────────────────────────────────────────────

export class StorageService {
  private client: S3Client;
  private config: StorageConfig;
  private certManager: CertificateManager;

  constructor(config?: StorageConfig, certManager?: CertificateManager) {
    this.config = config ?? getStorageConfig();
    this.certManager = certManager!;
    this.client = this.createS3Client();
  }

  /**
   * Uploads a file to MinIO using streaming (no full buffering in memory).
   * Passes the body (Buffer or ReadableStream) directly to S3 PutObject.
   *
   * Uses an AbortController to enforce the upload timeout (default: 120s).
   * If the timeout is exceeded, the upload is aborted, incomplete multipart
   * parts are cleaned up from MinIO, and an UploadTimeoutError is thrown.
   *
   * Requirements: 1.4 (streaming upload without full buffering)
   * Requirements: 9.4 (abort multipart uploads exceeding 120s, clean up parts)
   */
  async upload(params: UploadParams): Promise<StorageResult> {
    const bucket = this.resolveBucket(params.bucket);
    const bucketName = this.config.buckets[bucket];

    logger.info('[StorageService] Uploading object', {
      key: params.key,
      bucket: bucketName,
      contentType: params.contentType,
    });

    // Convert ReadableStream to Node.js Readable for SDK compatibility
    const body = this.normalizeBody(params.body);

    const command = new PutObjectCommand({
      Bucket: bucketName,
      Key: params.key,
      Body: body,
      ContentType: params.contentType,
      Metadata: params.metadata,
    });

    // Use AbortController to enforce upload timeout (Requirement 9.4)
    const abortController = new AbortController();
    const timeoutId = setTimeout(() => {
      abortController.abort();
    }, this.config.uploadTimeoutMs);

    try {
      const response = await this.client.send(command, {
        abortSignal: abortController.signal,
      });

      clearTimeout(timeoutId);

      const etag = response.ETag?.replace(/"/g, '') ?? '';

      // Determine size from body if possible
      const size = Buffer.isBuffer(params.body) ? params.body.length : 0;

      const url = `${this.getEndpointUrl()}/${bucketName}/${params.key}`;

      logger.info('[StorageService] Upload complete', {
        key: params.key,
        bucket: bucketName,
        etag,
      });

      return {
        key: params.key,
        bucket,
        etag,
        size,
        url,
      };
    } catch (error: unknown) {
      clearTimeout(timeoutId);

      // Check if the error is an abort/timeout
      if (this.isAbortError(error)) {
        logger.error('[StorageService] Upload timed out, aborting multipart upload', {
          key: params.key,
          bucket: bucketName,
          timeoutMs: this.config.uploadTimeoutMs,
        });

        // Clean up any incomplete multipart upload parts
        await this.abortIncompleteUploads(params.key, bucketName);

        throw new UploadTimeoutError(
          `Upload timed out after ${this.config.uploadTimeoutMs}ms for key: ${params.key}`,
          params.key,
          bucketName,
          this.config.uploadTimeoutMs,
        );
      }

      throw error;
    }
  }

  /**
   * Downloads a file from MinIO and returns a Node.js Readable stream.
   *
   * Requirements: 2.5 (returning ReadableStream for download)
   */
  async download(key: string, bucket?: BucketName): Promise<Readable> {
    const resolvedBucket = this.resolveBucket(bucket);
    const bucketName = this.config.buckets[resolvedBucket];

    logger.debug('[StorageService] Downloading object', { key, bucket: bucketName });

    const command = new GetObjectCommand({
      Bucket: bucketName,
      Key: key,
    });

    const response = await this.client.send(command);

    if (!response.Body) {
      throw new Error(`Empty response body for object: ${key}`);
    }

    // AWS SDK v3 returns a Readable (web ReadableStream in browser, Node Readable in Node)
    return response.Body as Readable;
  }

  /**
   * Deletes an object from MinIO.
   *
   * Requirements: 10.2 (temp cleanup requires deletion)
   */
  async delete(key: string, bucket?: BucketName): Promise<void> {
    const resolvedBucket = this.resolveBucket(bucket);
    const bucketName = this.config.buckets[resolvedBucket];

    logger.info('[StorageService] Deleting object', { key, bucket: bucketName });

    const command = new DeleteObjectCommand({
      Bucket: bucketName,
      Key: key,
    });

    await this.client.send(command);

    logger.info('[StorageService] Object deleted', { key, bucket: bucketName });
  }

  /**
   * Copies an object from a source location to a destination.
   * Used for temp → permanent bucket promotion.
   * Uses AbortController to enforce timeout.
   *
   * Requirements: 2.2 (copy file from temp to permanent bucket)
   */
  async copy(
    source: string,
    destination: string,
    sourceBucket?: BucketName,
    destBucket?: BucketName,
  ): Promise<StorageResult> {
    const resolvedSourceBucket = this.resolveBucket(sourceBucket);
    const resolvedDestBucket = this.resolveBucket(destBucket);
    const sourceBucketName = this.config.buckets[resolvedSourceBucket];
    const destBucketName = this.config.buckets[resolvedDestBucket];

    logger.info('[StorageService] Copying object', {
      source,
      destination,
      sourceBucket: sourceBucketName,
      destBucket: destBucketName,
    });

    const command = new CopyObjectCommand({
      Bucket: destBucketName,
      Key: destination,
      CopySource: `${sourceBucketName}/${source}`,
    });

    // Use AbortController to enforce timeout for copy operations
    const abortController = new AbortController();
    const timeoutId = setTimeout(() => {
      abortController.abort();
    }, this.config.uploadTimeoutMs);

    try {
      const response = await this.client.send(command, {
        abortSignal: abortController.signal,
      });

      clearTimeout(timeoutId);

      const etag = response.CopyObjectResult?.ETag?.replace(/"/g, '') ?? '';
      const url = `${this.getEndpointUrl()}/${destBucketName}/${destination}`;

      logger.info('[StorageService] Copy complete', {
        destination,
        destBucket: destBucketName,
        etag,
      });

      return {
        key: destination,
        bucket: resolvedDestBucket,
        etag,
        size: 0, // Copy doesn't return size; caller should use HeadObject if needed
        url,
      };
    } catch (error: unknown) {
      clearTimeout(timeoutId);

      if (this.isAbortError(error)) {
        logger.error('[StorageService] Copy timed out', {
          source,
          destination,
          sourceBucket: sourceBucketName,
          destBucket: destBucketName,
          timeoutMs: this.config.uploadTimeoutMs,
        });

        throw new UploadTimeoutError(
          `Copy operation timed out after ${this.config.uploadTimeoutMs}ms for key: ${destination}`,
          destination,
          destBucketName,
          this.config.uploadTimeoutMs,
        );
      }

      throw error;
    }
  }

  /**
   * Checks if an object exists in MinIO using HeadObject.
   */
  async exists(key: string, bucket?: BucketName): Promise<boolean> {
    const resolvedBucket = this.resolveBucket(bucket);
    const bucketName = this.config.buckets[resolvedBucket];

    try {
      const command = new HeadObjectCommand({
        Bucket: bucketName,
        Key: key,
      });

      await this.client.send(command);
      return true;
    } catch (error: unknown) {
      // S3 returns NotFound (404) when object doesn't exist
      if (this.isNotFoundError(error)) {
        return false;
      }
      throw error;
    }
  }

  /**
   * Lists objects in MinIO matching a prefix.
   * Used for operations like listing temp bucket contents for cleanup.
   *
   * Requirements: 10.2 (list temp objects for cleanup)
   */
  async listObjects(prefix: string, bucket?: BucketName): Promise<StorageObject[]> {
    const resolvedBucket = this.resolveBucket(bucket);
    const bucketName = this.config.buckets[resolvedBucket];

    logger.debug('[StorageService] Listing objects', { prefix, bucket: bucketName });

    const objects: StorageObject[] = [];
    let continuationToken: string | undefined;

    do {
      const command = new ListObjectsV2Command({
        Bucket: bucketName,
        Prefix: prefix,
        ContinuationToken: continuationToken,
      });

      const response = await this.client.send(command);

      if (response.Contents) {
        for (const item of response.Contents) {
          if (item.Key && item.Size !== undefined && item.LastModified && item.ETag) {
            objects.push({
              key: item.Key,
              size: item.Size,
              lastModified: item.LastModified,
              etag: item.ETag.replace(/"/g, ''),
            });
          }
        }
      }

      continuationToken = response.IsTruncated
        ? response.NextContinuationToken
        : undefined;
    } while (continuationToken);

    logger.debug('[StorageService] Listed objects', {
      prefix,
      bucket: bucketName,
      count: objects.length,
    });

    return objects;
  }

  /**
   * Generates a presigned URL for temporary direct object access.
   * Expiry is clamped between 60 and 86400 seconds.
   *
   * Requirements: 3.1
   */
  async getPresignedUrl(
    key: string,
    bucket?: BucketName,
    expiresIn?: number,
  ): Promise<string> {
    const resolvedBucket = this.resolveBucket(bucket);
    const bucketName = this.config.buckets[resolvedBucket];

    // Clamp expiry between 60s and 86400s (24 hours)
    const expiry = Math.min(86400, Math.max(60, expiresIn ?? this.config.presignedUrlExpiry));

    const command = new GetObjectCommand({
      Bucket: bucketName,
      Key: key,
    });

    const url = await getSignedUrl(this.client, command, { expiresIn: expiry });

    logger.debug('[StorageService] Generated presigned URL', {
      key,
      bucket: bucketName,
      expiresIn: expiry,
    });

    return url;
  }

  /**
   * Generates a presigned download URL for a FileRecord, but only if the
   * file has status 'ready'. Rejects with an error for non-ready files.
   *
   * Expiry is configurable (default 3600s, clamped 60–86400s).
   *
   * Requirements: 3.1, 3.4, 3.5
   */
  async getFileDownloadUrl(
    fileRecord: FileRecord,
    expiresIn?: number,
  ): Promise<string> {
    if (fileRecord.status !== 'ready') {
      throw new FileNotReadyError(
        `Cannot generate presigned URL: file '${fileRecord.id}' has status '${fileRecord.status}', expected 'ready'`,
        fileRecord.id,
        fileRecord.status,
      );
    }

    return this.getPresignedUrl(fileRecord.storageKey, fileRecord.bucket, expiresIn);
  }

  // ─── Private Helpers ─────────────────────────────────────────────────────────

  /**
   * Creates the S3Client with MinIO endpoint and TLS config from CertificateManager.
   * Uses path-style access (forcePathStyle: true) for MinIO compatibility.
   */
  private createS3Client(): S3Client {
    const protocol = this.config.useSSL ? 'https' : 'http';
    const endpoint = `${protocol}://${this.config.endpoint}:${this.config.port}`;

    const clientConfig: S3ClientConfig = {
      endpoint,
      region: this.config.region,
      credentials: {
        accessKeyId: this.config.accessKey,
        secretAccessKey: this.config.secretKey,
      },
      forcePathStyle: true, // Required for MinIO
    };

    // Configure TLS via CertificateManager if SSL is enabled
    if (this.config.useSSL && this.certManager) {
      const sslConfig = this.certManager.getMinioSSLConfig();

      if (sslConfig.ca || sslConfig.cert || sslConfig.key) {
        const httpsAgent = new HttpsAgent({
          ca: sslConfig.ca,
          cert: sslConfig.cert,
          key: sslConfig.key,
          rejectUnauthorized: true,
        });

        clientConfig.requestHandler = new NodeHttpHandler({
          httpsAgent,
          requestTimeout: this.config.uploadTimeoutMs,
        });
      } else {
        // Use default system CA with timeout
        clientConfig.requestHandler = new NodeHttpHandler({
          requestTimeout: this.config.uploadTimeoutMs,
        });
      }
    } else {
      // Non-SSL: still set timeout
      clientConfig.requestHandler = new NodeHttpHandler({
        requestTimeout: this.config.uploadTimeoutMs,
      });
    }

    logger.info('[StorageService] S3 client initialized', {
      endpoint,
      region: this.config.region,
      ssl: this.config.useSSL,
      forcePathStyle: true,
    });

    return new S3Client(clientConfig);
  }

  /**
   * Resolves bucket name, defaulting to 'evidence' when not specified.
   */
  private resolveBucket(bucket?: BucketName): BucketName {
    return bucket ?? 'evidence';
  }

  /**
   * Normalizes the upload body to a format the SDK can consume.
   * Passes Buffer directly; converts web ReadableStream to Node.js Readable.
   */
  private normalizeBody(body: Buffer | Readable | ReadableStream): Buffer | Readable {
    if (Buffer.isBuffer(body)) {
      return body;
    }

    if (body instanceof Readable) {
      return body;
    }

    // Web ReadableStream → Node.js Readable
    return Readable.fromWeb(body as import('stream/web').ReadableStream);
  }

  /**
   * Returns the base endpoint URL for constructing object URLs.
   */
  private getEndpointUrl(): string {
    const protocol = this.config.useSSL ? 'https' : 'http';
    return `${protocol}://${this.config.endpoint}:${this.config.port}`;
  }

  /**
   * Checks if an error is a "not found" error from S3.
   */
  private isNotFoundError(error: unknown): boolean {
    if (error && typeof error === 'object') {
      const err = error as { name?: string; $metadata?: { httpStatusCode?: number } };
      return (
        err.name === 'NotFound' ||
        err.name === 'NoSuchKey' ||
        err.$metadata?.httpStatusCode === 404
      );
    }
    return false;
  }

  /**
   * Checks if an error is an abort/timeout error from the AbortController signal.
   * Handles both standard AbortError and AWS SDK-specific abort patterns.
   */
  private isAbortError(error: unknown): boolean {
    if (!error || typeof error !== 'object') return false;
    const err = error as { name?: string; code?: string; message?: string };
    return (
      err.name === 'AbortError' ||
      err.code === 'ABORT_ERR' ||
      err.name === 'TimeoutError' ||
      (err.message?.includes('aborted') ?? false) ||
      (err.message?.includes('Request was aborted') ?? false)
    );
  }

  /**
   * Aborts all in-progress multipart uploads for a given key in a bucket.
   * Lists active multipart uploads and aborts any that match the key prefix.
   * Cleans up all incomplete parts from MinIO.
   *
   * Requirements: 9.4 (clean up incomplete parts from MinIO)
   */
  private async abortIncompleteUploads(key: string, bucketName: string): Promise<void> {
    try {
      // List all in-progress multipart uploads for this bucket/prefix
      const listCommand = new ListMultipartUploadsCommand({
        Bucket: bucketName,
        Prefix: key,
      });

      const listResponse = await this.client.send(listCommand);

      if (listResponse.Uploads && listResponse.Uploads.length > 0) {
        for (const upload of listResponse.Uploads) {
          if (upload.UploadId && upload.Key) {
            const abortCommand = new AbortMultipartUploadCommand({
              Bucket: bucketName,
              Key: upload.Key,
              UploadId: upload.UploadId,
            });

            await this.client.send(abortCommand);

            logger.info('[StorageService] Aborted incomplete multipart upload', {
              key: upload.Key,
              uploadId: upload.UploadId,
              bucket: bucketName,
            });
          }
        }
      } else {
        logger.debug('[StorageService] No incomplete multipart uploads to abort', {
          key,
          bucket: bucketName,
        });
      }
    } catch (cleanupError) {
      // Log but don't re-throw — cleanup is best-effort
      logger.error('[StorageService] Failed to abort incomplete multipart uploads', {
        key,
        bucket: bucketName,
        error: cleanupError instanceof Error ? cleanupError.message : String(cleanupError),
      });
    }
  }
}
