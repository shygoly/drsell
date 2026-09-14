import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TenantService } from '../tenant/tenant.service';

/** 目前唯一的非 Shopify 来源。将来多来源时按 store 密钥解析。 */
const SOURCE = 'medusa';

export interface ProductIngest {
  externalId: string;
  sourceUpdatedAt?: Date | string;
  name: string;
  price?: number;
  description?: string;
  stock?: number;
  handle?: string;
  vendor?: string;
  status?: string;
  tags?: string;
  variantsJson?: string;
  imagesJson?: string;
}

export interface OrderIngest {
  externalId: string; // = Medusa display_id（顾客可见订单号），存入 shopifyOrderId 列（B4）
  sourceUpdatedAt?: Date | string;
  customerExternalId?: string; // = Medusa 顾客 id，存入 customerId（S6）
  status?: string;
  financialStatus?: string;
  fulfillmentStatus?: string;
  total: number;
  totalTax?: number;
  itemsJson?: string;
  billingAddress?: string;
  shippingAddress?: string;
  createdAt?: Date | string;
}

export interface CustomerIngest {
  externalId: string; // = Medusa 顾客 id
  sourceUpdatedAt?: Date | string;
  displayName?: string;
  email?: string;
  phone?: string;
}

export interface AfterSalesIngest {
  externalId: string;
  sourceUpdatedAt?: Date | string;
  orderExternalId?: string; // = display_id，与 orders.shopifyOrderId 对齐
  type: string; // return | exchange | claim
  status?: string;
  reason?: string;
  amount?: number;
  currency?: string;
}

export interface InventoryIngest {
  productExternalId: string;
  stock: number;
  sourceUpdatedAt?: Date | string;
}

type Skip = { skipped: 'stale' };
type Ok = { ok: true };

/**
 * 摄取外部电商（Medusa 独立站）的产品/订单/顾客/售后/库存，落进 drsell 现有 PG
 * （openspec change dtc-store-medusa）。要点：
 * - 店铺/租户由服务端配置（INGEST_STORE_DOMAIN）解析，不信前端正文；ensureShopTenant
 *   会给新域名建独立 Tenant（天然满足来源隔离 S9），且写入始终带 shopId。
 * - 外部 id 复用 shopify*Id 列；source='medusa' 判别；幂等键对齐真实唯一约束（B3）。
 * - 按来源 sourceUpdatedAt 版本拒绝更旧的写（S5）。
 */
