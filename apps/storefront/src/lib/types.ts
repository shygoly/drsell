/** 业务类型 — 与 NestJS dashboard 模块 DTO 对齐 */

export interface DashboardStats {
  /** 今日有活动的会话数（会话，不是消息） */
  conversationsToday: number;
  conversationsTrendPct: number;
  /**
   * 分流率：窗口内未升级到人工的会话占比。
   * null = 窗口内没有会话——0 和 100 都会被读成真实业绩。
   */
  aiResolution: number | null;
  aiResolutionTarget: number;
  /** 首响时长均值（秒）。null = 窗口内没有可配对的问答，不再拿常量冒充。 */
  avgFirstResponseSec: number | null;
  pendingTakeover: number;
  /** 上面两个比率的统计窗口天数 */
  windowDays: number;
}

export interface ChartPoint {
  /** 日期标签，如 "8/1" */
  label: string;
  /** AI 解决的会话量（相对高度 0-100） */
  ai: number;
  /** 人工处理的会话量（相对高度 0-100） */
  human: number;
}

export type ConversationStatus = "ai" | "pending" | "human" | "closed";

export interface Conversation {
  id: string;
  customer: string;
  avatarInitials: string;
  topic: string;
  preview: string;
  status: ConversationStatus;
  channel: "web" | "instagram" | "email" | "whatsapp";
  time: string;
  unread?: number;
}

export interface KnowledgeBaseSuggestion {
  title: string;
  description: string;
  impact: string;
}

export interface ChatMessage {
  id: string;
  /** agent = 商家人工回复，必须与 AI 的 assistant 区分 */
  role: "user" | "assistant" | "agent";
  content: string;
  createdAt: string;
}
