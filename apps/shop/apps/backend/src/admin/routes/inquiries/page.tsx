import { defineRouteConfig } from "@medusajs/admin-sdk"
import { EnvelopeSolid } from "@medusajs/icons"
import {
  Badge,
  Button,
  Container,
  Heading,
  Table,
  Text,
  toast,
} from "@medusajs/ui"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"

/**
 * 询价线索列表页（DEPLOY.md §7 缺口 8.11）。
 *
 * 在此之前线索只有 JSON 接口（/admin/inquiries），业务方要看线索得写 SQL。
 * 页面走的是同一个受鉴权的 /admin 接口，不新增暴露面。
 *
 * 设计取向（依据医疗器械 B2B 获客惯例）：**按「谁能跟」组织，而不是按时间堆**。
 * 故列表显式展示身份(contactRole) 与需求类型(inquiryType)——这两列决定线索归谁，
 * 也是团队分工的依据；状态可就地推进，不必进详情。
 */

type Inquiry = {
  id: string
  contactRole: string
  inquiryType: string
  companyName: string | null
  contactName: string
  contactEmail: string | null
  contactPhone: string | null
  region: string | null
  productsOfInterest: string | null
  applicationScene: string | null
  purchaseTimeline: string | null
  status: string
  source: string
  internalNote: string | null
  draftOrderId: string | null
  quotedAmount: number | null
  quotedCurrency: string | null
  created_at: string
}

const ROLE_LABEL: Record<string, string> = {
  purchaser: "采购",
  distributor: "渠道/代理",
  institution: "医院/机构",
  other: "其他",
}

const TYPE_LABEL: Record<string, string> = {
  purchase: "产品采购",
  cooperation: "渠道合作",
  sample: "样品/打样",
  doc: "资料索取",
  after_sales: "售后服务",
}

const STATUS_LABEL: Record<string, string> = {
  new: "待处理",
  qualified: "已确认",
  quoted: "已报价",
  won: "已成交",
  closed: "已关闭",
}

const STATUS_COLOR: Record<string, "grey" | "blue" | "orange" | "green" | "red"> = {
  new: "orange",
  qualified: "blue",
  quoted: "blue",
  won: "green",
  closed: "grey",
}

// 状态推进顺序：列表上「下一步」按钮据此给出唯一动作，避免下拉误操作
const NEXT_STATUS: Record<string, string> = {
  new: "qualified",
  qualified: "quoted",
  quoted: "won",
  won: "closed",
  closed: "new",
}

const TIMELINE_LABEL: Record<string, string> = {
  immediate: "1 个月内",
  quarter: "1 个季度内",
  half_year: "半年内",
  planning: "仅前期了解",
}

function fetchInquiries(status: string) {
  const qs = new URLSearchParams({ limit: "200" })
  if (status) qs.set("status", status)
  return fetch(`/admin/inquiries?${qs.toString()}`, {
    credentials: "include",
  }).then((r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    return r.json() as Promise<{ inquiries: Inquiry[]; count: number }>
  })
}

