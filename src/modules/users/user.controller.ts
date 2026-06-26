import { Request, Response, NextFunction } from 'express';
import { UserService } from './user.service';
import { successResponse } from '../../shared/errorHandler';
import { User } from './user.model';
import { OnboardingStatus, UserStatus } from '../../enums/user.enums';
import { logger } from '../../shared/logger';
import { cleanUndefined, formFullName, generateOTP } from '../../utilities/helper';
import { UserRepository } from './user.repository';
import { notifyAdmin } from '../../shared/eventBus';
import { EmailService } from '../email/email.service';
import { S3Service, s3Service } from '../s3/s3.service';

export const UserController = {
  async getUsers(req: Request, res: Response, next: NextFunction) {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;
      const search = req.query.search as string;

      const { users, total } = await UserService.getUsers(page, limit, search);
      const totalPages = Math.ceil(total / limit);

      return successResponse(res, 200, 'Users fetched successfully', {
        users,
        pagination: {
          page,
          limit,
          total,
          totalPages,
        },
      });
    } catch (err: any) {
      logger.error(`getUsers error: ${err.message}`);
      next(err);
    }
  },

  async getUserById(req: Request, res: Response, next: NextFunction) {
    try {
      const user = await UserService.getUserById(req.params.id as string);
      return successResponse(res, 200, 'User fetched successfully', user);
    } catch (err: any) {
      logger.error(`getUserById error: ${err.message}`);
      next(err);
    }
  },

  async createUser(req: Request, res: Response, next: NextFunction) {
    const otp = generateOTP();
    try {
      const body: User = {
        first_name: req.body.first_name ?? '',
        last_name: req.body.last_name ?? '',
        full_name: formFullName(req.body.first_name, req.body.last_name),
        phone_number: req.body.phone_number,
        alternate_contact: req.body.alternate_contact || '',
        date_of_birth: req.body.date_of_birth || null,
        status: req.body.status || UserStatus.ACTIVE,
        gender: req.body.gender || '',
        email: req.body.email || '',
        device_id: req.body.device_id || '',
        otp: otp,
        created_by: (req as any).adminId,
      };

      const user = await UserService.createUser(body);

      notifyAdmin('NEW_USER_CREATED', {
        id: user.id,
        full_name: user.full_name,
        email: user.email,
        phone_number: user.phone_number,
        status: user.status || 'active',
        updated_at: user.updated_at,
        created_at: user.created_at,
        gender: user.gender,
        role: user.role || 'user',
      });
      return successResponse(res, 200, 'User created successfully', user);
    } catch (err: any) {
      logger.error(`createUser error: ${err.message}`);
      next(err);
    }
  },

  async updateUser(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;

      const existingUser = await UserService.getUserById(id as string);
      if (!existingUser) {
        throw { statusCode: 404, message: 'User not found' };
      }

      const { first_name, last_name, ...rest } = req.body;

      const finalFirstName = first_name ?? existingUser.first_name;
      const finalLastName = last_name ?? existingUser.last_name;

      const updateUserData: Partial<User> = {
        first_name,
        last_name,
        phone_number: rest.phone_number,
        device_id: rest.device_id,
        alternate_contact: rest.alternate_number,
        date_of_birth: rest.date_of_birth,
        status: rest.status,
        gender: rest.gender,
        email: rest.email,
        favourite_places: rest.favourite_places,
        emergency_contacts: rest.emergency_contacts,
        settings_preferences: rest.settings_preferences,
        profile_url: rest.profile_url || '',
        onboarding_status:
          rest.onboarding_status ||
          (existingUser.onboarding_status === OnboardingStatus.PHONE_VERIFIED
            ? OnboardingStatus.COMPLETED
            : existingUser.onboarding_status),
      };

      updateUserData.full_name = formFullName(finalFirstName, finalLastName);
      const updateData = cleanUndefined(updateUserData);
      const updatedUser = await UserService.updateUser(id as string, updateData);

      if (!existingUser.email && updateData.email && existingUser.role !== 'driver') {
        EmailService.sendWelcomeEmail(
          updateData.email,
          updateData.first_name || updatedUser?.full_name || 'Customer'
        ).catch((err) => logger.error(`Welcome email failed for ${updateData.email}: ${err}`));
      }

      return successResponse(res, 200, 'User updated successfully', updatedUser);
    } catch (err: any) {
      logger.error(`updateUser error: ${err.message}`);
      next(err);
    }
  },

  async deleteUser(req: Request, res: Response, next: NextFunction) {
    try {
      const user = await UserService.deleteUser(req.params.id as string);
      return successResponse(res, 200, 'User deleted successfully', user);
    } catch (err: any) {
      logger.error(`deleteUser error: ${err.message}`);
      next(err);
    }
  },

  async blockUser(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const { notes } = req.body;
      const user = await UserService.blockUser(id as string, notes);
      return successResponse(res, 200, 'User blocked successfully', user);
    } catch (err: any) {
      logger.error(`blockUser error: ${err.message}`);
      next(err);
    }
  },

  async unblockUser(req: Request, res: Response, next: NextFunction) {
    try {
      const user = await UserService.unblockUser(req.params.id as string);
      return successResponse(res, 200, 'User unblocked successfully', user);
    } catch (err: any) {
      logger.error(`unblockUser error: ${err.message}`);
      next(err);
    }
  },

  async disableUser(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const { notes } = req.body;
      const user = await UserService.disableUser(id as string, notes);
      return successResponse(res, 200, 'User disabled successfully', user);
    } catch (err: any) {
      logger.error(`disableUser error: ${err.message}`);
      next(err);
    }
  },

  async enableUser(req: Request, res: Response, next: NextFunction) {
    try {
      const user = await UserService.enableUser(req.params.id as string);
      return successResponse(res, 200, 'User enabled successfully', user);
    } catch (err: any) {
      logger.error(`enableUser error: ${err.message}`);
      next(err);
    }
  },

  async suspendUser(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const { notes } = req.body;
      const user = await UserService.suspendUser(id as string, notes);
      return successResponse(res, 200, 'User suspended successfully', user);
    } catch (err: any) {
      logger.error(`suspendUser error: ${err.message}`);
      next(err);
    }
  },

  async unsuspendUser(req: Request, res: Response, next: NextFunction) {
    try {
      const user = await UserService.unsuspendUser(req.params.id as string);
      return successResponse(res, 200, 'User unsuspended successfully', user);
    } catch (err: any) {
      logger.error(`unsuspendUser error: ${err.message}`);
      next(err);
    }
  },

  async searchUsers(req: Request, res: Response, next: NextFunction) {
    try {
      const query = req.query.q as string;
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;

      const { users, total } = await UserService.searchUsers(query, page, limit);
      const totalPages = Math.ceil(total / limit);

      return successResponse(res, 200, 'Users searched successfully', {
        users,
        pagination: {
          page,
          limit,
          total,
          totalPages,
        },
      });
    } catch (err: any) {
      logger.error(`searchUsers error: ${err.message}`);
      next(err);
    }
  },

  async updateToken(req: Request, res: Response) {
    const { fcmToken } = req.body;
    const userId = (req as any).user?.id;
    try {
      await UserRepository.updateFcmToken(userId, fcmToken);
      res.status(200).json({ status: 'success', message: 'Token updated' });
    } catch (error) {
      res.status(500).json({ status: 'error', message: 'Database update failed' });
    }
  },

  async getUploadUrl(req: Request, res: Response, next: NextFunction) {
    try {
      const { userid } = req.params;
      const { documentType, contentType } = req.body;

      const key = `user-profiles/${userid}/${documentType}`;
      const result = await s3Service.getUploadUrl(key, contentType);

      return successResponse(res, 200, 'Upload URL generated successfully', result);
    } catch (error) {
      next(error);
    }
  },

  async deleteDocument(req: Request, res: Response, next: NextFunction) {
    try {
      const { userid } = req.params;
      const { documentType } = req.body;
      const key = `user-profiles/${userid}/${documentType}`;
      const result = await s3Service.deleteFile(key as string);
      return successResponse(res, 200, 'Document deleted successfully', result);
    } catch (err: any) {
      logger.error(`deleteDocument error: ${err.message}`);
      next(err);
    }
  },
};
