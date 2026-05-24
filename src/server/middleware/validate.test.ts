import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import {
  validateBody,
  validateQuery,
  validateParams,
  validate,
  bodySizeLimit,
  validateIdParam,
  validateSchema,
  MAX_BODY_SIZE,
} from './validate';
import {
  createMockRequest,
  createMockResponse,
  createMockNext,
} from '../__tests__/helpers/apiTestUtils';

describe('validate middleware', () => {
  describe('validateBody', () => {
    const schema = z.object({
      name: z.string().min(2),
      email: z.string().email(),
      age: z.number().int().positive().optional(),
    });

    it('passes valid body and strips unknown fields', () => {
      const req = createMockRequest({
        method: 'POST',
        body: { name: 'John', email: 'john@test.com', extra: 'should be stripped' },
      });
      const res = createMockResponse();
      const next = createMockNext();

      validateBody(schema)(req, res as any, next);

      expect(next).toHaveBeenCalled();
      expect(req.body).toEqual({ name: 'John', email: 'john@test.com' });
      expect(req.body.extra).toBeUndefined();
    });

    it('returns 400 with field-level errors on invalid body', () => {
      const req = createMockRequest({
        method: 'POST',
        body: { name: 'J', email: 'not-email' },
      });
      const res = createMockResponse();
      const next = createMockNext();

      validateBody(schema)(req, res as any, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res._json.success).toBe(false);
      expect(res._json.error.code).toBe('VALIDATION_ERROR');
      expect(res._json.error.errors).toBeInstanceOf(Array);
      expect(res._json.error.errors.length).toBeGreaterThan(0);

      // Check field-level error structure
      const fieldError = res._json.error.errors[0];
      expect(fieldError).toHaveProperty('field');
      expect(fieldError).toHaveProperty('rule');
      expect(fieldError).toHaveProperty('message');
    });

    it('includes correct field paths in errors', () => {
      const nestedSchema = z.object({
        address: z.object({
          city: z.string().min(1),
          zip: z.string().regex(/^\d{5}$/),
        }),
      });

      const req = createMockRequest({
        method: 'POST',
        body: { address: { city: '', zip: 'abc' } },
      });
      const res = createMockResponse();
      const next = createMockNext();

      validateBody(nestedSchema)(req, res as any, next);

      expect(res.status).toHaveBeenCalledWith(400);
      const errors = res._json.error.errors;
      const fieldPaths = errors.map((e: any) => e.field);
      expect(fieldPaths).toContain('address.city');
      expect(fieldPaths).toContain('address.zip');
    });

    it('does not call next on validation failure', () => {
      const req = createMockRequest({
        method: 'POST',
        body: {},
      });
      const res = createMockResponse();
      const next = createMockNext();

      validateBody(schema)(req, res as any, next);

      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('validateQuery', () => {
    const schema = z.object({
      page: z.coerce.number().int().min(1).default(1),
      pageSize: z.coerce.number().int().min(1).max(100).default(20),
    });

    it('passes valid query params with coercion', () => {
      const req = createMockRequest({
        query: { page: '2', pageSize: '50' },
      });
      const res = createMockResponse();
      const next = createMockNext();

      validateQuery(schema)(req, res as any, next);

      expect(next).toHaveBeenCalled();
      expect((req as any).query).toEqual({ page: 2, pageSize: 50 });
    });

    it('applies defaults for missing query params', () => {
      const req = createMockRequest({ query: {} });
      const res = createMockResponse();
      const next = createMockNext();

      validateQuery(schema)(req, res as any, next);

      expect(next).toHaveBeenCalled();
      expect((req as any).query).toEqual({ page: 1, pageSize: 20 });
    });

    it('returns 400 for invalid query params', () => {
      const req = createMockRequest({
        query: { page: 'abc', pageSize: '-1' },
      });
      const res = createMockResponse();
      const next = createMockNext();

      validateQuery(schema)(req, res as any, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res._json.error.errors).toBeInstanceOf(Array);
    });
  });

  describe('validateParams', () => {
    const schema = z.object({
      id: z.string().refine(
        (val) =>
          /^\d+$/.test(val) ||
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val),
        { message: 'id must be a valid integer or UUID' }
      ),
    });

    it('passes valid integer param', () => {
      const req = createMockRequest({ params: { id: '123' } });
      const res = createMockResponse();
      const next = createMockNext();

      validateParams(schema)(req, res as any, next);

      expect(next).toHaveBeenCalled();
    });

    it('passes valid UUID param', () => {
      const req = createMockRequest({
        params: { id: '550e8400-e29b-41d4-a716-446655440000' },
      });
      const res = createMockResponse();
      const next = createMockNext();

      validateParams(schema)(req, res as any, next);

      expect(next).toHaveBeenCalled();
    });

    it('returns 400 for invalid param format', () => {
      const req = createMockRequest({ params: { id: 'not-valid' } });
      const res = createMockResponse();
      const next = createMockNext();

      validateParams(schema)(req, res as any, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res._json.error.errors[0].field).toBe('id');
    });
  });

  describe('validate (combined)', () => {
    const bodySchema = z.object({
      title: z.string().min(1),
    });
    const querySchema = z.object({
      format: z.enum(['json', 'csv']).default('json'),
    });
    const paramsSchema = z.object({
      id: z.string().regex(/^\d+$/),
    });

    it('validates body, query, and params together', () => {
      const req = createMockRequest({
        method: 'PUT',
        body: { title: 'Test', extra: 'stripped' },
        query: { format: 'csv' },
        params: { id: '42' },
      });
      const res = createMockResponse();
      const next = createMockNext();

      validate({ body: bodySchema, query: querySchema, params: paramsSchema })(
        req,
        res as any,
        next
      );

      expect(next).toHaveBeenCalled();
      expect(req.body).toEqual({ title: 'Test' });
      expect((req as any).query).toEqual({ format: 'csv' });
    });

    it('collects errors from all sources', () => {
      const req = createMockRequest({
        method: 'PUT',
        body: { title: '' },
        query: { format: 'xml' as any },
        params: { id: 'abc' },
      });
      const res = createMockResponse();
      const next = createMockNext();

      validate({ body: bodySchema, query: querySchema, params: paramsSchema })(
        req,
        res as any,
        next
      );

      expect(res.status).toHaveBeenCalledWith(400);
      expect(next).not.toHaveBeenCalled();

      const errors = res._json.error.errors;
      expect(errors.length).toBeGreaterThanOrEqual(3);

      const fieldPaths = errors.map((e: any) => e.field);
      expect(fieldPaths.some((f: string) => f.startsWith('params.'))).toBe(true);
      expect(fieldPaths.some((f: string) => f.startsWith('query.'))).toBe(true);
      expect(fieldPaths.some((f: string) => f.startsWith('body.'))).toBe(true);
    });

    it('only validates specified sources', () => {
      const req = createMockRequest({
        method: 'GET',
        query: { format: 'json' },
      });
      const res = createMockResponse();
      const next = createMockNext();

      validate({ query: querySchema })(req, res as any, next);

      expect(next).toHaveBeenCalled();
    });
  });

  describe('bodySizeLimit', () => {
    it('passes requests under 1 MB', () => {
      const req = createMockRequest({
        method: 'POST',
        url: '/api/items',
        body: { data: 'small payload' },
        headers: { 'content-length': '100' },
      });
      const res = createMockResponse();
      const next = createMockNext();

      bodySizeLimit(req, res as any, next);

      expect(next).toHaveBeenCalled();
    });

    it('rejects requests exceeding 1 MB via Content-Length header', () => {
      const req = createMockRequest({
        method: 'POST',
        url: '/api/items',
        body: {},
        headers: { 'content-length': String(MAX_BODY_SIZE + 1) },
      });
      const res = createMockResponse();
      const next = createMockNext();

      bodySizeLimit(req, res as any, next);

      expect(res.status).toHaveBeenCalledWith(413);
      expect(res._json.error.code).toBe('PAYLOAD_TOO_LARGE');
      expect(next).not.toHaveBeenCalled();
    });

    it('rejects requests with large parsed body', () => {
      const largeBody = { data: 'x'.repeat(MAX_BODY_SIZE + 1) };
      const req = createMockRequest({
        method: 'POST',
        url: '/api/items',
        body: largeBody,
      });
      const res = createMockResponse();
      const next = createMockNext();

      bodySizeLimit(req, res as any, next);

      expect(res.status).toHaveBeenCalledWith(413);
      expect(next).not.toHaveBeenCalled();
    });

    it('exempts file upload endpoints from size limit', () => {
      const req = createMockRequest({
        method: 'POST',
        url: '/api/correspondence/attachments',
        path: '/api/correspondence/attachments',
        body: { data: 'x'.repeat(100) },
        headers: { 'content-length': String(MAX_BODY_SIZE + 1) },
      });
      const res = createMockResponse();
      const next = createMockNext();

      bodySizeLimit(req, res as any, next);

      expect(next).toHaveBeenCalled();
    });

    it('exempts versioned file upload endpoints from size limit', () => {
      const req = createMockRequest({
        method: 'POST',
        url: '/api/v1/correspondence/attachments',
        path: '/api/v1/correspondence/attachments',
        body: {},
        headers: { 'content-length': String(MAX_BODY_SIZE + 1) },
      });
      const res = createMockResponse();
      const next = createMockNext();

      bodySizeLimit(req, res as any, next);

      expect(next).toHaveBeenCalled();
    });
  });

  describe('validateIdParam', () => {
    it('passes valid integer ID', () => {
      const req = createMockRequest({ params: { id: '123' } });
      const res = createMockResponse();
      const next = createMockNext();

      validateIdParam()(req, res as any, next);

      expect(next).toHaveBeenCalled();
    });

    it('passes valid UUID ID', () => {
      const req = createMockRequest({
        params: { id: '550e8400-e29b-41d4-a716-446655440000' },
      });
      const res = createMockResponse();
      const next = createMockNext();

      validateIdParam()(req, res as any, next);

      expect(next).toHaveBeenCalled();
    });

    it('rejects invalid ID format with 400', () => {
      const req = createMockRequest({ params: { id: 'not-valid-id' } });
      const res = createMockResponse();
      const next = createMockNext();

      validateIdParam()(req, res as any, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res._json.error.errors[0].field).toBe('id');
      expect(res._json.error.errors[0].rule).toBe('format');
      expect(next).not.toHaveBeenCalled();
    });

    it('rejects missing ID param with 400', () => {
      const req = createMockRequest({ params: {} });
      const res = createMockResponse();
      const next = createMockNext();

      validateIdParam()(req, res as any, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res._json.error.errors[0].rule).toBe('required');
    });

    it('supports custom param name', () => {
      const req = createMockRequest({ params: { userId: 'invalid' } });
      const res = createMockResponse();
      const next = createMockNext();

      validateIdParam('userId')(req, res as any, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res._json.error.errors[0].field).toBe('userId');
    });

    it('accepts zero as valid integer', () => {
      const req = createMockRequest({ params: { id: '0' } });
      const res = createMockResponse();
      const next = createMockNext();

      validateIdParam()(req, res as any, next);

      // '0' matches /^\d+$/ so it should pass
      expect(next).toHaveBeenCalled();
    });
  });

  describe('validateSchema (legacy)', () => {
    const schema = z.object({
      name: z.string().min(2),
      email: z.string().email(),
    });

    it('passes valid body and strips unknown fields', () => {
      const req = createMockRequest({
        method: 'POST',
        body: { name: 'John', email: 'john@test.com', extra: 'stripped' },
      });
      const res = createMockResponse();
      const next = createMockNext();

      validateSchema(schema)(req, res as any, next);

      expect(next).toHaveBeenCalled();
      expect(req.body).toEqual({ name: 'John', email: 'john@test.com' });
    });

    it('calls next with ValidationError on invalid body', () => {
      const req = createMockRequest({
        method: 'POST',
        body: { name: 'J', email: 'bad' },
      });
      const res = createMockResponse();
      const next = createMockNext();

      validateSchema(schema)(req, res as any, next);

      expect(next).toHaveBeenCalled();
      const error = (next as any).mock.calls[0][0];
      expect(error).toBeDefined();
      expect(error.statusCode).toBe(400);
      expect(error.details.errors).toBeInstanceOf(Array);
    });
  });
});
