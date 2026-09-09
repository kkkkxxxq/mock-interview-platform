import { getDb } from "../src/db";

try {
  const db = await getDb();
  const r = await db.query("SELECT 1");
  console.log("DB OK:", JSON.stringify(r.rows));
  const t = await db.query("SELECT * FROM users LIMIT 0");
  console.log("users ok, rows:", t.rows.length);
} catch (e) {
  console.error("DB ERROR:", e);
}
process.exit(0);