import type { Metadata } from 'next';
import '@shopify/polaris/build/esm/styles.css';
import './globals.css';

export const metadata: Metadata = {
  title: 'Drsell',
  description: 'Drsell Shopify AI assistant platform',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
