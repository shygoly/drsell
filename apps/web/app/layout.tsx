import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Drsell',
  description: 'Drsell Shopify AI assistant platform',
  icons: {
    icon: [
      { url: '/brand/favicon.ico', sizes: 'any', type: 'image/x-icon' },
      { url: '/brand/icon-192.png', sizes: '192x192', type: 'image/png' },
    ],
    apple: [
      { url: '/brand/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
    ],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // 本包只剩 OAuth、webhooks 与 /privacy；嵌入式界面是 apps/storefront，
    // 所以这里不再加载 App Bridge，也不再声明 shopify-api-key。
    // /privacy 是提交给 Shopify 的英文优先双语页面，lang 用 en。
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
