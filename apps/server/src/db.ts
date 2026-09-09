import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export type Db = {
  query: (text: string, params?: unknown[]) => Promise<{ rows: any[] }>;
  connect: () => Promise<void>;
};

// pglite 的 nodefs 对含空格的深层路径 mkdir 会抛 ENOENT，故放在无空格目录
const dbDir = process.env.PGLITE_DIR || path.resolve("D:\\", "pglite-data");
import { mkdirSync } from "node:fs";
mkdirSync(dbDir, { recursive: true });

let _db: Db | null = null;

export async function getDb(): Promise<Db> {
  if (_db) return _db;

  const pg = new PGlite(dbDir);

  // 初始化 schema
  const schemaPath = path.resolve(__dirname, "db", "schema.sql");
  const schema = readFileSync(schemaPath, "utf-8");
  // pglite 不提供 pgcrypto，但内置 gen_random_uuid
  const clean = schema
    .replace(/CREATE EXTENSION IF NOT EXISTS "pgcrypto";/g, "")
    .replace(/CREATE EXTENSION IF NOT EXISTS pgcrypto;/g, "");

  await pg.exec(clean);

  _db = {
    query: async (text, params = []) => pg.query(text, params) as unknown as { rows: any[] },
    connect: async () => undefined
  };
  return _db;
}

/** 懒加载兼容对象：现有调用 `db.query(...)` 无需改动。 */
export const db: Db = {
  query: (text, params = []) => getDb().then((d) => d.query(text, params)),
  connect: () => getDb().then(() => undefined)
};

export async function healthCheck(): Promise<boolean> {
  try {
    const db = await getDb();
    await db.query("SELECT 1");
    return true;
  } catch (e) {
    console.error("[db] healthCheck error:", e);
    return false;
  }
}