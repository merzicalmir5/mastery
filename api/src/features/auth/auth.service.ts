import {
  BadRequestException,
  Injectable,
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
  constructor(
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
    private readonly userRepository: UserRepository,
    private readonly refreshTokenRepository: RefreshTokenRepository,
    private readonly emailVerificationRepository: EmailVerificationRepository,
    private readonly passwordResetTokenRepository: PasswordResetTokenRepository,
    private readonly emailService: EmailService,
  ) {}

  async register(dto: RegisterDto): Promise<{ message: string; tokens: AuthTokens }> {
    const existing = await this.userRepository.findByEmail(dto.email.toLowerCase());
    if (existing) {
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
    await this.emailService.sendRegistrationConfirmation(user.email, verificationTokenRaw);

    const tokens = await this.issueTokens(user.id, user.email, user.companyName);
    return {
      message: 'Registration successful. Verification email has been sent.',
      tokens,
    };
  }

  async login(dto: LoginDto): Promise<{ message: string; tokens: AuthTokens }> {
    const user = await this.userRepository.findByEmail(dto.email.toLowerCase());
    if (!user) {
      throw new UnauthorizedException('Invalid credentials.');
    }

    const validPassword = await bcrypt.compare(dto.password, user.passwordHash);
    if (!validPassword) {
      throw new UnauthorizedException('Invalid credentials.');
    }

    const tokens = await this.issueTokens(user.id, user.email, user.companyName);
    return {
      message: 'Login successful.',
      tokens,
    };
  }

  async refresh(dto: RefreshTokenDto): Promise<AuthTokens> {
    const tokenHash = this.hashToken(dto.refreshToken);
    const persisted = await this.refreshTokenRepository.findByTokenHash(tokenHash);
    if (!persisted || persisted.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException('Refresh token is invalid or expired.');
    }

    const user = await this.userRepository.findById(persisted.userId);
    if (!user) {
      throw new UnauthorizedException('User not found.');
    }

    await this.refreshTokenRepository.deleteById(persisted.id);
    return this.issueTokens(user.id, user.email, user.companyName);
  }

  async forgotPassword(dto: ForgotPasswordDto): Promise<{ message: string }> {
    const user = await this.userRepository.findByEmail(dto.email.toLowerCase());
    if (user) {
      const tokenRaw = randomBytes(32).toString('hex');
      await this.passwordResetTokenRepository.create({
        userId: user.id,
        tokenHash: this.hashToken(tokenRaw),
        expiresAt: this.addHours(1),
      });
      await this.emailService.sendPasswordReset(user.email, tokenRaw);
    }

    return {
      message: 'If this email exists, a password reset email has been sent.',
    };
  }

  async resetPassword(dto: ResetPasswordDto): Promise<{ message: string }> {
    const tokenHash = this.hashToken(dto.token);
    const reset = await this.passwordResetTokenRepository.findByTokenHash(tokenHash);
    if (!reset || reset.usedAt || reset.expiresAt.getTime() < Date.now()) {
      throw new BadRequestException('Reset token is invalid or expired.');
    }

    const passwordHash = await bcrypt.hash(dto.newPassword, 10);
    await this.userRepository.updatePassword(reset.userId, passwordHash);
    await this.passwordResetTokenRepository.markUsed(reset.id);
    await this.refreshTokenRepository.deleteByUserId(reset.userId);

    return {
      message: 'Password has been reset successfully.',
    };
  }

  async verifyEmail(token: string): Promise<{ message: string }> {
    const tokenHash = this.hashToken(token);
    const verification = await this.emailVerificationRepository.findByTokenHash(tokenHash);
    if (!verification || verification.usedAt || verification.expiresAt.getTime() < Date.now()) {
      throw new BadRequestException('Verification token is invalid or expired.');
    }

    await this.userRepository.markEmailVerified(verification.userId);
    await this.emailVerificationRepository.markUsed(verification.id);

    return {
      message: 'Email verification successful.',
    };
  }

  async logout(refreshToken: string): Promise<{ message: string }> {
    const tokenHash = this.hashToken(refreshToken);
    const token = await this.refreshTokenRepository.findByTokenHash(tokenHash);
    if (token) {
      await this.refreshTokenRepository.deleteById(token.id);
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

    return { accessToken, refreshToken };
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
