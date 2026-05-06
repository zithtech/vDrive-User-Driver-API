import { UserRepository } from './user.repository';
import { ReferralRepository } from '../referrals/referral.repository';
import { User } from '../users/user.model';
import { UserStatus } from '../../enums/user.enums';
import admin from '../../config/firebase';
import { ReferralController } from '../referrals/referral.controller';
import { ReferralService } from '../referrals/referral.service';
import { logger } from '../../shared/logger';

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
    if (data.referral_code) {
      const valid = await ReferralService.validateReferralCode(data.referral_code, user.id as string)
      if(!valid.valid){
        logger.info(`Invalid referral code for user ${user.id}: ${data.referral_code}`);
      }
      else{
        const referrerId = valid.referrerId
        if (referrerId) {
          await UserRepository.incrementReferralCount(referrerId);
          await ReferralService.createReferralRelationship(referrerId, user.id as string ,data.referral_code) ;
        }
      }
    }
    const res = await ReferralService.generateReferralCode(user.id as string);
    if(res){
      logger.info(`Referral code generated for user ${user.id}: ${res.referral_code}`);
    }

    return user;
  },

  async updateUser(id: string, data: Partial<User>) {
    const fields = Object.keys(data);
    if (fields.length === 0) return null;

    const setQuery = fields.map((field, index) => `"${field}" = $${index + 1}`).join(', ');

    const values = Object.values(data).map(value =>
      (typeof value === 'object' && value !== null) ? JSON.stringify(value) : value
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

  async blockUser(id: string) {
    const user = await UserRepository.updateUserStatus(id, UserStatus.BLOCKED);
    if (!user) {
      throw { statusCode: 404, message: 'User not found' };
    }
    return user;
  },

  async unblockUser(id: string) {
    const user = await UserRepository.updateUserStatus(id, UserStatus.ACTIVE);
    if (!user) {
      throw { statusCode: 404, message: 'User not found' };
    }
    return user;
  },

  async disableUser(id: string) {
    const user = await UserRepository.updateUserStatus(id, UserStatus.INACTIVE);
    if (!user) {
      throw { statusCode: 404, message: 'User not found' };
    }
    return user;
  },

  async enableUser(id: string) {
    const user = await UserRepository.updateUserStatus(id, UserStatus.ACTIVE);
    if (!user) {
      throw { statusCode: 404, message: 'User not found' };
    }
    return user;
  },

  async suspendUser(id: string) {
    const user = await UserRepository.updateUserStatus(id, UserStatus.SUSPENDED);
    if (!user) {
      throw { statusCode: 404, message: 'User not found' };
    }
    return user;
  },

  async unsuspendUser(id: string) {
    const user = await UserRepository.updateUserStatus(id, UserStatus.ACTIVE);
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
  }
};
