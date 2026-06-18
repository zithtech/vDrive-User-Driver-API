import { Request, Response } from 'express';
import { EmailService } from './email.service';
import { logger } from '../../shared/logger';

export const InvoiceController = {
  async sendInvoice(req: Request, res: Response): Promise<Response> {
    const { recipient, filename, base64_data, invoiceId } = req.body;

    // 1. Input Validation (Controller's job)
    if (!recipient || !filename || !base64_data) {
      return res.status(400).json({
        message: 'Missing required fields: recipient, filename, or base64_data.',
      });
    }

    try {
      // 2. Prepare payload and call the Service layer
      await EmailService.sendInvoiceEmail({
        recipient,
        filename,
        base64_data,
        subject: `Invoice #${invoiceId || 'N/A'} Attached`,
      });

      // 3. Send successful HTTP response
      return res.status(200).json({
        message: 'Invoice sent successfully!',
      });
    } catch (error) {
      logger.error(`Error in InvoiceController: ${error}`);
      // 4. Send error response
      return res.status(500).json({
        message: 'Failed to process request due to a server error.',
      });
    }
  },
};
