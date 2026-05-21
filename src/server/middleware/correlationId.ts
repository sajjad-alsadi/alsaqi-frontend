import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { requestContext } from '../utils/logger';

/**
 * Middleware that generates a unique correlation ID for each request.
 * This ID is propagated through all logs for request tracing.
 * Also sets the X-Correlation-ID response header for client-side debugging.
 */
export const correlationIdMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const correlationId = (req.headers['x-correlation-id'] as string) || uuidv4();
  
  res.setHeader('X-Correlation-ID', correlationId);

  const userId = (req as any).user?.id;
  
  requestContext.run({ correlationId, userId }, () => {
    next();
  });
};
