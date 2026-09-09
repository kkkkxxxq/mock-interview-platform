import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { getToken, api } from "../lib/api";
import { MicIcon, VideoIcon, VolumeIcon, ActivityIcon, StopIcon, UserIcon } from "../components/Icons";

interface RealtimeEvent {
  type: string;
  question?: string;
  text?: string;
  audio?: string;
  ending?: boolean;
  message?: string;
}

type Phase = "connecting" | "listening" | "processing" | "speaking" | "complete" | "error";

const ROLE_LABEL: Record<string, string> = {
  backend: "后端开发",
  frontend: "前端开发",
  algorithm: "算法工程师",
  product: "产品经理",
  data: "数据分析"
};

const stripMark = (t: string) => t.replace(/\*\*/g, "").replace(/【[^】]*】/g, "").trim();

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

function ReadHighlight({ text, index }: { text: string; index: number }) {
  const i = Math.max(0, Math.min(index, text.length));
  return (
    <>
      <span style={{ background: "rgba(201,162,90,.32)", borderRadius: 3, padding: "0 2px", color: ACCENT_SOFT, boxDecorationBreak: "clone", WebkitBoxDecorationBreak: "clone" }}>
        {text.slice(0, i)}
      </span>
      {text.slice(i)}
    </>
  );
}

