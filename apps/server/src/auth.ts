import { createMiddleware } from "hono/factory";
import { jwtVerify, SignJWT } from "jose";
import { env } from "./config";
import { db } from "./db";

export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
}

const secret = new TextEncoder().encode(env.JWT_SECRET);

export async function signToken(user: AuthUser): Promise<string> {
  return new SignJWT({ sub: user.id, email: user.email })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(secret);
}

export async function verifyToken(token: string): Promise<AuthUser | null> {
  try {
    const { payload } = await jwtVerify(token, secret);
    const { rows } = await db.query(
      "SELECT id, email, display_name FROM users WHERE id = $1",
      [payload.sub]
    );
    const row = rows[0];
    if (!row) return null;
    return { id: row.id, email: row.email, displayName: row.display_name };
  } catch {
    return null;
  }
}

export const authMiddleware = createMiddleware<{ Variables: { user: AuthUser } }>(async (c, next) => {
  const header = c.req.header("Authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return c.json({ error: "未提供认证信息" }, 401);
  const user = await verifyToken(token);
  if (!user) return c.json({ error: "认证失败或已过期" }, 401);
  c.set("user", user);
  await next();
});

export function getAuthUser(c: { get: (k: "user") => AuthUser }): AuthUser {
  return c.get("user");
}