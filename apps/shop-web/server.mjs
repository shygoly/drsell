// Drsell 独立站店面的极简静态服务器（无依赖）。
// 由 pm2 以 `drsell-shop-web` 运行于 127.0.0.1:PORT；nginx 把 medusa.szchada.top 的
// `/` 反代到这里，`/store /admin /auth /app /health` 反代到 Medusa :9000（同源，故店面
// 调 /store/products 无 CORS 问题）。见 openspec dtc-store-medusa Phase 6/8。
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = process.env.SHOP_WEB_ROOT || path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 5020);
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml", ".ico": "image/x-icon", ".webp": "image/webp",
};

http
  .createServer((req, res) => {
    try {
      let p = decodeURIComponent((req.url || "/").split("?")[0]);
      if (p === "/" || p.endsWith("/")) p += "index.html";
      let fp = path.normalize(path.join(ROOT, p));
      if (!fp.startsWith(ROOT)) { res.writeHead(403); return res.end("forbidden"); }
      if (!fs.existsSync(fp) || fs.statSync(fp).isDirectory()) fp = path.join(ROOT, "index.html");
      const ext = path.extname(fp).toLowerCase();
      res.writeHead(200, {
        "content-type": TYPES[ext] || "application/octet-stream",
        "cache-control": ext === ".html" ? "no-cache" : "public, max-age=3600",
      });
      fs.createReadStream(fp).pipe(res);
    } catch (e) {
      res.writeHead(500);
      res.end("error");
    }
  })
  .listen(PORT, "127.0.0.1", () => console.log(`drsell-shop-web serving ${ROOT} on 127.0.0.1:${PORT}`));
