import { Request, Response, NextFunction } from 'express';
import { DriverDocumentsService } from '../drivers/driver-documents.service';
import { DocumentStatus } from '../drivers/driver-documents.model';
import { successResponse } from '../../shared/errorHandler';
import { query } from '../../shared/database';
import { logger } from '../../shared/logger';

export class AdminController {
  static async getPendingDrivers(req: Request, res: Response, next: NextFunction) {
    try {
      // Query drivers who have submitted documents but are not yet verified
      // onboarding_status = 'DOCS_SUBMITTED'
      const result = await query(
        `SELECT id, first_name, last_name, phone_number, onboarding_status, documents_submitted, created_at 
         FROM drivers 
         WHERE onboarding_status = 'DOCS_SUBMITTED' 
         ORDER BY updated_at DESC`
      );

      return successResponse(res, 200, 'Pending drivers fetched successfully', result.rows);
    } catch (error) {
      next(error);
    }
  }

  static async approveDocument(req: Request, res: Response, next: NextFunction) {
    try {
      const { documentId } = req.params;

      const document = await DriverDocumentsService.verifyDocument(
        documentId as string,
        DocumentStatus.VERIFIED
      );

      if (!document) {
        return res.status(404).json({ success: false, message: 'Document not found' });
      }

      return successResponse(res, 200, 'Document approved successfully', document);
    } catch (error) {
      next(error);
    }
  }

  static async rejectDocument(req: Request, res: Response, next: NextFunction) {
    try {
      const { documentId } = req.params;
      const { reason } = req.body;

      if (!reason) {
        return res.status(400).json({ success: false, message: 'Rejection reason is required' });
      }

      const document = await DriverDocumentsService.verifyDocument(
        documentId as string,
        DocumentStatus.REJECTED,
        reason
      );

      if (!document) {
        return res.status(404).json({ success: false, message: 'Document not found' });
      }

      return successResponse(res, 200, 'Document rejected successfully', document);
    } catch (error) {
      next(error);
    }
  }
}
