import { Server, Socket } from "socket.io";
import { query } from "../shared/database";
import { logger } from "../shared/logger";
import { notifyAdmin } from "./admin-socket.service";
import { SupportService } from "../modules/support/support.service";

export default function registerSupportSocket(io: Server, socket: Socket) {
    
    // Join a support ticket room
    socket.on("joinSupportTicket", async ({ ticketId, userId, userType }) => {
        const room = `support_ticket_${ticketId}`;
        socket.join(room);
        logger.info(`🎧 ${userType} ${userId} joined support room ${room}`);

        try {
            // Fetch message history for this ticket
            const { rows } = await query(
                `SELECT * FROM support_messages 
                 WHERE ticket_id = $1 
                 ORDER BY created_at ASC`,
                [ticketId]
            );

            socket.emit("supportChatHistory", rows);
        } catch (err) {
            logger.error(`Failed to load support chat history: ${err}`);
            socket.emit("supportChatHistory", []);
        }
    });

    // Send a message in support ticket
    socket.on("sendSupportMessage", async (data: { ticketId: string; senderId: string; senderType: 'driver' | 'admin'; message: string }) => {
        const room = `support_ticket_${data.ticketId}`;
        
        try {
            const { rows } = await query(
                `INSERT INTO support_messages (ticket_id, sender_id, sender_type, message)
                 VALUES ($1, $2, $3, $4)
                 RETURNING *`,
                [data.ticketId, data.senderId, data.senderType, data.message]
            );

            const newMessage = rows[0];

            // Broadcast to the room
            io.to(room).emit("receiveSupportMessage", newMessage);
            
            // If sender is driver, maybe notify all admins?
            if (data.senderType === 'driver') {
                // Also forward to Admin Backend via internal socket
                notifyAdmin('SUPPORT_MESSAGE_FROM_DRIVER', {
                    ...newMessage,
                    ticketId: data.ticketId
                });
            }

        } catch (err) {
            logger.error(`Failed to save support message: ${err}`);
        }
    });

    // Driver cuts the chat (ends support session)
    socket.on("endSupportChat", async ({ ticketId, driverId }) => {
        const room = `support_ticket_${ticketId}`;
        logger.info(`🔴 Driver ${driverId} ended support session for ticket ${ticketId}`);

        try {
            // Auto farewell system message
            const { rows } = await query(
                `INSERT INTO support_messages (ticket_id, sender_id, sender_type, message)
                 VALUES ($1, $2, $3, $4)
                 RETURNING *`,
                [ticketId, '00000000-0000-0000-0000-000000000000', 'system', 'Support session ended by Driver. Thank you for contacting VDrive Support!']
            );
            
            // Broadcast the auto farewell message so admin sees it instantly
            io.to(room).emit("receiveSupportMessage", rows[0]);

            // 1. Update ticket status to closed
            await SupportService.updateTicketStatus(ticketId, 'closed' as any, 'Driver ended the chat session');

            // 2. Notify the room (so Admin knows it's closed)
            io.to(room).emit("TICKET_STATUS_UPDATE", { ticketId, status: 'closed' });

            // 3. Notify Admin Backend to sync
            notifyAdmin('SUPPORT_TICKET_CLOSED', { ticketId, driverId });

        } catch (err) {
            logger.error(`Failed to end support chat: ${err}`);
        }
    });

    // Typing indicator for support
    socket.on("supportTyping", ({ ticketId, userId, userType, isTyping }) => {
        socket.to(`support_ticket_${ticketId}`).emit("supportTypingUpdate", {
            userId,
            userType,
            isTyping
        });
    });
}
