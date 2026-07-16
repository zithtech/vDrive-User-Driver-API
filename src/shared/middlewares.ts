// src/shared/middlewares.ts
import { Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import morgan from 'morgan';
import hpp from 'hpp';
import { v4 as uuidv4 } from 'uuid';
import { logger } from './logger';

// Request ID Middleware
const requestId = (req: Request, res: Response, next: NextFunction) => {
  (req as any).requestId = req.headers['x-request-id'] || uuidv4();
  res.setHeader('X-Request-Id', (req as any).requestId);
  next();
};

// Request Logger
const requestLogger = morgan('combined', {
  stream: { write: (message: string) => logger.info(message.trim()) },
});

// Rate Limiter
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500, // Increased for production to accommodate dashboard burst requests
  standardHeaders: true,
  legacyHeaders: false,
  message: { statusCode: 429, success: false, message: 'Too many requests' },
});

const rateLimiter = (req: Request, res: Response, next: NextFunction) => {
  if (process.env.NODE_ENV === 'production') {
    return limiter(req, res, next);
  }
  next();
};

// Security Middlewares
const security = [helmet(), hpp()];

// CORS
const corsMiddleware = cors({
  origin: true,
  credentials: true,
});

// Compression (skip media files)
const compressionMiddleware = compression({
  filter: (req: Request, res: Response): boolean => {
    const contentType = res.getHeader('Content-Type');
    if (!contentType) return false;
    return (
      contentType.toString().includes('application/json') ||
      contentType.toString().includes('text/')
    );
  },
  threshold: 1024,
});

// Async Error Wrapper
const asyncHandler = (fn: any) => (req: Request, res: Response, next: NextFunction) =>
  Promise.resolve(fn(req, res, next)).catch(next);

export const middlewares = {
  requestId,
  requestLogger,
  rateLimiter,
  security,
  corsMiddleware,
  compressionMiddleware,
  asyncHandler,
};
