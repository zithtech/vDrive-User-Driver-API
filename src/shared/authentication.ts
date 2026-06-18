import { Request, Response, NextFunction } from 'express';
import jwt, { JwtPayload } from 'jsonwebtoken';
import { UserRepository } from '../modules/users/user.repository';
import { User } from '../modules/users/user.model';

interface AuthRequest extends Request {
  user?: User;
}

const isAuthenticated = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    // Perfect method: Bearer token in Authorization header
    const token = req.headers.authorization?.replace('Bearer ', '');

    if (!token) {
      return res.status(401).json({
        statusCode: 401,
        success: false,
        message: 'Unauthorized: No access token provided',
        code: 'NO_ACCESS_TOKEN',
      });
    }

    // jwt.verify handles expiry + invalid signature
    const decoded = jwt.verify(token, process.env.JWT_SECRET as string) as JwtPayload & {
      id: string;
    };

    if (!decoded?.id) {
      return res.status(401).json({
        statusCode: 401,
        success: false,
        message: 'Invalid access token',
        code: 'INVALID_TOKEN',
      });
    }

    // Optimized: Don't query user from database for every request
    // User ID is embedded in JWT payload - no DB query needed!
    req.user = { id: decoded.id } as any;

    next();
  } catch (err: any) {
    // More specific error messages for different JWT errors
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({
        statusCode: 401,
        success: false,
        message: 'Access token expired',
        code: 'TOKEN_EXPIRED',
        shouldRefresh: true,
      });
    } else if (err.name === 'JsonWebTokenError') {
      return res.status(401).json({
        statusCode: 401,
        success: false,
        message: 'Invalid access token',
        code: 'INVALID_TOKEN_FORMAT',
      });
    } else {
      return res.status(401).json({
        statusCode: 401,
        success: false,
        message: 'Unauthorized: Token verification failed',
        code: 'TOKEN_VERIFICATION_FAILED',
      });
    }
  }
};

export default isAuthenticated;
