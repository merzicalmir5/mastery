import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const sendgrid = require('@sendgrid/mail') as {
  setApiKey: (key: string) => void;
  send: (msg: { to: string; from: string; subject: string; text: string }) => Promise<unknown>;
};

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
    this.logger.log(`registration email requested for ${this.maskEmail(email)}`);
    await this.sendEmail(email, 'Welcome to Mastery', `Your registration is successful.\nVerify email: ${verifyUrl}`);
  }

  async sendPasswordReset(email: string, token: string): Promise<void> {
    const resetUrl = `${this.appBaseUrl}/auth/reset-password?token=${encodeURIComponent(token)}`;
    this.logger.log(`password reset email requested for ${this.maskEmail(email)}`);
    await this.sendEmail(email, 'Reset your password', `Reset password link: ${resetUrl}`);
  }

  private async sendEmail(to: string, subject: string, text: string): Promise<void> {
    const apiKey = this.configService.get<string>('SENDGRID_API_KEY') ?? '';
    if (!apiKey) {
      this.logger.warn(`SENDGRID_API_KEY missing. Email skipped to ${to}: ${subject}`);
      return;
    }

    try {
      await sendgrid.send({
        to,
        from: this.senderEmail,
        subject,
        text,
      });
      this.logger.log(`email sent: subject="${subject}" to=${this.maskEmail(to)}`);
    } catch (error) {
      const details = this.describeSendgridError(error);
      this.logger.error(
        `email send failed: subject="${subject}" to=${this.maskEmail(to)} from=${this.senderEmail} details="${details}"`,
      );
      throw error;
    }
  }

  private describeSendgridError(error: unknown): string {
    if (!(error instanceof Error)) {
      return String(error);
    }

    type SendgridLikeError = Error & {
      code?: number;
      response?: {
        body?: {
          errors?: Array<{ message?: string; field?: string; help?: string | null }>;
        };
      };
    };

    const err = error as SendgridLikeError;
    const code = err.code ? `code=${err.code}` : '';
    const first = err.response?.body?.errors?.[0];
    const providerMessage = first?.message?.trim();
    const field = first?.field ? ` field=${first.field}` : '';

    // Give a clear operational hint only in logs (not to API response body).
    if (providerMessage?.toLowerCase().includes('verified sender identity')) {
      return `${code} sender-identity-not-verified.${field} Configure SendGrid Sender Authentication and set SENDGRID_FROM_EMAIL to that verified sender. provider="${providerMessage}"`.trim();
    }

    if (providerMessage) {
      return `${code}${field} provider="${providerMessage}"`.trim();
    }

    return `${code} message="${err.message}"`.trim();
  }

  private maskEmail(email: string): string {
    const [name, domain] = email.split('@');
    if (!name || !domain) {
      return 'invalid-email';
    }
    if (name.length <= 2) {
      return `${name[0] ?? '*'}***@${domain}`;
    }
    return `${name.slice(0, 2)}***@${domain}`;
  }
}
