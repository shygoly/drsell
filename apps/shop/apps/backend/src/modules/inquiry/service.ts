import { MedusaService } from "@medusajs/framework/utils"
import { Inquiry } from "./models/inquiry"

/**
 * MedusaService 依据模型自动生成 CRUD：
 *   createInquiries / listInquiries / retrieveInquiry / updateInquiries / deleteInquiries
 * 无需手写 —— 见 Medusa v2 modules 约定。
 */
class InquiryModuleService extends MedusaService({
  Inquiry,
}) {}

export default InquiryModuleService
