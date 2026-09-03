import type { Metadata } from 'next';
import '@shopify/polaris/build/esm/styles.css';
import './globals.css';

const SHOPIFY_API_KEY =
  process.env.NEXT_PUBLIC_SHOPIFY_API_KEY ||
  process.env.SHOPIFY_API_KEY ||
  '0b36b70772220b71b2fe296b3deba914';

export const metadata: Metadata = {
  title: 'Drsell',
  description: 'Drsell Shopify AI assistant platform',
  other: {
    'shopify-api-key': SHOPIFY_API_KEY,
  },
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
    <html lang="zh-CN">
      <head>
        {/* eslint-disable-next-line @next/next/no-sync-scripts */}
        <script src="https://cdn.shopify.com/shopifycloud/app-bridge.js" />
      </head>
      <body>{children}</body>
    </html>
  );
}
