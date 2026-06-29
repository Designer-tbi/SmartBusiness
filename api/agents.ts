// api/agents.ts — Dedicated Vercel function for AI Agents (Super Admin only).
// Static import below is critical: lets esbuild inline the entire agents bundle
// at build time, avoiding Node ESM runtime extension issues.
import express from "express";
import cookieParser from "cookie-parser";
import jwt from "jsonwebtoken";
import { attachAgentRoutes } from "./agentslib/routes";

const JWT_SECRET = process.env.JWT_SECRET || "smart-business-secret-key";

const app = express();
app.use(express.json({ limit: "10mb" }));
app.use(cookieParser());

const requireSuperadmin = (req: any, res: any, next: any) => {
  const token = req.cookies?.token;
  if (!token) return res.status(401).json({ error: "Unauthorized" });
  jwt.verify(token, JWT_SECRET, (err: any, user: any) => {
    if (err) return res.status(403).json({ error: "Forbidden" });
    if (user.role !== "superadmin") return res.status(403).json({ error: "Superadmin requis" });
    req.user = user;
    next();
  });
};

// Diagnostic ping (no auth, kept for support)
app.get("/api/agents/ping", (_req, res) => {
  res.json({ ok: true, message: "agents function loaded", env: { hasAnthropic: !!process.env.ANTHROPIC_API_KEY } });
});

try {
  attachAgentRoutes(app, requireSuperadmin);
  console.log("[agents fn] routes attached");
} catch (err: any) {
  console.error("[agents fn] attach error:", err);
  app.use("/api/agents", (_req, res) => {
    res.status(503).json({ error: "Module agents IA indisponible", detail: err?.message || String(err) });
  });
}

app.use((err: any, _req: any, res: any, _next: any) => {
  console.error("[agents fn] unhandled:", err);
  res.status(500).json({ error: "Internal", detail: err?.message || String(err) });
});

export default app;
