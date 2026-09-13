import { SubscriberArgs, type SubscriberConfig } from "@medusajs/framework";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { mapProduct } from "../lib/drsell-connector";
import { pushIngest } from "../lib/drsell-ingest";

// 产品增改 → 推给 drsell 摄取端点（供 AI 客服查询）。非阻塞：出错只记日志。
export default async function drsellProduct({
  event: { data },
  container,
}: SubscriberArgs<{ id: string }>) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  try {
    const { data: rows } = await query.graph({
      entity: "product",
      fields: [
        "id",
        "title",
        "description",
        "status",
        "handle",
        "updated_at",
        "variants.prices.amount",
        "images.url",
      ],
      filters: { id: data.id },
    });
    const p = rows?.[0];
    if (!p) return;
    await pushIngest("products", mapProduct(p as never));
    logger.info(`drsell: product ${data.id} synced`);
  } catch (e) {
    logger.error(`drsell: product ${data.id} sync failed: ${(e as Error).message}`);
  }
}

export const config: SubscriberConfig = {
  event: ["product.created", "product.updated"],
};
