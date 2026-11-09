import { Server, Socket } from 'socket.io';
import { logger } from '../shared/logger';
import { notifyAdmin } from '../shared/eventBus';
import { KycService } from '../modules/kyc/kyc.service';

export default function registerKycSocket(io: Server, socket: any) {
  // Explicitly join KYC session rooms
  socket.on('JOIN_KYC_SESSION', (data: { sessionId?: string; driverId?: string }) => {
    const driverId = data?.driverId || socket.driverId;
    const sessionId = data?.sessionId;
    if (driverId) {
      const cleanDriverId = String(driverId);
      socket.driverId = cleanDriverId;
      socket.join(`driver_${cleanDriverId}`);
      socket.join(`kyc_${cleanDriverId}`);
      logger.info(`📹 [KYC Socket] Socket ${socket.id} joined rooms: driver_${cleanDriverId} & kyc_${cleanDriverId}`);
    }
    if (sessionId) {
      socket.join(`kyc_session_${sessionId}`);
      logger.info(`📹 [KYC Socket] Socket ${socket.id} joined room: kyc_session_${sessionId}`);
    }
  });

  // Driver requests video KYC verification via socket
  socket.on('KYC_REQUEST_VIDEO', async (data: { driverId: string; location?: { latitude: number; longitude: number } }) => {
    try {
      const driverId = data?.driverId || socket.driverId;
      if (!driverId) {
        socket.emit('KYC_ERROR', { message: 'Driver ID required for Video KYC' });
        return;
      }

      logger.info(`📹 [KYC Socket] Driver ${driverId} requested Video KYC`);
      const result = await KycService.requestKyc(driverId, data?.location);
      socket.emit('KYC_REQUEST_SUCCESS', result);
    } catch (err: any) {
      logger.error(`[KYC Socket] Error in KYC_REQUEST_VIDEO: ${err.message}`);
      socket.emit('KYC_ERROR', { message: err.message || 'Failed to request Video KYC' });
    }
  });

  // Driver cancels pending KYC request
  socket.on('KYC_CANCEL_REQUEST', async (data: { sessionId: string }) => {
    try {
      const { sessionId } = data || {};
      const driverId = socket.driverId;
      if (!sessionId) {
        return;
      }

      logger.info(`🚫 [KYC Socket] Driver ${driverId} cancelling Video KYC session ${sessionId}`);
      const result = await KycService.cancelKyc(sessionId, driverId);
      socket.emit('KYC_CANCEL_SUCCESS', result);
    } catch (err: any) {
      logger.error(`[KYC Socket] Error in KYC_CANCEL_REQUEST: ${err.message}`);
      socket.emit('KYC_ERROR', { message: err.message || 'Failed to cancel Video KYC' });
    }
  });

  // Driver joined Agora video call
  socket.on('KYC_DRIVER_JOINED', async (data: { sessionId: string }) => {
    try {
      const { sessionId } = data || {};
      const driverId = socket.driverId;
      logger.info(`🟢 [KYC Socket] Driver ${driverId} joined Agora channel for session ${sessionId}`);

      notifyAdmin('VIDEO_KYC_DRIVER_JOINED', {
        sessionId,
        driverId,
        timestamp: Date.now(),
      });
    } catch (err: any) {
      logger.error(`[KYC Socket] Error in KYC_DRIVER_JOINED: ${err.message}`);
    }
  });

  // Driver left Agora video call
  socket.on('KYC_DRIVER_LEFT', async (data: { sessionId: string }) => {
    try {
      const { sessionId } = data || {};
      const driverId = socket.driverId;
      logger.info(`🔴 [KYC Socket] Driver ${driverId} left Agora channel for session ${sessionId}`);

      notifyAdmin('VIDEO_KYC_DRIVER_LEFT', {
        sessionId,
        driverId,
        timestamp: Date.now(),
      });
    } catch (err: any) {
      logger.error(`[KYC Socket] Error in KYC_DRIVER_LEFT: ${err.message}`);
    }
  });
}

