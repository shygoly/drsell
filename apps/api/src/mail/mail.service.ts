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

  /**
   * 发送到期提醒。
   *
   * **本仓当前没有任何出站邮件通道**——没有 SMTP 配置，也没有 nodemailer /
   * resend 之类的依赖。这里明确抛错而不是假装发出去：ops 的 sendDunning 就是
   * 往 KnowledgeSyncJob 排一条 queued 给一个不存在的 worker，结果催缴从未真正
   * 发出，而且没人发现。调用方会把这个错误落库（ExpiryNotice.error），
   * 失败因此可见。
   *
   * 接通道时替换本方法即可，调用方无需改动。
   */
  async sendExpiryNotice(_params: {
    to: string;
    shopDomain: string;
    planCode: string;
    periodEnd: Date;
    daysLeft: number;
  }): Promise<void> {
    throw new Error(
      'outbound email channel is not configured — 到期提醒无法送达；' +
        '应用内提示仍然可见（见 storefront 的订阅横幅）',
    );
  }

  unsubscribe(email: string) {
    return this.prisma.mailSubscriber.update({
      where: { email },
      data: { status: 'unsubscribed' },
    });
  }
}
