import InquiryModuleService from "./service"
import { Module } from "@medusajs/framework/utils"

export const INQUIRY_MODULE = "inquiry"

export default Module(INQUIRY_MODULE, {
  service: InquiryModuleService,
})
