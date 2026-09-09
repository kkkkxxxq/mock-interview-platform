import { useState } from "react";
import { useAuth } from "../lib/auth";
import { MailIcon, LockIcon, ArrowRightIcon } from "../components/Icons";

const GOLD = "#c9a25a";
const GOLD_DEEP = "#b99450";

const darkInputStyle: React.CSSProperties = {
  width: "100%",
  padding: "12px 14px 12px 42px",
  border: "1px solid rgba(255,255,255,.14)",
  borderRadius: 6,
  fontSize: 15,
  background: "rgba(255,255,255,.06)",
  color: "#f1f5f9",
  outline: "none",
};
const darkFieldIconStyle: React.CSSProperties = {
  position: "absolute",
  left: 14,
  top: "50%",
  transform: "translateY(-50%)",
  color: "#94a3b8",
  display: "flex",
};

export default function LoginPage() {
  const { login, register } = useAuth();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      if (mode === "login") await login(email, password);
      else await register(email, password, displayName);
    } catch (err) {
      setError(err instanceof Error ? err.message : "操作失败");
    }
  };

  const focusCard = () => {
    document.getElementById("auth-card")?.scrollIntoView({ behavior: "smooth", block: "center" });
    setTimeout(() => document.getElementById("login-email")?.focus(), 450);
  };

  return (
    <div style={{ minHeight: "100vh", background: "#f7f8fa", display: "flex", alignItems: "center", padding: "48px 40px" }}>
      <div style={{ maxWidth: 1180, margin: "0 auto", width: "100%", display: "flex", alignItems: "center", gap: 72 }}>
        {/* ===== 左：营销文案（不对称宽栏） ===== */}
        <div style={{ flex: 1.15, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13, fontWeight: 700, color: GOLD_DEEP, letterSpacing: ".18em" }}>
            <span style={{ width: 8, height: 8, borderRadius: 99, background: GOLD, display: "inline-block" }} />
            AI 面试官 · 模拟面试训练系统
          </div>

          <h1 style={{ fontSize: 54, fontWeight: 800, lineHeight: 1.18, letterSpacing: ".01em", color: "#0f172a", margin: "28px 0 0" }}>
            让每一次模拟面试
            <br />
            都成为<span style={{ color: GOLD_DEEP }}>真实加分项</span>
          </h1>

          <p style={{ fontSize: 17, lineHeight: 1.95, color: "#5b6472", maxWidth: 540, margin: "26px 0 0" }}>
            AI 面试官与你 1:1 实时对话：高频追问、逐题点评与示范答案，
            配套五维评分、知识总结与简历优化建议，打磨最真实的临场表现。
          </p>

          <div style={{ display: "flex", gap: 14, marginTop: 36 }}>
            <button
              onClick={focusCard}
              style={{ padding: "14px 28px", border: "1px solid #d3d9e2", borderRadius: 6, fontSize: 16, fontWeight: 600, color: "#3f4756", background: "#fff" }}
            >
              了解更多
            </button>
          </div>

          <div style={{ display: "flex", gap: 22, marginTop: 44, fontSize: 13, color: "#87909e" }}>
            <span>每日 5 场训练配额</span>
            <span>评分与记录本地持久化</span>
            <span>仅用于教学训练</span>
          </div>
        </div>

        {/* ===== 右：深色卡片容器（不对称窄栏） ===== */}
        <div
          id="auth-card"
          style={{ width: 412, flexShrink: 0, background: "#101624", borderRadius: 16, padding: "34px 32px 28px", boxShadow: "0 24px 64px rgba(16,22,36,.28)" }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: "#e5e9f0" }}>{mode === "login" ? "欢迎回来" : "创建你的账号"}</div>
            <div style={{ display: "flex", gap: 24, fontSize: 14 }}>
              <button onClick={() => setMode("login")} style={{ borderBottom: `2px solid ${mode === "login" ? GOLD : "transparent"}`, color: mode === "login" ? "#f1f5f9" : "#7c8695", fontWeight: 600, paddingBottom: 8 }}>
                登录
              </button>
              <button onClick={() => setMode("register")} style={{ borderBottom: `2px solid ${mode === "register" ? GOLD : "transparent"}`, color: mode === "register" ? "#f1f5f9" : "#7c8695", fontWeight: 600, paddingBottom: 8 }}>
                注册
              </button>
            </div>
          </div>

          <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 26 }}>
            {mode === "register" && <input placeholder="昵称" value={displayName} onChange={(e) => setDisplayName(e.target.value)} style={darkInputStyle} />}
            <div style={{ position: "relative" }}>
              <input id="login-email" type="email" placeholder="邮箱" value={email} onChange={(e) => setEmail(e.target.value)} style={darkInputStyle} />
              <span style={darkFieldIconStyle}><MailIcon size={16} /></span>
            </div>
            <div style={{ position: "relative" }}>
              <input type="password" placeholder="密码（至少 6 位）" value={password} onChange={(e) => setPassword(e.target.value)} style={darkInputStyle} />
              <span style={darkFieldIconStyle}><LockIcon size={16} /></span>
            </div>
            {error && <div style={{ color: "#fca5a5", fontSize: 14 }}>{error}</div>}
            <button type="submit" className="btn-gold" style={{ marginTop: 6 }}>
              {mode === "login" ? "进入面试系统" : "注册并进入面试"}
              <ArrowRightIcon size={16} />
            </button>
          </form>

          <div style={{ fontSize: 12, color: "#7c8695", marginTop: 20, lineHeight: 1.7 }}>
            本系统仅用于教学训练，面试结果不代表真实录用决定。
          </div>
        </div>
      </div>
    </div>
  );
}