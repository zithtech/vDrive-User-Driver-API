// src/app.ts
import express from 'express';
import './config/firebase'; // 🔥 Initialize Firebase Admin

import { errorHandler } from './shared/errorHandler';
import { logger } from './shared/logger';
import { middlewares } from './shared/middlewares';
import cookieParser from 'cookie-parser';
import routes from './routes';
import path from 'path';

const app = express();

// Trust the first proxy hop (nginx / LB) so req.ip reflects the real client
// IP from X-Forwarded-For. Required for correct per-client rate limiting and
// to silence express-rate-limit's ERR_ERL_UNEXPECTED_X_FORWARDED_FOR warning.
app.set('trust proxy', 1);

// Serve uploads directory statically
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// app.use(xssClean());

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Core middlewares
app.use(middlewares.requestId);
app.use(middlewares.requestLogger);
app.use(middlewares.rateLimiter);
app.use(middlewares.security);
app.use(middlewares.corsMiddleware);
app.use(middlewares.compressionMiddleware);

// Routes
app.use('/api', routes);

app.get('/', (req, res) => {
  res.status(200).json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// 404 handler (catch-all)
app.use((req, res) => {
  logger.warn(`Route not found: ${req.method} ${req.originalUrl}`);
  res.status(404).json({
    error: 'Route not found',
    message: `Cannot ${req.method} ${req.originalUrl}`,
  });
});

// Error handling (must be last)
app.use(errorHandler);

export default app;
