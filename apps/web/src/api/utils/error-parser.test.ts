/**
 * Unit tests for validation error parsing and client-side Zod validation.
 * Tests parseValidationErrors, validateWithSchema, zodErrorToFieldErrors,
 * and applyFieldErrors integration with react-hook-form.
 */
import { describe, it, expect, vi } from 'vitest';
import { AxiosError, type AxiosResponse } from 'axios';
import { z } from 'zod';
import {
  parseValidationErrors,
  detailsToFieldErrors,
  validateWithSchema,
  zodErrorToFieldErrors,
  applyFieldErrors,
  type FieldErrors,
} from './error-parser';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function createAxiosError(
  status: number,
  data: unknown
): AxiosError {
  const response = {
    status,
    data,
    headers: {},
    statusText: status === 400 ? 'Bad Request' : 'Error',
    config: {} as any,
  } as AxiosResponse;

  const error = new AxiosError(
    'Request failed',
    AxiosError.ERR_BAD_REQUEST,
    {} as any,
    {},
    response
  );

  return error;
}

function createStandardErrorResponse(details: Array<{ path: string; message: string; code: string }>) {
  return {
    success: false,
    data: null,
    error: {
      code: 'VALIDATION_ERROR',
      message: 'Validation failed',
      traceId: 'trace-123',
      details,
    },
    meta: {
      requestId: '550e8400-e29b-41d4-a716-446655440000',
      timestamp: '2024-01-01T00:00:00Z',
      version: '1.0.0',
    },
  };
}

// ─── parseValidationErrors ────────────────────────────────────────────────────

describe('parseValidationErrors', () => {
  it('should parse a conformant 400 response with details into FieldErrors', () => {
    const body = createStandardErrorResponse([
      { path: 'email', message: 'Invalid email', code: 'invalid_string' },
      { path: 'name', message: 'Name is required', code: 'too_small' },
    ]);

    const error = createAxiosError(400, body);
    const result = parseValidationErrors(error);

    expect(result).toEqual({
      email: 'Invalid email',
      name: 'Name is required',
    });
  });

  it('should handle nested paths (dot-separated)', () => {
    const body = createStandardErrorResponse([
      { path: 'address.city', message: 'City is required', code: 'too_small' },
      { path: 'address.zip', message: 'Invalid zip code', code: 'invalid_string' },
    ]);

    const error = createAxiosError(400, body);
    const result = parseValidationErrors(error);

    expect(result).toEqual({
      'address.city': 'City is required',
      'address.zip': 'Invalid zip code',
    });
  });

  it('should return null for non-400 status codes', () => {
    const body = createStandardErrorResponse([
      { path: 'email', message: 'Invalid email', code: 'invalid_string' },
    ]);

    const error = createAxiosError(500, body);
    const result = parseValidationErrors(error);

    expect(result).toBeNull();
  });

  it('should return null when response body does not conform to standard format', () => {
    const body = { message: 'Something went wrong', errors: ['bad thing'] };
    const error = createAxiosError(400, body);
    const result = parseValidationErrors(error);

    expect(result).toBeNull();
  });

  it('should return null when details array is empty', () => {
    const body = createStandardErrorResponse([]);
    const error = createAxiosError(400, body);
    const result = parseValidationErrors(error);

    expect(result).toBeNull();
  });

  it('should return null when details is undefined', () => {
    const body = {
      success: false,
      data: null,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Validation failed',
        traceId: 'trace-123',
        // no details array
      },
      meta: {
        requestId: '550e8400-e29b-41d4-a716-446655440000',
        timestamp: '2024-01-01T00:00:00Z',
        version: '1.0.0',
      },
    };

    const error = createAxiosError(400, body);
    const result = parseValidationErrors(error);

    expect(result).toBeNull();
  });

  it('should return null when error has no response (network error)', () => {
    const error = new AxiosError(
      'Network Error',
      AxiosError.ERR_NETWORK,
      {} as any,
      {}
    );

    const result = parseValidationErrors(error);
    expect(result).toBeNull();
  });

  it('should use first error for duplicate field paths', () => {
    const body = createStandardErrorResponse([
      { path: 'email', message: 'Invalid email format', code: 'invalid_string' },
      { path: 'email', message: 'Email already exists', code: 'custom' },
    ]);

    const error = createAxiosError(400, body);
    const result = parseValidationErrors(error);

    expect(result).toEqual({
      email: 'Invalid email format',
    });
  });
});

// ─── detailsToFieldErrors ─────────────────────────────────────────────────────

describe('detailsToFieldErrors', () => {
  it('should convert simple paths to FieldErrors', () => {
    const details = [
      { path: 'username', message: 'Username is required', code: 'too_small' },
    ];

    expect(detailsToFieldErrors(details)).toEqual({
      username: 'Username is required',
    });
  });

  it('should preserve dot-notation paths', () => {
    const details = [
      { path: 'contact.phone', message: 'Invalid phone number', code: 'invalid_string' },
    ];

    expect(detailsToFieldErrors(details)).toEqual({
      'contact.phone': 'Invalid phone number',
    });
  });

  it('should handle multiple fields', () => {
    const details = [
      { path: 'email', message: 'Required', code: 'too_small' },
      { path: 'password', message: 'Too short', code: 'too_small' },
      { path: 'name', message: 'Required', code: 'too_small' },
    ];

    const result = detailsToFieldErrors(details);
    expect(Object.keys(result)).toHaveLength(3);
    expect(result.email).toBe('Required');
    expect(result.password).toBe('Too short');
    expect(result.name).toBe('Required');
  });
});

