import { Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "./lib/auth";
import LoginPage from "./pages/Login";
import LandingPage from "./pages/Landing";
import SetupPage from "./pages/Setup";
import InterviewRoom from "./pages/InterviewRoom";
import ReportPage from "./pages/Report";
import HistoryPage from "./pages/History";
import Layout from "./components/Layout";

export default function App() {
  const { user, loading } = useAuth();

  if (loading) return <div style={{ padding: 40 }}>加载中…</div>;

  if (!user) {
    return (
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  return (
    <Layout>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/setup" element={<SetupPage />} />
        <Route path="/interview/:id" element={<InterviewRoom />} />
        <Route path="/report/:id" element={<ReportPage />} />
        <Route path="/history" element={<HistoryPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
}