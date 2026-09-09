import { Hono } from "hono";
import { authMiddleware, getAuthUser } from "../auth";
import { db } from "../db";
import { parseResume } from "../services/resume";

const resume = new Hono();
resume.use("*", authMiddleware);

const MAX_SIZE = 10 * 1024 * 1024; // 10MB

/** 上传并解析简历（PDF / Word）。multipart/form-data，字段名 resume */
resume.post("/", async (c) => {
  const user = getAuthUser(c);
  const form = await c.req.formData();
  const file = form.get("resume");
  if (!file || typeof file === "string") return c.json({ error: "请选择简历文件" }, 400);

  const name = file.name.trim();
  const lower = name.toLowerCase();
  if (!/\.(pdf|docx|doc)$/i.test(lower)) return c.json({ error: "仅支持 PDF 与 Word（.docx / .doc）格式" }, 400);
  if (file.size > MAX_SIZE) return c.json({ error: "文件超过 10MB 限制" }, 413);

  const buffer = Buffer.from(await file.arrayBuffer());
  let parsed;
  try {
    parsed = await parseResume(name, buffer);
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : "简历解析失败" }, 422);
  }

  await db.query(
    `UPDATE users SET resume_text=$1, resume_file_name=$2, resume_uploaded_at=now() WHERE id=$3`,
    [parsed.text, name, user.id]
  );

  return c.json({
    resume: {
      fileName: name,
      characters: parsed.text.length,
      preview: parsed.text.slice(0, 300)
    }
  }, 201);
});

/** 读取当前用户已上传的简历 */
resume.get("/", async (c) => {
  const user = getAuthUser(c);
  const { rows } = await db.query(
    "SELECT resume_text, resume_file_name, resume_uploaded_at FROM users WHERE id=$1",
    [user.id]
  );
  const row = rows[0];
  if (!row) return c.json({ error: "未上传简历" }, 404);
  return c.json({
    resume: {
      fileName: row.resume_file_name ?? "",
      uploadedAt: row.resume_uploaded_at ?? null,
      characters: (row.resume_text ?? "").length,
      text: row.resume_text ?? ""
    }
  });
});

export default resume;