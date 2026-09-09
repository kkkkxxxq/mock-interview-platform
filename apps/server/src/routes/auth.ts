import { Hono } from "hono";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { db } from "../db";
import { signToken, authMiddleware, getAuthUser } from "../auth";

const auth = new Hono();

const RegisterSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  displayName: z.string().min(1)
});

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
});

auth.post("/register", async (c) => {
  const parsed = RegisterSchema.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: "参数错误", detail: parsed.error.flatten() }, 400);
  const { email, password, displayName } = parsed.data;

  const existing = await db.query("SELECT id FROM users WHERE email = $1", [email]);
  if (existing.rows.length) return c.json({ error: "邮箱已被注册" }, 409);

  const hash = await bcrypt.hash(password, 10);
  const { rows } = await db.query(
    "INSERT INTO users (email, password_hash, display_name) VALUES ($1,$2,$3) RETURNING id, email, display_name",
    [email, hash, displayName]
  );
  const user = rows[0];
  const token = await signToken({ id: user.id, email: user.email, displayName: user.display_name });
  return c.json({ token, user });
});

auth.post("/login", async (c) => {
  const parsed = LoginSchema.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: "参数错误" }, 400);
  const { email, password } = parsed.data;

  const { rows } = await db.query("SELECT id, email, password_hash, display_name FROM users WHERE email = $1", [email]);
  const row = rows[0];
  if (!row) return c.json({ error: "邮箱或密码错误" }, 401);

  const ok = await bcrypt.compare(password, row.password_hash);
  if (!ok) return c.json({ error: "邮箱或密码错误" }, 401);

  const token = await signToken({ id: row.id, email: row.email, displayName: row.display_name });
  return c.json({ token, user: { id: row.id, email: row.email, displayName: row.display_name } });
});

auth.get("/me", authMiddleware, async (c) => {
  const u = getAuthUser(c);
  const { rows } = await db.query(
    "SELECT quota_limit, quota_date, quota_used FROM users WHERE id = $1",
    [u.id]
  );
  const r = rows[0] as { quota_limit: number; quota_date: string | null; quota_used: number };
  const today = new Date().toISOString().slice(0, 10);
  const used = String(r.quota_date ?? "").slice(0, 10) === today ? r.quota_used : 0;
  return c.json({
    user: { ...u, quotaLimit: r.quota_limit, quotaUsed: used, quotaRemaining: Math.max(0, r.quota_limit - used) }
  });
});

export default auth;