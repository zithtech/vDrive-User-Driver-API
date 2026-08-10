// src/modules/users/user.service.ts
import { query } from '../../shared/database';
import { AuthRepository } from './auth.repository';
import { DriverRepository } from '../drivers/driver.repository';
import * as bcrypt from 'bcrypt';
import jwt, { JwtPayload, SignOptions } from 'jsonwebtoken';
import config from '../../config';
import { UserRepository } from '../users/user.repository';
import {
  OnboardingStatus,
  DriverOnboardingStatus,
  UserRole,
  UserStatus,
} from '../../enums/user.enums';
import { isInvalidUser } from '../../utilities/helper';
import { User } from '../users/user.model';
import { logger } from '../../shared/logger';
import { DriverNotifications, UserNotifications } from '../notifications';
import axios from 'axios';

interface VerifyOtpUser {
  phone_number: string;
  role: string;
  otp: string;
  device_id: string;
  allow_new_device: boolean;
  fcm_token: string;
  referred_by?: string;
}

async function createNewUser(
  role: string,
  phone_number: string,
  device_id: string,
  referred_by?: string
) {
  const baseInput: any = {
    first_name: '',
    last_name: '',
    phone_number,
    email: null,
    role,
    status: UserStatus.ACTIVE,
    device_id,
    onboarding_status:
      role === 'driver' ? DriverOnboardingStatus.PHONE_VERIFIED : OnboardingStatus.PHONE_VERIFIED,
    date_of_birth: null,
    gender: null,
    referred_by: referred_by || null,
  };

  if (role === 'driver') {
    if (device_id) {
      await query(`UPDATE drivers SET device_id = NULL WHERE device_id = $1`, [device_id]);
    }
    const driverInput = {
      ...baseInput,
      address: '',
      status: UserStatus.PENDING_VERIFICATION, // Initialize as pending
      documents_submitted: false,
    };
    const newDriver = await DriverRepository.create(driverInput);
    return {
      id: newDriver.driverId,
      ...newDriver,
      role: UserRole.DRIVER,
      status: UserStatus.PENDING_VERIFICATION,
    };
  }

  if (role === 'customer') {
    if (device_id) {
      await query(`UPDATE users SET device_id = NULL WHERE device_id = $1`, [device_id]);
    }
    const newUser = await UserRepository.createUser(baseInput); // only common fields
    return {
      id: newUser?.id,
      ...newUser,
      role: UserRole.CUSTOMER,
      status: UserStatus.ACTIVE,
    };
  }

  throw { statusCode: 400, message: `Unsupported role: ${role}` };
}

