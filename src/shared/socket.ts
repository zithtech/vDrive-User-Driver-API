import { Server } from 'socket.io';
import { Server as HttpServer } from 'http';
import { logger } from './logger';
import jwt, { JwtPayload } from 'jsonwebtoken';

let io: Server;

export const initSocket = (server: HttpServer) => {
  io = new Server(server, {
    cors: {
      origin: '*', // Adjust for production in production-ready apps
      methods: ['GET', 'POST'],
    },
  });

  // 🔒 Socket Authentication Middleware
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;

    if (!token) {
      logger.warn(`Socket auth rejected: No token provided (${socket.id})`);
      return next(new Error('Authentication required'));
    }

    try {
      const decoded = jwt.verify(
        token,
        process.env.JWT_SECRET as string,
      ) as JwtPayload & { id: string };

      if (!decoded?.id) {
        return next(new Error('Invalid token payload'));
      }

      // Attach user info to the socket for later use
      (socket as any).userId = decoded.id;
      logger.info(`Socket authenticated: user=${decoded.id} socket=${socket.id}`);
      next();
    } catch (err: any) {
      if (err.name === 'TokenExpiredError') {
        logger.warn(`Socket auth rejected: Token expired (${socket.id})`);
        return next(new Error('Token expired'));
      }
      logger.warn(`Socket auth rejected: ${err.message} (${socket.id})`);
      return next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket) => {
    logger.info(`New client connected: ${socket.id} (user=${(socket as any).userId})`);

    // Join room for specific user/driver/trip
    socket.on('join', (room: string) => {
      socket.join(room);
      logger.info(`Socket ${socket.id} joined room: ${room}`);
    });

    socket.on('driver_location_update', async (data: { driverId: string; lat: number; lng: number; address?: string }) => {
      try {
        const { DriverRepository } = require('../modules/drivers/driver.repository');
        const { TripService } = require('../modules/trip/trip.service');
        const { LocationHistoryRepository } = require('../modules/drivers/locationHistory.repository');
        const { getRedisClient } = require('./redis');

        const { driverId, lat, lng, address } = data;
        if (!driverId || lat === undefined || lng === undefined) {
          return;
        }

        // 1. ⚡ Update Redis GEO Index immediately (High performance)
        try {
          const redis = getRedisClient();
          // Add to 'driver_locations' geo index (longitude first, then latitude in Redis!)
          await redis.geoadd('driver_locations', lng, lat, driverId);
          // Store last updated timestamp
          await redis.hset(`driver_info:${driverId}`, 'last_updated', Date.now());
          if (address) {
            await redis.hset(`driver_info:${driverId}`, 'address', address);
          }
        } catch (redisErr) {
          logger.error(`Redis geoadd failed for driver ${driverId}:`, redisErr);
        }

        // Check if driver has an active trip
        const activeTrip = await TripService.getActiveTrip(driverId);
        if (activeTrip) {
          // Broadcast to passenger
          io.to(`trip_${activeTrip.trip_id}`).emit('driver_location_updated', {
            lat,
            lng,
            driverId,
            tripId: activeTrip.trip_id,
          });

          // 📝 Log to location history (only during active trips)
          LocationHistoryRepository.logPoint({
            trip_id: activeTrip.trip_id,
            driver_id: driverId,
            latitude: lat,
            longitude: lng,
          }).catch((err: any) => {
            logger.error('Failed to log location history:', err);
          });
        }
      } catch (error) {
        logger.error('Error handling driver_location_update:', error);
      }
    });

    socket.on('disconnect', () => {
      logger.info(`Client disconnected: ${socket.id}`);
    });
  });

  return io;
};

export const getIO = () => {
  if (!io) {
    throw new Error('Socket.io not initialized');
  }
  return io;
};

export const emitToAll = (event: string, data: any) => {
  if (io) {
    io.emit(event, data);
  }
};

export const emitToRoom = (room: string, event: string, data: any) => {
  if (io) {
    io.to(room).emit(event, data);
  }
};

export const broadcastTripUpdate = (tripId: string, data: any) => {
  emitToRoom(`trip_${tripId}`, 'trip_updated', data);
};
