import { db } from "../db";
import { getPersona } from "@mock/data";
import type { Role } from "@mock/shared";
import { chat } from "./llm";

export interface StartInterviewInput {
  userId: string;
  role: Role;
  companyId: string | null;
  techRequirements: string[];
  questionCount: number;
  unlimited?: boolean;
  jdText?: string;
}

export interface InterviewRow {
  id: string;
  user_id: string;
  role: Role;
  company_id: string | null;
  company_name: string | null;
  tech_requirements: string[];
  status: string;
  started_at: string;
  finished_at: string | null;
  duration_seconds: number | null;
  question_count: number;
  current_question_index: number;
  summary: string | null;
  unlimited: boolean;
  jd_text: string | null;
}

export async function getInterviewRow(id: string, userId: string): Promise<InterviewRow | null> {
  const { rows } = await db.query(
    "SELECT * FROM interviews WHERE id = $1 AND user_id = $2",
    [id, userId]
  );
  return rows[0] ?? null;
}

export async function startInterview(input: StartInterviewInput): Promise<InterviewRow> {
  const persona = getPersona(input.role, input.companyId, input.techRequirements, input.jdText);
  const questionCount = input.unlimited ? 0 : input.questionCount;
  const { rows } = await db.query(
    `INSERT INTO interviews (user_id, role, company_id, company_name, tech_requirements, question_count, unlimited, jd_text)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [
      input.userId,
      input.role,
      input.companyId,
      persona.company?.name ?? null,
      input.techRequirements,
      questionCount,
      Boolean(input.unlimited),
      input.jdText ?? ""
    ]
  );
  return rows[0];
}

/** 生成当前题目：读上一题上下文，让 AI 出下一题；第一题直接出。 */
export async function nextQuestion(row: InterviewRow): Promise<{ questionIndex: number; question: string }> {
  const persona = getPersona(row.role, row.company_id, row.tech_requirements, row.jd_text ?? undefined);
  const existing = await db.query(
    "SELECT question_index, question, answer_transcript, interviewer_feedback FROM interview_questions WHERE interview_id = $1 ORDER BY question_index",
    [row.id]
  );

  const questionIndex = row.current_question_index; // 0-based
  const doneCount = existing.rows.length;

  const history = existing.rows
    .map((q) => `题目${q.question_index + 1}: ${q.question}\n面试者作答: ${q.answer_transcript ?? "（未作答）"}\n点评: ${q.interviewer_feedback ?? "（无）"}`)
    .join("\n\n");

  const isFirst = doneCount === 0;
  const messages: { role: "system" | "user" | "assistant"; content: string }[] = [
    { role: "system", content: persona.systemPrompt }
  ];

  if (isFirst) {
    messages.push({
      role: "user" as const,
      content: `面试开始。请一次性给出第 1 题（只输出题目本身，一个主问题，可给面试者 2 分钟做准备的口头提示）。岗位：${persona.role}。`
    });
  } else {
    messages.push({
      role: "user" as const,
      content: `面试进行中。已经完成的题目如下：\n${history}\n\n请针对当前进度，给出下一个问题（只输出题目本身，不要重复之前的题，难度逐渐提升）。当前面试者需要回答第 ${questionIndex + 1} 题。`
    });
  }

  const res = await chat(messages, { temperature: 0.8 });
  const question = res.text.trim();

  await db.query(
    "INSERT INTO interview_questions (interview_id, question_index, question) VALUES ($1, $2, $3)",
    [row.id, questionIndex, question]
  );

  return { questionIndex, question };
}

/** 收到某题的作答（转写后），让 AI 点评 + 追问收尾，并推进题目索引。 */
export async function submitAnswer(
  row: InterviewRow,
  questionIndex: number,
  answer: string
): Promise<{ feedback: string; done: boolean }> {
  const persona = getPersona(row.role, row.company_id, row.tech_requirements, row.jd_text ?? undefined);
  const qRow = await db.query(
    "SELECT question FROM interview_questions WHERE interview_id = $1 AND question_index = $2",
    [row.id, questionIndex]
  );
  if (!qRow.rows[0]) throw new Error("question not found");

  const res = await chat(
    [
      { role: "system", content: persona.systemPrompt },
      { role: "user", content: `题目：${qRow.rows[0].question}\n\n面试者的作答（语音转写）:\n${answer}\n\n请按这题的实际情况输出：1) 一句话亮点；2) 一句话不足；3) 针对不足给 1 个追问让面试者补充（仅一题追问，若本题已完整可写"无"）；4) 你的推荐参考答案要点。输出格式：\n\n【亮点】...\n【不足】...\n【追问】...\n【参考答案要点】...` }
    ],
    { temperature: 0.7 }
  );
  const feedback = res.text.trim();

  await db.query(
    "UPDATE interview_questions SET answer_transcript = $1, interviewer_feedback = $2 WHERE interview_id = $3 AND question_index = $4",
    [answer, feedback, row.id, questionIndex]
  );

  const newIndex = questionIndex + 1;
  const done = !row.unlimited && newIndex >= row.question_count;
  await db.query(
    "UPDATE interviews SET current_question_index = $1, status = $2, finished_at = $3, duration_seconds = $4 WHERE id = $5",
    [newIndex, done ? "complete" : "in_progress", done ? new Date().toISOString() : null, null, row.id]
  );

  return { feedback, done };
}

/** 全部完成后：五维评分 + 技术要点总结 + 每题示范答案（评分规范化，不随机） */
export async function finalizeInterScore(row: InterviewRow): Promise<void> {
  const persona = getPersona(row.role, row.company_id, row.tech_requirements, row.jd_text ?? undefined);
  const { rows } = await db.query(
    "SELECT question_index, question, answer_transcript, interviewer_feedback, quality FROM interview_questions WHERE interview_id = $1 ORDER BY question_index",
    [row.id]
  );

  const answered = rows.map((q) => String(q.answer_transcript ?? "").trim());
  // 未作答判定：空白 / 少于 20 字（如"我不知道""没想过"）一律记 0 分，禁止 AI 脑补得分
  const UNANSWERED_THRESHOLD = 20;

  const transcript = rows
    .map((q) => {
      const a = String(q.answer_transcript ?? "").trim();
      const isUnanswered = a.length < UNANSWERED_THRESHOLD;
      return `题目[${q.question_index + 1}]: ${q.question}\n作答: ${isUnanswered ? "（未作答）" : a}`;
    })
    .join("\n\n");

  // 综合分锚点：逐题作答质量的加权均值（未作答=0，quality 0-3 映射到 0-100，缺失按 70 计）
  const aggScore = rows.length
    ? Math.round(
        rows.reduce((s, q) => {
          const a = String(q.answer_transcript ?? "").trim();
          if (a.length < UNANSWERED_THRESHOLD) return s + 0;
          const quality = typeof q.quality === "number" ? q.quality : 2;
          return s + Math.round(Math.min(100, Math.max(0, quality / 4) * 100));
        }, 0) / rows.length
      )
    : 0;

  const prompt = `${persona.systemPrompt}\n\n面试已结束。以下是本次面试的完整记录：\n\n${transcript}\n\n评分必须遵守以下硬性规则，不得违反：
