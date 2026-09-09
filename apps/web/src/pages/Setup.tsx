import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { Company, Role, TechRequirement } from "@mock/shared";
import { api } from "../lib/api";
import { PlusIcon, MinusIcon, UploadIcon, ArrowRightIcon } from "../components/Icons";

const ACCENT = "#c9a25a";
const ACCENT_SOFT = "#e8c584";
const LINE = "rgba(255,255,255,.09)";
const PANEL: React.CSSProperties = {
  background: "rgba(255,255,255,.02)",
  border: `1px solid ${LINE}`,
  borderRadius: 10,
  padding: "22px 24px",
};
const MT: React.CSSProperties = { fontSize: 11, fontWeight: 600, letterSpacing: ".14em", textTransform: "uppercase", color: "#8b93a1", marginBottom: 14 };
const TAG: React.CSSProperties = {
  padding: "9px 16px",
  borderRadius: 8,
  fontSize: 14,
  border: `1px solid ${LINE}`,
  background: "transparent",
  color: "#cbd5e1",
  cursor: "pointer",
  whiteSpace: "nowrap",
  lineHeight: 1.2,
  transition: "color .15s, border-color .15s, background .15s",
};
const TAG_ACTIVE: React.CSSProperties = {
  ...TAG,
  borderColor: ACCENT,
  color: ACCENT_SOFT,
  background: "rgba(201,162,90,.08)",
};
const BADGE: React.CSSProperties = {
  width: 26,
  height: 26,
  border: `1px solid ${ACCENT}`,
  color: ACCENT,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: 11,
  fontWeight: 800,
};

const ROLE_OPTIONS: { value: Role; label: string; en: string }[] = [
  { value: "data", label: "数据分析", en: "Data" },
  { value: "backend", label: "后端开发", en: "Backend" },
  { value: "frontend", label: "前端开发", en: "Frontend" },
  { value: "algorithm", label: "算法工程师", en: "Algorithm" },
  { value: "product", label: "产品经理", en: "Product" },
];

const CFG_KEY = "mock-interview-saved-configs";
const CUSTOM_CO_KEY = "mock-interview-custom-companies";

type SavedCfg = {
  id: string;
  name: string;
  role: Role;
  companyId: string;
  techIds: string[];
  questionCount: number;
  unlimited: boolean;
  jdText: string;
  savedAt: number;
};

