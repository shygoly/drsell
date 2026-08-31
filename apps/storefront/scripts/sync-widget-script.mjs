#!/usr/bin/env node
// Keep the widget renderer used by /widget-preview and the storefront in sync.
// The canonical asset lives in the Shopify theme app extension
// (apps/web/extensions/chatbot/assets/drsell-chat.js); this copies it into the
// storefront app's public dir so the Live Preview can run the exact same code.
import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const src = join(here, "../../web/extensions/chatbot/assets/drsell-chat.js");
const dest = join(here, "../public/drsell-chat.js");

mkdirSync(dirname(dest), { recursive: true });
copyFileSync(src, dest);
console.log(`synced widget script -> ${dest}`);
