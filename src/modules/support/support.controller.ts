import { Request, Response, NextFunction } from 'express';
import { SupportService } from './support.service';
import { successResponse } from '../../shared/errorHandler';
import { logger } from '../../shared/logger';

export class SupportController {

  /* ======================== FAQs ======================== */

  /** GET /support/faqs — Driver app fetches active FAQs */
  static async getActiveFaqs(req: Request, res: Response, next: NextFunction) {
    try {
      const faqs = await SupportService.getActiveFaqs();
      return successResponse(res, 200, 'FAQs fetched successfully', faqs);
    } catch (error) {
      next(error);
    }
  }

  /** GET /support/faqs/all — Admin fetches all FAQs (including inactive) */
  static async getAllFaqs(req: Request, res: Response, next: NextFunction) {
    try {
      const faqs = await SupportService.getAllFaqs();
      return successResponse(res, 200, 'All FAQs fetched successfully', faqs);
    } catch (error) {
      next(error);
    }
  }

  /** POST /support/faqs — Admin creates a new FAQ */
  static async createFaq(req: Request, res: Response, next: NextFunction) {
    try {
      const { question, answer, category, sort_order } = req.body;
      const faq = await SupportService.createFaq({ question, answer, category, sort_order });
      return successResponse(res, 201, 'FAQ created successfully', faq);
    } catch (error) {
      next(error);
    }
  }

  /** PUT /support/faqs/:id — Admin updates a FAQ */
  static async updateFaq(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const faq = await SupportService.updateFaq(id as string, req.body);
      if (!faq) {
        return res.status(404).json({ success: false, message: 'FAQ not found' });
      }
      return successResponse(res, 200, 'FAQ updated successfully', faq);
    } catch (error) {
      next(error);
    }
  }

  /** DELETE /support/faqs/:id — Admin deletes a FAQ */
  static async deleteFaq(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const deleted = await SupportService.deleteFaq(id as string);
      if (!deleted) {
        return res.status(404).json({ success: false, message: 'FAQ not found' });
      }
      return successResponse(res, 200, 'FAQ deleted successfully', { deleted: true });
    } catch (error) {
      next(error);
    }
  }

  /* ======================== TICKETS ======================== */

  /** POST /support/tickets — Driver creates a support ticket */
  static async createTicket(req: Request, res: Response, next: NextFunction) {
    try {
      const { driver_id, subject, description, priority, category } = req.body;
      const ticket = await SupportService.createTicket({ driver_id, subject, description, priority, category });
      return successResponse(res, 201, 'Support ticket created successfully', ticket);
    } catch (error) {
      next(error);
    }
  }

  /** GET /support/tickets/driver/:driverId — Driver fetches their tickets */
  static async getDriverTickets(req: Request, res: Response, next: NextFunction) {
    try {
      const { driverId } = req.params;
      const tickets = await SupportService.getDriverTickets(driverId as string);
      return successResponse(res, 200, 'Tickets fetched successfully', tickets);
    } catch (error) {
      next(error);
    }
  }

  /** GET /support/tickets — Admin fetches all tickets (with pagination) */
  static async getAllTickets(req: Request, res: Response, next: NextFunction) {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 50;
      const offset = (page - 1) * limit;
      const status = req.query.status as string | undefined;

      const result = await SupportService.getAllTickets(limit, offset, status);
      return res.status(200).json({
        success: true,
        data: {
          tickets: result.tickets,
          pagination: { page, limit, total: result.total },
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /** GET /support/tickets/:id — Get single ticket */
  static async getTicketById(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const ticket = await SupportService.getTicketById(id as string);
      if (!ticket) {
        return res.status(404).json({ success: false, message: 'Ticket not found' });
      }
      return successResponse(res, 200, 'Ticket fetched successfully', ticket);
    } catch (error) {
      next(error);
    }
  }

  /** PATCH /support/tickets/:id/status — Admin updates ticket status */
  static async updateTicketStatus(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const { status, admin_notes } = req.body;
      const ticket = await SupportService.updateTicketStatus(id as string, status, admin_notes);
      if (!ticket) {
        return res.status(404).json({ success: false, message: 'Ticket not found' });
      }
      return successResponse(res, 200, 'Ticket status updated', ticket);
    } catch (error) {
      next(error);
    }
  }

  /** GET /support/tickets/:id/messages — Get all messages for a ticket */
  static async getTicketMessages(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const messages = await SupportService.getTicketMessages(id as string);
      return successResponse(res, 200, 'Messages fetched successfully', messages);
    } catch (error) {
      next(error);
    }
  }
}
