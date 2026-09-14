#!/usr/bin/env bash
# 通过 Medusa Admin API 创建 B2B 医疗器械产品数据（不直接写库）。
#
# 为什么不用 seed 脚本：用户要求「生成的数据写到 medusa 的数据库，可以用 api 的方式」。
# 走 Admin API 的好处是产品自动获得 Medusa 的完整数据模型（variant/price/sales channel/
# category），Store API 与后台立即可见，且不产生任何绕过校验的旁路写入。
#
# 幂等：先按 handle 查，存在则跳过。
set -euo pipefail

BASE="${MEDUSA_URL:-http://127.0.0.1:9000}"
EMAIL="$(grep -oP '(?<=^ADMIN_EMAIL=).*' /root/drsell-shop/shop.env)"
PW="$(grep -oP '(?<=^ADMIN_PASSWORD=).*' /root/drsell-shop/shop.env)"
PK="$(grep -o 'pk_[a-f0-9]*' /opt/drsell-shop-web/index.html | head -1)"

TOKEN="$(curl -s -X POST "$BASE/auth/user/emailpass" -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PW\"}" | python3 -c 'import json,sys;print(json.load(sys.stdin)["token"])')"

# sales channel / category 复用默认值
SC="$(curl -s "$BASE/admin/sales-channels?limit=1" -H "Authorization: Bearer $TOKEN" \
  | python3 -c 'import json,sys;print(json.load(sys.stdin)["sales_channels"][0]["id"])')"

echo "sales_channel=$SC"

create_product() {
  local handle="$1" title="$2" subtitle="$3" desc="$4" price="$5" cat="$6"

  # 存在性检查：先落盘再判，绝不把 curl 的退出码接进 set -e/pipefail 的管道里——
  # 2026-09-13 踩过：curl|python 的管道在「不存在」时整体非零，脚本静默中止，
  # 六个产品一个都没建，却因为前面 echo 了分类名而看着像在跑。
  local existing
  existing="$(curl -s "$BASE/admin/products?handle=$handle" -H "Authorization: Bearer $TOKEN")"
  if [ "$(printf '%s' "$existing" | python3 -c 'import json,sys
try: print(len(json.load(sys.stdin).get("products") or []))
except Exception: print(0)')" != "0" ]; then
    echo "  skip (exists): $handle"
    return 0
  fi

  # 每个产品一个分类（医疗器械按应用/材料分类，不用 Medusa 默认的服装类）
  local cat_id
  local cat_q cat_resp
  cat_q="$(python3 -c "import urllib.parse,sys;print(urllib.parse.quote(sys.argv[1]))" "$cat")"
  cat_resp="$(curl -s "$BASE/admin/product-categories?q=$cat_q" -H "Authorization: Bearer $TOKEN")"
  cat_id="$(printf '%s' "$cat_resp" | python3 -c 'import json,sys
try:
    d=json.load(sys.stdin).get("product_categories") or []
    print(d[0]["id"] if d else "")
except Exception:
    print("")')"

  if [ -z "$cat_id" ]; then
    cat_id="$(curl -s -X POST "$BASE/admin/product-categories" \
      -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
      -d "{\"name\":\"$cat\",\"is_active\":true}" \
      | python3 -c 'import json,sys;print(json.load(sys.stdin)["product_category"]["id"])')"
    echo "  + category: $cat"
  fi

  local payload
  payload="$(python3 - "$handle" "$title" "$subtitle" "$desc" "$price" "$cat_id" "$SC" <<'PY'
import json,sys
handle,title,subtitle,desc,price,cat,sc = sys.argv[1:8]
print(json.dumps({
  "title": title,
  "subtitle": subtitle,
  "handle": handle,
  "description": desc,
  "status": "published",
  "categories": [{"id": cat}],
  "sales_channels": [{"id": sc}],
  "options": [{"title": "规格", "values": ["标准"]}],
  "variants": [{
    "title": "标准",
    "sku": handle.upper().replace("-", "_"),
    "manage_inventory": False,
    "prices": [{"amount": int(float(price) * 100), "currency_code": "eur"}],
    "options": {"规格": "标准"},
  }],
}, ensure_ascii=False))
PY
)"

  local resp
  resp="$(curl -s -X POST "$BASE/admin/products" \
    -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
    -d "$payload")"
  if printf '%s' "$resp" | grep -q '"product"'; then
    echo "  + product: $handle"
  else
    echo "  !! FAILED: $handle"
    printf '%s\n' "$resp" | head -c 400
    echo
    return 1
  fi
}

echo "==> Creating B2B medical-device products"
# 说明：这些是**演示用**产品数据（真实商品需由业务方提供）。
# 价格刻意留空/占位——B2B 走询价，页面不展示价格。
create_product "hydrophilic-guidewire-coating" \
  "亲水润滑涂层导丝" "Hydrophilic Lubricious Coating" \
  "面向血管介入的导丝亲水润滑涂层。显著降低器械与血管壁摩擦，提升推送顺滑度与操控跟随性。适用于冠脉、外周及神经介入导丝。支持按基材与涂层厚度定制。" \
  "0" "介入器械"

create_product "anticoagulant-catheter" \
  "抗凝血涂层导管" "Anticoagulant Coating Catheter" \
  "肝素功能涂层导管，用于长期血液接触类器械，降低血栓与凝血相关并发症风险。适用于透析、体外循环及留置类导管。" \
  "0" "血液接触器械"

create_product "antibacterial-balloon" \
  "抗菌涂层球囊" "Antibacterial Coating Balloon" \
  "抗菌功能涂层球囊，按临床使用场景选择抑菌或抗菌方案，控制介入相关感染风险。适用于泌尿、消化及外周血管介入。" \
  "0" "介入器械"

create_product "coating-equipment-spray" \
  "涂层喷涂固化装备" "Coating Spray & Curing Equipment" \
  "面向不同基材与涂层体系的标准化涂覆装备，保障涂层均匀性与批次一致性。含喷涂、固化与在线检测模块，支持产线集成。" \
  "0" "涂覆装备"

create_product "coating-inspection-service" \
  "涂层性能检验检测" "Coating Performance Testing" \
  "涂层牢固度、均匀性、厚度与功能性能检验检测服务，配套 QC 体系。提供检测报告，支持注册申报资料引用。" \
  "0" "检测服务"

create_product "custom-coating-odm" \
  "涂层定制开发 ODM" "Custom Coating Development" \
  "基于成体系的涂层平台，承接面向具体器械的涂层定制开发与代工。从配方筛选、工艺放大到注册支持的一站式服务，走 RFQ 询价。" \
  "0" "定制服务"

echo "==> Done"
