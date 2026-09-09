import { WebSocketServer, WebSocket } from "ws";
import { IncomingMessage } from "node:http";
import { verifyToken, type AuthUser } from "../auth";
import { getInterviewRow, ensureSampleAnswers } from "../services/interview";
import { db } from "../db";
import { transcribe } from "../services/stt";
import { synthesizeSpeech, isMockAudio } from "../services/tts";
import { chat } from "../services/llm";
import { appendLog } from "../services/logs";
import { getPersona } from "@mock/data";

/**
 * 实时语音面试 WebSocket。
 *
 * 协议（均为 JSON 消息）：
 * - client → server:  { type: "start" }
 * - client → server:  { type: "audio", data: "<base64 pcm/int16 16000Hz 20ms>" }
 * - client → server:  { type: "interrupt" }   // 插话：停止 TTS 回到聆听
 * - client → server:  { type: "end" }         // 关键词/手动结束面试
 * - server → client:  { type: "question", question }         // 出下一题
 * - server → client:  { type: "transcript_partial", text }   // 实时转写中间结果
 * - server → client:  { type: "transcript_final", text, turnEnded }
 * - server → client:  { type: "speak", text, audio }         // AI 开口（含 TTS base64）
 * - server → client:  { type: "speak_done" }
 * - server → client:  { type: "followup", question }          // AI 追问
 * - server → client:  { type: "interview_complete" }
 * - server → client:  { type: "error", message }
 */

interface AudioTurn {
  chunks: Buffer[];
  fullText: string;
  partialText: string;
}

