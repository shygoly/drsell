import { NextRequest, NextResponse } from 'next/server';
import { getShopify } from '@/lib/shopify';

export async function GET(req: NextRequest) {
  const shop = req.nextUrl.searchParams.get('shop');
  if (!shop) {
    return NextResponse.json({ error: 'shop required' }, { status: 400 });
  }

  // Node adapter writes headers onto rawResponse; capture them to build the redirect.
  const mockRes: Record<string, unknown> & {
    headers: Record<string, string | string[]>;
    setHeader: (k: string, v: string | string[]) => void;
    getHeaders: () => Record<string, string | string[]>;
    write: () => void;
    end: () => void;
  } = {
    statusCode: 200,
    statusMessage: 'OK',
    headers: {},
    setHeader(k, v) {
      this.headers[k] = v;
    },
    getHeaders() {
      return this.headers;
    },
    write() {},
    end() {},
  };

  await getShopify().auth.begin({
    shop,
    callbackPath: '/api/auth/callback',
    isOnline: false,
    rawRequest: {
      headers: Object.fromEntries(req.headers.entries()),
      method: req.method,
      url: req.url,
      originalUrl: req.nextUrl.pathname + req.nextUrl.search,
    },
    rawResponse: mockRes,
  });

  const headers = mockRes.getHeaders();
  const location = Array.isArray(headers.Location)
    ? headers.Location[0]
    : headers.Location;
  if (!location) {
    return NextResponse.json(
      { error: 'Failed to start Shopify OAuth' },
      { status: 500 },
    );
  }
  const res = NextResponse.redirect(location);
  const setCookies = headers['Set-Cookie'] ?? headers['set-cookie'];
  if (Array.isArray(setCookies)) {
    setCookies.forEach((c) => res.headers.append('Set-Cookie', c));
  } else if (setCookies) {
    res.headers.set('Set-Cookie', setCookies);
  }
  return res;
}
