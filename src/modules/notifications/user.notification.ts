import { sendToDevice, sendToMultipleDevices } from '../../config/firebase';
import { UserNotificationType } from './notification.types';

export const UserNotifications = {

    forceLogout: (fcmToken: string) =>
        sendToDevice(fcmToken, {
            type: UserNotificationType.FORCE_LOGOUT,
            title: 'Session Ended',
            body: 'Your account was accessed from another device.',
            androidChannelId: 'default',
        }),
   otpSent: (fcmToken: string, otp: string) =>
        sendToDevice(fcmToken, {
            type: UserNotificationType.OTP_SENT,
            title: 'OTP Sent',
            body: `Your OTP has been sent to your registered mobile number. OTP: ${otp}`,
            data: { otp },
            androidChannelId: 'default',
        }),

    loginSuccess: (fcmToken: string) =>
        sendToDevice(fcmToken, {
            type: UserNotificationType.LOGIN_SUCCESS,
            title: 'Login Successful',
            body: 'You have successfully logged in.',
            androidChannelId: 'default',
        }),

    bookingConfirmed: (fcmToken: string, bookingId: string) =>
        sendToDevice(fcmToken, {
            type: UserNotificationType.BOOKING_CONFIRM,
            title: 'Booking Confirmed',
            body: 'Your booking has been confirmed.',
            data: { bookingId },
            androidChannelId: 'default',
        }),

    bookingCancelled: (fcmToken: string, bookingId: string, reason?: string, cancelledBy?: string) =>
        sendToDevice(fcmToken, {
            type: UserNotificationType.BOOKING_CANCEL,
            title: 'Booking Cancelled',
            body: reason || 'Your booking has been cancelled.',
            data: { bookingId, reason: reason ?? '', cancelledBy: cancelledBy ?? '' },
            androidChannelId: 'default',
        }),

    rideCancelled: (fcmToken: string, bookingId: string, reason?: string, cancelledBy?: string) =>
        sendToDevice(fcmToken, {
            type: UserNotificationType.RIDE_CANCELLED,
            title: 'Ride Cancelled by Driver',
            body: `Your ride has been cancelled by the driver. Reason: ${reason}`,
            data: { bookingId, reason: reason ?? '', cancelledBy: cancelledBy ?? '' },
            androidChannelId: 'default',
        }),

    driverAssigned: (fcmToken: string, driverName: string, bookingId: string) =>
        sendToDevice(fcmToken, {
            type: UserNotificationType.DRIVER_ASSIGNED,
            title: 'Driver Assigned! 🚗',
            body: `${driverName} is on the way to pick you up.`,
            data: { bookingId, driverName },
            androidChannelId: 'default',
        }),
    driverArriving: (fcmToken: string, driverName: string, bookingId: string) =>
        sendToDevice(fcmToken, {
            type: UserNotificationType.DRIVER_ARRIVING,
            title: 'Driver Arriving! 🚗',
            body: `${driverName} is arriving at your location.`,
            data: { bookingId, driverName },
            androidChannelId: 'default',
        }),
    driverArrived: (fcmToken: string, driverName: string, bookingId: string) =>
        sendToDevice(fcmToken, {
            type: UserNotificationType.DRIVER_ARRIVED,
            title: 'Driver Arrived! 🚗',
            body: `${driverName} has arrived at your location.`,
            data: { bookingId, driverName },
            androidChannelId: 'default',
        }),

    rideStarted: (fcmToken: string, bookingId: string) =>
        sendToDevice(fcmToken, {
            type: UserNotificationType.RIDE_STARTED,
            title: 'Ride Started',
            body: 'Your ride has started. Have a safe journey!',
            data: { bookingId },
            androidChannelId: 'default',
        }),

    destinationReached: (fcmToken: string, driverName: string, bookingId: string) =>
        sendToDevice(fcmToken, {
            type: UserNotificationType.DESTINATION_REACHED,
            title: 'Destination Reached! 🚗',
            body: `${driverName} has reached your destination.`,
            data: { bookingId, driverName },
            androidChannelId: 'default',
        }),

    rideCompleted: (fcmToken: string, bookingId: string, amount: string) =>
        sendToDevice(fcmToken, {
            type: UserNotificationType.RIDE_COMPLETED,
            title: 'Ride Completed',
            body: `Your ride is complete. Total: ₹${amount}`,
            data: { bookingId, amount },
            androidChannelId: 'default',
        }),

    paymentSuccess: (fcmToken: string, amount: string, bookingId: string) =>
        sendToDevice(fcmToken, {
            type: UserNotificationType.PAYMENT_SUCCESS,
            title: 'Payment Successful',
            body: `Payment of ₹${amount} was successful.`,
            data: { bookingId, amount },
            androidChannelId: 'default',
        }),

    paymentFailed: (fcmToken: string, bookingId: string) =>
        sendToDevice(fcmToken, {
            type: UserNotificationType.PAYMENT_FAILED,
            title: 'Payment Failed',
            body: 'Your payment could not be processed. Please try again.',
            data: { bookingId },
            androidChannelId: 'default',
        }),

    sosResolved: (fcmToken: string, sosId: string) =>
        sendToDevice(fcmToken, {
            type: UserNotificationType.SOS_RESOLVED,
            title: 'SOS Alert Resolved',
            body: 'Your SOS emergency alert has been marked as resolved by the admin.',
            data: { sosId },
            androidChannelId: 'default',
        }),

    otpLimitExceeded: (fcmToken: string, blockDuration: number) =>
        sendToDevice(fcmToken, {
            type: UserNotificationType.OTP_LIMIT_EXCEEDED,
            title: 'OTP Limit Exceeded',
            body: `OTP request limit exceeded. You are blocked for ${blockDuration} minutes.`,
            androidChannelId: 'default',
        }),

    tooManyAttempts: (fcmToken: string, blockDuration: number) =>
        sendToDevice(fcmToken, {
            type: UserNotificationType.TOO_MANY_ATTEMPTS,
            title: 'Too Many Attempts',
            body: `Too many failed attempts. Account locked for ${blockDuration} minutes.`,
            androidChannelId: 'default',
        }),
};