@Injectable()
export class IngestService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenants: TenantService,
  ) {}

  private storeDomain(): string {
    const d = process.env.INGEST_STORE_DOMAIN;
    if (!d) throw new Error('INGEST_STORE_DOMAIN is not configured');
    return d;
  }

  private async shop() {
    const shop = await this.tenants.ensureShopTenant(this.storeDomain());
    // 该店由 DTC 独立站（Medusa）摄取而来 → 标记 source='medusa'（供 AI prompt 参数化）。
    // 自愈：首次或存量行仍是默认 'shopify' 时纠正；之后为幂等空操作。
    if (shop.source !== 'medusa') {
      return this.prisma.shop.update({ where: { id: shop.id }, data: { source: 'medusa' } });
    }
    return shop;
  }

  private toDate(v?: Date | string): Date | undefined {
    return v ? new Date(v) : undefined;
  }

  /** 乱序/重投防护：已存版本较新时判为陈旧（两侧都有版本才比较）。 */
  private isStale(existing: Date | null | undefined, incoming: Date | undefined): boolean {
    return Boolean(existing && incoming && incoming < existing);
  }

  async upsertProduct(dto: ProductIngest): Promise<Ok | Skip> {
    const shop = await this.shop();
    const where = {
      tenantId_shopifyProductId: { tenantId: shop.tenantId, shopifyProductId: dto.externalId },
    };
    const incoming = this.toDate(dto.sourceUpdatedAt);
    const existing = await this.prisma.product.findUnique({ where, select: { sourceUpdatedAt: true } });
    if (this.isStale(existing?.sourceUpdatedAt, incoming)) return { skipped: 'stale' };
    const fields = {
      shopId: shop.id,
      source: SOURCE,
      sourceUpdatedAt: incoming ?? null,
      name: dto.name,
      price: dto.price ?? null,
      description: dto.description ?? null,
      stock: dto.stock ?? null,
      handle: dto.handle ?? null,
      vendor: dto.vendor ?? null,
      status: dto.status ?? null,
      tags: dto.tags ?? null,
      variantsJson: dto.variantsJson ?? null,
      imagesJson: dto.imagesJson ?? null,
    };
    await this.prisma.product.upsert({
      where,
      create: { tenantId: shop.tenantId, shopifyProductId: dto.externalId, ...fields },
      update: fields,
    });
    return { ok: true };
  }

  async upsertOrder(dto: OrderIngest): Promise<Ok | Skip> {
    const shop = await this.shop();
    const where = {
      tenantId_shopifyOrderId: { tenantId: shop.tenantId, shopifyOrderId: dto.externalId },
    };
    const incoming = this.toDate(dto.sourceUpdatedAt);
    const existing = await this.prisma.order.findUnique({ where, select: { sourceUpdatedAt: true } });
    if (this.isStale(existing?.sourceUpdatedAt, incoming)) return { skipped: 'stale' };
    const fields = {
      shopId: shop.id,
      source: SOURCE,
      sourceUpdatedAt: incoming ?? null,
      customerId: dto.customerExternalId ?? null,
      status: dto.status ?? null,
      financialStatus: dto.financialStatus ?? null,
      fulfillmentStatus: dto.fulfillmentStatus ?? null,
      total: dto.total,
      totalTax: dto.totalTax ?? null,
      itemsJson: dto.itemsJson ?? null,
      billingAddress: dto.billingAddress ?? null,
      shippingAddress: dto.shippingAddress ?? null,
      shopifyCreatedAt: this.toDate(dto.createdAt) ?? null,
    };
    await this.prisma.order.upsert({
      where,
      create: { tenantId: shop.tenantId, shopifyOrderId: dto.externalId, ...fields },
      update: fields,
    });
    return { ok: true };
  }

  async upsertCustomer(dto: CustomerIngest): Promise<Ok | Skip> {
    const shop = await this.shop();
    const where = {
      tenantId_shopifyCustomerId: { tenantId: shop.tenantId, shopifyCustomerId: dto.externalId },
    };
    const incoming = this.toDate(dto.sourceUpdatedAt);
    const existing = await this.prisma.customer.findUnique({ where, select: { sourceUpdatedAt: true } });
    if (this.isStale(existing?.sourceUpdatedAt, incoming)) return { skipped: 'stale' };
    const fields = {
      shopId: shop.id,
      source: SOURCE,
      sourceUpdatedAt: incoming ?? null,
      displayName: dto.displayName ?? null,
      email: dto.email ?? null,
      phone: dto.phone ?? null,
    };
    await this.prisma.customer.upsert({
      where,
      create: { tenantId: shop.tenantId, shopifyCustomerId: dto.externalId, ...fields },
      update: fields,
    });
    return { ok: true };
  }

  async upsertAfterSales(dto: AfterSalesIngest): Promise<Ok | Skip> {
    const shop = await this.shop();
    const where = {
      tenantId_source_externalId: { tenantId: shop.tenantId, source: SOURCE, externalId: dto.externalId },
    };
    const incoming = this.toDate(dto.sourceUpdatedAt);
    const existing = await this.prisma.afterSales.findUnique({ where, select: { sourceUpdatedAt: true } });
    if (this.isStale(existing?.sourceUpdatedAt, incoming)) return { skipped: 'stale' };
    const fields = {
      shopId: shop.id,
      orderExternalId: dto.orderExternalId ?? null,
      type: dto.type,
      status: dto.status ?? null,
      reason: dto.reason ?? null,
      amount: dto.amount ?? null,
      currency: dto.currency ?? null,
      sourceUpdatedAt: incoming ?? null,
    };
    await this.prisma.afterSales.upsert({
      where,
      create: { tenantId: shop.tenantId, source: SOURCE, externalId: dto.externalId, ...fields },
      update: fields,
    });
    return { ok: true };
  }

  async updateInventory(dto: InventoryIngest): Promise<Ok> {
    const shop = await this.shop();
    await this.prisma.product.update({
      where: {
        tenantId_shopifyProductId: { tenantId: shop.tenantId, shopifyProductId: dto.productExternalId },
      },
      data: { stock: dto.stock },
    });
    return { ok: true };
  }
}
