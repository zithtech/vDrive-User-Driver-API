import { Joi } from 'celebrate';
import { UserRole, Gender, UserStatus, OnboardingStatus } from '../../enums/user.enums';
import { enumString } from '../../utilities/helper';

export const phoneNumberRule = Joi.string()
  .trim()
  .pattern(/^[0-9]{6,15}$/)
  .required()
  .messages({
    'string.empty': 'Phone number is required.',
    'string.pattern.base': 'Phone number must contain only digits (6–15 digits).',
    'any.required': 'Phone number is required.',
  });

export const roleRule = enumString(Object.values(UserRole)).messages({
  'any.only': 'Role must be one of: customer, driver.',
  'any.required': 'Role is required.',
});

export const emailRule = Joi.string()
  .trim()
  .lowercase()
  .email()
  .allow('', null)
  .optional()
  .messages({
    'string.base': 'Email must be a valid string',
    'string.email': 'Please enter a valid email address',
    'string.empty': 'Email cannot be empty',
  });

export const firstNameRule = Joi.string()
  .trim()
  .min(3)
  .max(30)
  .pattern(/^[a-zA-Z0-9\s]+$/)
  .required()
  .messages({
    'string.pattern.base': 'First Name can contain letters, numbers, and spaces only',
    'string.empty': 'First Name cannot be empty',
    'any.required': 'First Name is required.',
  });

export const lastNameRule = Joi.string()
  .trim()
  .min(1)
  .max(30)
  .pattern(/^[a-zA-Z0-9\s]+$/)
  .allow('', null)
  .optional();



export const genderRule = enumString(Object.values(Gender)).allow('', null).optional().messages({
  'string.base': 'Gender must be a string',
  'any.only': 'Gender must be one of: male, female, other',
  'string.empty': 'Gender cannot be empty',
});

export const alternateContactRule = Joi.string()
  .trim()
  .pattern(/^[0-9]{6,15}$/)
  .allow('', null)
  .optional()
  .messages({
    'string.base': 'Alternate contact number must be a string',
    'string.empty': 'Alternate contact number cannot be empty',
    'string.pattern.base': 'Alternate contact number must contain 6–15 digits',
  });

export const dateOfBirthRule = Joi.string()
  .trim()
  // .pattern(/^(0?[1-9]|[12][0-9]|3[01])[-](0?[1-9]|1[012])[-]\d{4}$/)
  .pattern(/^\d{4}[-](0?[1-9]|1[012])[-](0?[1-9]|[12][0-9]|3[01])$/)
  .allow('', null)
  .optional()
  .messages({
    'string.base': 'Date of birth must be a string',
    'string.empty': 'Date of birth cannot be empty',
    'string.pattern.base': 'Date of birth must be in DD-MM-YYYY format',
  });

export const statusRule = enumString(Object.values(UserStatus))
  .allow('', null)
  .optional()
  .messages({
    'string.base': 'Status must be a string',
    'any.only': 'Status must be one of: pending_verification, active, inactive, blocked, deleted',
    'string.empty': 'Status cannot be empty',
  });

export const idRule = Joi.string().guid({ version: 'uuidv4' }).messages({
  'string.base': 'User ID must be a string',
  'string.uuid': 'User ID must be a valid UUID v4',
  'string.empty': 'User ID cannot be empty',
  'any.required': 'User ID is required',
});

export const deviceIdRule = Joi.string().min(16).max(64).messages({
  'string.base': 'Device ID must be a string',
  'string.empty': 'Device ID cannot be empty',
  'string.min': 'Device ID must be at least 16 characters long',
  'string.max': 'Device ID cannot exceed 64 characters',
  'any.required': 'Device ID is required',
});


const favoritePlaceSchema = Joi.object({
  id: Joi.string().required().messages({
    'any.required': 'Place ID is required',
  }),
  name: Joi.string().required().messages({
    'any.required': 'Location name is required',
  }),
  showname: Joi.string().optional().messages({
    'any.required': 'showname name is required',
  }),
  address: Joi.string().required(),
  lat: Joi.number().min(-90).max(90).required(),
  lng: Joi.number().min(-180).max(180).required(),
});

export const updateFavoritesSchema = Joi.array()
  .items(favoritePlaceSchema)
  .max(10)
  .optional()
  .messages({
    'array.max': 'You can only have up to 10 favorite places',
    'array.base': 'favourite_places must be an array',
  });


export const emergencyContactObject = Joi.object({
  name: Joi.string().required(),
  phone: Joi.string().regex(/^[0-9+]{10,15}$/).required(),
  relationship: Joi.string().required()
});

export const emergencyContactSchema = Joi.array()
  .items(emergencyContactObject)
  .max(3)
  .optional()
  .messages({
    'array.max': 'You can only have up to 3 Emergency Contacts',
    'array.base': 'emergency_contacts must be an array',
  });

export const settingsPreferenceSchema = Joi.object({
  invoice_email: Joi.boolean().required(),
  promo_email: Joi.boolean().required(),
  whatsapp_updates: Joi.boolean().required(),
  push_notifications: Joi.boolean().required(),
  sms_alerts: Joi.boolean().required(),
})
  .required()
  .unknown(false)
  .messages({
    'object.base': 'settings_preferences must be an object',
    'any.required': 'All permission toggles are required for a full update'
  });

export const ProfileUrl = Joi.string().messages({
  'string.base': 'ProfileUrl must be a string',
  'string.empty': 'ProfileUrl cannot be empty',
});

export const onboardingStatusRule = enumString(Object.values(OnboardingStatus)).messages({
  'any.only': 'Onboarding status must be one of: pending, phone_verified, profile_completed, completed',
  'any.required': 'Onboarding status is required',
  'string.empty': 'Onboarding status cannot be empty',
})

export const referralCodeRule = Joi.string()
  .trim()
  .allow(null, '')
  .optional()
  .when(Joi.string().min(1), {
    then: Joi.string().pattern(/^REF_[A-Z0-9]{12}$/),
  })
  .messages({
    'string.pattern.base': 'Invalid referral code format',
    'string.base': 'Referral code must be a string',
  });

export const notesRule = Joi.string().optional().messages({
  'string.base': 'notes must be a string',
});
