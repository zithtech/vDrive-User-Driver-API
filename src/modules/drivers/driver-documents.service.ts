import { DriverDocumentsRepository } from './driver-documents.repository';
import { DriverDocument, DocumentType, DocumentStatus } from './driver-documents.model';
import { logger } from '../../shared/logger';
import { query } from '../../shared/database';
import { DriverRepository } from './driver.repository';
import { notificationService } from '../../services/notificationService';
import { DriverOnboardingStatus } from '../../enums/user.enums';

export class DriverDocumentsService {
  static async getDriverDocuments(driverId: string): Promise<DriverDocument[]> {
    logger.info(`Getting all documents for driver: ${driverId}`);
    return await DriverDocumentsRepository.findByDriverId(driverId);
  }

  static async getDocumentById(id: string): Promise<DriverDocument | null> {
    logger.info(`Getting document by ID: ${id}`);
    return await DriverDocumentsRepository.findById(id);
  }

  static async uploadDocument(
    driverId: string,
    documentType: DocumentType,
    documentUrl: any
  ): Promise<DriverDocument> {
    logger.info(`Upserting document for driver: ${driverId}, type: ${documentType}`);
    const document = await DriverDocumentsRepository.upsert(driverId, documentType, documentUrl);

    // Update onboarding status to UPLOADING if not already further
    // Update onboarding status to ADDRESS_COMPLETED if not already further
    // Or just leave it as is.
    // We removed DOCS_UPLOADING from model.
    // So we don't update status here.

    // TEMPORARY: Sync overall KYC status immediately after upload for auto-verification
    // This allows the driver to see "Verified" (temporary) in the UI
    await this.syncKYCStatus(driverId);

    return document;
  }

  static async submitDocuments(driverId: string): Promise<void> {
    logger.info(`Submitting documents for driver: ${driverId}`);
    /**
     * REDESIGN: ONBOARDING STATE MACHINE
     * Transition: ADDRESS_COMPLETED -> DOCS_SUBMITTED
     * Triggered when the driver explicitly submits all mandatory documents.
     */
    // Check if all mandatory documents are uploaded
    const allDocs = await DriverDocumentsRepository.findByDriverId(driverId);
    const mandatoryTypes: DocumentType[] = [
      DocumentType.AADHAAR_CARD,
      DocumentType.DRIVING_LICENSE,
      DocumentType.PAN_CARD,
      DocumentType.PROFILE_SELFIE
    ];

    const hasAllMandatory = mandatoryTypes.every(type =>
      allDocs.some(d => d.document_type === type && (d.status === DocumentStatus.VERIFIED || d.status === DocumentStatus.PENDING))
    );

    if (!hasAllMandatory) {
      throw { statusCode: 400, message: 'Please upload all mandatory documents before submitting.' };
    }

    await query(
      `UPDATE drivers SET onboarding_status = $1, documents_submitted = true, updated_at = NOW() WHERE id = $2`,
      [DriverOnboardingStatus.DOCS_SUBMITTED, driverId]
    );
  }

