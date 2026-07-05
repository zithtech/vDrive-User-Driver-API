import { Request, Response, NextFunction } from 'express';
import { SosService } from './sos.service';
import { SosRepository } from './sos.repository';
import { successResponse, errorResponse } from '../../shared/errorHandler';

export class SosController {
  static async triggerSos(req: Request, res: Response, next: NextFunction) {
    try {
      const { trip_id, user_type } = req.body;
      const user_id = (req as any).user.id; // From auth middleware
      const type = user_type || 'driver'; // Default to driver for backward compatibility

      const sosEvent = await SosService.triggerSos(user_id, type, trip_id);
      return successResponse(res, 201, 'SOS Alert triggered successfully', sosEvent);
    } catch (err) {
      next(err);
    }
  }

  static async getActiveSos(req: Request, res: Response, next: NextFunction) {
    try {
      const activeSos = await SosService.getActiveSosWithDetails();
      return successResponse(res, 200, 'Active SOS Alerts retrieved', activeSos);
    } catch (err) {
      next(err);
    }
  }

  static async updateLocation(req: Request, res: Response, next: NextFunction) {
    try {
      const { sos_id, latitude, longitude } = req.body;
      if (!sos_id || !latitude || !longitude) {
        return errorResponse(res, 400, 'sos_id, latitude, and longitude are required');
      }

      await SosService.updateLocation(sos_id, latitude, longitude);
      return successResponse(res, 200, 'SOS location updated');
    } catch (err) {
      next(err);
    }
  }

  static async resolveSos(req: Request, res: Response, next: NextFunction) {
    try {
      const { sos_id } = req.body;
      if (!sos_id) {
        return errorResponse(res, 400, 'sos_id is required');
      }

      await SosService.resolveSos(sos_id);
      return successResponse(res, 200, 'SOS Alert resolved');
    } catch (err) {
      next(err);
    }
  }

  static async getTrustedContacts(req: Request, res: Response, next: NextFunction) {
    try {
      const user_id = (req as any).user.id;
      const user_type = (req.query.user_type as string) || 'driver';
      const contacts = await SosRepository.getTrustedContacts(
        user_id,
        user_type as 'driver' | 'customer'
      );
      return successResponse(res, 200, 'Trusted contacts retrieved', contacts);
    } catch (err) {
      next(err);
    }
  }

  static async addTrustedContact(req: Request, res: Response, next: NextFunction) {
    try {
      const { name, phone, relationship, user_type } = req.body;
      const user_id = (req as any).user.id;
      const type = user_type || 'driver'; // Default to driver for backward compatibility

      if (!name || !phone) {
        return errorResponse(res, 400, 'Name and phone are required');
      }

      const contact = await SosRepository.addTrustedContact(
        user_id,
        type,
        name,
        phone,
        relationship
      );
      return successResponse(res, 201, 'Trusted contact added', contact);
    } catch (err) {
      next(err);
    }
  }

  static async removeTrustedContact(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const user_id = (req as any).user.id;

      await SosRepository.removeTrustedContact(id, user_id);
      return successResponse(res, 200, 'Trusted contact removed');
    } catch (err) {
      next(err);
    }
  }
}
