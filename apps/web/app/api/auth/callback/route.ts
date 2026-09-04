import { NextRequest, NextResponse } from 'next/server';
import { shopify } from '@/lib/shopify';
import { unsealInstallUserToken } from '@/lib/oauth-state';
import { buildAdminAppUrl } from '@/lib/onboarding';

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
    // OAuth 成功即是店铺归属证明。这一调用负责落 Shop/Tenant 记录并写入
    // Shopify access token；返回的 shop JWT 不再外带（嵌入端自行走 App Bridge 换发）。
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

    // 装完必须回到 Admin 内的嵌入应用——Shopify 的硬性要求，落到站外页面会被驳回。
    // 嵌入端自己用 App Bridge idToken 换会话（见 hooks/useShopSession.ts），
    // 所以这里不再把 shop token 挂在 fragment 上外带。
    return NextResponse.redirect(buildAdminAppUrl(session.shop));
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
