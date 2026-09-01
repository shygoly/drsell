import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

function decodeExp(token: string): number | null {
  try {
    const part = token.split('.')[1];
    if (!part) return null;
    const payload = JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/'))) as { exp?: number };
    return typeof payload.exp === 'number' ? payload.exp : null;
  } catch {
    return null;
  }
}

function tokenValid(token: string | undefined): boolean {
  if (!token) return false;
  const exp = decodeExp(token);
  if (!exp) return true;
  return exp * 1000 > Date.now();
}

/** nginx 反代后 request.url 是 localhost:5013，必须用 forwarded/host 重建对外 origin */
function externalOrigin(request: NextRequest): string {
  const host =
    request.headers.get('x-forwarded-host')?.split(',')[0]?.trim()
    ?? request.headers.get('host')?.split(',')[0]?.trim();
  const proto =
    request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim() ?? 'https';
  if (host) return `${proto}://${host}`;
  return request.nextUrl.origin;
}

function externalUrl(request: NextRequest, pathname: string): URL {
  return new URL(pathname, externalOrigin(request));
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname === '/login') {
    const token = request.cookies.get('ops_token')?.value;
    if (tokenValid(token)) {
      return NextResponse.redirect(externalUrl(request, '/'));
    }
    return NextResponse.next();
  }

  const token = request.cookies.get('ops_token')?.value;
  if (!tokenValid(token)) {
    const login = externalUrl(request, '/login');
    if (pathname !== '/') {
      login.searchParams.set('next', pathname + request.nextUrl.search);
    }
    const res = NextResponse.redirect(login);
    if (token) {
      res.cookies.set('ops_token', '', { path: '/', maxAge: 0 });
    }
    return res;
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
