import { Server, Socket } from 'socket.io';
import { query } from '../shared/database';
import { logger } from '../shared/logger';
import { notifyAdmin } from '../shared/eventBus';
import { SupportService } from '../modules/support/support.service';

export default function registerSupportSocket(io: Server, socket: Socket) {
  // Join a support ticket room
  socket.on('joinSupportTicket', async ({ ticketId, userId, userType }) => {
    const room = `support_ticket_${ticketId}`;
    socket.join(room);
    logger.info(`🎧 ${userType} ${userId} joined support room ${room}`);

    try {
      // Fetch message history for this ticket
      let rows;
      if (userType === 'user' || userType === 'customer') {
        rows = await SupportService.getUserTicketMessages(ticketId);
      } else {
        rows = await SupportService.getTicketMessages(ticketId);
      }

      socket.emit('supportChatHistory', rows);
    } catch (err) {
      logger.error(`Failed to load support chat history: ${err}`);
      socket.emit('supportChatHistory', []);
    }
  });

  // Send a message in support ticket
  socket.on(
    'sendSupportMessage',
    async (data: {
      ticketId: string;
      senderId: string;
      senderType: 'driver' | 'admin' | 'user' | 'customer';
      message: string;
    }) => {
      const room = `support_ticket_${data.ticketId}`;

      try {
        let newMessage;
        if (data.senderType === 'user' || data.senderType === 'customer') {
          newMessage = await SupportService.saveUserMessage({
            ticket_id: data.ticketId,
            sender_id: data.senderId,
            sender_type: 'user', // Force to 'user' for DB enum consistency
            message: data.message,
          });
        } else {
          newMessage = await SupportService.saveMessage({
            ticket_id: data.ticketId,
            sender_id: data.senderId,
            sender_type: data.senderType,
            message: data.message,
          });
        }

        // Broadcast to the room
        io.to(room).emit('receiveSupportMessage', newMessage);

        // If sender is driver or user, notify admin via internal socket
        if (data.senderType === 'driver') {
          notifyAdmin('SUPPORT_MESSAGE_FROM_DRIVER', {
            ...newMessage,
            ticketId: data.ticketId,
          });
        } else if (data.senderType === 'user' || data.senderType === 'customer') {
          notifyAdmin('SUPPORT_MESSAGE_FROM_USER', {
            ...newMessage,
            ticketId: data.ticketId,
          });
        }
      } catch (err) {
        logger.error(`Failed to save support message: ${err}`);
      }
    }
  );

  // Driver or User cuts the chat (ends support session)
  socket.on('endSupportChat', async ({ ticketId, driverId, userId, userType }) => {
    const room = `support_ticket_${ticketId}`;
    const enderId = driverId || userId;
    logger.info(
      `🔴 ${userType || 'Driver'} ${enderId} ended support session for ticket ${ticketId}`
    );

    try {
      let newMessage;
      // Auto farewell system message and status updates
      if (userType === 'user' || userType === 'customer') {
        newMessage = await SupportService.saveUserMessage({
          ticket_id: ticketId,
          sender_id: '00000000-0000-0000-0000-000000000000',
          sender_type: 'system',
          message: 'Support session ended by User. Thank you for contacting VDrive Support!',
        });

        // 1. Update user ticket status to closed
        await SupportService.updateUserTicketStatus(
          ticketId,
          'closed' as any,
          'User ended the chat session'
        );

        // 2. Notify Admin Backend to sync
        notifyAdmin('USER_SUPPORT_TICKET_CLOSED', { ticketId, userId: enderId });
      } else {
        newMessage = await SupportService.saveMessage({
          ticket_id: ticketId,
          sender_id: '00000000-0000-0000-0000-000000000000',
          sender_type: 'system',
          message: 'Support session ended by Driver. Thank you for contacting VDrive Support!',
        });

        // 1. Update driver ticket status to closed
        await SupportService.updateTicketStatus(
          ticketId,
          'closed' as any,
          'Driver ended the chat session'
        );

        // 2. Notify Admin Backend to sync
        notifyAdmin('SUPPORT_TICKET_CLOSED', { ticketId, driverId: enderId });
      }

      // Broadcast the auto farewell message so admin sees it instantly
      io.to(room).emit('receiveSupportMessage', newMessage);

      // Notify the room (so Admin knows it's closed)
      io.to(room).emit('TICKET_STATUS_UPDATE', { ticketId, status: 'closed' });
    } catch (err) {
      logger.error(`Failed to end support chat: ${err}`);
    }
  });

  // Typing indicator for support
  socket.on('supportTyping', ({ ticketId, userId, userType, isTyping }) => {
    socket.to(`support_ticket_${ticketId}`).emit('supportTypingUpdate', {
      userId,
      userType,
      isTyping,
    });
  });
}
