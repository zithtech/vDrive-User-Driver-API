import { Server, Socket } from 'socket.io';
import { query } from '../shared/database';
import { logger } from '../shared/logger';
import { DriverRepository } from '../modules/drivers/driver.repository';
import { UserRepository } from '../modules/users/user.repository';
import { DriverNotifications } from '../modules/notifications/driver.notification';
import { UserNotifications } from '../modules/notifications/user.notification';

interface ChatMessage {
  messageId: string;
  rideId: string;
  senderId: string;
  text?: string; // ← optional
  image?: string; // ← optional
  location?: {
    // ← optional
    latitude: number;
    longitude: number;
  };
  timestamp: number;
}

const userPresence = new Map();

export default function registerChatSocket(io: Server, socket: Socket) {
  // Handle chat presence
  socket.on('chatPresence', (data) => {
    userPresence.set(data.userId, { ...data, socketId: socket.id });
  });

  socket.on('disconnect', () => {
    for (const [userId, data] of userPresence.entries()) {
      if (data.socketId === socket.id) userPresence.delete(userId);
    }
  });

  // User/Driver joins chat room
  socket.on('joinChat', async ({ rideId, userId }) => {
    const room = `chat_${rideId}`;
    socket.join(room);
    logger.info(`💬 ${userId} joined chat ${room}`);
    try {
      const { rows } = await query(
        `SELECT * FROM chat_messages
         WHERE ride_id = $1
         ORDER BY created_at ASC`,
        [rideId]
      );

      // Map DB rows → ChatMessage shape the client expects
      const history = rows.map((row) => ({
        messageId: row.message_id,
        rideId: row.ride_id,
        senderId: row.sender_id,
        text: row.text ?? undefined,
        image: row.image ?? undefined,
        location: row.latitude ? { latitude: row.latitude, longitude: row.longitude } : undefined,
        timestamp: new Date(row.created_at).getTime(),
        status: row.status,
      }));

      // Emit only to this socket (not the whole room)
      socket.emit('chatHistory', history);
    } catch (err) {
      logger.error(`Failed to load chat history: ${err}`);
      socket.emit('chatHistory', []); // send empty so client doesn't hang
    }
  });

  // Send chat message
  socket.on('sendChatMessage', async (msg: ChatMessage) => {
    const room = `chat_${msg.rideId}`;

    try {
      await query(
        `INSERT INTO chat_messages
           (message_id, ride_id, sender_id, text, image, latitude, longitude, status, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'sent', to_timestamp($8 / 1000.0))
         ON CONFLICT (message_id) DO NOTHING`,
        [
          msg.messageId,
          msg.rideId,
          msg.senderId,
          msg.text ?? null,
          msg.image ?? null,
          msg.location?.latitude ?? null,
          msg.location?.longitude ?? null,
          msg.timestamp,
        ]
      );
    } catch (err) {
      logger.error(`Failed to save chat message: ${err}`);
    }

    // Emit message to all except sender first
    socket.to(room).emit('receiveChatMessage', msg);

    // Send push notification to the recipient
    try {
      const { rows } = await query(`SELECT user_id, driver_id FROM trips WHERE trip_id = $1`, [msg.rideId]);
      if (rows.length > 0) {
        const trip = rows[0];
        // const senderDetails = await query(`SELECT first_name, last_name FROM users WHERE user_id = $1`, [msg.senderId]);
        // const senderName = 'New Message'; // Optional: could fetch real name from DB if needed

        // If sender is user, notify driver
        if (msg.senderId === trip.user_id && trip.driver_id) {
          const {rows: senderDetails} = await query(`SELECT first_name, last_name FROM users WHERE id = $1`, [msg.senderId]);
          const senderName = senderDetails[0].first_name + ' ' + senderDetails[0].last_name;
           logger.info(`Sender Name: ${senderName}`);
          logger.info(`Sender Details: ${senderDetails[0]}`);
          logger.info(`Sender Details: ${JSON.stringify(senderDetails[0])}`);
          const recipientPresence = userPresence.get(trip.driver_id);
          const isRecipientInChat = recipientPresence?.currentScreen === 'TripChatScreen' && recipientPresence?.appState === 'active';
          if (!isRecipientInChat) {
            const fcmToken = await DriverRepository.getFcmTokenById(trip.driver_id);
            if (fcmToken) {
              await DriverNotifications.chatMessage(fcmToken, msg.text || '📸 Image', msg.rideId, senderName);
            }
          }
        } 
        // If sender is driver, notify user
        else if (msg.senderId === trip.driver_id && trip.user_id) {
          const {rows: senderDetails} = await query(`SELECT first_name, last_name FROM drivers WHERE id = $1`, [msg.senderId]);
          const senderName = senderDetails[0].first_name + ' ' + senderDetails[0].last_name;
          logger.info(`Sender Name: ${senderName}`);
          logger.info(`Sender Details: ${senderDetails[0]}`);
          logger.info(`Sender Details: ${JSON.stringify(senderDetails[0])}`);
          const recipientPresence = userPresence.get(trip.user_id);
          const isRecipientInChat = recipientPresence?.currentScreen === 'TripChatScreen' && recipientPresence?.appState === 'active';
          if (!isRecipientInChat) {
            const fcmToken = await UserRepository.getFcmTokenById(trip.user_id);
            if (fcmToken) {
              await UserNotifications.chatMessage(fcmToken, msg.text || '📸 Image', msg.rideId, senderName);
            }
          }
        }
      }
    } catch (err) {
      logger.error(`Failed to send chat push notification: ${err}`);
    }

    // Acknowledge “delivered” to sender
    socket.emit('messageDelivered', {
      messageId: msg.messageId,
      rideId: msg.rideId,
    });

    // Mark messages as delivered to other side
    io.to(room).emit('messageDeliveredToUser', {
      messageId: msg.messageId,
      rideId: msg.rideId,
    });
  });

  // Message seen status
  socket.on('messageSeen', async ({ rideId, messageId, seenBy }) => {
    try {
      await query(`UPDATE chat_messages SET status = 'seen' WHERE message_id = $1`, [messageId]);
    } catch (err) {
      logger.error(`Failed to update seen status: ${err}`);
    }
    io.to(`chat_${rideId}`).emit('messageSeenUpdate', {
      messageId,
      seenBy,
      seenAt: Date.now(),
    });
  });

  // Typing indicator
  socket.on('typing', ({ rideId, userId, isTyping }) => {
    socket.to(`chat_${rideId}`).emit('typingUpdate', {
      userId,
      isTyping,
    });
  });
}
