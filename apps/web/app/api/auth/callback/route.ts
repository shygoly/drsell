import { NextRequest, NextResponse } from 'next/server';
import { shopify } from '@/lib/shopify';

export async function GET(req: NextRequest) {
  try {
    // Node adapter spreads `req.headers`, which is empty for a web Headers
    // object — convert to a plain object so OAuth cookies are read correctly.
    const rawRequest = {
      headers: Object.fromEntries(req.headers.entries()),
      method: req.method,
      url: req.url,
      originalUrl: req.nextUrl.pathname + req.nextUrl.search,
    };
    const mockRes = {
      statusCode: 200,
      statusMessage: 'OK',
      headers: {} as Record<string, string | string[]>,
      setHeader(k: string, v: string | string[]) {
        this.headers[k] = v;
      },
      getHeaders() {
        return this.headers;
      },
      write() {},
      end() {},
    };
    const callback = await shopify.auth.callback({
      rawRequest,
      rawResponse: mockRes,
    });
    const session = callback.session;
    const api = process.env.API_INTERNAL_URL || 'http://127.0.0.1:3001';
    await fetch(`${api}/api/shopify/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        shop: session.shop,
        accessToken: session.accessToken,
        scopes: session.scope,
      }),
    });
    return NextResponse.redirect(
      `${process.env.SHOPIFY_APP_URL || 'https://drsell.szchada.top'}/widget-config?shop=${session.shop}`,
    );
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
