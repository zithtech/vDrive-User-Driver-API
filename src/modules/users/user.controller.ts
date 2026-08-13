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

  /* ─────────── USER WALLET ─────────── */

  async getWalletBalance(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.params.id as string;
      const user = await UserRepository.findById(userId, 'active');
      return successResponse(res, 200, 'Wallet balance fetched successfully', {
        balance: parseFloat(String(user?.wallet_balance || 0)),
        currency: 'INR',
        has_wallet_pin: !!(user as any)?.wallet_pin,
      });
    } catch (err) {
      next(err);
    }
  },

  async getWalletTransactions(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.params.id as string;
      const limit = parseInt(req.query.limit as string) || 20;
      const transactions = await UserRepository.getWalletTransactions(userId);
      const mapped = transactions.slice(0, limit).map((t: any) => ({
        id: t.id,
        type: t.type || (Number(t.amount) > 0 ? 'WALLET_TOPUP' : 'DEBIT'),
        title: t.description || (Number(t.amount) > 0 ? 'Wallet Top-up' : 'Trip Payment'),
        date: new Date(t.created_at).toLocaleDateString('en-IN'),
        time: new Date(t.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        amount: Number(t.amount),
        status: 'Completed',
        reference_id: t.reference_id,
        createdAt: t.created_at,
      }));
      return successResponse(res, 200, 'Wallet transactions fetched successfully', mapped);
    } catch (err) {
      next(err);
    }
  },

  async setupWalletPin(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.params.id as string;
      const { pin } = req.body;
      await UserService.setupWalletPin(userId, pin);
      return successResponse(res, 200, 'Wallet PIN setup successfully', { success: true });
    } catch (err) {
      next(err);
    }
  },

  async createWalletTopupOrder(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.params.id as string;
      const { amount } = req.body;
      if (!amount || Number(amount) <= 0) throw new Error('Invalid amount');

      const Razorpay = require('razorpay');
      const razorpay = new Razorpay({
        key_id: process.env.RAZORPAY_KEY_ID,
        key_secret: process.env.RAZORPAY_KEY_SECRET,
      });

      const options = {
        amount: Math.round(Number(amount) * 100),
        currency: 'INR',
        receipt: `uwallet_${userId.substring(0, 8)}_${Date.now()}`,
      };

      const order = await razorpay.orders.create(options);
      return successResponse(res, 200, 'Order created successfully', order);
    } catch (err) {
      next(err);
    }
  },

  async verifyWalletTopupPayment(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.params.id as string;
      const { razorpay_order_id, razorpay_payment_id, razorpay_signature, amount } = req.body;

      const crypto = require('crypto');
      const secret = process.env.RAZORPAY_KEY_SECRET as string;
      const generated_signature = crypto
        .createHmac('sha256', secret)
        .update(razorpay_order_id + '|' + razorpay_payment_id)
        .digest('hex');

      if (generated_signature !== razorpay_signature) {
        return res.status(400).json({ success: false, message: 'Invalid payment signature' });
      }

      // Prevent duplicate processing
      const { query: dbQuery } = require('../../shared/database');
      const existing = await dbQuery(
        'SELECT id FROM user_wallet_transactions WHERE reference_id = $1',
        [razorpay_order_id]
      );
      if (existing.rows.length > 0) {
        logger.info(`User wallet topup already processed for order: ${razorpay_order_id}`);
        return successResponse(res, 200, 'Payment already processed', { success: true });
      }

      await UserRepository.addToWallet(
        userId,
        Number(amount),
        'WALLET_TOPUP',
        `Top-up via Razorpay: ${razorpay_order_id}`,
        undefined,
        razorpay_order_id
      );

      return successResponse(res, 200, 'Payment verified and wallet credited', { success: true });
    } catch (err) {
      next(err);
    }
  },

  async payTripWithWallet(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.params.id as string;
      const { amount, pin, trip_id, description } = req.body;

      if (!pin) {
        return res.status(400).json({ success: false, message: 'Wallet PIN is required' });
      }

      const isValidPin = await UserService.verifyWalletPin(userId, pin);
      if (!isValidPin) {
        return res.status(401).json({ success: false, message: 'Invalid Wallet PIN' });
      }

      const user = await UserRepository.findById(userId, 'active');
      if (!user || Number(user.wallet_balance || 0) < Number(amount)) {
        return res.status(400).json({
          success: false,
          message: `Insufficient wallet balance. Need ₹${amount}, have ₹${user?.wallet_balance || 0}`,
        });
      }

      await UserRepository.deductFromWallet(
        userId,
        Number(amount),
        'TRIP_PAYMENT',
        description || `Trip payment (ID: ${trip_id})`
      );

      return successResponse(res, 200, 'Trip payment via wallet successful', { success: true });
    } catch (err) {
      next(err);
    }
  },
};
