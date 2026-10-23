import http from "node:http";
import { existsSync, mkdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import { extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { createApplication } from "./server-core.mjs";
import { createChatMediaStore } from "./chat-media.mjs";
import { createIcebreakerHarness } from "./llm/icebreaker.mjs";
import { createReplyDraftHarness } from "./llm/reply-draft.mjs";
import { createNodeLedger } from "./llm/node-ledger.mjs";

const ROOT = fileURLToPath(new URL(".", import.meta.url));
const env = { ...process.env };
const DATA_DIR = env.DATA_DIR || join(ROOT, "data");
const PORT = Number(env.PORT || 4173);
const HOST = env.HOST || (env.NODE_ENV === "production" ? "0.0.0.0" : "127.0.0.1");
mkdirSync(DATA_DIR, { recursive: true });
const db = new DatabaseSync(join(DATA_DIR, "anhao.db"));
db.exec("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;");
db.transaction = callback => {
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = callback();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    try { db.exec("ROLLBACK"); } catch {}
    throw error;
  }
};

// One Node application per module import preserves the existing test contract.
const app = createApplication({
  db, env,
  createMediaStore: options => createChatMediaStore({ ...options, dataDir: DATA_DIR }),
  harnessFactory: ({ env, sharedConcurrency }) => {
    const ledgerFactory = createNodeLedger;
    return {
      icebreakerHarness: createIcebreakerHarness({ env, sharedConcurrency, ledgerFactory }),
      replyDraftHarness: createReplyDraftHarness({ env, sharedConcurrency, ledgerFactory })
    };
  },
  usageReader: date => {
    const ledgerPath = join(DATA_DIR, "ai-harness.db");
    if (!existsSync(ledgerPath)) return 0;
    const ledger = new DatabaseSync(ledgerPath, { readOnly: true });
    try {
      const hasRuns = ledger.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='runs'").get();
      return hasRuns ? ledger.prepare("SELECT COUNT(*) AS count FROM runs WHERE day=?").get(date).count : 0;
    } finally { ledger.close(); }
  }
});

function fail(res, status, code, message) {
  const body = JSON.stringify({ error: { code, message } });
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "content-length": Buffer.byteLength(body) });
  res.end(body);
}

const MIME = { ".html":"text/html; charset=utf-8", ".css":"text/css; charset=utf-8", ".js":"text/javascript; charset=utf-8", ".mjs":"text/javascript; charset=utf-8", ".json":"application/json; charset=utf-8", ".jpg":"image/jpeg", ".jpeg":"image/jpeg", ".png":"image/png", ".svg":"image/svg+xml", ".mp4":"video/mp4", ".webmanifest":"application/manifest+json" };
const PUBLIC_FILES = new Set([
  "/signal-mvp.html", "/index.html", "/admin.html", "/echo-prototype.html", "/ia-prototype.html",
  "/app.js", "/content-library.mjs", "/chat-sharing.mjs", "/styles.css", "/sw.js", "/manifest.webmanifest",
  "/agent-admin.html", "/agent-admin.mjs", "/agent-admin.css"
]);
const ASSET_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".svg", ".mp4"]);
function staticFile(req,res,url) {
  let requested;
  try { requested = decodeURIComponent((req.url || "/").split("?")[0]); }
  catch { return fail(res,404,"NOT_FOUND","页面不存在"); }
  if (requested.includes("\\") || requested.includes("\0") || requested.split("/").some((part) => part.startsWith("."))) {
    return fail(res,404,"NOT_FOUND","页面不存在");
  }
  const pathname = requested === "/" ? "/signal-mvp.html" : requested;
  const isAsset = pathname.startsWith("/assets/") && ASSET_EXTENSIONS.has(extname(pathname).toLowerCase());
  if (!PUBLIC_FILES.has(pathname) && !isAsset) return fail(res,404,"NOT_FOUND","页面不存在");
  const target = resolve(ROOT, `.${pathname}`);
  if (!target.startsWith(resolve(ROOT) + sep) || !existsSync(target) || !statSync(target).isFile()) return fail(res,404,"NOT_FOUND","页面不存在");
  const actual = realpathSync(target);
  if (actual !== target || (isAsset && !actual.startsWith(resolve(ROOT,"assets") + sep))) return fail(res,404,"NOT_FOUND","页面不存在");
  const content = readFileSync(target);
  const headers = { "content-type":MIME[extname(target).toLowerCase()] || "application/octet-stream", "content-length":content.length, "cache-control":target.endsWith("index.html") ? "no-cache" : "public, max-age=3600" };
  if (extname(target)===".mp4") headers["accept-ranges"]="bytes";
  res.writeHead(200,headers); res.end(content);
}

export function createServer(options = {}) {
  app.configureHarnesses(options);
  app.start();
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
    try {
      if (url.pathname.startsWith("/api/")) await app.handle(req, res, url);
      else staticFile(req, res, url);
    } catch (error) {
      if (!error.status || error.status >= 500) console.error(error);
      if (!res.headersSent) fail(res, error.status || 500, error.code || "SERVER_ERROR", error.status ? error.message : "服务器暂时出了点问题");
      else res.end();
    }
  });
  server.on("close", () => app.close());
  return server;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const server = createServer().listen(PORT, HOST, () => console.log(`暗号闭测版已启动: http://${HOST}:${PORT}`));
  const shutdown = () => {
    app.close();
    server.close();
  };
  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);
}
