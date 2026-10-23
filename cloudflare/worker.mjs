import { DurableObject } from "cloudflare:workers";
import { createApplication } from "../server-core.mjs";
import { createIcebreakerHarness } from "../llm/icebreaker.mjs";
import { createReplyDraftHarness } from "../llm/reply-draft.mjs";
import { createCloudMediaStore } from "./media.mjs";
import { createSQLiteAdapter } from "./sqlite.mjs";
import { dispatch } from "./http.mjs";

export class AnhaoApplication extends DurableObject {
  constructor(state, bindings) {
    super(state, bindings);
    this.state = state;
    this.db = createSQLiteAdapter(state.storage);
    const env = Object.fromEntries(Object.entries(bindings).filter(([, value]) => typeof value === "string"));
    env.NODE_ENV = "production";
    env.DATA_DIR = "/data";
    this.application = createApplication({
      db: this.db, env,
      // CHAT_MEDIA (R2) is optional; without it image/GIF sending is disabled (503 MEDIA_DISABLED).
      createMediaStore: options => createCloudMediaStore({ ...options, bucket: bindings.CHAT_MEDIA || null }),
      harnessFactory: ({ env, sharedConcurrency }) => ({
        icebreakerHarness: createIcebreakerHarness({ env, sharedConcurrency, ledgerFactory: () => this.db }),
        replyDraftHarness: createReplyDraftHarness({ env, sharedConcurrency, ledgerFactory: () => this.db })
      }),
      usageReader: date => {
        if (!this.db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='runs'").get()) return 0;
        return this.db.prepare("SELECT COUNT(*) AS count FROM runs WHERE day=?").get(date).count;
      },
      beforeAutoReply: () => state.storage.setAlarm(Date.now() + 60_000),
      background: promise => state.waitUntil(promise)
    });
    this.application.start();
  }
  fetch(request) { return dispatch(this.application, request, promise => this.state.waitUntil(promise)); }
  async alarm() {
    this.application.resume();
    if (this.application.hasPendingAutoReply()) await this.state.storage.setAlarm(Date.now() + 60_000);
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) {
      const id = env.ANHAO.idFromName("closed-beta-v1");
      const headers = new Headers(request.headers);
      headers.set("x-anhao-request-origin", url.origin);
      return env.ANHAO.get(id).fetch(new Request(request, { headers }));
    }
    if (url.pathname === "/") { url.pathname = "/signal-mvp.html"; return env.ASSETS.fetch(new Request(url, request)); }
    return env.ASSETS.fetch(request);
  }
};
