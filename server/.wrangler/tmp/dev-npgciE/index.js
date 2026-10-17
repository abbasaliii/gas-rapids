var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// src/index.js
var CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, OPTIONS", "Access-Control-Allow-Headers": "*" };
var QUEUE_TTL = 1e4;
function randomId() {
  const a = new Uint8Array(16);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => b.toString(16).padStart(2, "0")).join("");
}
__name(randomId, "randomId");
var src_default = {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
    if (url.pathname.endsWith("/id")) return new Response(randomId(), { headers: { ...CORS, "Content-Type": "text/plain" } });
    if (req.headers.get("Upgrade") === "websocket" || url.pathname.endsWith("/peers")) {
      const stub = env.BROKER.get(env.BROKER.idFromName("global"));
      return stub.fetch(req);
    }
    return new Response(JSON.stringify({ name: "Gas Rapids broker", description: "PeerJS-compatible signaling", ok: true }), { headers: { ...CORS, "Content-Type": "application/json" } });
  }
};
var Broker = class {
  static {
    __name(this, "Broker");
  }
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
    this.queue = /* @__PURE__ */ new Map();
  }
  async fetch(req) {
    const url = new URL(req.url);
    if (url.pathname.endsWith("/peers")) {
      const ids = this.ctx.getWebSockets().map((ws) => (ws.deserializeAttachment() || {}).id).filter(Boolean);
      return new Response(JSON.stringify(ids), { headers: { ...CORS, "Content-Type": "application/json" } });
    }
    if (req.headers.get("Upgrade") !== "websocket") return new Response("Expected websocket", { status: 426 });
    const id = url.searchParams.get("id"), token = url.searchParams.get("token");
    if (!id || !token) return new Response("Missing id or token", { status: 400 });
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    if (this.ctx.getWebSockets(id).length > 0) {
      this.ctx.acceptWebSocket(server);
      server.send(JSON.stringify({ type: "ID-TAKEN", payload: { msg: "ID is taken" } }));
      server.close(1008, "ID is taken");
      return new Response(null, { status: 101, webSocket: client });
    }
    this.ctx.acceptWebSocket(server, [id]);
    server.serializeAttachment({ id, token });
    server.send(JSON.stringify({ type: "OPEN" }));
    const q = this.queue.get(id);
    if (q) {
      this.queue.delete(id);
      for (const { msg } of q) try {
        server.send(JSON.stringify(msg));
      } catch {
      }
    }
    return new Response(null, { status: 101, webSocket: client });
  }
  webSocketMessage(ws, data) {
    let msg;
    try {
      msg = JSON.parse(data);
    } catch {
      return;
    }
    const { id } = ws.deserializeAttachment() || {};
    if (!id || msg.type === "HEARTBEAT" || !msg.dst) return;
    msg.src = id;
    const targets = this.ctx.getWebSockets(msg.dst);
    if (targets.length) {
      for (const t of targets) try {
        t.send(JSON.stringify(msg));
      } catch {
      }
      return;
    }
    if (msg.type === "OFFER" || msg.type === "ANSWER" || msg.type === "CANDIDATE") {
      const now = Date.now();
      const q = (this.queue.get(msg.dst) || []).filter((e) => now - e.at < QUEUE_TTL);
      q.push({ at: now, msg });
      this.queue.set(msg.dst, q);
      return;
    }
    if (msg.type !== "LEAVE" && msg.type !== "EXPIRE") try {
      ws.send(JSON.stringify({ type: "EXPIRE", src: msg.dst, dst: id }));
    } catch {
    }
  }
  webSocketClose(ws) {
    try {
      ws.close();
    } catch {
    }
  }
  webSocketError(ws) {
    try {
      ws.close();
    } catch {
    }
  }
};

// ../node_modules/wrangler/templates/middleware/middleware-ensure-req-body-drained.ts
var drainBody = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } finally {
    try {
      if (request.body !== null && !request.bodyUsed) {
        const reader = request.body.getReader();
        while (!(await reader.read()).done) {
        }
      }
    } catch (e) {
      console.error("Failed to drain the unused request body.", e);
    }
  }
}, "drainBody");
var middleware_ensure_req_body_drained_default = drainBody;

// ../node_modules/wrangler/templates/middleware/middleware-miniflare3-json-error.ts
function reduceError(e) {
  return {
    name: e?.name,
    message: e?.message ?? String(e),
    stack: e?.stack,
    cause: e?.cause === void 0 ? void 0 : reduceError(e.cause)
  };
}
__name(reduceError, "reduceError");
var jsonError = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } catch (e) {
    const error = reduceError(e);
    const body = JSON.stringify(error);
    const headers = {
      "Content-Type": "application/json",
      "MF-Experimental-Error-Stack": "true"
    };
    const encoded = encodeURIComponent(body);
    if (encoded.length <= 8192) {
      headers["MF-Experimental-Error-Stack-Payload"] = encoded;
    }
    return new Response(body, { status: 500, headers });
  }
}, "jsonError");
var middleware_miniflare3_json_error_default = jsonError;

