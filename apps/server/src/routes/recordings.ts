import { Hono } from "hono";
import { createWriteStream } from "node:fs";
import { mkdir, readdir } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { authMiddleware, getAuthUser } from "../auth";
import { db } from "../db";
import { getInterviewRow } from "../services/interview";

const DATA_DIR = path.resolve(process.cwd(), "data", "recordings");

const recordings = new Hono();
recordings.use("*", authMiddleware);

/** 上传某题的录像/音频，落盘到本地（MVP 阶段；上线换 S3/MinIO）。 */
recordings.post("/:interviewId", async (c) => {
  const user = getAuthUser(c);
  const interviewId = c.req.param("interviewId");
  const row = await getInterviewRow(interviewId, user.id);
  if (!row) return c.json({ error: "面试不存在" }, 404);

  const form = await c.req.formData();
  const file = form.get("file");
  const questionIndexRaw = form.get("questionIndex");
  const questionIndex = questionIndexRaw ? Number(questionIndexRaw) : 0;
  if (!file || typeof file === "string") return c.json({ error: "缺少文件" }, 400);

  const mimeType = file.type || "video/webm";
  const ext = mimeType.includes("mp4") ? "mp4" : mimeType.includes("audio") ? "weba" : "webm";
  const key = `${interviewId}/${questionIndex}-${randomUUID()}.${ext}`;
  const filePath = path.join(DATA_DIR, key);

  await mkdir(path.dirname(filePath), { recursive: true });
  const buf = Buffer.from(await file.arrayBuffer());
  await new Promise<void>((resolve, reject) => {
    const ws = createWriteStream(filePath);
    ws.on("finish", resolve);
    ws.on("error", reject);
    ws.end(buf);
  });

  const url = `/api/recordings/static/${key}`;
  const { rows } = await db.query(
    `INSERT INTO recordings (interview_id, question_index, s3_key, url, mime_type, duration_seconds)
     VALUES ($1,$2,$3,$4,$5,0) RETURNING id, url, s3_key`,
    [interviewId, questionIndex, key, url, mimeType]
  );
  return c.json({ recording: rows[0] });
});

/** 回放：仅本人可取回本地文件。 */
recordings.get("/static/:path", async (c) => {
  const key = c.req.param("path");
  const user = getAuthUser(c);
  const { rows } = await db.query(
    `SELECT r.* FROM recordings r JOIN interviews i ON i.id = r.interview_id
     WHERE r.s3_key = $1 AND i.user_id = $2`,
    [key, user.id]
  );
  if (!rows.length) return c.json({ error: "录像不存在" }, 404);
  const filePath = path.join(DATA_DIR, key);
  const exists = await import("node:fs/promises").then((m) =>
    m.stat(filePath).then((s) => s.isFile(), () => false)
  );
  if (!exists) return c.json({ error: "文件不存在" }, 404);
  const { createReadStream } = await import("node:fs");
  const stream = createReadStream(filePath) as unknown as ReadableStream;
  return new Response(stream, {
    headers: {
      "Content-Type": rows[0].mime_type || "video/webm",
      "Content-Disposition": `inline; filename="${path.basename(key)}"`
    }
  });
});

recordings.get("/:interviewId", async (c) => {
  const user = getAuthUser(c);
  const { rows } = await db.query(
    `SELECT id, interview_id, s3_key, url, duration_seconds, mime_type FROM recordings
     WHERE interview_id = $1 AND interview_id IN (SELECT id FROM interviews WHERE user_id = $2)
     ORDER BY question_index`,
    [c.req.param("interviewId"), user.id]
  );
  return c.json({ recordings: rows });
});

export default recordings;