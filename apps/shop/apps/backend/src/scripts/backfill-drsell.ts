import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { mapProduct } from "../lib/drsell-connector";
import { pushIngest } from "../lib/drsell-ingest";

// 一次性回填：把 Medusa 现有全部商品推给 drsell 摄取端点。
// subscriber 只对 created/updated 事件触发，seed 出来的存量商品不会自动同步，
// 故上线后跑一次：`cd apps/backend && npx medusa exec ./src/scripts/backfill-drsell.ts`
export default async function backfillDrsell({ container }: { container: any }) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const { data: products } = await query.graph({
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
  });
  logger.info(`drsell backfill: ${products.length} products found`);
  let ok = 0;
  let fail = 0;
  for (const p of products) {
    try {
      await pushIngest("products", mapProduct(p as never));
      ok++;
    } catch (e) {
      fail++;
      logger.error(`drsell backfill ${p.id} failed: ${(e as Error).message}`);
    }
  }
  logger.info(`drsell backfill done: ok=${ok} fail=${fail}`);
}
