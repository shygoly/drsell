import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"
import { z } from "@medusajs/framework/zod"
import { INQUIRY_MODULE } from "../../../../modules/inquiry"
import type InquiryModuleService from "../../../../modules/inquiry/service"

/**
 * PATCH /admin/inquiries/:id —— 更新线索状态、跟进备注，或**转为草稿订单**。
 *
 * 成单闭环（ADR-25）：B2B 不走在线结算，走
 *   询价 → 人工报价 → 草稿订单 → 合同账期
 * 故这里提供 `action: "convert"`：把线索落成一张 Medusa 草稿订单，
 * 并把 draftOrderId 回填到线索上（留痕 + 可追溯）。
 *
 * 草稿订单用**自定义行项目**（title + unit_price）而不是 variant_id：
 * B2B 报价是按器械定制的涂层方案，没有可加购的标准 SKU（ADR-25）。
 */

const schema = z.object({
  status: z.enum(["new", "qualified", "quoted", "won", "closed"]).optional(),
  internalNote: z.string().trim().max(4000).optional(),
  // 报价（转草稿订单时必填）
  quotedAmount: z.number().int().positive().optional(),
  quotedCurrency: z.string().trim().length(3).optional(),
  itemTitle: z.string().trim().max(200).optional(),
  quantity: z.number().int().positive().max(100000).optional(),
})

export async function PATCH(req: MedusaRequest, res: MedusaResponse) {
  const service: InquiryModuleService = req.scope.resolve(INQUIRY_MODULE)

  let body: z.infer<typeof schema>
  try {
    body = schema.parse(req.body)
  } catch (e: any) {
    return res.status(400).json({
      ok: false,
      error: "invalid_input",
      detail: e?.issues?.map((i: any) => `${i.path.join(".")}: ${i.message}`) ?? undefined,
    })
  }

  const id = req.params.id
  const existing: any = await service.retrieveInquiry(id).catch(() => null)
  if (!existing) {
    return res.status(404).json({ ok: false, error: "not_found" })
  }

  // ── 转草稿订单 ─────────────────────────────────────────────
  if (req.query.action === "convert") {
    if (!body.quotedAmount) {
      return res.status(400).json({ ok: false, error: "quoted_amount_required" })
    }
    if (existing.draftOrderId) {
      // 幂等：已转过就直接回既有订单，不重复建（避免商务手抖点两次出两张单）
      return res.json({ ok: true, inquiry: existing, draftOrderId: existing.draftOrderId, reused: true })
    }

    const orderService: any = req.scope.resolve(Modules.ORDER)
    const regionService: any = req.scope.resolve(Modules.REGION)
    const scService: any = req.scope.resolve(Modules.SALES_CHANNEL)

    const [regions, channels] = await Promise.all([
      regionService.listRegions({}, { take: 1 }),
      scService.listSalesChannels({}, { take: 1 }),
    ])
    const region = regions?.[0]
    const channel = channels?.[0]
    if (!region) {
      return res.status(500).json({ ok: false, error: "no_region_configured" })
    }

    const currency = (body.quotedCurrency || region.currency_code || "eur").toLowerCase()
    const title = body.itemTitle || existing.productsOfInterest || "B2B 涂层方案（询价）"
    const quantity = body.quantity || 1

    // 用 Order Module 直接建草稿单：允许自定义行项目（无 variant），
    // 这正是 B2B 报价的形态——按方案报价，不是按 SKU 加购。
    const draft = await orderService.createOrders({
      status: "draft",
      currency_code: currency,
      region_id: region.id,
      sales_channel_id: channel?.id,
      email: existing.contactEmail || undefined,
      customer_id: undefined,
      items: [
        {
          title,
          quantity,
          unit_price: body.quotedAmount,
          metadata: {
            inquiry_id: existing.id,
            company: existing.companyName || null,
            contact: existing.contactName,
          },
        },
      ],
      metadata: {
        inquiry_id: existing.id,
        inquiry_type: existing.inquiryType,
        // 记录来源，便于日后统计「官网询价 → 成单」转化
        source: "web_inquiry",
      },
    })

    const updated = await service.updateInquiries({
      id,
      draftOrderId: draft.id,
      quotedAmount: body.quotedAmount,
      quotedCurrency: currency,
      // 转了草稿订单即进入「已报价」
      status: body.status || "quoted",
      ...(body.internalNote !== undefined ? { internalNote: body.internalNote } : {}),
    })

    return res.json({ ok: true, inquiry: updated, draftOrderId: draft.id })
  }

  // ── 普通状态/备注更新 ──────────────────────────────────────
  const updated = await service.updateInquiries({
    id,
    ...(body.status ? { status: body.status } : {}),
    ...(body.internalNote !== undefined ? { internalNote: body.internalNote } : {}),
    ...(body.quotedAmount ? { quotedAmount: body.quotedAmount } : {}),
    ...(body.quotedCurrency ? { quotedCurrency: body.quotedCurrency.toLowerCase() } : {}),
  })

  return res.json({ ok: true, inquiry: updated })
}
