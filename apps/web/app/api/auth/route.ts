import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const shop = req.nextUrl.searchParams.get('shop');
  if (!shop) {
    return NextResponse.json({ error: 'shop required' }, { status: 400 });
  }
  const apiKey = process.env.SHOPIFY_API_KEY || '';
  const appUrl = process.env.SHOPIFY_APP_URL || 'https://drsell.szchada.top';
  const redirectUri = `${appUrl}/api/auth/callback`;
  const scopes =
    process.env.SCOPES ||
    'read_customers,read_orders,read_products,write_orders,write_products';
  const url = new URL(`https://${shop}/admin/oauth/authorize`);
  url.searchParams.set('client_id', apiKey);
  url.searchParams.set('scope', scopes);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('state', crypto.randomUUID());
  return NextResponse.redirect(url.toString());
}
