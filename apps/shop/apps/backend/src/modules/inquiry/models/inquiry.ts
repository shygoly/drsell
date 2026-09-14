import { model } from "@medusajs/framework/utils"

/**
 * B2B 询价（RFQ）线索。
 *
 * 字段设计依据医疗器械 B2B 获客惯例（见 DEPLOY.md §6 / openspec dtc-store-medusa）：
 * 表单不能只留「姓名+电话」——那样无法分级。采购、渠道、资料索取、售后
 * 是四类完全不同的线索，必须能按身份/需求类型路由到不同负责人。
 *
 * 刻意**不含价格字段**：医用/工业 B2B 走「隐藏价 → 询价 → 人工报价 → 草稿订单」，
 * 页面不展示价格，线索里也不预置报价，避免未审核的报价外流。
 */
export const Inquiry = model.define("inquiry", {
  id: model.id().primaryKey(),

  // ---- 身份分流：决定这条线索归谁跟 ----
  // purchaser(采购) | distributor(渠道/代理) | institution(医院/机构) | other
  contactRole: model.text(),

  // ---- 需求类型：决定优先级与响应 SLA ----
  // purchase(采购) | cooperation(渠道合作) | sample(样品/打样) | doc(资料索取) | after_sales(售后)
  inquiryType: model.text(),

  // ---- 联系信息 ----
  companyName: model.text().nullable(),
  contactName: model.text(),
  contactEmail: model.text().nullable(),
  contactPhone: model.text().nullable(),
  region: model.text().nullable(),

  // ---- 需求正文 ----
  // 关注的产品（可多选，存产品 id 或标题，逗号分隔）
  productsOfInterest: model.text().nullable(),
  applicationScene: model.text().nullable(),
  expectedVolume: model.text().nullable(),
  // 预计采购时间：immediate | quarter | half_year | planning
  purchaseTimeline: model.text().nullable(),
  message: model.text().nullable(),

  // ---- 线索管理（留痕，研究里强调「可追溯」）----
  // new | qualified | quoted | won | closed
  status: model.text().default("new"),
  // 从哪来：官网表单 / AI 客服转人工
  source: model.text().default("web_form"),
  // 客服会话 id（若由挂件转人工则带上）
  conversationId: model.text().nullable(),
  // 跟进备注（人工填写）
  internalNote: model.text().nullable(),

  // ---- 成单闭环（ADR-25）----
  // 商务把线索转成 Medusa 草稿订单后回填，用于「报价 → 草稿订单 → 账期」留痕。
  // 注意：**不走在线支付**——草稿订单是给商务与客户确认的凭据载体，
  // 付款走合同与账期（ADR-25）。这三个字段是闭环的落点。
  draftOrderId: model.text().nullable(),
  // 报价金额（最小货币单位，如分）。B2B 报价由人工核定，故是录入值而非商品价格计算
  quotedAmount: model.number().nullable(),
  quotedCurrency: model.text().nullable(),
})
