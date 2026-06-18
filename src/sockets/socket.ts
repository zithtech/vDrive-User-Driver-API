import { Server, Socket } from 'socket.io';
import { Server as HttpServer } from 'http';
import { logger } from '../shared/logger';
import { TripService } from '../modules/trip/trip.service';
import { TripSocketEvent, TripEventPayload } from './socket.types';
import { connectToAdminBackend } from '../sockets/admin-socket.service';
import registerChatSocket from './chat.socket';
import registerSupportSocket from './support.socket';

let io: Server;

// -----------------------------------------------------------------------------
// Init
// -----------------------------------------------------------------------------

export const initSocket = (server: HttpServer): Server => {
  io = new Server(server, {
    cors: {
      origin: '*', // Restrict in production
      methods: ['GET', 'POST'],
      credentials: true,
    },
    transports: ['websocket', 'polling'],
  });

  io.on('connection', (socket: Socket) => {
    logger.info(`Socket connected: ${socket.id}`);

    handleRoomJoins(socket);
    handleDriverLocation(socket);
    handleTripActions(socket);
    handleDisconnect(socket);

    //chat-socket
    registerChatSocket(io, socket);
    registerSupportSocket(io, socket);
  });
  connectToAdminBackend(io);

  return io;
};

export const getIO = (): Server => {
  if (!io) {
    throw new Error('Socket.io not initialized. Call initSocket() first.');
  }
  return io;
};

// -----------------------------------------------------------------------------
// Handlers
// -----------------------------------------------------------------------------

const handleRoomJoins = (socket: Socket): void => {
  // Generic room join
  socket.on('join', (data: any) => {
    const roomName = typeof data === 'object' && data?.room ? data.room : data;
    if (roomName && typeof roomName === 'string') {
      socket.join(roomName);
      logger.info(`Socket ${socket.id} joined room: ${roomName}`);
    } else {
      logger.warn(`Socket ${socket.id} tried to join invalid room: ${JSON.stringify(data)}`);
    }
  });

  // Generic room leave
  socket.on('leave', (room: string) => {
    socket.leave(room);
    logger.info(`Socket ${socket.id} left room: ${room}`);
  });

  // ✅ User/Driver joining a trip room — BOTH join same room
  socket.on('joinRide', (data: { rideId: string; role: string; actorId: string }) => {
    const { rideId, role, actorId } = data;

    const tripRoom = `trip_${rideId}`;
    socket.join(tripRoom); // ✅ shared trip room

    // Also join personal room for direct messages
    if (role === 'USER') {
      socket.join(`user_${String(actorId)}`);
      logger.info(`User ${actorId} joined trip room: ${tripRoom}`);
    } else if (role === 'DRIVER') {
      socket.join(`driver_${String(actorId)}`);
      logger.info(`Driver ${actorId} joined trip room: ${tripRoom}`);
    }
  });

  // ✅ User/Driver leaving a trip room
  socket.on('leaveRide', (data: { rideId: string; role: string; actorId: string }) => {
    const { rideId, role, actorId } = data;

    const tripRoom = `trip_${rideId}`;
    socket.leave(tripRoom);

    if (role === 'USER') {
      logger.info(`User ${actorId} left trip room: ${tripRoom}`);
    } else if (role === 'DRIVER') {
      logger.info(`Driver ${actorId} left trip room: ${tripRoom}`);
    }
  });

  // Driver listening for incoming trip requests
  socket.on('JOIN_DRIVER_ROOM', (driverId: any) => {
    if (!driverId) return;
    const roomName = `driver_${String(driverId)}`;
    socket.join(roomName);
    logger.info(`Driver ${driverId} listening in room: ${roomName}`);
  });

  // User personal room (for direct notifications)
  socket.on('JOIN_USER_ROOM', (userId: string) => {
    if (!userId) return;
    socket.join(`user_${userId}`);
    logger.info(`User ${userId} listening in room: user_${userId}`);
  });
};

const handleDriverLocation = (socket: Socket): void => {
  // 1. Generic driver location update (for online tracking)
  socket.on(
    'driver_location_update',
    async (data: { driverId: string; lat: number; lng: number; address?: string }) => {
      try {
        const { getRedisClient } = require('../shared/redis');
        const redis = getRedisClient();
        const { driverId, lat, lng, address } = data;

        if (!driverId || lat === undefined || lng === undefined) return;

        // ⚡ Update Redis GEO Index immediately (High performance)
        // Note: Redis GEOADD expects (longitude, latitude)
        await redis.geoadd('driver_locations', lng, lat, driverId);

        // Store last updated timestamp and optional address
        await redis.hset(`driver_info:${driverId}`, 'last_updated', Date.now());
        if (address) {
          await redis.hset(`driver_info:${driverId}`, 'address', address);
        }
      } catch (error) {
        logger.error('Error handling driver_location_update socket event:', error);
      }
    }
  );

  socket.on(
    'updateDriverLocation',
    (data: {
      rideId: string;
      latitude: number;
      longitude: number;
      heading?: number;
      eta?: number;
    }) => {
      // logger.info(`Driver location: rideId ${data.rideId} ${data.latitude}, ${data.longitude}`);
      emitToRoom(`trip_${data.rideId}`, 'locationUpdate', {
        latitude: data.latitude,
        longitude: data.longitude,
        heading: data.heading,
        eta: data.eta,
      });
      logger.info(
        `📡 Broadcasted locationUpdate for trip_${data.rideId} | Lat: ${data.latitude.toFixed(5)} Lng: ${data.longitude.toFixed(5)}`
      );
    }
  );
};

