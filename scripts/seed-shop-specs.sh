#!/usr/bin/env bash
# 把 B2B 产品规格要点写入 Medusa 商品的 metadata（经 Admin API，不直写库）。
#
# 为什么：规格原先前端硬编码在 apps/shop-web/index.html 的 SPECS 对象里，
# 业务方改一条规格要改代码 + 重新部署（DEPLOY.md §7 缺口 8.13）。
# 迁到 metadata 后，规格是**数据**，后台可改、前端只读渲染。
#
# 结构约定（前端按此渲染，改这里要同步 index.html 的 readSpecs）：
#   metadata.specs      = { "标签": "值", ... }   → 产品卡上的规格矩阵（内容）
#   metadata.specsOrder = [ "标签", ... ]         → 展示顺序
# 用 specs 子对象而不是把标签平铺在 metadata 顶层，
# 是为了给 metadata 留出别的用途（如 SEO、内部标记）而不与规格混在一起。
#
# ⚠ 为什么需要 specsOrder：Medusa 的 metadata 列是 **jsonb**，
#   **不保留键顺序**（实测写入顺序 {涂层类型,适用器械,基材,交付形式}，
#   读出来变成字典序 {基材,交付形式,涂层类型,适用器械}）。
#   规格矩阵的阅读顺序有意义，故显式存一份顺序数组。
#
# 幂等：按 handle 找到商品，写入/覆盖 metadata.specs（+ specsOrder）。
set -euo pipefail

BASE="${MEDUSA_URL:-http://127.0.0.1:9000}"
EMAIL="$(grep -oP '(?<=^ADMIN_EMAIL=).*' /root/drsell-shop/shop.env)"
PW="$(grep -oP '(?<=^ADMIN_PASSWORD=).*' /root/drsell-shop/shop.env)"

TOKEN="$(curl -s -X POST "$BASE/auth/user/emailpass" -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PW\"}" | python3 -c 'import json,sys;print(json.load(sys.stdin)["token"])')"

# handle -> 规格。顺序即前端展示顺序（JSON 对象保序）。
SPECS_JSON="$(python3 - <<'PY'
import json
specs = {
  "hydrophilic-guidewire-coating": {"涂层类型":"亲水润滑","适用器械":"介入导丝","基材":"不锈钢 / 镍钛","交付形式":"涂液 + 涂覆工艺"},
  "anticoagulant-catheter":        {"涂层类型":"肝素抗凝","适用器械":"留置 / 透析导管","接触时长":"长期血液接触","交付形式":"涂液 + 涂覆工艺"},
  "antibacterial-balloon":         {"涂层类型":"抗菌","适用器械":"球囊 / 泌尿介入","作用":"抑菌 / 抗菌","交付形式":"涂液 + 涂覆工艺"},
  "coating-equipment-spray":       {"类型":"涂覆装备","构成":"喷涂 + 固化 + 检测","一致性":"批次可追溯","交付形式":"整机 + 产线集成"},
  "coating-inspection-service":    {"类型":"检测服务","项目":"牢固度 / 均匀性 / 厚度","输出":"检测报告","用途":"QC 与注册申报"},
  "custom-coating-odm":            {"类型":"定制开发","方式":"ODM / CDMO","流程":"配方 → 工艺放大 → 注册支持","计价":"RFQ 询价"},
}
print(json.dumps(specs, ensure_ascii=False))
PY
)"

echo "==> 写入 metadata.specs"
printf '%s' "$SPECS_JSON" | python3 -c '
import json, sys
specs = json.load(sys.stdin)
for h in specs: print(h)
' | while read -r handle; do
  # 取商品 id
  resp="$(curl -s "$BASE/admin/products?handle=$handle" -H "Authorization: Bearer $TOKEN")"
  pid="$(printf '%s' "$resp" | python3 -c 'import json,sys
try:
    ps=json.load(sys.stdin).get("products") or []
    print(ps[0]["id"] if ps else "")
except Exception:
    print("")')"

  if [ -z "$pid" ]; then
    echo "  !! 找不到商品: $handle" >&2
    exit 1
  fi

  # 组装 payload：metadata.specs = 该 handle 的规格，specsOrder = 展示顺序
  payload="$(printf '%s' "$SPECS_JSON" | python3 -c '
import json,sys
specs=json.load(sys.stdin)
h=sys.argv[1]
s=specs[h]
print(json.dumps({"metadata":{"specs":s,"specsOrder":list(s.keys())}}, ensure_ascii=False))
' "$handle")"

  out="$(curl -s -X POST "$BASE/admin/products/$pid" \
    -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
    -d "$payload")"

  if printf '%s' "$out" | grep -q '"product"'; then
    n="$(printf '%s' "$payload" | python3 -c 'import json,sys;print(len(json.load(sys.stdin)["metadata"]["specs"]))')"
    echo "  + $handle  (${n} 条规格)"
  else
    echo "  !! 写入失败: $handle" >&2
    printf '%s\n' "$out" | head -c 400 >&2
    echo >&2
    exit 1
  fi
done

echo "==> 回读校验（经 Store API，确认前端能读到，且顺序保得住）"
PK="$(grep -o 'pk_[a-f0-9]*' /opt/drsell-shop-web/index.html | head -1)"
REG="$(grep -o 'reg_[A-Za-z0-9]*' /opt/drsell-shop-web/index.html | head -1)"
curl -s "$BASE/store/products?limit=50&region_id=$REG&fields=handle,metadata" \
  -H "x-publishable-api-key: $PK" | python3 -c '
import json,sys
ps = json.load(sys.stdin)["products"]
ok = 0
for p in ps:
    m = p.get("metadata") or {}
    s = m.get("specs")
    o = m.get("specsOrder")
    if s and o:
        # 顺序数组必须覆盖全部键，否则前端会以为有内容丢失
        if set(o) != set(s.keys()):
            print("  !! specsOrder 与 specs 键不一致:", p["handle"])
            sys.exit(1)
        ok += 1
        print("  ok", p["handle"], "->", " / ".join(o))
    else:
        print("  !! 缺 specs 或 specsOrder:", p["handle"])
print(f"  {ok}/{len(ps)} 个商品带 specs")
sys.exit(0 if ok == len(ps) and ok > 0 else 1)'
