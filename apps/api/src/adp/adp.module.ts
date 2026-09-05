import { Module } from '@nestjs/common';
import { QuotaModule } from '../quota/quota.module';
import { AdpService } from './adp.service';
import { AdpController } from './adp.controller';

@Module({
  imports: [QuotaModule],
  providers: [AdpService],
  controllers: [AdpController],
  exports: [AdpService],
})
export class AdpModule {}
