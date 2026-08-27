/**
 * Edge reverse proxy: drsell.szchada.top → wjclaw (163.7.7.160)
 * Worker terminates TLS at edge; origin is plain HTTP on ORIGIN_PORT (self-signed HTTPS breaks fetch).
 */
export default {
  async fetch(request, env) {
    const originIp = env.ORIGIN_IP || '163.7.7.160';
    const originPort = env.ORIGIN_PORT || '8088';
    const publicHost = 'drsell.szchada.top';

    const url = new URL(request.url);
    // Keep hostname as a domain (Workers reject literal IP URLs — error 1003).
    url.protocol = 'http:';
    url.port = originPort;

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