const InquiriesPage = () => {
  const [statusFilter, setStatusFilter] = useState("")
  const qc = useQueryClient()

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["inquiries", statusFilter],
    queryFn: () => fetchInquiries(statusFilter),
  })

  const update = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      fetch(`/admin/inquiries/${id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      }).then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["inquiries"] })
      toast.success("状态已更新")
    },
    onError: (e: Error) => toast.error(`更新失败：${e.message}`),
  })

  // 转为草稿订单（ADR-25 的成单闭环落点）。
  // 金额由商务人工核定后录入——B2B 报价不是商品价格的加减，
  // 故这里用 prompt 收集，不做「按商品价计算」的假精确。
  const convert = useMutation({
    mutationFn: ({ id, amount }: { id: string; amount: number }) =>
      fetch(`/admin/inquiries/${id}?action=convert`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quotedAmount: amount }),
      }).then(async (r) => {
        const d = await r.json().catch(() => ({}))
        if (!r.ok) throw new Error(d?.error || `HTTP ${r.status}`)
        return d
      }),
    onSuccess: (d: any) => {
      qc.invalidateQueries({ queryKey: ["inquiries"] })
      toast.success(
        d?.reused ? "该线索已有草稿订单，已复用" : `已生成草稿订单 ${d?.draftOrderId ?? ""}`,
      )
    },
    onError: (e: Error) => toast.error(`转为草稿订单失败：${e.message}`),
  })

  const list = data?.inquiries ?? []

  return (
    <Container className="divide-y p-0">
      <div className="flex items-center justify-between px-6 py-4">
        <div>
          <Heading level="h2">询价线索</Heading>
          <Text size="small" className="text-ui-fg-subtle">
            来自官网询价表单与 AI 客服转人工。按身份与需求类型分流跟进。
          </Text>
        </div>
        <div className="flex gap-2">
          <Button
            size="small"
            variant={statusFilter === "" ? "primary" : "secondary"}
            onClick={() => setStatusFilter("")}
          >
            全部
          </Button>
          <Button
            size="small"
            variant={statusFilter === "new" ? "primary" : "secondary"}
            onClick={() => setStatusFilter("new")}
          >
            待处理
          </Button>
        </div>
      </div>

      {isLoading && (
        <div className="px-6 py-8">
          <Text className="text-ui-fg-subtle">正在加载…</Text>
        </div>
      )}

      {isError && (
        <div className="px-6 py-8">
          <Text className="text-ui-fg-error">
            加载失败：{(error as Error)?.message}。请确认已登录后台。
          </Text>
        </div>
      )}

      {!isLoading && !isError && list.length === 0 && (
        <div className="px-6 py-8">
          <Text className="text-ui-fg-subtle">暂无询价线索。</Text>
        </div>
      )}

      {!isLoading && !isError && list.length > 0 && (
        <Table>
          <Table.Header>
            <Table.Row>
              <Table.HeaderCell>提交时间</Table.HeaderCell>
              <Table.HeaderCell>身份</Table.HeaderCell>
              <Table.HeaderCell>需求类型</Table.HeaderCell>
              <Table.HeaderCell>联系人 / 单位</Table.HeaderCell>
              <Table.HeaderCell>联系方式</Table.HeaderCell>
              <Table.HeaderCell>关注产品 / 场景</Table.HeaderCell>
              <Table.HeaderCell>预计采购</Table.HeaderCell>
              <Table.HeaderCell>状态</Table.HeaderCell>
              <Table.HeaderCell>报价 / 草稿订单</Table.HeaderCell>
              <Table.HeaderCell />
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {list.map((it) => (
              <Table.Row key={it.id}>
                <Table.Cell className="whitespace-nowrap">
                  {new Date(it.created_at).toLocaleString("zh-CN")}
                </Table.Cell>
                <Table.Cell>{ROLE_LABEL[it.contactRole] ?? it.contactRole}</Table.Cell>
                <Table.Cell>
                  <Badge size="2xsmall" color="grey">
                    {TYPE_LABEL[it.inquiryType] ?? it.inquiryType}
                  </Badge>
                </Table.Cell>
                <Table.Cell>
                  <Text size="small" weight="plus">
                    {it.contactName}
                  </Text>
                  {it.companyName && (
                    <Text size="xsmall" className="text-ui-fg-subtle">
                      {it.companyName}
                    </Text>
                  )}
                </Table.Cell>
                <Table.Cell>
                  <Text size="small">{it.contactPhone || it.contactEmail || "—"}</Text>
                  {it.contactPhone && it.contactEmail && (
                    <Text size="xsmall" className="text-ui-fg-subtle">
                      {it.contactEmail}
                    </Text>
                  )}
                </Table.Cell>
                <Table.Cell className="max-w-[260px]">
                  {it.productsOfInterest && (
                    <Text size="small">{it.productsOfInterest}</Text>
                  )}
                  {it.applicationScene && (
                    <Text size="xsmall" className="text-ui-fg-subtle">
                      {it.applicationScene.length > 80
                        ? it.applicationScene.slice(0, 80) + "…"
                        : it.applicationScene}
                    </Text>
                  )}
                  {!it.productsOfInterest && !it.applicationScene && (
                    <Text size="small" className="text-ui-fg-subtle">
                      —
                    </Text>
                  )}
                </Table.Cell>
                <Table.Cell>
                  {it.purchaseTimeline
                    ? TIMELINE_LABEL[it.purchaseTimeline] ?? it.purchaseTimeline
                    : "—"}
                </Table.Cell>
                <Table.Cell>
                  <Badge size="2xsmall" color={STATUS_COLOR[it.status] ?? "grey"}>
                    {STATUS_LABEL[it.status] ?? it.status}
                  </Badge>
                </Table.Cell>
                <Table.Cell>
                  {it.draftOrderId ? (
                    <Text size="xsmall" className="text-ui-fg-subtle">
                      {it.quotedAmount != null
                        ? `${(it.quotedAmount / 100).toFixed(2)} ${(it.quotedCurrency || "").toUpperCase()}`
                        : "已转订单"}
                    </Text>
                  ) : (
                    <Text size="xsmall" className="text-ui-fg-subtle">
                      —
                    </Text>
                  )}
                </Table.Cell>
                <Table.Cell>
                  <div className="flex gap-2">
                    <Button
                      size="small"
                      variant="secondary"
                      isLoading={update.isPending && update.variables?.id === it.id}
                      onClick={() =>
                        update.mutate({
                          id: it.id,
                          status: NEXT_STATUS[it.status] ?? "qualified",
                        })
                      }
                    >
                      标记为{STATUS_LABEL[NEXT_STATUS[it.status] ?? "qualified"]}
                    </Button>
                    <Button
                      size="small"
                      variant="primary"
                      disabled={!!it.draftOrderId}
                      isLoading={convert.isPending && convert.variables?.id === it.id}
                      onClick={() => {
                        // 金额录入：B2B 报价是人工核定的，不做自动计算
                        const raw = window.prompt(
                          "报价金额（元）。将据此生成草稿订单，付款走合同账期，不经在线支付。",
                          "",
                        )
                        if (raw == null) return
                        const yuan = Number(raw)
                        if (!Number.isFinite(yuan) || yuan <= 0) {
                          toast.error("请输入有效金额")
                          return
                        }
                        convert.mutate({ id: it.id, amount: Math.round(yuan * 100) })
                      }}
                    >
                      {it.draftOrderId ? "已转订单" : "转为草稿订单"}
                    </Button>
                  </div>
                </Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table>
      )}
    </Container>
  )
}

export const config = defineRouteConfig({
  label: "询价线索",
  icon: EnvelopeSolid,
})

export default InquiriesPage
