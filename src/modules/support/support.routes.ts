import { Router } from 'express';
import { celebrate, Joi, Segments } from 'celebrate';
import { SupportController } from './support.controller';

const router = Router();

/* ======================== FAQs ======================== */

// Driver app — get active FAQs
router.get('/faqs', SupportController.getActiveFaqs);

// Admin — get all FAQs (including inactive)
router.get('/faqs/all', SupportController.getAllFaqs);

// Admin — create FAQ
router.post(
  '/faqs',
  celebrate({
    [Segments.BODY]: Joi.object().keys({
      question: Joi.string().required(),
      answer: Joi.string().required(),
      category: Joi.string().required(),
      sort_order: Joi.number().optional(),
    }),
  }),
  SupportController.createFaq
);

// Admin — update FAQ
router.put(
  '/faqs/:id',
  celebrate({
    [Segments.BODY]: Joi.object().keys({
      question: Joi.string().optional(),
      answer: Joi.string().optional(),
      category: Joi.string().optional(),
      is_active: Joi.boolean().optional(),
      sort_order: Joi.number().optional(),
    }),
  }),
  SupportController.updateFaq
);

// Admin — delete FAQ
router.delete('/faqs/:id', SupportController.deleteFaq);

/* ======================== TICKETS ======================== */

// Driver — create support ticket
router.post(
  '/tickets',
  celebrate({
    [Segments.BODY]: Joi.object().keys({
      driver_id: Joi.string().required(),
      subject: Joi.string().required(),
      description: Joi.string().required(),
      priority: Joi.string().valid('low', 'medium', 'high').optional(),
      category: Joi.string().valid('payment', 'documents', 'app_crash', 'account', 'subscription', 'rides', 'general').optional(),
    }),
  }),
  SupportController.createTicket
);

// Driver — get my tickets
router.get('/tickets/driver/:driverId', SupportController.getDriverTickets);

// Admin — get all tickets
router.get('/tickets', SupportController.getAllTickets);

// Get single ticket
router.get('/tickets/:id', SupportController.getTicketById);

// Admin — update ticket status
router.patch(
  '/tickets/:id/status',
  celebrate({
    [Segments.BODY]: Joi.object().keys({
      status: Joi.string().valid('open', 'in_progress', 'resolved', 'closed').required(),
      admin_notes: Joi.string().optional().allow(''),
    }),
  }),
  SupportController.updateTicketStatus
);

// Get ticket messages
router.get('/tickets/:id/messages', SupportController.getTicketMessages);

export default router;
