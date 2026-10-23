import { EventEmitter } from "node:events";

// Bridge the existing HTTP-shaped API to Fetch without opening a Node listener.
export function dispatch(application, request, waitUntil = promise => promise.catch(() => {})) {
  const req = new EventEmitter();
  req.method = request.method;
  const publicUrl = new URL(request.headers.get("x-anhao-request-origin") || request.url);
  req.protocol = publicUrl.protocol.slice(0, -1);
  req.url = new URL(request.url).pathname + new URL(request.url).search;
  req.headers = Object.fromEntries(request.headers);
  req.headers.host = publicUrl.host;
  req.socket = { remoteAddress: request.headers.get("cf-connecting-ip") || "127.0.0.1" };
  req[Symbol.asyncIterator] = async function* () {
    if (!request.body) return;
    const reader = request.body.getReader();
    try {
      while (true) { const { done, value } = await reader.read(); if (done) break; yield value; }
    } finally { reader.releaseLock(); }
  };
  request.signal.addEventListener("abort", () => req.emit("close"), { once: true });
  let resolveResponse;
  const response = new Promise(resolve => { resolveResponse = resolve; });
  const headers = new Headers();
  let status = 200, sent = false, ended = false, controller;
  const encoder = new TextEncoder();
  function begin() {
    if (sent) return;
    sent = true;
    const body = new ReadableStream({
      start(value) { controller = value; },
      cancel() { ended = true; req.emit("close"); }
    });
    resolveResponse(new Response(body, { status, headers }));
  }
  const res = {
    get headersSent() { return sent; },
    setHeader(name, value) { if (!sent) headers.set(name, String(value)); },
    writeHead(code, values = {}) { status = code; for (const [name, value] of Object.entries(values)) headers.set(name, String(value)); },
    write(chunk) {
      if (ended) return false;
      begin();
      controller.enqueue(typeof chunk === "string" ? encoder.encode(chunk) : chunk);
      return true;
    },
    end(chunk) {
      if (ended) return;
      if (chunk !== undefined && chunk !== null) this.write(chunk);
      begin(); ended = true; controller.close(); req.emit("close");
    }
  };
  const operation = Promise.resolve().then(() => application.handle(req, res, new URL(request.url))).catch(error => {
    if (!sent) { res.writeHead(error.status || 500, { "content-type": "application/json" }); res.end(JSON.stringify({ error: { code: error.code || "SERVER_ERROR", message: error.status ? error.message : "服务器暂时出了点问题" } })); }
    else if (!ended) res.end();
  });
  waitUntil(operation);
  return response;
}
