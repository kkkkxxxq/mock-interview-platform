import { serve } from "@hono/node-server";
import type { Server } from "node:http";
import { Hono } from "hono";
import { logger } from "hono/logger";
import { cors } from "hono/cors";
import { WebSocketServer } from "ws";
import { healthCheck } from "./db";
import { env } from "./config";
import authRoutes from "./routes/auth";
import catalogRoutes from "./routes/catalog";
import interviewRoutes from "./routes/interviews";
import reportRoutes from "./routes/reports";
import recordingRoutes from "./routes/recordings";
import resumeRoutes from "./routes/resume";
import { setupRTInterview } from "./rt/interview-ws";

const app = new Hono();

app.use("*", logger());
app.use(
  "*",
  cors({
    origin: true,
    credentials: true
  })
);

app.get("/", (c) => c.json({ name: "mock-interview-api", version: "0.1.0" }));
app.get("/health", async (c) => {
  const dbOk = await healthCheck();
  return c.json({ status: dbOk ? "ok" : "db_error", db: dbOk });
});

app.route("/api/auth", authRoutes);
app.route("/api/catalog", catalogRoutes);
app.route("/api/interviews", interviewRoutes);
app.route("/api/reports", reportRoutes);
app.route("/api/recordings", recordingRoutes);
app.route("/api/resume", resumeRoutes);

const port = env.PORT;
const httpServer = serve({ fetch: app.fetch, port }, (info) => {
  console.log(`[server] REST listening on http://localhost:${info.port}`);
});

const wsServer = new WebSocketServer({ server: httpServer as Server, path: "/ws/interview" });
setupRTInterview(wsServer);
console.log(`[server] WS listening on ws://localhost:${port}/ws/interview`);