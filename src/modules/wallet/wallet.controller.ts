import { Request, Response } from 'express';
import { WalletService } from './wallet.service';
import { logger } from '../../shared/logger';

export const WalletController = {
  async getSettings(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user?.id || req.params.userId;
      if (!userId) {
        res.status(400).json({ success: false, message: 'User ID is required' });
        return;
      }
      const settings = await WalletService.getSettings(userId);
      res.status(200).json({ success: true, data: settings });
    } catch (error) {
      logger.error('Error fetching wallet settings', error);
      res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
  },

  async updateSettings(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user?.id || req.params.userId;
      if (!userId) {
        res.status(400).json({ success: false, message: 'User ID is required' });
        return;
      }
      const updatedSettings = await WalletService.updateSettings(userId, req.body);
      res.status(200).json({ success: true, data: updatedSettings });
    } catch (error) {
      logger.error('Error updating wallet settings', error);
      res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
  },
};
