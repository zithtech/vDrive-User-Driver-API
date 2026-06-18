import { celebrate, Segments, Joi } from 'celebrate';
import { User } from '../modules/users/user.model';
import { UserStatus } from '../enums/user.enums';

export const validateBody = (schema: ReturnType<typeof Joi.object>) =>
  celebrate({
    [Segments.BODY]: schema,
  });

export const validateParams = (schema: ReturnType<typeof Joi.object>) =>
  celebrate({
    [Segments.PARAMS]: schema,
  });

export const validateQuery = (schema: ReturnType<typeof Joi.object>) =>
  celebrate({
    [Segments.QUERY]: schema,
  });

export const isInvalidUser = (user?: User | null): boolean => {
  if (!user?.id) return true;
  const inactiveStatuses = [UserStatus.DELETED, UserStatus.BLOCKED];
  return inactiveStatuses.includes(user.status);
};

export const formFullName = (first_name: string, last_name: string): string => {
  return [first_name.trim(), last_name.trim()].filter(Boolean).join(' ');
};

export const cleanUndefined = <T extends object>(obj: T): Partial<T> => {
  const cleanObj = { ...obj };
  Object.keys(cleanObj).forEach((key) => {
    const typedKey = key as keyof T;
    if (cleanObj[typedKey] === undefined) delete cleanObj[typedKey];
  });
  return cleanObj;
};

export const enumString = (values: any[]) =>
  Joi.string()
    .valid(...values)
    .required();

// src/utilities/helper.ts

export function parseQueryInt(value: string | undefined, defaultValue: number): number {
  if (!value) return defaultValue;
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? defaultValue : parsed;
}

export function generateOTP() {
  return Math.floor(1000 + Math.random() * 9000).toString();
}
