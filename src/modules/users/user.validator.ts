import { Joi } from 'celebrate';
import * as commonSchema from '../../validations/schema/common.schema';
import { UserRole } from '../../enums/user.enums';

export const UserValidation = {
  idValidation: Joi.object().keys({
    id: commonSchema.idRule,
  }),

  createUserValidation: Joi.object().keys({
    first_name: commonSchema.firstNameRule,
    last_name: commonSchema.lastNameRule,
    phone_number: commonSchema.phoneNumberRule,
    alternate_contact: commonSchema.alternateContactRule,
    role: commonSchema.roleRule,
    gender: commonSchema.genderRule,
    date_of_birth: commonSchema.dateOfBirthRule,
    status: commonSchema.statusRule,
    email: commonSchema.emailRule,
    device_id: commonSchema.deviceIdRule,
    onboarding_status: commonSchema.onboardingStatusRule.optional(),
    referral_code: commonSchema.referralCodeRule.optional(),
    referred_by: Joi.string().allow('', null).optional(),
  }),

  updateUserValidation: Joi.object({
    first_name: commonSchema.firstNameRule.optional(),
    last_name: commonSchema.lastNameRule.optional(),
    phone_number: commonSchema.phoneNumberRule.optional(),
    profile_url: commonSchema.ProfileUrl.optional(),
    alternate_contact: commonSchema.alternateContactRule.optional(),
    role: commonSchema.roleRule.optional(),
    gender: commonSchema.genderRule.optional(),
    date_of_birth: commonSchema.dateOfBirthRule.optional(),
    status: commonSchema.statusRule.optional(),
    email: commonSchema.emailRule.optional(),
    device_id: commonSchema.deviceIdRule.optional(),
    favourite_places: commonSchema.updateFavoritesSchema.optional(),
    emergency_contacts: commonSchema.emergencyContactSchema.optional(),
    settings_preferences: commonSchema.settingsPreferenceSchema.optional(),
    onboarding_status: commonSchema.onboardingStatusRule.optional(),
    referral_code: commonSchema.referralCodeRule.optional(),
    notes: commonSchema.notesRule.optional(),
    referred_by: Joi.string().allow('', null).optional(),
  })
    .min(1)
    .messages({
      'object.min': 'At least one field must be provided to update user',
    }),

  searchValidation: Joi.object().keys({
    q: Joi.string().min(1).max(100).required(),
    page: Joi.number().integer().min(1).optional(),
    limit: Joi.number().integer().min(1).max(100).optional(),
  }),
};