export const AuthService = {
  generateResetToken(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  },
  hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, 10);
  },

  genNumericOTP(length: number): string {
    let otp = '';
    for (let i = 0; i < length; i++) {
      otp += Math.floor(Math.random() * 10);
    }
    return otp;
  },

  async hashValue(value: string): Promise<string> {
    const saltRounds = 10;
    return await bcrypt.hash(value, saltRounds);
  },

  async compareHash(value: string, hashed: string) {
    return bcrypt.compare(value, hashed);
  },

  //******************************************************************************
  // ─── Request OTP Methods ─────────────────────────────────────────────────────
  //******************************************************************************

  async requestOtp({
    phone_number,
    role,
    device_id,
    allow_new_device,
    fcm_token,
  }: {
    phone_number: string;
    role: string;
    device_id: string;
    allow_new_device: boolean;
    fcm_token?: string;
  }): Promise<{ expiresIn: number; userexists: boolean; userData: any; otp: any }> {
    const {
      otpExpiryTime: TTL,
      maxAttempts: MaxAttempt,
      otpRequestLimit,
      otpRequestWindow,
      otpBlockDuration,
    } = config.auth;

    try {
      // Get existing OTP data for security checks
      const otpData = (await AuthRepository.getOtpData(phone_number, role)) as any;

      // 1. Check if currently blocked
      if (otpData?.blocked_until && new Date() < new Date(otpData.blocked_until)) {
        const remainingTime = Math.max(
          1,
          Math.ceil((new Date(otpData.blocked_until).getTime() - Date.now()) / (60 * 1000))
        );
        throw {
          statusCode: 429,
          message: `Too many attempts. Please try again after ${remainingTime} minutes.`,
        };
      }

      // 2. Duplicate request protection: if an unexpired, unused OTP exists
      //    and was created within the last 30 seconds, return the same TTL
      //    without generating a new OTP (prevents hash overwrite on double-tap)
      const OTP_COOLDOWN_MS = 30 * 1000; // 30 seconds
      if (otpData?.created_at && otpData?.expires_at) {
        const createdAt = new Date(otpData.created_at).getTime();
        const expiresAt = new Date(otpData.expires_at).getTime();
        const now = Date.now();
        if (
          now - createdAt < OTP_COOLDOWN_MS &&
          now < expiresAt &&
          otpData.attempt_count === 0
        ) {
          logger.info(
            `Duplicate OTP request for ${phone_number} within cooldown — skipping regeneration`
          );
          // Return existing TTL without regenerating
          const userData = await AuthRepository.getUser(phone_number, role);
          return {
            expiresIn: TTL,
            userexists: !!userData,
            userData: userData?.full_name,
            otp: null, // Don't resend OTP — app should use the one already received
          };
        }
      }

      // 3. Handle Request Rate Limiting
      let currentRequestCount = otpData?.request_count || 0;
      const lastRequestedAt = otpData?.last_requested_at
        ? new Date(otpData.last_requested_at)
        : null;
      const now = new Date();

      if (
        lastRequestedAt &&
        now.getTime() - lastRequestedAt.getTime() < otpRequestWindow * 60 * 1000
      ) {
        // Within window
        currentRequestCount++;
        if (currentRequestCount > otpRequestLimit) {
          const blockUntil = new Date(now.getTime() + otpBlockDuration * 60 * 1000);
          await AuthRepository.blockUser(phone_number, role, blockUntil);
          // Notify user about being blocked
          const targetFcmToken =
            fcm_token || (await AuthRepository.getUser(phone_number, role))?.fcm_token;
          if (targetFcmToken) {
            if (role === 'driver') {
              await DriverNotifications.otpLimitExceeded(targetFcmToken, otpBlockDuration);
            } else {
              await UserNotifications.otpLimitExceeded(targetFcmToken, otpBlockDuration);
            }
          }

          throw {
            statusCode: 429,
            message: `OTP request limit exceeded. You are blocked for ${otpBlockDuration} minutes.`,
            code: 'TOO_MANY_REQUESTS',
          };
        }
      } else {
        // Outside window or first request, reset count
        currentRequestCount = 1;
      }

      // Verify existing user
      let userData = await AuthRepository.getUser(phone_number, role);
      const isExistingUser = !!userData;

      if (isExistingUser && userData) {
        const userId = userData.id as string; // ✅ assert type

        if (!userId) {
          throw { statusCode: 500, message: 'User ID not found' };
        }

        // ✅ Pass userId (guaranteed string) and device_id
        const activeSession = await AuthRepository.getActiveSession(userId, role, device_id);

        if (activeSession) {
          if (!allow_new_device) {
            throw {
              statusCode: 409,
              code: 'DEVICE_CONFLICT',
              message: 'Account is active on another device. Log out from that device?',
            };
          }
          const oldDeviceId = activeSession.device_id;
        }
      }

      if (isExistingUser && role === 'driver') {
        const driverId = (userData as any).driverId || userData?.id;
        if (driverId) {
          const mappedDriver = await DriverRepository.findById(driverId);
          if (mappedDriver) {
            userData = mappedDriver as any;
          }
        }
      }

      // Generate otp and hash it
      const otpLength = role === 'driver' ? 6 : 4;
      const otp = AuthService.genNumericOTP(otpLength);
      const otpHash = await AuthService.hashValue(otp);

      logger.info('------------------------------------------');
      logger.info(`| OTP for ${phone_number} is | ${otp} |`);
      logger.info('------------------------------------------');
      const expires_at = new Date(Date.now() + TTL * 60 * 1000);

      // Save otp hash — attempt_count starts at 0 (no attempts made yet)
      await AuthRepository.saveHashedOtp(
        phone_number,
        role,
        otpHash,
        expires_at,
        0,
        currentRequestCount
      );
      if (userData?.fcm_token) {
        await UserNotifications.otpSent(userData.fcm_token, otp);
      }

      return {
        expiresIn: TTL,
        userexists: isExistingUser,
        userData: userData?.full_name,
        otp: otp,
      };
    } catch (err: any) {
      if (err.statusCode) throw err;
      throw {
        statusCode: 500,
        message: 'Failed to send OTP',
        detail: err?.message || JSON.stringify(err),
      };
    }
  },

  //******************************************************************************
  // ─── Verify OTP Methods ─────────────────────────────────────────────────────
  //******************************************************************************

  async verifyOtp({
    phone_number,
    role,
    otp,
    device_id,
    allow_new_device,
    fcm_token,
    referred_by,
  }: VerifyOtpUser) {
    try {
      // ✅ Sanitize OTP input — trim whitespace to prevent copy-paste issues
      const sanitizedOtp = otp?.trim();
      logger.info(`[OTP-VERIFY] Step 1: Verification attempt for ${phone_number} role=${role}`);

      const { maxAttempts: MaxAttempt, otpBlockDuration } = config.auth;

      // Get otp data
      const otpData = (await AuthRepository.getOtpData(phone_number, role)) as any;
      if (!otpData) {
        logger.warn(`[OTP-VERIFY] FAILED: No OTP record found for ${phone_number} role=${role}`);
        throw {
          statusCode: 400,
          message: 'OTP not found or not requested',
        };
      }

      // Check if blocked
      if (otpData.blocked_until && new Date() < new Date(otpData.blocked_until)) {
        const remainingTime = Math.max(
          1,
          Math.ceil((new Date(otpData.blocked_until).getTime() - Date.now()) / (60 * 1000))
        );
        logger.warn(`[OTP-VERIFY] FAILED: ${phone_number} is blocked for ${remainingTime} more minutes`);
        throw {
          statusCode: 429,
          message: `Account is temporarily locked due to too many failed attempts. Try again after ${remainingTime} minutes.`,
          code: 'TOO_MANY_ATTEMPTS',
        };
      }

      const { otp_hash, expires_at, attempt_count } = otpData;

      // Check expiry
      if (new Date() > new Date(expires_at)) {
        logger.warn(`[OTP-VERIFY] FAILED: OTP expired for ${phone_number} (expired at ${expires_at})`);
        throw {
          statusCode: 400,
          message: 'OTP expired',
        };
      }

      logger.info(`[OTP-VERIFY] Step 2: OTP record valid, attempt_count=${attempt_count}, comparing hash`);

      // Compare otp with hash
      const isMatch = await AuthService.compareHash(sanitizedOtp, otp_hash);

      if (!isMatch) {
        // Increment attempt count (0-based: first failure makes it 1)
        const newAttemptCount = attempt_count + 1;
        await AuthRepository.incrementAttemptCount(phone_number, role);
        logger.warn(`[OTP-VERIFY] FAILED: Hash mismatch for ${phone_number}, attempts now=${newAttemptCount}/${MaxAttempt}`);

        if (newAttemptCount >= MaxAttempt) {
          const blockUntil = new Date(Date.now() + otpBlockDuration * 60 * 1000);
          await AuthRepository.blockUser(phone_number, role, blockUntil);

          // Notify user about being blocked
          const targetFcmToken =
            fcm_token || (await AuthRepository.getUser(phone_number, role))?.fcm_token;
          if (targetFcmToken) {
            if (role === 'driver') {
              await DriverNotifications.tooManyAttempts(targetFcmToken, otpBlockDuration);
            } else {
              await UserNotifications.tooManyAttempts(targetFcmToken, otpBlockDuration);
            }
          }
          throw {
            statusCode: 429,
            message: `Too many failed attempts. Account locked for ${otpBlockDuration} minutes.`,
          };
        }

        throw {
          statusCode: 400,
          message: `Invalid OTP. You have ${MaxAttempt - newAttemptCount} attempts left.`,
        };
      }

      logger.info(`[OTP-VERIFY] Step 3: OTP matched for ${phone_number}, checking user`);

      // Verify existing user
      let userData = await AuthRepository.getUser(phone_number, role);
      let isExistingUser = !!userData;

      if (isExistingUser && role === 'driver') {
        const driverId = (userData as any).driverId || userData?.id;
        if (driverId) {
          const mappedDriver = await DriverRepository.findById(driverId);
          if (mappedDriver) userData = mappedDriver as any;
        }
      }
      // Check active session on another device
      // ✅ Device conflict check — only for DIFFERENT devices
      if (isExistingUser && userData) {
        const userId = (userData.id as string) || (userData as any).driverId;

        if (!userId) {
          throw { statusCode: 500, message: 'User ID not found' };
        }

        // ✅ Exclude current device — same device re-login won't conflict
        const activeSession = await AuthRepository.getActiveSession(userId, role, device_id);

        if (activeSession) {
          if (!allow_new_device) {
            throw {
              statusCode: 409,
              code: 'DEVICE_CONFLICT',
              message: 'Account is active on another device. Log out from that device?',
            };
          }
          const oldDeviceId = activeSession.device_id;
          const oldFcmToken = activeSession.fcm_token;

          await AuthRepository.invalidateAllSessions(userId, role, device_id);

          // ✅ Pass role
          await AuthService.notifyDeviceLogout(userId, oldDeviceId, role, oldFcmToken);
        }
      }

      // Clear otp record
      await AuthRepository.clearOtpRecord(phone_number, role);
      logger.info(`[OTP-VERIFY] Step 4: OTP record cleared for ${phone_number}`);

      // Create new user/driver if not exists
      if (!isExistingUser) {
        logger.info(`[OTP-VERIFY] Step 5: Creating new ${role} for ${phone_number}`);
        userData = (await createNewUser(role, phone_number, device_id, referred_by)) as any;
        if (role === 'driver') {
          try {
            const webhookUrl = `${config.adminBackendUrl}/api/webhooks/driver-events`;
            axios
              .post(
                webhookUrl,
                {
                  eventType: 'NEW_DRIVER',
                  message: `New Driver ${phone_number} Registered`,
                  data: userData,
                },
                {
                  headers: { 'x-api-key': config.internalServiceApiKey },
                }
              )
              .catch((err) => logger.error(`Webhook trigger failed: ${err.message}`));
          } catch (e) {
            // Ignore
          }
        }
        if (!userData?.id) {
          throw { statusCode: 500, message: 'Failed to create user' };
        }
        isExistingUser = false;
      } else if (userData) {
        // Handle transitions for existing users
        let updatedStatus: OnboardingStatus | undefined;
        const currentStatus = userData.onboarding_status;

        if (
          (currentStatus as any) === OnboardingStatus.PENDING ||
          (currentStatus as any) === 'pending' ||
          (currentStatus as any) === 'PENDING'
        ) {
          updatedStatus =
            role === 'driver'
              ? DriverOnboardingStatus.PHONE_VERIFIED
              : (OnboardingStatus.PHONE_VERIFIED as any);
        } else if (
          role === 'customer' &&
          ((currentStatus as any) === OnboardingStatus.PROFILE_COMPLETED ||
            (currentStatus as any) === 'profile_completed')
        ) {
          updatedStatus = OnboardingStatus.COMPLETED;
        }

        if (updatedStatus) {
          const table = role === 'driver' ? 'drivers' : 'users';
          const userId = userData.id || (userData as any).driverId;
          await query(`UPDATE ${table} SET onboarding_status = $1 WHERE id = $2`, [
            updatedStatus,
            userId,
          ]);
          userData.onboarding_status = updatedStatus;
          logger.info(`Onboarding status updated to ${updatedStatus} for ${role} ${userId}`);
        }
      }

      // Generate tokens for ALL users (new and existing)
      let userId: string;
      if (role === 'customer') {
        userId = userData?.id as string;
        if (!userId) {
          throw { statusCode: 500, message: 'User ID missing' };
        }
      } else if (role === 'driver') {
        userId = (userData as any).driverId || userData?.id;
        if (!userId) {
          throw { statusCode: 500, message: 'Driver ID missing' };
        }
      } else {
        throw { statusCode: 500, message: 'Invalid role' };
      }

      const payload: JwtPayload & { id: string; deviceId: string; role: string } = {
        id: userId,
        deviceId: device_id || userData?.device_id || 'unknown',
        role,
      };
      const tokens = AuthService.generateTokens(payload);
      const accessToken = tokens.accessToken;
      const refreshToken = tokens.refreshToken;

      // Welcome back notification for returning driver (> 7 days inactive)
      if (role === 'driver' && isExistingUser && fcm_token) {
        try {
          const lastSessionResult = await query(
            `SELECT last_active FROM user_sessions WHERE user_id = $1 ORDER BY last_active DESC LIMIT 1`,
            [userId]
          );
          if (lastSessionResult.rows.length > 0) {
            const lastActive = new Date(lastSessionResult.rows[0].last_active);
            const daysSinceLastActive = (Date.now() - lastActive.getTime()) / (1000 * 60 * 60 * 24);
            if (daysSinceLastActive > 7) {
               const { notificationService } = require('../../services/notificationService');
               notificationService.sendNotification(
                 fcm_token,
                 'Welcome Back! 👋',
                 "We missed you! Let's get driving and earning today.",
                 { type: 'welcome_back' }
               ).catch((err: any) => logger.error(`Failed to send Welcome Back login notification: ${err.message}`));
            }
          }
        } catch (error: any) {
          logger.error(`Error checking last active for welcome back: ${error.message}`);
        }
      }

      // ✅ Always update device_id in users table
      await AuthRepository.userDeviceIDUpdate(userId, device_id, role, fcm_token);
      logger.info(`[OTP-VERIFY] Step 6: Device ID "${device_id}" updated for ${role} ${userId}`);

      // ✅ Invalidate old sessions for this device tied to OTHER users
      if (device_id) {
        await AuthRepository.invalidateOtherUsersOnDevice(device_id, userId, role);
      }

      // ✅ Always save session — regardless of allow_new_device
      await AuthRepository.upsertSession(userId, device_id, role, refreshToken, fcm_token);
      logger.info(`[OTP-VERIFY] Step 7: Session created for ${role} ${userId} — verification complete`);

      return {
        verified: true,
        userData,
        isNewUser: !isExistingUser,
        accessToken,
        refreshToken,
        onboarding_status:
          userData?.onboarding_status ||
          (role === 'driver'
            ? DriverOnboardingStatus.PHONE_VERIFIED
            : OnboardingStatus.PHONE_VERIFIED), // Ensure status is returned
      };
    } catch (error: any) {
      if (error.statusCode) {
        // Already a structured error — log with code for traceability
        logger.error(`[OTP-VERIFY] Error for ${phone_number}: [${error.statusCode}] ${error.message}`);
        throw error;
      }
      logger.error(`[OTP-VERIFY] Unexpected error for ${phone_number}: ${error.message || error}`);
      throw {
        statusCode: 500,
        message: 'Failed to verify OTP',
        detail: error.message || error,
      };
    }
  },

  generateTokens(payload: JwtPayload & { id: string; deviceId: string; role: string }) {
    const accessTokenOptions: SignOptions = { expiresIn: config.jwt.expiresIn };
    const refreshTokenOptions: SignOptions = { expiresIn: config.jwt.refreshExpiresIn };

    const accessToken = jwt.sign(payload, config.jwt.secret, accessTokenOptions);
    const refreshToken = jwt.sign(payload, config.jwt.refreshSecret, refreshTokenOptions);

    return {
      accessToken,
      refreshToken,
    };
  },

  async refreshAccessToken(refreshToken: string, device_id: string): Promise<string> {
    try {
      const decoded = jwt.verify(refreshToken, config.jwt.refreshSecret) as JwtPayload & {
        id: string;
        role: string;
        deviceId: string;
      };

      if (!decoded?.id && !decoded?.deviceId) {
        throw { statusCode: 401, message: 'Invalid refresh token' };
      }

      // Check if user exists
      let userData = await UserRepository.findById(decoded.id, UserStatus.DELETED);

      if (!userData) {
        const driver = await DriverRepository.findById(decoded.id);
        if (driver) {
          userData = { ...driver, id: driver.driverId } as any;
        }
      }

      if (userData?.device_id !== device_id) {
        throw { statusCode: 404, message: 'Invalid Device login' };
      }

      const inValidUser = isInvalidUser(userData);
      if (!userData?.id || inValidUser) {
        throw { statusCode: 500, message: 'Invalid user record: missing ID' };
      }

      // ✅ Check session exists and is active for this role
      const session = await AuthRepository.getSessionByDevice(decoded.id, decoded.role, device_id);
      if (!session || !session.is_active) {
        throw { statusCode: 401, message: 'Session expired or invalidated' };
      }

      // ✅ Validate refresh token
      const isValid = await AuthRepository.validateRefreshToken(
        decoded.id,
        decoded.role,
        device_id,
        refreshToken
      );
      if (!isValid) {
        throw { statusCode: 401, message: 'Invalid refresh token' };
      }

      // Generate new access token
      const payload: JwtPayload & { id: string; deviceId: string; role: string } = {
        id: userData.id,
        deviceId: device_id,
        role: decoded.role,
      };
      const accessTokenOptions: SignOptions = { expiresIn: config.jwt.expiresIn };
      const newAccessToken = jwt.sign(payload, config.jwt.secret, accessTokenOptions);

      return newAccessToken;
    } catch (error: any) {
      if (error.statusCode) {
        throw error;
      }
      logger.error(`Error in refreshAccessToken: ${error.message || error}`);
      throw { statusCode: 401, message: 'Invalid or expired refresh token' };
    }
  },

  async getMe(userId: string): Promise<User | null> {
    const user = await UserRepository.findById(userId, UserStatus.ACTIVE);
    if (user) return user;

    const driver = await DriverRepository.findById(userId);
    if (driver) {
      return { ...driver, id: driver.driverId } as any;
    }
    return null;
  },

  async getDeletedUser(userId: string, role: string): Promise<User | null> {
    if (role === 'driver') {
      const driver = await DriverRepository.findById(userId);
      if (driver) {
        return { ...driver, id: driver.driverId } as any;
      }
    } else {
      const user = await UserRepository.findById(userId, UserStatus.DELETED);
      if (user) return user;
    }

    return null;
  },

  async verifyUser(phone_number: string, role: UserRole): Promise<boolean> {
    const user = await AuthRepository.getUser(phone_number, role);
    return !!user;
  },

  async signOutUser(id: string, device_id: string, role: string): Promise<boolean> {
    const signOut = await AuthRepository.signOutUser(id, device_id, role);
    return signOut;
  },

  //******************************************************************************
  // ─── Notify Device Logout Methods ─────────────────────────────────────────────
  //******************************************************************************

  async notifyDeviceLogout(userId: string, oldDeviceId: string, role: string, oldFcmToken: string) {
    try {
      if (oldFcmToken) {
        let result;

        // ✅ Send notification based on role
        if (role === 'driver') {
          result = await DriverNotifications.forceLogout(oldFcmToken);
        } else {
          result = await UserNotifications.forceLogout(oldFcmToken);
        }

        // ✅ If token is invalid — remove from DB
        if (!result.success && result.error === 'INVALID_TOKEN') {
          await AuthRepository.clearFcmToken(userId, role, oldDeviceId);
          logger.warn(`Cleared invalid FCM token for user: ${userId} device: ${oldDeviceId}`);
        }
      } else {
        logger.warn(`No FCM token found for user: ${userId} device: ${oldDeviceId}`);
      }

      // ✅ Always set force_logout flag as fallback
      await AuthRepository.setForceLogout(userId, role, oldDeviceId);
      logger.info(`Force logout set for user: ${userId} device: ${oldDeviceId}`);
    } catch (err) {
      logger.error(`notifyDeviceLogout failed: ${err}`);
    }
  },
};
