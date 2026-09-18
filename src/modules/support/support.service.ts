import { SupportRepository } from './support.repository';
import { logger } from '../../shared/logger';
import { notificationService } from '../../services/notificationService';
import { DriverRepository } from '../drivers/driver.repository';
import { UserRepository } from '../users/user.repository';
import { notifyAdmin } from '../../shared/eventBus';
import { getIO } from '../../sockets/socket';

const notificationThrottleMap = new Map<string, number>();

export const SupportService = {
  /* ======================== FAQs ======================== */

  async getActiveFaqs() {
    return SupportRepository.findAllActiveFaqs();
  },

  async getAllFaqs() {
    return SupportRepository.findAllFaqs();
  },

  async createFaq(data: {
    question: string;
    answer: string;
    category: string;
    sort_order?: number;
  }) {
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

  async createTicket(data: {
    driver_id: string;
    subject: string;
    description: string;
    priority?: string;
    category?: string;
  }) {
    logger.info(
      `[Support] Creating ticket for driver: ${data.driver_id}, subject: ${data.subject}, category: ${data.category || 'general'}`
    );
    const ticket = await SupportRepository.createTicket(data);

    // Automatically add an initial system message
    await SupportRepository.saveMessage({
      ticket_id: ticket.id,
      sender_id: '00000000-0000-0000-0000-000000000000', // System UUID
      sender_type: 'system',
      message:
        'Thank you for contacting T2Drive Support. We are connecting you to an agent. Please describe your issue in detail.',
    });

    // Notify Admin backend about the new ticket instantly
    notifyAdmin('AGENT_REQUESTED', {
      ...ticket,
      timestamp: new Date().toISOString(),
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
    const ticket = await SupportRepository.updateTicketStatus(id, status, adminNotes);
    
    try {
      if (ticket && ticket.driver_id) {
        const fcmToken = await DriverRepository.getFcmTokenById(ticket.driver_id);
        if (fcmToken) {
          await notificationService.sendPushNotification(fcmToken, {
            title: 'Support Ticket Updated',
            body: `Your support ticket has been updated to: ${status}.`,
            data: {
              type: 'SUPPORT_TICKET_UPDATE',
              ticketId: ticket.id,
            },
          });
        }
      }
    } catch (err) {
      logger.error(`Failed to send support ticket status update notification to driver: ${err}`);
    }
    
    return ticket;
  },

  async getTicketMessages(ticketId: string) {
    return SupportRepository.findMessagesByTicketId(ticketId);
  },

  async saveMessage(data: {
    ticket_id: string;
    sender_id: string;
    sender_type: string;
    message: string;
  }) {
    const newMessage = await SupportRepository.saveMessage(data);

    // If admin, bot, or system replies, notify the driver
    if (data.sender_type === 'admin' || data.sender_type === 'bot' || data.sender_type === 'system') {
      try {
        const roomName = `support_ticket_${data.ticket_id}`;
        const io = getIO();
        const room = io?.sockets?.adapter?.rooms?.get(roomName);
        
        // If the room has <= 1 connected socket, the driver is likely not actively viewing it
        // Or if the driver is not in the room at all
        const isLikelyInactive = !room || room.size <= 1;

        if (isLikelyInactive) {
          const now = Date.now();
          const lastSent = notificationThrottleMap.get(`driver_${data.ticket_id}`) || 0;
          
          // Throttle: 60 seconds
          if (now - lastSent > 60000) {
            notificationThrottleMap.set(`driver_${data.ticket_id}`, now);
            
            const ticket = await SupportRepository.findTicketById(data.ticket_id);
            if (ticket && ticket.driver_id) {
              const fcmToken = await DriverRepository.getFcmTokenById(ticket.driver_id);
              if (fcmToken) {
                await notificationService.sendPushNotification(fcmToken, {
                  title: 'Support Update',
                  body: `New message on your ticket: "${data.message.substring(0, 50)}..."`,
                  data: {
                    type: 'SUPPORT_TICKET_UPDATE',
                    ticketId: data.ticket_id,
                  },
                });
              }
            }
          }
        }
      } catch (err) {
        logger.error(`Failed to send support notification: ${err}`);
      }
    }

    return newMessage;
  },

  /* ======================== USER TICKETS ======================== */

  async createUserTicket(data: {
    user_id: string;
    subject: string;
    description: string;
    priority?: string;
    category?: string;
  }) {
    logger.info(
      `[Support] Creating ticket for user: ${data.user_id}, subject: ${data.subject}, category: ${data.category || 'general'}`
    );
    const ticket = await SupportRepository.createUserTicket(data);

    // Automatically add an initial system message
    await SupportRepository.saveUserMessage({
      ticket_id: ticket.id,
      sender_id: '00000000-0000-0000-0000-000000000000', // System UUID
      sender_type: 'system',
      message:
        'Thank you for contacting T2Drive Support. We are connecting you to an agent. Please describe your issue in detail.',
    });

    // Notify Admin backend about the new ticket instantly
    notifyAdmin('USER_AGENT_REQUESTED', {
      ...ticket,
      timestamp: new Date().toISOString(),
    });

    return ticket;
  },

  async getUserTickets(userId: string) {
    return SupportRepository.findTicketsByUserId(userId);
  },

  async getAllUserTickets(limit: number, offset: number, status?: string) {
    return SupportRepository.findAllUserTickets(limit, offset, status);
  },

  async getUserTicketById(id: string) {
    return SupportRepository.findUserTicketById(id);
  },

  async updateUserTicketStatus(id: string, status: any, adminNotes?: string) {
    logger.info(`[Support] Updating user ticket ${id} status to: ${status}`);
    const ticket = await SupportRepository.updateUserTicketStatus(id, status, adminNotes);

    try {
      if (ticket && ticket.user_id) {
        const fcmToken = await UserRepository.getFcmTokenById(ticket.user_id);
        if (fcmToken) {
          await notificationService.sendPushNotification(fcmToken, {
            title: 'Support Ticket Updated',
            body: `Your support ticket has been updated to: ${status}.`,
            data: {
              type: 'SUPPORT_TICKET_UPDATE',
              ticketId: ticket.id,
            },
          });
        }
      }
    } catch (err) {
      logger.error(`Failed to send support ticket status update notification to user: ${err}`);
    }

    return ticket;
  },

  async getUserTicketMessages(ticketId: string) {
    return SupportRepository.findMessagesByUserTicketId(ticketId);
  },

  async saveUserMessage(data: {
    ticket_id: string;
    sender_id: string;
    sender_type: string;
    message: string;
  }) {
    const newMessage = await SupportRepository.saveUserMessage(data);

    // If admin, bot, or system replies, notify the user
    if (data.sender_type === 'admin' || data.sender_type === 'bot' || data.sender_type === 'system') {
      try {
        const roomName = `support_ticket_${data.ticket_id}`;
        const io = getIO();
        const room = io?.sockets?.adapter?.rooms?.get(roomName);
        
        const isLikelyInactive = !room || room.size <= 1;

        if (isLikelyInactive) {
          const now = Date.now();
          const lastSent = notificationThrottleMap.get(`user_${data.ticket_id}`) || 0;
          
          // Throttle: 60 seconds
          if (now - lastSent > 60000) {
            notificationThrottleMap.set(`user_${data.ticket_id}`, now);
            
            const ticket = await SupportRepository.findUserTicketById(data.ticket_id);
            if (ticket && ticket.user_id) {
              const fcmToken = await UserRepository.getFcmTokenById(ticket.user_id);
              if (fcmToken) {
                await notificationService.sendPushNotification(fcmToken, {
                  title: 'Support Update',
                  body: `New message on your ticket: "${data.message.substring(0, 50)}..."`,
                  data: {
                    type: 'SUPPORT_TICKET_UPDATE',
                    ticketId: data.ticket_id,
                  },
                });
              }
            }
          }
        }
      } catch (err) {
        logger.error(`Failed to send support notification to user: ${err}`);
      }
    }

    return newMessage;
  },
};
