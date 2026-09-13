/**
 * drsell 摄取客户端：把映射后的 DTO POST 到 drsell 的 /api/ingest/*。
 * 服务端到服务端，用 store 密钥（x-store-key）鉴权。
 *
 * DRSELL_INGEST_URL 默认指向 wjclaw 本机的 drsell-api（127.0.0.1:5011 + 全局前缀 api）。
 */
const BASE = process.env.DRSELL_INGEST_URL || "http://127.0.0.1:5011/api/ingest";
const KEY = process.env.INGEST_STORE_KEY || "";

export async function pushIngest(path: string, body: unknown): Promise<void> {
  const res = await fetch(`${BASE}/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-store-key": KEY },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`drsell ingest ${path} ${res.status}: ${text.slice(0, 200)}`);
  }
}
