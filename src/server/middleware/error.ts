import { Request, Response, NextFunction } from 'express';
import { AppError, ErrorCode } from '../utils/errors';
import logger from '../utils/logger';
import { v4 as uuidv4 } from 'uuid';

export const globalErrorHandler = (err: any, req: Request, res: Response, next: NextFunction) => {
  const traceId = uuidv4();
  
  // Default values
  let statusCode = err.statusCode || 500;
  let errorCode = err.errorCode || ErrorCode.INTERNAL_SERVER_ERROR;
  let message = err.message || 'Internal Server Error';
  let details = err.details || undefined;

  // Log the error
  const logMetadata = {
    traceId,
    method: req.method,
    url: req.originalUrl,
    ip: req.ip,
    userId: (req as any).user?.id,
    errorCode,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
    details
  };

  if (statusCode >= 500) {
    logger.error(`[${traceId}] ${message}`, logMetadata);
  } else if (statusCode === 401) {
    // Log 401s as info to reduce noise, as they are common for session expirations
    logger.info(`[${traceId}] ${message}`, logMetadata);
  } else {
    logger.warn(`[${traceId}] ${message}`, logMetadata);
  }

  // Security logging for specific errors
  if (errorCode === ErrorCode.UNAUTHORIZED || errorCode === ErrorCode.FORBIDDEN || errorCode === ErrorCode.SECURITY_ERROR) {
    logger.info(`[SECURITY] [${traceId}] ${message}`, { ...logMetadata, level: 'security' });
  }

  // Sanitize message for production if it's a 500 error
  if (process.env.NODE_ENV === 'production' && statusCode === 500) {
    message = 'An unexpected error occurred. Please contact support.';
  }

  res.status(statusCode).json({
    success: false,
    error: {
      code: errorCode,
      message,
      details,
      traceId
    }
  });
};

export const notFoundHandler = (req: Request, res: Response, next: NextFunction) => {
  const err = new AppError(`Route ${req.originalUrl} not found`, 404, ErrorCode.NOT_FOUND);
  next(err);
};