// ─── validateWithSchema ───────────────────────────────────────────────────────

describe('validateWithSchema', () => {
  const TestSchema = z.object({
    email: z.string().min(1, 'Email is required').email('Invalid email'),
    name: z.string().min(1, 'Name is required').max(100),
    age: z.number().min(18, 'Must be at least 18'),
  });

  it('should return empty object when validation passes', () => {
    const data = { email: 'test@example.com', name: 'John', age: 25 };
    const result = validateWithSchema(TestSchema, data);
    expect(result).toEqual({});
  });

  it('should return field errors when validation fails', () => {
    const data = { email: '', name: '', age: 10 };
    const result = validateWithSchema(TestSchema, data);

    expect(result.email).toBeDefined();
    expect(result.name).toBeDefined();
    expect(result.age).toBe('Must be at least 18');
  });

  it('should produce errors within 200ms (performance check)', () => {
    const data = { email: '', name: '', age: 0 };
    const start = performance.now();
    validateWithSchema(TestSchema, data);
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(200);
  });

  it('should handle nested objects with dot-notation paths', () => {
    const NestedSchema = z.object({
      address: z.object({
        city: z.string().min(1, 'City is required'),
        zip: z.string().min(5, 'Zip must be at least 5 chars'),
      }),
    });

    const data = { address: { city: '', zip: '12' } };
    const result = validateWithSchema(NestedSchema, data);

    expect(result['address.city']).toBe('City is required');
    expect(result['address.zip']).toBe('Zip must be at least 5 chars');
  });
});

// ─── zodErrorToFieldErrors ────────────────────────────────────────────────────

describe('zodErrorToFieldErrors', () => {
  it('should convert ZodError issues to FieldErrors with dot-notation paths', () => {
    const schema = z.object({
      contact: z.object({
        email: z.string().email('Invalid email'),
      }),
    });

    const result = schema.safeParse({ contact: { email: 'not-an-email' } });
    expect(result.success).toBe(false);
    if (!result.success) {
      const errors = zodErrorToFieldErrors(result.error);
      expect(errors['contact.email']).toBe('Invalid email');
    }
  });

  it('should handle array paths (e.g., items.0.name)', () => {
    const schema = z.object({
      items: z.array(
        z.object({
          name: z.string().min(1, 'Item name required'),
        })
      ),
    });

    const result = schema.safeParse({ items: [{ name: '' }] });
    expect(result.success).toBe(false);
    if (!result.success) {
      const errors = zodErrorToFieldErrors(result.error);
      expect(errors['items.0.name']).toBe('Item name required');
    }
  });

  it('should skip errors with empty path', () => {
    const schema = z.string().min(1, 'Required');
    const result = schema.safeParse('');
    expect(result.success).toBe(false);
    if (!result.success) {
      const errors = zodErrorToFieldErrors(result.error);
      // Root-level error has empty path, should be skipped
      expect(Object.keys(errors)).toHaveLength(0);
    }
  });

  it('should use first error for duplicate field paths', () => {
    const schema = z.object({
      email: z.string().min(1, 'Required').email('Must be valid email'),
    });

    const result = schema.safeParse({ email: '' });
    expect(result.success).toBe(false);
    if (!result.success) {
      const errors = zodErrorToFieldErrors(result.error);
      // Should only have one entry for email (the first error)
      expect(errors.email).toBeDefined();
      expect(Object.keys(errors).filter((k) => k === 'email')).toHaveLength(1);
    }
  });
});

// ─── applyFieldErrors ─────────────────────────────────────────────────────────

describe('applyFieldErrors', () => {
  it('should call setError for each field with default "server" type', () => {
    const setError = vi.fn();
    const fieldErrors: FieldErrors = {
      email: 'Invalid email',
      name: 'Name is required',
    };

    applyFieldErrors(fieldErrors, setError);

    expect(setError).toHaveBeenCalledTimes(2);
    expect(setError).toHaveBeenCalledWith('email', { type: 'server', message: 'Invalid email' });
    expect(setError).toHaveBeenCalledWith('name', { type: 'server', message: 'Name is required' });
  });

  it('should use custom error type when specified', () => {
    const setError = vi.fn();
    const fieldErrors: FieldErrors = {
      email: 'Invalid email',
    };

    applyFieldErrors(fieldErrors, setError, 'validate');

    expect(setError).toHaveBeenCalledWith('email', { type: 'validate', message: 'Invalid email' });
  });

  it('should not call setError when fieldErrors is empty', () => {
    const setError = vi.fn();
    applyFieldErrors({}, setError);
    expect(setError).not.toHaveBeenCalled();
  });

  it('should handle nested field paths', () => {
    const setError = vi.fn();
    const fieldErrors: FieldErrors = {
      'address.city': 'City is required',
      'address.zip': 'Invalid zip',
    };

    applyFieldErrors(fieldErrors, setError);

    expect(setError).toHaveBeenCalledWith('address.city', {
      type: 'server',
      message: 'City is required',
    });
    expect(setError).toHaveBeenCalledWith('address.zip', {
      type: 'server',
      message: 'Invalid zip',
    });
  });
});