export default function InterviewRoom() {
  const { id } = useParams();
  const navigate = useNavigate();

  const wsRef = useRef<WebSocket | null>(null);
  const recognitionRef = useRef<any | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const analystRef = useRef<{
    raf: number;
    analyser: AnalyserNode | null;
    data: Uint8Array;
  } | null>(null);
  const userGainRef = useRef<number>(1);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const attemptRef = useRef(0);
  const closedRef = useRef(false);
  const tickerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const qSeenRef = useRef(false);
  const aiSpeakingRef = useRef(false);

  const [phase, setPhase] = useState<Phase>("connecting");
  const [currentQuestion, setCurrentQuestion] = useState("");
  const [transcript, setTranscript] = useState("");
  const [aiText, setAiText] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [role, setRole] = useState("backend");
  const [status, setStatus] = useState("连接中…");
  const [log, setLog] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [devices, setDevices] = useState({ mic: false, camera: false });
  const [aiVolume, setAiVolume] = useState(1);
  const [micGain, setMicGain] = useState(1);
  const [opening, setOpening] = useState("");
  const [banner, setBanner] = useState("");
  const [debugDone, setDebugDone] = useState(false);
  const [dbg, setDbg] = useState<{ speaker: "pending" | "pass"; mic: "idle" | "running" | "pass"; asr: "idle" | "running" | "pass"; cam: "pending" | "pass" }>({ speaker: "pending", mic: "idle", asr: "idle", cam: "pending" });
  const [asrText, setAsrText] = useState("");
  const [outputNote, setOutputNote] = useState("");
  const [transcriptLog, setTranscriptLog] = useState<{ speaker: "ai" | "user" | "system"; content: string }[]>([]);
  const [logCollapsed, setLogCollapsed] = useState(false);
  const [readText, setReadText] = useState("");
  const [readIndex, setReadIndex] = useState(0);
  const [readKind, setReadKind] = useState<"question" | "feedback">("feedback");
  const [qIndex, setQIndex] = useState(1);
  const [questionCount, setQuestionCount] = useState(5);
  const [unlimited, setUnlimited] = useState(false);

  const pushLog = (s: string) => setLog((prev) => [...prev, s]);
  const wsUrl = `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws/interview?token=${getToken()}`;

  // ===== 设备权限：麦克风 + 摄像头 =====
  const setupMedia = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } }
      });
      mediaStreamRef.current = stream;
      setDevices({ mic: true, camera: true });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.muted = true;
        videoRef.current?.play().catch(() => undefined);
      }
      setupWaveform(stream);
      return true;
    } catch (e) {
      // 降级：仅尝试麦克风
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        mediaStreamRef.current = stream;
        setDevices({ mic: true, camera: false });
        setupWaveform(stream);
        return true;
      } catch (e2) {
        const msg = e instanceof Error ? e.message : "未知错误";
        const detail = /Permission|denied/i.test(msg) ? "（权限被拒绝，请在浏览器地址栏允许）" : "";
        setBanner(`无法访问麦克风：${msg}${detail}。本次面试需要麦克风权限，请在地址栏允许后点击「重新测试麦克风」。`);
        return false;
      }
    }
  };

  // ===== 音量波形图 =====
  const setupWaveform = (stream: MediaStream) => {
    const ctx = new AudioContext();
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    const gain = ctx.createGain();
    gain.gain.value = 1;
    source.connect(analyser);
    analyser.connect(gain);
    gain.connect(ctx.destination);
    const data = new Uint8Array(analyser.frequencyBinCount);

    const draw = () => {
      const canvas = document.getElementById("wave-canvas") as HTMLCanvasElement | null;
      if (canvas) {
        analyser.getByteTimeDomainData(data);
        const cctx = canvas.getContext("2d");
        if (cctx) {
          const w = canvas.width;
          const h = canvas.height;
          cctx.clearRect(0, 0, w, h);
          cctx.strokeStyle = "#1d4ed8";
          cctx.lineWidth = 1.5;
          cctx.beginPath();
          const mid = h / 2;
          for (let i = 0; i < data.length; i++) {
            const x = (i / data.length) * w;
            const y = mid + ((data[i] - 128) / 128) * (h / 2) * micGainRef.current;
            if (i === 0) cctx.moveTo(x, y);
            else cctx.lineTo(x, y);
          }
          cctx.stroke();
        }
      }
      analystRef.current!.raf = requestAnimationFrame(draw);
    };
    micGainRef.current = micGain;
    analystRef.current = { raf: requestAnimationFrame(draw), analyser, data };
  };
  const micGainRef = useRef(1);

  useEffect(() => {
    micGainRef.current = micGain;
  }, [micGain]);

  // ===== 面试官语音（浏览器本地 TTS），播报时逐字高亮 =====
  const stopTicker = () => {
    if (tickerRef.current) {
      clearInterval(tickerRef.current);
      tickerRef.current = null;
    }
  };
  const startTicker = (plain: string) => {
    setReadIndex(0);
    stopTicker();
    tickerRef.current = setInterval(() => {
      setReadIndex((i) => {
        const n = Math.min(plain.length, i + 1);
        if (n >= plain.length) {
          stopTicker();
        }
        return n;
      });
    }, 240);
  };
  const speakLocal = (text: string, kind: "question" | "feedback" = "feedback") => {
    aiSpeakingRef.current = true;
    if (!("speechSynthesis" in window)) {
      setPhase("listening");
      setStatus("请点击「开始作答」");
      return;
    }
    const plain = stripMark(text);
    setReadText(plain);
    setReadKind(kind);
    const u = new SpeechSynthesisUtterance(plain);
    u.lang = "zh-CN";
    u.rate = 1.02;
    u.volume = aiVolumeRef.current;
    u.onstart = () => {
      setPhase("speaking");
      startTicker(plain);
    };
    u.onboundary = (e: SpeechSynthesisEvent) => {
      if (typeof e.charIndex === "number" && typeof e.charLength === "number") {
        stopTicker();
        setReadIndex(e.charIndex + e.charLength);
        const delay = Math.max(1, e.charLength * 80);
        tickerRef.current = setInterval(() => {
          setReadIndex((i) => {
            const n = Math.min(plain.length, i + (e.charLength || 1));
            if (n >= plain.length) stopTicker();
            return n;
          });
        }, delay);
      }
    };
    const resetRead = () => {
      stopTicker();
      setReadText("");
      setReadKind("feedback");
      setReadIndex(0);
    };
    u.onend = () => {
      resetRead();
      aiSpeakingRef.current = false;
      setPhase("listening");
      setStatus("请点击「开始作答」");
    };
    u.onerror = (e: SpeechSynthesisErrorEvent | SpeechSynthesisEvent) => {
      const err = (e as Partial<SpeechSynthesisErrorEvent>).error;
      if (err === "canceled" || err === "interrupted") return;
      resetRead();
      aiSpeakingRef.current = false;
      setPhase("listening");
      setStatus("请点击「开始作答」");
    };
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
  };
  const aiVolumeRef = useRef(1);
  useEffect(() => {
    aiVolumeRef.current = aiVolume;
  }, [aiVolume]);

  // ===== 语音识别：按钮触发式作答（点击「开始作答」开麦，识别到回答完毕自动结束） =====
  const finalBufRef = useRef("");
  const lastActivityRef = useRef(0);
  const answeringRef = useRef(false);
  const idleTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [answering, setAnswering] = useState(false);
  const setAnsweringSync = (v: boolean) => {
    answeringRef.current = v;
    setAnswering(v);
  };

  const finishAnswer = (text?: string) => {
    if (!answeringRef.current) return;
    const t = (text ?? finalBufRef.current).trim();
    stopRecognition();
    setAnsweringSync(false);
    if (!t) {
      setTranscript("");
      setStatus("未检测到语音，可点击「开始作答」再说一次");
      return;
    }
    setTranscript(t);
    setPhase("processing");
    setStatus("思考中…");
    pushLog(`你：${t}`);
    setTranscriptLog((prev) => [...prev, { speaker: "user", content: t }]);
    wsRef.current?.send(JSON.stringify({ type: "answer", text: t }));
  };

  const openRecognition = () => {
    const SR = typeof window !== "undefined" && ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);
    if (!SR) {
      setBanner("当前浏览器不支持语音识别（SpeechRecognition），本次面试需使用语音作答，请更换 Chrome / Edge 后再试。");
      setAnsweringSync(false);
      return;
    }
    if (recognitionRef.current) return;
    const rec = new SR();
    rec.lang = "zh-CN";
    rec.continuous = true;
    rec.interimResults = true;
    recognitionRef.current = rec;

    rec.onresult = (ev: any) => {
      if (aiSpeakingRef.current) return;
      lastActivityRef.current = Date.now();
      let interim = "";
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const r = ev.results[i];
        if (r.isFinal) finalBufRef.current += r[0].transcript;
        else interim += r[0].transcript;
      }
      setTranscript(finalBufRef.current + interim);
    };
    rec.onend = () => {
      recognitionRef.current = null;
      if (answeringRef.current && !aiSpeakingRef.current) {
        const t = finalBufRef.current.trim();
        if (t.length > 0) finishAnswer(t);
        else setTranscript("（仍在聆听…请说话；如已说完请点击「结束作答」）");
      }
    };
    rec.onerror = (ev: any) => {
      if (ev.error === "no-speech" || ev.error === "aborted") return;
      setError("语音识别错误：" + (ev.error ?? "未知"));
      setAnsweringSync(false);
    };
    try {
      rec.start();
    } catch {
      /* ignore */
    }
  };

  const startAnswer = () => {
    if (aiSpeakingRef.current || phaseRef.current !== "listening" || answeringRef.current) return;
    finalBufRef.current = "";
    setTranscript("");
    setAnsweringSync(true);
    setStatus("聆听中…请作答（说完自动结束）");
    openRecognition();
  };

  // 静音自动结束兜底：作答中连续 3.5s 无新语音则自动提交
  useEffect(() => {
    idleTimerRef.current = setInterval(() => {
      if (answeringRef.current && !aiSpeakingRef.current) {
        const t = finalBufRef.current.trim();
        if (t.length > 0 && Date.now() - lastActivityRef.current > 3500) finishAnswer();
      }
    }, 1200);
    return () => {
      if (idleTimerRef.current) clearInterval(idleTimerRef.current);
    };
  }, []);

  const phaseRef = useRef<Phase>("connecting");
  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  const stopRecognition = () => {
    const rec = recognitionRef.current;
    if (rec) {
      try {
        rec.onresult = null;
        rec.onend = null;
        rec.onerror = null;
        rec.stop();
      } catch {
        /* ignore */
      }
    }
    recognitionRef.current = null;
  };

  useEffect(() => {
    closedRef.current = false;
    setupMedia();
    return () => {
      closedRef.current = true;
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      stopRecognition();
      if (analystRef.current) cancelAnimationFrame(analystRef.current.raf);
      mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
      wsRef.current?.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // 设备调试全部通过后才连接面试官
  useEffect(() => {
    if (debugDone && id) {
      connect();
      setPhase("connecting");
      setStatus("连接面试官…");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debugDone]);

  const connect = () => {
    if (closedRef.current) return;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      attemptRef.current = 0;
      setBanner("");
      pushLog("已连接面试官");
      // 拉取面试信息（公司/岗位）
      if (id) {
        api
          .get<{ interview: { companyName: string | null; role: string; questionCount: number; unlimited: boolean } }>(`/interviews/${id}`)
          .then((d) => {
            setCompanyName(d.interview.companyName ?? "");
            setRole(d.interview.role);
            setQuestionCount(d.interview.questionCount);
            setUnlimited(d.interview.unlimited);
          })
          .catch(() => undefined);
      }
      ws.send(JSON.stringify({ type: "start", text: id }));
    };

    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data as string) as RealtimeEvent;
      switch (msg.type) {
        case "opening":
          setOpening(msg.text ?? "");
          setStatus("面试官致开场白…");
          pushLog(`面试官：${msg.text}`);
          setTranscriptLog((prev) => [...prev, { speaker: "ai", content: msg.text ?? "" }]);
          break;
        case "question":
          stopRecognition();
          setQIndex((prev) => (qSeenRef.current ? prev + 1 : 1));
          qSeenRef.current = true;
          setCurrentQuestion(msg.question ?? "");
          setAiText("");
          setStatus("面试官提问中…");
          pushLog(`面试官出题：${msg.question}`);
          setTranscriptLog((prev) => [...prev, { speaker: "ai", content: msg.question ?? "" }]);
          speakLocal(msg.question ?? "", "question");
          break;
        case "transcript_partial":
          setTranscript(msg.text ?? "");
          break;
        case "transcript_final":
          stopRecognition();
          setTranscript(msg.text ?? "");
          setPhase("processing");
          setStatus("思考中…");
          if (msg.text) setTranscriptLog((prev) => [...prev, { speaker: "user", content: msg.text ?? "" }]);
          if (msg.ending) pushLog("检测到结束对话关键词");
          break;
        case "followup":
          stopRecognition();
          setAiText(msg.question ?? "");
          setStatus("面试官追问中…");
          pushLog(`面试官：${msg.question}`);
          setTranscriptLog((prev) => [...prev, { speaker: "ai", content: msg.question ?? "" }]);
          speakLocal(msg.question ?? "");
          break;
        case "speak_start":
          stopRecognition();
          aiSpeakingRef.current = true;
          setPhase("speaking");
          setAiText(msg.text ?? "");
          setStatus("面试官说话中…");
          break;
        case "speak_text":
          stopRecognition();
          aiSpeakingRef.current = true;
          setAiText(msg.text ?? "");
          setStatus("面试官说话中…");
          pushLog(`面试官：${msg.text}`);
          setTranscriptLog((prev) => [...prev, { speaker: "ai", content: msg.text ?? "" }]);
          speakLocal(msg.text ?? "");
          break;
        case "speak": {
          stopRecognition();
          aiSpeakingRef.current = true;
          const plain = stripMark(msg.text ?? "");
          const audio = new Audio();
          const bytes = base64ToBytes(msg.audio ?? "");
          const blob = new Blob([bytes.buffer as ArrayBuffer], { type: "audio/mpeg" });
          audio.src = URL.createObjectURL(blob);
          audio.volume = aiVolume;
          audio.onplay = () => {
            aiSpeakingRef.current = true;
            setPhase("speaking");
            setReadText(plain);
            setReadKind("feedback");
            startTicker(plain);
          };
          audio.play().catch(() => {
            aiSpeakingRef.current = false;
            setPhase("listening");
            setStatus("请点击「开始作答」");
          });
          audio.onended = () => {
            stopTicker();
            setReadText("");
            setReadKind("feedback");
            setReadIndex(0);
            aiSpeakingRef.current = false;
            setPhase("listening");
            setStatus("请点击「开始作答」");
          };
          break;
        }
        case "speak_done":
          aiSpeakingRef.current = false;
          setPhase("listening");
          setStatus("请点击「开始作答」");
          break;
        case "interview_complete":
          stopRecognition();
          setPhase("complete");
          setStatus("面试结束，正在评分…");
          setTranscriptLog((prev) => [...prev, { speaker: "system", content: "面试结束，正在评分…" }]);
          pushLog("面试结束，正在评分…");
          break;
        case "scored":
          setTimeout(() => navigate(`/report/${id}`), 600);
          break;
        case "error":
          setError(msg.message ?? "连接错误");
          setPhase("error");
          break;
      }
    };

    ws.onclose = () => {
      wsRef.current = null;
      if (!closedRef.current) handleDisconnect();
    };
    ws.onerror = () => pushLog("WebSocket 错误");
  };

  const handleDisconnect = () => {
    pushLog("连接已断开，正在自动重连…");
    stopRecognition();
    setPhase("error");
    setStatus("连接中断");
    attemptRef.current += 1;
    if (attemptRef.current <= 3) {
      setBanner("与面试官的连接已断开，正在自动重连…");
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = setTimeout(connect, 3000);
    } else {
      setBanner("连接失败，请点击「重试连接」按钮或刷新页面");
    }
  };

  const retryConnect = () => {
    if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
    attemptRef.current = 0;
    setBanner("");
    connect();
  };

  // ===== 设备调试（面试开始前） =====
  const dbgLoopRef = useRef<number | null>(null);
  const dbgStrongMsRef = useRef(0);
  const dbgMicPassedRef = useRef(false);
  const dbgRmsRef = useRef(0);

  const dbgSpeakerTest = () => {
    setOutputNote("");
    if (!("speechSynthesis" in window)) {
      setOutputNote("当前浏览器无语音合成引擎，面试官语音将以文字播报代替。");
      setDbg((d) => ({ ...d, speaker: "pass" }));
      return;
    }
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance("你好，欢迎参加模拟面试。如果你能听到这句话，说明扬声器工作正常。");
    u.lang = "zh-CN";
    u.rate = 1;
    u.onend = () => setDbg((d) => ({ ...d, speaker: "pass" }));
    u.onerror = () => setOutputNote("播放失败：请检查扬声器与系统音量。点击「重测扬声器」再试。");
    speechSynthesis.speak(u);
  };

  const stopDbgLoop = () => {
    if (dbgLoopRef.current) cancelAnimationFrame(dbgLoopRef.current);
    dbgLoopRef.current = null;
  };

  const dbgMicStart = () => {
    setOutputNote("");
    const stream = mediaStreamRef.current;
    if (!stream) {
      setOutputNote("尚未获得麦克风，请在浏览器地址栏允许后点击「重新获取并测试」。");
      setDbg((d) => ({ ...d, mic: "idle" }));
      return;
    }
    setDbg((d) => ({ ...d, mic: "running" }));
    dbgMicPassedRef.current = false;
    dbgStrongMsRef.current = 0;
    const ctx = new AudioContext();
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    source.connect(analyser);
    const data = new Uint8Array(analyser.frequencyBinCount);
    const canvas = document.getElementById("dbg-wave-canvas") as HTMLCanvasElement | null;
    const cctx = canvas?.getContext("2d");
    stopDbgLoop();
    const tick = () => {
      analyser.getByteTimeDomainData(data);
      let sum = 0;
      for (let i = 0; i < data.length; i++) {
        const v = (data[i] - 128) / 128;
        sum += v * v;
      }
      const rms = Math.sqrt(sum / data.length);
      dbgRmsRef.current = rms;
      if (canvas && cctx) {
        cctx.clearRect(0, 0, canvas.width, canvas.height);
        cctx.strokeStyle = "#34d399";
        cctx.lineWidth = 1.5;
        cctx.beginPath();
        const mid = canvas.height / 2;
        for (let i = 0; i < data.length; i++) {
          const x = (i / data.length) * canvas.width;
          const y = mid + ((data[i] - 128) / 128) * (canvas.height / 2);
          if (i === 0) cctx.moveTo(x, y);
          else cctx.lineTo(x, y);
        }
        cctx.stroke();
      }
      const level = document.getElementById("dbg-level") as HTMLDivElement | null;
      if (level) level.style.width = `${Math.min(100, rms * 480)}%`;
      if (!dbgMicPassedRef.current) {
        if (rms > 0.03) dbgStrongMsRef.current += 16;
        else dbgStrongMsRef.current = Math.max(0, dbgStrongMsRef.current - 32);
        if (dbgStrongMsRef.current > 600 && !dbgMicPassedRef.current) {
          dbgMicPassedRef.current = true;
          stopDbgLoop();
          setDbg((d) => ({ ...d, mic: "pass" }));
          setOutputNote("麦克风拾音正常。");
          return;
        }
      }
      dbgLoopRef.current = requestAnimationFrame(tick);
    };
    dbgLoopRef.current = requestAnimationFrame(tick);
  };

  const dbgMicRetry = async () => {
    setBanner("");
    mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
    await setupMedia();
    dbgMicStart();
  };

  const dbgAsrStart = () => {
    setOutputNote("");
    const SR = typeof window !== "undefined" && ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);
    if (!SR) {
      setOutputNote("当前浏览器不支持语音识别，请使用 Chrome / Edge。");
      return;
    }
    setDbg((d) => ({ ...d, asr: "running" }));
    setAsrText("");
    const rec = new SR();
    rec.lang = "zh-CN";
    rec.continuous = false;
    rec.interimResults = true;
    rec.onresult = (ev: any) => {
      let t = "";
      for (let i = 0; i < ev.results.length; i++) t += ev.results[i][0].transcript;
      setAsrText(t);
      if (t.trim().length > 0) {
        setDbg((d) => ({ ...d, asr: "pass" }));
        setOutputNote("语音识别正常。");
        try {
          rec.stop();
        } catch {
          /* ignore */
        }
      }
    };
    rec.onend = () => setDbg((d) => (d.asr === "running" ? { ...d, asr: "idle" } : d));
    rec.onerror = (ev: any) => {
      if (ev.error === "no-speech" || ev.error === "aborted") return;
      setOutputNote("识别测试出错了，请点击「重试语音识别」再试。");
      setDbg((d) => ({ ...d, asr: "idle" }));
    };
    try {
      rec.start();
    } catch {
      /* ignore */
    }
  };

