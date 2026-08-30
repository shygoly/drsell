import { NextRequest, NextResponse } from 'next/server';
import { shopify } from '@/lib/shopify';

export async function GET(req: NextRequest) {
  try {
    const callback = await shopify.auth.callback({
      rawRequest: req as unknown as Request,
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
