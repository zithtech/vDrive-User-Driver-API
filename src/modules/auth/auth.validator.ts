import { Joi } from 'celebrate';
import { phoneNumberRule, roleRule, deviceIdRule } from '../../validations/schema/common.schema';
import {
  otpRule,
  refreshTokenRule,
  allowNewDeviceRule,
  fcmTokenRule,
} from '../../validations/schema/auth.schema';

export const AuthValidation = {
  requestOtpValidation: Joi.object().keys({
    phone_number: phoneNumberRule,
    role: roleRule,
    device_id: deviceIdRule,
    allow_new_device: allowNewDeviceRule,
    fcm_token: fcmTokenRule,
  }),

  verifyOtpValidation: Joi.object().keys({
    phone_number: phoneNumberRule,
    role: roleRule,
    otp: otpRule,
    device_id: deviceIdRule,
    allow_new_device: allowNewDeviceRule,
    fcm_token: fcmTokenRule,
    referred_by: Joi.string().allow('', null).optional(),
  }),

  refreshTokenValidation: Joi.object({
    refreshToken: refreshTokenRule,
    device_id: deviceIdRule,
  }),

};
