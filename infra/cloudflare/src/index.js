/**
 * Edge reverse proxy for Drsell hosts → wjclaw :443 (SNI → :8443 nginx).
 * CF custom domain terminates TLS; origin uses stream passthrough on 443.
 */
export default {
  async fetch(request, env) {
    const originIp = env.ORIGIN_IP || '163.7.7.160';
    const publicHost = new URL(request.url).hostname;

    const url = new URL(request.url);
    url.protocol = 'https:';
    url.port = '443';

    const headers = new Headers(request.headers);
    headers.set('Host', publicHost);
    headers.set('X-Forwarded-Proto', 'https');
    const clientIp = request.headers.get('CF-Connecting-IP');
    if (clientIp) {
      headers.set('X-Forwarded-For', clientIp);
      headers.set('X-Real-IP', clientIp);
    }

    try {
      return await fetch(
        new Request(url.toString(), {
          method: request.method,
          headers,
          body: request.body,
          redirect: 'manual',
        }),
        { cf: { resolveOverride: originIp } },
      );
    } catch (err) {
      return new Response(
        JSON.stringify({ error: 'origin_unreachable', message: String(err) }),
        { status: 502, headers: { 'content-type': 'application/json' } },
      );
    }
  },
};
