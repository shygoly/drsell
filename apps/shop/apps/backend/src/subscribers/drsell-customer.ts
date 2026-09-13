import { SubscriberArgs, type SubscriberConfig } from "@medusajs/framework";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { mapCustomer } from "../lib/drsell-connector";
import { pushIngest } from "../lib/drsell-ingest";

// 顾客增改 → drsell（供订单/售后按顾客隔离）。
export default async function drsellCustomer({
  event: { data },
  container,
}: SubscriberArgs<{ id: string }>) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  try {
    const { data: rows } = await query.graph({
      entity: "customer",
      fields: ["id", "first_name", "last_name", "email", "phone", "updated_at"],
      filters: { id: data.id },
    });
    const c = rows?.[0];
    if (!c) return;
    await pushIngest("customers", mapCustomer(c as never));
    logger.info(`drsell: customer ${data.id} synced`);
  } catch (e) {
    logger.error(`drsell: customer ${data.id} sync failed: ${(e as Error).message}`);
  }
}

export const config: SubscriberConfig = {
  event: ["customer.created", "customer.updated"],
};
