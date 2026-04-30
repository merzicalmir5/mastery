import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { EmailModule } from './core/email/email.module';
import { PrismaModule } from './core/prisma/prisma.module';
import { AuthModule } from './features/auth/auth.module';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), PrismaModule, EmailModule, AuthModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
