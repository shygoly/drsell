import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const raw = await req.text();
  const api = process.env.API_INTERNAL_URL || 'http://127.0.0.1:3001';
  const res = await fetch(`${api}/api/shopify/webhooks`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-shopify-hmac-sha256': req.headers.get('x-shopify-hmac-sha256') || '',
      'x-shopify-topic': req.headers.get('x-shopify-topic') || '',
      'x-shopify-shop-domain': req.headers.get('x-shopify-shop-domain') || '',
    },
    body: raw,
  });
  const text = await res.text();
  return new NextResponse(text, { status: res.status });
}
