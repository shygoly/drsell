import { SubscriberArgs, type SubscriberConfig } from "@medusajs/framework";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { mapOrder } from "../lib/drsell-connector";
import { pushIngest } from "../lib/drsell-ingest";

// 订单增改/取消/完成 → drsell。display_id 作为顾客可见订单号推送。
export default async function drsellOrder({
  event: { data },
  container,
}: SubscriberArgs<{ id: string }>) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  try {
    const { data: rows } = await query.graph({
      entity: "order",
      fields: [
        "id",
        "display_id",
        "status",
        "payment_status",
        "fulfillment_status",
        "total",
        "currency_code",
        "updated_at",
        "created_at",
        "customer_id",
        "items.title",
        "items.quantity",
        "items.unit_price",
      ],
      filters: { id: data.id },
    });
    const o = rows?.[0];
    if (!o) return;
    await pushIngest("orders", mapOrder(o as never));
    logger.info(`drsell: order ${data.id} synced`);
  } catch (e) {
    logger.error(`drsell: order ${data.id} sync failed: ${(e as Error).message}`);
  }
}

export const config: SubscriberConfig = {
  event: ["order.placed", "order.updated", "order.canceled", "order.completed"],
};
