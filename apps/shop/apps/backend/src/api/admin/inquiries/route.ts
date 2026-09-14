import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { z } from "@medusajs/framework/zod"
import { INQUIRY_MODULE } from "../../../modules/inquiry"
import type InquiryModuleService from "../../../modules/inquiry/service"

/**
 * 管理端线索接口。挂在 /admin/** 下 —— Medusa 默认对该前缀做后台会话鉴权，
 * 故不需要自己写认证（否则等于把客户线索挂在公网上）。
 *
 *   GET  /admin/inquiries           列表（分页 + 按状态/类型筛选）
 *   POST /admin/inquiries/:id/status 更新状态与跟进备注
 */

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const service: InquiryModuleService = req.scope.resolve(INQUIRY_MODULE)

  const limit = Math.min(Number(req.query.limit) || 50, 200)
  const offset = Number(req.query.offset) || 0

  const filters: Record<string, unknown> = {}
  if (typeof req.query.status === "string" && req.query.status) filters.status = req.query.status
  if (typeof req.query.inquiry_type === "string" && req.query.inquiry_type) {
    filters.inquiryType = req.query.inquiry_type
  }

  const [inquiries, count] = await service.listAndCountInquiries(filters, {
    take: limit,
    skip: offset,
    order: { created_at: "DESC" } as any,
  })

  return res.json({ ok: true, inquiries, count, limit, offset })
}
