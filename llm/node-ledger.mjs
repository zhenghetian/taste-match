import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { transaction } from "../sql-transaction.mjs";

export function createNodeLedger(env = process.env) {
  const dir = env.DATA_DIR || fileURLToPath(new URL("../data/", import.meta.url));
  mkdirSync(dir, { recursive: true });
  const db = new DatabaseSync(join(dir, "ai-harness.db"));
  try {
    db.exec("PRAGMA journal_mode=WAL; PRAGMA busy_timeout=1000;");
  } catch (error) {
    db.close();
    throw error;
  }
  // Pass a native-only view to the fallback to avoid re-entering db.transaction.
  db.transaction = (callback) => transaction({ exec: (sql) => db.exec(sql) }, callback);
  return db;
}