export function setupRTInterview(wsServer: WebSocketServer) {
  wsServer.on("connection", async (ws: WebSocket, req: IncomingMessage) => {
    const user = await authenticate(req);
    if (!user) {
      ws.send(JSON.stringify({ type: "error", message: "认证失败" }));
      ws.close();
      return;
    }

    let interviewId: string | null = null;
    let turn: AudioTurn | null = null;
    let aiSpeaking = false;
    let finished = false;
    let ending = false;
    let currentQuestionIndex = 0;
    let followupCount = 0;
    let silenceMs = 0;
    let speaking = false;
    let sending = false;

    const send = (msg: unknown) => {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
    };

    const startInterviewSession = async (id: string) => {
      interviewId = id;
      const row = await getInterviewRow(id, user.id);
      if (!row) {
        send({ type: "error", message: "面试不存在" });
        ws.close();
        return;
      }
      currentQuestionIndex = row.current_question_index;
      // 出第一题（或恢复当前题）
      const q = await db.query(
        "SELECT question FROM interview_questions WHERE interview_id = $1 AND question_index = $2",
        [id, currentQuestionIndex]
      );
      if (q.rows[0]) {
        const text = q.rows[0].question;
        // 开场：全新面试时先发送问候与流程说明（含自我介绍引导），构成“开场”阶段
        const logCount = await db.query("SELECT COUNT(*)::int AS n FROM interview_logs WHERE interview_id = $1", [id]);
        const isFresh = (logCount.rows[0]?.n ?? 0) === 0;
        if (isFresh && currentQuestionIndex === 0) {
          const opening =
            "你好，欢迎参加本次模拟面试。我是你的面试官，接下来的问答仅用于训练，不代表任何录取决定。我们先从自我介绍开始：请用 1-2 分钟介绍你的方向、项目或学习经历，然后我们进入正式提问。";
          await appendLog(id, "ai", "opening", opening);
          send({ type: "opening", text: opening });
          await speak(opening);
        }
        await appendLog(id, "ai", "question", text);
        send({ type: "question", question: text });
        await speak(text);
      } else {
        send({ type: "error", message: "暂无题目" });
      }
    };

    /** AI 合成语音并播报；若被插话则提前结束。 */
    const speak = async (text: string) => {
      aiSpeaking = true;
      send({ type: "speak_start", text });
      try {
        const audio = await synthesizeSpeech(text);
        if (isMockAudio(audio)) {
          // 无 TTS Key：仅发送文字，前端用"大字提示"代替语音
          send({ type: "speak_text", text });
        } else if (aiSpeaking) {
          send({ type: "speak", text, audio });
        }
      } catch (e) {
        if (aiSpeaking) send({ type: "speak_fail", text, message: e instanceof Error ? e.message : "TTS 失败" });
      }
      aiSpeaking = false;
      send({ type: "speak_done" });
    };

    const processTurn = async (fullText: string) => {
      if (finished || !interviewId) return;
      // 关键词收尾检测
      if (/(结束对话|回答完毕|今天就到这|结束面试)/.test(fullText)) {
        send({ type: "transcript_final", text: fullText, turnEnded: true, ending: true });
        await handleEnding(fullText);
        return;
      }

      // 保存作答
      const qRow = await db.query(
        "SELECT question FROM interview_questions WHERE interview_id = $1 AND question_index = $2",
        [interviewId, currentQuestionIndex]
      );
      const question = qRow.rows?.[0]?.question ?? "";
      await db.query(
        "UPDATE interview_questions SET answer_transcript = $1 WHERE interview_id = $2 AND question_index = $3",
        [fullText, interviewId, currentQuestionIndex]
      );
      await appendLog(interviewId, "user", "answer", fullText);

      // 过程分：累计作答质量达到 80 分则提前结束面试
      if (await reachedTargetScore(interviewId)) {
        await handleEnding();
        return;
      }

      // AI 回应：先简短评价 + 追问（人设驱动）
      const sessionRow = await getInterviewRow(interviewId, user.id);
      const persona = sessionRow
        ? getPersona(sessionRow.role, sessionRow.company_id, sessionRow.tech_requirements, sessionRow.jd_text ?? undefined)
        : getPersona("backend", null, []);
      const res = await chat(
        [
          { role: "system", content: persona.systemPrompt },
          { role: "user", content: `题目：${question}\n面试者回答（语音转写）：${fullText}\n\n请点评并追问，全程像真人面试官一样自然说话，不要输出格式化标签。结构固定为三句话：1) 一句话肯定其正确/合理之处；2) 一句话指出不足；3) 仅一个追问句，只针对一个具体的点。整段控制在 3-4 句话以内，不要列数字编号，不要用"另外/其次/还有"等词并列多个问题。` }
        ],
        { temperature: 0.7 }
      );

      if (followupCount < 1) {
        followupCount += 1;
        await appendLog(interviewId, "ai", "feedback", res.text);
        await speak(res.text);
        send({ type: "followup", question: res.text });
      } else {
        // 本题结束，进入下一题
        followupCount = 0;
        await advanceQuestion();
      }
    };

    const advanceQuestion = async () => {
      if (!interviewId) return;
      const row = await getInterviewRow(interviewId, user.id);
      if (!row) return;
      const nextIdx = row.current_question_index + 1;
      if (!row.unlimited && nextIdx >= row.question_count) {
        await handleEnding();
        return;
      }
      await db.query(
        "UPDATE interviews SET current_question_index = $1 WHERE id = $2",
        [nextIdx, interviewId]
      );
      currentQuestionIndex = nextIdx;
      // 出下一题
      const qRow = await db.query(
        "SELECT question FROM interview_questions WHERE interview_id = $1 AND question_index = $2",
        [interviewId, nextIdx]
      );
      let question: string;
      if (qRow.rows?.[0]) {
        question = qRow.rows[0].question;
      } else {
        // 让 AI 出题
        const persona = getPersona(row.role, row.company_id, row.tech_requirements, row.jd_text ?? undefined);
        const r = await chat(
          [
            { role: "system", content: persona.systemPrompt },
            { role: "user", content: `请出第 ${nextIdx + 1} 题。只输出一个问题：句子简短、内容单一，不要编号、不要用"另外/其次/还有"并列多个子问题，也不要一次安排多题。` }
          ],
          { temperature: 0.8 }
        );
        question = r.text.trim();
        await db.query(
          "INSERT INTO interview_questions (interview_id, question_index, question) VALUES ($1,$2,$3)",
          [interviewId, nextIdx, question]
        );
      }
      send({ type: "question", question });
      await appendLog(interviewId, "ai", "question", question);
      await speak(question);
    };

    /** 收尾：全部结束后评分与总结（统一在结束之后给出） */
    const handleEnding = async (finalAnswer?: string) => {
      if (finished || !interviewId) return;
      finished = true;
      ws.send(JSON.stringify({ type: "interview_complete" }));

      const row = await getInterviewRow(interviewId, user.id);
      if (!row) return;

      // 若因关键词结束，且当前题有作答则保存
      if (finalAnswer && currentQuestionIndex >= 0) {
        await db.query(
          "UPDATE interview_questions SET answer_transcript = $1 WHERE interview_id = $2 AND question_index = $3",
          [finalAnswer, interviewId, currentQuestionIndex]
        );
        await appendLog(interviewId, "user", "answer", finalAnswer);
      }
      await appendLog(interviewId, "system", "notice", "面试已结束");

      const qRows = await db.query(
        "SELECT question_index FROM interview_questions WHERE interview_id = $1 ORDER BY question_index",
        [interviewId]
      );
      // 补齐未生成的题目（限题模式需要全部题目；不限模式以实际已完成题数计）
      const existingIndices = new Set(qRows.rows.map((r) => r.question_index));
      const target = row.unlimited ? Math.max(1, existingIndices.size) : row.question_count;
      const persona = getPersona(row.role, row.company_id, row.tech_requirements, row.jd_text ?? undefined);
      for (let i = 0; i < target; i++) {
        if (!existingIndices.has(i)) {
          const r = await chat(
            [
              { role: "system", content: persona.systemPrompt },
              { role: "user", content: `请出第 ${i + 1} 题。只输出一个问题：句子简短、内容单一，不要编号、不要用"另外/其次/还有"并列多个子问题，也不要一次安排多题。` }
            ],
            { temperature: 0.8 }
          );
          await db.query(
            "INSERT INTO interview_questions (interview_id, question_index, question) VALUES ($1,$2,$3)",
            [interviewId, i, r.text.trim()]
          );
        }
      }

      await db.query(
        "UPDATE interviews SET status='complete', finished_at=now(), current_question_index=$1 WHERE id=$2",
        [target, interviewId]
      );

      // 五维评分 + 知识总结：两段式——先逐题评质量(0-4)，再据此聚合五维，服务端再钳制，杜绝虚高
      const transcriptRows = await db.query(
        "SELECT question_index, question, answer_transcript FROM interview_questions WHERE interview_id = $1 ORDER BY question_index",
        [interviewId]
      );
      const transcript = transcriptRows.rows
        .map((q) => `题目[${q.question_index}]：${q.question}\n作答：${q.answer_transcript ?? "（未作答）"}`)
        .join("\n\n");

      const prompt = `${persona.systemPrompt}\n\n面试已结束。以下是本次面试完整记录：\n\n${transcript}\n\n请先逐题评判作答质量，再依据全部题目的平均质量给出五个维度分数。评分要严格、贴近真实水平，宁可从严，不得虚高；作答明显较差或未作答时，分数必须相应压低。\n
每题作答质量 quality 取值含义：
0 = 未作答 / 完全跑题 / 文不对题
1 = 方向偏差严重、存在基础知识错误
2 = 部分正确、遗漏关键要点、理由不充分
3 = 基本完整、有细节支撑、表达清楚
4 = 完整且结构化、接近标准示范

维度分数换算基准（0-100）：score = round(30 + 平均质量 × 18)。各维度可在 ±15 内按该维表现微调，但任何维度不得高于换算基准 +5。未作答的题目按质量 0 计，会显著拉低总分。
档位硬约束，禁止越档：质量 4 → 85-100；质量 3 → 70-84；质量 2 → 30-69；质量 1 → 0-29；质量 0（未作答/文不对题）→ 0。
每个维度的 comment 必须引用「第 N 题」的实际作答表现来说明评分依据，禁止空话与敷衍。

请输出 JSON（不要输出其他文字）：
{
  "question_evals": [
    {"question_index": 0, "quality": 2, "remark": "半句依据，说清楚对在哪、错在哪"}
  ],
  "scores": [
    {"dimension":"technical_accuracy","label":"技术准确性","score":0,"max_score":100,"comment":"一句话"},
    {"dimension":"logical_expression","label":"逻辑表达","score":0,"max_score":100,"comment":"一句话"},
    {"dimension":"communication_fluency","label":"沟通流畅度","score":0,"max_score":100,"comment":"一句话"},
    {"dimension":"responsiveness","label":"应变能力","score":0,"max_score":100,"comment":"一句话"},
    {"dimension":"overall","label":"综合评分","score":0,"max_score":100,"comment":"一句话"}
  ],
  "knowledge_summary": "各题重要技术知识点总结与学习建议",
  "sample_answers": [
    {"question_index":0,"sample":"第1题的优秀示范作答（要点式，简洁专业）"}
  ]
}`;

      const res = await chat([{ role: "user", content: prompt }], { json: true, temperature: 0.5 });
      let data: Record<string, unknown> = {};
      try {
        data = JSON.parse(res.text);
      } catch {
        /* ignore */
      }

      // 逐题质量落库（未作答强制 0）
      const evals = Array.isArray(data.question_evals) ? (data.question_evals as Record<string, unknown>[]) : [];
      const evalMap = new Map<number, number>();
      const remarkMap = new Map<number, string>();
      for (const e of evals) {
        const qi = Number(e.question_index);
        if (!Number.isNaN(qi)) {
          evalMap.set(qi, Math.max(0, Math.min(4, Number(e.quality) || 0)));
          remarkMap.set(qi, String(e.remark ?? ""));
        }
      }
      const qualities: number[] = [];
      for (const q of transcriptRows.rows) {
        const qi = q.question_index as number;
        const answer = String(q.answer_transcript ?? "").trim();
        let quality = evalMap.has(qi) ? (evalMap.get(qi) ?? 0) : NaN;
        if (answer.length <= 20) {
          quality = 0;
        } else if (Number.isNaN(quality)) {
          quality = 2;
        }
        qualities.push(quality);
        await db.query(
          "UPDATE interview_questions SET quality=$1, interviewer_feedback=$2 WHERE interview_id=$3 AND question_index=$4",
          [quality, remarkMap.get(qi) ?? "", interviewId, qi]
        );
      }
      const avgQ = qualities.reduce((a, b) => a + b, 0) / Math.max(1, qualities.length);
      const cap = Math.max(30, Math.round(30 + avgQ * 18));

      const scores = Array.isArray(data.scores) ? (data.scores as Record<string, unknown>[]) : [];
      for (const s of scores) {
        let sc = Math.max(0, Math.min(100, Number(s.score) || 0));
        if (sc > cap) sc = cap;
        await db.query(
          `INSERT INTO scores (interview_id, dimension, label, score, max_score, comment) VALUES ($1,$2,$3,$4,$5,$6)
           ON CONFLICT (interview_id, dimension) DO UPDATE SET score=EXCLUDED.score, comment=EXCLUDED.comment, label=EXCLUDED.label`,
          [interviewId, String(s.dimension), String(s.label ?? s.dimension), sc, 100, String(s.comment ?? "")]
        );
      }
      const samples = Array.isArray(data.sample_answers) ? (data.sample_answers as Record<string, unknown>[]) : [];
      for (const sa of samples) {
        const idx = Number(sa.question_index);
        const sample = String(sa.sample ?? "");
        if (!Number.isNaN(idx) && sample) {
          await db.query(
            "UPDATE interview_questions SET sample_answer=$1 WHERE interview_id=$2 AND question_index=$3",
            [sample, interviewId, idx]
          );
        }
      }
      await ensureSampleAnswers(row);
      await db.query("UPDATE interviews SET summary=$1 WHERE id=$2", [String(data.knowledge_summary ?? ""), interviewId]);

      send({ type: "scored" });
    };

    ws.on("message", async (raw) => {
      try {
        const msg = JSON.parse(String(raw)) as { type: string; data?: string; text?: string };

        if (msg.type === "start") {
          await startInterviewSession(msg.text ?? (await getLatestInterview(user.id)));
          return;
        }
        if (msg.type === "audio" && msg.data) {
          // AI 说话期间忽略用户音频（半双工轮转）
          if (aiSpeaking || sending || finished) return;
          if (!turn) turn = { chunks: [], fullText: "", partialText: "" };
          turn.chunks.push(Buffer.from(msg.data, "base64"));

          // 能量检测：判定当前块说话/静音
          const buf = turn.chunks[turn.chunks.length - 1];
          const energy = computeEnergy(buf);
          const isSilent = energy < 0.005;

          if (!isSilent) {
            speaking = true;
            silenceMs = 0;
          } else {
            silenceMs += 20; // 每块 20ms
          }

          // 转发一次实时转写（简单：块数触发）
          if (turn.chunks.length >= 50 && !aiSpeaking) {
            const audio = Buffer.concat(turn.chunks);
            const result = await transcribe(audio, "audio/pcm");
            turn.chunks = [];
            turn.fullText = result.text;
            send({ type: "transcript_partial", text: turn.fullText });
          }

          // VAD 判停：连续静音 1.2s 且刚才在说话 → 作答结束
          if (speaking && silenceMs >= 1200 && turn.fullText.trim().length > 0) {
            sending = true;
            const finalText = turn.fullText;
            turn = null;
            speaking = false;
            silenceMs = 0;
            send({ type: "transcript_final", text: finalText, turnEnded: true });
            await processTurn(finalText);
            sending = false;
          }
          return;
        }
        if (msg.type === "interrupt") {
          aiSpeaking = false;
          return;
        }
        if (msg.type === "answer" && msg.text) {
          // 浏览器 Web Speech API 识别结果（文本）直接进入作答处理
          if (aiSpeaking || sending || finished) return;
          sending = true;
          send({ type: "transcript_final", text: msg.text, turnEnded: true });
          await processTurn(msg.text);
          sending = false;
          return;
        }
        if (msg.type === "end") {
          await handleEnding(turn?.fullText);
          return;
        }
      } catch (e) {
        send({ type: "error", message: e instanceof Error ? e.message : "未知错误" });
      }
    });

    ws.on("close", () => {
      /* cleanup: 可在此结束会话 */
    });
  });
}

