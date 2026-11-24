import { SendMailOptions } from 'nodemailer';
import { EmailRepository } from './email.repository';
import { Attachment } from 'nodemailer/lib/mailer';
import config from '../../config';
import { query } from '../../shared/database';
import { logger } from '../../shared/logger';
import { DriverOnboardingStatus } from '../../enums/user.enums';

interface InvoicePayload {
  recipient: string;
  filename: string;
  base64_data: string;
  subject: string;
}

export const EmailService = {
  /**
   * Prepares the email content and attachment buffer, then delegates sending to the repository.
   * @param payload - Data received from the frontend (recipient, base64 data, etc.).
   */
  async sendInvoiceEmail(payload: InvoicePayload): Promise<void> {
    const { recipient, filename, base64_data, subject } = payload;

    // 1. Convert Base64 string back into a Buffer
    // This is the core business logic of the service layer
    const pdfBuffer: Buffer = Buffer.from(base64_data, 'base64');

    // 2. Construct the attachment object
    const attachment: Attachment = {
      filename: filename,
      content: pdfBuffer,
      contentType: 'application/pdf',
    };

    // 3. Define the mail options
    const mailOptions: SendMailOptions = {
      from: `"T2Drive" <${process.env.EMAIL_USER}>`,
      // from: {
      //     name: 'T2Drive',
      //     address: process.env.EMAIL_USER || 'no-reply@t2drive.com'
      // },
      to: recipient,
      subject: subject,
      html: `
           <p style="margin-bottom: 20px;">Dear Customer,</p>
        <p style="margin-bottom: 20px;">Thanks for riding with <span style="color: #007bff; font-weight: bold;">T2Drive!</span></p>

        <div style="
            background-color: #f0f8ff; 
            border: 1px dashed #a0c0ff; 
            padding: 15px; 
            margin-bottom: 25px; 
            border-radius: 5px;
            font-size: 14px;
            color: #333;
        ">
            <p style="margin: 0; font-weight: bold;">
                📄 Invoice Attached:
            </p>
            <p style="margin: 5px 0 0 0;">
                Please find the official invoice (or receipt) for your recent trip attached to this email.
            </p>
        </div>
        <div style="margin-top: 30px; line-height: 1.5;">
            Thanks and Regards,
            <br>
            <strong>The T2Drive Team</strong>
        </div>

        <div style="
            font-size: 12px; 
            color: #777; 
            margin-top: 30px; 
            border-top: 1px solid #ddd; 
            padding-top: 15px; 
            line-height: 1.6;
        ">
            <p style="margin: 0; font-weight: bold;">Need Assistance?</p>
            <p style="margin: 0;">
                <strong>Support Email:</strong> support@v-drive.com
            </p>
            <p style="margin-top: 5px; margin-bottom: 0;">
                <a href="[Link to Help Center]" style="color: #2479dd; text-decoration: none;">Visit our Help Center</a>
            </p>
        </div>
            `,
      attachments: [attachment],
    };

    // 4. Delegate to the repository
    await EmailRepository.sendMail(mailOptions);
  },

  /**
   * Sends a welcome greeting email to a newly registered customer.
   * @param recipient - The email address of the customer.
   * @param name - The name of the customer.
   */
  async sendWelcomeEmail(recipient: string, name: string): Promise<void> {
    if (!recipient) return;

    const mailOptions: SendMailOptions = {
      from: `"T2Drive" <${process.env.EMAIL_USER || config.email.user}>`,
      to: recipient,
      subject: 'Welcome to T2Drive!',
      html: `
            <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 10px;">
                <h2 style="color: #007bff; text-align: center;">Welcome to T2Drive!</h2>
                <p style="margin-bottom: 20px;">Hi ${name || 'Customer'},</p>
                <p style="margin-bottom: 20px;">We are thrilled to have you on board! Get ready for a seamless, safe, and comfortable ride experience.</p>
                <p style="margin-bottom: 20px;">Your account has been successfully created. Open the app to book your first ride today!</p>
                <div style="margin-top: 30px; line-height: 1.5;">
                    Thanks and Regards,
                    <br>
                    <strong>The T2Drive Team</strong>
                </div>
                <div style="font-size: 12px; color: #777; margin-top: 30px; border-top: 1px solid #ddd; padding-top: 15px; line-height: 1.6;">
                    <p style="margin: 0; font-weight: bold;">Need Assistance?</p>
                    <p style="margin: 0;"><strong>Support Email:</strong> support@v-drive.com</p>
                </div>
            </div>
            `,
    };

    try {
      await EmailRepository.sendMail(mailOptions);
    } catch (error) {
      console.error('Failed to send welcome email:', error);
    }
  },

  /**
   * Sends a coupon notification email to a user.
   */
  async sendCouponEmail(recipient: string, name: string, coupon: any): Promise<void> {
    if (!recipient) return;

    const discountText =
      coupon.discount_type === 'PERCENTAGE'
        ? `${coupon.discount_value}% OFF`
        : `₹${coupon.discount_value} OFF`;

    const mailOptions: SendMailOptions = {
      from: `"T2Drive Offers" <${process.env.EMAIL_USER || config.email.user}>`,
      to: recipient,
      subject: `Exclusive Offer: Get ${discountText} on your next ride!`,
      html: `
            <div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 0; border: 1px solid #eee; border-radius: 12px; overflow: hidden;">
                <div style="background-color: #007bff; padding: 30px; text-align: center;">
                    <h1 style="color: #ffffff; margin: 0; font-size: 28px; font-weight: bold; letter-spacing: 1px;">Exclusive Offer!</h1>
                </div>
                <div style="padding: 40px 30px; background-color: #ffffff;">
                    <p style="font-size: 18px; margin-bottom: 25px;">Hi ${name || 'Valued Customer'},</p>
                    <p style="font-size: 16px; margin-bottom: 25px;">We have a special treat for you! Use the coupon below on your next ride and enjoy a fantastic discount.</p>
                    
                    <div style="background-color: #f8f9fa; border: 2px dashed #007bff; border-radius: 8px; padding: 25px; text-align: center; margin-bottom: 30px;">
                        <p style="font-size: 14px; color: #666; text-transform: uppercase; margin-bottom: 10px; font-weight: bold;">Your Coupon Code</p>
                        <h2 style="font-size: 36px; color: #007bff; margin: 0; font-family: monospace; letter-spacing: 4px;">${coupon.code}</h2>
                        <p style="font-size: 20px; color: #28a745; margin-top: 10px; font-weight: bold;">${discountText}</p>
                    </div>

                    <div style="margin-bottom: 35px;">
                        <h3 style="font-size: 16px; border-bottom: 1px solid #eee; padding-bottom: 10px; margin-bottom: 15px;">Offer Details:</h3>
                        <ul style="padding-left: 20px; margin: 0; font-size: 14px; color: #555;">
                            <li style="margin-bottom: 8px;">Valid until: <strong>${new Date(coupon.valid_until).toLocaleDateString()}</strong></li>
                            ${coupon.min_ride_amount > 0 ? `<li style="margin-bottom: 8px;">Minimum ride amount: <strong>₹${coupon.min_ride_amount}</strong></li>` : ''}
                            <li style="margin-bottom: 8px;">Applicable on all ride types.</li>
                        </ul>
                    </div>

                    <div style="text-align: center;">
                        <a href="https://v-drive.com/app" style="display: inline-block; background-color: #007bff; color: #ffffff; padding: 15px 35px; font-size: 18px; font-weight: bold; text-decoration: none; border-radius: 6px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">Open App & Ride Now</a>
                    </div>
                </div>
                <div style="background-color: #f4f4f4; padding: 20px; text-align: center; font-size: 12px; color: #999;">
                    <p style="margin: 0 0 10px 0;">You received this email because you are a registered user of T2Drive.</p>
                    <p style="margin: 0;">&copy; 2026 T2Drive Technologies. All rights reserved.</p>
                    <div style="margin-top: 15px;">
                        <a href="#" style="color: #007bff; text-decoration: none; margin: 0 10px;">Support</a> | 
                        <a href="#" style="color: #007bff; text-decoration: none; margin: 0 10px;">Privacy Policy</a> | 
                        <a href="#" style="color: #007bff; text-decoration: none; margin: 0 10px;">Unsubscribe</a>
                    </div>
                </div>
            </div>
            `,
    };

    try {
      await EmailRepository.sendMail(mailOptions);
    } catch (error) {
      console.error(`Failed to send coupon email to ${recipient}:`, error);
    }
  },

  /**
   * Sends a welcome email to a driver after all onboarding verifications are completed.
   * @param recipient - The driver's Gmail/email address.
   * @param name - The driver's full name or first name.
   */
  async sendDriverWelcomeEmail(recipient: string, name: string): Promise<void> {
    if (!recipient) return;

    const mailOptions: SendMailOptions = {
      from: `"T2Drive Partner Support" <${process.env.EMAIL_USER || config.email.user}>`,
      to: recipient,
      subject: '🎉 Welcome to T2Drive – Your Driver Account is Verified & Active!',
      html: `
            <div style="font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 12px; overflow: hidden; background-color: #ffffff;">
                <div style="background: linear-gradient(135deg, #007bff 0%, #0056b3 100%); padding: 30px 20px; text-align: center; color: #ffffff;">
                    <h1 style="margin: 0; font-size: 26px; font-weight: 700; letter-spacing: 0.5px;">Welcome to T2Drive! 🚗</h1>
                    <p style="margin: 8px 0 0 0; font-size: 15px; opacity: 0.95;">Your Driver Account is Verified & Ready</p>
                </div>
                <div style="padding: 30px 25px;">
                    <p style="font-size: 16px; margin-bottom: 20px;">Dear <strong>${name || 'Driver Partner'}</strong>,</p>
                    <p style="margin-bottom: 20px; font-size: 15px; color: #444;">
                        Congratulations! All your onboarding documents and identity verifications have been <strong>successfully verified and approved</strong>.
                    </p>

                    <div style="background-color: #f0fdf4; border-left: 4px solid #22c55e; border-radius: 6px; padding: 15px 18px; margin: 25px 0;">
                        <p style="margin: 0; font-weight: 600; color: #15803d; font-size: 15px;">
                            ✅ Verification Status: Approved & Active
                        </p>
                        <p style="margin: 5px 0 0 0; font-size: 13px; color: #166534;">
                            Your driver partner account is now live. You can start accepting ride requests and earning immediately.
                        </p>
                    </div>

                    <h3 style="color: #1f2937; margin: 25px 0 12px 0; font-size: 17px;">How to start driving & earning:</h3>
                    <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 18px; margin-bottom: 25px;">
                        <div style="margin-bottom: 12px;">
                            <strong style="color: #007bff;">1. Open Driver App:</strong>
                            <span style="color: #4b5563;"> Log in with your registered phone number.</span>
                        </div>
                        <div style="margin-bottom: 12px;">
                            <strong style="color: #007bff;">2. Select Subscription:</strong>
                            <span style="color: #4b5563;"> Choose a daily, weekly, or monthly plan for 0% commission earnings.</span>
                        </div>
                        <div>
                            <strong style="color: #007bff;">3. Go Online:</strong>
                            <span style="color: #4b5563;"> Switch your status toggle to "Online" to receive nearby ride requests instantly!</span>
                        </div>
                    </div>

                    <div style="margin-top: 30px; line-height: 1.5; color: #333;">
                        Warm regards,
                        <br>
                        <strong>The T2Drive Team</strong>
                    </div>

                    <div style="font-size: 12px; color: #6b7280; margin-top: 30px; border-top: 1px solid #e5e7eb; padding-top: 18px; line-height: 1.6;">
                        <p style="margin: 0; font-weight: 600; color: #374151;">Need Partner Support?</p>
                        <p style="margin: 4px 0 0 0;">
                            <strong>Email:</strong> <a href="mailto:support@v-drive.com" style="color: #007bff; text-decoration: none;">support@v-drive.com</a>
                        </p>
                        <p style="margin: 4px 0 0 0;">You can also access the 24/7 in-app Help & Support section anytime.</p>
                    </div>
                </div>
            </div>
            `,
    };

    try {
      await EmailRepository.sendMail(mailOptions);
      logger.info(`✅ Driver welcome email successfully sent to ${recipient}`);
    } catch (error: any) {
      logger.error(`❌ Failed to send driver welcome email to ${recipient}: ${error?.message || error}`);
    }
  },

  /**
   * Helper to verify eligibility and send the driver welcome email after all verifications are complete.
   * Ensures idempotency so the driver receives the email only once.
   * @param driverId - UUID of the driver
   */
  async sendDriverWelcomeEmailIfVerified(driverId: string): Promise<void> {
    try {
      // Ensure idempotency tracking columns exist in drivers table
      await query(`
        DO $$ 
        BEGIN 
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='drivers' AND column_name='welcome_email_sent') THEN
            ALTER TABLE drivers ADD COLUMN welcome_email_sent BOOLEAN DEFAULT FALSE;
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='drivers' AND column_name='welcome_email_sent_at') THEN
            ALTER TABLE drivers ADD COLUMN welcome_email_sent_at TIMESTAMP WITH TIME ZONE;
          END IF;
        END $$;
      `);

      const res = await query(
        `SELECT id, first_name, last_name, full_name, email, status, onboarding_status, welcome_email_sent 
         FROM drivers WHERE id = $1`,
        [driverId]
      );

      if (res.rows.length === 0) return;
      const driver = res.rows[0];

      // Check if driver has an email address
      if (!driver.email || !driver.email.includes('@')) {
        logger.info(`[Driver Welcome Email] Driver ${driverId} has no valid email provided (${driver.email}). Skipping.`);
        return;
      }

      // Check if already sent (prevent duplicate welcome emails)
      if (driver.welcome_email_sent) {
        logger.info(`[Driver Welcome Email] Driver ${driverId} already received welcome email. Skipping.`);
        return;
      }

      // Check if all verifications are approved / driver is active
      const isApproved =
        driver.status === 'active' ||
        driver.onboarding_status === DriverOnboardingStatus.DOCUMENTS_APPROVED ||
        driver.onboarding_status === 'DOCUMENTS_VERIFIED' ||
        driver.onboarding_status === 'ACTIVE';

      if (!isApproved) {
        logger.info(`[Driver Welcome Email] Driver ${driverId} verifications not complete yet. Current status: ${driver.status}, onboarding: ${driver.onboarding_status}`);
        return;
      }

      const driverName = (driver.first_name || driver.last_name)
        ? `${driver.first_name || ''} ${driver.last_name || ''}`.trim()
        : driver.full_name || 'Driver Partner';

      await this.sendDriverWelcomeEmail(driver.email, driverName);

      // Mark welcome_email_sent = true in DB
      await query(
        `UPDATE drivers SET welcome_email_sent = TRUE, welcome_email_sent_at = NOW(), updated_at = NOW() WHERE id = $1`,
        [driverId]
      );
      logger.info(`[Driver Welcome Email] Recorded welcome_email_sent = true for driver ${driverId}`);
    } catch (err: any) {
      logger.error(`[Driver Welcome Email] Error dispatching welcome email for driver ${driverId}: ${err.message}`);
    }
  },
};
