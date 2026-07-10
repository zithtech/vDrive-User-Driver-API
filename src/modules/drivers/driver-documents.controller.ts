import { Request, Response, NextFunction } from 'express';
import { DriverDocumentsService } from './driver-documents.service';
import { s3Service } from '../s3/s3.service';
import { logger } from '../../shared/logger';
import { successResponse } from '../../shared/errorHandler';

export class DriverDocumentsController {
  static async getUploadUrl(req: Request, res: Response, next: NextFunction) {
    try {
      const { driverId } = req.params;
      const { documentType, contentType } = req.body;

      const key = `drivers/${driverId}/${documentType}_${Date.now()}`;
      const result = await s3Service.getUploadUrl(key, contentType);

      return successResponse(res, 200, 'Upload URL generated successfully', result);
    } catch (error) {
      next(error);
    }
  }

  static async saveDocument(req: Request, res: Response, next: NextFunction) {
    try {
      const driverId = req.params.driverId as string;
      const { documentType, documentUrl } = req.body;
      logger.info(`Saving document metadata for driver: ${driverId}, type: ${documentType}`);

      const document = await DriverDocumentsService.uploadDocument(
        driverId,
        documentType,
        documentUrl
      );

      return successResponse(res, 201, 'Document saved successfully', document);
    } catch (error: any) {
      // Handle OCR validation errors with specific error codes
      if (error?.statusCode === 400 && error?.errorCode) {
        return res.status(400).json({
          success: false,
          message: error.message,
          errorCode: error.errorCode,
          detectedDocumentType: error.detectedDocumentType || null,
        });
      }
      next(error);
    }
  }

  static async submitDocuments(req: Request, res: Response, next: NextFunction) {
    try {
      const { driverId } = req.params;
      logger.info(`Submitting documents for driver: ${driverId}`);

      await DriverDocumentsService.submitDocuments(driverId as string);

      return successResponse(res, 200, 'Documents submitted successfully', { success: true });
    } catch (error) {
      next(error);
    }
  }

  static async getDriverDocuments(req: Request, res: Response, next: NextFunction) {
    try {
      const { driverId } = req.params;
      const documents = await DriverDocumentsService.getDriverDocuments(driverId as string);
      return successResponse(res, 200, 'Documents fetched successfully', documents);
    } catch (error) {
      next(error);
    }
  }

  static async verifyDocument(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params; // Document ID
      const { status, remarks, reason } = req.body;
      const document = await DriverDocumentsService.verifyDocument(
        id as string,
        status,
        remarks || reason,
        reason || remarks
      );
      return successResponse(res, 200, 'Document verified successfully', document);
    } catch (error) {
      next(error);
    }
  }
}
