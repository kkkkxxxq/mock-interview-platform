import { env } from "../config";

export interface LlmMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export type LlmResponse = {
  text: string;
  usage?: { inputTokens: number; outputTokens: number };
};

/**
 * LLM 网关。默认走 DeepSeek（OpenAI 兼容协议）。
 * 若未配置 API Key，则回退到本地规则引擎，保证开发链路可跑通。
 */
export async function chat(messages: LlmMessage[], opts?: { json?: boolean; temperature?: number }): Promise<LlmResponse> {
  if (!env.DEEPSEEK_API_KEY) {
    return mockChat(messages, opts);
  }

  let res: Response;
  try {
    res = await fetch(`${env.DEEPSEEK_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.DEEPSEEK_API_KEY}`
      },
      body: JSON.stringify({
        model: env.DEEPSEEK_MODEL,
        messages,
        stream: false,
        temperature: opts?.temperature ?? 0.7,
        response_format: opts?.json ? { type: "json_object" } : undefined
      })
    });
  } catch (e) {
    console.error("[llm] network error, fallback to mock:", e instanceof Error ? e.message : e);
    return mockChat(messages, opts);
  }

  if (!res.ok) {
    const body = await res.text();
    console.error(`[llm] gateway error ${res.status}, fallback to mock: ${body.slice(0, 300)}`);
    return mockChat(messages, opts);
  }

  const data = (await res.json()) as {
    choices: { message: { content: string } }[];
    usage?: { prompt_tokens: number; completion_tokens: number };
  };

  return {
    text: data.choices?.[0]?.message?.content ?? "",
    usage: data.usage
      ? { inputTokens: data.usage.prompt_tokens, outputTokens: data.usage.completion_tokens }
      : undefined
  };
}

export class LlmError extends Error {}

/** 本地回退：无 Key 时的最小可运行实现。 */
function mockChat(messages: LlmMessage[], opts?: { json?: boolean }): LlmResponse {
  const last = [...messages].reverse().find((m) => m.role === "user");
  const raw = last?.content ?? "";
  const numbered = /[?？]\s*(\d+)\s*[.、]/.exec(raw);
  const topic = numbered ? numbered[1] : "通用问题";
  const text = `（本地演示，未配置 DEEPSEEK_API_KEY）\n\n【当前题目 ${topic}】请口头作答，我会点评并追问。作答要点：条理清晰、先结论后展开、给出具体例子。`;

  if (opts?.json) {
    return {
      text: JSON.stringify({
        scores: [
          { dimension: "technical_accuracy", label: "技术准确性", score: 0, max_score: 100, comment: "待回答后评分" },
          { dimension: "logical_expression", label: "逻辑表达", score: 0, max_score: 100, comment: "待回答后评分" },
          { dimension: "communication_fluency", label: "沟通流畅度", score: 0, max_score: 100, comment: "待回答后评分" },
          { dimension: "responsiveness", label: "应变能力", score: 0, max_score: 100, comment: "待回答后评分" },
          { dimension: "overall", label: "综合评分", score: 0, max_score: 100, comment: "面试自动收尾后生成" }
        ],
        knowledge_summary: "（未配置 API Key，暂无知识总结）"
      })
    };
  }

  return { text };
}