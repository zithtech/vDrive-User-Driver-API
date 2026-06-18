import { Request, Response, NextFunction } from 'express';
import { logger } from '../../shared/logger';
import { successResponse } from '../../shared/errorHandler';
import { s3Service } from './s3.service';

export const S3Controller = {
  // Local storage methods removed as per requirements.
  // Future generic S3 endpoints can be added here.

  async getPresignedUrl(req: Request, res: Response, next: NextFunction) {
    try {
      const { key, contentType } = req.body;
      if (!key || !contentType) {
        throw { statusCode: 400, message: 'Key and ContentType are required' };
      }
      const result = await s3Service.getUploadUrl(key, contentType);
      return successResponse(res, 200, 'Presigned URL generated successfully', result);
    } catch (error) {
      next(error);
    }
  },
};
