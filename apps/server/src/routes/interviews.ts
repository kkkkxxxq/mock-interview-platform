import { Hono } from "hono";
import { z } from "zod";
import { authMiddleware, getAuthUser } from "../auth";
import { db } from "../db";
import {
  startInterview,
  getInterviewRow,
  submitAnswer,
  finalizeInterScore
} from "../services/interview";
import type { InterviewRow } from "../services/interview";
import { getLogs } from "../services/logs";

/** 统计口头禅：在用户作答文本中数常见语气词次数 */
const FILLER_WORDS = ["嗯", "呃", "那个", "就是", "然后", "反正", "其实", "怎么说", "呢个", "欸"];
function countFillers(texts: string[]) {
  const counts: Record<string, number> = {};
  for (const t of texts) {
    for (const w of FILLER_WORDS) {
      let n = 0;
      let i = 0;
      while ((i = t.indexOf(w, i)) !== -1) {
        n += 1;
        i += w.length;
      }
      if (n > 0) counts[w] = (counts[w] ?? 0) + n;
    }
  }
  return Object.entries(counts)
    .map(([word, count]) => ({ word, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);
}

const interviews = new Hono();
interviews.use("*", authMiddleware);

const StartSchema = z.object({
  role: z.enum(["backend", "frontend", "algorithm", "product", "data"]),
  companyId: z.string().nullable().optional(),
  techRequirements: z.array(z.string()).default([]),
  questionCount: z.number().int().min(1).max(99).default(5),
  unlimited: z.boolean().optional().default(false),
  jdText: z.string().optional().default("")
});

function toDto(row: InterviewRow) {
  return {
    id: row.id,
    role: row.role,
    companyId: row.company_id,
    companyName: row.company_name,
    techRequirements: row.tech_requirements,
    status: row.status,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    durationSeconds: row.duration_seconds,
    questionCount: row.question_count,
    currentQuestionIndex: row.current_question_index,
    unlimited: row.unlimited,
    jdText: row.jd_text ?? ""
  };
}

interviews.post("/", async (c) => {
  const user = getAuthUser(c);
  const parsed = StartSchema.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: "参数错误", detail: parsed.error.flatten() }, 400);

  // 每日训练次数配额：跨天自动重置
  const today = new Date().toISOString().slice(0, 10);
  const q = await db.query(
    "SELECT quota_limit, quota_date, quota_used FROM users WHERE id = $1",
    [user.id]
  );
  const qr = q.rows[0] as { quota_limit: number; quota_date: string | null; quota_used: number };
  const used = String(qr.quota_date ?? "").slice(0, 10) === today ? qr.quota_used : 0;
  if (used >= qr.quota_limit) {
    return c.json(
      {
        error: `今日训练次数已用完（${qr.quota_limit}/${qr.quota_limit}），明日起自动恢复`,
        quota: { limit: qr.quota_limit, used: used, remaining: 0 }
      },
      403
    );
  }

  const input = { userId: user.id, ...parsed.data, companyId: parsed.data.companyId ?? null };
  const row = await startInterview(input);

  const roleLabel = ({ backend: "后端开发", frontend: "前端开发", algorithm: "算法工程师", product: "产品经理", data: "数据分析" } as Record<string, string>)[row.role] ?? row.role;
  const introQuestion = `请先做一个 1 分钟的自我介绍：说说你的教育背景、项目或实习经历，与你应聘「${roleLabel}」岗位相关的亮点，以及你为什么适合这个岗位。`;
  await db.query(
    "INSERT INTO interview_questions (interview_id, question_index, question) VALUES ($1, 0, $2)",
    [row.id, introQuestion]
  );
  const fresh = await getInterviewRow(row.id, user.id);

  // 消费一次配额
  await db.query(
    String(qr.quota_date ?? "").slice(0, 10) === today
      ? "UPDATE users SET quota_used = quota_used + 1 WHERE id = $1"
      : "UPDATE users SET quota_date = $2, quota_used = 1 WHERE id = $1",
    String(qr.quota_date ?? "").slice(0, 10) === today ? [user.id] : [user.id, today]
  );

  return c.json(
    { interview: toDto(fresh!), firstQuestion: { questionIndex: 0, question: introQuestion }, quota: { limit: qr.quota_limit, used: used + 1, remaining: qr.quota_limit - used - 1 } },
    201
  );
});

interviews.get("/", async (c) => {
  const user = getAuthUser(c);
  const { rows } = await db.query(
    `SELECT i.*, s.score AS overall_score
     FROM interviews i
     LEFT JOIN scores s ON s.interview_id = i.id AND s.dimension = 'overall'
     WHERE i.user_id = $1 ORDER BY i.started_at DESC`,
    [user.id]
  );
  return c.json({ interviews: rows.map((r) => ({ ...toDto(r), overallScore: r.overall_score ?? null })) });
});

interviews.get("/:id", async (c) => {
  const user = getAuthUser(c);
  const row = await getInterviewRow(c.req.param("id"), user.id);
  if (!row) return c.json({ error: "面试不存在" }, 404);

  const [qRows, scoreRows, logRows] = await Promise.all([
    db.query("SELECT * FROM interview_questions WHERE interview_id = $1 ORDER BY question_index", [row.id]),
    db.query("SELECT * FROM scores WHERE interview_id = $1 ORDER BY dimension", [row.id]),
    getLogs(row.id)
  ]);

  return c.json({
    interview: toDto(row),
    summary: row.summary,
    logs: logRows,
    questions: qRows.rows.map((q) => ({
      questionIndex: q.question_index,
      question: q.question,
      answerTranscript: q.answer_transcript,
      interviewerFeedback: q.interviewer_feedback,
      sampleAnswer: q.sample_answer ?? "",
      quality: q.quality ?? null
    })),
    scores: scoreRows.rows.map((s) => ({
      dimension: s.dimension,
      label: s.label,
      score: s.score,
      maxScore: s.max_score,
      comment: s.comment
    })),
    fillerStats: countFillers(
      qRows.rows.map((q) => q.answer_transcript ?? "").filter(Boolean)
    )
  });
});

const AnswerSchema = z.object({
  questionIndex: z.number().int().min(0),
  answer: z.string().min(1)
});

interviews.post("/:id/answer", async (c) => {
  const user = getAuthUser(c);
  const row = await getInterviewRow(c.req.param("id"), user.id);
  if (!row) return c.json({ error: "面试不存在" }, 404);
  if (row.status !== "in_progress") return c.json({ error: "面试已结束" }, 409);

  const parsed = AnswerSchema.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: "参数错误" }, 400);

  const { feedback, done } = await submitAnswer(row, parsed.data.questionIndex, parsed.data.answer);

  if (done) {
    const fresh = await getInterviewRow(row.id, user.id);
    await finalizeInterScore(fresh!);
  }

  return c.json({ feedback, done });
});

export default interviews;