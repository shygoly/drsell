import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { MailModule } from '../mail/mail.module';
import { ExpiryNoticeService } from './expiry-notice.service';

@Module({
  imports: [PrismaModule, MailModule],
  providers: [ExpiryNoticeService],
  exports: [ExpiryNoticeService],
})
export class ExpiryNoticeModule {}
