import { useNavigate } from "react-router-dom";
import { MicIcon, SparklesIcon, ListIcon, ArrowRightIcon, ActivityIcon, UserIcon, DownloadIcon } from "../components/Icons";

const ACCENT = "#c9a25a";
const ACCENT_SOFT = "#e8c584";
const LINE = "rgba(255,255,255,.09)";
const MUTED = "#8b93a1";
const PANEL: React.CSSProperties = {
  background: "rgba(255,255,255,.02)",
  border: `1px solid ${LINE}`,
  borderRadius: 10,
};

export default function LandingPage() {
  const navigate = useNavigate();

  return (
    <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "#08090c", boxSizing: "border-box", display: "flex", flexDirection: "column" }}>
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
              <span style={{ color: ACCENT_SOFT }}>01 入口</span>
              <span style={{ width: 14, height: 1, background: LINE }} />
              <span>02 准备</span>
              <span style={{ width: 14, height: 1, background: LINE }} />
              <span>03 面试</span>
              <span style={{ width: 14, height: 1, background: LINE }} />
              <span>04 总结</span>
            </div>
          </div>
        </div>

        <main style={{ flex: 1, minHeight: 0, overflowY: "auto", maxWidth: 920, width: "100%", margin: "0 auto", padding: "64px 24px 40px", display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
          <p style={{ fontSize: 11, letterSpacing: ".18em", color: ACCENT, fontWeight: 600, margin: 0 }}>Interview · 01 / 04 · 欢迎</p>
          <h1 style={{ margin: "16px 0 14px", fontSize: 44, fontWeight: 200, letterSpacing: ".01em", color: "#f6f8fb", lineHeight: 1.25 }}>
            为求职面试而生的 <span style={{ color: ACCENT_SOFT }}>AI 陪练</span>
          </h1>
          <p style={{ margin: 0, fontSize: 15, color: MUTED, lineHeight: 1.8, maxWidth: 620 }}>
            上传简历与岗位 JD，AI 面试官按你的画像动态出题、语音追问，最终输出多维度评分报告与改进建议。
          </p>

          <div style={{ display: "flex", gap: 14, marginTop: 36, flexWrap: "wrap", justifyContent: "center" }}>
            <button onClick={() => navigate("/setup")} className="btn-gold" style={{ padding: "15px 34px", fontSize: 17, display: "inline-flex", alignItems: "center", gap: 8 }}>
              开始准备面试 <ArrowRightIcon size={16} />
            </button>
            <button onClick={() => navigate("/history")} style={{ padding: "15px 26px", fontSize: 15, border: `1px solid ${LINE}`, background: "transparent", color: "#cbd5e1", borderRadius: 8, fontWeight: 600, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 8 }}>
              <ListIcon size={15} /> 查看面试记录
            </button>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, marginTop: 56, width: "100%", textAlign: "left" }}>
            {[
              { icon: <SparklesIcon size={20} />, title: "个性化出题", desc: "岗位、公司、技术要求、JD 与简历整体注入，AI 面试官按你的画像实时生成题目与追问。" },
              { icon: <MicIcon size={20} />, title: "实时语音作答", desc: "TTS 播报提问、按钮控制作答，识别到停顿自动提交；可随时插话与重听当前题。" },
              { icon: <ActivityIcon size={20} />, title: "多维度评分", desc: "规范化评分：未作答记 0、逐题引用点评、综合分后端校验；一键导出 Markdown 报告。" },
            ].map((f) => (
              <div key={f.title} style={{ ...PANEL, padding: 22 }}>
                <div style={{ width: 44, height: 44, borderRadius: 10, border: `1px solid ${ACCENT}`, color: ACCENT_SOFT, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(201,162,90,.06)" }}>{f.icon}</div>
                <div style={{ fontWeight: 700, fontSize: 17, color: "#f6f8fb", marginTop: 16 }}>{f.title}</div>
                <div style={{ fontSize: 13, color: MUTED, lineHeight: 1.75, marginTop: 8 }}>{f.desc}</div>
              </div>
            ))}
          </div>

          <div style={{ marginTop: 40, display: "flex", alignItems: "center", gap: 12, fontSize: 12, color: MUTED, flexWrap: "wrap", justifyContent: "center" }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><UserIcon size={14} /> 面试官语音开场</span>
            <span style={{ width: 4, height: 4, borderRadius: 99, background: "#3a4150" }} />
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><ActivityIcon size={14} /> 5 维评分</span>
            <span style={{ width: 4, height: 4, borderRadius: 99, background: "#3a4150" }} />
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><DownloadIcon size={14} /> 报告导出</span>
          </div>
        </main>

        {/* 底部页签圆点 */}
        <div style={{ padding: "0 0 22px", display: "flex", flexDirection: "column", alignItems: "center", gap: 10, flexShrink: 0 }}>
          <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
            <span style={{ width: 8, height: 8, borderRadius: 99, border: `1px solid ${ACCENT}`, background: ACCENT }} />
            <span style={{ width: 8, height: 8, borderRadius: 99, border: "1px solid #3a4150", background: "transparent" }} />
            <span style={{ width: 8, height: 8, borderRadius: 99, border: "1px solid #3a4150", background: "transparent" }} />
            <span style={{ width: 8, height: 8, borderRadius: 99, border: "1px solid #3a4150", background: "transparent" }} />
          </div>
          <span style={{ fontSize: 11, letterSpacing: ".14em", color: MUTED }}>模拟面试 · AI 陪练</span>
        </div>
      </div>
    </div>
  );
}