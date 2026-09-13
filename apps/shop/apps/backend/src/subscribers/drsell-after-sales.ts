import { SubscriberArgs, type SubscriberConfig } from "@medusajs/framework";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { mapAfterSales } from "../lib/drsell-connector";
import { pushIngest } from "../lib/drsell-ingest";

// 售后（退货/换货/理赔）→ drsell。事件确认为 order.*（见 openspec dtc-store-medusa 0.1）。
// best-effort：实体名/字段以运行版本为准，出错只记日志、不阻断主流程。
// TODO(dtc-store-medusa 4.3): 用真实售后事件校验 entity/refund_amount/order.display_id 路径。
const MAP: Record<string, { entity: string; type: "return" | "exchange" | "claim" }> = {
  "order.return_requested": { entity: "return", type: "return" },
  "order.return_received": { entity: "return", type: "return" },
  "order.exchange_created": { entity: "order_exchange", type: "exchange" },
  "order.claim_created": { entity: "order_claim", type: "claim" },
};

export default async function drsellAfterSales({
  event: { eventName, data },
  container,
}: SubscriberArgs<{ id: string }>) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const m = MAP[eventName];
  if (!m) return;
  try {
    const { data: rows } = await query.graph({
      entity: m.entity,
      fields: ["id", "status", "refund_amount", "order.display_id", "order.currency_code", "updated_at"],
      filters: { id: data.id },
    });
    const r = rows?.[0] as
      | { id: string; status?: string; refund_amount?: number; updated_at?: string; order?: { display_id?: number | string; currency_code?: string } }
      | undefined;
    if (!r) return;
    await pushIngest(
      "after-sales",
      mapAfterSales({
        id: r.id,
        updated_at: r.updated_at,
        order_display_id: r.order?.display_id,
        type: m.type,
        status: r.status,
        refund_amount: r.refund_amount,
        currency_code: r.order?.currency_code,
      }),
    );
    logger.info(`drsell: after-sales ${m.type} ${data.id} synced`);
  } catch (e) {
    logger.error(`drsell: after-sales ${eventName} ${data.id} sync failed: ${(e as Error).message}`);
  }
}

export const config: SubscriberConfig = {
  event: ["order.return_requested", "order.return_received", "order.exchange_created", "order.claim_created"],
};
