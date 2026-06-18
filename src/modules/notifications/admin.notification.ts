import { sendToDevice, sendToMultipleDevices } from '../../config/firebase';
import { AdminNotificationType } from './notification.types';

export const AdminNotifications = {
  newDriverRegistered: (fcmTokens: string[], driverName: string, driverId: string) =>
    sendToMultipleDevices(fcmTokens, {
      type: AdminNotificationType.NEW_DRIVER_REGISTERED,
      title: 'New Driver Registered',
      body: `${driverName} has registered as a driver.`,
      data: { driverId, driverName },
    }),

  newUserRegistered: (fcmTokens: string[], userName: string, userId: string) =>
    sendToMultipleDevices(fcmTokens, {
      type: AdminNotificationType.NEW_USER_REGISTERED,
      title: 'New User Registered',
      body: `${userName} has registered.`,
      data: { userId, userName },
    }),

  documentSubmitted: (
    fcmTokens: string[],
    driverName: string,
    documentType: string,
    driverId: string
  ) =>
    sendToMultipleDevices(fcmTokens, {
      type: AdminNotificationType.DOCUMENT_SUBMITTED,
      title: 'Document Submitted',
      body: `${driverName} submitted ${documentType} for verification.`,
      data: { driverId, driverName, documentType },
    }),

  complaintRaised: (fcmTokens: string[], userId: string, bookingId: string) =>
    sendToMultipleDevices(fcmTokens, {
      type: AdminNotificationType.COMPLAINT_RAISED,
      title: 'Complaint Raised',
      body: 'A user has raised a complaint.',
      data: { userId, bookingId },
    }),

  paymentFailed: (fcmTokens: string[], bookingId: string, amount: string) =>
    sendToMultipleDevices(fcmTokens, {
      type: AdminNotificationType.PAYMENT_FAILED,
      title: 'Payment Failed',
      body: `Payment of ₹${amount} failed for booking ${bookingId}.`,
      data: { bookingId, amount },
    }),

  systemAlert: (fcmTokens: string[], message: string) =>
    sendToMultipleDevices(fcmTokens, {
      type: AdminNotificationType.SYSTEM_ALERT,
      title: 'System Alert',
      body: message,
    }),
};
