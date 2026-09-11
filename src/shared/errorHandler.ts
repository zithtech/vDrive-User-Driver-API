// src/shared/errorHandler.ts
import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { logger } from './logger';
import { isCelebrateError } from 'celebrate';

const SERVICE_NAME = process.env.SERVICE_NAME || 'driver-booking-service';
const VERSION = process.env.API_VERSION || 'v1';

const buildResponse = (
  statusCode: number,
  success: boolean,
  message: string,
  data: any = null,
  error: any = null,
  requestId?: string
) => {
  return {
    statusCode,
    success,
    message,
    data,
    meta: {
      requestId: requestId || uuidv4(),
      timestamp: new Date().toISOString(),
      service: SERVICE_NAME,
      version: VERSION,
    },
    error,
  };
};

export const successResponse = (
  res: Response,
  statusCode: number,
  message: string,
  data: any = null,
  requestId?: string
) => {
  return res
    .status(statusCode)
    .json(buildResponse(statusCode, true, message, data, null, requestId));
};

export const errorResponse = (
  res: Response,
  statusCode: number,
  message: string,
  error: any = null,
  requestId?: string
) => {
  return res
    .status(statusCode)
    .json(buildResponse(statusCode, false, message, null, error, requestId));
};

export const errorHandler = (err: any, req: Request, res: Response, _next: NextFunction) => {
  const requestId = (req as any).requestId || uuidv4();
  let statusCode = err.statusCode || 500;
  let message = err.message || 'Internal server error';
  let errorDetails: any = err.details || err.message;

  // Handle Celebrate/Joi validation errors
  if (isCelebrateError(err)) {
    statusCode = 400; // Bad Request
    const validationErrors: Record<string, string[]> = {};

    // err.details is a Map internally
    for (const [key, joiError] of err.details.entries()) {
      validationErrors[key] = joiError.details.map((d) => d.message);
    }

    message = 'Validation error';
    errorDetails = validationErrors;
    console.log(`Validation Error Details:`, JSON.stringify(validationErrors));
  }

  const error = {
    code: err.code || mapStatusCodeToErrorCode(statusCode),
    details: errorDetails,
  };

  logger.error(`[${requestId}] ${err.stack || err.message}`);

  return res
    .status(statusCode)
    .json(buildResponse(statusCode, false, message, null, error, requestId));
};

const mapStatusCodeToErrorCode = (statusCode: number) => {
  switch (statusCode) {
    case 400:
      return 'VALIDATION_ERROR';
    case 401:
      return 'AUTH_FAILED';
    case 403:
      return 'ACCESS_DENIED';
    case 404:
      return 'RESOURCE_NOT_FOUND';
    case 500:
    default:
      return 'SERVER_ERROR';
  }
};
