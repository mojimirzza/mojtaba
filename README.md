# vercel-xhttp-relay

A high-performance **Rust relay server for Vercel Edge** that forwards
**XHTTP** traffic to your backend Xray/V2Ray server. Use Vercel's globally
distributed edge network (and its `vercel.com` / `*.vercel.app` SNI) as a
front for your real Xray endpoint — useful in regions where the backend
host is blocked but Vercel is reachable.

> ⚠️ **XHTTP transport only.** This relay is purpose-built for Xray's
> `xhttp` transport. It will **not** work with `WebSocket`, `gRPC`, `TCP`,
> `mKCP`, `QUIC`, or any other V2Ray/Xray transport.

---

## How It Works

```
┌──────────┐      TLS / SNI: *.vercel.app      ┌────────────────┐      HTTP        ┌──────────────┐
│  Client  │ ────────────────────────────────► │  Vercel Edge   │ ───────────────► │  Your Xray   │
│ (v2rayN, │   XHTTP (uplink + downlink over   │  (this relay,  │   XHTTP frames   │  Server with │
│ xray-core│    plain HTTP/2 POST/GET reqs)    │   Rust runtime)│  proxied 1:1     │ XHTTP inbound│
└──────────┘                                   └────────────────┘                  └──────────────┘
```

1. Your Xray client opens an XHTTP stream to a Vercel domain
   (`your-app.vercel.app`, or any custom domain pointed at Vercel).
2. The TLS handshake uses **Vercel's certificate / SNI**, so to a censor it
   looks like ordinary traffic to a legitimate Vercel-hosted site.
3. This relay (deployed as a Vercel Edge function in Rust) receives the
   request, forwards it verbatim — headers, method, body stream — to your
   real Xray server defined by `TARGET_DOMAIN`.
4. The response is streamed back to the client without buffering, so large
   uploads/downloads stay low-latency.

## Why Rust on Vercel Edge?

- **Zero-buffer streaming** via `reqwest::bytes_stream()` +
  `Body::from_stream()` — required for XHTTP's long-lived bidirectional
  streams.
- **Compiled native code** — header copying and method translation run in
  microseconds, not milliseconds.
- **Vercel's anycast edge** — clients connect to the closest PoP and benefit
  from Vercel's optimized backbone to your origin.

---

## Setup & Deployment

### 1. Requirements

- A working **Xray server with XHTTP inbound** already running on a public
  host (this is your `TARGET_DOMAIN`).
- [Vercel CLI](https://vercel.com/docs/cli): `npm i -g vercel`
- A Vercel account (Pro recommended for higher bandwidth and concurrent
  connection limits).

### 2. Configure Environment Variable

In the Vercel Dashboard → your project → **Settings → Environment Variables**,
add:

| Name            | Example                          | Description                                   |
| --------------- | -------------------------------- | --------------------------------------------- |
| `TARGET_DOMAIN` | `https://xray.example.com:2096`  | Full URL of your backend Xray XHTTP endpoint. |

> Use `https://` if your backend terminates TLS, `http://` if it's plain.
> Include a non-default port if needed.

### 3. Deploy

```bash
git clone https://github.com/ramynn/vercel-xhttp-relay.git
cd vercel-xhttp-relay

vercel --prod
```

After deployment Vercel gives you a URL like `your-app.vercel.app`.

---

## Client Configuration (VLESS / Xray with XHTTP)

In your client config, point the **address** at your Vercel domain and set
**SNI / Host** to a `vercel.com`-family hostname. The `id`, `path`, and
inbound settings must match what your real Xray server expects.

### Example VLESS share link

```
vless://UUID@your-app.vercel.app:443?encryption=none&security=tls&sni=your-app.vercel.app&type=xhttp&path=/yourpath&host=your-app.vercel.app#vercel-relay
```

### Example Xray client JSON (outbound)

```json
{
  "protocol": "vless",
  "settings": {
    "vnext": [{
      "address": "your-app.vercel.app",
      "port": 443,
      "users": [{ "id": "YOUR-UUID", "encryption": "none" }]
    }]
  },
  "streamSettings": {
    "network": "xhttp",
    "security": "tls",
    "tlsSettings": {
      "serverName": "your-app.vercel.app",
      "allowInsecure": false
    },
    "xhttpSettings": {
      "path": "/yourpath",
      "host": "your-app.vercel.app",
      "mode": "auto"
    }
  }
}
```

### Tips

- You can use **any Vercel-fronted hostname** for SNI as long as the TLS
  handshake reaches Vercel. Custom domains pointed at Vercel work too.
- The `path` and `id` (UUID) must match the **backend Xray** XHTTP inbound,
  not this relay — the relay is transport-agnostic and just pipes bytes.
- If censorship targets `*.vercel.app` directly, attach a custom domain in
  the Vercel dashboard and use that as both `address` and `sni`.

---

## Limitations

- **XHTTP only.** WebSocket / gRPC / raw TCP transports do **not** work
  because Vercel's serverless functions don't expose those primitives.
- **Vercel function execution limits.** Long-lived idle streams may be cut
  by Vercel's per-invocation timeout. XHTTP's chunked POST/GET model handles
  this gracefully, but other transports would not.
- **Bandwidth costs.** All traffic counts against your Vercel account's
  bandwidth quota. Heavy use → upgrade to Pro/Enterprise.
- **Logging.** Vercel logs request metadata (path, IP, status). The body is
  not logged, but be aware of the trust model.

## Project Layout

```
.
├── api/index.rs   # Edge function: streams request → TARGET_DOMAIN, streams response back
├── Cargo.toml     # Rust dependencies (vercel_runtime, reqwest, tokio, futures-util)
├── vercel.json    # Routes all paths → /api/index, region pinned to fra1
└── README.md
```

To change the deployment region, edit `regions` in `vercel.json` (e.g.
`["sin1"]`, `["iad1"]`).

## License

MIT.
