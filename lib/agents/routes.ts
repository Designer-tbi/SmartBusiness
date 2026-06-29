// agents/routes.ts — Mounts all AI agent endpoints under /api/agents/*
// SUPERADMIN-ONLY. Used from /app/api/index.ts via attachAgentRoutes(app, requireSuperadmin).
import type { Express, Request, Response, NextFunction } from "express";

import * as eden from "./eden";
import * as timothy from "./timothy";
import { alex, sara, marc, lisa } from "./subAgents";
import * as flore from "./flore";
import * as paul from "./paul";
import { chloe, kevin, ingrid } from "./paul";

import { AGENTS, getAgent, ensureAgentRunsTable, withRun } from "./registry";
import { LINKEDIN_ACCOUNTS } from "./linkedinClient";
import { CLAUDE_INFO } from "./claudeClient";
import { query } from "./pool";

type GuardMW = (req: any, res: any, next: NextFunction) => any;

const wrap =
  (agentId: string, capability: string) =>
  (fn: (req: Request) => Promise<any>) =>
  async (req: Request, res: Response) => {
    try {
      const out = await withRun(
        { agent_id: agentId, capability, input: { ...req.body, ...req.query }, triggered_by: (req as any).user?.uid },
        () => fn(req)
      );
      res.json({ success: true, agent: agentId, capability, data: out });
    } catch (err: any) {
      console.error(`[agent:${agentId}/${capability}]`, err?.message || err);
      res.status(500).json({ success: false, agent: agentId, capability, error: err?.message || "Server error" });
    }
  };