const dbgCamSkip = () => setDbg((d) => ({ ...d, cam: "pass" }));

  const dbgCamRetry = async () => {
    setOutputNote("");
    setDbg((d) => ({ ...d, cam: "pending" }));
    mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
    mediaStreamRef.current = null;
    await setupMedia();
  };

  const dbgVideoRef = useRef<HTMLVideoElement | null>(null);
  useEffect(() => {
    if (dbgVideoRef.current && mediaStreamRef.current) {
      dbgVideoRef.current.srcObject = mediaStreamRef.current;
      dbgVideoRef.current.play().catch(() => undefined);
    }
    if (devices.camera) setDbg((d) => ({ ...d, cam: "pass" }));
  }, [devices]);

  const debugReady = dbg.speaker === "pass" && dbg.mic === "pass" && dbg.asr === "pass" && dbg.cam === "pass";

  const enterInterview = () => {
    stopDbgLoop();
    setDebugDone(true);
  };

  const replayQuestion = () => {
    if (!currentQuestion) return;
    stopRecognition();
    setAnsweringSync(false);
    speakLocal(currentQuestion, "question");
  };

  const interrupt = () => {
    if ("speechSynthesis" in window) speechSynthesis.cancel();
    aiSpeakingRef.current = false;
    setAnsweringSync(false);
    stopRecognition();
    wsRef.current?.send(JSON.stringify({ type: "interrupt" }));
    setPhase("listening");
    setStatus("请点击「开始作答」");
    setTranscript("");
  };

  const endInterview = () => {
    stopRecognition();
    pushLog("你：结束对话");
    wsRef.current?.send(JSON.stringify({ type: "end" }));
    setPhase("processing");
    setStatus("正在结束并评分…");
  };

  const interviewerActive = phase === "speaking";
  const userActive = phase === "listening" || phase === "processing" || answering;

  const statusText = () => {
    if (answering) return "聆听中…请作答（说完自动结束）";
    if (phase === "speaking") return "面试官说话中";
    if (phase === "listening") return "请点击「开始作答」";
    if (phase === "processing") return "思考中…";
    if (phase === "complete") return "正在评分…";
    return "连接中…";
  };
  const statusColor = () => {
    if (answering) return "#34d399";
    if (phase === "speaking") return ACCENT;
    if (phase === "listening") return "#34d399";
    if (phase === "processing") return "#f59e0b";
    return MUTED;
  };

  const sectionTitle: React.CSSProperties = { fontSize: 14, fontWeight: 600, color: MUTED, letterSpacing: ".04em", marginBottom: 10 };
  const speakerLabel = (s: "ai" | "user" | "system") =>
    s === "ai" ? "面试官" : s === "user" ? "你" : "系统";

  if (!debugDone) {
    const statusBadge = (state: "pending" | "idle" | "running" | "pass") =>
      state === "pass" ? (
        <span style={{ fontSize: 12, fontWeight: 700, color: "#34d399", border: "1px solid rgba(52,211,153,.5)", borderRadius: 99, padding: "4px 12px" }}>已通过</span>
      ) : state === "running" ? (
        <span style={{ fontSize: 12, fontWeight: 700, color: ACCENT_SOFT, border: "1px solid rgba(201,162,90,.5)", borderRadius: 99, padding: "4px 12px" }}>测试中…</span>
      ) : (
        <span style={{ fontSize: 12, fontWeight: 600, color: MUTED, border: "1px solid #3a4150", borderRadius: 99, padding: "4px 12px" }}>未检测</span>
      );
    const ghostBtn: React.CSSProperties = { fontSize: 14, fontWeight: 600, border: `1px solid ${LINE}`, color: "#cbd5e1", background: "transparent", borderRadius: 8, padding: "10px 16px", cursor: "pointer" };
    return (
      <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "#08090c", boxSizing: "border-box", display: "flex", flexDirection: "column" }}>
        <div style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 0, background: "radial-gradient(900px 500px at 15% -10%, rgba(201,162,90,.09), transparent 55%), radial-gradient(700px 400px at 90% 110%, rgba(90,120,160,.08), transparent 50%)" }} />
        <div style={{ position: "relative", zIndex: 1, flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
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
                <span style={{ color: ACCENT_SOFT }}>03 面试</span>
                <span style={{ width: 14, height: 1, background: LINE }} />
                <span>04 总结</span>
              </div>
            </div>
          </div>

          <div style={{ flex: 1, minHeight: 0, overflowY: "auto", maxWidth: 720, width: "100%", margin: "0 auto", padding: "36px 24px 16px" }}>
            <p style={{ fontSize: 11, letterSpacing: ".18em", color: ACCENT, fontWeight: 600, margin: 0 }}>Interview · 03 / 04 · 设备调试</p>
            <h1 style={{ margin: "10px 0 8px", fontSize: 32, fontWeight: 300, color: "#f6f8fb" }}>开始前：调试语音与录像</h1>
<p style={{ margin: "0 0 26px", fontSize: 14, color: MUTED, lineHeight: 1.7 }}>
              建议完成后 4 项检测（摄像头可跳过）；未全部通过也可直接进入面试。此阶段不会出题、不消耗每日次数。
            </p>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              {/* 扬声器 */}
              <div style={{ ...PANEL, padding: 18 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                  <div style={{ fontWeight: 700, color: "#f6f8fb", fontSize: 16 }}>① 扬声器</div>
                  {statusBadge(dbg.speaker)}
                </div>
                <div style={{ fontSize: 13, color: MUTED, lineHeight: 1.6, margin: "8px 0 14px" }}>
                  {dbg.speaker === "pass" ? "已确认能听到测试音。" : "点击「播放测试音」确认能听到声音。"}
                </div>
                <button onClick={dbgSpeakerTest} style={ghostBtn}><span style={{ display:"inline-flex", marginRight: 6 }}><VolumeIcon size={14} /></span> {dbg.speaker === "pass" ? "重测扬声器" : "播放测试音"}</button>
              </div>

              {/* 摄像头 */}
              <div style={{ ...PANEL, padding: 18 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                  <div style={{ fontWeight: 700, color: "#f6f8fb", fontSize: 16 }}>② 摄像头 <span style={{ color: MUTED, fontWeight: 400, fontSize: 12 }}>（可选）</span></div>
                  {statusBadge(dbg.cam)}
                </div>
<div style={{ fontSize: 13, color: MUTED, lineHeight: 1.6, margin: "8px 0 14px" }}>
                  {dbg.cam === "pass" ? "预览正常，面试中会显示你的画面。" : "确认预览画面正常，或选择跳过（不影响面试）。"}
                </div>
                <div style={{ width: "100%", height: 150, borderRadius: 6, overflow: "hidden", background: "#0a0c10", border: `1px solid ${LINE}`, position: "relative" }}>
                  <video ref={dbgVideoRef} autoPlay playsInline muted style={{ width: "100%", height: "100%", objectFit: "cover", transform: "scaleX(-1)" }} />
                  {!devices.camera && (
                    <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: MUTED, fontSize: 13 }}>摄像头未开启</div>
                  )}
                </div>
                {dbg.cam !== "pass" && (
                  <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                    {!devices.camera && (
                      <button onClick={dbgCamRetry} style={ghostBtn}><span style={{ display: "inline-flex", marginRight: 6 }}><VideoIcon size={14} /></span>重新获取摄像头</button>
                    )}
                    <button onClick={dbgCamSkip} style={ghostBtn}><span style={{ display: "inline-flex", marginRight: 6 }}><VideoIcon size={14} /></span>跳过摄像头（可选）</button>
                  </div>
                )}
              </div>

              {/* 麦克风 */}
              <div style={{ ...PANEL, padding: 18 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                  <div style={{ fontWeight: 700, color: "#f6f8fb", fontSize: 16 }}>③ 麦克风拾音</div>
                  {statusBadge(dbg.mic)}
                </div>
                <div style={{ fontSize: 13, color: MUTED, lineHeight: 1.6, margin: "8px 0 14px" }}>
                  {dbg.mic === "pass"
                    ? "波形与音量条已确认能响应你的声音。"
                    : (dbg.mic === "running" ? "正在测试：现在说话，看下方波形是否跳动。" : "点击「开始测试」后对着麦克风说话。")}
                </div>
                <canvas id="dbg-wave-canvas" width={560} height={70} style={{ width: "100%", height: 70, background: "#0a0c10", border: `1px solid ${LINE}`, borderRadius: 6 }} />
                <div style={{ height: 5, background: "rgba(255,255,255,.07)", borderRadius: 99, marginTop: 8, overflow: "hidden" }}>
                  <div id="dbg-level" style={{ height: 5, width: 0, background: `linear-gradient(90deg,#34d399,#a7f3d0)`, borderRadius: 99 }} />
                </div>
                {dbg.mic === "idle" || dbg.mic === "running" ? (
                  <button onClick={dbgMicStart} style={{ ...ghostBtn, marginTop: 12 }}><span style={{ display:"inline-flex", marginRight: 6 }}><ActivityIcon size={14} /></span> {dbg.mic === "running" ? "监听中…" : "开始测试"}</button>
                ) : (
                  <button onClick={dbgMicRetry} style={{ ...ghostBtn, marginTop: 12 }}><span style={{ display:"inline-flex", marginRight: 6 }}><MicIcon size={14} /></span> 重新获取并测试</button>
                )}
              </div>

              {/* 语音识别 */}
              <div style={{ ...PANEL, padding: 18 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                  <div style={{ fontWeight: 700, color: "#f6f8fb", fontSize: 16 }}>④ 语音识别</div>
                  {statusBadge(dbg.asr)}
                </div>
                <div style={{ fontSize: 13, color: MUTED, lineHeight: 1.6, margin: "8px 0 14px" }}>
                  {dbg.asr === "pass" ? `识别成功：${asrText}` : (dbg.asr === "running" ? "正在聆听…请说「大家好，我在测试语音」" : "点击「开始识别测试」，然后对着麦克风说：大家好，我在测试语音。")}
                </div>
                <div style={{ fontSize: 16, color: "#e8eaf0", minHeight: 24, background: "rgba(0,0,0,.25)", border: `1px solid ${LINE}`, borderRadius: 6, padding: "8px 12px", marginBottom: 12 }}>{asrText || "识别结果将显示在这里…"}</div>
                {dbg.asr !== "pass" ? (
                  <button onClick={dbgAsrStart} style={ghostBtn}><span style={{ display:"inline-flex", marginRight: 6 }}><MicIcon size={14} /></span> {dbg.asr === "running" ? "聆听中…" : "开始识别测试"}</button>
                ) : (
                  <button onClick={dbgAsrStart} style={ghostBtn}><span style={{ display:"inline-flex", marginRight: 6 }}><MicIcon size={14} /></span> 重新测试</button>
                )}
              </div>
            </div>

            {outputNote && <div style={{ marginTop: 16, fontSize: 14, color: ACCENT_SOFT }}>{outputNote}</div>}

            {banner && (
              <div style={{ marginTop: 16, border: "1px solid rgba(245,158,11,.4)", borderRadius: 8, background: "rgba(245,158,11,.08)", color: "#fbbf7f", padding: "12px 16px", fontSize: 14 }}>{banner}</div>
            )}

<div style={{ marginTop: 26, display: "flex", alignItems: "center", gap: 16 }}>
              <button onClick={enterInterview} className="btn-gold" style={{ flex: 1, padding: 15, fontSize: 17, fontWeight: 700 }}>
                {debugReady ? "调试通过 · 进入面试" : "进入面试"}
              </button>
            </div>
            {!debugReady && (
              <div style={{ marginTop: 12, textAlign: "center", fontSize: 12, color: MUTED }}>设备未全部通过检测，仍可直接进入面试（可使用「插话 / 结束作答」，语音功能可能受限）</div>
            )}
          </div>

          <div style={{ padding: "0 0 22px", display: "flex", flexDirection: "column", alignItems: "center", gap: 10, flexShrink: 0 }}>
            <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
              <span style={{ width: 8, height: 8, borderRadius: 99, border: "1px solid #3a4150", background: "transparent" }} />
              <span style={{ width: 8, height: 8, borderRadius: 99, border: "1px solid #3a4150", background: "transparent" }} />
              <span style={{ width: 8, height: 8, borderRadius: 99, border: `1px solid ${ACCENT}`, background: ACCENT }} />
              <span style={{ width: 8, height: 8, borderRadius: 99, border: "1px solid #3a4150", background: "transparent" }} />
            </div>
            <span style={{ fontSize: 11, letterSpacing: ".14em", color: MUTED }}>调试推荐完成 · 未通过也可直接开始</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "#08090c", boxSizing: "border-box", display: "flex", flexDirection: "column" }}>
      {/* 背景光晕 */}
      <div style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 0, background: "radial-gradient(900px 500px at 15% -10%, rgba(201,162,90,.09), transparent 55%), radial-gradient(700px 400px at 90% 110%, rgba(90,120,160,.08), transparent 50%)" }} />
      <div style={{ position: "relative", zIndex: 1, flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
        {/* 顶部品牌导航（覆盖全局顶栏） */}
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
              <span style={{ color: ACCENT_SOFT }}>03 面试</span>
              <span style={{ width: 14, height: 1, background: LINE }} />
              <span>04 总结</span>
            </div>
          </div>
        </div>

        <main style={{ flex: 1, minHeight: 0, maxWidth: 1104, width: "100%", margin: "0 auto", padding: "22px 24px 16px", display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, paddingBottom: 14, borderBottom: `1px solid ${LINE}`, marginBottom: 16, flexWrap: "wrap" }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 14, flexWrap: "wrap" }}>
              <p style={{ fontSize: 11, letterSpacing: ".18em", color: ACCENT, fontWeight: 600, margin: 0 }}>Interview · 03 / 04</p>
              <h1 style={{ margin: 0, fontSize: 26, fontWeight: 300, letterSpacing: ".01em", color: "#f6f8fb" }}>模拟面试</h1>
              <span style={{ fontSize: 13, color: MUTED }}>
                {`${ROLE_LABEL[role] ?? ""}${companyName ? " · " + companyName : ""}` || "与 AI 面试官实时对话"}{unlimited ? "" : ` · 共 ${questionCount} 题`}
              </span>
            </div>
            <div style={{ display: "flex", gap: 10, fontSize: 13 }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6, border: `1px solid ${devices.mic ? "rgba(52,211,153,.5)" : "#3a4150"}`, color: devices.mic ? "#34d399" : MUTED, borderRadius: 99, padding: "5px 12px", fontWeight: 600 }}>
                <MicIcon size={14} /> {devices.mic ? "麦克风已开" : "麦克风未开"}
              </span>
<span style={{ display: "inline-flex", alignItems: "center", gap: 6, border: `1px solid ${devices.camera ? "rgba(52,211,153,.5)" : "#3a4150"}`, color: devices.camera ? "#34d399" : MUTED, borderRadius: 99, padding: "5px 12px", fontWeight: 600 }}>
                <VideoIcon size={14} /> {devices.camera ? "摄像头已开" : "摄像头未开"}
              </span>
            </div>
          </div>

          {!unlimited && questionCount > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: 16, paddingBottom: 12, marginBottom: 16, borderBottom: `1px solid ${LINE}` }}>
              <div style={{ flex: 1, height: 4, borderRadius: 99, background: "rgba(255,255,255,.07)", overflow: "hidden" }}>
                <div style={{ width: `${Math.min(100, Math.round((qIndex / questionCount) * 100))}%`, height: "100%", background: `linear-gradient(90deg, ${ACCENT}, ${ACCENT_SOFT})`, borderRadius: 99, transition: "width .4s ease" }} />
              </div>
              <span style={{ fontSize: 12, fontWeight: 600, letterSpacing: ".04em", color: MUTED, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
                第 {qIndex} / {questionCount} 题 · {Math.min(100, Math.round((qIndex / questionCount) * 100))}%
              </span>
            </div>
          )}

      {error ? (
        <div style={{ ...PANEL, padding: 22, color: "#fca5a5", fontSize: 18 }}>{error}</div>
      ) : (
        <>
        <div style={{ flex: 1, minHeight: 0, display: "flex", gap: 20, alignItems: "stretch" }}>
          {/* ===== 左：问答主区（对话流） ===== */}
          <div style={{ ...PANEL, flex: 1, minWidth: 0, padding: 20, display: "flex", flexDirection: "column", minHeight: 0 }}>
            <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingBottom: 14, borderBottom: `1px solid ${LINE}`, marginBottom: 16 }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 8, color: statusColor(), background: `${statusColor()}14`, border: `1px solid ${statusColor()}55`, borderRadius: 99, padding: "5px 14px", fontSize: 15, fontWeight: 600 }}>
                <span style={{ width: 8, height: 8, borderRadius: 99, background: statusColor(), display: "inline-block" }} />
                {statusText()}
              </span>
              <span style={{ fontSize: 14, border: `1px solid rgba(201,162,90,.4)`, borderRadius: 99, padding: "5px 12px", fontWeight: 600, color: ACCENT_SOFT }}>
                第 {qIndex} 题 {unlimited ? "· 不限题量" : `· 共 ${questionCount} 题`}
              </span>
            </div>

{opening && (
              <div style={{ paddingBottom: 14, borderBottom: `1px solid ${LINE}`, marginBottom: 14 }}>
                <div style={sectionTitle}>面试官 · 开场</div>
                <div style={{ fontSize: 17, lineHeight: 1.8, color: "#e8eaf0" }}>
                  {readText && readText === opening ? <ReadHighlight text={opening} index={readIndex} /> : opening}
                </div>
              </div>
            )}

            {(currentQuestion || aiText || readText) && !(opening && aiText === opening && !currentQuestion) && (
              <div style={{ paddingBottom: 14, borderBottom: `1px solid ${LINE}`, marginBottom: 14 }}>
                <div style={sectionTitle}>
                  面试官{!currentQuestion && aiText ? " · 开场" : readKind === "question" && (currentQuestion || readText) ? ` · 第 ${qIndex} 题 · 提问` : " · 点评与追问"}
                </div>
                <div style={{ fontSize: 19, lineHeight: 1.9, color: "#e8eaf0" }}>
                  {(() => {
                    const body = readText
                      ? readKind === "question"
                        ? currentQuestion
                        : aiText || currentQuestion
                      : aiText || currentQuestion;
                    return <ReadHighlight text={body || ""} index={readIndex} />;
                  })()}
                </div>
              </div>
            )}

            <div style={{ paddingBottom: 14, borderBottom: `1px solid ${LINE}` }}>
              <div style={sectionTitle}>你的实时转写</div>
              <div style={{ fontSize: 19, lineHeight: 1.9, minHeight: 26, color: "#e8eaf0" }}>
                {answering ? transcript || "（正在聆听…请开始作答）" : "点击「开始作答」后说话，说完点击「结束作答」"}
              </div>
              {!answering && (
                <div style={{ fontSize: 12, color: MUTED, marginTop: 6 }}>点「开始作答」后说话；说完点「结束作答」，或停顿约数秒自动提交</div>
              )}
            </div>
            </div>
          </div>

          {/* ===== 右：面板列（面试官名片 + 候选人媒体） ===== */}
          <div style={{ ...PANEL, width: 380, flexShrink: 0, display: "flex", flexDirection: "column", gap: 16, padding: 14, minHeight: 0 }}>
            <div style={{ ...PANEL, padding: 20, textAlign: "center", borderColor: interviewerActive ? ACCENT : "#3a4150" }}>
              <div style={{ width: 104, height: 104, borderRadius: 999, background: interviewerActive ? "rgba(201,162,90,.12)" : "rgba(255,255,255,.03)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto", color: interviewerActive ? ACCENT_SOFT : "#8b93a1", border: `1px solid ${interviewerActive ? ACCENT : "#3a4150"}` }}>
                <UserIcon size={50} />
              </div>
              <div style={{ fontWeight: 700, marginTop: 14, fontSize: 22, color: "#f6f8fb" }}>面试官</div>
              <div style={{ display: "inline-flex", alignItems: "center", gap: 6, marginTop: 10, background: "rgba(255,255,255,.05)", border: `1px solid ${LINE}`, borderRadius: 99, padding: "4px 12px", fontSize: 13, color: ACCENT_SOFT, fontWeight: 600 }}>
                {ROLE_LABEL[role] ?? "候选人"}
                {companyName ? <span style={{ color: MUTED, fontWeight: 400 }}> · {companyName}</span> : null}
              </div>
              <div style={{ borderTop: `1px solid ${LINE}`, marginTop: 18, paddingTop: 16, textAlign: "left" }}>
                <label style={{ fontSize: 15, fontWeight: 600, display: "flex", alignItems: "center", gap: 8, color: "#e8eaf0" }}>
                  <VolumeIcon size={15} /> 面试官音量
                </label>
                <input type="range" min={0} max={1} step={0.05} value={aiVolume} onChange={(e) => setAiVolume(Number(e.target.value))} style={{ width: "100%", height: 4, accentColor: ACCENT }} />
<div style={{ fontSize: 13, color: MUTED }}>{Math.round(aiVolume * 100)}%</div>
              </div>
              <button onClick={replayQuestion} disabled={!currentQuestion || answering} style={{ marginTop: 12, fontSize: 13, fontWeight: 600, width: "100%", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, border: `1px solid ${currentQuestion ? "rgba(201,162,90,.45)" : LINE}`, color: currentQuestion ? ACCENT_SOFT : MUTED, background: currentQuestion ? "rgba(201,162,90,.06)" : "transparent", borderRadius: 8, padding: "9px 12px", cursor: currentQuestion ? "pointer" : "not-allowed" }}>
                <VolumeIcon size={14} /> 重听当前题
              </button>
            </div>

            <div style={{ ...PANEL, flex: 1, minHeight: 0, overflowY: "auto", padding: 18, textAlign: "center", borderColor: userActive ? "#34d399" : "#3a4150" }}>
              <div style={{ fontWeight: 700, fontSize: 22, marginBottom: 4, color: "#f6f8fb" }}>你 · 候选人</div>
<div style={{ position: "relative", width: "100%", height: 180, borderRadius: 6, overflow: "hidden", background: "#0a0c10", border: `1px solid ${LINE}`, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 14 }}>
                <video ref={videoRef} autoPlay playsInline muted style={{ width: "100%", height: "100%", objectFit: "cover", transform: "scaleX(-1)" }} />
                {!devices.camera && <span style={{ color: MUTED, fontSize: 15 }}>摄像头未开启（可选）</span>}
                {answering && (
                  <span style={{ position: "absolute", top: 10, left: 10, display: "inline-flex", alignItems: "center", gap: 6, background: "rgba(220,38,38,.94)", color: "#fff", fontSize: 11, fontWeight: 800, letterSpacing: ".16em", borderRadius: 99, padding: "4px 11px" }}>
                    <span style={{ width: 6, height: 6, borderRadius: 99, background: "#fff", display: "inline-block", animation: "livePulse 1s ease-in-out infinite" }} />
                    LIVE
                  </span>
                )}
              </div>

              <div style={{ textAlign: "left" }}>
                <label style={{ fontSize: 15, fontWeight: 600, display: "flex", alignItems: "center", gap: 8, marginBottom: 8, color: "#e8eaf0" }}>
                  <ActivityIcon size={15} /> 声音波形
                </label>
                <canvas id="wave-canvas" width={560} height={110} style={{ width: "100%", height: 110, background: "#0a0c10", border: `1px solid ${LINE}`, borderRadius: 6 }} />
              </div>

              <div style={{ marginTop: 16, borderTop: `1px solid ${LINE}`, paddingTop: 14, textAlign: "left" }}>
                <label style={{ fontSize: 15, fontWeight: 600, display: "flex", alignItems: "center", gap: 8, color: "#e8eaf0" }}>
                  <MicIcon size={15} /> 麦克风灵敏度
                </label>
                <input type="range" min={0.3} max={2} step={0.05} value={micGain} onChange={(e) => setMicGain(Number(e.target.value))} style={{ width: "100%", height: 4, accentColor: "#34d399" }} />
                <div style={{ fontSize: 13, color: MUTED }}>{Math.round(micGain * 100)}%</div>
              </div>
            </div>
          </div>
        </div>
        </>
      )}

      {banner && (
        <div style={{ marginTop: 18, display: "flex", alignItems: "center", gap: 16, border: "1px solid rgba(245,158,11,.4)", borderRadius: 8, background: "rgba(245,158,11,.08)", color: "#fbbf7f", padding: "12px 16px" }}>
          <span style={{ flex: 1, fontSize: 15 }}>{banner}</span>
          {attemptRef.current > 3 && (
            <button onClick={retryConnect} style={{ flexShrink: 0, fontSize: 15, border: `1px solid ${ACCENT}`, color: ACCENT_SOFT, borderRadius: 8, padding: "8px 16px", background: "transparent", fontWeight: 600, cursor: "pointer" }}>
              重试连接
            </button>
          )}
        </div>
      )}

      <div style={{ display: "flex", gap: 16, marginTop: 24, paddingBottom: 4 }}>
        {phase === "speaking" && (
          <button onClick={interrupt} style={{ padding: "16px 20px", fontSize: 16, border: `1px solid ${LINE}`, background: "transparent", color: "#cbd5e1", borderRadius: 8, fontWeight: 600, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 8 }}>
            <StopIcon size={16} /> 插话
          </button>
        )}
        {answering ? (
          <button onClick={() => finishAnswer()} className="btn-gold" style={{ flex: 1, padding: 17, fontSize: 18, fontWeight: 700, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
            <StopIcon size={16} /> 结束作答（回答完毕）
          </button>
        ) : phase === "listening" ? (
          <button onClick={startAnswer} className="btn-gold" style={{ flex: 1, padding: 17, fontSize: 18, fontWeight: 700, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
            <MicIcon size={16} /> 开始作答
          </button>
        ) : (
          <button disabled style={{ flex: 1, padding: 17, fontSize: 18, fontWeight: 600, border: `1px solid ${LINE}`, background: "rgba(255,255,255,.02)", color: MUTED, borderRadius: 8, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, cursor: "not-allowed" }}>
            {phase === "speaking" ? "面试官说话中…" : "请稍候…"}
          </button>
        )}
        <button onClick={endInterview} style={{ padding: "16px 20px", fontSize: 16, border: "none", background: "transparent", color: MUTED, cursor: "pointer" }}>
          结束面试
        </button>
      </div>
        </main>

        {/* 底部页签圆点 */}
        <div style={{ padding: "0 0 22px", display: "flex", flexDirection: "column", alignItems: "center", gap: 10, flexShrink: 0 }}>
          <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
            <span style={{ width: 8, height: 8, borderRadius: 99, border: "1px solid #3a4150", background: "transparent" }} />
            <span style={{ width: 8, height: 8, borderRadius: 99, border: "1px solid #3a4150", background: "transparent" }} />
            <span style={{ width: 8, height: 8, borderRadius: 99, border: `1px solid ${ACCENT}`, background: ACCENT }} />
            <span style={{ width: 8, height: 8, borderRadius: 99, border: "1px solid #3a4150", background: "transparent" }} />
          </div>
          <span style={{ fontSize: 11, letterSpacing: ".14em", color: MUTED }}>面试进行中 · 结束时自动评分</span>
        </div>
      </div>
    </div>
  );
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
