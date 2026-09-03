import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AppShell } from "@/components/layout/app-shell";
import { ShopifyBridgeProvider } from "@/components/business/shopify-bridge";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

const SHOPIFY_API_KEY =
  process.env.NEXT_PUBLIC_SHOPIFY_API_KEY ||
  "0b36b70772220b71b2fe296b3deba914";

export const metadata: Metadata = {
  title: "AIChat Merchant Dashboard",
  description:
    "Shopify AI customer service dashboard — converted from Google Stitch via P0-P8 pipeline",
  other: {
    "shopify-api-key": SHOPIFY_API_KEY,
  },
  icons: {
    icon: [
      { url: "/brand/favicon.ico", sizes: "any", type: "image/x-icon" },
      { url: "/brand/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: [
      { url: "/brand/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        {/* App Bridge 异步加载：避免阻塞 iframe 首帧渲染；需要桥接能力时再初始化 */}
        <script
          src="https://cdn.shopify.com/shopifycloud/app-bridge.js"
          async
        />
      </head>
      <body className={`${inter.variable} font-sans antialiased`}>
        <ShopifyBridgeProvider>
          <AppShell>{children}</AppShell>
        </ShopifyBridgeProvider>
      </body>
    </html>
  );
}
