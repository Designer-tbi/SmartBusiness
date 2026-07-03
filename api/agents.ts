// =====================================================================
// api/agents.ts — MONOLITHIC AI Agents serverless function
// SUPERADMIN-ONLY. Isolated from api/index.ts so login can never break.
// All 13 agents + CRM adapter + routes are inlined here to avoid any
// Vercel bundling issue with sub-imports.
// =====================================================================
import express from "express";
import cookieParser from "cookie-parser";
import jwt from "jsonwebtoken";
import pg from "pg";

const JWT_SECRET = process.env.JWT_SECRET || "smart-business-secret-key";

// ─── DB pool ────────────────────────────────────────────────────────
let _pool: pg.Pool | null = null;
function pool(): pg.Pool {
  if (!_pool) {
    _pool = new pg.Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
      max: 3,
    });
  }
  return _pool;
}
async function query(text: string, params: any[] = []) {
  return pool().query(text, params);
}

// ─── Claude client (REST, no SDK) ───────────────────────────────────
const MODEL = process.env.CLAUDE_MODEL || "claude-sonnet-4-6";
const MAX_TOKENS = parseInt(process.env.CLAUDE_MAX_TOKENS || "4096", 10);
const CLAUDE_INFO = { model: MODEL, max_tokens: MAX_TOKENS, configured: !!process.env.ANTHROPIC_API_KEY };
type UserMessage = { role: "user" | "assistant"; content: string };
function toMessages(m: string | UserMessage[]): UserMessage[] { return Array.isArray(m) ? m : [{ role: "user", content: m }]; }

async function callAnthropic(body: any): Promise<any> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is missing (set it in Vercel env)");
  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
    body: JSON.stringify(body),
  });
  if (!resp.ok) throw new Error(`Anthropic ${resp.status}: ${(await resp.text().catch(() => "")).substring(0, 500)}`);
  return resp.json();
}

async function askClaude(systemPrompt: string, userMsg: string | UserMessage[], options: Record<string, unknown> = {}): Promise<string> {
  const r = await callAnthropic({ model: MODEL, max_tokens: MAX_TOKENS, system: systemPrompt, messages: toMessages(userMsg), ...options });
  const b = r.content?.[0];
  return b && b.type === "text" ? b.text : "";
}
async function askClaudeWithSearch(systemPrompt: string, userMsg: string | UserMessage[]): Promise<string> {
  const r = await callAnthropic({ model: MODEL, max_tokens: MAX_TOKENS, system: systemPrompt, messages: toMessages(userMsg), tools: [{ type: "web_search_20250305", name: "web_search" }] });
  return (r.content || []).filter((b: any) => b.type === "text").map((b: any) => b.text).join("\n");
}
async function askClaudeJSON<T = any>(systemPrompt: string, userMsg: string | UserMessage[]): Promise<T | { error: string; raw: string }> {
  const raw = await askClaude(systemPrompt + "\n\nRéponds UNIQUEMENT en JSON valide, sans balises markdown.", userMsg);
  try { return JSON.parse(raw.replace(/```json|```/g, "").trim()) as T; }
  catch { return { error: "Parsing JSON échoué", raw }; }
}

// ─── LinkedIn accounts + simulation fallback ────────────────────────
type LinkedInAccount = { agentName: string; role: string; email: string; profileUrl: string; displayName: string; headline: string; connections: number; };
const LINKEDIN_ACCOUNTS: Record<string, LinkedInAccount> = {
  eden:   { agentName: "Eden",    role: "DG",              email: "eden.dg@tbi-center.fr",         profileUrl: "https://linkedin.com/in/eden-tbi-technology",    displayName: "Eden | DG TBI",                   headline: "CEO | Transformation Digitale Afrique Centrale", connections: 843 },
  timothy:{ agentName: "Timothy MAYAKISSA", role: "Dir Commercial",  email: "timothy@tbi-center.fr",         profileUrl: "https://linkedin.com/in/timothy-mayakissa",       displayName: "Timothy MAYAKISSA | TBI",         headline: "Directeur Commercial | Digital",                 connections: 312 },
  alex:   { agentName: "Alex Robert",       role: "Prospection",     email: "alex@tbi-center.fr",            profileUrl: "https://linkedin.com/in/alex-robert-tbi",         displayName: "Alex Robert | TBI",               headline: "Business Developer B2B | CRM/ERP",               connections: 187 },
  sara:   { agentName: "Sara",    role: "Avant-vente",     email: "sara@tbi-center.fr",            profileUrl: "https://linkedin.com/in/sara-nguesso-tbi",        displayName: "Sara Nguesso | TBI",              headline: "Consultante Avant-Vente",                        connections: 143 },
  marc:   { agentName: "Marc",    role: "Pipeline",        email: "marc@tbi-center.fr",            profileUrl: "https://linkedin.com/in/marc-itoua-tbi",          displayName: "Marc Itoua | TBI",                headline: "Account Manager | Digital Congo",                connections: 201 },
  lisa:   { agentName: "Lisa",    role: "Contrats",        email: "lisa@tbi-center.fr",            profileUrl: "https://linkedin.com/in/lisa-mavoungou-tbi",      displayName: "Lisa Mavoungou | TBI",            headline: "Juriste Commercial IT | OHADA",                  connections: 98 },
  flore:  { agentName: "Flore",   role: "DRH",             email: "flore@tbi-center.fr",           profileUrl: "https://linkedin.com/in/flore-banzouzi-tbi",      displayName: "Flore Banzouzi | RH TBI",         headline: "DRH | Recrutement IT",                           connections: 256 },
  nina:   { agentName: "Nina",    role: "Recrutement",     email: "nina@tbi-center.fr",            profileUrl: "https://linkedin.com/in/nina-ondongo-tbi",        displayName: "Nina Ondongo | TBI",              headline: "Talent Acquisition",                             connections: 312 },
  omar:   { agentName: "Omar",    role: "Paie",            email: "omar@tbi-center.fr",            profileUrl: "https://linkedin.com/in/omar-tbi",                displayName: "Omar | TBI",                      headline: "Paie & Admin | SYSCOHADA",                       connections: 87 },
  paul:   { agentName: "Paul",    role: "CFO",             email: "paul@tbi-center.fr",            profileUrl: "https://linkedin.com/in/paul-lekoumou-tbi",       displayName: "Paul Lékoumou | TBI",             headline: "CFO | SYSCOHADA | TBI",                          connections: 189 },
  chloe:  { agentName: "Chloé",   role: "Compta",          email: "chloe@tbi-center.fr",           profileUrl: "https://linkedin.com/in/chloe-tbi",               displayName: "Chloé | TBI",                     headline: "Comptable SYSCOHADA",                            connections: 76 },
  kevin:  { agentName: "Kevin",   role: "Recouvrement",    email: "kevin@tbi-center.fr",           profileUrl: "https://linkedin.com/in/kevin-tbi",               displayName: "Kevin | TBI",                     headline: "Recouvrement",                                   connections: 82 },
  ingrid: { agentName: "Ingrid",  role: "Budget",          email: "ingrid@tbi-center.fr",          profileUrl: "https://linkedin.com/in/ingrid-tbi",              displayName: "Ingrid | TBI",                    headline: "Contrôle de Gestion",                            connections: 65 },
};

// LinkedIn Developer App credentials (per agent) — reads from Vercel env
type LinkedInAppCreds = { client_id: string; client_secret: string };
function linkedinCreds(agentId: string): LinkedInAppCreds | null {
  const uc = agentId.toUpperCase();
  const id = process.env[`LINKEDIN_CLIENT_ID_${uc}`];
  const secret = process.env[`LINKEDIN_CLIENT_SECRET_${uc}`];
  return id && secret ? { client_id: id, client_secret: secret } : null;
}
const LINKEDIN_REDIRECT_URI = process.env.LINKEDIN_REDIRECT_URI || "https://smart-business-sigma.vercel.app/api/agents/oauth/linkedin/callback";
const LINKEDIN_SCOPES = "openid profile w_member_social email";

