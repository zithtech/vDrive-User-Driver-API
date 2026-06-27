import { Server } from 'socket.io';
import { logger } from './logger';
import { getPubClient, getSubClient } from './redis';

/**
 * Backend ↔ backend event bus over Redis pub/sub.
 *
 * Replaces the old `socket.io-client` bridge to admin-BE's `/internal` namespace.
 *  - `user_be:to_admin`  : user-BE  publishes  → admin-BE subscribes (this file)
 *  - `admin_be:to_user`  : admin-BE publishes  → user-BE  subscribes (this file)
 *
 * Messages are enveloped as { event, data, ts }. Plain pub/sub is fire-and-forget
 * (at-most-once) — at parity with the socket bridge it replaces.
 */
export const CHANNEL_TO_ADMIN = 'user_be:to_admin';
export const CHANNEL_TO_USER = 'admin_be:to_user';

interface BusMessage {
  event: string;
  data: any;
  ts: number;
}

/**
 * Publish an event to the admin backend. Drop-in replacement for the old
 * socket-based notifyAdmin(event, data) — same signature, same call sites.
 */
export const notifyAdmin = (event: string, data: unknown): void => {
  try {
    const payload: BusMessage = { event, data, ts: Date.now() };
    // PUBLISH on the dedicated pub client (publishing does not switch a
    // connection into subscriber mode — only SUBSCRIBE does).
    getPubClient().publish(CHANNEL_TO_ADMIN, JSON.stringify(payload));
  } catch (err) {
    logger.error(`[bus] Failed to publish '${event}' to admin backend:`, err);
  }
};

/**
 * Subscribe to events coming FROM the admin backend and forward them to the
 * relevant driver/user/support rooms. Reproduces the handlers that used to live
 * in connectToAdminBackend() (sockets/admin-socket.service.ts).
 */
export const initAdminEventSubscriber = (io: Server): void => {
  let sub;
  try {
    sub = getSubClient();
  } catch (err) {
    logger.error('[bus] Cannot init admin event subscriber — Redis subClient unavailable:', err);
    return;
  }

  sub.subscribe(CHANNEL_TO_USER, (err) => {
    if (err) {
      logger.error(`[bus] Failed to subscribe to ${CHANNEL_TO_USER}:`, err.message);
      return;
    }
    logger.info(`✅ [bus] Subscribed to ${CHANNEL_TO_USER} (events from admin backend)`);
  });

  sub.on('message', (channel, raw) => {
    if (channel !== CHANNEL_TO_USER) return;

    let msg: BusMessage;
    try {
      msg = JSON.parse(raw);
    } catch {
      logger.error(`[bus] Dropping malformed message on ${channel}: ${raw}`);
      return;
    }

    // Fire and forget; handler errors are logged, never thrown out of the listener.
    void dispatchToUser(io, msg.event, msg.data).catch((err) =>
      logger.error(`[bus] Error dispatching '${msg.event}' from admin backend:`, err)
    );
  });
};

const dispatchToUser = async (io: Server, event: string, data: any): Promise<void> => {
  switch (event) {
    case 'ACCOUNT_STATUS_UPDATE': {
      const { driverId, status, kyc_status, reason } = data || {};
      if (driverId) {
        io.to(`driver_${driverId}`).emit('ACCOUNT_STATUS_UPDATE', {
          status,
          kyc_status,
          reason,
          timestamp: new Date().toISOString(),
        });
      }
      break;
    }

    case 'DOCUMENT_STATUS_UPDATE': {
      const { driverId, documentId, status, reason } = data || {};
      if (driverId) {
        io.to(`driver_${driverId}`).emit('DOCUMENT_STATUS_UPDATE', {
          documentId,
          status,
          reason,
          timestamp: new Date().toISOString(),
        });

        // Trigger Push Notification / KYC sync
        try {
          const { DriverDocumentsService } = require('../modules/drivers/driver-documents.service');
          await DriverDocumentsService.syncKYCStatus(driverId);
        } catch (err: any) {
          logger.error(`Failed to sync KYC status for document update: ${err.message}`);
        }
      }
      break;
    }

    case 'broadcast_to_users':
      io.emit('announcement', data);
      break;

    case 'SUPPORT_MESSAGE_FROM_ADMIN':
      await handleSupportMessageFromAdmin(io, data);
      break;

    case 'TICKET_RESOLVED': {
      const ticketId = data?.ticketId;
      logger.info(`Ticket resolved, switching driver back to AI: ${ticketId}`);
      io.to(`support_ticket_${ticketId}`).emit('SWITCH_TO_AI', { ticketId });
      break;
    }

    default:
      logger.warn(`[bus] Unhandled event from admin backend: '${event}'`);
  }
};

// Preserves the exact behaviour of the previous adminSocket SUPPORT_MESSAGE_FROM_ADMIN handler.
const handleSupportMessageFromAdmin = async (io: Server, data: any): Promise<void> => {
  const room = `support_ticket_${data?.ticketId}`;
  try {
    const { SupportService } = require('../modules/support/support.service');

    // Driver ticket first, then user ticket
    let ticket = await SupportService.getTicketById(data.ticketId);
    let newMessage;

    if (ticket) {
      newMessage = await SupportService.saveMessage({
        ticket_id: data.ticketId,
        sender_id: data.senderId,
        sender_type: 'admin',
        message: data.message,
      });
    } else {
      ticket = await SupportService.getUserTicketById(data.ticketId);
      if (ticket) {
        newMessage = await SupportService.saveUserMessage({
          ticket_id: data.ticketId,
          sender_id: data.senderId,
          sender_type: 'admin',
          message: data.message,
        });
      }
    }

    if (newMessage) {
      io.to(room).emit('receiveSupportMessage', newMessage);
    } else {
      logger.error(`Ticket not found for ID: ${data.ticketId}`);
      // Fallback emit if ticket not found
      io.to(room).emit('receiveSupportMessage', {
        ...data,
        sender_type: 'admin',
        sender_id: data.senderId,
        ticket_id: data.ticketId,
        id: Date.now().toString(),
        created_at: new Date().toISOString(),
      });
    }
  } catch (err) {
    logger.error(`Failed to handle admin support message: ${err}`);
  }
};
