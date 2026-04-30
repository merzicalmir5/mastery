import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { JwtAuthGuard } from '../../core/auth/jwt-auth.guard';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { EmailVerificationRepository } from './repositories/email-verification.repository';
import { PasswordResetTokenRepository } from './repositories/password-reset-token.repository';
import { RefreshTokenRepository } from './repositories/refresh-token.repository';
import { UserRepository } from './repositories/user.repository';

@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_ACCESS_SECRET'),
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtAuthGuard,
    UserRepository,
    RefreshTokenRepository,
    EmailVerificationRepository,
    PasswordResetTokenRepository,
  ],
})
export class AuthModule {}
