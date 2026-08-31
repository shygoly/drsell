import { NextRequest, NextResponse } from 'next/server';
import { shopify } from '@/lib/shopify';
import { unsealInstallUserToken } from '@/lib/oauth-state';

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
    // OAuth 成功即是店铺归属证明，这里换发本服务的 shop JWT。
    // 浏览器不能自己调这个端点（需要 INTERNAL_API_KEY），token 只能由这条回调下发。
    const res = await fetch(`${api}/api/shopify/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-key': process.env.INTERNAL_API_KEY || '',
      },
      body: JSON.stringify({
        shop: session.shop,
        accessToken: session.accessToken,
        scopes: session.scope,
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json(
        { error: `shop session exchange failed: ${res.status} ${text}` },
        { status: 502 },
      );
    }
    const { accessToken } = (await res.json()) as { accessToken: string };

    // 安装归属：密封 cookie 里若有发起安装的 admin JWT，就建立 Membership。
    const sealed = req.cookies.get('drsell_install_u')?.value;
    const userToken = sealed
      ? unsealInstallUserToken(
          decodeURIComponent(sealed),
          process.env.SHOPIFY_API_SECRET || '',
        )
      : null;
    if (userToken) {
      try {
        await fetch(`${api}/api/membership/grant`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-internal-key': process.env.INTERNAL_API_KEY || '',
          },
          body: JSON.stringify({
            userToken,
            shopDomain: session.shop,
            role: 'owner',
          }),
        });
      } catch (e) {
        // 归属失败不阻塞安装完成；商家可稍后在嵌入端用 claim 认领。
        console.error('membership grant failed:', e);
      }
    }

    const appUrl = process.env.SHOPIFY_APP_URL || 'https://drsell.szchada.top';
    // fragment 不会进服务端日志/Referer；前端读取后立刻清除（见 useShopSession）。
    const target = new URL(`${appUrl}/widget-config`);
    target.searchParams.set('shop', session.shop);
    return NextResponse.redirect(
      `${target.toString()}#shop_token=${encodeURIComponent(accessToken)}`,
    );
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
