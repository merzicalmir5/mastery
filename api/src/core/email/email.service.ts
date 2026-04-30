import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as sendgrid from '@sendgrid/mail';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly senderEmail: string;
  private readonly appBaseUrl: string;

  constructor(private readonly configService: ConfigService) {
    const apiKey = this.configService.get<string>('SENDGRID_API_KEY') ?? '';
    this.senderEmail =
      this.configService.get<string>('SENDGRID_FROM_EMAIL') ?? 'no-reply@mastery.local';
    this.appBaseUrl = this.configService.get<string>('APP_BASE_URL') ?? 'http://localhost:3000';

    if (apiKey) {
      sendgrid.setApiKey(apiKey);
    }
  }

  async sendRegistrationConfirmation(email: string, token: string): Promise<void> {
    const verifyUrl = `${this.appBaseUrl}/auth/verify-email?token=${encodeURIComponent(token)}`;
    await this.sendEmail(email, 'Welcome to Mastery', `Your registration is successful.\nVerify email: ${verifyUrl}`);
  }

  async sendPasswordReset(email: string, token: string): Promise<void> {
    const resetUrl = `${this.appBaseUrl}/auth/reset-password?token=${encodeURIComponent(token)}`;
    await this.sendEmail(email, 'Reset your password', `Reset password link: ${resetUrl}`);
  }

  private async sendEmail(to: string, subject: string, text: string): Promise<void> {
    const apiKey = this.configService.get<string>('SENDGRID_API_KEY') ?? '';
    if (!apiKey) {
      this.logger.warn(`SENDGRID_API_KEY missing. Email skipped to ${to}: ${subject}`);
      return;
    }

    await sendgrid.send({
      to,
      from: this.senderEmail,
      subject,
      text,
    });
  }
}
