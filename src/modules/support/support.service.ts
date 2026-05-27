import { SupportRepository } from './support.repository';
import { logger } from '../../shared/logger';
import { notificationService } from '../../services/notificationService';
import { DriverRepository } from '../drivers/driver.repository';
import { notifyAdmin } from '../../sockets/admin-socket.service';

export const SupportService = {

  /* ======================== FAQs ======================== */

  async getActiveFaqs() {
    return SupportRepository.findAllActiveFaqs();
  },

  async getAllFaqs() {
    return SupportRepository.findAllFaqs();
  },

  async createFaq(data: { question: string; answer: string; category: string; sort_order?: number }) {
    logger.info(`[Support] Creating FAQ: ${data.question}`);
    return SupportRepository.insertFaq(data);
  },

  async updateFaq(id: string, data: any) {
    logger.info(`[Support] Updating FAQ: ${id}`);
    return SupportRepository.updateFaq(id, data);
  },

  async deleteFaq(id: string) {
    logger.info(`[Support] Deleting FAQ: ${id}`);
    return SupportRepository.deleteFaq(id);
  },

  /* ======================== TICKETS ======================== */

  async createTicket(data: { driver_id: string; subject: string; description: string; priority?: string; category?: string }) {
    logger.info(`[Support] Creating ticket for driver: ${data.driver_id}, subject: ${data.subject}, category: ${data.category || 'general'}`);
    const ticket = await SupportRepository.createTicket(data);
    
    // Automatically add an initial system message
    await SupportRepository.saveMessage({
      ticket_id: ticket.id,
      sender_id: '00000000-0000-0000-0000-000000000000', // System UUID
      sender_type: 'system',
      message: 'Thank you for contacting VDrive Support. We are connecting you to an agent. Please describe your issue in detail.'
    });

    // Notify Admin backend about the new ticket instantly
    notifyAdmin('AGENT_REQUESTED', {
      ...ticket,
      timestamp: new Date().toISOString()
    });

    return ticket;
  },

  async getDriverTickets(driverId: string) {
    return SupportRepository.findTicketsByDriverId(driverId);
  },

  async getAllTickets(limit: number, offset: number, status?: string) {
    return SupportRepository.findAllTickets(limit, offset, status);
  },

  async getTicketById(id: string) {
    return SupportRepository.findTicketById(id);
  },

  async updateTicketStatus(id: string, status: any, adminNotes?: string) {
    logger.info(`[Support] Updating ticket ${id} status to: ${status}`);
    return SupportRepository.updateTicketStatus(id, status, adminNotes);
  },

  async getTicketMessages(ticketId: string) {
    return SupportRepository.findMessagesByTicketId(ticketId);
  },

  async saveMessage(data: { ticket_id: string; sender_id: string; sender_type: string; message: string }) {
    const newMessage = await SupportRepository.saveMessage(data);

    // If admin replies, notify the driver
    if (data.sender_type === 'admin') {
      try {
        const ticket = await SupportRepository.findTicketById(data.ticket_id);
        if (ticket && ticket.driver_id) {
          const fcmToken = await DriverRepository.getFcmTokenById(ticket.driver_id);
          if (fcmToken) {
            await notificationService.sendPushNotification(fcmToken, {
              title: 'Support Update',
              body: `An agent replied to your ticket: "${data.message.substring(0, 50)}..."`,
              data: {
                type: 'SUPPORT_REPLY',
                ticketId: data.ticket_id
              }
            });
          }
        }
      } catch (err) {
        logger.error(`Failed to send support notification: ${err}`);
      }
    }

    return newMessage;
  },
};
