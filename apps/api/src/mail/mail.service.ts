import { Injectable, Logger } from '@nestjs/common';
import { createTransport, type Transporter } from 'nodemailer';
import { PrismaService } from '../prisma/prisma.service';
import { renderExpiryNotice } from './expiry-notice.template';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: Transporter | null = null;

  constructor(private readonly prisma: PrismaService) {}

  /**
   * 出站通道走 **SMTP**，不绑任何一家服务商。
   *
   * SES / Resend / Mailgun / Postmark / 自建 Postfix 都讲 SMTP，换供应商只改
   * 环境变量，不改代码也不换依赖——把服务商 SDK 焊进代码等于把一个可逆的
   * 运维选择变成不可逆的代码选择。
   *
   * 未配置时**不静默降级**：返回 null，调用方抛错并落库（`ExpiryNotice.error`）。
   * 这正是 ops 的 sendDunning 犯过的错的反面——它往 KnowledgeSyncJob 排一条
   * queued 给一个不存在的 worker，催缴从未真正发出而且没人发现。
   *
   * 惰性建连：SMTP 没配时进程不该为此启动失败，其余功能与邮件无关。
   */
  private smtp(): Transporter | null {
    if (this.transporter) return this.transporter;
    const host = process.env.SMTP_HOST;
    if (!host) return null;
    const port = Number(process.env.SMTP_PORT ?? 587);
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;
    this.transporter = createTransport({
      host,
      port,
      // 465 是隐式 TLS；587 走 STARTTLS。写死任一个都会在另一种端口上连不上。
      secure: port === 465,
      ...(user && pass ? { auth: { user, pass } } : {}),
    });
    this.logger.log(`SMTP outbound channel ready: ${host}:${port}`);
    return this.transporter;
  }

  /** 配置是否齐备。运营台/健康检查可以据此显示通道状态，不必真发一封信。 */
  outboundConfigured(): boolean {
    return Boolean(process.env.SMTP_HOST && process.env.MAIL_FROM);
  }

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
   * 通道未配置时抛错而不是假装发出：调用方会把这个错误落库
   * （`ExpiryNotice.error`），失败因此可见。应用内横幅不依赖本通道，
   * 邮件发不出去时商家仍然看得到提示。
   */
  async sendExpiryNotice(params: {
    to: string;
    shopDomain: string;
    planCode: string;
    periodEnd: Date;
    daysLeft: number;
  }): Promise<void> {
    const from = process.env.MAIL_FROM;
    const tx = this.smtp();
    if (!tx || !from) {
      throw new Error(
        'outbound email channel is not configured — 需要 SMTP_HOST 与 MAIL_FROM' +
          '（可选 SMTP_PORT/SMTP_USER/SMTP_PASS）；到期提醒无法送达，' +
          '应用内提示仍然可见（见 storefront 的订阅横幅）',
      );
    }

    // 已退订的商家不再打扰。查不到记录视为未退订——大多数商家从没进过订阅表。
    const sub = await this.prisma.mailSubscriber.findUnique({ where: { email: params.to } });
    if (sub?.status === 'unsubscribed') {
      throw new Error(`recipient ${params.to} has unsubscribed`);
    }

    const { subject, text } = renderExpiryNotice(params);
    await tx.sendMail({ from, to: params.to, subject, text });
  }

  unsubscribe(email: string) {
    return this.prisma.mailSubscriber.update({
      where: { email },
      data: { status: 'unsubscribed' },
    });
  }
}
