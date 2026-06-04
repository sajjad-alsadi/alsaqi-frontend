/**
 * Validation Error Parser
 *
 * Parses API error responses into field-level errors for inline form display.
 * Also provides client-side Zod validation for immediate (<200ms) field feedback.
 *
 * Integrates with react-hook-form's setError() method.
 *
 * @module error-parser
 */
import { type AxiosError } from 'axios';
import { z } from 'zod';
import { ErrorResponseSchema, type ErrorDetail } from '@alsaqi/shared';

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * Field-level errors keyed by field path (dot-notation for nested fields).
 * Compatible with react-hook-form's setError() method.
 *
 * Example: { "email": "Invalid email", "address.city": "City is required" }
 */
export type FieldErrors = Record<string, string>;

// ─── API Error Parsing ────────────────────────────────────────────────────────

/**
 * Parse a standard API error response `details` array into a field-keyed object
 * for inline form display.
 *
 * - If the response is a conformant 400 with a `details` array, returns FieldErrors.
 * - If the response doesn't conform to the standard error format, returns null
 *   (caller should invoke onError with a generic message).
 *
 * @param error - Axios error from a failed API request
 * @returns FieldErrors object or null if response is non-conformant
 *
 * @example
 * ```ts
 * const fieldErrors = parseValidationErrors(axiosError);
 * if (fieldErrors) {
 *   Object.entries(fieldErrors).forEach(([field, message]) => {
 *     form.setError(field, { type: 'server', message });
 *   });
 * } else {
 *   onError({ type: 'unknown', url: '...', attempts: 1, reason: 'Unexpected error format' });
 * }
 * ```
 */
export function parseValidationErrors(error: AxiosError): FieldErrors | null {
  const response = error.response;

  // Must be an HTTP 400 response
  if (!response || response.status !== 400) {
    return null;
  }

  const body = response.data;

  // Validate the response conforms to the standard error response format
  const parsed = ErrorResponseSchema.safeParse(body);
  if (!parsed.success) {
    return null;
  }

  const { details } = parsed.data.error;

  // Must have a details array with at least one entry
  if (!details || details.length === 0) {
    return null;
  }

  return detailsToFieldErrors(details);
}

/**
 * Convert an array of ErrorDetail objects into a FieldErrors map.
 * Handles both string paths ("email") and dot-separated paths ("address.city").
 *
 * The `path` field from the API may come as:
 * - A simple string: "email"
 * - A dot-separated nested path: "address.city"
 *
 * @param details - Array of field-level error details from the API
 * @returns FieldErrors keyed by dot-notation path
 */
export function detailsToFieldErrors(details: ErrorDetail[]): FieldErrors {
  const errors: FieldErrors = {};

  for (const detail of details) {
    const fieldPath = detail.path;
    // Use the first error for each field (skip duplicates)
    if (!errors[fieldPath]) {
      errors[fieldPath] = detail.message;
    }
  }

  return errors;
}

// ─── Client-Side Zod Validation ───────────────────────────────────────────────

/**
 * Validate form data against a Zod schema and produce FieldErrors
 * in the same format as server-side validation errors.
 *
 * This enables immediate field-level error display (<200ms) without
 * requiring a server round-trip. Use this for client-side validation
 * before submission.
 *
 * @param schema - Zod schema to validate against
 * @param data - Form data to validate
 * @returns FieldErrors object (empty if validation passes)
 *
 * @example
 * ```ts
 * import { CreateFindingSchema } from '@alsaqi/shared';
 *
 * const errors = validateWithSchema(CreateFindingSchema, formData);
 * if (Object.keys(errors).length > 0) {
 *   Object.entries(errors).forEach(([field, message]) => {
 *     form.setError(field, { type: 'validate', message });
 *   });
 * }
 * ```
 */
export function validateWithSchema<T>(
  schema: z.ZodType<T>,
  data: unknown
): FieldErrors {
  const result = schema.safeParse(data);

  if (result.success) {
    return {};
  }

  return zodErrorToFieldErrors(result.error);
}

/**
 * Convert a ZodError into FieldErrors format.
 * Joins array path segments with dots for nested field paths.
 *
 * Example: ZodError with path ["address", "city"] → { "address.city": "..." }
 *
 * @param zodError - The ZodError from a failed safeParse
 * @returns FieldErrors keyed by dot-notation path
 */
export function zodErrorToFieldErrors(zodError: z.ZodError): FieldErrors {
  const errors: FieldErrors = {};

  for (const issue of zodError.issues) {
    const fieldPath = issue.path.join('.');
    // Use the first error for each field
    if (fieldPath && !errors[fieldPath]) {
      errors[fieldPath] = issue.message;
    }
  }

  return errors;
}

// ─── React Hook Form Integration ──────────────────────────────────────────────

/**
 * Apply field errors to a react-hook-form instance.
 *
 * This is a convenience function that takes FieldErrors and calls
 * setError for each field. Compatible with react-hook-form v7+.
 *
 * @param fieldErrors - FieldErrors to apply
 * @param setError - react-hook-form's setError function
 * @param errorType - The error type to set (defaults to 'server')
 *
 * @example
 * ```ts
 * const { setError } = useForm();
 *
 * try {
 *   await api.findings.create(data);
 * } catch (err) {
 *   if (axios.isAxiosError(err)) {
 *     const fieldErrors = parseValidationErrors(err);
 *     if (fieldErrors) {
 *       applyFieldErrors(fieldErrors, setError);
 *     }
 *   }
 * }
 * ```
 */
export function applyFieldErrors(
  fieldErrors: FieldErrors,
  setError: (name: string, error: { type: string; message: string }) => void,
  errorType: string = 'server'
): void {
  for (const [field, message] of Object.entries(fieldErrors)) {
    setError(field, { type: errorType, message });
  }
}