// Load agent access token from DB (populated after OAuth callback)
async function liGetTokenFromDB(agentId: string): Promise<{ access_token: string; member_id?: string } | null> {
  try {
    await ensureLinkedInTokensTable();
    const r = await q("SELECT access_token, member_id, expires_at FROM agent_linkedin_tokens WHERE agent_id=$1 AND (expires_at IS NULL OR expires_at > NOW()) ORDER BY id DESC LIMIT 1", [agentId]);
    return r.rows[0] || null;
  } catch { return null; }
}
let linkedInTokensTableReady = false;
async function ensureLinkedInTokensTable() {
  if (linkedInTokensTableReady) return;
  await q(`CREATE TABLE IF NOT EXISTS agent_linkedin_tokens (
    id SERIAL PRIMARY KEY, agent_id TEXT NOT NULL, access_token TEXT NOT NULL,
    refresh_token TEXT, member_id TEXT, scope TEXT, expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
  )`);
  await q("CREATE INDEX IF NOT EXISTS idx_li_tokens_agent ON agent_linkedin_tokens(agent_id, created_at DESC)");
  linkedInTokensTableReady = true;
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function liApiCall(url: string, token: string, opts: { method?: string; body?: any } = {}): Promise<any> {
  const resp = await fetch(url, {
    method: opts.method || "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "X-Restli-Protocol-Version": "2.0.0",
      "LinkedIn-Version": "202405",
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  if (!resp.ok) throw new Error(`LinkedIn ${resp.status}: ${(await resp.text().catch(() => "")).substring(0, 400)}`);
  return resp.json().catch(() => ({}));
}

async function liSearchProspects(agentId: string, { keywords = "", location = "Brazzaville", limit = 20 } = {}) {
  const acc = LINKEDIN_ACCOUNTS[agentId]; if (!acc) throw new Error(`Unknown agent: ${agentId}`);
  const t = await liGetTokenFromDB(agentId);
  if (t?.access_token) {
    try {
      const params = new URLSearchParams({ keywords, count: String(limit) });
      const data = await liApiCall(`https://api.linkedin.com/v2/people-search?${params}`, t.access_token);
      return { agent: acc.agentName, results: data.elements || [], total: data.paging?.total || 0, live: true };
    } catch (e: any) { console.warn(`[LI ${agentId} search fallback]`, e.message); }
  }
  const mock = [
    { id: "LI001", name: "Jean-Baptiste Mbemba", title: "DG - Société Mbemba Transport", location: "Brazzaville", industry: "Transport", connections: 2 },
    { id: "LI002", name: "Odette Nkounkou",      title: "PDG - Nkounkou Commerce",       location: "Pointe-Noire", industry: "Commerce",  connections: 1 },
    { id: "LI003", name: "Pierre Moukala",       title: "DSI - Groupe Moukala",          location: "Brazzaville", industry: "Industrie", connections: 3 },
    { id: "LI004", name: "Sandrine Ibara",       title: "DAF - Hotel Ibara",             location: "Brazzaville", industry: "Hôtellerie",connections: 2 },
    { id: "LI005", name: "Clément Bouenguidi",   title: "CEO - StartUp Congo",           location: "Kinshasa",    industry: "Tech",       connections: 1 },
  ].slice(0, limit);
  return { agent: acc.agentName, results: mock, total: mock.length, simulated: true, query: keywords, location };
}
async function liSendConnection(agentId: string, targetId: string, message: string = "") {
  const acc = LINKEDIN_ACCOUNTS[agentId]!;
  const t = await liGetTokenFromDB(agentId);
  if (t?.access_token) {
    try {
      await liApiCall("https://api.linkedin.com/v2/invitations", t.access_token, { method: "POST", body: { invitee: { "com.linkedin.voyager.growth.invitation.InviteeProfile": { profileId: targetId } }, message: message.substring(0, 300) } });
      return { success: true, agent: acc.agentName, sentTo: targetId, live: true, message: message.substring(0, 300) };
    } catch (e: any) { console.warn(`[LI ${agentId} connect fallback]`, e.message); }
  }
  return { success: true, agent: acc.agentName, sentTo: targetId, simulated: true, message: message.substring(0, 300) };
}
async function liSendMessage(agentId: string, targetId: string, subject: string, body: string) {
  const acc = LINKEDIN_ACCOUNTS[agentId]!;
  const t = await liGetTokenFromDB(agentId);
  if (t?.access_token) {
    try {
      await liApiCall("https://api.linkedin.com/v2/messaging/conversations", t.access_token, { method: "POST", body: { recipients: [`urn:li:person:${targetId}`], subject, body: body.substring(0, 1900) } });
      return { success: true, agent: acc.agentName, subject, chars: body.length, live: true, sentTo: targetId };
    } catch (e: any) { console.warn(`[LI ${agentId} msg fallback]`, e.message); }
  }
  return { success: true, agent: acc.agentName, subject, chars: body.length, simulated: true, sentTo: targetId };
}
async function liPublishPost(agentId: string, text: string) {
  const acc = LINKEDIN_ACCOUNTS[agentId]!;
  const t = await liGetTokenFromDB(agentId);
  if (t?.access_token && t.member_id) {
    try {
      await liApiCall("https://api.linkedin.com/v2/ugcPosts", t.access_token, { method: "POST", body: {
        author: `urn:li:person:${t.member_id}`,
        lifecycleState: "PUBLISHED",
        specificContent: { "com.linkedin.ugc.ShareContent": { shareCommentary: { text }, shareMediaCategory: "NONE" } },
        visibility: { "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC" },
      }});
      return { success: true, agent: acc.agentName, characters: text.length, live: true };
    } catch (e: any) { console.warn(`[LI ${agentId} post fallback]`, e.message); }
  }
  return { success: true, agent: acc.agentName, characters: text.length, simulated: true };
}

// ─── COMPREHENSIVE CRM ADAPTER (all platform APIs) ──────────────────
// Each method returns { data } to keep the agent prompt code shape consistent.
const ok = (data: any) => ({ data });
const q = query;

const platform = {
  // ─── LEADS ─────────────────────────────────────
  async listLeads() {
    const r = await q(`SELECT id, type, first_name AS "firstName", last_name AS "lastName", company_name AS "companyName", email, phone, status, source, agent_id, created_at FROM leads ORDER BY created_at DESC LIMIT 500`);
    return ok(r.rows);
  },
  async createLead(d: any) {
    const r = await q(
      `INSERT INTO leads (type, first_name, last_name, company_name, email, phone, status, source, agent_id, currency, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [ d.type || (d.company || d.companyName ? "company" : "individual"),
        d.first_name || d.firstName || (d.name || "").split(" ")[0] || null,
        d.last_name || d.lastName || (d.name || "").split(" ").slice(1).join(" ") || null,
        d.company || d.companyName || null,
        d.email || null, d.phone || d.tel || null,
        d.status || "Nouveau", d.source || "ai_agent",
        d.assigned_to || d.agent_id || null, d.currency || null, d.notes || null ]
    );
    return ok(r.rows[0]);
  },
  async updateLead(id: number, d: any) {
    const r = await q(`UPDATE leads SET status = COALESCE($1, status), notes = COALESCE($2, notes), phone = COALESCE($3, phone), email = COALESCE($4, email) WHERE id = $5 RETURNING *`, [d.status || null, d.notes || null, d.phone || null, d.email || null, id]);
    return ok(r.rows[0]);
  },
  async deleteLead(id: number) { await q("DELETE FROM leads WHERE id=$1", [id]); return ok({ deleted: id }); },

  // ─── CUSTOMERS ─────────────────────────────────
  async listCustomers() { const r = await q("SELECT id, type, name, email, phone, address, city, agent_id, created_at FROM customers ORDER BY created_at DESC LIMIT 500"); return ok(r.rows); },
  async getCustomer(id: any) { const r = await q("SELECT * FROM customers WHERE id=$1", [id]); return ok(r.rows[0] || null); },
  async createCustomer(d: any) {
    const r = await q(`INSERT INTO customers (type, name, email, phone, address, city, agent_id, company_name) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [d.type || "individual", d.name, d.email || null, d.phone || null, d.address || null, d.city || null, d.agent_id || null, d.company_name || null]);
    return ok(r.rows[0]);
  },
  async updateCustomer(id: number, d: any) { const r = await q("UPDATE customers SET name=COALESCE($1,name), email=COALESCE($2,email), phone=COALESCE($3,phone), notes=COALESCE($4,notes) WHERE id=$5 RETURNING *", [d.name||null, d.email||null, d.phone||null, d.notes||null, id]); return ok(r.rows[0]); },
  async deleteCustomer(id: number) { await q("DELETE FROM customers WHERE id=$1", [id]); return ok({ deleted: id }); },

  // ─── OPPORTUNITIES ─────────────────────────────
  async listOpportunities(params: any = {}) {
    let where = ""; if (params.status === "open") where = "WHERE o.stage NOT IN ('Gagné','Perdu')";
    const r = await q(`SELECT o.*, c.name AS customer_name FROM opportunities o LEFT JOIN customers c ON o.customer_id = c.id ${where} ORDER BY o.created_at DESC LIMIT 500`);
    return ok(r.rows);
  },
  async createOpportunity(d: any) {
    const r = await q(`INSERT INTO opportunities (customer_id, lead_id, title, amount, currency, stage, probability, expected_close_date, notes, agent_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [d.customer_id||null, d.lead_id||null, d.title, d.amount||0, d.currency||"XAF", d.stage||"Nouveau", d.probability||10, d.expected_close_date||null, d.notes||null, d.agent_id||null]);
    return ok(r.rows[0]);
  },
  async updateOpportunity(id: number, d: any) { const r = await q("UPDATE opportunities SET stage=COALESCE($1,stage), notes=COALESCE($2,notes), amount=COALESCE($3,amount), probability=COALESCE($4,probability), updated_at=CURRENT_TIMESTAMP WHERE id=$5 RETURNING *", [d.stage||null, d.notes||d.last_action||null, d.amount||null, d.probability||null, id]); return ok(r.rows[0]); },
  async deleteOpportunity(id: number) { await q("DELETE FROM opportunities WHERE id=$1", [id]); return ok({ deleted: id }); },

  // ─── QUOTES ────────────────────────────────────
  async listQuotes(params: any = {}) { const where = params.status ? "WHERE status = $1" : ""; const args = params.status ? [params.status] : []; const r = await q(`SELECT id, number, amount, currency, status, date, customer_id, agent_id FROM quotes ${where} ORDER BY date DESC LIMIT 500`, args); return ok(r.rows); },
  async getQuote(id: any) { const r = await q("SELECT * FROM quotes WHERE id=$1", [id]); return ok(r.rows[0] || null); },
  async createQuote(d: any) {
    const num = d.number || d.quote_ref || `AI-Q-${Date.now()}`;
    const r = await q(`INSERT INTO quotes (number, customer_id, amount, currency, status, date, agent_id) VALUES ($1,$2,$3,$4,$5,CURRENT_DATE,$6) RETURNING *`,
      [num, d.customer_id || d.client_id || null, d.amount || d.total_fcfa || 0, d.currency || "XAF", d.status || "Brouillon", d.agent_id || null]);
    return ok(r.rows[0]);
  },
  async updateQuote(id: number, d: any) { const r = await q("UPDATE quotes SET status=COALESCE($1,status), amount=COALESCE($2,amount) WHERE id=$3 RETURNING *", [d.status||null, d.amount||null, id]); return ok(r.rows[0]); },
  async deleteQuote(id: number) { await q("DELETE FROM quotes WHERE id=$1", [id]); return ok({ deleted: id }); },

  // ─── INVOICES ──────────────────────────────────
  async listInvoices(params: any = {}) {
    let where = "";
    if (params.status === "sent") where = "WHERE status = 'En attente'";
    else if (params.period === "current_month") where = "WHERE date_trunc('month', date) = date_trunc('month', CURRENT_DATE)";
    else if (params.status) where = `WHERE status = '${String(params.status).replace(/'/g, "")}'`;
    const r = await q(`SELECT id, number, amount, currency, status, date, due_date, customer_id, agent_id FROM invoices ${where} ORDER BY date DESC LIMIT 500`);
    return ok(r.rows);
  },
  async getInvoice(id: any) { const r = await q("SELECT * FROM invoices WHERE id=$1", [id]); return ok(r.rows[0] || null); },
  async updateInvoice(id: number, d: any) { const r = await q("UPDATE invoices SET status=COALESCE($1,status), notes=COALESCE($2,notes) WHERE id=$3 RETURNING *", [d.status||d.recovery_stage||null, d.notes||null, id]); return ok(r.rows[0]); },
  async markInvoicePaid(id: number) { const r = await q("UPDATE invoices SET status='Payée', payment_status='COMPLETED', payment_date=CURRENT_TIMESTAMP WHERE id=$1 RETURNING *", [id]); return ok(r.rows[0]); },
  async listOverdueInvoices() {
    const r = await q(`SELECT i.id, i.number, i.amount, i.due_date, i.customer_id, c.name AS client_name, c.email AS client_email, c.phone AS client_phone FROM invoices i LEFT JOIN customers c ON i.customer_id = c.id WHERE i.status IN ('En attente','En retard') AND i.due_date < CURRENT_DATE ORDER BY i.due_date ASC LIMIT 200`);
    return ok(r.rows);
  },
  async deleteInvoice(id: number) { await q("DELETE FROM invoices WHERE id=$1", [id]); return ok({ deleted: id }); },

  // ─── CATALOG (Products) ────────────────────────
  async listProducts() { const r = await q("SELECT id, name, price, type, description, currency FROM products ORDER BY name ASC LIMIT 500"); return ok(r.rows); },
  async createProduct(d: any) { const r = await q("INSERT INTO products (name, price, type, description, currency) VALUES ($1,$2,$3,$4,$5) RETURNING *", [d.name, d.price||0, d.type||"service", d.description||null, d.currency||"XAF"]); return ok(r.rows[0]); },
  async updateProduct(id: number, d: any) { const r = await q("UPDATE products SET name=COALESCE($1,name), price=COALESCE($2,price), description=COALESCE($3,description) WHERE id=$4 RETURNING *", [d.name||null, d.price||null, d.description||null, id]); return ok(r.rows[0]); },
  async deleteProduct(id: number) { await q("DELETE FROM products WHERE id=$1", [id]); return ok({ deleted: id }); },

  // ─── CATEGORIES ────────────────────────────────
  async listCategories() { const r = await q("SELECT c.*, u.name AS created_by_name FROM categories c LEFT JOIN users u ON c.created_by = u.uid ORDER BY c.name ASC").catch(() => ({ rows: [] as any[] })); return ok(r.rows); },
  async createCategory(d: any) { const r = await q("INSERT INTO categories (name, created_by) VALUES ($1,$2) RETURNING *", [d.name, d.created_by||null]); return ok(r.rows[0]); },
  async deleteCategory(id: number) { await q("DELETE FROM categories WHERE id=$1", [id]); return ok({ deleted: id }); },

  // ─── PORTFOLIO ─────────────────────────────────
  async listPortfolio(categoryId?: number) { const where = categoryId ? "WHERE category_id=$1" : ""; const args = categoryId ? [categoryId] : []; const r = await q(`SELECT * FROM portfolio_items ${where} ORDER BY created_at DESC LIMIT 500`, args); return ok(r.rows); },
  async createPortfolio(d: any) { const r = await q(`INSERT INTO portfolio_items (category_id, name, address, city, tel, mail, status, agent_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`, [d.category_id, d.name, d.address||null, d.city||null, d.tel||null, d.mail||null, d.status||"nouveau", d.agent_id||null]); return ok(r.rows[0]); },
  async updatePortfolio(id: number, d: any) { const r = await q("UPDATE portfolio_items SET status=COALESCE($1,status), lost_reason=COALESCE($2,lost_reason), notes=COALESCE($3,notes) WHERE id=$4 RETURNING *", [d.status||null, d.lost_reason||null, d.notes||null, id]); return ok(r.rows[0]); },

  // ─── USERS ─────────────────────────────────────
  async listUsers() { const r = await q("SELECT uid, name, email, role, zone, created_at FROM users ORDER BY name ASC"); return ok(r.rows); },
  async getUser(uid: string) { const r = await q("SELECT uid, name, email, role, zone FROM users WHERE uid=$1", [uid]); return ok(r.rows[0] || null); },
  async listEmployees() { const r = await q("SELECT uid, name, email, role, zone FROM users WHERE role IN ('agent','admin') ORDER BY name ASC"); return ok(r.rows); },

  // ─── COMMISSIONS ───────────────────────────────
  async listCommissions() { const r = await q("SELECT * FROM commissions ORDER BY created_at DESC LIMIT 500").catch(() => ({ rows: [] as any[] })); return ok(r.rows); },

  // ─── FINANCE ───────────────────────────────────
  async financeStats(period?: string) {
    const p = period || new Date().toISOString().slice(0, 7);
    const r = await q(`SELECT
      COALESCE(SUM(CASE WHEN status='Payée' THEN amount ELSE 0 END),0) AS revenue_paid,
      COALESCE(SUM(CASE WHEN status IN ('En attente','En retard') THEN amount ELSE 0 END),0) AS receivables,
      (SELECT COUNT(*) FROM invoices WHERE to_char(date,'YYYY-MM')=$1) AS invoices_count,
      (SELECT COUNT(*) FROM opportunities WHERE stage NOT IN ('Gagné','Perdu')) AS pipeline_count,
      (SELECT COUNT(*) FROM leads WHERE status <> 'Perdu') AS active_leads
      FROM invoices WHERE to_char(date,'YYYY-MM')=$1`, [p]);
    return ok(r.rows[0] || {});
  },
  async treasury() {
    const r = await q(`SELECT COALESCE(SUM(CASE WHEN status='Payée' THEN amount ELSE 0 END),0) AS cash_in, COALESCE(SUM(CASE WHEN status IN ('En attente','En retard') THEN amount ELSE 0 END),0) AS receivables FROM invoices`);
    return ok({ ...r.rows[0], currency: "XAF" });
  },

  // ─── ACTIVITIES / TASKS ────────────────────────
  async listActivities(limit = 100) { const r = await q("SELECT * FROM activities ORDER BY created_at DESC LIMIT $1", [limit]).catch(() => ({ rows: [] as any[] })); return ok(r.rows); },
  async createActivity(d: any) {
    try {
      const r = await q("INSERT INTO activities (type, subject, notes, status, agent_id, customer_id) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *", [d.type||"Note", d.subject||null, d.notes||null, d.status||"À faire", d.agent_id||null, d.customer_id||null]);
      return ok(r.rows[0]);
    } catch { return ok({ simulated: true, ...d }); }
  },

  // ─── NOTIFICATIONS (best-effort) ───────────────
  async sendEmail(_d: any) { return ok({ queued: true, channel: "email", simulated: !process.env.SMTP_FROM }); },
  async sendWhatsApp(_d: any) { return ok({ queued: true, channel: "whatsapp", simulated: true }); },
  async createAlert(d: any) {
    try { await q("INSERT INTO activities (type, subject, notes, status) VALUES ('Alerte IA', $1, $2, 'À faire')", [d.type || "alerte_ia", d.message || ""]); } catch { /* ignore */ }
    return ok({ alerted: true });
  },

  // ─── SEARCH ────────────────────────────────────
  async searchAll(term: string) {
    const like = `%${term}%`;
    const [leads, customers, opps, quotes, invoices] = await Promise.all([
      q(`SELECT id, first_name, last_name, company_name, email FROM leads WHERE first_name ILIKE $1 OR last_name ILIKE $1 OR company_name ILIKE $1 OR email ILIKE $1 LIMIT 20`, [like]),
      q(`SELECT id, name, email FROM customers WHERE name ILIKE $1 OR email ILIKE $1 LIMIT 20`, [like]),
      q(`SELECT id, title, amount FROM opportunities WHERE title ILIKE $1 LIMIT 20`, [like]),
      q(`SELECT id, number, amount FROM quotes WHERE number ILIKE $1 LIMIT 20`, [like]),
      q(`SELECT id, number, amount FROM invoices WHERE number ILIKE $1 LIMIT 20`, [like]),
    ]);
    return ok({ leads: leads.rows, customers: customers.rows, opportunities: opps.rows, quotes: quotes.rows, invoices: invoices.rows });
  },
};

// ─── AGENT REGISTRY (metadata for UI) ───────────────────────────────
type AgentMeta = {
  id: string; name: string; role: string; email: string;
  reportsTo: string | null; level: "C-suite" | "Director" | "Specialist";
  department: "Direction" | "Commercial" | "RH" | "Finance";
  avatar: string; color: string; linkedin?: string; connections?: number;
  capabilities: { id: string; label: string; description: string; endpoint: string; method: "GET" | "POST"; needsBody?: boolean }[];
};

const AGENTS: AgentMeta[] = [
  { id: "eden",    name: "Eden",    role: "Directeur Général (CEO)",       email: "eden.dg@tbi-center.fr",         reportsTo: null,      level: "C-suite",    department: "Direction",  avatar: "👑", color: "indigo",  linkedin: "https://linkedin.com/in/eden-tbi-technology", connections: 843,
    capabilities: [
      { id: "dashboard",       label: "Dashboard exécutif",  description: "Vue agrégée toutes équipes", endpoint: "/api/agents/eden/dashboard",       method: "GET" },
      { id: "strategic-watch", label: "Veille stratégique",  description: "Veille marché Afrique Centrale", endpoint: "/api/agents/eden/strategic-watch", method: "GET" },
      { id: "board-report",    label: "Rapport CA",          description: "Rapport mensuel Conseil d'Administration", endpoint: "/api/agents/eden/board-report",  method: "POST", needsBody: true },
      { id: "delegate",        label: "Déléguer mission",    description: "Envoie mission à Timothy/Flore/Paul", endpoint: "/api/agents/eden/delegate",    method: "POST", needsBody: true },
      { id: "linkedin-post",   label: "Publier LinkedIn",    description: "Post stratégique LinkedIn", endpoint: "/api/agents/eden/linkedin-post", method: "POST", needsBody: true },
    ]},
  { id: "timothy", name: "Timothy", role: "Directeur Commercial",           email: "timothy@tbi-center.fr",         reportsTo: "eden",    level: "Director",   department: "Commercial", avatar: "💼", color: "blue",    linkedin: "https://linkedin.com/in/timothy-tbi-technology", connections: 312,
    capabilities: [
      { id: "pipeline",    label: "Analyser pipeline",       description: "Synthèse pipeline + actions sous-agents", endpoint: "/api/agents/timothy/pipeline",         method: "GET" },
      { id: "li-search",   label: "Chercher prospects LI",   description: "Recherche + qualification IA",           endpoint: "/api/agents/timothy/linkedin/search",   method: "POST", needsBody: true },
      { id: "li-outreach", label: "Outreach commercial",     description: "Message InMail personnalisé",             endpoint: "/api/agents/timothy/linkedin/outreach", method: "POST", needsBody: true },
      { id: "li-post",     label: "Post LinkedIn",           description: "Publication commerciale",                 endpoint: "/api/agents/timothy/linkedin/post",     method: "POST", needsBody: true },
      { id: "quote",       label: "Générer devis",           description: "Sara génère une proposition",             endpoint: "/api/agents/timothy/quote",             method: "POST", needsBody: true },
    ]},
  { id: "alex",  name: "Alex",  role: "Agent Prospection B2B",     email: "alex@tbi-center.fr",  reportsTo: "timothy", level: "Specialist", department: "Commercial", avatar: "🎯", color: "blue",  connections: 187, capabilities: [
    { id: "prospect", label: "Prospecter secteur", description: "Trouve prospects par secteur", endpoint: "/api/agents/timothy/alex/prospect", method: "POST", needsBody: true },
  ]},
  { id: "sara",  name: "Sara",  role: "Agent Devis & Avant-vente", email: "sara@tbi-center.fr",  reportsTo: "timothy", level: "Specialist", department: "Commercial", avatar: "✍️", color: "blue",  connections: 143, capabilities: [
    { id: "proposal", label: "Proposition commerciale", description: "Proposition + message LI", endpoint: "/api/agents/timothy/sara/proposal", method: "POST", needsBody: true },
  ]},
  { id: "marc",  name: "Marc",  role: "Agent Pipeline & Relances", email: "marc@tbi-center.fr",  reportsTo: "timothy", level: "Specialist", department: "Commercial", avatar: "📞", color: "blue",  connections: 201, capabilities: [
    { id: "followups", label: "Lancer relances", description: "Détecte deals silencieux et relance", endpoint: "/api/agents/timothy/marc/followups", method: "POST" },
  ]},
  { id: "lisa",  name: "Lisa",  role: "Agent Contrats & Juridique",email: "lisa@tbi-center.fr",  reportsTo: "timothy", level: "Specialist", department: "Commercial", avatar: "⚖️", color: "blue",  connections: 98,  capabilities: [
    { id: "contract", label: "Rédiger contrat", description: "Contrat de prestation OHADA", endpoint: "/api/agents/timothy/lisa/contract", method: "POST", needsBody: true },
  ]},
  { id: "flore", name: "Flore", role: "Responsable RH",             email: "flore@tbi-center.fr", reportsTo: "eden",    level: "Director",   department: "RH",         avatar: "👥", color: "rose",  linkedin: "https://linkedin.com/in/flore-banzouzi-tbi", connections: 256,
    capabilities: [
      { id: "job-post",      label: "Offre LinkedIn",         description: "Publie offre + Nina cherche",   endpoint: "/api/agents/flore/linkedin/job-post", method: "POST", needsBody: true },
      { id: "screen-cvs",    label: "Présélection CVs",       description: "Classement IA de CVs",         endpoint: "/api/agents/flore/screen-cvs",        method: "POST", needsBody: true },
      { id: "training-plan", label: "Plan formation",         description: "Roadmap trimestrielle",         endpoint: "/api/agents/flore/training-plan",     method: "GET" },
      { id: "report-eden",   label: "Rapport pour Eden",      description: "Synthèse RH pour Eden",         endpoint: "/api/agents/flore/report-eden",       method: "GET" },
    ]},
  { id: "nina",  name: "Nina",  role: "Agent Recrutement", email: "nina@tbi-center.fr", reportsTo: "flore", level: "Specialist", department: "RH", avatar: "🔍", color: "rose", connections: 312, capabilities: [
    { id: "headhunt", label: "Chasse de têtes", description: "Recherche LI + approche", endpoint: "/api/agents/flore/nina/headhunt", method: "POST", needsBody: true },
  ]},
  { id: "omar",  name: "Omar",  role: "Agent Paie",        email: "omar@tbi-center.fr", reportsTo: "flore", level: "Specialist", department: "RH", avatar: "💶", color: "rose", capabilities: [
    { id: "payroll", label: "Calculer paie", description: "Fiches de paie SYSCOHADA + CNSS", endpoint: "/api/agents/flore/omar/payroll", method: "POST", needsBody: true },
  ]},
  { id: "paul",  name: "Paul",  role: "Directeur Financier (CFO)",   email: "paul@tbi-center.fr", reportsTo: "eden", level: "Director", department: "Finance", avatar: "💰", color: "emerald", linkedin: "https://linkedin.com/in/paul-lekoumou-tbi", connections: 189,
    capabilities: [
      { id: "dashboard",   label: "Dashboard financier", description: "État financier global",  endpoint: "/api/agents/paul/dashboard",   method: "GET" },
      { id: "report-eden", label: "Rapport pour Eden",   description: "Synthèse finance mensuelle", endpoint: "/api/agents/paul/report-eden", method: "GET" },
    ]},
  { id: "chloe", name: "Chloé", role: "Agent Comptabilité", email: "chloe@tbi-center.fr", reportsTo: "paul", level: "Specialist", department: "Finance", avatar: "📒", color: "emerald", capabilities: [
    { id: "invoice", label: "Saisir écriture", description: "Écriture comptable SYSCOHADA", endpoint: "/api/agents/paul/chloe/invoice", method: "POST", needsBody: true },
    { id: "close",   label: "Clôture mensuelle", description: "Préparation clôture", endpoint: "/api/agents/paul/chloe/close",   method: "GET" },
  ]},
  { id: "kevin", name: "Kevin", role: "Agent Recouvrement", email: "kevin@tbi-center.fr", reportsTo: "paul", level: "Specialist", department: "Finance", avatar: "📞", color: "emerald", capabilities: [
    { id: "recovery", label: "Cycle recouvrement", description: "Relances factures impayées", endpoint: "/api/agents/paul/kevin/recovery", method: "POST" },
  ]},
  { id: "ingrid",name: "Ingrid",role: "Agent Budget & Contrôle", email: "ingrid@tbi-center.fr", reportsTo: "paul", level: "Specialist", department: "Finance", avatar: "📊", color: "emerald", capabilities: [
    { id: "variance", label: "Analyse écarts",   description: "Budget vs réel + alertes", endpoint: "/api/agents/paul/ingrid/variance", method: "GET" },
    { id: "cashflow", label: "Prévision trésorerie", description: "Prévisions 3 mois", endpoint: "/api/agents/paul/ingrid/cashflow", method: "GET" },
  ]},
];

// ─── DB run logging ────────────────────────────────────────────────
let runsTableReady = false;
async function ensureAgentRunsTable() {
  if (runsTableReady) return;
  await q(`CREATE TABLE IF NOT EXISTS agent_runs (
    id SERIAL PRIMARY KEY, agent_id TEXT NOT NULL, capability TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'success', input JSONB, output JSONB,
    error_message TEXT, triggered_by TEXT, duration_ms INTEGER,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
  )`);
  await q("CREATE INDEX IF NOT EXISTS idx_agent_runs_agent ON agent_runs(agent_id, created_at DESC)");
  runsTableReady = true;
}
async function logRun(o: { agent_id: string; capability: string; status: "success"|"error"; input?: any; output?: any; error_message?: string; triggered_by?: string; duration_ms?: number }) {
  try {
    await ensureAgentRunsTable();
    await q(`INSERT INTO agent_runs (agent_id, capability, status, input, output, error_message, triggered_by, duration_ms) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [o.agent_id, o.capability, o.status, o.input?JSON.stringify(o.input):null, o.output?JSON.stringify(o.output).substring(0,50000):null, o.error_message||null, o.triggered_by||null, o.duration_ms||null]);
  } catch (e) { console.error("[logRun]", e); }
}
async function withRun<T>(m: { agent_id: string; capability: string; input?: any; triggered_by?: string }, fn: () => Promise<T>): Promise<T> {
  const t0 = Date.now();
  try { const out = await fn(); await logRun({ ...m, status: "success", output: out, duration_ms: Date.now()-t0 }); return out; }
  catch (err: any) { await logRun({ ...m, status: "error", error_message: err?.message||String(err), duration_ms: Date.now()-t0 }); throw err; }
}

// ─── EDEN (CEO) ─────────────────────────────────────────────────────
const EDEN_SYS = `Tu es EDEN, DG de TBI Technology (Congo, RDC). Tu diriges Timothy (Commercial), Flore (RH) et Paul (CFO). Vision long terme, données chiffrées, orienté croissance Afrique. Montants en FCFA.`;

async function edenDashboard() {
  const [opps, inv, tr, over, emp] = await Promise.allSettled([platform.listOpportunities({ status: "open" }), platform.listInvoices({ period: "current_month" }), platform.treasury(), platform.listOverdueInvoices(), platform.listEmployees()]);
  const g = (r: any) => r.status === "fulfilled" ? r.value?.data : {};
  return askClaudeJSON(EDEN_SYS, `Génère le tableau de bord exécutif :
COMMERCIAL: ${JSON.stringify(g(opps)).substring(0, 600)}
FACTURATION: ${JSON.stringify(g(inv)).substring(0, 500)}
TRÉSORERIE: ${JSON.stringify(g(tr))}
IMPAYÉS: ${JSON.stringify(g(over)).substring(0, 400)}
EFFECTIFS: ${JSON.stringify(g(emp)).substring(0, 400)}

Retourne JSON: { date, health_score, company_health, kpis:{revenue_mtd_fcfa,pipeline_value_fcfa,cash_position_fcfa,overdue_fcfa,headcount}, team_reports:{timothy,flore,paul}, alerts:[{severity,owner,message,action}], week_priorities:[], executive_summary }`);
}
async function edenDelegate({ to, mission, context = "", deadline = "" }: any) {
  return askClaude(EDEN_SYS, `Rédige une instruction officielle pour ${String(to).toUpperCase()} — Mission: ${mission}. Contexte: ${context}. Échéance: ${deadline||"asap"}. Inclure: objectif mesurable, ressources, indicateurs, reporting.`);
}
async function edenBoardReport(month: any, year: any) {
  const dash = await edenDashboard().catch(() => ({}));
  return askClaude(EDEN_SYS, `Rapport mensuel Conseil d'Administration TBI ${month}/${year}. Dashboard: ${JSON.stringify(dash).substring(0, 1500)}. Structure: 1.FAITS MARQUANTS 2.PERFORMANCE 3.COMMERCIAL 4.RH 5.RISQUES 6.OPPORTUNITÉS 7.DÉCISIONS 8.OBJECTIFS. 400 mots max.`);
}
async function edenStrategicWatch() {
  return askClaudeWithSearch(EDEN_SYS, `Veille stratégique TBI Technology: 1) Appels d'offres IT Congo/RDC 2) Concurrence 3) Tendances tech Afrique 2026 4) Réglementations ARPCE 5) Financement BAD/AFD. 300 mots + top 3 actions.`);
}
async function edenLinkedInPost(topic: string) {
  const content = await askClaude(EDEN_SYS, `Post LinkedIn stratégique CEO TBI sur "${topic}". 1re personne, leadership Afrique Centrale, insight, question. 800-1000 chars. 3-5 hashtags. Post direct sans intro.`);
  const r = await liPublishPost("eden", content);
  return { content, linkedin_result: r };
}

// ─── TIMOTHY (Commercial) ───────────────────────────────────────────
const TIMOTHY_SYS = `Tu es TIMOTHY, Directeur Commercial de TBI Technology. Tu coordonnes Alex (Prospection), Sara (Devis), Marc (Pipeline), Lisa (Contrats). Services TBI (FCFA): Site web 500K-1.5M, e-commerce 1.5M-4M, mobile 3M-12M, CRM 800K-3M, ERP 2M-10M, cybersécurité 300K-1M, formation 150K-500K/j.`;

async function timothyPipeline() {
  const { data: opps } = await platform.listOpportunities({ status: "open" });
  return askClaudeJSON(TIMOTHY_SYS, `Analyse pipeline: ${JSON.stringify(opps).substring(0, 1500)}
Retourne JSON: { pipeline_health, total_value_fcfa, weighted_forecast_fcfa, deals_count, by_stage:[{stage,count,value}], hot_deals:[{company,value,probability,action}], at_risk:[{company,reason,action}], sub_agent_actions:{alex,sara,marc,lisa}, report_to_eden }`);
}
async function timothyFindProspects({ keywords = "directeur PME Congo", location = "Brazzaville", limit = 10 } = {}) {
  const search = await liSearchProspects("timothy", { keywords, location, limit });
  const qual = await askClaudeJSON(TIMOTHY_SYS, `Qualifie ces prospects pour TBI Technology: ${JSON.stringify(search.results)}
Retourne JSON: { prospects:[{id,name,title,company,score,priority,pain_points:[],recommended_service,connection_message,assign_to}] }`);
  return { search, qualification: qual };
}
async function timothyOutreach({ targetIds = [], serviceType = "Digitalisation", customContext = "" }: any) {
  const tmpl = await askClaude(TIMOTHY_SYS, `Message InMail LinkedIn pour "${serviceType}". Contexte: ${customContext}. Utilise {{PRENOM}}. 150 mots max. Bénéfice concret. CTA (appel 20 min). Message uniquement.`);
  const results: any[] = [];
  for (const id of targetIds) {
    const c = await platform.getCustomer(id).catch(() => null);
    const first = c?.data?.name?.split(" ")[0] || "Bonjour";
    const msg = tmpl.replace(/\{\{PRENOM\}\}/g, first);
    results.push(await liSendMessage("timothy", id, `Proposition TBI — ${serviceType}`, msg));
    await sleep(500);
  }
  return { sent: results.length, results };
}
async function timothyLinkedInPost(topic: string) {
  const post = await askClaude(TIMOTHY_SYS, `Post LinkedIn commercial 1re personne, Timothy DirCom TBI, sujet "${topic}". Réussite client ou insight Congo/RDC. 700-1100 chars. 3-5 hashtags. Post direct.`);
  return { post, result: await liPublishPost("timothy", post) };
}
async function timothyGenerateQuote({ clientId, services = [], requirements = "" }: any) {
  const { data: client } = await platform.getCustomer(clientId).catch(() => ({ data: null }));
  const quote: any = await askClaudeJSON(TIMOTHY_SYS, `Sara génère devis. Client: ${JSON.stringify(client)} Services: ${services.join(", ")} Besoins: ${requirements}
Retourne JSON: { quote_ref, client, line_items:[{service,description,price_fcfa,weeks}], subtotal_fcfa, discount_pct, total_fcfa, payment_terms:[], validity_days, next_step }`);
  await platform.createQuote({ customer_id: clientId, amount: quote?.total_fcfa || 0, number: quote?.quote_ref, agent_id: null }).catch(() => {});
  return quote;
}

// ─── ALEX (Prospection) ─────────────────────────────────────────────
async function alexProspect({ sector, location = "Brazzaville", limit = 15 }: any) {
  const search = await liSearchProspects("alex", { keywords: `directeur ${sector} ${location}`, location, limit });
  const qual: any = await askClaudeJSON(TIMOTHY_SYS, `Qualifie prospects secteur ${sector}: ${JSON.stringify(search.results)}
Retourne JSON: { hot_prospects:[{id,name,company,score,pain_point,service_fit,invitation_message,next_step}], summary }`);
  const invs: any[] = [];
  for (const p of qual.hot_prospects || []) {
    invs.push(await liSendConnection("alex", p.id, p.invitation_message));
    await platform.createLead({ name: p.name, company: p.company, source: "linkedin_alex", assigned_to: "timothy" }).catch(() => {});
    await sleep(400);
  }
  return { search, qualification: qual, invitations_sent: invs.length };
}

// ─── SARA (Avant-vente) ─────────────────────────────────────────────
async function saraProposal({ prospectId, prospectName, company, service, linkedinContext = "" }: any) {
  const p: any = await askClaudeJSON(TIMOTHY_SYS, `Génère proposition pour ${prospectName} - ${company}, service ${service}. Contexte: ${linkedinContext}
Retourne JSON: { proposal_title, executive_summary, problem_statement, proposed_solution, deliverables:[], timeline_weeks, investment:{total_fcfa,payment_schedule:[{milestone,pct,fcfa}]}, roi_estimate, why_tbi, next_step, linkedin_followup_message }`);
  if (p.linkedin_followup_message && prospectId) await liSendMessage("sara", prospectId, `Proposition TBI — ${service}`, p.linkedin_followup_message).catch(() => {});
  return p;
}

// ─── MARC (Pipeline) ────────────────────────────────────────────────
async function marcRunFollowups() {
  const { data: opps } = await platform.listOpportunities({ status: "open" });
  const plan: any = await askClaudeJSON(TIMOTHY_SYS, `Planifie relances pipeline: ${JSON.stringify(opps).substring(0, 1500)}
Retourne JSON: { followups:[{opp_id,company,days_silent,stage,channel,message,urgency}], pipeline_summary }`);
  let sent = 0;
  for (const fu of plan.followups || []) {
    if (fu.opp_id) await platform.updateOpportunity(fu.opp_id, { last_action: "relance_marc_ia" }).catch(() => {});
    sent++;
  }
  return { plan, sent };
}

// ─── LISA (Contrats) ────────────────────────────────────────────────
async function lisaContract({ clientName, clientAddress, services, totalFCFA, timeline }: any) {
  return askClaude(TIMOTHY_SYS, `Rédige contrat prestation services IT OHADA — Client ${clientName} (${clientAddress}), Services ${JSON.stringify(services)}, Montant ${totalFCFA} FCFA, Délai ${timeline}. Objet/périmètre, financier (acompte 30%), PI (cession après paiement), garantie 3 mois, résiliation, confidentialité, force majeure.`);
}

// ─── FLORE (DRH) ────────────────────────────────────────────────────
const FLORE_SYS = `Tu es FLORE, DRH de TBI Technology. Coordonne Nina (Recrutement) et Omar (Paie). Cadre: Code Travail congolais, CNSS 4% salarié 16.75% patronal, INPP 1.5%. Salaires: dev junior 250-400K, senior 500-900K, CTO 800K-1.2M, commercial 200-350K+comm.`;

async function florePostJob({ position, level, requirements = [] }: any) {
  const jp: any = await askClaudeJSON(FLORE_SYS, `Offre LinkedIn poste ${position} niveau ${level}. Exigences: ${requirements.join(", ")}
Retourne JSON: { linkedin_post, job_description:{title,contract,location,salary_range,responsibilities:[],requirements:[],nice_to_have:[],benefits:[]} }`);
  return { job_description: jp.job_description, linkedin_published: await liPublishPost("flore", jp.linkedin_post) };
}
async function ninaHeadhunt({ position, targetProfile }: any) {
  const s = await liSearchProspects("nina", { keywords: targetProfile, location: "Congo OR RDC", limit: 20 });
  const sl: any = await askClaudeJSON(FLORE_SYS, `Nina shortlist pour ${position}: ${JSON.stringify(s.results)}
Retourne JSON: { shortlist:[{id,name,current_role,fit_score,why_good_fit,approach_message}] }`);
  const contacted: any[] = [];
  for (const c of sl.shortlist || []) { contacted.push(await liSendConnection("nina", c.id, c.approach_message)); await sleep(400); }
  return { search_total: s.results?.length || 0, shortlist: sl.shortlist, contacted: contacted.length };
}
async function floreScreenCVs({ position, cvList }: any) {
  return askClaudeJSON(FLORE_SYS, `Nina présélectionne pour ${position}: ${JSON.stringify(cvList)}
Retourne JSON: { ranking:[{candidate,tier,score,strengths:[],gaps:[],interview_questions:[],salary_expectation,recommend}], flore_summary, shortlist_count }`);
}
async function omarPayroll({ month, year, employees }: any) {
  return askClaudeJSON(FLORE_SYS, `Omar calcule paies ${month}/${year} TBI. Employés: ${JSON.stringify(employees)}. CNSS 4% sal 16.75% pat, INPP 1.5%, IR barème congolais.
Retourne JSON: { payroll_month, employees:[{name,gross_fcfa,cnss_employee,inpp,ir,net_fcfa,employer_charge,total_cost}], totals:{gross_total,net_total,employer_charges_total,cnss_declaration}, omar_notes }`);
}
async function floreTrainingPlan(year: any) {
  const { data: emp } = await platform.listEmployees();
  return askClaude(FLORE_SYS, `Plan formation ${year} TBI Technology. Équipe: ${JSON.stringify(emp).substring(0, 600)}. Tendances 2026: IA/Claude, Odoo 17, React Native, cybersécurité ARPCE. Par trimestre + budget FCFA + certifications.`);
}
async function floreReportEden(month: string) {
  const { data: emp } = await platform.listEmployees();
  return askClaudeJSON(FLORE_SYS, `Rapport mensuel RH pour Eden ${month}. Effectifs: ${JSON.stringify(emp).substring(0, 500)}
Retourne JSON: { headcount, new_hires, departures, open_positions, linkedin_activity:{nina_connections,jobs_posted,candidates_in_pipeline}, payroll_total_fcfa, highlights:[], risks:[], eden_summary }`);
}

// ─── PAUL (CFO) ─────────────────────────────────────────────────────
const PAUL_SYS = `Tu es PAUL, CFO de TBI Technology. Coordonne Chloé (Compta SYSCOHADA), Kevin (Recouvrement), Ingrid (Budget). SYSCOHADA, TVA 18%, XAF. Compte 706 CA, 411 Clients, 4441 TVA collectée. Marge cible 14%.`;

async function paulDashboard(period?: string) {
  const p = period || new Date().toISOString().slice(0, 7);
  const [stats, tr, over] = await Promise.all([platform.financeStats(p), platform.treasury(), platform.listOverdueInvoices()]);
  return askClaudeJSON(PAUL_SYS, `Tableau financier ${p}. Stats: ${JSON.stringify(stats.data)} Trésorerie: ${JSON.stringify(tr.data)} Impayés (${over.data.length}): ${JSON.stringify(over.data.slice(0, 5))}
Retourne JSON: { period, ca_ht_fcfa, marge_nette_pct, tresorerie_fcfa, creances_clients_fcfa, sub_agent_status:{chloe,kevin,ingrid}, alerts:[{type,severity,message,action}], eden_summary }`);
}
async function paulReportEden(month: any, year: any) {
  const dash = await paulDashboard(`${year}-${String(month).padStart(2, "0")}`).catch(() => ({}));
  return askClaude(PAUL_SYS, `Rapport financier mensuel Paul pour Eden ${month}/${year}. ${JSON.stringify(dash).substring(0, 1200)}. 300 mots: 1.Perf vs objectifs 2.Trésorerie & alertes 3.Actions Chloé/Kevin/Ingrid 4.Attention Eden 5.Prévisions.`);
}
async function chloeInvoice({ type, vendor, amount, date, description }: any) {
  return askClaudeJSON(PAUL_SYS, `Écriture SYSCOHADA — Type ${type}, Tiers ${vendor}, ${amount} FCFA, ${date}. ${description}
Retourne JSON: { journal, date, libelle, ecritures:[{compte,libelle,debit,credit}], tva_collectee, tva_deductible, ht, ttc, paul_note }`);
}
async function chloeClose(month: any, year: any) {
  const { data: inv } = await platform.listInvoices({ period: `${year}-${String(month).padStart(2, "0")}` });
  return askClaude(PAUL_SYS, `Clôture mensuelle ${month}/${year}. Factures: ${JSON.stringify(inv).substring(0, 800)}. CA HT, TVA à déclarer, résultat, écritures clôture, attentions expert-comptable.`);
}
async function kevinRecovery() {
  const { data: overs } = await platform.listOverdueInvoices();
  const results: any[] = [];
  for (const inv of overs) {
    const days = Math.floor((Date.now() - new Date(inv.due_date).getTime()) / 86400000);
    const a: any = await askClaudeJSON(PAUL_SYS, `Facture impayée ${inv.client_name} ${inv.amount} FCFA retard ${days}j.
Retourne JSON: { action, channel, penalites_fcfa, total_reclame_fcfa, message, objet, escalade_paul }`);
    await platform.updateInvoice(inv.id, { recovery_stage: a.action }).catch(() => {});
    if (a.escalade_paul) await platform.createAlert({ type: "recouvrement_escalade", message: `Paul — ${inv.client_name} : ${inv.amount} FCFA (${days}j)` }).catch(() => {});
    results.push({ invoice: inv.id, client: inv.client_name, action: a.action });
  }
  return { processed: overs.length, results };
}
async function ingridVariance(period?: string) {
  const p = period || new Date().toISOString().slice(0, 7);
  const stats = await platform.financeStats(p);
  return askClaudeJSON(PAUL_SYS, `Ingrid analyse écarts ${p}. Réalisé: ${JSON.stringify(stats.data)}
Retourne JSON: { period, ca_budget, ca_reel, ca_ecart_pct, charges_budget, charges_reel, charges_ecart_pct, marge_budget_pct, marge_reel_pct, postes_en_depassement:[{poste,budget,reel,ecart_pct}], actions_correctives:[], alertes:[], paul_summary }`);
}
async function ingridCashflow() {
  const [tr, pipe, dues] = await Promise.all([platform.treasury(), platform.listOpportunities({ status: "open" }), platform.listInvoices({ status: "sent" })]);
  return askClaudeJSON(PAUL_SYS, `Prévisions trésorerie 3 mois. Trésorerie: ${JSON.stringify(tr.data)} Pipeline: ${JSON.stringify(pipe.data).substring(0, 500)} Factures: ${JSON.stringify(dues.data).substring(0, 400)}
Retourne JSON: { tresorerie_actuelle_fcfa, previsions:[{mois,encaissements,decaissements,solde_fin,alerte}], mois_critique, financement_necessaire, recommandations:[], paul_briefing }`);
}

// =====================================================================
// EXPRESS APP + ROUTES
// =====================================================================
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

// Diagnostic (no auth)
app.get("/api/agents/ping", (_req, res) => {
  res.json({ ok: true, message: "agents monolith loaded", claude: CLAUDE_INFO });
});

// ─── LinkedIn OAuth 3-legged flow ──────────────────────────────────
// Start OAuth: agents visit /api/agents/oauth/linkedin/:agentId/start (must be logged in as superadmin)
// LinkedIn redirects to /api/agents/oauth/linkedin/callback with ?code=... which we exchange for an access token.

app.get("/api/agents/oauth/linkedin/:agentId/start", (req, res) => {
  // Read token from cookie manually (no requireSuperadmin middleware here because we redirect out to LinkedIn)
  const token = req.cookies?.token;
  if (!token) return res.status(401).send("Login superadmin requis");
  let user: any = null;
  try { user = jwt.verify(token, JWT_SECRET); } catch { return res.status(403).send("Session invalide"); }
  if (user.role !== "superadmin") return res.status(403).send("Superadmin requis");

  const agentId = req.params.agentId;
  const creds = linkedinCreds(agentId);
  if (!creds) return res.status(400).send(`Aucun client_id/secret LinkedIn configuré pour ${agentId}. Ajouter LINKEDIN_CLIENT_ID_${agentId.toUpperCase()} et LINKEDIN_CLIENT_SECRET_${agentId.toUpperCase()} dans Vercel env.`);

  const state = Buffer.from(JSON.stringify({ agentId, ts: Date.now() })).toString("base64url");
  const url = new URL("https://www.linkedin.com/oauth/v2/authorization");
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", creds.client_id);
  url.searchParams.set("redirect_uri", LINKEDIN_REDIRECT_URI);
  url.searchParams.set("scope", LINKEDIN_SCOPES);
  url.searchParams.set("state", state);
  res.redirect(url.toString());
});

app.get("/api/agents/oauth/linkedin/callback", async (req, res) => {
  try {
    const code = String(req.query.code || "");
    const state = String(req.query.state || "");
    if (!code || !state) return res.status(400).send("Paramètres manquants");
    let parsed: any = null;
    try { parsed = JSON.parse(Buffer.from(state, "base64url").toString("utf8")); } catch { return res.status(400).send("state invalide"); }
    const agentId = parsed.agentId as string;
    const creds = linkedinCreds(agentId);
    if (!creds) return res.status(400).send(`Credentials LinkedIn absents pour ${agentId}`);

    // Exchange code for access token
    const tokenResp = await fetch("https://www.linkedin.com/oauth/v2/accessToken", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code, redirect_uri: LINKEDIN_REDIRECT_URI,
        client_id: creds.client_id, client_secret: creds.client_secret,
      }),
    });
    const tokenData: any = await tokenResp.json();
    if (!tokenResp.ok || !tokenData.access_token) return res.status(500).send(`Erreur token LinkedIn: ${JSON.stringify(tokenData)}`);

    // Fetch member id (userinfo endpoint with openid scope)
    let memberId: string | undefined;
    try {
      const meResp = await fetch("https://api.linkedin.com/v2/userinfo", { headers: { Authorization: `Bearer ${tokenData.access_token}` } });
      const me: any = await meResp.json();
      memberId = me.sub || undefined;
    } catch { /* non-fatal */ }

    const expiresAt = tokenData.expires_in ? new Date(Date.now() + Number(tokenData.expires_in) * 1000) : null;
    await ensureLinkedInTokensTable();
    await q(
      `INSERT INTO agent_linkedin_tokens (agent_id, access_token, refresh_token, member_id, scope, expires_at) VALUES ($1,$2,$3,$4,$5,$6)`,
      [agentId, tokenData.access_token, tokenData.refresh_token || null, memberId || null, tokenData.scope || null, expiresAt]
    );
    // Return simple HTML success page
    res.send(`<!doctype html><html><body style="font-family:system-ui;padding:40px;text-align:center"><h1 style="color:#059669">✓ LinkedIn connecté pour l'agent ${agentId}</h1><p>Token stocké. Vous pouvez fermer cet onglet.</p><p><a href="/ai-team">← Retour à l'équipe IA</a></p></body></html>`);
  } catch (err: any) {
    console.error("[LinkedIn callback]", err);
    res.status(500).send(`Erreur callback: ${err?.message || String(err)}`);
  }
});

// Check LinkedIn OAuth status for each agent
app.get("/api/agents/linkedin/status", requireSuperadmin, async (_req, res) => {
  try {
    await ensureLinkedInTokensTable();
    const r = await q("SELECT DISTINCT ON (agent_id) agent_id, member_id, expires_at, created_at FROM agent_linkedin_tokens ORDER BY agent_id, created_at DESC");
    const map: Record<string, any> = {};
    for (const row of r.rows) {
      map[row.agent_id] = { connected: !row.expires_at || new Date(row.expires_at) > new Date(), member_id: row.member_id, expires_at: row.expires_at, connected_at: row.created_at };
    }
    // Include agents with configured creds but not yet connected
    for (const id of Object.keys(LINKEDIN_ACCOUNTS)) {
      if (!map[id]) map[id] = { connected: false, has_credentials: !!linkedinCreds(id) };
      else map[id].has_credentials = !!linkedinCreds(id);
    }
    res.json({ success: true, agents: map });
  } catch (err: any) { res.status(500).json({ error: err?.message || String(err) }); }
});

app.use("/api/agents", (req, _res, next) => { ensureAgentRunsTable().catch(() => {}); next(); }, requireSuperadmin);

const wrap = (agentId: string, capability: string) => (fn: (req: express.Request) => Promise<any>) => async (req: express.Request, res: express.Response) => {
  try {
    const out = await withRun({ agent_id: agentId, capability, input: { ...(req.body || {}), ...(req.query || {}) }, triggered_by: (req as any).user?.uid }, () => fn(req));
    res.json({ success: true, agent: agentId, capability, data: out });
  } catch (err: any) {
    console.error(`[${agentId}/${capability}]`, err?.message || err);
    res.status(500).json({ success: false, agent: agentId, capability, error: err?.message || "Server error" });
  }
};

// ─── META ─────────────────────────────────────────────────────────
app.get("/api/agents/team", (_req, res) => {
  res.json({ success: true, claude: CLAUDE_INFO, total: AGENTS.length, agents: AGENTS, linkedin_accounts: Object.entries(LINKEDIN_ACCOUNTS).map(([id, a]) => ({ id, ...a })) });
});
app.get("/api/agents/runs/recent", async (req, res) => {
  try {
    const { agent_id, limit = 50 } = req.query as any;
    const args: any[] = []; let where = "";
    if (agent_id) { args.push(agent_id); where = "WHERE agent_id = $1"; }
    args.push(Number(limit) || 50);
    const r = await q(`SELECT id, agent_id, capability, status, error_message, duration_ms, created_at, CASE WHEN LENGTH(output::text) > 2000 THEN '<<truncated>>' ELSE output END AS output_preview FROM agent_runs ${where} ORDER BY created_at DESC LIMIT $${args.length}`, args);
    res.json({ success: true, runs: r.rows });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});
app.get("/api/agents/runs/:id", async (req, res) => {
  try { const r = await q("SELECT * FROM agent_runs WHERE id=$1", [req.params.id]); if (r.rows.length === 0) return res.status(404).json({ error: "not found" }); res.json({ success: true, run: r.rows[0] }); }
  catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});
// ─── EDEN ─────────────────────────────────────────────────────────
app.get ("/api/agents/eden/dashboard",       wrap("eden","dashboard")      ((_r) => edenDashboard()));
app.post("/api/agents/eden/delegate",        wrap("eden","delegate")       ((r)  => edenDelegate(r.body)));
app.post("/api/agents/eden/board-report",    wrap("eden","board-report")   ((r)  => edenBoardReport(r.body.month, r.body.year)));
app.get ("/api/agents/eden/strategic-watch", wrap("eden","strategic-watch")((_r) => edenStrategicWatch()));
app.post("/api/agents/eden/linkedin-post",   wrap("eden","linkedin-post")  ((r)  => edenLinkedInPost(r.body.topic)));

// ─── TIMOTHY + sub-agents ─────────────────────────────────────────
app.get ("/api/agents/timothy/pipeline",         wrap("timothy","pipeline")       ((_r) => timothyPipeline()));
app.post("/api/agents/timothy/linkedin/search",  wrap("timothy","li-search")      ((r)  => timothyFindProspects(r.body)));
app.post("/api/agents/timothy/linkedin/outreach",wrap("timothy","li-outreach")    ((r)  => timothyOutreach(r.body)));
app.post("/api/agents/timothy/linkedin/post",    wrap("timothy","li-post")        ((r)  => timothyLinkedInPost(r.body.topic)));
app.post("/api/agents/timothy/quote",            wrap("timothy","quote")          ((r)  => timothyGenerateQuote(r.body)));
app.post("/api/agents/timothy/alex/prospect",    wrap("alex","prospect")          ((r)  => alexProspect(r.body)));
app.post("/api/agents/timothy/sara/proposal",    wrap("sara","proposal")          ((r)  => saraProposal(r.body)));
app.post("/api/agents/timothy/marc/followups",   wrap("marc","followups")         ((_r) => marcRunFollowups()));
app.post("/api/agents/timothy/lisa/contract",    wrap("lisa","contract")          ((r)  => lisaContract(r.body)));

// ─── FLORE + sub-agents ───────────────────────────────────────────
app.post("/api/agents/flore/linkedin/job-post", wrap("flore","job-post")     ((r) => florePostJob(r.body)));
app.post("/api/agents/flore/nina/headhunt",     wrap("nina","headhunt")      ((r) => ninaHeadhunt(r.body)));
app.post("/api/agents/flore/screen-cvs",        wrap("flore","screen-cvs")   ((r) => floreScreenCVs(r.body)));
app.post("/api/agents/flore/omar/payroll",      wrap("omar","payroll")       ((r) => omarPayroll(r.body)));
app.get ("/api/agents/flore/training-plan",     wrap("flore","training-plan")((r) => floreTrainingPlan((r.query as any).year || new Date().getFullYear())));
app.get ("/api/agents/flore/report-eden",       wrap("flore","report-eden")  ((r) => floreReportEden(((r.query as any).month) || new Date().toISOString().slice(0,7))));

// ─── PAUL + sub-agents ────────────────────────────────────────────
app.get ("/api/agents/paul/dashboard",         wrap("paul","dashboard")   ((r) => paulDashboard((r.query as any).period)));
app.get ("/api/agents/paul/report-eden",       wrap("paul","report-eden") ((r) => paulReportEden(((r.query as any).month)||(new Date().getMonth()+1), ((r.query as any).year)||new Date().getFullYear())));
app.post("/api/agents/paul/chloe/invoice",     wrap("chloe","invoice")    ((r) => chloeInvoice(r.body)));
app.get ("/api/agents/paul/chloe/close",       wrap("chloe","close")      ((r) => chloeClose(((r.query as any).month)||(new Date().getMonth()+1), ((r.query as any).year)||new Date().getFullYear())));
app.post("/api/agents/paul/kevin/recovery",    wrap("kevin","recovery")   ((_r) => kevinRecovery()));
app.get ("/api/agents/paul/ingrid/variance",   wrap("ingrid","variance")  ((r) => ingridVariance((r.query as any).period)));
app.get ("/api/agents/paul/ingrid/cashflow",   wrap("ingrid","cashflow")  ((_r) => ingridCashflow()));

// ─── PLATFORM APIs (any agent can access ALL) ─────────────────────
// Exposes the full CRM adapter so agents (via UI or another agent) can list/read/write anything.
app.get   ("/api/agents/platform/leads",           async (_r, res) => res.json(await platform.listLeads()));
app.post  ("/api/agents/platform/leads",           async (r,  res) => res.json(await platform.createLead(r.body)));
app.patch ("/api/agents/platform/leads/:id",       async (r,  res) => res.json(await platform.updateLead(Number(r.params.id), r.body)));
app.delete("/api/agents/platform/leads/:id",       async (r,  res) => res.json(await platform.deleteLead(Number(r.params.id))));

app.get   ("/api/agents/platform/customers",       async (_r, res) => res.json(await platform.listCustomers()));
app.get   ("/api/agents/platform/customers/:id",   async (r,  res) => res.json(await platform.getCustomer(r.params.id)));
app.post  ("/api/agents/platform/customers",       async (r,  res) => res.json(await platform.createCustomer(r.body)));
app.patch ("/api/agents/platform/customers/:id",   async (r,  res) => res.json(await platform.updateCustomer(Number(r.params.id), r.body)));
app.delete("/api/agents/platform/customers/:id",   async (r,  res) => res.json(await platform.deleteCustomer(Number(r.params.id))));

app.get   ("/api/agents/platform/opportunities",   async (r,  res) => res.json(await platform.listOpportunities(r.query)));
app.post  ("/api/agents/platform/opportunities",   async (r,  res) => res.json(await platform.createOpportunity(r.body)));
app.patch ("/api/agents/platform/opportunities/:id",async(r,  res) => res.json(await platform.updateOpportunity(Number(r.params.id), r.body)));
app.delete("/api/agents/platform/opportunities/:id",async(r,  res) => res.json(await platform.deleteOpportunity(Number(r.params.id))));

app.get   ("/api/agents/platform/quotes",          async (r,  res) => res.json(await platform.listQuotes(r.query)));
app.get   ("/api/agents/platform/quotes/:id",      async (r,  res) => res.json(await platform.getQuote(r.params.id)));
app.post  ("/api/agents/platform/quotes",          async (r,  res) => res.json(await platform.createQuote(r.body)));
app.patch ("/api/agents/platform/quotes/:id",      async (r,  res) => res.json(await platform.updateQuote(Number(r.params.id), r.body)));
app.delete("/api/agents/platform/quotes/:id",      async (r,  res) => res.json(await platform.deleteQuote(Number(r.params.id))));

app.get   ("/api/agents/platform/invoices",        async (r,  res) => res.json(await platform.listInvoices(r.query)));
app.get   ("/api/agents/platform/invoices/:id",    async (r,  res) => res.json(await platform.getInvoice(r.params.id)));
app.patch ("/api/agents/platform/invoices/:id",    async (r,  res) => res.json(await platform.updateInvoice(Number(r.params.id), r.body)));
app.post  ("/api/agents/platform/invoices/:id/paid", async (r,res) => res.json(await platform.markInvoicePaid(Number(r.params.id))));
app.get   ("/api/agents/platform/invoices/overdue",async (_r, res) => res.json(await platform.listOverdueInvoices()));
app.delete("/api/agents/platform/invoices/:id",    async (r,  res) => res.json(await platform.deleteInvoice(Number(r.params.id))));

app.get   ("/api/agents/platform/products",        async (_r, res) => res.json(await platform.listProducts()));
app.post  ("/api/agents/platform/products",        async (r,  res) => res.json(await platform.createProduct(r.body)));
app.patch ("/api/agents/platform/products/:id",    async (r,  res) => res.json(await platform.updateProduct(Number(r.params.id), r.body)));
app.delete("/api/agents/platform/products/:id",    async (r,  res) => res.json(await platform.deleteProduct(Number(r.params.id))));

app.get   ("/api/agents/platform/categories",      async (_r, res) => res.json(await platform.listCategories()));
app.post  ("/api/agents/platform/categories",      async (r,  res) => res.json(await platform.createCategory(r.body)));
app.delete("/api/agents/platform/categories/:id",  async (r,  res) => res.json(await platform.deleteCategory(Number(r.params.id))));

app.get   ("/api/agents/platform/portfolio",       async (r,  res) => res.json(await platform.listPortfolio(r.query.categoryId ? Number(r.query.categoryId) : undefined)));
app.post  ("/api/agents/platform/portfolio",       async (r,  res) => res.json(await platform.createPortfolio(r.body)));
app.patch ("/api/agents/platform/portfolio/:id",   async (r,  res) => res.json(await platform.updatePortfolio(Number(r.params.id), r.body)));

app.get   ("/api/agents/platform/users",           async (_r, res) => res.json(await platform.listUsers()));
app.get   ("/api/agents/platform/users/:uid",      async (r,  res) => res.json(await platform.getUser(r.params.uid)));
app.get   ("/api/agents/platform/employees",       async (_r, res) => res.json(await platform.listEmployees()));

app.get   ("/api/agents/platform/commissions",     async (_r, res) => res.json(await platform.listCommissions()));
app.get   ("/api/agents/platform/finance/stats",   async (r,  res) => res.json(await platform.financeStats(r.query.period as any)));
app.get   ("/api/agents/platform/finance/treasury",async (_r, res) => res.json(await platform.treasury()));

app.get   ("/api/agents/platform/activities",      async (_r, res) => res.json(await platform.listActivities()));
app.post  ("/api/agents/platform/activities",      async (r,  res) => res.json(await platform.createActivity(r.body)));

app.get   ("/api/agents/platform/search",          async (r,  res) => res.json(await platform.searchAll(String(r.query.q || ""))));

// ─── Error handler ────────────────────────────────────────────────
app.use((err: any, _req: any, res: any, _next: any) => {
  console.error("[agents fn] unhandled:", err);
  res.status(500).json({ error: "Internal", detail: err?.message || String(err) });
});

export default app;
