import { Router } from 'express';
import { InvoiceController } from './email.controller';

const router = Router();

// POST /api/invoices/send -> Calls InvoiceController.sendInvoice
router.post('/send', InvoiceController.sendInvoice);

export default router;
