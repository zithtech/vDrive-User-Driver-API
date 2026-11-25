import { Request, Response } from 'express';
import { KycService } from './kyc.service';
import { logger } from '../../shared/logger';

export class KycController {
  /**
   * Driver: Request Video KYC session
   * POST /api/kyc/video/request/:driverId
   */
  public static async requestKyc(req: Request, res: Response): Promise<void> {
    try {
      const { driverId } = req.params;
      const { location } = req.body || {};

      if (!driverId) {
        res.status(400).json({ success: false, message: 'Driver ID is required' });
        return;
      }

      const result = await KycService.requestKyc(driverId, location);
      res.status(200).json({ success: true, data: result });
    } catch (err: any) {
      logger.error('Error in requestKyc controller:', err);
      res.status(500).json({ success: false, message: err.message || 'Internal server error' });
    }
  }

  /**
   * Driver / Admin: Get Agora RTC Token
   * GET /api/kyc/video/token/:sessionId?driverId=...
   */
  public static async getToken(req: Request, res: Response): Promise<void> {
    try {
      const { sessionId } = req.params;
      const driverId = (req.query.driverId as string) || (req as any).driverId || '';

      if (!sessionId) {
        res.status(400).json({ success: false, message: 'Session ID is required' });
        return;
      }

      const result = await KycService.getToken(sessionId, driverId);
      res.status(200).json({ success: true, data: result });
    } catch (err: any) {
      logger.error('Error in getToken controller:', err);
      res.status(500).json({ success: false, message: err.message || 'Internal server error' });
    }
  }

  /**
   * Driver: Get Video KYC status
   * GET /api/kyc/video/status/:driverId
   */
  public static async getStatus(req: Request, res: Response): Promise<void> {
    try {
      const { driverId } = req.params;

      if (!driverId) {
        res.status(400).json({ success: false, message: 'Driver ID is required' });
        return;
      }

      const result = await KycService.getStatus(driverId);
      res.status(200).json({ success: true, data: result });
    } catch (err: any) {
      logger.error('Error in getStatus controller:', err);
      res.status(500).json({ success: false, message: err.message || 'Internal server error' });
    }
  }

  /**
   * Driver: Cancel pending Video KYC request
   * POST /api/kyc/video/cancel/:sessionId
   */
  public static async cancelKyc(req: Request, res: Response): Promise<void> {
    try {
      const { sessionId } = req.params;
      const { driverId } = req.body || {};

      if (!sessionId) {
        res.status(400).json({ success: false, message: 'Session ID is required' });
        return;
      }

      const result = await KycService.cancelKyc(sessionId, driverId);
      res.status(200).json({ success: true, data: result });
    } catch (err: any) {
      logger.error('Error in cancelKyc controller:', err);
      res.status(500).json({ success: false, message: err.message || 'Internal server error' });
    }
  }

  /**
   * Admin: Get Active KYC Queue
   * GET /api/kyc/video/queue
   */
  public static async getQueue(req: Request, res: Response): Promise<void> {
    try {
      const queue = await KycService.getQueue();
      res.status(200).json({ success: true, data: queue });
    } catch (err: any) {
      logger.error('Error in getQueue controller:', err);
      res.status(500).json({ success: false, message: err.message || 'Internal server error' });
    }
  }

  /**
   * Admin: Accept Video KYC request & initiate call
   * POST /api/kyc/video/accept/:sessionId
   */
  public static async acceptKyc(req: Request, res: Response): Promise<void> {
    try {
      const { sessionId } = req.params;
      const { adminId, adminName } = req.body || {};

      if (!sessionId) {
        res.status(400).json({ success: false, message: 'Session ID is required' });
        return;
      }

      const result = await KycService.acceptKyc(sessionId, adminId, adminName);
      res.status(200).json({ success: true, data: result });
    } catch (err: any) {
      logger.error('Error in acceptKyc controller:', err);
      res.status(500).json({ success: false, message: err.message || 'Internal server error' });
    }
  }

  /**
   * Admin: Send instruction prompt to driver during call
   * POST /api/kyc/video/prompt/:sessionId
   */
  public static async sendPrompt(req: Request, res: Response): Promise<void> {
    try {
      const { sessionId } = req.params;
      const { promptText } = req.body || {};

      if (!sessionId || !promptText) {
        res.status(400).json({ success: false, message: 'Session ID and prompt text are required' });
        return;
      }

      const result = await KycService.sendPrompt(sessionId, promptText);
      res.status(200).json({ success: true, data: result });
    } catch (err: any) {
      logger.error('Error in sendPrompt controller:', err);
      res.status(500).json({ success: false, message: err.message || 'Internal server error' });
    }
  }

  /**
   * Admin: Submit final verification verdict (Approve / Reject)
   * POST /api/kyc/video/verdict/:sessionId
   */
  public static async submitVerdict(req: Request, res: Response): Promise<void> {
    try {
      const { sessionId } = req.params;
      const { status, remarks, rejectionReasons } = req.body || {};

      if (!sessionId || !status) {
        res.status(400).json({ success: false, message: 'Session ID and status are required' });
        return;
      }

      if (status !== 'APPROVED' && status !== 'REJECTED') {
        res.status(400).json({ success: false, message: 'Status must be APPROVED or REJECTED' });
        return;
      }

      const result = await KycService.submitVerdict(sessionId, status, remarks, rejectionReasons);
      res.status(200).json({ success: true, data: result });
    } catch (err: any) {
      logger.error('Error in submitVerdict controller:', err);
      res.status(500).json({ success: false, message: err.message || 'Internal server error' });
    }
  }

