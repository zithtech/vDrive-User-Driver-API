import { S3, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { logger } from '../../shared/logger';

export class S3Service {
  private s3: S3;
  private bucketName: string;

  constructor() {
    this.bucketName = process.env.S3_BUCKET_NAME || '';
    if (!this.bucketName) {
      logger.warn(
        'S3_BUCKET_NAME is not defined in environment variables during S3Service construction'
      );
    }

    const customEndpoint = process.env.AWS_S3_ENDPOINT; // Only set for LocalStack/MinIO
    this.s3 = new S3({
      region: process.env.AWS_REGION || 'us-east-1',
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
      },
      ...(customEndpoint ? { endpoint: customEndpoint, forcePathStyle: true } : {}),
    });
    logger.info(
      `S3Service initialized. Bucket: ${this.bucketName}, Region: ${process.env.AWS_REGION || 'us-east-1'}${customEndpoint ? `, Endpoint: ${customEndpoint}` : ', Endpoint: AWS default'}`
    );
  }

  /**
   * Generate a pre-signed URL for uploading a file (PUT)
   * @param key - The S3 key (path/filename)
   * @param contentType - The MIME type of the file
   * @param expiresIn - Expiration time in seconds (default 60s)
   */
  async getUploadUrl(
    key: string,
    contentType: string,
    expiresIn: number = 60
  ): Promise<{ uploadUrl: string; fileUrl: string; key: string }> {
    try {
      const command = new PutObjectCommand({
        Bucket: this.bucketName,
        Key: key,
        ContentType: contentType,
      });

      // S3 extends S3Client, so it works here
      const uploadUrl = await getSignedUrl(this.s3, command, { expiresIn });
      // Construct the public URL (assuming bucket is public or accessed via CloudFront/Proxy)
      // If private, use getReadUrl
      const region = process.env.AWS_REGION || 'us-east-1';
      const fileUrl = `https://${this.bucketName}.s3.${region}.amazonaws.com/${key}`;

      return { uploadUrl, fileUrl, key };
    } catch (error) {
      logger.error(`Error generating upload URL for key ${key}:`, error);
      throw error;
    }
  }

  /**
   * Generate a pre-signed URL for reading a private file (GET)
   * @param key - The S3 key
   * @param expiresIn - Expiration time in seconds (default 3600s)
   */
  async getReadUrl(key: string, expiresIn: number = 3600): Promise<string> {
    try {
      const command = new GetObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      });
      return await getSignedUrl(this.s3, command, { expiresIn });
    } catch (error) {
      logger.error(`Error generating read URL for key ${key}:`, error);
      throw error;
    }
  }

  /**
   * Delete an object from S3
   * @param key - The S3 key
   */
  async deleteFile(key: string): Promise<void> {
    try {
      await this.s3.deleteObject({
        Bucket: this.bucketName,
        Key: key,
      });
      logger.info(`Deleted file from S3: ${key}`);
    } catch (error) {
      logger.error(`Error deleting file from S3 ${key}:`, error);
      throw error;
    }
  }
}

export const s3Service = new S3Service();