const handleTripActions = (socket: Socket): void => {
  // ─── Accept Trip ──────────────────────────────────────────────
  socket.on(
    'ACCEPT_TRIP',
    async (
      data: { tripId: string; driverId: string },
      callback?: (response: { success: boolean; trip?: any; message?: string }) => void
    ) => {
      try {
        const { tripId, driverId } = data;
        const trip = await TripService.acceptTrip(tripId, driverId);
        callback?.({ success: true, trip });
      } catch (error: any) {
        logger.error(`ACCEPT_TRIP error: ${error.message}`);
        callback?.({ success: false, message: error.message || 'Failed to accept trip' });
      }
    }
  );

  // ─── Start Trip ───────────────────────────────────────────────
  socket.on(
    'START_TRIP',
    async (
      data: { tripId: string; driverId: string },
      callback?: (response: { success: boolean; trip?: any; message?: string }) => void
    ) => {
      try {
        const { tripId, driverId } = data;
        const trip = await TripService.startTrip(tripId);
        callback?.({ success: true, trip });
      } catch (error: any) {
        logger.error(`START_TRIP error: ${error.message}`);
        callback?.({ success: false, message: error.message || 'Failed to start trip' });
      }
    }
  );

  // ─── Complete Trip ────────────────────────────────────────────
  socket.on(
    'COMPLETE_TRIP',
    async (
      data: { tripId: string },
      callback?: (response: { success: boolean; trip?: any; message?: string }) => void
    ) => {
      try {
        const { tripId } = data;
        const trip = await TripService.completeTrip(tripId);
        callback?.({ success: true, trip });
      } catch (error: any) {
        logger.error(`COMPLETE_TRIP error: ${error.message}`);
        callback?.({ success: false, message: error.message || 'Failed to complete trip' });
      }
    }
  );

  // ─── Cancel Trip ──────────────────────────────────────────────
  socket.on(
    'CANCEL_TRIP',
    async (
      data: { tripId: string; cancelBy: string; cancelReason: string; notes?: string },
      callback?: (response: { success: boolean; trip?: any; message?: string }) => void
    ) => {
      try {
        const { tripId, cancelBy, cancelReason, notes } = data;
        const trip = await TripService.cancelTrip(
          tripId,
          '',
          cancelReason as any,
          cancelBy as any,
          notes || ''
        );
        callback?.({ success: true, trip });
      } catch (error: any) {
        logger.error(`CANCEL_TRIP error: ${error.message}`);
        callback?.({ success: false, message: error.message || 'Failed to cancel trip' });
      }
    }
  );
};

const handleDisconnect = (socket: Socket): void => {
  socket.on('disconnect', () => {
    logger.info(`Socket disconnected: ${socket.id}`);
  });
};

// -----------------------------------------------------------------------------
// Emit Helpers
// -----------------------------------------------------------------------------

export const emitToRoom = (room: string, event: string, data: unknown): void => {
  if (io) {
    io.to(room).emit(event, data);
  }
};

export const emitToAll = (event: string, data: any): void => {
  if (io) {
    io.emit(event, data);
  }
};

export const broadcastTripUpdate = (tripId: string, data: unknown): void => {
  emitToRoom(`trip_${tripId}`, 'trip_updated', data);
};

export const emitToDriver = (driverId: string, event: string, data: unknown): void => {
  emitToRoom(`driver_${driverId}`, event, data);
};

// ─── Unified Trip Room Emitter ───────────────────────────────────
export const emitTripUpdate = (
  tripId: string,
  event: TripSocketEvent,
  data: TripEventPayload
): void => {
  emitToRoom(`trip_${tripId}`, event, {
    ...data,
    timestamp: new Date().toISOString(),
  });
};

// ─── Emit Trip Removed ───────────────────────────────────────────
export const emitTripRemoved = (tripId: string): void => {
  emitToRoom(`trip_${tripId}`, 'TRIP_REMOVED', {
    tripId,
    timestamp: new Date().toISOString(),
  });
};

// ─── Emit to specific actor only ────────────────────────────────
export const emitToUser = (
  userId: string,
  event: TripSocketEvent,
  data: TripEventPayload
): void => {
  emitToRoom(`user_${userId}`, event, {
    ...data,
    timestamp: new Date().toISOString(),
  });
};
