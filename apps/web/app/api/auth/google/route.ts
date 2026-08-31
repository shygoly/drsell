import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(_req: NextRequest) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return NextResponse.json(
      { error: 'Google login is not configured on the server' },
      { status: 503 },
    );
  }
  const appUrl = process.env.SHOPIFY_APP_URL || 'https://drsell.szchada.top';
  const redirectUri = `${appUrl}/api/auth/google/callback`;
  const state = randomUUID();
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', 'openid email profile');
  url.searchParams.set('state', state);
  url.searchParams.set('access_type', 'online');
  url.searchParams.set('prompt', 'select_account');

  const res = NextResponse.redirect(url.toString());
  res.cookies.set('drsell_oauth_state', state, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 600,
  });
  return res;
}
