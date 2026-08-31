import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  try {
    const code = req.nextUrl.searchParams.get('code');
    const state = req.nextUrl.searchParams.get('state');
    const storedState = req.cookies.get('drsell_oauth_state')?.value;
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const appUrl = process.env.SHOPIFY_APP_URL || 'https://drsell.szchada.top';

    if (!code || !state || !storedState || state !== storedState) {
      return NextResponse.json({ error: 'Invalid OAuth state' }, { status: 400 });
    }
    if (!clientId || !clientSecret) {
      return NextResponse.json(
        { error: 'Google login is not configured on the server' },
        { status: 503 },
      );
    }

    const redirectUri = `${appUrl}/api/auth/google/callback`;
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });
    if (!tokenRes.ok) {
      const text = await tokenRes.text();
      return NextResponse.json(
        { error: `Google token exchange failed: ${text.slice(0, 200)}` },
        { status: 502 },
      );
    }
    const token = (await tokenRes.json()) as { access_token?: string };
    if (!token.access_token) {
      return NextResponse.json({ error: 'No access token from Google' }, { status: 502 });
    }

    const infoRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${token.access_token}` },
    });
    if (!infoRes.ok) {
      return NextResponse.json({ error: 'Google userinfo failed' }, { status: 502 });
    }
    const info = (await infoRes.json()) as {
      email?: string;
      name?: string;
      verified_email?: boolean;
    };
    if (!info.email) {
      return NextResponse.json({ error: 'Google account has no email' }, { status: 400 });
    }

    const api = process.env.API_INTERNAL_URL || 'http://127.0.0.1:3001';
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (process.env.INTERNAL_API_KEY) {
      headers['x-internal-key'] = process.env.INTERNAL_API_KEY;
    }
    const exch = await fetch(`${api}/api/auth/google/exchange`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ email: info.email, name: info.name }),
    });
    if (!exch.ok) {
      const text = await exch.text();
      return NextResponse.json(
        { error: `Session exchange failed: ${text.slice(0, 200)}` },
        { status: 502 },
      );
    }
    const data = (await exch.json()) as { accessToken?: string };
    if (!data.accessToken) {
      return NextResponse.json({ error: 'No token from session exchange' }, { status: 502 });
    }

    const redirect = new URL(`${appUrl}/login`);
    redirect.hash = `token=${encodeURIComponent(data.accessToken)}&email=${encodeURIComponent(info.email)}`;
    const res = NextResponse.redirect(redirect.toString());
    res.cookies.delete('drsell_oauth_state');
    return res;
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
