import { env } from "../config";

export interface TranscriptResult {
  text: string;
  durationSeconds: number;
}

/**
 * STT 网关。支持三种 provider：
 * - mock: 开发期回放，返回固定文本
 * - alibaba: 阿里云百炼 Paraformer（DashScope）
 * - openai: OpenAI Whisper API
 */
export async function transcribe(audio: Buffer, mimeType: string): Promise<TranscriptResult> {
  switch (env.STT_PROVIDER) {
    case "alibaba":
      return transcribeAliyun(audio, mimeType);
    case "openai":
      return transcribeOpenAI(audio, mimeType);
    case "mock":
    default:
      return {
        text: "我来自 XX 学校计算机专业，实习期间负责过一个订单系统的后端模块，用 Node.js 和 MySQL 实现；遇到过并发扣库存的问题，用事务和 Redis 分布式锁解决了。对于这个问题，我的思路是……（此处为本地 mock 转写，接入阿里云 STT 后这里是你的真实语音）",
        durationSeconds: 0
      };
  }
}

async function transcribeOpenAI(audio: Buffer, mimeType: string): Promise<TranscriptResult> {
  const key = env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY not configured");
  const ext = mimeType === "audio/webm" ? "webm" : "wav";
  const form = new FormData();
  const blob = new Blob([audio], { type: mimeType });
  form.append("file", blob, `answer.${ext}`);
  form.append("model", "whisper-1");
  form.append("language", "zh");

  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}` },
    body: form
  });
  if (!res.ok) throw new Error(`Whisper error ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as { text: string };
  return { text: data.text, durationSeconds: 0 };
}

async function transcribeAliyun(audio: Buffer, mimeType: string): Promise<TranscriptResult> {
  const key = env.ALIYUN_DASHSCOPE_API_KEY;
  if (!key) throw new Error("ALIYUN_DASHSCOPE_API_KEY not configured");

  const base64 = audio.toString("base64");
  const res = await fetch("https://dashscope.aliyuncs.com/api/v1/services/audio/asr/recognition", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      "X-DashScope-DataInspection": "enable"
    },
    body: JSON.stringify({
      model: "paraformer-realtime-v2",
      input: { audio: base64 },
      parameters: { language_hints: ["zh"] }
    })
  });
  if (!res.ok) throw new Error(`DashScope error ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as { output?: { text?: string } };
  return { text: data.output?.text ?? "", durationSeconds: 0 };
}