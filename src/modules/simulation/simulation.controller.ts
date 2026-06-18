// src/controllers/simulation.controller.ts
import { Request, Response } from 'express';
import { Server } from 'socket.io';
import { simulationService } from './simulation.service';

export const simulationController = {
  async startIntervalSimulation(req: Request, res: Response): Promise<Response> {
    try {
      const { tripId, roadCoords } = req.body;
      const io = req.app.get('io') as Server;

      if (!tripId || !Array.isArray(roadCoords)) {
        return res.status(400).json({
          success: false,
          message: 'Missing tripId or roadCoords array',
        });
      }
      simulationService.startFullRouteSimulation(io, tripId, roadCoords);

      return res.status(200).json({
        success: true,
        message: 'Backend simulation started',
      });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message });
    }
  },
  async updateLocation(req: Request, res: Response): Promise<Response> {
    try {
      const { tripId, latitude, longitude, heading } = req.body;

      const io = req.app.get('io') as Server;

      if (!tripId || latitude === undefined || longitude === undefined) {
        return res.status(400).json({
          success: false,
          message: 'Missing tripId, latitude, or longitude',
        });
      }

      const result = await simulationService.processLocationUpdate(
        io,
        tripId,
        Number(latitude),
        Number(longitude),
        Number(heading || 0)
      );

      return res.status(200).json({
        success: true,
        message: 'Location updated and broadcasted',
        data: result,
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  },
};