1. 作答为空或少于 ${UNANSWERED_THRESHOLD} 字的题目一律视为「未作答 0 分」，禁止脑补得分。
2. 五个维度每条 score 与 comment 都必须依据某一题的实际作答来定，comment 必须引用「第 N 题」的具体表现，满分一律 100。
3. 评分档位标准化，禁止越档：完整且要点清晰 85-100；大部分正确 70-84；部分正确 50-69；含糊/答非所问 30-49；未作答 0-29。
4. 综合评分(overall)是各题作答质量的加权结果：本题逐题质量加权均值为 ${aggScore} 分，overall 必须落在 [${Math.max(0, aggScore - 10)}, ${Math.min(100, aggScore + 10)}] 区间内（后端会校验并强制修正）。
请生成 JSON（不要输出任何其他文字）：
{
  "scores": [
    {"dimension":"technical_accuracy","label":"技术准确性","score":0,"max_score":100,"comment":"引用第 N 题：…"},
    {"dimension":"logical_expression","label":"逻辑表达","score":0,"max_score":100,"comment":"引用第 N 题：…"},
    {"dimension":"communication_fluency","label":"沟通流畅度","score":0,"max_score":100,"comment":"引用第 N 题：…"},
    {"dimension":"responsiveness","label":"应变能力","score":0,"max_score":100,"comment":"引用第 N 题：…"},
    {"dimension":"overall","label":"综合评分","score":0,"max_score":100,"comment":"引用第 N 题：…"}
  ],
  "knowledge_summary": "面向实习生的各题重要技术知识点总结，含学习建议",
  "sample_answers": [
    {"question_index":0,"sample":"第1题的优秀示范作答（要点式，简洁专业）"}
  ]
}`;

  const res = await chat([{ role: "user", content: prompt }], { json: true, temperature: 0.5 });
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(res.text);
  } catch {
    data = {};
  }

  const scores = Array.isArray(data.scores) ? (data.scores as Record<string, unknown>[]) : [];
  for (const s of scores) {
    const dimension = String(s.dimension);
    const label = String(s.label ?? dimension);
    const raw = Number(s.score);
    let score = Number.isFinite(raw) ? Math.round(Math.min(100, Math.max(0, raw))) : 0;
    const maxScore = Math.round(Number(s.max_score) || 100);
    let comment = String(s.comment ?? "");

    if (dimension === "overall") {
      const ai = score;
      score = Number.isFinite(ai) && Math.abs(ai - aggScore) <= 10 ? ai : aggScore;
      if (!comment.includes("第")) comment = `基于逐题作答质量的加权均值（${aggScore} 分）。${comment || ""}`.trim();
    }

    await db.query(
      `INSERT INTO scores (interview_id, dimension, label, score, max_score, comment)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (interview_id, dimension) DO UPDATE SET score=EXCLUDED.score, comment=EXCLUDED.comment, label=EXCLUDED.label`,
      [row.id, dimension, label, score, maxScore, comment]
    );
  }

  // 保存每题示范答案
  const samples = Array.isArray(data.sample_answers) ? (data.sample_answers as Record<string, unknown>[]) : [];
  for (const sa of samples) {
    const idx = Number(sa.question_index);
    const sample = String(sa.sample ?? "");
    if (!Number.isNaN(idx) && sample) {
      await db.query(
        "UPDATE interview_questions SET sample_answer=$1 WHERE interview_id=$2 AND question_index=$3",
        [sample, row.id, idx]
      );
    }
  }

  // 兜底：整体评分未返回示范答案时，逐题补齐
  await ensureSampleAnswers(row);

  await db.query("UPDATE interviews SET summary = $1 WHERE id = $2", [String(data.knowledge_summary ?? ""), row.id]);
}

/** 为缺少示范答案的题目逐题生成优秀示范作答（评分模型偶发不返回时兜底）。 */
export async function ensureSampleAnswers(row: InterviewRow): Promise<void> {
  const persona = getPersona(row.role, row.company_id, row.tech_requirements, row.jd_text ?? undefined);
  const { rows } = await db.query(
    "SELECT question_index, question, answer_transcript FROM interview_questions WHERE interview_id=$1 AND (sample_answer IS NULL OR sample_answer='') ORDER BY question_index",
    [row.id]
  );
  for (const q of rows as { question_index: number; question: string; answer_transcript: string | null }[]) {
    try {
      const r = await chat(
        [
          { role: "system", content: persona.systemPrompt },
          { role: "user", content: `题目：${q.question}\n面试者的作答：${q.answer_transcript ?? "（未作答）"}\n\n请给出本题的一份优秀示范作答（面向实习生的参考答卷，要点式、简洁、专业，2-4 句话）。只输出示范作答内容本身。` }
        ],
        { temperature: 0.6 }
      );
      await db.query(
        "UPDATE interview_questions SET sample_answer=$1 WHERE interview_id=$2 AND question_index=$3",
        [r.text.trim(), row.id, q.question_index]
      );
    } catch {
      /* 单题失败不影响整体 */
    }
  }
}