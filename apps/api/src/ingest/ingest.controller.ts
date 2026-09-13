import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';
import { StoreKeyGuard } from './store-key.guard';
import { IngestService } from './ingest.service';

class ProductIngestDto {
  @IsString() externalId!: string;
  @IsOptional() @IsDateString() sourceUpdatedAt?: string;
  @IsString() name!: string;
  @IsOptional() @IsNumber() price?: number;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsInt() stock?: number;
  @IsOptional() @IsString() handle?: string;
  @IsOptional() @IsString() vendor?: string;
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() tags?: string;
  @IsOptional() @IsString() variantsJson?: string;
  @IsOptional() @IsString() imagesJson?: string;
}

class OrderIngestDto {
  @IsString() externalId!: string; // display_id
  @IsOptional() @IsDateString() sourceUpdatedAt?: string;
  @IsOptional() @IsString() customerExternalId?: string;
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() financialStatus?: string;
  @IsOptional() @IsString() fulfillmentStatus?: string;
  @IsNumber() total!: number;
  @IsOptional() @IsNumber() totalTax?: number;
  @IsOptional() @IsString() itemsJson?: string;
  @IsOptional() @IsString() billingAddress?: string;
  @IsOptional() @IsString() shippingAddress?: string;
  @IsOptional() @IsDateString() createdAt?: string;
}

class CustomerIngestDto {
  @IsString() externalId!: string;
  @IsOptional() @IsDateString() sourceUpdatedAt?: string;
  @IsOptional() @IsString() displayName?: string;
  @IsOptional() @IsString() email?: string;
  @IsOptional() @IsString() phone?: string;
}

class AfterSalesIngestDto {
  @IsString() externalId!: string;
  @IsOptional() @IsDateString() sourceUpdatedAt?: string;
  @IsOptional() @IsString() orderExternalId?: string;
  @IsIn(['return', 'exchange', 'claim']) type!: string;
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() reason?: string;
  @IsOptional() @IsNumber() amount?: number;
  @IsOptional() @IsString() currency?: string;
}

class InventoryIngestDto {
  @IsString() productExternalId!: string;
  @IsInt() stock!: number;
  @IsOptional() @IsDateString() sourceUpdatedAt?: string;
}

/**
 * 外部电商（Medusa 独立站）数据摄取。路由在全局前缀下 → /api/ingest/*。
 * 鉴权靠 store 密钥（StoreKeyGuard），非商家 JWT。店铺域由服务端配置解析（见 IngestService）。
 */
@UseGuards(StoreKeyGuard)
@Controller('ingest')
export class IngestController {
  constructor(private readonly ingest: IngestService) {}

  @Post('products')
  products(@Body() body: ProductIngestDto) {
    return this.ingest.upsertProduct(body);
  }

  @Post('orders')
  orders(@Body() body: OrderIngestDto) {
    return this.ingest.upsertOrder(body);
  }

  @Post('customers')
  customers(@Body() body: CustomerIngestDto) {
    return this.ingest.upsertCustomer(body);
  }

  @Post('after-sales')
  afterSales(@Body() body: AfterSalesIngestDto) {
    return this.ingest.upsertAfterSales(body);
  }

  @Post('inventory')
  inventory(@Body() body: InventoryIngestDto) {
    return this.ingest.updateInventory(body);
  }
}
