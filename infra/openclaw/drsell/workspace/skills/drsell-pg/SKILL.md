# DrSell PG 只读查询

通过 MCP server `drsell-pg` 查询当前店铺的商品与订单。

## 函数

| 函数 | 用途 |
|---|---|
| `adp_shop_summary(p_shop)` | 店铺商品概览（数量、品类、价格区间） |
| `adp_search_products(p_shop, p_query, p_limit)` | 按关键词搜索商品 |
| `adp_get_order(p_shop, p_order_id)` | 按 Shopify 订单号查状态 |

`p_shop` 必须是用户消息里 `[shop=...]` 的域名。

## 示例

```sql
SELECT * FROM adp_search_products('demo.myshopify.com', 'shoe', 10);
SELECT * FROM adp_get_order('demo.myshopify.com', '1001');
```
