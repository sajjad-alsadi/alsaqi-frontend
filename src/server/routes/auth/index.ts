import express from 'express';
import { createLoginRoutes } from './login';
import { createSessionRoutes } from './session';
import { createPasswordRoutes } from './password';

export const createAuthRoutes = (
  db: any,
  JWT_SECRET: string,
  JWT_PRIVATE_KEY: string,
  authLimiter: any,
  authenticate: any,
  authorize: any,
  createNotification: any,
  logError: any
) => {
  const router = express.Router();

  router.use(createLoginRoutes(db, JWT_SECRET, JWT_PRIVATE_KEY, authLimiter, logError));
  router.use(createSessionRoutes(db, JWT_SECRET, JWT_PRIVATE_KEY, authenticate, logError));
  router.use(createPasswordRoutes(db, JWT_SECRET, JWT_PRIVATE_KEY, authLimiter, authenticate, authorize, createNotification, logError));

  return router;
};
