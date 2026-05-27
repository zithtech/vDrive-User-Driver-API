import { logger } from "../shared/logger";
import { io as ioClient, Socket as ClientSocket } from 'socket.io-client';
import { Server } from 'socket.io';
import config from '../config';

let adminSocket: ClientSocket;

export function connectToAdminBackend(userIo: Server) {
    const adminUrl = config.adminApiUrl;

    logger.info(`Connecting to Admin Backend WebSocket at ${adminUrl}/internal`);

    // socket.io-client handles http:// → ws:// upgrade automatically.
    // The /internal segment is the Socket.IO namespace, not an HTTP path.
    adminSocket = ioClient(config.adminInternalSocketUrl, { // ✅ Admin backend should be on a DIFFERENT port
        transports: ['websocket'],
        auth: { token: process.env.INTERNAL_SERVICE_SECRET },
        reconnection: true,
        reconnectionAttempts: Infinity,
        reconnectionDelay: 2000,
    });

    adminSocket.on('connect', () => {
        logger.info('✅ Connected to Admin Backend');
    });

    // ✅ Listen for account status updates from admin
    adminSocket.on('ACCOUNT_STATUS_UPDATE', (data) => {
        logger.info('Received ACCOUNT_STATUS_UPDATE from admin:', data);
        const { driverId, status, kyc_status, reason } = data;
        if (driverId) {
            userIo.to(`driver_${driverId}`).emit('ACCOUNT_STATUS_UPDATE', {
                status,
                kyc_status,
                reason,
                timestamp: new Date().toISOString()
            });
        }
    });

    // ✅ Listen for document status updates from admin
    adminSocket.on('DOCUMENT_STATUS_UPDATE', async (data) => {
        logger.info('Received DOCUMENT_STATUS_UPDATE from admin:', data);
        const { driverId, documentId, status, reason } = data;
        if (driverId) {
            userIo.to(`driver_${driverId}`).emit('DOCUMENT_STATUS_UPDATE', {
                documentId,
                status,
                reason,
                timestamp: new Date().toISOString()
            });

            // Trigger Push Notification logic
            try {
                const { DriverDocumentsService } = require('../modules/drivers/driver-documents.service');
                await DriverDocumentsService.syncKYCStatus(driverId);
            } catch (err: any) {
                logger.error(`Failed to trigger push notification for document update: ${err.message}`);
            }
        }
    });

    // ✅ Listen for commands FROM admin backend and forward to users
    adminSocket.on('broadcast_to_users', (data) => {
        logger.info('Admin sent broadcast:', data);
        userIo.emit('announcement', data);
    });

    // ✅ Listen for Support Messages from Admin
    adminSocket.on('SUPPORT_MESSAGE_FROM_ADMIN', (data) => {
        logger.info('Received support message from admin for ticket:', data.ticketId);
        const room = `support_ticket_${data.ticketId}`;
        userIo.to(room).emit('receiveSupportMessage', {
            ...data,
            id: Date.now().toString(),
            created_at: new Date().toISOString()
        });
    });

    // ✅ Listen for Ticket Resolution (Switch back to AI)
    adminSocket.on('TICKET_RESOLVED', (data) => {
        logger.info('Ticket resolved, switching driver back to AI:', data.ticketId);
        const room = `support_ticket_${data.ticketId}`;
        userIo.to(room).emit('SWITCH_TO_AI', { ticketId: data.ticketId });
    });

    adminSocket.on('disconnect', (reason) => {
        logger.warn(`Lost connection to Admin Backend: ${reason}`);
    });

    adminSocket.on('connect_error', (err: any) => {
        logger.error(
            `Admin Backend connection error` +
            ` | URL: ${adminUrl}/internal` +
            ` | Message: ${err.message}` +
            ` | Type: ${err.type ?? 'unknown'}` +
            ` | Description: ${JSON.stringify(err.description ?? {})}`
        );
    });
}

// ✅ Export a helper to notify admin from anywhere in the app
export const notifyAdmin = (event: string, data: unknown) => {
    if (adminSocket?.connected) {
        adminSocket.emit(event, data);
    } else {
        logger.warn(`⚠️ Cannot notify admin — socket not connected. Event: ${event}`);
    }
};