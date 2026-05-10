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
        const errorData = error.format();
        let firstErrorMessage = "Invalid request data";
        for (const key in errorData) {
          if (key !== "_errors" && errorData[key as keyof typeof errorData]?._errors?.length) {
            firstErrorMessage = errorData[key as keyof typeof errorData]._errors[0];
            break;
          }
        }
        next(new ValidationError(firstErrorMessage, errorData));
      } else {
        next(error);
      }
    }
  };
};
