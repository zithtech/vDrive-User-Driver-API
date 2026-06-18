import dotenv from 'dotenv';
import { SignOptions } from 'jsonwebtoken';

dotenv.config();

interface Config {
  port: number;
  nodeEnv: string;
  redis: {
    url: string;
  };
  db: {
    host: string;
    port: number;
    user: string;
    password: string;
    name: string;
    sslMode: string;
    channelBinding: string;
  };
  jwt: {
    secret: string;
    expiresIn: SignOptions['expiresIn'];
    refreshSecret: string;
    refreshExpiresIn: SignOptions['expiresIn'];
  };
  prodURL: string;
  adminApiUrl: string;
  awsServiceUrl: string;
  email: {
    service: string;
    user: string;
    pass: string;
    from: string;
  };
  auth: {
    otpExpiryTime: number;
    maxAttempts: number;
    otpRequestLimit: number;
    otpRequestWindow: number;
    otpBlockDuration: number;
  };
  internalServiceApiKey: string;
  adminBackendUrl: string;
  adminInternalSocketUrl: string;
  referralDownloadUrl: string;
  defaultSearchRadius: number;
  avgSpeedMetersPerMin: number;
}

const config: Config = {
  port: Number(process.env.PORT) || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',
  redis: {
    url: process.env.REDIS_URL || '',
  },
  db: {
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT) || 5432,
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'password',
    name: process.env.DB_NAME || 'mydb',
    sslMode: process.env.PGSSLMODE || '',
    channelBinding: process.env.PGCHANNELBINDING || '',
  },
  jwt: {
    secret: process.env.JWT_SECRET || '',
    expiresIn: (process.env.JWT_EXPIRES_IN || '1h') as SignOptions['expiresIn'],
    refreshSecret: process.env.JWT_REFRESH_SECRET || 'refresh-secret',
    refreshExpiresIn: (process.env.JWT_REFRESH_EXPIRES_IN || '7d') as SignOptions['expiresIn'],
  },
  prodURL: process.env.PROD_URL || 'http://localhost:3000',
  adminApiUrl: process.env.ADMIN_API_URL || 'http://localhost:3000',
  awsServiceUrl: process.env.AWS_SERVICE_URL || 'http://localhost:1235',
  email: {
    service: process.env.EMAIL_SERVICE || 'gmail',
    user: process.env.EMAIL_USER || '',
    pass: process.env.EMAIL_PASS || '',
    from: process.env.SMTP_USER || '',
  },
  auth: {
    otpExpiryTime: Number(process.env.OTP_EXPIRY_TIME) || 5, // minutes
    maxAttempts: Number(process.env.MAX_ATTEMPTS) || 3, // failure attempts
    otpRequestLimit: Number(process.env.OTP_REQUEST_LIMIT) || 3, // max requests in window
    otpRequestWindow: Number(process.env.OTP_REQUEST_WINDOW) || 15, // window in minutes
    otpBlockDuration: Number(process.env.OTP_BLOCK_DURATION) || 60, // block duration in minutes
  },
  internalServiceApiKey: process.env.INTERNAL_SERVICE_API_KEY || '',
  adminBackendUrl: process.env.ADMIN_BACKEND_URL || 'http://localhost:3000',
  adminInternalSocketUrl: process.env.ADMIN_INTERNAL_SOCKET_URL || 'http://localhost:3000/internal',
  referralDownloadUrl: process.env.REFERRAL_DOWNLOAD_URL || 'https://vdrive.app/download',
  defaultSearchRadius: Number(process.env.DEFAULT_SEARCH_RADIUS) || 500,
  avgSpeedMetersPerMin: Number(process.env.AVG_SPEED_METERS_PER_MIN) || 500,
};

export default config;
