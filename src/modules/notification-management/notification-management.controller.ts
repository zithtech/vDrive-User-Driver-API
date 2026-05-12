import { Request, Response } from 'express';
import { NotificationService } from './notification-management.service';

export const dispatchNotification = async (req: Request, res: Response) => {
  try {
    const result = await NotificationService.queueDispatchOnly(req.body);
    res.status(200).json({ 
      success: true, 
      message: 'Campaign queued for dispatch',
      data: result 
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getNotifications = async (req: Request, res: Response) => {
  try {
    const { target_type } = req.query;
    const result = await NotificationService.getAllNotifications(target_type as string);
    res.status(200).json({ success: true, data: result });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const createNotificationRecord = async (req: Request, res: Response) => {
  try {
    const result = await NotificationService.queueNewNotification(req.body);
    res.status(201).json({ success: true, data: result });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const updateNotificationRecord = async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const result = await NotificationService.updateNotification(id, req.body);
    res.status(200).json({ success: true, data: result });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const deleteNotificationRecord = async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    await NotificationService.deleteNotification(id);
    res.status(200).json({ success: true, message: 'Notification deleted' });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};