export default function SetupPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState<1 | 2>(1);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [techs, setTechs] = useState<TechRequirement[]>([]);
  const [customCompanies, setCustomCompanies] = useState<string[]>([]);
  const [customCompanyInput, setCustomCompanyInput] = useState("");
  const [role, setRole] = useState<Role>("data");
  const [companyId, setCompanyId] = useState<string>("");
  const [techIds, setTechIds] = useState<string[]>([]);
  const [customTech, setCustomTech] = useState("");
  const [questionCount, setQuestionCount] = useState(5);
  const [unlimited, setUnlimited] = useState(true);
  const [jdText, setJdText] = useState("");
  const [starting, setStarting] = useState(false);
  const [resumeName, setResumeName] = useState("");
  const [resumeUploading, setResumeUploading] = useState(false);
  const [resumeMsg, setResumeMsg] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [quota, setQuota] = useState<{ limit: number; remaining: number } | null>(null);
  const [savedConfigs, setSavedConfigs] = useState<SavedCfg[]>([]);
  const [saveName, setSaveName] = useState("");
  const [saveMsg, setSaveMsg] = useState("");

  useEffect(() => {
    api.get<{ companies: Company[] }>("/catalog/companies").then((d) => setCompanies(d.companies));
    api.get<{ techRequirements: TechRequirement[] }>("/catalog/tech-requirements").then((d) => setTechs(d.techRequirements));
    api
      .get<{ resume: { fileName: string } }>("/resume")
      .then((d) => setResumeName(d.resume.fileName))
      .catch(() => setResumeName(""));
    api
      .get<{ user: { quotaLimit: number; quotaRemaining: number } }>("/auth/me")
      .then((d) => setQuota({ limit: d.user.quotaLimit, remaining: d.user.quotaRemaining }))
      .catch(() => undefined);
    try { setSavedConfigs(JSON.parse(localStorage.getItem(CFG_KEY) || "[]")); } catch {}
    try { setCustomCompanies(JSON.parse(localStorage.getItem(CUSTOM_CO_KEY) || "[]")); } catch {}
  }, []);

  const uploadResume = async (file: File) => {
    if (!/\.(pdf|docx|doc)$/i.test(file.name)) {
      setResumeMsg("仅支持 PDF 与 Word（.docx / .doc）格式");
      return;
    }
    setResumeUploading(true);
    setResumeMsg("");
    try {
      const form = new FormData();
      form.append("resume", file);
      const d = await api.upload<{ resume: { fileName: string; characters: number } }>("/resume", form);
      setResumeName(d.resume.fileName);
      setResumeMsg(`上传成功（${(d.resume.characters / 1000).toFixed(1)}k 字）`);
    } catch (e) {
      setResumeMsg(e instanceof Error ? e.message : "上传失败");
    } finally {
      setResumeUploading(false);
    }
  };

  const toggleTech = (id: string) => {
    setTechIds((prev) => (prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]));
  };

  const addCustomTech = () => {
    const v = customTech.trim();
    if (!v) return;
    if (!techIds.includes(v)) setTechIds((prev) => [...prev, v]);
    setCustomTech("");
  };

  const persistCustomCompanies = (list: string[]) => {
    localStorage.setItem(CUSTOM_CO_KEY, JSON.stringify(list));
    setCustomCompanies(list);
  };

  const addCustomCompany = () => {
    const v = customCompanyInput.trim();
    if (!v) return;
    if (!customCompanies.includes(v)) persistCustomCompanies([...customCompanies, v]);
    setCompanyId(`custom:${v}`);
    setCustomCompanyInput("");
  };

  const removeCustomCompany = (name: string) => {
    persistCustomCompanies(customCompanies.filter((c) => c !== name));
    if (companyId === `custom:${name}`) setCompanyId("");
  };

  const persistCfgs = (list: SavedCfg[]) => {
    localStorage.setItem(CFG_KEY, JSON.stringify(list));
    setSavedConfigs(list);
  };

  const saveConfig = () => {
    const name = saveName.trim();
    if (!name) {
      setSaveMsg("请先输入存档名称");
      return;
    }
    const cfg: SavedCfg = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      name,
      role,
      companyId,
      techIds: [...techIds],
      questionCount,
      unlimited,
      jdText: jdText.trim(),
      savedAt: Date.now(),
    };
    persistCfgs([cfg, ...savedConfigs]);
    setSaveName("");
    setSaveMsg(`已保存「${name}」`);
  };

  const loadConfig = (cfg: SavedCfg) => {
    setRole(cfg.role);
    setCompanyId(cfg.companyId);
    setTechIds(cfg.techIds);
    setQuestionCount(cfg.questionCount);
    setUnlimited(cfg.unlimited);
    setJdText(cfg.jdText);
    setSaveMsg(`已载入「${cfg.name}」`);
  };

  const deleteConfig = (id: string) => {
    persistCfgs(savedConfigs.filter((c) => c.id !== id));
  };

  const start = async () => {
    setStarting(true);
    try {
      const d = await api.post<{ interview: { id: string } }>("/interviews", {
        role,
        companyId: companyId || null,
        techRequirements: techIds,
        questionCount,
        unlimited,
        jdText: jdText.trim()
      });
      navigate(`/interview/${d.interview.id}`);
    } catch (e) {
      alert(e instanceof Error ? e.message : "启动失败");
      setStarting(false);
    }
  };

  const selectedCompany = companies.find((c) => c.id === companyId);
  const selectedCompanyName = companyId.startsWith("custom:")
    ? companyId.slice(7)
    : selectedCompany?.name ?? "不限公司";
  const roleLabel = ROLE_OPTIONS.find((r) => r.value === role)?.label ?? "";

  const summaryRows = [
    { label: "岗位类型", value: roleLabel },
    { label: "目标公司", value: selectedCompanyName },
    { label: "技术要求", value: techIds.length ? techIds.join("、") : "未选择" },
    { label: "题量", value: unlimited ? "不限 · 随时结束" : `${questionCount} 题` },
    { label: "岗位 JD", value: jdText.trim() ? `已填写（${jdText.trim().length} 字）` : "未填写" },
    { label: "简历", value: resumeName || "未上传" },
    { label: "今日剩余次数", value: quota ? `${quota.remaining} / ${quota.limit} 场` : "—" }
  ];

  const stepNav = (
    <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11, letterSpacing: ".12em", color: "#8b93a1" }}>
      <span>01 入口</span>
      <span style={{ width: 14, height: 1, background: LINE }} />
      <span style={{ color: ACCENT_SOFT }}>02 准备</span>
      <span style={{ width: 14, height: 1, background: LINE }} />
      <span>03 面试</span>
      <span style={{ width: 14, height: 1, background: LINE }} />
      <span>04 总结</span>
    </div>
  );

  const inputRow = (
    value: string,
    onChange: (v: string) => void,
    add: () => void,
    placeholder: string,
    label: string
  ) => (
    <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
      <input
        className="dark-input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
        placeholder={placeholder}
        style={{ flex: 1 }}
        aria-label={label}
      />
      <button onClick={add} style={{ ...TAG, color: ACCENT, borderColor: "rgba(201,162,90,.45)", whiteSpace: "nowrap" }}>
        <PlusIcon size={14} /> 添加
      </button>
    </div>
  );

  const pageShell = (eyebrow: string, title: string, sub: string, dotLabel: string, children: React.ReactNode) => (
    <>
      {/* 顶部品牌导航（覆盖全局顶栏） */}
      <div style={{ borderBottom: `1px solid ${LINE}` }}>
        <div style={{ maxWidth: 1104, margin: "0 auto", padding: "0 24px", height: 60, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={BADGE}>MI</span>
            <span style={{ fontSize: 11, letterSpacing: ".18em", color: "#8b93a1" }}>模拟面试 <span style={{ color: ACCENT }}>v1</span></span>
          </div>
          {stepNav}
        </div>
      </div>

      <main style={{ flex: 1, minHeight: 0, overflow: "auto", maxWidth: 1104, width: "100%", margin: "0 auto", padding: "40px 24px 60px" }}>
        <div style={{ borderBottom: `1px solid ${LINE}`, paddingBottom: 26, marginBottom: 28 }}>
          <p style={{ fontSize: 11, letterSpacing: ".18em", color: ACCENT, fontWeight: 600, fontVariantNumeric: "tabular-nums", margin: 0 }}>{eyebrow}</p>
          <h1 style={{ margin: "10px 0 8px", fontSize: 32, fontWeight: 300, letterSpacing: ".01em", color: "#f6f8fb" }}>{title}</h1>
          <p style={{ margin: 0, fontSize: 14, color: "#8b93a1" }}>{sub}</p>
          <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
            {[["1", "基础配置", 1], ["2", "题量与简历", 2]].map(([n, label, s]) => {
              const active = step === (s as 1 | 2);
              const done = (step as number) > (s as number);
              return (
                <div key={n} style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "7px 16px", borderRadius: 99, border: `1px solid ${active ? ACCENT : done ? "rgba(52,211,153,.55)" : "#3a4150"}`, background: active ? "rgba(201,162,90,.08)" : "transparent", color: active ? ACCENT_SOFT : done ? "#34d399" : "#8b93a1", fontSize: 13, fontWeight: 600 }}>
                  <span style={{ width: 18, height: 18, borderRadius: 99, border: "1px solid currentColor", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800 }}>
                    {done ? "✓" : n}
                  </span>
                  {label}
                </div>
              );
            })}
          </div>
        </div>
        {children}
      </main>

      {/* 底部页签圆点 */}
      <div style={{ padding: "0 0 26px", display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
        <div style={{ display: "flex", gap: 12 }}>
          <span style={{ width: 8, height: 8, borderRadius: 99, border: `1px solid ${step === 1 ? ACCENT : "#3a4150"}`, background: step === 1 ? ACCENT : "transparent", transition: "all .2s" }} />
          <span style={{ width: 8, height: 8, borderRadius: 99, border: `1px solid ${step === 2 ? ACCENT : "#3a4150"}`, background: step === 2 ? ACCENT : "transparent", transition: "all .2s" }} />
        </div>
        <span style={{ fontSize: 11, letterSpacing: ".14em", color: "#8b93a1" }}>{dotLabel}</span>
      </div>
    </>
  );

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: "#08090c",
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* 背景光晕（参考页氛围） */}
      <div style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 0, background: "radial-gradient(900px 500px at 15% -10%, rgba(201,162,90,.09), transparent 55%), radial-gradient(700px 400px at 90% 110%, rgba(90,120,160,.08), transparent 50%)" }} />
      <div style={{ position: "relative", zIndex: 1, flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
        {step === 1 ? (
          pageShell(
            "Prepare · 1/2",
            "基础配置",
            "设定岗位、公司与技术要求，AI 面试官将完全按你的画像出题。",
            "基础配置",
            <>
              <div style={{ maxWidth: 640, margin: "0 auto", display: "flex", flexDirection: "column", gap: 18 }}>
                <div style={PANEL}>
                  <div style={MT}>岗位类型</div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
                    {ROLE_OPTIONS.map((r) => (
                      <button
                        key={r.value}
                        onClick={() => setRole(r.value)}
                        style={{
                          ...(role === r.value ? TAG_ACTIVE : TAG),
                          padding: "14px 10px",
                          borderRadius: 10,
                          display: "flex",
                          flexDirection: "column",
                          gap: 3,
                          alignItems: "center",
                          whiteSpace: "normal",
                        }}
                      >
                        <span style={{ fontSize: 15, fontWeight: 600 }}>{r.label}</span>
                        <span style={{ fontSize: 11, opacity: 0.6 }}>{r.en}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div style={PANEL}>
                  <div style={MT}>目标公司（可选）</div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button style={companyId === "" ? TAG_ACTIVE : TAG} onClick={() => setCompanyId("")}>不限公司</button>
                    {companies.map((c) => (
                      <button key={c.id} style={companyId === c.id ? TAG_ACTIVE : TAG} onClick={() => setCompanyId(c.id)}>
                        {c.name}
                      </button>
                    ))}
                    {customCompanies.map((c) => (
                      <span key={c} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 6px 5px 14px", borderRadius: 8, border: `1px solid ${companyId === `custom:${c}` ? ACCENT : "rgba(201,162,90,.45)"}`, background: companyId === `custom:${c}` ? "rgba(201,162,90,.08)" : "rgba(201,162,90,.05)", fontSize: 13, color: ACCENT_SOFT, cursor: "pointer", lineHeight: 1.6 }} onClick={() => setCompanyId(`custom:${c}`)}>
                        {c}
                        <button onClick={(e) => { e.stopPropagation(); removeCustomCompany(c); }} style={{ background: "none", border: "none", cursor: "pointer", fontWeight: 700, color: "#a38a52", fontSize: 14 }}>×</button>
                      </span>
                    ))}
                  </div>
                  {inputRow(customCompanyInput, setCustomCompanyInput, addCustomCompany, "自定义公司名称，如 深圳某条业务线 …", "自定义公司")}
                  {selectedCompany && (
                    <div style={{ border: "1px solid rgba(255,255,255,.1)", background: "rgba(255,255,255,.03)", borderRadius: 8, padding: "10px 12px", fontSize: 12, marginTop: 14 }}>
                      <div style={{ fontWeight: 600, color: "#eef2f7" }}>{selectedCompany.name} · {selectedCompany.industry}</div>
                      <div style={{ marginTop: 2, color: "#8b93a1" }}>业务：{selectedCompany.business}</div>
                      <div style={{ color: "#8b93a1" }}>技术栈：{selectedCompany.techStack.join("、")}</div>
                    </div>
                  )}
                </div>

                <div style={PANEL}>
                  <div style={MT}>技术要求</div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {techs.map((t) => (
                      <button key={t.id} style={techIds.includes(t.id) ? TAG_ACTIVE : TAG} onClick={() => toggleTech(t.id)}>
                        {t.label}
                      </button>
                    ))}
                  </div>
                  {inputRow(customTech, setCustomTech, addCustomTech, "自定义技术要求，如 K8s、消息队列 …", "自定义技术要求")}
                </div>

                <div style={PANEL}>
                  <div style={MT}>岗位 JD（可选）</div>
                  <textarea
                    className="dark-input"
                    value={jdText}
                    onChange={(e) => setJdText(e.target.value)}
                    placeholder={"例如：\n工作职责：负责推荐链路后端开发…\n任职要求：熟悉 Go/Java，有 Redis/MySQL 使用经验，了解高并发与分布式…"}
                    rows={5}
                    style={{ width: "100%", resize: "vertical", lineHeight: 1.8 }}
                  />
                </div>
              </div>

              <div style={{ maxWidth: 640, margin: "30px auto 0", display: "flex", gap: 12, justifyContent: "center" }}>
                <button onClick={() => navigate(-1)} style={{ padding: "12px 28px", borderRadius: 8, border: `1px solid ${LINE}`, background: "transparent", color: "#cbd5e1", fontSize: 14, fontWeight: 600 }}>
                  上一步
                </button>
                <button onClick={() => setStep(2)} className="btn-gold" style={{ padding: "12px 28px", fontSize: 14 }}>
                  保存并继续
                  <ArrowRightIcon size={14} />
                </button>
              </div>
            </>
          )
        ) : (
          pageShell(
            "Prepare · 2/2",
            "题量与简历",
            "确认题量与简历，配置将用于本次面试出题与评估。",
            "简历与确认",
            <>
              <div style={{ maxWidth: 640, margin: "0 auto", display: "flex", flexDirection: "column", gap: 18 }}>
                <div style={PANEL}>
                  <div style={MT}>题量设置</div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <button style={unlimited ? TAG_ACTIVE : TAG} onClick={() => setUnlimited(true)}>不限</button>
                    <button style={!unlimited ? TAG_ACTIVE : TAG} onClick={() => setUnlimited(false)}>固定题数</button>
                    {!unlimited && (
                      <div style={{ display: "flex", gap: 6, alignItems: "center", marginLeft: "auto" }}>
                        <button onClick={() => setQuestionCount((n) => Math.max(1, n - 1))} style={{ ...TAG, width: 38, height: 38, padding: 0 }}><MinusIcon size={17} /></button>
                        <input
                          type="number"
                          min={1}
                          max={99}
                          value={questionCount}
                          onChange={(e) => setQuestionCount(Math.min(99, Math.max(1, Number(e.target.value) || 1)))}
                          style={{ width: 70, textAlign: "center", background: "rgba(255,255,255,.05)", border: `1px solid ${LINE}`, borderRadius: 8, color: "#f1f5f9", fontSize: 17, padding: "7px 4px" }}
                        />
                        <button onClick={() => setQuestionCount((n) => Math.min(99, n + 1))} style={{ ...TAG, width: 38, height: 38, padding: 0 }}><PlusIcon size={17} /></button>
                      </div>
                    )}
                  </div>
                  <p style={{ fontSize: 12, color: "#8b93a1", margin: "10px 0 0" }}>{unlimited ? "持续出题，可随时结束统一评分" : "答完指定题数后统一评分"}</p>
                </div>

                <div style={PANEL}>
                  <div style={MT}>简历文件（可选）</div>
                  <input
                    type="file"
                    accept=".pdf,.docx,.doc"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadResume(f); }}
                    style={{ display: "none" }}
                    id="resume-input"
                  />
                  <label
                    htmlFor="resume-input"
                    onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={(e) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files?.[0]; if (f) uploadResume(f); }}
                    style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, border: `1.5px dashed ${dragOver ? ACCENT : "rgba(255,255,255,.22)"}`, borderRadius: 10, padding: "28px 16px", cursor: "pointer", background: dragOver ? "rgba(201,162,90,.06)" : "rgba(255,255,255,.02)", color: "#8b93a1", fontSize: 13 }}
                  >
                    <UploadIcon size={30} />
                    <span style={{ color: "#cbd5e1", fontWeight: 600, fontSize: 16 }}>
                      {resumeName ? `已上传：${resumeName}` : "拖拽简历到此处，或点击选择"}
                    </span>
                    <span>支持 PDF / DOCX / DOC · 最大 10MB · 内容用于面试追问</span>
                  </label>
                  {resumeUploading && <div style={{ fontSize: 13, color: "#8b93a1", marginTop: 12 }}>解析中…</div>}
                  {resumeMsg && <div style={{ fontSize: 13, color: resumeMsg.startsWith("上传成功") ? ACCENT_SOFT : "#fca5a5", marginTop: 12 }}>{resumeMsg}</div>}
                </div>
              </div>

              <div style={{ maxWidth: 640, margin: "24px auto 0", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
                <div style={PANEL}>
                  <div style={MT}>本次面试配置摘要</div>
                  <div style={{ display: "flex", flexDirection: "column" }}>
                    {summaryRows.map((row) => (
                      <div key={row.label} style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 12, borderBottom: "1px solid rgba(255,255,255,.06)", padding: "7px 0" }}>
                        <span style={{ color: "#8b93a1", whiteSpace: "nowrap" }}>{row.label}</span>
                        <span style={{ fontWeight: 600, color: "#e8eaf0", textAlign: "right", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 170 }}>{row.value}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div style={{ ...PANEL, display: "flex", flexDirection: "column" }}>
                  <div style={MT}>配置存档</div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <input
                      className="dark-input"
                      value={saveName}
                      onChange={(e) => setSaveName(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); saveConfig(); } }}
                      placeholder="存档名称"
                      style={{ flex: 1 }}
                    />
                    <button onClick={saveConfig} style={{ ...TAG, color: ACCENT, borderColor: "rgba(201,162,90,.45)", whiteSpace: "nowrap" }}>保存</button>
                  </div>
                  {saveMsg && <div style={{ fontSize: 12, color: ACCENT_SOFT, marginTop: 8 }}>{saveMsg}</div>}
                  <div style={{ flex: 1, overflow: "auto", marginTop: 10 }}>
                    {savedConfigs.length === 0 ? (
                      <div style={{ fontSize: 12, color: "#566073", padding: "6px 0" }}>暂无存档，保存后可一键载入</div>
                    ) : (
                      savedConfigs.map((c) => (
                        <div key={c.id} style={{ border: "1px solid rgba(255,255,255,.08)", borderRadius: 8, padding: "8px 10px", marginBottom: 6, background: "rgba(255,255,255,.02)" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                            <span style={{ color: "#eef2f7", fontWeight: 700, fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</span>
                            <div style={{ display: "flex", gap: 5, flexShrink: 0 }}>
                              <button onClick={() => loadConfig(c)} style={{ border: "1px solid rgba(201,162,90,.55)", color: ACCENT_SOFT, borderRadius: 6, padding: "2px 9px", fontSize: 11, fontWeight: 600 }}>载入</button>
                              <button onClick={() => deleteConfig(c.id)} style={{ border: "1px solid rgba(255,255,255,.14)", color: "#8b93a1", borderRadius: 6, padding: "2px 8px", fontSize: 11 }}>×</button>
                            </div>
                          </div>
                          <div style={{ fontSize: 10, color: "#8b93a1", marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {c.unlimited ? "不限题量" : `${c.questionCount} 题`} · {c.companyId ? (c.companyId.startsWith("custom:") ? c.companyId.slice(7) : companies.find((x) => x.id === c.companyId)?.name ?? "公司") : "不限公司"} · {c.techIds.length} 项技术{c.jdText ? " · 含JD" : ""}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>

              <div style={{ maxWidth: 640, margin: "30px auto 0", display: "flex", gap: 12, justifyContent: "center" }}>
                <button onClick={() => setStep(1)} style={{ padding: "12px 28px", borderRadius: 8, border: `1px solid ${LINE}`, background: "transparent", color: "#cbd5e1", fontSize: 14, fontWeight: 600 }}>
                  上一步
                </button>
                <button onClick={start} disabled={starting} className="btn-gold" style={{ padding: "12px 28px", fontSize: 14 }}>
                  {starting ? "正在开启面试…" : "开始面试"}
                  {!starting && <ArrowRightIcon size={14} />}
                </button>
              </div>
            </>
          )
        )}
      </div>
    </div>
  );
}