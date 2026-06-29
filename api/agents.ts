// api/agents.ts — Dedicated serverless function for the AI Agents team.
// Isolated from api/index.ts so any failure here cannot break the main API.
// Handles all requests to /api/agents/* (see vercel.json rewrite rule).
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

try {
  attachAgentRoutes(app, requireSuperadmin);
  console.log("[agents] routes attached");
} catch (err: any) {
  const msg = err?.message || String(err);
  console.error("[agents] attach error:", msg);
  app.use("/api/agents", (_req, res) => {
    res.status(503).json({ error: "Module agents IA indisponible", detail: msg });
  });
}

// Generic error handler so failures return JSON, never crash
app.use((err: any, _req: any, res: any, _next: any) => {
  console.error("[agents function] unhandled:", err);
  res.status(500).json({ error: "Internal agents error", detail: err?.message || String(err) });
});

export default app;
