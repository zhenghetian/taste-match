// Adapters execute the callback synchronously (e.g. Durable Object transactionSync).
export function transaction(db, callback) {
  if (typeof db.transaction === "function") return db.transaction(callback);
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = callback();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    try { db.exec("ROLLBACK"); } catch {}
    throw error;
  }
}
