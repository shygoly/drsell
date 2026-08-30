/** 业务类型 — 与 NestJS dashboard 模块 DTO 对齐 */

export interface DashboardStats {
  conversationsToday: number;
  conversationsTrendPct: number;
  aiResolution: number;
  aiResolutionTarget: number;
  avgFirstResponseSec: number;
  avgResponseTrendSec: number;
  pendingTakeover: number;
}

export interface ChartPoint {
  /** 日期标签，如 "8/1" */
  label: string;
  /** AI 解决的会话量（相对高度 0-100） */
  ai: number;
  /** 人工处理的会话量（相对高度 0-100） */
  human: number;
}

export type ConversationStatus = "ai" | "pending" | "human";

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
  role: "user" | "assistant";
  content: string;
  createdAt: string;
}