  /**
   * Driver: Retry KYC after 2 minutes (Attempt 2)
   * POST /api/kyc/video/retry/:sessionId
   */
  public static async retryKyc(req: Request, res: Response): Promise<void> {
    try {
      const { sessionId } = req.params;
      const { driverId } = req.body || {};
      const result = await KycService.retryKyc(sessionId, driverId);
      res.status(200).json({ success: true, data: result });
    } catch (err: any) {
      logger.error('Error in retryKyc controller:', err);
      res.status(500).json({ success: false, message: err.message || 'Internal server error' });
    }
  }

  /**
   * Driver: Timeout after 4 minutes -> Move to scheduling desk
   * POST /api/kyc/video/timeout-to-schedule/:sessionId
   */
  public static async timeoutToSchedule(req: Request, res: Response): Promise<void> {
    try {
      const { sessionId } = req.params;
      const { driverId } = req.body || {};
      const result = await KycService.timeoutToSchedule(sessionId, driverId);
      res.status(200).json({ success: true, data: result });
    } catch (err: any) {
      logger.error('Error in timeoutToSchedule controller:', err);
      res.status(500).json({ success: false, message: err.message || 'Internal server error' });
    }
  }

  /**
   * Admin: Schedule Video KYC appointment for driver
   * POST /api/kyc/video/schedule-appointment
   */
  public static async scheduleAppointment(req: Request, res: Response): Promise<void> {
    try {
      const { driverId, sessionId, date, startTime, endTime, slotLabel, officerName, notes, notification } = req.body;
      if (!driverId || !date || !startTime || !endTime) {
        res.status(400).json({ success: false, message: 'Driver ID, date, startTime, and endTime are required' });
        return;
      }
      const result = await KycService.scheduleAppointment({
        driverId,
        sessionId,
        date,
        startTime,
        endTime,
        slotLabel: slotLabel || `${startTime} - ${endTime}`,
        officerName,
        notes,
        notification,
      });
      res.status(200).json({ success: true, data: result });
    } catch (err: any) {
      logger.error('Error in scheduleAppointment controller:', err);
      res.status(500).json({ success: false, message: err.message || 'Internal server error' });
    }
  }

  /**
   * Driver: Get scheduled Video KYC appointment
   * GET /api/kyc/video/appointment/:driverId
   */
  public static async getAppointment(req: Request, res: Response): Promise<void> {
    try {
      const { driverId } = req.params;
      const result = await KycService.getAppointment(driverId);
      res.status(200).json({ success: true, data: result });
    } catch (err: any) {
      logger.error('Error in getAppointment controller:', err);
      res.status(500).json({ success: false, message: err.message || 'Internal server error' });
    }
  }

  /**
   * Admin: Get Video KYC call history
   * GET /api/kyc/video/history
   */
  public static async getHistory(_req: Request, res: Response): Promise<void> {
    try {
      const history = await KycService.getHistory();
      res.status(200).json({ success: true, data: history });
    } catch (err: any) {
      logger.error('Error in getHistory controller:', err);
      res.status(500).json({ success: false, message: err.message || 'Internal server error' });
    }
  }

  /**
   * Admin: Get available working time slots (with booking status for given date)
   * GET /api/kyc/video/slots?date=YYYY-MM-DD
   */
  public static async getSlots(req: Request, res: Response): Promise<void> {
    try {
      const date = (req.query.date as string) || undefined;
      const slots = await KycService.getSlots(date);
      res.status(200).json({ success: true, data: slots });
    } catch (err: any) {
      logger.error('Error in getSlots controller:', err);
      res.status(500).json({ success: false, message: err.message || 'Internal server error' });
    }
  }

  /**
   * Admin: Add new custom availability time slot
   * POST /api/kyc/video/slots
   */
  public static async addSlot(req: Request, res: Response): Promise<void> {
    try {
      const { startTime, endTime, label } = req.body;
      if (!startTime || !endTime) {
        res.status(400).json({ success: false, message: 'Start and end time required' });
        return;
      }
      const slotId = req.body.id || `slot_${startTime.replace(':', '')}_${endTime.replace(':', '')}`;
      const result = await KycService.addSlot({
        id: slotId,
        startTime,
        endTime,
        label: label || `${startTime} – ${endTime}`,
      });
      res.status(200).json({ success: true, data: result });
    } catch (err: any) {
      logger.error('Error in addSlot controller:', err);
      res.status(500).json({ success: false, message: err.message || 'Internal server error' });
    }
  }

  /**
   * Admin: Delete availability time slot
   * DELETE /api/kyc/video/slots/:slotId
   */
  public static async deleteSlot(req: Request, res: Response): Promise<void> {
    try {
      const { slotId } = req.params;
      await KycService.deleteSlot(slotId);
      res.status(200).json({ success: true, message: 'Time slot deleted successfully' });
    } catch (err: any) {
      logger.error('Error in deleteSlot controller:', err);
      res.status(500).json({ success: false, message: err.message || 'Internal server error' });
    }
  }
}

