// api/index.js - Fixed proxy
const TARGET_DOMAIN = process.env.TARGET_DOMAIN;

export default async function handler(request) {
  // Validate TARGET_DOMAIN is set
  if (!TARGET_DOMAIN) {
    return new Response(JSON.stringify({
      error: 'Proxy not configured',
      message: 'TARGET_DOMAIN environment variable is not set',
      received: {
        method: request.method,
        url: request.url,
        headers: Object.fromEntries(request.headers)
      }
    }), {
      status: 500,
      headers: { 'content-type': 'application/json' }
    });
  }

  try {
    // Extract the path from the incoming request
    const url = new URL(request.url);
    const path = url.pathname + url.search;
    
    // Build the target URL
    const targetUrl = TARGET_DOMAIN.replace(/\/$/, '') + path;

    // Prepare headers - remove Vercel-specific headers
    const headers = new Headers(request.headers);
    headers.delete('host');
    headers.set('x-forwarded-for', request.headers.get('x-forwarded-for') || request.ip || 'unknown');

    // Prepare fetch options
    const fetchOptions = {
      method: request.method,
      headers: headers,
      redirect: 'follow'
    };

    // Add body for non-GET requests
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      fetchOptions.body = request.body;
      fetchOptions.duplex = 'half';
    }

    // Make the actual request to target domain
    const response = await fetch(targetUrl, fetchOptions);

    // Prepare response headers
    const responseHeaders = new Headers(response.headers);
    responseHeaders.delete('connection');
    responseHeaders.delete('keep-alive');
    responseHeaders.delete('transfer-encoding');

    // Return the response
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders
    });

  } catch (error) {
    console.error('Proxy error:', error.message);
    return new Response(JSON.stringify({
      error: 'Proxy failed',
      message: error.message,
      timestamp: new Date().toISOString()
    }), {
      status: 502,
      headers: { 'content-type': 'application/json' }
    });
  }
}