export function attachAgentRoutes(app: Express, requireSuperadmin: GuardMW) {
  // Ensure DB table exists at first request
  app.use("/api/agents", (req, _res, next) => { ensureAgentRunsTable().catch(() => {}); next(); }, requireSuperadmin);

  // ─── META endpoints ───────────────────────────────────────────────────
  app.get("/api/agents/team", (_req, res) => {
    res.json({
      success: true,
      claude: CLAUDE_INFO,
      total: AGENTS.length,
      agents: AGENTS,
      linkedin_accounts: Object.entries(LINKEDIN_ACCOUNTS).map(([id, a]) => ({ id, ...a })),
    });
  });

  app.get("/api/agents/:agentId/meta", (req, res) => {
    const meta = getAgent(req.params.agentId);
    if (!meta) return res.status(404).json({ error: "Agent inconnu" });
    res.json({ success: true, meta });
  });

  app.get("/api/agents/runs/recent", async (req, res) => {
    try {
      const { agent_id, limit = 50 } = req.query as any;
      const params: any[] = [];
      let where = "";
      if (agent_id) { params.push(agent_id); where = "WHERE agent_id = $1"; }
      params.push(Number(limit) || 50);
      const r = await query(
        `SELECT id, agent_id, capability, status, error_message, duration_ms, created_at,
                CASE WHEN LENGTH(output::text) > 2000 THEN '<<truncated>>' ELSE output END as output_preview
         FROM agent_runs ${where} ORDER BY created_at DESC LIMIT $${params.length}`,
        params
      );
      res.json({ success: true, runs: r.rows });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.get("/api/agents/runs/:id", async (req, res) => {
    try {
      const r = await query("SELECT * FROM agent_runs WHERE id = $1", [req.params.id]);
      if (r.rows.length === 0) return res.status(404).json({ error: "Run not found" });
      res.json({ success: true, run: r.rows[0] });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ─── EDEN ─────────────────────────────────────────────────────────────
  app.get ("/api/agents/eden/dashboard",       wrap("eden", "dashboard")      ((_r) => eden.executiveDashboard()));
  app.post("/api/agents/eden/delegate",        wrap("eden", "delegate")       ((r)  => eden.delegate(r.body)));
  app.post("/api/agents/eden/board-report",    wrap("eden", "board-report")   ((r)  => eden.boardReport(r.body.month, r.body.year)));
  app.get ("/api/agents/eden/strategic-watch", wrap("eden", "strategic-watch")((_r) => eden.strategicWatch()));
  app.post("/api/agents/eden/linkedin-post",   wrap("eden", "linkedin-post")  ((r)  => eden.publishLinkedInPost(r.body.topic)));

  // ─── TIMOTHY ──────────────────────────────────────────────────────────
  app.get ("/api/agents/timothy/pipeline",          wrap("timothy", "pipeline")        ((_r) => timothy.analyzePipeline()));
  app.post("/api/agents/timothy/linkedin/search",   wrap("timothy", "li-search")       ((r)  => timothy.findProspectsLinkedIn(r.body)));
  app.post("/api/agents/timothy/linkedin/connect",  wrap("timothy", "li-connect")      ((r)  => timothy.sendConnectionBatch(r.body.prospects || [])));
  app.post("/api/agents/timothy/linkedin/outreach", wrap("timothy", "li-outreach")     ((r)  => timothy.sendCommercialOutreach(r.body)));
  app.post("/api/agents/timothy/linkedin/post",     wrap("timothy", "li-post")         ((r)  => timothy.publishLinkedInPost(r.body.topic)));
  app.post("/api/agents/timothy/quote",             wrap("timothy", "quote")           ((r)  => timothy.generateQuote(r.body)));
  app.post("/api/agents/timothy/delegate",          wrap("timothy", "delegate")        ((r)  => timothy.delegateToSubAgent(r.body)));

  // ─── ALEX / SARA / MARC / LISA ───────────────────────────────────────
  app.post("/api/agents/timothy/alex/prospect",       wrap("alex",  "prospect") ((r) => alex.prospect(r.body)));
  app.post("/api/agents/timothy/alex/post",           wrap("alex",  "post")     ((r) => alex.publishSectorPost(r.body.sector)));
  app.post("/api/agents/timothy/sara/proposal",       wrap("sara",  "proposal") ((r) => sara.generateProposal(r.body)));
  app.post("/api/agents/timothy/sara/followup",       wrap("sara",  "followup") ((r) => sara.followUpAfterProposal(r.body)));
  app.post("/api/agents/timothy/marc/followups",      wrap("marc",  "followups")((_r) => marc.runPipelineAndFollowUps()));
  app.get ("/api/agents/timothy/marc/weekly-report",  wrap("marc",  "weekly-report")((_r) => marc.weeklyReportToTimothy()));
  app.post("/api/agents/timothy/lisa/contract",       wrap("lisa",  "contract") ((r) => lisa.draftServiceContract(r.body)));
  app.post("/api/agents/timothy/lisa/nda",            wrap("lisa",  "nda")      ((r) => lisa.quickNDA(r.body)));
  app.post("/api/agents/timothy/lisa/review",         wrap("lisa",  "review")   ((r) => lisa.reviewForTimothy(r.body.contractText)));

  // ─── FLORE / NINA / OMAR ─────────────────────────────────────────────
  app.post("/api/agents/flore/linkedin/job-post",  wrap("flore", "job-post")     ((r)  => flore.postJobOnLinkedIn(r.body)));
  app.post("/api/agents/flore/nina/headhunt",      wrap("nina",  "headhunt")     ((r)  => flore.ninaHeadhunt(r.body)));
  app.post("/api/agents/flore/screen-cvs",         wrap("flore", "screen-cvs")   ((r)  => flore.screenCVs(r.body)));
  app.post("/api/agents/flore/omar/payroll",       wrap("omar",  "payroll")      ((r)  => flore.calculatePayroll(r.body)));
  app.post("/api/agents/flore/performance",        wrap("flore", "performance")  ((r)  => flore.performanceReview(r.body)));
  app.get ("/api/agents/flore/training-plan",      wrap("flore", "training-plan")((r)  => flore.trainingPlan((r.query as any).year || new Date().getFullYear())));
  app.get ("/api/agents/flore/report-eden",        wrap("flore", "report-eden")  ((r)  => flore.reportToEden(((r.query as any).month) || new Date().toISOString().slice(0,7))));

  // ─── PAUL / CHLOÉ / KEVIN / INGRID ───────────────────────────────────
  app.get ("/api/agents/paul/dashboard",         wrap("paul",   "dashboard")  ((r)  => paul.financialDashboard(((r.query as any).period) || new Date().toISOString().slice(0,7))));
  app.get ("/api/agents/paul/report-eden",       wrap("paul",   "report-eden")((r)  => paul.reportToEden(((r.query as any).month) || (new Date().getMonth()+1), ((r.query as any).year) || new Date().getFullYear())));
  app.post("/api/agents/paul/chloe/invoice",     wrap("chloe",  "invoice")    ((r)  => chloe.processInvoice(r.body)));
  app.post("/api/agents/paul/chloe/reconcile",   wrap("chloe",  "reconcile")  ((r)  => chloe.bankReconciliation(r.body)));
  app.get ("/api/agents/paul/chloe/close",       wrap("chloe",  "close")      ((r)  => chloe.monthlyClose(((r.query as any).month) || (new Date().getMonth()+1), ((r.query as any).year) || new Date().getFullYear())));
  app.post("/api/agents/paul/kevin/recovery",    wrap("kevin",  "recovery")   ((_r) => kevin.runRecovery()));
  app.post("/api/agents/paul/kevin/negotiate",   wrap("kevin",  "negotiate")  ((r)  => kevin.negotiateSchedule(r.body)));
  app.get ("/api/agents/paul/ingrid/variance",   wrap("ingrid", "variance")   ((r)  => ingrid.varianceAnalysis(((r.query as any).period) || new Date().toISOString().slice(0,7))));
  app.get ("/api/agents/paul/ingrid/cashflow",   wrap("ingrid", "cashflow")   ((_r) => ingrid.cashForecast()));
}
