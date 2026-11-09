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
}

