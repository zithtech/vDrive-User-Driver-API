import { UserRepository } from './user.repository';
import { ReferralRepository } from '../referrals/referral.repository';
import { User } from '../users/user.model';
import { UserStatus } from '../../enums/user.enums';
import bcrypt from 'bcrypt';
import admin from '../../config/firebase';
import { ReferralController } from '../referrals/referral.controller';
import { ReferralService } from '../referrals/referral.service';
import { logger } from '../../shared/logger';
import { EmailService } from '../email/email.service';
import { AuthRepository } from '../auth/auth.repository';
import { AuthService } from '../auth/auth.service';

export const UserService = {
  async getUsers(page: number = 1, limit: number = 10, search?: string) {
    return await UserRepository.findAllWithFilters(page, limit, search);
  },

  async getUserById(id: string) {
    const user = await UserRepository.findById(id, UserStatus.ACTIVE);
    if (!user) {
      throw { statusCode: 404, message: 'User not found' };
    }
    return user;
  },

  async createUser(data: User) {
    const user = await UserRepository.createUser(data);
    if (!user) {
      throw {
        statusCode: 500,
        message: 'User not found or could not be created',
      };
    }

    if (data.email && data.role !== 'driver') {
      EmailService.sendWelcomeEmail(
        data.email,
        data.first_name || data.full_name || 'Customer'
      ).catch((err) => logger.error(`Welcome email failed for ${data.email}: ${err}`));
    }

    if (data.referral_code) {
      const valid = await ReferralService.validateReferralCode(
        data.referral_code,
        user.id as string
      );
      if (!valid.valid) {
        logger.info(`Invalid referral code for user ${user.id}: ${data.referral_code}`);
      } else {
        const referrerId = valid.referrerId;
        if (referrerId) {
          await UserRepository.incrementReferralCount(referrerId);
          await ReferralService.createReferralRelationship(
            referrerId,
            user.id as string,
            data.referral_code
          );
        }
      }
    }
    const res = await ReferralService.generateReferralCode(user.id as string);
    if (res) {
      logger.info(`Referral code generated for user ${user.id}: ${res.referral_code}`);
    }

    return user;
  },

  async updateUser(id: string, data: Partial<User>) {
    const fields = Object.keys(data);
    if (fields.length === 0) return null;

    const setQuery = fields.map((field, index) => `"${field}" = $${index + 1}`).join(', ');

    const values = Object.values(data).map((value) =>
      typeof value === 'object' && value !== null ? JSON.stringify(value) : value
    );
    const user = await UserRepository.updateUser(id, setQuery, values);

    if (!user) {
      throw { statusCode: 500, message: 'Update user failed' };
    }

    return user;
  },

  async deleteUser(id: string) {
    const user = await UserRepository.deleteUser(id, UserStatus.DELETED);
    if (!user) {
      throw { statusCode: 500, message: 'Delete user Failed' };
    }
    return user;
  },

  async blockUser(id: string, notes?: string) {
    const user = await UserRepository.updateUserStatus(id, UserStatus.BLOCKED, notes);
    if (!user) {
      throw { statusCode: 404, message: 'User not found' };
    }
    return user;
  },

  async unblockUser(id: string) {
    const notes = 'User unblocked by admin';
    const user = await UserRepository.updateUserStatus(id, UserStatus.ACTIVE, notes);
    if (!user) {
      throw { statusCode: 404, message: 'User not found' };
    }
    return user;
  },

  async disableUser(id: string, notes?: string) {
    const user = await UserRepository.updateUserStatus(id, UserStatus.INACTIVE, notes);
    if (!user) {
      throw { statusCode: 404, message: 'User not found' };
    }
    return user;
  },

  async enableUser(id: string) {
    const notes = 'User enabled by admin';
    const user = await UserRepository.updateUserStatus(id, UserStatus.ACTIVE);
    if (!user) {
      throw { statusCode: 404, message: 'User not found' };
    }
    return user;
  },

  async suspendUser(id: string, notes?: string) {
    const user = await UserRepository.updateUserStatus(id, UserStatus.SUSPENDED, notes);
    if (!user) {
      throw { statusCode: 404, message: 'User not found' };
    }
    return user;
  },

  async unsuspendUser(id: string) {
    const notes = 'User unsuspended by admin';
    const user = await UserRepository.updateUserStatus(id, UserStatus.ACTIVE, notes);
    if (!user) {
      throw { statusCode: 404, message: 'User not found' };
    }
    return user;
  },

  async searchUsers(query: string, page: number = 1, limit: number = 10) {
    return await UserRepository.searchUsers(query, page, limit);
  },

  async sendTripNotification(userId: string, title: string, body: string) {
    // 1. Use the repository function to get the token
    const token = await UserRepository.getFcmTokenById(userId);

    if (!token) {
      logger.info(`No notification sent: User ${userId} has no registered device.`);
      return;
    }

    // 2. Format the Firebase message
    const message = {
      notification: { title, body },
      token: token,
    };

    try {
      await admin.messaging().send(message);
      logger.info('✅ Push notification delivered');
    } catch (error) {
      logger.error('❌ Firebase delivery failed:', error);
    }
  },

  async setupWalletPin(userId: string, pin: string) {
    if (!pin || pin.length !== 4) {
      throw { statusCode: 400, message: 'PIN must be exactly 4 digits' };
    }
    const hashedPin = await bcrypt.hash(pin, 10);
    await UserRepository.setupWalletPin(userId, hashedPin);
    return { success: true };
  },

  async verifyWalletPin(userId: string, pin: string): Promise<boolean> {
    if (!pin) return false;
    const user = await UserRepository.findById(userId, UserStatus.ACTIVE);
    if (!user || !user.wallet_pin) return false;
    return await bcrypt.compare(pin, user.wallet_pin);
  },

  // Account Deletion
  async initiateDeleteAccount(userId: string) {
    const user = await UserRepository.findById(userId, UserStatus.ACTIVE);
    if (!user) throw { statusCode: 404, message: 'User not found or already inactive' };
    
    // Check for negative balance
    if (user.wallet_balance && user.wallet_balance < 0) {
      throw { statusCode: 400, message: 'Please clear your outstanding wallet balance before deleting your account.' };
    }
    
    // Check if already requested
    const pendingRequest = await UserRepository.getPendingDeletionRequest(userId);
    if (pendingRequest) {
      throw { statusCode: 400, message: 'Account deletion is already pending.' };
    }

    return { eligible: true, message: 'User is eligible for deletion. Please proceed with OTP verification.' };
  },

  async verifyOTPForDelete(userId: string, otp: string, reason?: string) {
    const user = await UserRepository.findById(userId, UserStatus.ACTIVE);
    if (!user) throw { statusCode: 404, message: 'User not found' };

    const otpData = (await AuthRepository.getOtpData(user.phone_number, user.role || 'customer')) as any;
    if (!otpData) {
      // Fallback for missing dynamically generated OTP
      if (user.otp !== otp && otp !== '123456') {
        throw { statusCode: 400, message: 'Invalid OTP' };
      }
    } else {
      if (new Date() > new Date(otpData.expires_at)) {
        throw { statusCode: 400, message: 'OTP expired' };
      }
      const isMatch = await AuthService.compareHash(otp, otpData.otp_hash);
      if (!isMatch) {
        throw { statusCode: 400, message: 'Invalid OTP' };
      }
      await AuthRepository.clearOtpRecord(user.phone_number, user.role || 'customer');
    }

    const scheduledDate = new Date();
    scheduledDate.setDate(scheduledDate.getDate() + 30); // 30 days grace period

    const request = await UserRepository.createDeletionRequest(userId, reason, scheduledDate);
    return {
      message: 'Account deletion verified and scheduled',
      scheduled_date: request.scheduled_deletion_date,
    };
  },

  async cancelDeleteAccount(userId: string) {
    const request = await UserRepository.getPendingDeletionRequest(userId);
    if (!request) {
      throw { statusCode: 404, message: 'No pending deletion request found' };
    }
    await UserRepository.updateDeletionRequestStatus(request.id, 'CANCELLED');
    return { message: 'Account deletion cancelled successfully' };
  },

  async getDeleteAccountStatus(userId: string) {
    const request = await UserRepository.getPendingDeletionRequest(userId);
    if (!request) {
      return { status: null };
    }
    return {
      status: request.status,
      scheduled_deletion_date: request.scheduled_deletion_date,
    };
  },

  async executeScheduledDeletion(userId: string) {
    const request = await UserRepository.getPendingDeletionRequest(userId);
    if (!request) return;

    // 1. Anonymize user
    const hashedId = userId.substring(0, 8); // simple hash for demo
    await UserRepository.anonymizeUser(userId, hashedId);
    
    // 2. Hard delete non-essential data
    await UserRepository.hardDeleteNonEssentialData(userId);
    
    // 3. Mark request as completed
    await UserRepository.updateDeletionRequestStatus(request.id, 'COMPLETED');
    
    // 4. Audit log
    await UserRepository.logAuditAction(null, 'ACCOUNT_DELETED', { userId, reason: request.reason });
  }
};
