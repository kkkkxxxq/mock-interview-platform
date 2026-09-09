import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../lib/api";
import { ROLE_LABELS } from "@mock/shared";
import { SparklesIcon, SaveIcon, DownloadIcon, ChevronDownIcon, ChevronUpIcon } from "../components/Icons";

const ACCENT = "#c9a25a";
const ACCENT_SOFT = "#e8c584";
const LINE = "rgba(255,255,255,.09)";
const MUTED = "#8b93a1";
const PANEL: React.CSSProperties = {
  background: "rgba(255,255,255,.02)",
  border: `1px solid ${LINE}`,
  borderRadius: 10,
};
const MT: React.CSSProperties = { fontSize: 11, fontWeight: 600, letterSpacing: ".14em", textTransform: "uppercase", color: MUTED, marginBottom: 14 };
const sectionTitle: React.CSSProperties = { fontSize: 18, fontWeight: 700, color: "#f6f8fb" };

interface QuestionEntry {
  questionIndex: number;
  question: string;
  answerTranscript: string | null;
  interviewerFeedback: string | null;
  sampleAnswer?: string;
  quality?: number | null;
}

const QUALITY_TAG: Record<number, { label: string; color: string }> = {
  0: { label: "未作答/跑题", color: "#f87171" },
  1: { label: "严重偏离", color: "#fb923c" },
  2: { label: "部分正确", color: "#fbbf24" },
  3: { label: "基本完整", color: ACCENT_SOFT },
  4: { label: "接近示范", color: "#34d399" }
};

interface FillerStat {
  word: string;
  count: number;
}

interface ScoreEntry {
  dimension: string;
  label: string;
  score: number;
  maxScore: number;
  comment: string;
}

interface InterviewDetail {
  interview: {
    id: string;
    role: string;
    companyName: string | null;
    questionCount: number;
  };
  summary: string | null;
  questions: QuestionEntry[];
  scores: ScoreEntry[];
  fillerStats?: FillerStat[];
  logs?: { seq: number; speaker: string; roleName: string; content: string }[];
}

interface ResumeReport {
  rawContent: string;
  optimizedContent: string;
  improvements: string[];
  suggestions: string[];
  isEdited: boolean;
}

const speakerLabel = (s: string) => (s === "ai" ? "面试官" : s === "user" ? "你" : "系统");
const speakerColor = (s: string) => (s === "ai" ? ACCENT_SOFT : s === "user" ? "#34d399" : MUTED);
const miniTitle: React.CSSProperties = { fontSize: 13, fontWeight: 600, color: MUTED, letterSpacing: ".04em", marginBottom: 8 };

