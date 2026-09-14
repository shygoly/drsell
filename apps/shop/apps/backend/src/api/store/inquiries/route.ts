import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { z } from "@medusajs/framework/zod"
import { INQUIRY_MODULE } from "../../../modules/inquiry"
import type InquiryModuleService from "../../../modules/inquiry/service"

/**
 * 公开询价提交端点：POST /store/inquiries
 * 无需登录（B2B 询价大多是匿名首次接触），故这里做**严格的输入校验 + 反滥用**。
 */

const schema = z.object({
  contactRole: z.enum(["purchaser", "distributor", "institution", "other"]),
  inquiryType: z.enum(["purchase", "cooperation", "sample", "doc", "after_sales"]),
  contactName: z.string().trim().min(1).max(80),
  companyName: z.string().trim().max(160).optional(),
  contactEmail: z.string().trim().email().max(200).optional(),
  contactPhone: z.string().trim().max(60).optional(),
  region: z.string().trim().max(120).optional(),
  productsOfInterest: z.string().trim().max(500).optional(),
  applicationScene: z.string().trim().max(2000).optional(),
  expectedVolume: z.string().trim().max(200).optional(),
  purchaseTimeline: z.enum(["immediate", "quarter", "half_year", "planning"]).optional(),
  message: z.string().trim().max(4000).optional(),
  conversationId: z.string().trim().max(120).optional(),
})

// 极简内存限流：同一 IP 每分钟最多 5 次提交。进程重启即清空——
// 这是挡住「脚本刷表单」的最低成本手段，不是安全边界；真正的防线是
// 后台线索分级 + 人工审核（研究里强调的「询盘审核」）。
const WINDOW_MS = 60_000
const MAX_PER_WINDOW = 5
const hits = new Map<string, number[]>()

function rateLimited(ip: string): boolean {
  const now = Date.now()
  const arr = (hits.get(ip) || []).filter((t) => now - t < WINDOW_MS)
  arr.push(now)
  hits.set(ip, arr)
  // 顺手清理，防止 Map 无限增长
  if (hits.size > 5000) {
    for (const [k, v] of hits) {
      if (!v.some((t) => now - t < WINDOW_MS)) hits.delete(k)
    }
  }
  return arr.length > MAX_PER_WINDOW
}

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const ip =
    (req.headers["x-real-ip"] as string) ||
    (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
    req.socket?.remoteAddress ||
    "unknown"

  if (rateLimited(ip)) {
    return res.status(429).json({ ok: false, error: "too_many_requests" })
  }

  let body: z.infer<typeof schema>
  try {
    body = schema.parse(req.body)
  } catch (e: any) {
    return res.status(400).json({
      ok: false,
      error: "invalid_input",
      detail: e?.issues?.map((i: any) => `${i.path.join(".")}: ${i.message}`) ?? String(e?.message || e),
    })
  }

  // 至少要有一个可回的联系方式，否则这条线索无法跟进
  if (!body.contactEmail && !body.contactPhone) {
    return res.status(400).json({ ok: false, error: "contact_required" })
  }

  const service: InquiryModuleService = req.scope.resolve(INQUIRY_MODULE)

  const created = await service.createInquiries({
    contactRole: body.contactRole,
    inquiryType: body.inquiryType,
    contactName: body.contactName,
    companyName: body.companyName ?? null,
    contactEmail: body.contactEmail ?? null,
    contactPhone: body.contactPhone ?? null,
    region: body.region ?? null,
    productsOfInterest: body.productsOfInterest ?? null,
    applicationScene: body.applicationScene ?? null,
    expectedVolume: body.expectedVolume ?? null,
    purchaseTimeline: body.purchaseTimeline ?? null,
    message: body.message ?? null,
    conversationId: body.conversationId ?? null,
    status: "new",
    source: "web_form",
  })

  // 不留联系方式回显，只回受理编号 —— 线索内容不该出现在公开响应里
  return res.status(201).json({ ok: true, id: created.id })
}

// 公开端点不提供列表查询（否则等于把客户线索公开）。管理端见 /admin/inquiries。
export async function GET(_req: MedusaRequest, res: MedusaResponse) {
  return res.status(405).json({ ok: false, error: "method_not_allowed" })
}
