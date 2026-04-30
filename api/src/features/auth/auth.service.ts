import {
  BadRequestException,
  InternalServerErrorException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { createHash, randomBytes } from 'crypto';
import { EmailService } from '../../core/email/email.service';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { RegisterDto } from './dto/register.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { AuthTokens } from './interfaces/auth-tokens.interface';
import { EmailVerificationRepository } from './repositories/email-verification.repository';
import { PasswordResetTokenRepository } from './repositories/password-reset-token.repository';
import { RefreshTokenRepository } from './repositories/refresh-token.repository';
import { UserRepository } from './repositories/user.repository';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
    private readonly userRepository: UserRepository,
    private readonly refreshTokenRepository: RefreshTokenRepository,
    private readonly emailVerificationRepository: EmailVerificationRepository,
    private readonly passwordResetTokenRepository: PasswordResetTokenRepository,
    private readonly emailService: EmailService,
  ) {}

  async register(dto: RegisterDto): Promise<{ message: string }> {
    const email = dto.email.toLowerCase();
    this.logger.log(`register attempt email=${this.maskEmail(email)} company=${dto.companyName}`);
    const existing = await this.userRepository.findByEmail(dto.email.toLowerCase());
    if (existing) {
      this.logger.warn(`register rejected duplicate email=${this.maskEmail(email)}`);
      throw new BadRequestException('Email is already registered.');
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const user = await this.userRepository.create({
      email: dto.email.toLowerCase(),
      companyName: dto.companyName,
      passwordHash,
    });

    const verificationTokenRaw = randomBytes(32).toString('hex');
    await this.emailVerificationRepository.create({
      userId: user.id,
      tokenHash: this.hashToken(verificationTokenRaw),
      expiresAt: this.addHours(24),
    });
    try {
      await this.emailService.sendRegistrationConfirmation(user.email, verificationTokenRaw);
    } catch (error) {
      // Keep registration consistent: if mail failed, remove created user + tokens.
      await this.refreshTokenRepository.deleteByUserId(user.id);
      await this.emailVerificationRepository.deleteByUserId(user.id);
      await this.passwordResetTokenRepository.deleteByUserId(user.id);
      await this.userRepository.deleteById(user.id);
      this.logger.error(
        `register rolled back: failed to send confirmation email for userId=${user.id} email=${this.maskEmail(user.email)} error=${error instanceof Error ? error.message : String(error)}`,
      );
      throw new InternalServerErrorException(
        'Registration failed because confirmation email could not be sent.',
      );
    }

    this.logger.log(`register success userId=${user.id} email=${this.maskEmail(user.email)}`);
    return {
      message: 'Registration successful. Verification email has been sent.',
    };
  }

  async login(dto: LoginDto): Promise<{ message: string; tokens: AuthTokens }> {
    const email = dto.email.toLowerCase();
    this.logger.log(`login attempt email=${this.maskEmail(email)}`);
    const user = await this.userRepository.findByEmail(email);
    if (!user) {
      this.logger.warn(`login failed user-not-found email=${this.maskEmail(email)}`);
      throw new UnauthorizedException('Invalid credentials.');
    }

    const validPassword = await bcrypt.compare(dto.password, user.passwordHash);
    if (!validPassword) {
      this.logger.warn(`login failed bad-password userId=${user.id} email=${this.maskEmail(email)}`);
      throw new UnauthorizedException('Invalid credentials.');
    }
    if (!user.isEmailVerified) {
      this.logger.warn(`login failed email-not-verified userId=${user.id} email=${this.maskEmail(email)}`);
      throw new UnauthorizedException('Please verify your email before logging in.');
    }

    const tokens = await this.issueTokens(user.id, user.email, user.companyName);
    this.logger.log(`login success userId=${user.id} email=${this.maskEmail(email)}`);
    return {
      message: 'Login successful.',
      tokens,
    };
  }

  async refresh(dto: RefreshTokenDto): Promise<AuthTokens> {
    this.logger.log('refresh token attempt');
    const tokenHash = this.hashToken(dto.refreshToken);
    const persisted = await this.refreshTokenRepository.findByTokenHash(tokenHash);
    if (!persisted || persisted.expiresAt.getTime() < Date.now()) {
      this.logger.warn('refresh failed invalid-or-expired token');
      throw new UnauthorizedException('Refresh token is invalid or expired.');
    }

    const user = await this.userRepository.findById(persisted.userId);
    if (!user) {
      this.logger.warn(`refresh failed user-not-found userId=${persisted.userId}`);
      throw new UnauthorizedException('User not found.');
    }

    await this.refreshTokenRepository.deleteById(persisted.id);
    this.logger.log(`refresh success userId=${user.id}`);
    return this.issueTokens(user.id, user.email, user.companyName);
  }

  async forgotPassword(dto: ForgotPasswordDto): Promise<{ message: string }> {
    const email = dto.email.toLowerCase();
    this.logger.log(`forgot-password requested email=${this.maskEmail(email)}`);
    const user = await this.userRepository.findByEmail(email);
    if (user) {
      const tokenRaw = randomBytes(32).toString('hex');
      await this.passwordResetTokenRepository.create({
        userId: user.id,
        tokenHash: this.hashToken(tokenRaw),
        expiresAt: this.addHours(1),
      });
      await this.emailService.sendPasswordReset(user.email, tokenRaw);
      this.logger.log(`forgot-password token created userId=${user.id}`);
    } else {
      this.logger.log(`forgot-password no-user email=${this.maskEmail(email)}`);
    }

    return {
      message: 'If this email exists, a password reset email has been sent.',
    };
  }

  async resetPassword(dto: ResetPasswordDto): Promise<{ message: string }> {
    this.logger.log('reset-password attempt');
    const tokenHash = this.hashToken(dto.token);
    const reset = await this.passwordResetTokenRepository.findByTokenHash(tokenHash);
    if (!reset || reset.usedAt || reset.expiresAt.getTime() < Date.now()) {
      this.logger.warn('reset-password failed invalid-or-expired token');
      throw new BadRequestException('Reset token is invalid or expired.');
    }

    const passwordHash = await bcrypt.hash(dto.newPassword, 10);
    await this.userRepository.updatePassword(reset.userId, passwordHash);
    await this.passwordResetTokenRepository.markUsed(reset.id);
    await this.refreshTokenRepository.deleteByUserId(reset.userId);
    this.logger.log(`reset-password success userId=${reset.userId}`);

    return {
      message: 'Password has been reset successfully.',
    };
  }

  async verifyEmail(token: string): Promise<{ message: string }> {
    this.logger.log('verify-email attempt');
    const tokenHash = this.hashToken(token);
    const verification = await this.emailVerificationRepository.findByTokenHash(tokenHash);
    if (!verification || verification.usedAt || verification.expiresAt.getTime() < Date.now()) {
      this.logger.warn('verify-email failed invalid-or-expired token');
      throw new BadRequestException('Verification token is invalid or expired.');
    }

    await this.userRepository.markEmailVerified(verification.userId);
    await this.emailVerificationRepository.markUsed(verification.id);
    this.logger.log(`verify-email success userId=${verification.userId}`);

    return {
      message: 'Email verification successful.',
    };
  }

  async logout(refreshToken: string): Promise<{ message: string }> {
    this.logger.log('logout attempt');
    const tokenHash = this.hashToken(refreshToken);
    const token = await this.refreshTokenRepository.findByTokenHash(tokenHash);
    if (token) {
      await this.refreshTokenRepository.deleteById(token.id);
      this.logger.log(`logout success userId=${token.userId}`);
    } else {
      this.logger.log('logout token-not-found');
    }
    return {
      message: 'Logged out successfully.',
    };
  }

  private async issueTokens(userId: string, email: string, companyName: string): Promise<AuthTokens> {
    const payload = { sub: userId, email, companyName };
    const accessExpiresIn = this.configService.get<string>('JWT_ACCESS_EXPIRES_IN') ?? '15m';
    const refreshExpiresIn = this.configService.get<string>('JWT_REFRESH_EXPIRES_IN') ?? '7d';

    const accessToken = await this.jwtService.signAsync(payload, {
      secret: this.configService.get<string>('JWT_ACCESS_SECRET'),
      expiresIn: accessExpiresIn as any,
    });

    const refreshToken = await this.jwtService.signAsync(payload, {
      secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
      expiresIn: refreshExpiresIn as any,
    });

    await this.refreshTokenRepository.create({
      userId,
      tokenHash: this.hashToken(refreshToken),
      expiresAt: this.computeFutureDate(refreshExpiresIn),
    });

    this.logger.log(`tokens issued userId=${userId} email=${this.maskEmail(email)}`);

    return { accessToken, refreshToken };
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

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private addHours(hours: number): Date {
    const date = new Date();
    date.setHours(date.getHours() + hours);
    return date;
  }

  private computeFutureDate(expiresIn: string): Date {
    const value = Number(expiresIn.slice(0, -1));
    const unit = expiresIn.slice(-1);
    const date = new Date();
    if (Number.isNaN(value)) {
      date.setDate(date.getDate() + 7);
      return date;
    }
    if (unit === 'm') {
      date.setMinutes(date.getMinutes() + value);
      return date;
    }
    if (unit === 'h') {
      date.setHours(date.getHours() + value);
      return date;
    }
    if (unit === 'd') {
      date.setDate(date.getDate() + value);
      return date;
    }
    date.setDate(date.getDate() + 7);
    return date;
  }
}
