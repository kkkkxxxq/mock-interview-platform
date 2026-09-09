import { Hono } from "hono";
import { z } from "zod";
import { authMiddleware, getAuthUser } from "../auth";
import { db } from "../db";
import { getInterviewRow } from "../services/interview";
import { chat } from "../services/llm";

const reports = new Hono();
reports.use("*", authMiddleware);

function toDto(r: Record<string, unknown>) {
  return {
    id: r.id,
    interviewId: r.interview_id,
    rawContent: r.raw_content ?? "",
    optimizedContent: r.optimized_content ?? "",
    improvements: r.improvements ?? [],
    suggestions: r.suggestions ?? [],
    isEdited: r.is_edited ?? false,
    updatedAt: r.updated_at
  };
}

const SaveSchema = z.object({
  rawContent: z.string().optional(),
  optimizedContent: z.string().optional(),
  improvements: z.array(z.string()).optional(),
  suggestions: z.array(z.string()).optional()
});

async function getReport(interviewId: string, userId: string): Promise<Record<string, unknown> | null> {
  const row = await getInterviewRow(interviewId, userId);
  if (!row) return null;
  const { rows } = await db.query("SELECT * FROM resume_reports WHERE interview_id = $1", [interviewId]);
  return rows[0] ?? null;
}

/** 生成（可覆盖已保存的草稿为最新 AI 生成版） */
reports.post("/:interviewId", async (c) => {
  const user = getAuthUser(c);
  const interviewId = c.req.param("interviewId");
  const row = await getInterviewRow(interviewId, user.id);
  if (!row) return c.json({ error: "面试不存在" }, 404);
  if (!row.summary) return c.json({ error: "面试尚未评分，无法生成简历报告" }, 409);

  const { rows } = await db.query(
    `SELECT q.question_index, q.question, q.answer_transcript, q.interviewer_feedback FROM interview_questions q WHERE q.interview_id = $1 ORDER BY q.question_index`,
    [interviewId]
  );
  const transcript = rows
    .map((q) => `题目: ${q.question}\n作答: ${q.answer_transcript ?? "（无）"}`)
    .join("\n\n");

  // 读取用户已上传的原始简历（若有），作为优化基准
  const uRes = await db.query("SELECT resume_text, resume_file_name FROM users WHERE id=$1", [user.id]);
  const userResume = uRes.rows[0];
  const resumeText = userResume?.resume_text?.trim?.() ?? "";
  const resumePart =
    resumeText.length > 0
      ? `\n面试者的原始简历（${userResume.resume_file_name ?? "上传文件"}）：\n${resumeText.slice(0, 3000)}\n\n请结合原始简历给出针对性改写建议。`
      : "\n面试者未上传简历。";

  const prompt = `你是资深 HR 与简历优化专家。面试者的目标岗位是【${row.role}】，本次模拟面试的评分总结、逐题提问与作答记录如下：\n总结：\n${row.summary}\n\n作答记录：\n${transcript}${resumePart}
请把面试中暴露出的实际情况当作"照妖镜"，倒推出简历上的问题，评价的是【简历本身】（岗位匹配度、项目量化、结构表达、亮点与真实性、面试表现一致性），不要写成泛泛的面试点评。
请严格、具体输出 JSON：
{
  "resume_evaluation": "一段 100 字以内的综合评价：结合面试中实际暴露的短板（回答含糊、理由缺失、追问答不上的技术点等）指出简历相应问题",
  "resume_score": 0,
  "resume_dimensions": [
    {"label": "岗位匹配度", "score": 0, "comment": "一句话，结合面试实况"},
    {"label": "项目量化", "score": 0, "comment": "一句话，结合面试实况"},
    {"label": "结构表达", "score": 0, "comment": "一句话，结合面试实况"},
    {"label": "亮点突出", "score": 0, "comment": "一句话，结合面试实况"},
    {"label": "面试一致性", "score": 0, "comment": "一句话，结合面试实况"}
  ],
  "optimized_content": "完整简历改写文本（结构化要点、可量化的项目描述建议，直接可编辑）",
  "improvements": ["3-5 条根据面试暴露缺陷给出的简历修改点，每条一句话"],
  "suggestions": ["3-5 条后续针对性准备建议，每条一句话"]
}`;

  const res = await chat([{ role: "user", content: prompt }], { json: true, temperature: 0.6 });
  let data: Record<string, unknown> = {};
  try {
    data = JSON.parse(res.text);
  } catch {
    data = {};
  }

  const diag = {
    evaluation: String(data.resume_evaluation ?? ""),
    score: Number(data.resume_score) || 0,
    dimensions: Array.isArray(data.resume_dimensions)
      ? (data.resume_dimensions as Record<string, unknown>[]).map((d) => ({
          label: String(d.label ?? ""),
          score: Math.max(0, Math.min(100, Number(d.score) || 0)),
          comment: String(d.comment ?? "")
        }))
      : []
  };

  const insert = await db.query(
    `INSERT INTO resume_reports (interview_id, raw_content, optimized_content, improvements, suggestions, is_edited, updated_at)
     VALUES ($1,$2,$3,$4,$5,false, now())
     ON CONFLICT (interview_id) DO UPDATE SET
       raw_content=EXCLUDED.raw_content,
       optimized_content=EXCLUDED.optimized_content,
       improvements=EXCLUDED.improvements,
       suggestions=EXCLUDED.suggestions,
       updated_at=now()
     RETURNING *`,
    [
      interviewId,
      JSON.stringify(diag),
      String(data.optimized_content ?? ""),
      Array.isArray(data.improvements) ? data.improvements : [],
      Array.isArray(data.suggestions) ? data.suggestions : []
    ]
  );
  return c.json({ report: toDto(insert.rows[0]) });
});

/** 保存用户编辑 */
reports.put("/:interviewId", async (c) => {
  const user = getAuthUser(c);
  const interviewId = c.req.param("interviewId");
  const existing = await getReport(interviewId, user.id);
  if (!existing) return c.json({ error: "报告不存在" }, 404);

  const parsed = SaveSchema.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: "参数错误" }, 400);

  const current = existing;
  const next = {
    rawContent: parsed.data.rawContent ?? current.raw_content ?? "",
    optimizedContent: parsed.data.optimizedContent ?? current.optimized_content ?? "",
    improvements: parsed.data.improvements ?? current.improvements ?? [],
    suggestions: parsed.data.suggestions ?? current.suggestions ?? []
  };

  const { rows } = await db.query(
    `UPDATE resume_reports SET raw_content=$1, optimized_content=$2, improvements=$3, suggestions=$4, is_edited=true, updated_at=now()
     WHERE interview_id=$5 RETURNING *`,
    [next.rawContent ?? "", next.optimizedContent ?? "", next.improvements, next.suggestions, interviewId]
  );
  return c.json({ report: toDto(rows[0]) });
});

/** 读取（若不存在则空） */
reports.get("/:interviewId", async (c) => {
  const user = getAuthUser(c);
  const existing = await getReport(c.req.param("interviewId"), user.id);
  if (!existing) return c.json({ error: "报告不存在" }, 404);
  return c.json({ report: toDto(existing) });
});

export default reports;