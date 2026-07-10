import { query } from '../../shared/database';
import { DriverDocument, DocumentType, DocumentStatus } from './driver-documents.model';

const parseDoc = (doc: any) => {
  if (!doc) return doc;
  // If it's already an object (JSONB returns objects in node-postgres), just return it
  if (doc.document_url && typeof doc.document_url === 'object') {
    return doc;
  }
  try {
    if (
      doc.document_url &&
      typeof doc.document_url === 'string' &&
      (doc.document_url.trim().startsWith('{') || doc.document_url.trim().startsWith('['))
    ) {
      return { ...doc, document_url: JSON.parse(doc.document_url) };
    }
  } catch (e) {
    // ignore parse error
  }
  return doc;
};

export const DriverDocumentsRepository = {
  async findByDriverId(driverId: string): Promise<DriverDocument[]> {
    const sqlQuery = `
      SELECT id, driver_id, document_type, document_url, status, uploaded_at, verified_at, remarks, rejection_reason
      FROM driver_documents
      WHERE driver_id = $1
    `;
    const result = await query(sqlQuery, [driverId]);
    return result.rows.map(parseDoc) as DriverDocument[];
  },

  async findById(id: string): Promise<DriverDocument | null> {
    const sqlQuery = `
      SELECT id, driver_id, document_type, document_url, status, uploaded_at, verified_at, remarks, rejection_reason
      FROM driver_documents
      WHERE id = $1
    `;
    const result = await query(sqlQuery, [id]);
    const doc = result.rows[0];
    return doc ? (parseDoc(doc) as DriverDocument) : null;
  },

  async insert(document: Omit<DriverDocument, 'id' | 'uploaded_at'>): Promise<DriverDocument> {
    const sqlQuery = `
      INSERT INTO driver_documents (driver_id, document_type, document_url, status, remarks, rejection_reason)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id, driver_id, document_type, document_url, status, uploaded_at, verified_at, remarks, rejection_reason
    `;
    const result = await query(sqlQuery, [
      document.driver_id,
      document.document_type,
      document.document_url || null, // pg handles object to JSONB conversion
      document.status,
      document.remarks || null,
      (document as any).rejection_reason || null,
    ]);
    return parseDoc(result.rows[0]) as DriverDocument;
  },

  async updateStatus(
    id: string,
    status: DocumentStatus,
    remarks?: string,
    rejection_reason?: string
  ): Promise<DriverDocument | null> {
    const sqlQuery = `
      UPDATE driver_documents
      SET status = $2, verified_at = CURRENT_TIMESTAMP, remarks = $3, rejection_reason = $4
      WHERE id = $1
      RETURNING id, driver_id, document_type, document_url, status, uploaded_at, verified_at, remarks, rejection_reason
    `;
    const result = await query(sqlQuery, [id, status, remarks || null, rejection_reason || null]);
    const doc = result.rows[0];
    return doc ? (parseDoc(doc) as DriverDocument) : null;
  },

  async upsert(
    driverId: string,
    documentType: DocumentType,
    documentUrl: any
  ): Promise<DriverDocument> {
    const sqlQuery = `
      INSERT INTO driver_documents (driver_id, document_type, document_url, status, verified_at)
      VALUES ($1, $2, $3, 'pending', NULL)
      ON CONFLICT (driver_id, document_type)
      DO UPDATE SET 
        document_url = EXCLUDED.document_url, 
        status = 'pending',
        verified_at = NULL,
        uploaded_at = CURRENT_TIMESTAMP,
        rejection_reason = NULL
      RETURNING id, driver_id, document_type, document_url, status, uploaded_at, verified_at, remarks, rejection_reason
    `;
    const result = await query(sqlQuery, [driverId, documentType, documentUrl]);
    return parseDoc(result.rows[0]) as DriverDocument;
  },

  async delete(id: string): Promise<boolean> {
    const sqlQuery = 'DELETE FROM driver_documents WHERE id = $1';
    const result = await query(sqlQuery, [id]);
    return (result.rowCount || 0) > 0;
  },

  async deleteByDriverId(driverId: string): Promise<boolean> {
    const sqlQuery = 'DELETE FROM driver_documents WHERE driver_id = $1';
    const result = await query(sqlQuery, [driverId]);
    return (result.rowCount || 0) >= 0;
  },

  async updateOCRData(
    id: string,
    ocrData: {
      ocr_extracted_number?: string;
      ocr_extracted_name?: string;
      ocr_extracted_expiry?: string;
      ocr_status: 'COMPLETED' | 'FAILED' | 'SKIPPED';
      ocr_raw_text?: string;
    }
  ): Promise<DriverDocument | null> {
    const sqlQuery = `
      UPDATE driver_documents
      SET ocr_extracted_number = $2,
          ocr_extracted_name = $3,
          ocr_extracted_expiry = $4,
          ocr_status = $5,
          ocr_raw_text = $6
      WHERE id = $1
      RETURNING id, driver_id, document_type, document_url, status, uploaded_at, verified_at, remarks, rejection_reason,
                ocr_extracted_number, ocr_extracted_name, ocr_extracted_expiry, ocr_status
    `;
    const result = await query(sqlQuery, [
      id,
      ocrData.ocr_extracted_number || null,
      ocrData.ocr_extracted_name || null,
      ocrData.ocr_extracted_expiry || null,
      ocrData.ocr_status,
      ocrData.ocr_raw_text ? ocrData.ocr_raw_text.substring(0, 2000) : null, // Limit raw text size
    ]);
    const doc = result.rows[0];
    return doc ? (parseDoc(doc) as DriverDocument) : null;
  },

  async rejectWithReason(
    id: string,
    rejectionReason: string
  ): Promise<DriverDocument | null> {
    const sqlQuery = `
      UPDATE driver_documents
      SET status = 'rejected', rejection_reason = $2
      WHERE id = $1
      RETURNING id, driver_id, document_type, document_url, status, uploaded_at, verified_at, remarks, rejection_reason
    `;
    const result = await query(sqlQuery, [id, rejectionReason]);
    const doc = result.rows[0];
    return doc ? (parseDoc(doc) as DriverDocument) : null;
  },
};