async function getLatestInterview(userId: string): Promise<string> {
  const { rows } = await db.query(
    "SELECT id FROM interviews WHERE user_id=$1 AND status!='complete' ORDER BY started_at DESC LIMIT 1",
    [userId]
  );
  return rows[0]?.id ?? "";
}

async function authenticate(req: IncomingMessage): Promise<AuthUser | null> {
  const url = new URL(req.url ?? "/", "http://localhost");
  const token =
    url.searchParams.get("token") ?? (req.headers.authorization?.startsWith("Bearer ") ? req.headers.authorization.slice(7) : null);
  if (!token) return null;
  return verifyToken(token);
}

/** 计算 16-bit PCM 音频块的能量（均方根近似）。 */
function computeEnergy(buf: Buffer): number {
  const samples = Math.floor(buf.length / 2);
  if (samples === 0) return 0;
  let sum = 0;
  for (let i = 0; i < samples; i++) {
    const sample = buf.readInt16LE(i * 2) / 32768;
    sum += sample * sample;
  }
  return Math.sqrt(sum / samples);
}

/** 过程分评估：按已作答题目平均质量折算总分，达到 80 返回 true（触发提前结束）。 */
async function reachedTargetScore(interviewId: string): Promise<boolean> {
  const { rows } = await db.query(
    "SELECT question, COALESCE(answer_transcript, '') AS answer FROM interview_questions " +
      "WHERE interview_id = $1 AND answer_transcript IS NOT NULL AND length(trim(answer_transcript)) > 20 ORDER BY question_index",
    [interviewId]
  );
  if (rows.length < 2) return false;
  const transcript = rows
    .map((r) => `题目：${r.question}\n作答：${r.answer}`)
    .join("\n\n");
  const prompt = `以下是模拟面试的部分作答记录：\n\n${transcript}\n\n请严格评估作答质量并给出 0-100 的总评分。规则：每题按质量 0-4 打分（0=未作答/跑题，1=严重偏离，2=部分正确，3=基本完整，4=接近标准示范），总评 = round(30 + 全部题目平均质量 × 18)。要求严格、宁可从严绝不高估，有明显缺陷的作答不得给高分。只输出 JSON（不要输出其他文字）：{"total": 0}`;
  const res = await chat([{ role: "user", content: prompt }], { json: true, temperature: 0.2 });
  try {
    const data = JSON.parse(res.text) as { total?: unknown };
    const total = Number(data.total);
    return Number.isFinite(total) && total >= 80;
  } catch {
    return false;
  }
}