import { AuthRepository } from './auth.repository';
import { logger } from '../../shared/logger';
import jwt from 'jsonwebtoken';
import config from '../../config';

export const authMiddleware = async (req: any, res: any, next: any) => {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'No token provided' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, config.jwt.secret) as any;
    req.user = decoded;

    // ✅ Check force_logout on every API call
    const device_id = req.headers['x-device-id'] as string;

    if (decoded.id && device_id) {
      const shouldForceLogout = await AuthRepository.checkForceLogout(
        decoded.id,
        decoded.role,
        device_id
      );

      if (shouldForceLogout) {
        logger.warn(`Force logout triggered for user: ${decoded.id} device: ${device_id}`);
        return res.status(401).json({
          success: false,
          code: 'FORCE_LOGOUT',
          message: 'You have been logged out from this device.',
        });
      }
    }

    next();
  } catch {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
};
