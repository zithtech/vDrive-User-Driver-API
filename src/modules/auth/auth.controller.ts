import { Request, Response, NextFunction } from 'express';
import { AuthService } from './auth.service';
import { successResponse } from '../../shared/errorHandler';
import { logger } from '../../shared/logger';
import config from '../../config';
import jwt from 'jsonwebtoken';
import { User } from '../users/user.model';
import { UserStatus, UserRole, OnboardingStatus } from '../../enums/user.enums';
import { UserService } from '../users/user.service';
import { formFullName, generateOTP } from '../../utilities/helper';
import { notifyAdmin } from '../../sockets/admin-socket.service';
import { AuthRepository } from './auth.repository';
import { DriverRepository } from '../drivers/driver.repository';
import { query } from '../../shared/database';


interface AuthRequest extends Request {
  user?: { id: string };
}

export const AuthController = {
  async requestOtp(req: Request, res: Response, next: NextFunction): Promise<void> {
    const { phone_number, role, device_id, allow_new_device } = req.body;

    try {
      logger.info(`OTP request received for: ${phone_number || 'unknown'}`);

      if (!phone_number?.trim()) {
        throw { statusCode: 400, message: 'Phone number is required' };
      }

      const result = await AuthService.requestOtp({
        phone_number,
        role,
        device_id,
        allow_new_device,
      });

      logger.info(`OTP sent successfully to: ${phone_number}`);

      successResponse(res, 200, 'OTP sent successfully', {
        expiresIn: result.expiresIn,
        otp: result.otp,
        exists: result.userexists,
        userName: result.userData
      });
    } catch (error: any) {
      logger.warn(`OTP send failed for ${phone_number || 'unknown'}: ${error.detail}`);
      next(error);
    }
  },

  async verifyOtp(req: Request, res: Response, next: NextFunction): Promise<void> {
    const { phone_number, role, otp, device_id, allow_new_device, fcm_token, referred_by } = req.body;

    try {
      logger.info(`OTP verification attempt for: ${phone_number || 'unknown'} (Referral: ${referred_by || 'none'})`);

      if (!phone_number?.trim()) {
        throw { statusCode: 400, message: 'Phone number is required' };
      }

      const result = await AuthService.verifyOtp({
        phone_number,
        role,
        otp,
        device_id,
        allow_new_device,
        fcm_token,
        referred_by,
      });

      logger.info(`OTP sent successfully to: ${phone_number}`);

      successResponse(res, 200, 'OTP Verified successfully', {
        ...result,
      });
    } catch (error: any) {
      logger.warn(`OTP send failed for ${phone_number || 'unknown'}: ${error.message}`);
      next(error);
    }
  },


  async refreshAccessToken(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { refreshToken, device_id } = req.body;

      if (!refreshToken) {
        logger.warn('Refresh token not found in body');
        throw { statusCode: 401, message: 'Refresh token not found in body' };
      }

      logger.info('Access token refresh attempt');
      const newAccessToken = await AuthService.refreshAccessToken(refreshToken, device_id);

      const decoded = jwt.verify(newAccessToken, config.jwt.secret) as any;
      if (decoded?.id && decoded?.deviceId) {
        logger.info(
          `Token refreshed successfully for User ID: ${decoded.id} and Device Id: ${decoded?.deviceId}`
        );
      }

      successResponse(res, 200, 'Access token refreshed successfully', {
        accessToken: newAccessToken,
        expiresIn: config.jwt.expiresIn,
      });
    } catch (error: any) {
      logger.warn(`Token refresh failed: ${error.message}`);
      next(error);
    }
  },

  async getMe(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user?.id;

      if (!userId) {
        logger.warn('getMe called without user ID');
        throw { statusCode: 401, message: 'User not authenticated' };
      }

      logger.info(`Fetching profile for user ID: ${userId}`);
      const userProfile = await AuthService.getMe(userId);
      logger.info(`User fetched successfully: ${JSON.stringify(userProfile)}`);

      if (!userProfile) {
        logger.warn(`User not found for ID: ${userId}`);
        throw { statusCode: 404, message: 'User not found' };
      }

      logger.info(`Profile fetched successfully for user ID: ${userId}`);
      successResponse(res, 200, 'User profile retrieved successfully', userProfile);
    } catch (error: any) {
      logger.error(`getMe error: ${error.message}`);
      next(error);
    }
  },

  async getDeletedUser(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user?.id;
      const role = req.body.role;

      if (!userId) {
        logger.warn('getDeletedUser called without user ID');
        throw { statusCode: 401, message: 'User not authenticated' };
      }

      logger.info(`Fetching deleted user profile for ID: ${userId}`);
      const userProfile = await AuthService.getDeletedUser(userId, role);

      if (!userProfile) {
        logger.warn(`Deleted user not found for ID: ${userId}`);
        throw { statusCode: 404, message: 'User not found' };
      }

      logger.info(`Deleted user profile fetched successfully for ID: ${userId}`);
      successResponse(res, 200, 'Deleted user profile retrieved successfully', userProfile);
    } catch (error: any) {
      logger.error(`getDeletedUser error: ${error.message}`);
      next(error);
    }
  },

  async signUp(req: Request, res: Response, next: NextFunction): Promise<void> {
    const otp = generateOTP();
    try {
      const {
        first_name,
        last_name,
        phone_number,
        alternate_contact,
        date_of_birth,
        role,
        gender,
        email,
        status,
        device_id,
        referral_code,
      } = req.body;

      // check if user already exists
      const exists = await AuthService.verifyUser(phone_number, role);
      if (exists) {
        throw { statusCode: 409, message: 'User already exists' };
      }

      const body: User = {
        first_name: first_name ?? '',
        last_name: last_name ?? '',
        full_name: formFullName(first_name, last_name),
        phone_number: phone_number ?? '',
        alternate_contact: alternate_contact ?? null,
        date_of_birth: date_of_birth ?? null,
        role,
        gender: gender ?? null,
        email: email ?? null,
        status: status ?? UserStatus.ACTIVE,
        device_id: device_id ?? '',
        onboarding_status: OnboardingStatus.PROFILE_COMPLETED,
        referral_code: referral_code ?? null,
        otp: otp,
      };

      const newUser = await UserService.createUser(body);
      notifyAdmin('NEW_USER_CREATED', {
        id: newUser.id,
        full_name: newUser.full_name,
        email: newUser.email,
        phone_number: newUser.phone_number,
        status: newUser.status || 'active',
        updated_at: newUser.updated_at,
        created_at: newUser.created_at,
        gender: newUser.gender,
        role: newUser.role || 'user',
      });

      successResponse(res, 201, 'User created successfully', newUser);
    } catch (error: any) {
      logger.warn(`User creation failed: ${error.message}`);
      next(error);
    }
  },

  async driverSignUp(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const {
        first_name,
        last_name,
        phone_number,
        alternate_contact,
        date_of_birth,
        gender,
        email,
        device_id,
      } = req.body;

      // Force role to driver
      const role = UserRole.DRIVER;

      // check if driver already exists
      const exists = await AuthService.verifyUser(phone_number, role);
      if (exists) {
        throw { statusCode: 409, message: 'Driver already exists' };
      }

      const body: User = {
        first_name: first_name ?? '',
        last_name: last_name ?? '',
        full_name: formFullName(first_name, last_name),
        phone_number: phone_number ?? '',
        alternate_contact: alternate_contact ?? null,
        date_of_birth: date_of_birth ?? null,
        role,
        gender: gender ?? null,
        email: email ?? null,
        status: UserStatus.ACTIVE,
        device_id: device_id ?? '',
      };

      const newDriver = await UserService.createUser(body);

      successResponse(res, 201, 'Driver created successfully', newDriver);
    } catch (error: any) {
      logger.warn(`Driver creation failed: ${error.message}`);
      next(error);
    }
  },

  async driverLogin(req: Request, res: Response, next: NextFunction): Promise<void> {
    const { phone_number, otp, device_id, fcm_token, referred_by } = req.body;

    try {
      logger.info(`Driver login request received for: ${phone_number || 'unknown'} (Referral: ${referred_by || 'none'})`);

      if (!phone_number?.trim()) {
        throw { statusCode: 400, message: 'Phone number is required' };
      }

      const result = await AuthService.verifyOtp({
        phone_number,
        role: UserRole.DRIVER,
        otp,
        device_id,
        allow_new_device: true,
        fcm_token,
        referred_by,
      });

      logger.info(`Driver login successful for: ${phone_number}`);

      successResponse(res, 200, 'Driver login successful', {
        ...result,
      });
    } catch (error: any) {
      logger.warn(`Driver login failed for ${phone_number || 'unknown'}: ${error.message}`);
      next(error);
    }
  },

  async signOut(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const { device_id, role } = req.body;
      await AuthService.signOutUser(id as string, device_id, role);
      successResponse(res, 200, 'User sign out successfully');
    } catch (error: any) {
      logger.warn(`User creation failed: ${error.message}`);
      next(error);
    }
  },


  // auth.controller.ts
  async validateSession(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req as any).user?.id;
      const role = (req as any).user?.role;
      const device_id = req.headers['x-device-id'] as string;

      if (!userId) {
        return res.status(401).json({
          success: false,
          code: 'UNAUTHORIZED',
          message: 'Invalid token',
        });
      }

      // ✅ 1. Check force_logout flag
      if (device_id) {
        const shouldForceLogout = await AuthRepository.checkForceLogout(
          userId,
          role as string,
          device_id
        );
        if (shouldForceLogout) {
          return res.status(401).json({
            success: false,
            code: 'FORCE_LOGOUT',
            message: 'Session ended from another device',
          });
        }
      }

      // ✅ 2. Check active session exists
      const session = await AuthRepository.getSessionByDevice(userId, role as string, device_id);
      if (!session || !session.is_active) {
        return res.status(401).json({
          success: false,
          code: 'SESSION_EXPIRED',
          message: 'Session not found or expired',
        });
      }

      // ✅ 3. Get user data
      let userData;
      if (role === 'driver') {
        userData = await DriverRepository.findById(userId);
      } else {
        const result = await query(
          `SELECT * FROM users WHERE id = $1 LIMIT 1`,
          [userId]
        );
        userData = result.rows[0];
      }

      if (!userData) {
        return res.status(404).json({
          success: false,
          code: 'USER_NOT_FOUND',
          message: 'User not found',
        });
      }

      // ✅ 4. Check user status
      const userStatus = role === 'driver' ? userData.status : userData.status; // Both use .status
      if (userStatus === 'banned' || userStatus === 'deleted') {
        return res.status(403).json({
          success: false,
          code: 'ACCOUNT_DISABLED',
          message: 'Your account has been disabled',
        });
      }

      // ✅ 5. Update last_active
      await query(
        `UPDATE user_sessions
       SET last_active = NOW()
       WHERE user_id = $1 AND device_id = $2`,
        [userId, device_id]
      );

      return successResponse(res, 200, 'Session valid', userData);

    } catch (err) {
      next(err);
    }
  },
};
