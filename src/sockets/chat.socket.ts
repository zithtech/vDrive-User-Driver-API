import { Server, Socket } from "socket.io";
import { query } from "../shared/database";
import { logger } from "../shared/logger";

interface ChatMessage {
    messageId: string;
    rideId: string;
    senderId: string;
    text?: string;     // ← optional
    image?: string;    // ← optional
    location?: {       // ← optional
        latitude: number,
        longitude: number
    };
    timestamp: number;
}

export default function registerChatSocket(io: Server, socket: Socket) {
    // User/Driver joins chat room
    socket.on("joinChat", async ({ rideId, userId }) => {
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
                location: row.latitude
                    ? { latitude: row.latitude, longitude: row.longitude }
                    : undefined,
                timestamp: new Date(row.created_at).getTime(),
                status: row.status,
            }));

            // Emit only to this socket (not the whole room)
            socket.emit("chatHistory", history);
        } catch (err) {
            logger.error(`Failed to load chat history: ${err}`);
            socket.emit("chatHistory", []); // send empty so client doesn't hang
        }
    });

    // Send chat message
    socket.on("sendChatMessage", async (msg: ChatMessage) => {
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
        socket.to(room).emit("receiveChatMessage", msg);

        // Acknowledge “delivered” to sender
        socket.emit("messageDelivered", {
            messageId: msg.messageId,
            rideId: msg.rideId
        });

        // Mark messages as delivered to other side
        io.to(room).emit("messageDeliveredToUser", {
            messageId: msg.messageId,
            rideId: msg.rideId
        });
    });

    // Message seen status
    socket.on("messageSeen", async ({ rideId, messageId, seenBy }) => {
        try {
            await query(
                `UPDATE chat_messages SET status = 'seen' WHERE message_id = $1`,
                [messageId]
            );
        } catch (err) {
            logger.error(`Failed to update seen status: ${err}`);
        }
        io.to(`chat_${rideId}`).emit("messageSeenUpdate", {
            messageId,
            seenBy,
            seenAt: Date.now()
        });
    });

    // Typing indicator
    socket.on("typing", ({ rideId, userId, isTyping }) => {
        socket.to(`chat_${rideId}`).emit("typingUpdate", {
            userId,
            isTyping
        });
    });
}