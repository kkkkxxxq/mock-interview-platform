import { db } from "../db";

type Speaker = "ai" | "user" | "system";

/** 追加一条逐字稿记录，seq 自动 +1。返回完整列表（可用于前端实时同步）。 */
export async function appendLog(
  interviewId: string,
  speaker: Speaker,
  roleName: string,
  content: string
): Promise<void> {
  if (!content?.trim()) return;
  await db.query(
    `INSERT INTO interview_logs (interview_id, seq, speaker, role_name, content)
     VALUES ($1, COALESCE((SELECT MAX(seq) FROM interview_logs WHERE interview_id=$1), -1) + 1, $2, $3, $4)
     ON CONFLICT (interview_id, seq) DO NOTHING`,
    [interviewId, speaker, roleName, content.trim()]
  );
}

export async function getLogs(interviewId: string): Promise<{ seq: number; speaker: string; roleName: string; content: string }[]> {
  const { rows } = await db.query(
    "SELECT seq, speaker, role_name, content FROM interview_logs WHERE interview_id=$1 ORDER BY seq",
    [interviewId]
  );
  return rows.map((r) => ({
    seq: r.seq,
    speaker: r.speaker,
    roleName: r.role_name,
    content: r.content
  }));
}