export default function ReportPage() {
  const { id } = useParams();
  const [data, setData] = useState<InterviewDetail | null>(null);
  const [report, setReport] = useState<ResumeReport | null>(null);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [weakOnly, setWeakOnly] = useState(false);

  const toggleQ = (i: number) => {
    setExpanded((prev) => {
      const n = new Set(prev);
      if (n.has(i)) n.delete(i);
      else n.add(i);
      return n;
    });
  };

  useEffect(() => {
    api.get<InterviewDetail>(`/interviews/${id}`).then(setData);
    api
      .get<{ report: ResumeReport }>(`/reports/${id}`)
      .then((d) => setReport(d.report))
      .catch(() => setReport(null));
  }, [id]);

  const generateReport = async () => {
    setGenerating(true);
    try {
      const d = await api.post<{ report: ResumeReport }>(`/reports/${id}`);
      setReport(d.report);
    } catch (e) {
      alert(e instanceof Error ? e.message : "生成失败");
    } finally {
      setGenerating(false);
    }
  };

  const saveReport = async () => {
    if (!report) return;
    setSaving(true);
    try {
      const d = await api.put<{ report: ResumeReport }>(`/reports/${id}`, { ...report, isEdited: true });
      setReport(d.report);
      alert("已保存");
    } catch (e) {
      alert(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  if (!data)
    return (
      <div style={{ position: "fixed", inset: 0, background: "#08090c", color: MUTED, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>
        加载中…
      </div>
    );

  const totalScore = data.scores.reduce((s, x) => s + x.score, 0);
  const totalMax = data.scores.reduce((s, x) => s + x.maxScore, 0) || 1;
  const totalPct = data.scores.length ? (totalScore / totalMax) * 100 : 0;
  const grade = data.scores.length ? (totalPct >= 90 ? "A" : totalPct >= 80 ? "B" : totalPct >= 60 ? "C" : "D") : null;
  const gradeColor = grade === "A" ? "#34d399" : grade === "B" ? ACCENT_SOFT : grade === "C" ? "#fbbf24" : "#f87171";
  const RING_R = 34;
  const RING_C = 2 * Math.PI * RING_R;

  const diag = (() => {
    try {
      const j = report?.rawContent ? (JSON.parse(report.rawContent) as { evaluation?: string; score?: number; dimensions?: { label: string; score: number; comment: string }[] }) : null;
      if (j && typeof j === "object" && typeof j.score === "number") return j;
    } catch {
      /* ignore */
    }
    return null;
  })();

  const roleLabel = ROLE_LABELS[data.interview.role as keyof typeof ROLE_LABELS] ?? data.interview.role;

  const isWeak = (q: QuestionEntry) => typeof q.quality === "number" && q.quality <= 2;
  const weakQuestions = data.questions.filter(isWeak);
  const visibleQuestions = weakOnly ? weakQuestions : data.questions;
  const qChip = (active: boolean): React.CSSProperties => ({
    fontSize: 12,
    fontWeight: 700,
    padding: "5px 13px",
    borderRadius: 99,
    border: `1px solid ${active ? ACCENT : LINE}`,
    color: active ? ACCENT_SOFT : MUTED,
    background: active ? "rgba(201,162,90,.08)" : "transparent",
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    cursor: "pointer",
  });

  const exportReportFile = () => {
    const date = new Date().toISOString().slice(0, 10);
    const L: string[] = [];
    L.push(`# 模拟面试报告`);
    L.push(`- 岗位：${roleLabel}${data.interview.companyName ? ` @ ${data.interview.companyName}` : "（不限公司）"}`);
    L.push(`- 题数：${data.interview.questionCount === 0 ? "不限" : `${data.interview.questionCount} 题`}`);
    L.push(`- 日期：${date}`);
    L.push("");
    L.push(`## 综合得分：${data.scores.length ? `${totalScore} / ${totalMax}` : "—"}`);
    L.push("");
    if (data.scores.length) {
      L.push(`| 维度 | 得分 | 评语 |`);
      L.push(`| --- | --- | --- |`);
      for (const s of data.scores) L.push(`| ${s.label} | ${s.score}/${s.maxScore} | ${s.comment} |`);
      L.push("");
    }
    if (data.summary) {
      L.push(`## 重要技术知识点`);
      L.push(data.summary);
      L.push("");
    }
    if (data.fillerStats && data.fillerStats.length) {
      L.push(`## 表达习惯（口头禅统计）`);
      L.push(data.fillerStats.map((f) => `- “${f.word}” ${f.count} 次`).join("\n"));
      L.push("");
    }
    L.push(`## 逐题记录与点评`);
    for (const q of data.questions) {
      L.push(`### Q${q.questionIndex + 1}. ${q.question}`);
      if (typeof q.quality === "number") L.push(`- 作答评定：${q.quality}/4 · ${QUALITY_TAG[q.quality]?.label ?? ""}`);
      L.push(`- 你的作答：${q.answerTranscript ?? "（未作答）"}`);
      if (q.interviewerFeedback) L.push(`- 面试官点评：${q.interviewerFeedback}`);
      if (q.sampleAnswer) L.push(`- 参考示范：${q.sampleAnswer}`);
      L.push("");
    }
    if (data.logs && data.logs.length) {
      L.push(`## 完整对话记录`);
      for (const l of data.logs) L.push(`- [${speakerLabel(l.speaker)}] ${l.content}`);
      L.push("");
    }
    if (report) {
      L.push(`## 简历诊断与优化`);
      if (diag) {
        L.push(`- 简历总分：${diag.score} / 100`);
        if (diag.evaluation) L.push(`- 综合评价：${diag.evaluation}`);
        if (diag.dimensions?.length) {
          for (const d of diag.dimensions) L.push(`  - ${d.label}：${d.score}/100 — ${d.comment}`);
        }
      }
      L.push("");
      L.push(`### 标题与自述优化（可编辑）`);
      L.push(report.optimizedContent);
      L.push("");
      L.push(`### 简历改进点`);
      for (const i of report.improvements) L.push(`- ${i}`);
      L.push("");
      L.push(`### 后续准备建议`);
      for (const i of report.suggestions) L.push(`- ${i}`);
    }
    L.push("");
    L.push(`> 本报告由自动化模拟面试生成，仅用于教学训练，不代表任何真实录用决定。`);
    const blob = new Blob([L.join("\n")], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `模拟面试报告-${roleLabel}-${date}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "#08090c", boxSizing: "border-box", display: "flex", flexDirection: "column" }}>
      {/* 背景光晕 */}
      <div style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 0, background: "radial-gradient(900px 500px at 15% -10%, rgba(201,162,90,.09), transparent 55%), radial-gradient(700px 400px at 90% 110%, rgba(90,120,160,.08), transparent 50%)" }} />
      <div style={{ position: "relative", zIndex: 1, flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
        {/* 顶部品牌导航 */}
        <div style={{ borderBottom: `1px solid ${LINE}`, flexShrink: 0, background: "#08090c" }}>
          <div style={{ maxWidth: 1104, margin: "0 auto", padding: "0 24px", height: 60, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ width: 26, height: 26, border: `1px solid ${ACCENT}`, color: ACCENT, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800 }}>MI</span>
              <span style={{ fontSize: 11, letterSpacing: ".18em", color: MUTED }}>模拟面试 <span style={{ color: ACCENT }}>v1</span></span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11, letterSpacing: ".12em", color: "#8b93a1" }}>
              <span>01 入口</span>
              <span style={{ width: 14, height: 1, background: LINE }} />
              <span>02 准备</span>
              <span style={{ width: 14, height: 1, background: LINE }} />
              <span>03 面试</span>
              <span style={{ width: 14, height: 1, background: LINE }} />
              <span style={{ color: ACCENT_SOFT }}>04 总结</span>
            </div>
          </div>
        </div>

<main style={{ flex: 1, minHeight: 0, maxWidth: 1104, width: "100%", margin: "0 auto", padding: "18px 24px 12px", display: "flex", flexDirection: "column", gap: 16 }}>
          {/* 标题区（单行） */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, flexWrap: "wrap", flexShrink: 0, paddingBottom: 12, borderBottom: `1px solid ${LINE}` }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 14, flexWrap: "wrap" }}>
              <p style={{ fontSize: 11, letterSpacing: ".18em", color: ACCENT, fontWeight: 600, margin: 0 }}>Summary · 04 / 04</p>
              <h1 style={{ margin: 0, fontSize: 26, fontWeight: 300, letterSpacing: ".01em", color: "#f6f8fb" }}>面试报告</h1>
              <span style={{ fontSize: 13, color: MUTED }}>
                {ROLE_LABELS[data.interview.role as keyof typeof ROLE_LABELS] ?? data.interview.role}
                {data.interview.companyName ? ` @ ${data.interview.companyName}` : "（不限公司）"} ·{" "}
                {data.interview.questionCount === 0 ? "不限题数" : `${data.interview.questionCount} 题`}
              </span>
            </div>
            <button onClick={exportReportFile} style={{ fontSize: 14, border: `1px solid ${LINE}`, color: "#cbd5e1", background: "transparent", borderRadius: 8, padding: "8px 14px", fontWeight: 600, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6 }}>
              <DownloadIcon size={14} /> 导出报告
            </button>
          </div>

          {/* 顶部：横向评分总览（紧凑） */}
          <div style={{ ...PANEL, flexShrink: 0, padding: "14px 20px" }}>
            <div style={{ display: "flex", gap: 22, alignItems: "center" }}>
              <div style={{ display: "flex", gap: 18, alignItems: "center", flexShrink: 0, borderRight: `1px solid ${LINE}`, paddingRight: 24 }}>
                <div style={{ position: "relative", width: 92, height: 92, flexShrink: 0 }}>
                  <svg width={92} height={92}>
                    <circle cx={46} cy={46} r={RING_R} stroke="rgba(255,255,255,.08)" strokeWidth={6} fill="none" />
                    <circle
                      cx={46}
                      cy={46}
                      r={RING_R}
                      stroke={`url(#ringGrad)`}
                      strokeWidth={6}
                      fill="none"
                      strokeLinecap="round"
                      strokeDasharray={RING_C}
                      strokeDashoffset={RING_C * (1 - totalPct / 100)}
                      transform="rotate(-90 46 46)"
                      style={{ transition: "stroke-dashoffset .6s ease" }}
                    />
                    <defs>
                      <linearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1">
                        <stop offset="0%" stopColor={ACCENT} />
                        <stop offset="100%" stopColor={ACCENT_SOFT} />
                      </linearGradient>
                    </defs>
                  </svg>
                  <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
                    <span style={{ fontSize: 24, fontWeight: 800, color: ACCENT_SOFT, lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>{data.scores.length ? totalScore : "—"}</span>
                    <span style={{ fontSize: 10, color: MUTED, marginTop: 3 }}>/ {totalMax}</span>
                  </div>
                </div>
                {grade && (
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, flexShrink: 0 }}>
                    <span style={{ width: 46, height: 46, borderRadius: 12, border: `1px solid ${gradeColor}`, color: gradeColor, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 24, fontWeight: 800, background: `${gradeColor}14` }}>{grade}</span>
                    <span style={{ fontSize: 11, color: MUTED }}>等级</span>
                  </div>
                )}
              </div>
              <div style={{ flex: 1, minWidth: 0, display: "grid", gridTemplateColumns: "1fr 1fr", gap: "9px 26px" }}>
                {data.scores.length === 0 ? (
                  <div style={{ color: MUTED, fontSize: 15 }}>面试结束后此处会显示评分。</div>
                ) : (
                  data.scores.map((s) => (
                    <div key={s.dimension}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 3 }}>
                        <span style={{ fontWeight: 600, color: "#eef2f7" }}>{s.label}</span>
                        <span style={{ color: ACCENT_SOFT, fontVariantNumeric: "tabular-nums" }}>{s.score}</span>
                      </div>
                      <div style={{ background: "rgba(255,255,255,.07)", borderRadius: 2, height: 3 }}>
                        <div style={{ background: `linear-gradient(90deg, ${ACCENT}, ${ACCENT_SOFT})`, borderRadius: 2, height: 3, width: `${(s.score / s.maxScore) * 100}%` }} />
                      </div>
                      <div style={{ fontSize: 11, color: MUTED, marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.comment}</div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* 下方两栏（固定一屏，栏内滚动） */}
          <div style={{ flex: 1, minHeight: 0, display: "flex", gap: 20 }}>
            {/* 左栏：逐题记录 + 逐字稿 */}
            <div style={{ flex: 3, minWidth: 0, minHeight: 0, overflowY: "auto", display: "flex", flexDirection: "column", gap: 20, paddingRight: 4 }}>
              <div style={PANEL}>
                <div style={{ ...sectionTitle, padding: "22px 24px 0" }}>逐题记录与点评</div>
                <div style={{ display: "flex", gap: 8, padding: "14px 24px 0" }}>
                  <button onClick={() => setWeakOnly(false)} style={qChip(!weakOnly)}>全部题目 <span style={{ color: MUTED }}>{data.questions.length}</span></button>
                  <button onClick={() => setWeakOnly(true)} style={qChip(weakOnly)}>仅看弱项 <span style={{ color: weakQuestions.length ? "#f87171" : MUTED }}>{weakQuestions.length}</span></button>
                </div>
                <div style={{ padding: "6px 24px 18px" }}>
                  {visibleQuestions.length === 0 ? (
                    <div style={{ color: MUTED, fontSize: 15, padding: "18px 0" }}>{weakOnly ? "没有弱项题目。" : "暂无题目记录。"}</div>
                  ) : (
                  visibleQuestions.map((q) => {
                    const weak = isWeak(q);
                    return (
                    <div key={q.questionIndex} style={{ padding: "14px 0 14px 14px", borderBottom: `1px solid ${LINE}`, borderLeft: weak ? "3px solid rgba(248,113,113,.6)" : "3px solid transparent" }}>
                      <button
                        onClick={() => toggleQ(q.questionIndex)}
                        style={{ width: "100%", textAlign: "left", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, background: "none", border: "none", cursor: "pointer", padding: 0 }}
                      >
                        <span style={{ fontWeight: 600, fontSize: 17, color: "#eef2f7", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          Q{q.questionIndex + 1}. {q.question}
                        </span>
                        <span style={{ color: MUTED, flexShrink: 0, display: "flex", alignItems: "center", gap: 10 }}>
                          {weak && (
                            <span style={{ fontSize: 12, fontWeight: 700, color: "#f87171", border: `1px solid rgba(248,113,113,.55)`, borderRadius: 99, padding: "2px 10px" }}>弱项</span>
                          )}
                          {typeof q.quality === "number" && (
                            <span style={{ fontSize: 13, fontWeight: 700, color: QUALITY_TAG[q.quality]?.color ?? MUTED, border: `1px solid ${QUALITY_TAG[q.quality]?.color ?? "#3a4150"}`, borderRadius: 99, padding: "2px 10px" }}>
                              作答评定 {q.quality}/4 · {QUALITY_TAG[q.quality]?.label ?? ""}
                            </span>
                          )}
                          {expanded.has(q.questionIndex) ? <ChevronUpIcon size={16} /> : <ChevronDownIcon size={16} />}
                        </span>
                      </button>
                      {expanded.has(q.questionIndex) && (
                        <div style={{ marginTop: 12 }}>
                          <div style={{ marginBottom: 12 }}>
                            <div style={miniTitle}>你的作答</div>
                            <div style={{ fontSize: 15, lineHeight: 1.8, color: "#dbe2ec" }}>{q.answerTranscript ?? "（未作答）"}</div>
                          </div>
                          {q.interviewerFeedback && (
                            <div style={{ marginBottom: 12 }}>
                              <div style={miniTitle}>面试官点评</div>
                              <div style={{ fontSize: 15, lineHeight: 1.8, color: "#dbe2ec" }}>{q.interviewerFeedback}</div>
                            </div>
                          )}
                          {q.sampleAnswer && (
                            <div>
                              <div style={miniTitle}>参考示范</div>
                              <div style={{ fontSize: 15, lineHeight: 1.8, color: "#dbe2ec" }}>{q.sampleAnswer}</div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                    );
                  })
                  )}
                </div>
              </div>

              <div style={PANEL}>
                <div style={{ ...sectionTitle, padding: "22px 24px 12px" }}>完整对话记录</div>
                <div style={{ padding: "0 24px 18px" }}>
                  {!data.logs || data.logs.length === 0 ? (
                    <div style={{ color: MUTED, fontSize: 15 }}>暂无对话记录。</div>
                  ) : (
                    <div style={{ border: `1px solid ${LINE}`, borderRadius: 6, padding: "8px 14px", background: "rgba(0,0,0,.25)" }}>
                      {data.logs.map((l) => (
                        <div key={l.seq} style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: "8px 0", borderBottom: `1px solid ${LINE}` }}>
                          <span style={{ width: 44, flexShrink: 0, fontSize: 13, fontWeight: 600, color: speakerColor(l.speaker) }}>{speakerLabel(l.speaker)}</span>
                          <div style={{ fontSize: 15, lineHeight: 1.8, color: "#dbe2ec", whiteSpace: "pre-wrap" }}>{l.content}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* 右栏：知识总结 + 口头禅 + 简历优化 */}
            <div style={{ ...PANEL, flex: 2, minWidth: 0, minHeight: 0, overflowY: "auto", display: "flex", flexDirection: "column", gap: 20, padding: 20 }}>
              {data.summary && (
                <div>
                  <div style={MT}>重要技术知识点</div>
                  <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.9, fontSize: 15, color: "#dbe2ec" }}>{data.summary}</div>
                </div>
              )}

              {data.fillerStats && data.fillerStats.length > 0 && (
                <div>
                  <div style={MT}>表达习惯（口头禅统计）</div>
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                    {data.fillerStats.map((f) => (
                      <div key={f.word} style={{ padding: "9px 14px", borderRadius: 8, border: `1px solid ${LINE}`, fontSize: 15, color: "#e8eaf0", background: "rgba(255,255,255,.03)" }}>
                        “{f.word}” <span style={{ fontWeight: 700, color: ACCENT_SOFT }}>{f.count} 次</span>
                      </div>
                    ))}
                  </div>
                  <div style={{ fontSize: 13, color: MUTED, marginTop: 10 }}>减少口头禅能让回答更干练、更专业。多次面试后可在这里对比改进。</div>
                </div>
              )}

              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingBottom: 12, borderBottom: `1px solid ${LINE}`, marginBottom: 14, flexWrap: "wrap", gap: 10 }}>
                  <div style={sectionTitle}>简历诊断与优化</div>
                  <div style={{ display: "flex", gap: 10 }}>
                    <button onClick={generateReport} disabled={generating} style={{ fontSize: 13, border: "1px solid rgba(201,162,90,.55)", color: ACCENT_SOFT, background: "transparent", borderRadius: 8, padding: "7px 13px", fontWeight: 600, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6 }}>
                      <SparklesIcon size={14} /> {generating ? "生成中…" : report ? "重新生成" : "生成简历报告"}
                    </button>
                    {report && (
                      <button onClick={saveReport} disabled={saving} className="btn-gold" style={{ fontSize: 13, display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 14px" }}>
                        <SaveIcon size={14} /> {saving ? "保存中…" : "保存修改"}
                      </button>
                    )}
                  </div>
                </div>

                {!report ? (
                  <div style={{ color: MUTED, fontSize: 15 }}>面试完成后，点击"生成简历报告"基于面试表现生成简历诊断与优化建议。</div>
                ) : (
                  <>
                    {diag && (
                      <div style={{ marginBottom: 18, border: `1px solid ${LINE}`, borderRadius: 10, padding: 16, background: "rgba(255,255,255,.02)" }}>
                        <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
                          <span style={{ fontSize: 44, fontWeight: 800, color: ACCENT_SOFT, lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>{diag.score}</span>
                          <span style={{ fontSize: 13, color: MUTED }}>简历总分 / 100</span>
                        </div>
                        {diag.evaluation && <div style={{ fontSize: 14, lineHeight: 1.8, color: "#dbe2ec", marginTop: 10 }}>{diag.evaluation}</div>}
                        {diag.dimensions?.length ? (
                          <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 14 }}>
                            {diag.dimensions.map((d) => (
                              <div key={d.label}>
                                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 4 }}>
                                  <span style={{ color: "#eef2f7", fontWeight: 600 }}>{d.label}</span>
                                  <span style={{ color: ACCENT_SOFT }}>{d.score}</span>
                                </div>
                                <div style={{ background: "rgba(255,255,255,.07)", borderRadius: 2, height: 4 }}>
                                  <div style={{ background: `linear-gradient(90deg, ${ACCENT}, ${ACCENT_SOFT})`, borderRadius: 2, height: 4, width: `${d.score}%` }} />
                                </div>
                                <div style={{ fontSize: 12, color: MUTED, marginTop: 4 }}>{d.comment}</div>
                              </div>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    )}
                    <div style={{ marginBottom: 16 }}>
                      <div style={miniTitle}>标题与自述优化（可编辑）</div>
                      <textarea
                        className="dark-input"
                        value={report.optimizedContent}
                        onChange={(e) => setReport({ ...report, optimizedContent: e.target.value })}
                        rows={8}
                        style={{ width: "100%", lineHeight: 1.8, fontSize: 15, resize: "vertical" }}
                      />
                    </div>
                    <div style={{ marginBottom: 16 }}>
                      <div style={miniTitle}>简历改进点（每行一条，可编辑）</div>
                      <textarea
                        className="dark-input"
                        value={report.improvements.join("\n")}
                        onChange={(e) => setReport({ ...report, improvements: e.target.value.split("\n") })}
                        rows={4}
                        style={{ width: "100%", lineHeight: 1.8, fontSize: 15, resize: "vertical" }}
                      />
                    </div>
                    <div>
                      <div style={miniTitle}>后续准备建议（每行一条，可编辑）</div>
                      <textarea
                        className="dark-input"
                        value={report.suggestions.join("\n")}
                        onChange={(e) => setReport({ ...report, suggestions: e.target.value.split("\n") })}
                        rows={4}
                        style={{ width: "100%", lineHeight: 1.8, fontSize: 15, resize: "vertical" }}
                      />
                    </div>
                    {report.isEdited && <div style={{ fontSize: 13, color: MUTED, marginTop: 10 }}>已包含你的手动修改</div>}
                  </>
                )}
              </div>
            </div>
          </div>

          <div style={{ fontSize: 13, color: MUTED, flexShrink: 0 }}>
            本报告由自动化模拟面试生成，仅用于教学训练，不代表任何真实录用决定。
          </div>
        </main>

        {/* 底部页签圆点 */}
        <div style={{ padding: "0 0 22px", display: "flex", flexDirection: "column", alignItems: "center", gap: 10, flexShrink: 0 }}>
          <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
            <span style={{ width: 8, height: 8, borderRadius: 99, border: "1px solid #3a4150", background: "transparent" }} />
            <span style={{ width: 8, height: 8, borderRadius: 99, border: "1px solid #3a4150", background: "transparent" }} />
            <span style={{ width: 8, height: 8, borderRadius: 99, border: "1px solid #3a4150", background: "transparent" }} />
            <span style={{ width: 8, height: 8, borderRadius: 99, border: `1px solid ${ACCENT}`, background: ACCENT }} />
          </div>
          <span style={{ fontSize: 11, letterSpacing: ".14em", color: MUTED }}>面试总结 · 自动化报告</span>
        </div>
      </div>
    </div>
  );
}