  /**
   * Helper to sync overall driver KYC status based on current documents
   */
  public static async syncKYCStatus(driverId: string): Promise<void> {
    const allDocs = await DriverDocumentsRepository.findByDriverId(driverId);

    const mandatoryTypes: DocumentType[] = [
      DocumentType.AADHAAR_CARD,
      DocumentType.DRIVING_LICENSE,
      DocumentType.PAN_CARD,
      DocumentType.PROFILE_SELFIE
    ];

    const mandatoryDocs = allDocs.filter(d => mandatoryTypes.includes(d.document_type as DocumentType));

    let overallStatus = 'pending';
    let onboardingStatusUpdate = null;

    const allVerified = mandatoryDocs.length === mandatoryTypes.length && mandatoryDocs.every(d => d.status === DocumentStatus.VERIFIED);
    const anyRejected = mandatoryDocs.some(d => d.status === DocumentStatus.REJECTED);

    if (allVerified) {
      overallStatus = 'verified';
      onboardingStatusUpdate = DriverOnboardingStatus.DOCUMENTS_APPROVED;
    } else if (anyRejected) {
      overallStatus = 'rejected';
      onboardingStatusUpdate = DriverOnboardingStatus.DOCS_REJECTED;
    }

    const kycData = {
      overallStatus,
      verifiedAt: overallStatus === 'verified' ? new Date().toISOString() : null
    };

    // ── SYNC PROFILE PHOTO ──
    // If we have a PROFILE_SELFIE, sync it to the main profile_pic_url field
    const selfieDoc = allDocs.find(d => d.document_type === DocumentType.PROFILE_SELFIE);
    let selfieUrl = null;
    if (selfieDoc && selfieDoc.document_url) {
      const rawUrl = selfieDoc.document_url;
      if (typeof rawUrl === 'object') {
        selfieUrl = rawUrl.url || rawUrl.front || null;
      } else if (typeof rawUrl === 'string') {
        if (rawUrl.startsWith('{')) {
          try {
            const parsed = JSON.parse(rawUrl);
            selfieUrl = parsed.url || parsed.front || rawUrl;
          } catch (e) {
            selfieUrl = rawUrl;
          }
        } else {
          selfieUrl = rawUrl;
        }
      }
    }

    let sql = 'UPDATE drivers SET kyc = COALESCE(kyc, \'{}\'::jsonb) || $1';
    const params: any[] = [JSON.stringify(kycData), driverId];

    if (onboardingStatusUpdate) {
      sql += `, onboarding_status = $3`;
      params.push(onboardingStatusUpdate);
    }

    if (selfieUrl) {
      sql += `, profile_pic_url = $${params.length + 1}`;
      params.push(selfieUrl);
    }

    sql += ', updated_at = NOW() WHERE id = $2';

    await query(sql, params);

    logger.info(`Driver ${driverId} KYC status synced to ${overallStatus} and onboarding status to ${onboardingStatusUpdate || 'unchanged'}`);

    // Send Notification on approval or rejection
    if (onboardingStatusUpdate) {
      try {
        const driver = await DriverRepository.findById(driverId);
        if (driver && driver.fcm_token) {
          if (onboardingStatusUpdate === DriverOnboardingStatus.DOCUMENTS_APPROVED) {
            await notificationService.sendPushNotification(driver.fcm_token, {
              title: 'Account Approved!',
              body: 'Your documents have been verified. You can now go online and start earning.',
              data: {
                type: 'ACCOUNT_APPROVED',
                onboarding_status: DriverOnboardingStatus.DOCUMENTS_APPROVED
              }
            });
          } else if (onboardingStatusUpdate === DriverOnboardingStatus.DOCS_REJECTED) {
            const rejectedDocs = mandatoryDocs.filter(d => d.status === DocumentStatus.REJECTED);
            const docNames = rejectedDocs.map(d => d.document_type.replace(/_/g, ' ').toUpperCase()).join(', ');
            
            await notificationService.sendPushNotification(driver.fcm_token, {
              title: 'Documents Need Correction',
              body: `Your ${docNames} was rejected. Please re-upload it with clear images.`,
              data: {
                type: 'DOCS_REJECTED',
                onboarding_status: DriverOnboardingStatus.DOCS_REJECTED
              }
            });
          }
        }
      } catch (err: any) {
        logger.error(`Failed to send status update notification: ${err.message}`);
      }
    }
  }

  static async verifyDocument(
    id: string,
    status: DocumentStatus,
    remarks?: string,
    rejection_reason?: string
  ): Promise<DriverDocument | null> {
    logger.info(`Verifying document ${id} with status: ${status}`);
    const document = await DriverDocumentsRepository.updateStatus(id, status, remarks, rejection_reason);

    if (document) {
      // Sync overall KYC status for the driver
      await this.syncKYCStatus(document.driver_id);
    }

    return document;
  }

  static async deleteDocument(id: string): Promise<boolean> {
    logger.info(`Deleting document: ${id}`);
    return await DriverDocumentsRepository.delete(id);
  }
}
