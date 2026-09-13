/**
 * drsell 连接器：把 Medusa 的实体/事件载荷映射成 drsell 摄取端点的 DTO。
 *
 * 纯函数、无副作用、无网络——由 apps/shop（Medusa）的 subscriber 调用后 POST 到
 * drsell `/api/ingest/*`。输入类型用 Medusa 的字段命名（snake_case、display_id 等），
 * 映射在这里完成关键变形：display_id→字符串外部订单号、items→itemsJson、
 * updated_at→sourceUpdatedAt。
 *
 * 注：Medusa v2 事件载荷的**精确字段**在 scaffold 时按钉定版本核对（openspec change
 * dtc-store-medusa，task 0.1）；这里的输入 shape 覆盖映射所需字段，subscriber 负责从真实
 * 事件中取出它们。
 */

// ── 摄取 DTO（与 apps/api ingest.controller 的 DTO 对齐）────────────────────────
export interface ProductIngestPayload {
  externalId: string;
  sourceUpdatedAt?: string;
  name: string;
  price?: number;
  description?: string;
  stock?: number;
  handle?: string;
  status?: string;
  variantsJson?: string;
  imagesJson?: string;
}

export interface OrderIngestPayload {
  externalId: string; // = display_id 字符串（顾客可见订单号）
  sourceUpdatedAt?: string;
  customerExternalId?: string;
  status?: string;
  financialStatus?: string;
  fulfillmentStatus?: string;
  total: number;
  itemsJson?: string;
  createdAt?: string;
}

export interface CustomerIngestPayload {
  externalId: string;
  sourceUpdatedAt?: string;
  displayName?: string;
  email?: string;
  phone?: string;
}

export interface AfterSalesIngestPayload {
  externalId: string;
  sourceUpdatedAt?: string;
  orderExternalId?: string;
  type: 'return' | 'exchange' | 'claim';
  status?: string;
  reason?: string;
  amount?: number;
  currency?: string;
}

export interface InventoryIngestPayload {
  productExternalId: string;
  stock: number;
  sourceUpdatedAt?: string;
}

// ── Medusa 输入 shape（映射所需字段的子集）───────────────────────────────────
export interface MedusaProduct {
  id: string;
  title: string;
  updated_at?: string;
  description?: string | null;
  status?: string;
  handle?: string;
  variants?: Array<{ id: string; title?: string; prices?: Array<{ amount: number }>; inventory_quantity?: number }>;
  images?: Array<{ url: string }>;
}

export interface MedusaOrderItem {
  title: string;
  quantity: number;
  unit_price?: number;
}

export interface MedusaOrder {
  display_id: number | string;
  updated_at?: string;
  created_at?: string;
  customer_id?: string | null;
  status?: string;
  payment_status?: string;
  fulfillment_status?: string;
  total?: number;
  items?: MedusaOrderItem[];
}

export interface MedusaCustomer {
  id: string;
  updated_at?: string;
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  phone?: string | null;
}

export interface MedusaAfterSales {
  id: string;
  updated_at?: string;
  order_display_id?: number | string;
  type: 'return' | 'exchange' | 'claim';
  status?: string;
  reason?: string;
  refund_amount?: number;
  currency_code?: string;
}

// ── 映射器 ─────────────────────────────────────────────────────────────────
export function mapProduct(p: MedusaProduct): ProductIngestPayload {
  const firstVariant = p.variants?.[0];
  const price = firstVariant?.prices?.[0]?.amount;
  const stock = p.variants?.reduce((sum, v) => sum + (v.inventory_quantity ?? 0), 0);
  return {
    externalId: p.id,
    sourceUpdatedAt: p.updated_at,
    name: p.title,
    price,
    description: p.description ?? undefined,
    status: p.status,
    handle: p.handle,
    stock: p.variants ? stock : undefined,
    variantsJson: p.variants ? JSON.stringify(p.variants) : undefined,
    imagesJson: p.images ? JSON.stringify(p.images.map((i) => i.url)) : undefined,
  };
}

export function mapOrder(o: MedusaOrder): OrderIngestPayload {
  const items = o.items?.map((i) => ({ title: i.title, qty: i.quantity, unitPrice: i.unit_price }));
  return {
    externalId: String(o.display_id),
    sourceUpdatedAt: o.updated_at,
    createdAt: o.created_at,
    customerExternalId: o.customer_id ?? undefined,
    status: o.status,
    financialStatus: o.payment_status,
    fulfillmentStatus: o.fulfillment_status,
    total: o.total ?? 0,
    itemsJson: items ? JSON.stringify(items) : undefined,
  };
}

export function mapCustomer(c: MedusaCustomer): CustomerIngestPayload {
  const name = [c.first_name, c.last_name].filter(Boolean).join(' ').trim();
  return {
    externalId: c.id,
    sourceUpdatedAt: c.updated_at,
    displayName: name || c.email || undefined,
    email: c.email ?? undefined,
    phone: c.phone ?? undefined,
  };
}

export function mapAfterSales(a: MedusaAfterSales): AfterSalesIngestPayload {
  return {
    externalId: a.id,
    sourceUpdatedAt: a.updated_at,
    orderExternalId: a.order_display_id != null ? String(a.order_display_id) : undefined,
    type: a.type,
    status: a.status,
    reason: a.reason,
    amount: a.refund_amount,
    currency: a.currency_code,
  };
}

export function mapInventory(productExternalId: string, stock: number, sourceUpdatedAt?: string): InventoryIngestPayload {
  return { productExternalId, stock, sourceUpdatedAt };
}
