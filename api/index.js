const TARGET = 'https://sabzi.artbyart.ir:443'; // your server

export default {
  async fetch(request) {
    const url = new URL(request.url);
    return fetch(TARGET + url.pathname + url.search, request);
  }
};
