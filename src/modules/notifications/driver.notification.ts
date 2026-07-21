import { sendToDevice } from '../../config/firebase';
import { DriverNotificationType } from './notification.types';

export const DriverNotifications = {
  forceLogout: (fcmToken: string) =>
    sendToDevice(fcmToken, {
      type: DriverNotificationType.FORCE_LOGOUT,
      title: 'Session Ended',
      body: 'Your account was accessed from another device.',
      androidChannelId: 'ride_requests',
    }),

  chatMessage: (fcmToken: string, text: string, rideId: string, senderName: string) =>
    sendToDevice(fcmToken, {
      type: 'CHAT_MESSAGE',
      title: `New message from ${senderName}`,
      body: text,
      data: { rideId, trip_id: rideId, senderName },
      androidChannelId: 'v-drive-alerts', // Use standard alerts channel
    }),

  newRideRequest: (
    fcmToken: string,
    bookingId: string,
    pickup: string,
    drop: string,
    extraData?: Record<string, string>
  ) =>
    sendToDevice(fcmToken, {
      type: DriverNotificationType.NEW_RIDE_REQUEST,
      title: 'New Ride Request',
      body: `Pickup: ${pickup} → Drop: ${drop}`,
      data: { bookingId, trip_id: bookingId, pickup, drop, ...(extraData || {}) },
      androidChannelId: 'ride_requests',
    }),

  rideAssigned: (fcmToken: string, bookingId: string) =>
    sendToDevice(fcmToken, {
      type: DriverNotificationType.RIDE_ASSIGNED,
      title: 'New Ride Assigned',
      body: `A new ride has been assigned to you. Tap to view details.`,
      data: { bookingId, trip_id: bookingId },
      androidChannelId: 'ride_requests',
    }),

  rideStarted: (fcmToken: string, bookingId: string) =>
    sendToDevice(fcmToken, {
      type: DriverNotificationType.RIDE_STARTED,
      title: 'Ride Started',
      body: `Your ride has started.`,
      data: { bookingId, trip_id: bookingId },
      androidChannelId: 'ride_requests',
    }),

  rideCancelled: (fcmToken: string, bookingId: string, reason?: string, cancelledBy?: string) =>
    sendToDevice(fcmToken, {
      type: DriverNotificationType.RIDE_CANCELLED,
      title: 'Ride Cancelled',
      body: reason || 'The ride has been cancelled.',
      data: { bookingId, trip_id: bookingId, reason: reason ?? '', cancelledBy: cancelledBy ?? '' },
      androidChannelId: 'ride_requests',
    }),

  bookingCancelled: (fcmToken: string, bookingId: string, reason?: string, cancelledBy?: string) =>
    sendToDevice(fcmToken, {
      type: DriverNotificationType.BOOKING_CANCELLED,
      title: 'Booking Cancelled',
      body: reason || 'Your booking has been cancelled.',
      data: { bookingId, trip_id: bookingId, reason: reason ?? '', cancelledBy: cancelledBy ?? '' },
      androidChannelId: 'ride_requests',
    }),

  rideCompleted: (fcmToken: string, bookingId: string, amount: string) =>
    sendToDevice(fcmToken, {
      type: DriverNotificationType.RIDE_COMPLETED,
      title: 'Ride Completed',
      body: `Your ride has been completed. You earned ₹${amount}.`,
      data: { bookingId, trip_id: bookingId, amount },
      androidChannelId: 'ride_requests',
    }),

  paymentReceived: (fcmToken: string, amount: string, bookingId: string) =>
    sendToDevice(fcmToken, {
      type: DriverNotificationType.PAYMENT_RECEIVED,
      title: 'Payment Received',
      body: `You received ₹${amount} for your ride.`,
      data: { bookingId, trip_id: bookingId, amount },
      androidChannelId: 'ride_requests',
    }),

  documentApproved: (fcmToken: string, documentType: string) =>
    sendToDevice(fcmToken, {
      type: DriverNotificationType.DOCUMENT_APPROVED,
      title: 'Document Approved',
      body: `Your ${documentType} has been approved.`,
      data: { documentType },
      androidChannelId: 'ride_requests',
    }),

  documentRejected: (fcmToken: string, documentType: string, reason: string) =>
    sendToDevice(fcmToken, {
      type: DriverNotificationType.DOCUMENT_REJECTED,
      title: 'Document Rejected',
      body: `Your ${documentType} was rejected. Reason: ${reason}`,
      data: { documentType, reason },
      androidChannelId: 'ride_requests',
    }),

  kycApproved: (fcmToken: string) =>
    sendToDevice(fcmToken, {
      type: DriverNotificationType.KYC_APPROVED,
      title: 'KYC Approved',
      body: 'Your KYC verification has been approved. You can now start accepting rides.',
      androidChannelId: 'ride_requests',
    }),

  kycRejected: (fcmToken: string, reason: string) =>
    sendToDevice(fcmToken, {
      type: DriverNotificationType.KYC_REJECTED,
      title: 'KYC Rejected',
      body: `Your KYC was rejected. Reason: ${reason}`,
      data: { reason },
      androidChannelId: 'ride_requests',
    }),

  walletCredited: (fcmToken: string, amount: string, balance: string) =>
    sendToDevice(fcmToken, {
      type: DriverNotificationType.WALLET_CREDITED,
      title: 'Wallet Credited',
      body: `₹${amount} added to your wallet. Balance: ₹${balance}`,
      data: { amount, balance },
      androidChannelId: 'ride_requests',
    }),

  walletDebited: (fcmToken: string, amount: string, balance: string) =>
    sendToDevice(fcmToken, {
      type: DriverNotificationType.WALLET_DEBITED,
      title: 'Wallet Debited',
      body: `₹${amount} deducted from your wallet. Balance: ₹${balance}`,
      data: { amount, balance },
      androidChannelId: 'ride_requests',
    }),

  subscriptionActivated: (fcmToken: string, planName: string, isRenewal: boolean) =>
    sendToDevice(fcmToken, {
      type: DriverNotificationType.SUBSCRIPTION_ACTIVATED,
      title: isRenewal ? 'Subscription Renewed ✅' : 'Subscription Activated ✅',
      body: `Your ${planName} is now active. Let's get driving!`,
      data: { planName },
      androidChannelId: 'ride_requests',
    }),

  subscriptionExpiringSoon: (fcmToken: string, planName: string) =>
    sendToDevice(fcmToken, {
      type: DriverNotificationType.SUBSCRIPTION_EXPIRING,
      title: 'Subscription Expiring Soon ⚠️',
      body: `Your ${planName} expires tomorrow. Recharge now to continue receiving rides!`,
      data: { planName },
      androidChannelId: 'ride_requests',
    }),


  sosResolved: (fcmToken: string, sosId: string) =>
    sendToDevice(fcmToken, {
      type: DriverNotificationType.SOS_RESOLVED,
      title: 'SOS Alert Resolved',
      body: 'Your SOS emergency alert has been marked as resolved.',
      data: { sosId },
      androidChannelId: 'ride_requests',
    }),

  tripVerificationApproved: (fcmToken: string, tripId: string) =>
    sendToDevice(fcmToken, {
      type: DriverNotificationType.TRIP_VERIFICATION_APPROVED,
      title: 'Verification Approved ✅',
      body: 'Your trip verification has been approved. Ride is starting!',
      data: { trip_id: tripId, action: 'start_ride' },
      androidChannelId: 'ride_requests',
    }),

  tripVerificationRejected: (fcmToken: string, tripId: string, rejectionReason?: any) =>
    sendToDevice(fcmToken, {
      type: DriverNotificationType.TRIP_VERIFICATION_REJECTED,
      title: 'Verification Rejected ❌',
      body: 'Your trip photos were rejected. Please re-upload.',
      data: {
        trip_id: tripId,
        action: 'reupload_photos',
        rejection_reason: rejectionReason ? JSON.stringify(rejectionReason) : '',
      },
      androidChannelId: 'ride_requests',
    }),

  otpLimitExceeded: (fcmToken: string, blockDuration: number) =>
    sendToDevice(fcmToken, {
      type: DriverNotificationType.OTP_LIMIT_EXCEEDED,
      title: 'OTP Limit Exceeded',
      body: `OTP request limit exceeded. You are blocked for ${blockDuration} minutes.`,
      androidChannelId: 'ride_requests',
    }),

  tooManyAttempts: (fcmToken: string, blockDuration: number) =>
    sendToDevice(fcmToken, {
      type: DriverNotificationType.TOO_MANY_ATTEMPTS,
      title: 'Too Many Attempts',
      body: `Too many failed attempts. Account locked for ${blockDuration} minutes.`,
      androidChannelId: 'ride_requests',
    }),
};
