// Keep SQL synchronous inside the owning Durable Object. Transactions must not cross await.
export function createSQLiteAdapter(storage) {
  const sql = storage.sql;
  return {
    exec(text) { return sql.exec(text); },
    prepare(text) {
      return {
        all(...bindings) { return sql.exec(text, ...bindings).toArray(); },
        get(...bindings) { return sql.exec(text, ...bindings).toArray()[0]; },
        run(...bindings) {
          sql.exec(text, ...bindings).toArray();
          const row = sql.exec("SELECT changes() AS changes, last_insert_rowid() AS lastInsertRowid").one();
          return row;
        }
      };
    },
    transaction(callback) { return storage.transactionSync(callback); },
    close() { /* Object storage is owned by the platform, including shared ledger access. */ }
  };
}
