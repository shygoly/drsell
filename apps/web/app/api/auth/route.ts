import { NextRequest, NextResponse } from 'next/server';
import { getShopify } from '@/lib/shopify';
import { sealInstallUserToken } from '@/lib/oauth-state';

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

  // 已登录的平台用户发起安装时，把 admin JWT 密封进 HttpOnly cookie，
  // 回调端验签后交给 API 建立 Membership（见 lib/oauth-state.ts）。
  const userToken = req.nextUrl.searchParams.get('u') || '';
  if (userToken) {
    const secret = process.env.SHOPIFY_API_SECRET || '';
    const sealed = sealInstallUserToken(userToken, secret);
    res.headers.append(
      'Set-Cookie',
      `drsell_install_u=${encodeURIComponent(sealed)}; Path=/api/auth/callback; HttpOnly; SameSite=Lax; Secure; Max-Age=600`,
    );
  }
  return res;
}
