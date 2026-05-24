import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createMockRequest,
  createMockResponse,
  createMockNext,
} from '../__tests__/helpers/apiTestUtils';
import {
  correlationIdMiddleware,
  createCorrelationIdMiddleware,
  isValidUuid,
} from './correlationId';

describe('correlationId middleware', () => {
  let mockRes: ReturnType<typeof createMockResponse>;
  let mockNext: ReturnType<typeof createMockNext>;

  beforeEach(() => {
    mockRes = createMockResponse();
    mockNext = createMockNext();
  });

  describe('isValidUuid', () => {
    it('accepts a valid UUID v4', () => {
      expect(isValidUuid('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
    });

    it('accepts uppercase UUID', () => {
      expect(isValidUuid('550E8400-E29B-41D4-A716-446655440000')).toBe(true);
    });

    it('accepts mixed case UUID', () => {
      expect(isValidUuid('550e8400-E29B-41d4-a716-446655440000')).toBe(true);
    });

    it('rejects string shorter than 36 chars', () => {
      expect(isValidUuid('550e8400-e29b-41d4-a716')).toBe(false);
    });

    it('rejects string longer than 36 chars', () => {
      expect(isValidUuid('550e8400-e29b-41d4-a716-446655440000x')).toBe(false);
    });

    it('rejects string with invalid characters', () => {
      expect(isValidUuid('550e8400-e29b-41d4-a716-44665544000g')).toBe(false);
    });

    it('rejects string without hyphens in correct positions', () => {
      expect(isValidUuid('550e8400e29b-41d4-a716-446655440000')).toBe(false);
    });

    it('rejects empty string', () => {
      expect(isValidUuid('')).toBe(false);
    });

    it('rejects non-UUID string of 36 chars', () => {
      expect(isValidUuid('this-is-not-a-valid-uuid-at-all!!!!!')).toBe(false);
    });
  });

  describe('correlationIdMiddleware (default instance)', () => {
    it('generates a new UUID when no header is provided', () => {
      const req = createMockRequest({ headers: {} });

      correlationIdMiddleware(req, mockRes as any, mockNext);

      const correlationId = (req as any).correlationId;
      expect(correlationId).toBeDefined();
      expect(isValidUuid(correlationId)).toBe(true);
      expect(mockNext).toHaveBeenCalled();
    });

    it('uses provided valid UUID from X-Correlation-Id header', () => {
      const validUuid = '550e8400-e29b-41d4-a716-446655440000';
      const req = createMockRequest({
        headers: { 'x-correlation-id': validUuid },
      });

      correlationIdMiddleware(req, mockRes as any, mockNext);

      expect((req as any).correlationId).toBe(validUuid);
      expect(mockNext).toHaveBeenCalled();
    });

    it('ignores invalid UUID format and generates new one', () => {
      const invalidUuid = 'not-a-valid-uuid';
      const req = createMockRequest({
        headers: { 'x-correlation-id': invalidUuid },
      });

      correlationIdMiddleware(req, mockRes as any, mockNext);

      const correlationId = (req as any).correlationId;
      expect(correlationId).not.toBe(invalidUuid);
      expect(isValidUuid(correlationId)).toBe(true);
      expect(mockNext).toHaveBeenCalled();
    });

    it('ignores UUID with wrong length', () => {
      const shortUuid = '550e8400-e29b-41d4';
      const req = createMockRequest({
        headers: { 'x-correlation-id': shortUuid },
      });

      correlationIdMiddleware(req, mockRes as any, mockNext);

      const correlationId = (req as any).correlationId;
      expect(correlationId).not.toBe(shortUuid);
      expect(isValidUuid(correlationId)).toBe(true);
    });

    it('sets X-Request-Id response header with the correlation ID', () => {
      const validUuid = '550e8400-e29b-41d4-a716-446655440000';
      const req = createMockRequest({
        headers: { 'x-correlation-id': validUuid },
      });

      correlationIdMiddleware(req, mockRes as any, mockNext);

      expect(mockRes.setHeader).toHaveBeenCalledWith('X-Request-Id', validUuid);
    });

    it('sets X-Request-Id response header with generated UUID when no header provided', () => {
      const req = createMockRequest({ headers: {} });

      correlationIdMiddleware(req, mockRes as any, mockNext);

      const correlationId = (req as any).correlationId;
      expect(mockRes.setHeader).toHaveBeenCalledWith('X-Request-Id', correlationId);
    });

    it('attaches correlationId to req for downstream use', () => {
      const req = createMockRequest({ headers: {} });

      correlationIdMiddleware(req, mockRes as any, mockNext);

      expect((req as any).correlationId).toBeDefined();
      expect(typeof (req as any).correlationId).toBe('string');
    });

    it('calls next() to continue the middleware chain', () => {
      const req = createMockRequest({ headers: {} });

      correlationIdMiddleware(req, mockRes as any, mockNext);

      expect(mockNext).toHaveBeenCalledTimes(1);
    });
  });

  describe('createCorrelationIdMiddleware with custom options', () => {
    it('reads from custom header name', () => {
      const middleware = createCorrelationIdMiddleware({
        headerName: 'x-trace-id',
      });
      const validUuid = '550e8400-e29b-41d4-a716-446655440000';
      const req = createMockRequest({
        headers: { 'x-trace-id': validUuid },
      });

      middleware(req, mockRes as any, mockNext);

      expect((req as any).correlationId).toBe(validUuid);
    });

    it('sets custom response header', () => {
      const middleware = createCorrelationIdMiddleware({
        responseHeader: 'X-Trace-Id',
      });
      const req = createMockRequest({ headers: {} });

      middleware(req, mockRes as any, mockNext);

      const correlationId = (req as any).correlationId;
      expect(mockRes.setHeader).toHaveBeenCalledWith('X-Trace-Id', correlationId);
    });

    it('ignores x-correlation-id when custom header name is configured', () => {
      const middleware = createCorrelationIdMiddleware({
        headerName: 'x-trace-id',
      });
      const validUuid = '550e8400-e29b-41d4-a716-446655440000';
      const req = createMockRequest({
        headers: { 'x-correlation-id': validUuid },
      });

      middleware(req, mockRes as any, mockNext);

      // Should generate a new UUID since x-trace-id is not present
      expect((req as any).correlationId).not.toBe(validUuid);
      expect(isValidUuid((req as any).correlationId)).toBe(true);
    });
  });

  describe('UUID validation edge cases', () => {
    it('rejects UUID with spaces', () => {
      const req = createMockRequest({
        headers: { 'x-correlation-id': ' 550e8400-e29b-41d4-a716-44665544000' },
      });

      correlationIdMiddleware(req, mockRes as any, mockNext);

      expect((req as any).correlationId).not.toBe(' 550e8400-e29b-41d4-a716-44665544000');
      expect(isValidUuid((req as any).correlationId)).toBe(true);
    });

    it('rejects UUID with extra hyphens', () => {
      const req = createMockRequest({
        headers: { 'x-correlation-id': '550e-8400-e29b-41d4-a716-4466554400' },
      });

      correlationIdMiddleware(req, mockRes as any, mockNext);

      expect(isValidUuid((req as any).correlationId)).toBe(true);
    });

    it('handles header value being undefined gracefully', () => {
      const req = createMockRequest({ headers: {} });

      correlationIdMiddleware(req, mockRes as any, mockNext);

      expect(isValidUuid((req as any).correlationId)).toBe(true);
      expect(mockNext).toHaveBeenCalled();
    });
  });
});
