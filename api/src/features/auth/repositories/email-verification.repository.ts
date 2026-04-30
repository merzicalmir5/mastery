import { Injectable } from '@nestjs/common';
import { EmailVerification } from '@prisma/client';
import { PrismaService } from '../../../core/prisma/prisma.service';

@Injectable()
export class EmailVerificationRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(data: { tokenHash: string; userId: string; expiresAt: Date }): Promise<EmailVerification> {
    return this.prisma.emailVerification.create({ data });
  }

  findByTokenHash(tokenHash: string): Promise<EmailVerification | null> {
    return this.prisma.emailVerification.findUnique({ where: { tokenHash } });
  }

  markUsed(id: string): Promise<EmailVerification> {
    return this.prisma.emailVerification.update({
      where: { id },
      data: { usedAt: new Date() },
    });
  }

  deleteByUserId(userId: string): Promise<{ count: number }> {
    return this.prisma.emailVerification.deleteMany({
      where: { userId },
    });
  }
}
