import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
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
