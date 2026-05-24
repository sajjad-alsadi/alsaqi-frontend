import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError, ZodIssue } from 'zod';
import { ValidationError, AppError, ErrorCode } from '../utils/errors';

/**
 * Maximum request body size in bytes (1 MB).
 * Requests exceeding this limit receive a 413 status.
 * File upload endpoints are exempt from this limit.
 */
export const MAX_BODY_SIZE = 1 * 1024 * 1024; // 1 MB

/**
 * Paths that are exempt from the 1 MB body size limit (file upload endpoints).
 * These endpoints have their own size limits governed by express-fileupload config.
 */
const FILE_UPLOAD_PATHS = [
  '/api/correspondence/attachments',
  '/api/v1/correspondence/attachments',
  '/api/compliance',
  '/api/v1/compliance',
];

/**
 * Represents a single field-level validation error.
 */
export interface FieldError {
  field: string;
  rule: string;
  message: string;
}

/**
 * Options for the combined validate middleware factory.
 */
export interface ValidateOptions {
  body?: ZodSchema;
  query?: ZodSchema;
  params?: ZodSchema;
}

/**
 * Converts a Zod issue into a field-level error object.
 * Extracts the field path, validation rule, and human-readable message.
 */
function zodIssueToFieldError(issue: ZodIssue): FieldError {
  const field = issue.path.length > 0 ? issue.path.join('.') : '_root';
  const rule = issue.code;
  const message = issue.message;
  return { field, rule, message };
}

/**
 * Converts a ZodError into an array of field-level errors.
 */
function formatZodErrors(error: ZodError): FieldError[] {
  return error.issues.map(zodIssueToFieldError);
}

/**
 * Validates the request body against a Zod schema.
 * Strips unknown fields (Zod's default behavior with .parse()).
 * Returns 400 with field-level errors on validation failure.
 *
 * Requirements: 6.1, 6.2, 6.5
 */
export const validateBody = (schema: ZodSchema) => {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = schema.parse(req.body);
      req.body = parsed;
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const errors = formatZodErrors(error);
        return res.status(400).json({
          success: false,
          error: {
            code: ErrorCode.VALIDATION_ERROR,
            message: 'Validation failed',
            errors,
          },
        });
      }
      next(error);
    }
  };
};

/**
 * Validates query parameters against a Zod schema.
 * Returns 400 with field-level errors on validation failure.
 *
 * Requirements: 6.1, 6.3
 */
export const validateQuery = (schema: ZodSchema) => {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = schema.parse(req.query);
      (req as any).query = parsed;
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const errors = formatZodErrors(error);
        return res.status(400).json({
          success: false,
          error: {
            code: ErrorCode.VALIDATION_ERROR,
            message: 'Query parameter validation failed',
            errors,
          },
        });
      }
      next(error);
    }
  };
};

/**
 * Validates path parameters against a Zod schema.
 * Returns 400 with field-level errors on validation failure.
 *
 * Requirements: 6.1, 6.6
 */
export const validateParams = (schema: ZodSchema) => {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = schema.parse(req.params);
      (req as any).params = parsed;
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const errors = formatZodErrors(error);
        return res.status(400).json({
          success: false,
          error: {
            code: ErrorCode.VALIDATION_ERROR,
            message: 'Path parameter validation failed',
            errors,
          },
        });
      }
      next(error);
    }
  };
};

/**
 * Combined validation middleware factory.
 * Validates body, query, and/or path params in a single middleware call.
 * Strips unknown fields from body, returns 400 with field-level errors on failure.
 *
 * Usage:
 *   router.post('/items', validate({ body: itemSchema, params: idParamSchema }), handler)
 *
 * Requirements: 6.1, 6.2, 6.5, 6.6
 */
