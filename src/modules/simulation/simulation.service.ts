// src/services/simulationService.js
import { Server } from 'socket.io';
import { simulationRepository } from './simulation.repository';
import { logger } from '../../shared/logger';

interface TripUpdateResponse {
  trip_id: string;
  current_lat: number;
  current_lng: number;
  current_heading: number;
  trip_status: string;
  // ... add other database fields as needed
}

interface LocationEmitPayload {
  rideId: string;
  latitude: number;
  longitude: number;
  heading: number;
  status: string;
}

const activeIntervals: Record<string, NodeJS.Timeout> = {};

export const simulationService = {
  /**
   * Updates the driver location in DB and notifies the user via Socket
   */
  startFullRouteSimulation(io: Server, tripId: string, roadCoords: any[]) {
    // Clear existing simulation for this trip if it exists
    if (activeIntervals[tripId]) {
      clearInterval(activeIntervals[tripId]);
    }

    let index = 0;

    const interval = setInterval(async () => {
      if (index >= roadCoords.length) {
        clearInterval(interval);
        delete activeIntervals[tripId];
        return;
      }

      const point = roadCoords[index];

      // Re-use your existing logic to update DB and Emit Socket
      await this.processLocationUpdate(
        io,
        tripId,
        point.latitude,
        point.longitude,
        point.heading || 0
      );

      index++;
    }, 2000); // Move every 2 seconds

    activeIntervals[tripId] = interval;
  },

  async processLocationUpdate(
    io: Server,
    tripId: string,
    lat: number,
    lng: number,
    heading: number
  ): Promise<TripUpdateResponse | null> {
    try {
      // 1. Update the "Single Source of Truth" (Database)
      const updatedTrip = await simulationRepository.updateDriverLocation(
        tripId,
        lat,
        lng,
        heading
      );

      if (!updatedTrip) {
        logger.error(`Trip ${tripId} not found during location update.`);
        return null;
      }

      // 2. Broadcast to the specific Socket.io room for this trip
      // This ensures the User App sees the car move in real-time
      io.to(`${tripId}`).emit('updateDriverLocation', {
        rideId: tripId,
        latitude: lat,
        longitude: lng,
        heading: heading,
        status: updatedTrip.trip_status,
      });

      return updatedTrip;
    } catch (error) {
      logger.error(`Error in simulationService: ${error}`);
      throw error;
    }
  },
};
