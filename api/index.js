// api/proxy.js
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

/**
 * Vercel-specific: x-vercel-forwarded-for holds the true client IP.
 * Fallback to x-forwarded-for, then x-real-ip.
 */
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
    // Build target URL using the full path + query string
    const incoming = new URL(req.url);
    const targetUrl = `${TARGET_BASE}${incoming.pathname}${incoming.search}`;

    // Clean headers (strip all hop‑by‑hop and internal Vercel headers)
    const out = new Headers();
    for (const [k, v] of req.headers) {
      const key = k.toLowerCase();
      if (STRIP_HEADERS.has(key)) continue;
      if (key.startsWith("x-vercel-")) continue; // includes x-vercel-forwarded-for, etc.
      out.set(key, v);
    }

    // Set the real client IP
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
