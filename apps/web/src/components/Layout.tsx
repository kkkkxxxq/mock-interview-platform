import { ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { SlidersIcon, ListIcon, LogOutIcon } from "./Icons";

export default function Layout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <div style={{ minHeight: "100vh" }}>
      <header style={{ background: "#0f172a", padding: "0 32px" }}>
        <div style={{ maxWidth: 1600, margin: "0 auto", display: "flex", justifyContent: "space-between", alignItems: "center", height: 64 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 32 }}>
            <Link to="/" style={{ color: "#fff", fontSize: 20, fontWeight: 800, letterSpacing: ".02em", textDecoration: "none" }}>
              模拟面试平台
            </Link>
            <Link to="/setup" style={{ color: "#cbd5e1", fontSize: 16, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 6 }}>
              <SlidersIcon size={16} /> 配置面试
            </Link>
            <Link to="/history" style={{ color: "#cbd5e1", fontSize: 16, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 6 }}>
              <ListIcon size={16} /> 面试记录
            </Link>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 16, fontSize: 15, color: "#cbd5e1" }}>
            {user && <span>你好，{user.displayName}</span>}
            <button
              onClick={() => { logout(); navigate("/login"); }}
              style={{ color: "#cbd5e1", fontSize: 15, padding: "6px 4px", display: "inline-flex", alignItems: "center", gap: 6 }}
            >
              <LogOutIcon size={15} /> 退出
            </button>
          </div>
        </div>
      </header>

      <main style={{ maxWidth: 1600, margin: "0 auto", padding: "28px 32px 56px" }}>
        {children}
      </main>

      <footer style={{ borderTop: "1px solid #e2e8f0", textAlign: "center", color: "#64748b", fontSize: 13, padding: "20px 0" }}>
        模拟面试平台 · 面试陪练
        <div style={{ marginTop: 6 }}>本系统仅用于教学训练，面试由自动化模拟产生，不代表任何真实录用决定。</div>
      </footer>
    </div>
  );
}