// .wrangler/tmp/bundle-HBsTYO/middleware-insertion-facade.js
var __INTERNAL_WRANGLER_MIDDLEWARE__ = [
  middleware_ensure_req_body_drained_default,
  middleware_miniflare3_json_error_default
];
var middleware_insertion_facade_default = src_default;

// ../node_modules/wrangler/templates/middleware/common.ts
var __facade_middleware__ = [];
function __facade_register__(...args) {
  __facade_middleware__.push(...args.flat());
}
__name(__facade_register__, "__facade_register__");
function __facade_invokeChain__(request, env, ctx, dispatch, middlewareChain) {
  const [head, ...tail] = middlewareChain;
  const middlewareCtx = {
    dispatch,
    next(newRequest, newEnv) {
      return __facade_invokeChain__(newRequest, newEnv, ctx, dispatch, tail);
    }
  };
  return head(request, env, ctx, middlewareCtx);
}
__name(__facade_invokeChain__, "__facade_invokeChain__");
function __facade_invoke__(request, env, ctx, dispatch, finalMiddleware) {
  return __facade_invokeChain__(request, env, ctx, dispatch, [
    ...__facade_middleware__,
    finalMiddleware
  ]);
}
__name(__facade_invoke__, "__facade_invoke__");

// .wrangler/tmp/bundle-HBsTYO/middleware-loader.entry.ts
var __Facade_ScheduledController__ = class ___Facade_ScheduledController__ {
  constructor(scheduledTime, cron, noRetry) {
    this.scheduledTime = scheduledTime;
    this.cron = cron;
    this.#noRetry = noRetry;
  }
  scheduledTime;
  cron;
  static {
    __name(this, "__Facade_ScheduledController__");
  }
  #noRetry;
  noRetry() {
    if (!(this instanceof ___Facade_ScheduledController__)) {
      throw new TypeError("Illegal invocation");
    }
    this.#noRetry();
  }
};
function wrapExportedHandler(worker) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return worker;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  const fetchDispatcher = /* @__PURE__ */ __name(function(request, env, ctx) {
    if (worker.fetch === void 0) {
      throw new Error("Handler does not export a fetch() function.");
    }
    return worker.fetch(request, env, ctx);
  }, "fetchDispatcher");
  return {
    ...worker,
    fetch(request, env, ctx) {
      const dispatcher = /* @__PURE__ */ __name(function(type, init) {
        if (type === "scheduled" && worker.scheduled !== void 0) {
          const controller = new __Facade_ScheduledController__(
            Date.now(),
            init.cron ?? "",
            () => {
            }
          );
          return worker.scheduled(controller, env, ctx);
        }
      }, "dispatcher");
      return __facade_invoke__(request, env, ctx, dispatcher, fetchDispatcher);
    }
  };
}
__name(wrapExportedHandler, "wrapExportedHandler");
function wrapWorkerEntrypoint(klass) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return klass;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  return class extends klass {
    #fetchDispatcher = /* @__PURE__ */ __name((request, env, ctx) => {
      this.env = env;
      this.ctx = ctx;
      if (super.fetch === void 0) {
        throw new Error("Entrypoint class does not define a fetch() function.");
      }
      return super.fetch(request);
    }, "#fetchDispatcher");
    #dispatcher = /* @__PURE__ */ __name((type, init) => {
      if (type === "scheduled" && super.scheduled !== void 0) {
        const controller = new __Facade_ScheduledController__(
          Date.now(),
          init.cron ?? "",
          () => {
          }
        );
        return super.scheduled(controller);
      }
    }, "#dispatcher");
    fetch(request) {
      return __facade_invoke__(
        request,
        this.env,
        this.ctx,
        this.#dispatcher,
        this.#fetchDispatcher
      );
    }
  };
}
__name(wrapWorkerEntrypoint, "wrapWorkerEntrypoint");
var WRAPPED_ENTRY;
if (typeof middleware_insertion_facade_default === "object") {
  WRAPPED_ENTRY = wrapExportedHandler(middleware_insertion_facade_default);
} else if (typeof middleware_insertion_facade_default === "function") {
  WRAPPED_ENTRY = wrapWorkerEntrypoint(middleware_insertion_facade_default);
}
var middleware_loader_entry_default = WRAPPED_ENTRY;
export {
  Broker,
  __INTERNAL_WRANGLER_MIDDLEWARE__,
  middleware_loader_entry_default as default
};
//# sourceMappingURL=index.js.map
