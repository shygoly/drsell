import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class MailService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.mailSubscriber.findMany({ orderBy: { createdAt: 'desc' } });
  }

  upsert(email: string, shopDomain?: string) {
    return this.prisma.mailSubscriber.upsert({
      where: { email },
      create: { email, shopDomain, status: 'active' },
      update: { shopDomain, status: 'active' },
    });
  }

  unsubscribe(email: string) {
    return this.prisma.mailSubscriber.update({
      where: { email },
      data: { status: 'unsubscribed' },
    });
  }
}
