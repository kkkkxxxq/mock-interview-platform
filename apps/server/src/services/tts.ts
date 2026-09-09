import { env } from "../config";

export interface TtsResult {
  audio?: string; // base64 pcm/audio
  mimeType?: string;
}

/**
 * TTS 网关。默认阿里云 DashScope CosyVoice；未配置时返回 mock（前端播放文字/静音）。
 */
export async function synthesizeSpeech(text: string): Promise<string> {
  if (env.TTS_PROVIDER === "mock") {
    return `mock:${text}`;
  }
  const key = env.ALIYUN_DASHSCOPE_API_KEY;
  if (!key) {
    return `mock:${text}`;
  }

  const payload = {
    model: "cosyvoice-v1",
    voice: "longxiaochun",
    input: text,
    parameters: {
      format: "wav",
      sample_rate: 16000
    }
  };

  const res = await fetch("https://dashscope.aliyuncs.com/api/v1/services/aigc/text2audio", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  if (!res.ok) throw new Error(`TTS error ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const buf = Buffer.from(await res.arrayBuffer());
  return `audio:${buf.toString("base64")}`;
}

export function isMockAudio(audio: string): boolean {
  return audio.startsWith("mock:");
}

export function isAudioPayload(audio: string): boolean {
  return audio.startsWith("audio:");
}