export type OpenClawClientOptions = {
  gatewayUrl?: string;
  gatewayToken?: string;
  agentId?: string;
  fetchImpl?: typeof fetch;
  /** 仅测试注入。生产走 process.env.CHAT_AGENT。 */
  agent?: 'pi' | 'openclaw';
};

/** OpenAI 兼容的消息角色。商家人工消息由调用方映射到 assistant 后传入。 */
export type OpenClawRole = 'system' | 'user' | 'assistant';

export type OpenClawMessage = {
  role: OpenClawRole;
  content: string;
};

export type SupportSource = 'shopify' | 'medusa';

export type OpenClawChatParams = {
  /**
   * 完整的多轮上下文，按时间升序，不含 system。
   *
   * 历史由调用方从自己的库里组装后整体传入——不依赖网关侧会话记忆。
   * 网关重启 / profile 变更 / token 轮换都会让那份记忆消失，而本地库不会。
   */
  messages: OpenClawMessage[];
  /** 作为独立的 system 消息发出，不拼进用户消息前缀。 */
  systemPrompt: string;
  shopDomain: string;
  visitorId: string;
  conversationId?: string;
  onChunk: (text: string) => void;
  signal?: AbortSignal;
  /**
   * 决定注册哪些 adp_*。省略 ≡ shopify（含 adp_get_order）。
   * Medusa 不注册 adp_get_order（D8）。
   */
  source?: SupportSource | null;
};

/**
 * 商家在 `BotSetting` 上配置的 AI 人设。半可信：可以改话术与语气，
 * **不能**解除服务端护栏（店铺域锁定、忽略顾客注入）——见 `buildSupportSystemPrompt`。
 */
export type SupportPersona = {
  name?: string | null;
  tone?: string | null;
  /** "auto" | "en" | "zh-Hans" | "es"；auto 或未知值＝跟随顾客语言。 */
  language?: string | null;
  /** 商家自定义指令自由文本。 */
  customInstructions?: string | null;
};

export type SupportChatClient = {
  chatStream(params: OpenClawChatParams): Promise<string>;
};
