import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  // 生产环境下本应用挂在 drsell.szchada.top/app，与 apps/storefront 共用同一域名根。
  // 两者都默认把静态资产放在 /_next/，nginx 的 `location /` 会把 /_next/* 全部送到
  // storefront，导致本应用的 chunk 一律 404、页面在浏览器里是死的。
  // 用 assetPrefix 把本应用的资产隔离到 /app/_next/，由 nginx 定向回 5012。
  // 本地开发不设该变量，保持默认行为。
  assetPrefix: process.env.ASSET_PREFIX || undefined,
  transpilePackages: ['@drsell/shared'],
  async rewrites() {
    const api = process.env.API_INTERNAL_URL || 'http://127.0.0.1:3001';
    return [
      {
        source: '/api/backend/:path*',
        destination: `${api}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
