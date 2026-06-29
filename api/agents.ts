// api/agents.ts — Diagnostic minimal version (no agent imports).
// If THIS works, we know the issue is in the agentslib chain.
import express from "express";
import cookieParser from "cookie-parser";
import jwt from "jsonwebtoken";

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

// Diagnostic ping
app.get("/api/agents/ping", (_req, res) => {
  res.json({ ok: true, message: "agents function loaded", env: { hasAnthropic: !!process.env.ANTHROPIC_API_KEY } });
});

// Try to lazy-load the agents module per-request and report error if any
let agentsModule: any = null;
let loadErrorMsg: string | null = null;
async function loadAgents() {
  if (agentsModule || loadErrorMsg) return;
  try {
    agentsModule = await import("./agentslib/routes");
  } catch (err: any) {
    loadErrorMsg = err?.stack || err?.message || String(err);
  }
}

app.use("/api/agents", requireSuperadmin, async (req, res, next) => {
  await loadAgents();
  if (loadErrorMsg) return res.status(503).json({ error: "agents module load failed", detail: loadErrorMsg.substring(0, 2000) });
  if (!agentsModule) return res.status(503).json({ error: "agents module not loaded" });
  // Attach routes the first time only
  if (!(app as any)._agentsAttached) {
    try {
      agentsModule.attachAgentRoutes(app, requireSuperadmin);
      (app as any)._agentsAttached = true;
    } catch (err: any) {
      return res.status(500).json({ error: "attach failed", detail: err?.message || String(err) });
    }
  }
  next();
});

app.use((err: any, _req: any, res: any, _next: any) => {
  console.error("[agents fn] unhandled:", err);
  res.status(500).json({ error: "Internal", detail: err?.message || String(err) });
});

export default app;