export const validate = (options: ValidateOptions) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const allErrors: FieldError[] = [];

    // Validate path params
    if (options.params) {
      try {
        const parsed = options.params.parse(req.params);
        (req as any).params = parsed;
      } catch (error) {
        if (error instanceof ZodError) {
          allErrors.push(...formatZodErrors(error).map((e) => ({ ...e, field: `params.${e.field}` })));
        } else {
          return next(error);
        }
      }
    }

    // Validate query params
    if (options.query) {
      try {
        const parsed = options.query.parse(req.query);
        (req as any).query = parsed;
      } catch (error) {
        if (error instanceof ZodError) {
          allErrors.push(...formatZodErrors(error).map((e) => ({ ...e, field: `query.${e.field}` })));
        } else {
          return next(error);
        }
      }
    }

    // Validate body (strips unknown fields)
    if (options.body) {
      try {
        const parsed = options.body.parse(req.body);
        req.body = parsed;
      } catch (error) {
        if (error instanceof ZodError) {
          allErrors.push(...formatZodErrors(error).map((e) => ({ ...e, field: `body.${e.field}` })));
        } else {
          return next(error);
        }
      }
    }

    if (allErrors.length > 0) {
      return res.status(400).json({
        success: false,
        error: {
          code: ErrorCode.VALIDATION_ERROR,
          message: 'Validation failed',
          errors: allErrors,
        },
      });
    }

    next();
  };
};

/**
 * Middleware that rejects request bodies exceeding 1 MB with 413 status.
 * File upload endpoints (defined in FILE_UPLOAD_PATHS) are exempt.
 *
 * This checks the Content-Length header and also the actual body size.
 *
 * Requirements: 6.7
 */
export const bodySizeLimit = (req: Request, res: Response, next: NextFunction) => {
  // Check if this is a file upload endpoint (exempt from 1 MB limit)
  const requestPath = req.path || req.originalUrl;
  const isFileUpload = FILE_UPLOAD_PATHS.some(
    (uploadPath) => requestPath.startsWith(uploadPath) || requestPath === uploadPath
  );

  if (isFileUpload) {
    return next();
  }

  // Check Content-Length header first for early rejection
  const contentLength = req.headers['content-length'];
  if (contentLength && parseInt(contentLength, 10) > MAX_BODY_SIZE) {
    return res.status(413).json({
      success: false,
      error: {
        code: 'PAYLOAD_TOO_LARGE',
        message: 'Request body exceeds the maximum allowed size of 1 MB',
      },
    });
  }

  // Check actual body size if body is already parsed
  if (req.body && typeof req.body === 'object') {
    const bodyStr = JSON.stringify(req.body);
    if (Buffer.byteLength(bodyStr, 'utf8') > MAX_BODY_SIZE) {
      return res.status(413).json({
        success: false,
        error: {
          code: 'PAYLOAD_TOO_LARGE',
          message: 'Request body exceeds the maximum allowed size of 1 MB',
        },
      });
    }
  }

  next();
};

/**
 * Validates that a path parameter is either a valid integer or UUID.
 * Returns 400 if the parameter doesn't match either format.
 *
 * Requirements: 6.6
 */
export const validateIdParam = (paramName: string = 'id') => {
  return (req: Request, res: Response, next: NextFunction) => {
    const value = req.params[paramName];

    if (!value) {
      return res.status(400).json({
        success: false,
        error: {
          code: ErrorCode.VALIDATION_ERROR,
          message: `Path parameter '${paramName}' is required`,
          errors: [{ field: paramName, rule: 'required', message: `${paramName} is required` }],
        },
      });
    }

    const isInteger = /^\d+$/.test(value);
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

    if (!isInteger && !isUUID) {
      return res.status(400).json({
        success: false,
        error: {
          code: ErrorCode.VALIDATION_ERROR,
          message: `Path parameter '${paramName}' must be a valid integer or UUID`,
          errors: [
            {
              field: paramName,
              rule: 'format',
              message: `${paramName} must be a valid integer or UUID`,
            },
          ],
        },
      });
    }

    next();
  };
};

/**
 * Legacy validateSchema function for backward compatibility.
 * Validates request body against a Zod schema, strips unknown fields.
 * Passes errors to the next middleware (error handler) via ValidationError.
 *
 * @deprecated Use validateBody() or validate() instead for field-level error responses.
 */
export const validateSchema = (schema: ZodSchema) => {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = schema.parse(req.body);
      req.body = parsed;
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const errors = formatZodErrors(error);
        const firstErrorMessage = errors.length > 0 ? errors[0].message : 'Invalid request data';
        next(new ValidationError(firstErrorMessage, { errors }));
      } else {
        next(error);
      }
    }
  };
};
