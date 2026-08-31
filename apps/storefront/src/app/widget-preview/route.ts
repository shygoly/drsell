// Live-preview page for the storefront chat widget.
// Renders the exact same drsell-chat.js used by the theme app extension, with
// the current form config injected via window.DRSELL_CONFIG (no network calls).
const DEFAULTS = {
  name: "Ava",
  primary: "#006c49",
  header: "#006c49",
  position: "bottom-right",
  size: "medium",
  launcher: "chat",
  visible: "1",
  welcome:
    "Hi! I'm Ava. How can I help you today?",
  shop: "your-store.myshopify.com",
};

function esc(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function GET(req: Request) {
  const p = new URL(req.url).searchParams;
  const name = p.get("name") || DEFAULTS.name;
  const primary = p.get("primary") || DEFAULTS.primary;
  const header = p.get("header") || DEFAULTS.header;
  const position = p.get("position") === "bottom-left" ? "bottom-left" : "bottom-right";
  const size = ["small", "medium", "large"].includes(p.get("size") || "")
    ? (p.get("size") as string)
    : DEFAULTS.size;
  const launcher = ["chat", "question", "custom"].includes(p.get("launcher") || "")
    ? (p.get("launcher") as string)
    : DEFAULTS.launcher;
  const visible = p.get("visible") !== "0";
  const welcome = p.get("welcome") || DEFAULTS.welcome;
  const shop = p.get("shop") || DEFAULTS.shop;
  const replies = (p.get("replies") || "")
    .split("|")
    .map((s) => s.trim())
    .filter(Boolean);

  const widgetConfig = {
    shopName: name,
    widgetPrimaryColor: primary,
    widgetHeaderColor: header,
    widgetPosition: position,
    widgetWindowSize: size,
    widgetLauncherStyle: launcher,
    widgetVisible: visible,
    widgetQuickReplies: replies,
    welcomeMessage: welcome,
    widgetPreviewOpen: visible,
  };
  const configJson = JSON.stringify(widgetConfig).replace(/</g, "\\u003c");

  const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="robots" content="noindex" />
    <style>
      html, body { margin: 0; padding: 0; background: transparent; overflow: hidden; }
    </style>
  </head>
  <body>
    <div id="drsell-chat-root" data-shop="${esc(shop)}"></div>
    <script>window.DRSELL_CONFIG = ${configJson};</script>
    <script src="/drsell-chat.js"></script>
  </body>
</html>`;

  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
