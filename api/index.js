export const config = { runtime: "edge" };

const TARGET_BASE = (process.env.TARGET_DOMAIN || "").replace(/\/$/, "");

const STRIP_HEADERS = new Set([
  "host",
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  "forwarded",
  "x-forwarded-host",
  "x-forwarded-proto",
  "x-forwarded-port",
]);

function getClientIp(headers) {
  return (
    headers.get("x-vercel-forwarded-for") ||
    headers.get("x-forwarded-for") ||
    headers.get("x-real-ip") ||
    null
  );
}

export default async function handler(req) {
  if (!TARGET_BASE) {
    return new Response("Misconfigured: TARGET_DOMAIN is not set", { status: 500 });
  }

  try {
    const incoming = new URL(req.url);

    // Forwards the full incoming path + query to the target.
    const targetUrl = `${TARGET_BASE}${incoming.pathname}${incoming.search}`;

    const out = new Headers();
    for (const [k, v] of req.headers) {
      const key = k.toLowerCase();
      if (STRIP_HEADERS.has(key)) continue;
      if (key.startsWith("x-vercel-")) continue;
      out.set(key, v);
    }

    const clientIp = getClientIp(req.headers);
    if (clientIp) out.set("x-forwarded-for", clientIp);

    const method = req.method.toUpperCase();
    const hasBody = method !== "GET" && method !== "HEAD";

    const upstream = await fetch(targetUrl, {
      method,
      headers: out,
      body: hasBody ? req.body : undefined,
      duplex: hasBody ? "half" : undefined,
      redirect: "manual",
    });

    return new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: upstream.headers,
    });
  } catch (err) {
    console.error("relay error:", err);
    return new Response("Bad Gateway: Tunnel Failed", { status: 502 });
  }
}
