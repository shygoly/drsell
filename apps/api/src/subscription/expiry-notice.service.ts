import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { reminderDayOffset } from './subscription-state';

/**
 * 到期前的连续三天提醒（D-3 / D-2 / D-1）。
 *
 * 触发方式选了进程内定时（openspec design 的 D4 方案 a）。另外两个选项被排除：
 * 惰性触发「没人访问就不提醒」，而临近到期的店恰恰可能没人访问——正是最需要
 * 提醒的时候；外部 crontab 会在 deploy-mvp.sh 管不到的地方多一处配置，本仓刚
 * 吃过提示词漂移的亏。
 *
 * 多实例会同时触发，靠 ExpiryNotice 的唯一键去重（店 + 周期 + 档位）。
 *
 * 用 setInterval 而不是 @nestjs/schedule：后者 12.x 是 ESM-only
 * （package.json "type": "module"，无 CJS 产物），而本应用编译成 CommonJS——
 * 装上它生产启动即崩，Jest 也解析不了。一天一次的提醒不需要 cron 表达式的
 * 精度，定时漂移无所谓，重复触发又有唯一键兜底。
 */
const DAILY_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class ExpiryNoticeService implements OnModuleInit {
  private readonly logger = new Logger(ExpiryNoticeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
  ) {}

  private timer: NodeJS.Timeout | null = null;

  onModuleInit() {
    // 启动时先跑一次：进程重启后不必等满一天，且当天该发的不会漏。
    void this.runDaily();
    this.timer = setInterval(() => void this.runDaily(), DAILY_MS);
    this.timer.unref?.();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  /** 一天一次。错过的当天不补——提醒是善意提示，不是账务。 */
  async runDaily() {
    try {
      const sent = await this.sweep();
      if (sent > 0) this.logger.log(`expiry notices sent: ${sent}`);
    } catch (e) {
      // 定时任务抛错会被吞掉，必须自己留痕，否则提醒静默停摆没人知道。
      this.logger.error(`expiry notice sweep failed: ${String(e)}`);
    }
  }

  /** 扫一遍所有落在提醒窗口内的店。返回本次实际发出的条数。 */
  async sweep(now = new Date()): Promise<number> {
    const horizon = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
    const subs = await this.prisma.subscription.findMany({
      where: {
        currentPeriodEnd: { gt: now, lte: horizon },
        status: 'ACTIVE',
      },
      select: {
        shopId: true,
        currentPeriodEnd: true,
        planCode: true,
        shop: {
          select: {
            shopDomain: true,
            memberships: { select: { user: { select: { email: true } } }, take: 1 },
          },
        },
      },
    });

    let sent = 0;
    for (const sub of subs) {
      const dayOffset = reminderDayOffset(sub.currentPeriodEnd, now);
      if (!dayOffset) continue;
      if (await this.notify(sub, dayOffset)) sent += 1;
    }
    return sent;
  }

  private async notify(
    sub: {
      shopId: string;
      currentPeriodEnd: Date | null;
      planCode: string;
      shop: { shopDomain: string; memberships: { user: { email: string } }[] };
    },
    dayOffset: 1 | 2 | 3,
  ): Promise<boolean> {
    const periodEnd = sub.currentPeriodEnd as Date;

    // 先抢占去重键再发送。反过来（先发后记）会在并发下重复打扰商家。
    try {
      await this.prisma.expiryNotice.create({
        data: { shopId: sub.shopId, periodEnd, dayOffset },
      });
    } catch {
      return false; // 唯一键冲突 = 这一档已经发过
    }

    const email = sub.shop.memberships[0]?.user.email ?? null;
    if (!email) {
      await this.markResult(sub.shopId, periodEnd, dayOffset, false, 'no owner email');
      this.logger.warn(`expiry notice skipped: ${sub.shop.shopDomain} 没有可用的店主邮箱`);
      return false;
    }

    try {
      await this.mail.sendExpiryNotice({
        to: email,
        shopDomain: sub.shop.shopDomain,
        planCode: sub.planCode,
        periodEnd,
        daysLeft: dayOffset,
      });
      await this.markResult(sub.shopId, periodEnd, dayOffset, true, null);
      return true;
    } catch (e) {
      // 这里是 sendDunning 犯过的错的反面：结果必须落库，失败必须能被发现，
      // 不能像它那样排一条 queued 给一个不存在的 worker 就当发过了。
      await this.markResult(sub.shopId, periodEnd, dayOffset, false, String(e));
      this.logger.error(`expiry notice delivery failed for ${sub.shop.shopDomain}: ${String(e)}`);
      return false;
    }
  }

  private markResult(
    shopId: string,
    periodEnd: Date,
    dayOffset: number,
    delivered: boolean,
    error: string | null,
  ) {
    return this.prisma.expiryNotice.update({
      where: { shopId_periodEnd_dayOffset: { shopId, periodEnd, dayOffset } },
      data: { delivered, error },
    });
  }
}
