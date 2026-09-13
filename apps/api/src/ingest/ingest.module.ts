import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { TenantModule } from '../tenant/tenant.module';
import { IngestService } from './ingest.service';
import { IngestController } from './ingest.controller';

@Module({
  imports: [PrismaModule, TenantModule],
  providers: [IngestService],
  controllers: [IngestController],
  exports: [IngestService],
})
export class IngestModule {}
