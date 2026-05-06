import nodemailer, { Transporter, SendMailOptions } from 'nodemailer';
import config from '../../config';
import { logger } from '../../shared/logger';

// Initialize the Nodemailer Transporter
const transporter: Transporter = nodemailer.createTransport({
    service: config.email.service,
    auth: {
        user: config.email.user,
        pass: config.email.pass,
    },
});

export const EmailRepository = {
    /**
     * Sends an email using the configured Nodemailer transporter.
     * @param mailOptions - Options defining the email content and recipient.
     */
    async sendMail(mailOptions: SendMailOptions): Promise<void> {
        try {
            const info = await transporter.sendMail(mailOptions);
            logger.info(`Email sent successfully: ${info.response}`);
        } catch (error) {
            logger.error('Email sending failed:', error);
            // Throw a custom error to be handled by the Service layer
            throw new Error("Failed to connect to email service or send mail.");
        }
    }
};