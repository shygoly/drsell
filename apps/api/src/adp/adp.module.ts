import { Module } from '@nestjs/common';
import { AdpService } from './adp.service';
import { AdpController } from './adp.controller';

@Module({
  providers: [AdpService],
  controllers: [AdpController],
  exports: [AdpService],
})
export class AdpModule {}
