import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';
import { ValidationError } from '../utils/errors';

export const validateSchema = (schema: ZodSchema) => {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = schema.parse(req.body);
      req.body = parsed; // Override request body with validated and stripped data
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        next(new ValidationError("Invalid request data", error.format()));
      } else {
        next(error);
      }
    }
  };
};
