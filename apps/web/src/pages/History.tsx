import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { ActivityIcon, ArrowRightIcon, ListIcon } from "../components/Icons";

interface HistoryItem {
  id: string;
  role: string;
  companyName: string | null;
  status: string;
  startedAt: string;
  finishedAt: string | null;
  questionCount: number;
  overallScore: number | null;
}

const ROLE_LABEL: Record<string, string> = {
  backend: "后端开发",
  frontend: "前端开发",
  algorithm: "算法工程师",
  product: "产品经理",
  data: "数据分析"
};

export default function HistoryPage() {
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get<{ interviews: HistoryItem[] }>("/interviews")
      .then((d) => setItems(d.interviews))
      .finally(() => setLoading(false));
  }, []);

  // 已完成且有分的记录，按时间升序，用于趋势
  const trend = items
    .filter((it) => it.status === "complete" && it.overallScore !== null)
    .reverse();
  const avg = trend.length ? Math.round(trend.reduce((s, it) => s + (it.overallScore ?? 0), 0) / trend.length) : null;

  return (
    <div>
      <h2 style={{ fontSize: 30, fontWeight: 700, letterSpacing: ".02em", margin: "0 0 28px", paddingBottom: 16, borderBottom: "1px solid #cbd5e1", borderLeft: "4px solid #1d4ed8", paddingLeft: 14 }}>面试记录</h2>

      {loading ? (
        <div style={{ padding: 24, color: "#6b7280" }}>加载中…</div>
      ) : items.length === 0 ? (
        <div className="card" style={{ color: "#6b7280", fontSize: 16 }}>还没有面试记录，去<a href="/" style={{ marginLeft: 4 }}>配置一场</a>吧。</div>
      ) : (
        <div style={{ display: "flex", gap: 24, alignItems: "stretch" }}>
          <div className="card hero" style={{ flex: 5, minWidth: 0 }}>
            <div className="module-title" style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <ActivityIcon size={14} /> 综合评分趋势
            </div>
            <div style={{ fontSize: 14, color: "#6b7280", marginBottom: 20 }}>
              {trend.length >= 1 ? `已完成 ${trend.length} 次${avg !== null ? ` · 平均 ${avg} 分` : ""}` : "完成一场面试后这里会出现分数走势"}
            </div>
            {trend.length >= 1 ? (
              <div style={{ display: "flex", alignItems: "flex-end", gap: 12, height: 320, padding: "0 8px" }}>
                {trend.map((it, i) => {
                  const score = it.overallScore ?? 0;
                  return (
                    <div key={it.id} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", height: "100%" }}>
                      <div style={{ fontSize: 18, fontWeight: 700, color: "#111827", marginBottom: 8 }}>{score}</div>
                      <div
                        style={{
                          width: "70%",
                          height: `${score}%`,
                          minHeight: 12,
                          background: "#1d4ed8",
                          borderRadius: 2,
                          transition: "height .4s"
                        }}
                        title={`第 ${i + 1} 次 · ${score} 分`}
                      />
                      <div style={{ fontSize: 13, color: "#9ca3af", marginTop: 8 }}>{new Date(it.startedAt).toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" })}</div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div style={{ height: 320, display: "flex", alignItems: "center", justifyContent: "center", color: "#9ca3af" }}>暂无趋势数据</div>
            )}
          </div>

          <div className="card-weak" style={{ flex: 2, minWidth: 0, padding: 0, overflow: "hidden", background: "#eef3fb", borderColor: "#dbe4f0", borderRadius: 12 }}>
            <div style={{ padding: "14px 20px 0", fontSize: 14, fontWeight: 700, color: "#6b7280", marginBottom: 4, display: "flex", alignItems: "center", gap: 8 }}>
              <ListIcon size={14} /> 全部记录
            </div>
            {items.map((it, idx) => (
              <div key={it.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 20px", borderBottom: idx === items.length - 1 ? "none" : "1px solid #eceef1" }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 16 }}>
                    {ROLE_LABEL[it.role] ?? it.role} {it.companyName ? `@ ${it.companyName}` : "（不限公司）"}
                  </div>
                  <div style={{ fontSize: 14, color: "#9ca3af", marginTop: 4 }}>
                    {it.questionCount === 0 ? "不限题数" : `${it.questionCount} 题`} ·{" "}
                    {it.status === "complete" ? "已完成" : "进行中"} · {new Date(it.startedAt).toLocaleDateString("zh-CN")}
                    {it.overallScore !== null && <span style={{ marginLeft: 8, color: "#111827", fontWeight: 700 }}>{it.overallScore} 分</span>}
                  </div>
                </div>
                {it.status === "complete" ? (
                  <Link to={`/report/${it.id}`} className="btn-ghost" style={{ whiteSpace: "nowrap", fontSize: 14, textDecoration: "none" }}>
                    查看报告 <ArrowRightIcon size={14} />
                  </Link>
                ) : (
                  <Link to={`/interview/${it.id}`} className="btn-ghost" style={{ whiteSpace: "nowrap", fontSize: 14, textDecoration: "none" }}>
                    继续面试 <ArrowRightIcon size={14} />
                  </Link>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}