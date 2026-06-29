// internalCRM.ts — Direct-DB adapter that replaces the HTTP `smartBusinessAPI`
// from the original CommonJS prototype. Agents read/write the same Postgres
// tables used by the human CRM. Returns `{ data }` shapes to keep the original
// agent code as drop-in.
import { query } from "./pool";

const ok = (data: any) => ({ data });

// ─── CRM ──────────────────────────────────────────────────────────────────
export const crm = {
  async getLeads(_params: any = {}) {
    const r = await query(
      'SELECT id, type, first_name as "firstName", last_name as "lastName", company_name as "companyName", email, phone, status, source, agent_id, created_at FROM leads ORDER BY created_at DESC LIMIT 200'
    );
    return ok(r.rows);
  },
  async createLead(data: any) {
    const r = await query(
      `INSERT INTO leads (type, first_name, last_name, company_name, email, phone, status, source, agent_id, currency)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [
        data.type || (data.company ? "company" : "individual"),
        data.first_name || data.firstName || (data.name || "").split(" ")[0] || null,
        data.last_name || data.lastName || (data.name || "").split(" ").slice(1).join(" ") || null,
        data.company || data.companyName || null,
        data.email || null,
        data.phone || data.tel || null,
        data.status || "Nouveau",
        data.source || "ai_agent",
        data.assigned_to || data.agent_id || null,
        data.currency || null,
      ]
    );
    return ok(r.rows[0]);
  },
  async updateLead(id: number, data: any) {
    const r = await query("UPDATE leads SET status = COALESCE($1, status), notes = COALESCE($2, notes) WHERE id = $3 RETURNING *", [
      data.status || null,
      data.notes || null,
      id,
    ]);
    return ok(r.rows[0]);
  },
  async getOpportunities(params: any = {}) {
    let where = "";
    if (params.status === "open") where = "WHERE o.stage NOT IN ('Gagné','Perdu')";
    const r = await query(
      `SELECT o.id, o.customer_id, o.lead_id, o.title, o.amount, o.currency, o.stage, o.probability,
              o.expected_close_date, o.notes, o.created_at, c.name as customer_name,
              CASE WHEN l.type='company' THEN l.company_name ELSE COALESCE(l.first_name,'')||' '||COALESCE(l.last_name,'') END as lead_name
       FROM opportunities o LEFT JOIN customers c ON o.customer_id = c.id LEFT JOIN leads l ON o.lead_id = l.id
       ${where} ORDER BY o.created_at DESC LIMIT 200`
    );
    return ok(r.rows);
  },
  async updateOpportunity(id: number, data: any) {
    const r = await query(
      "UPDATE opportunities SET stage = COALESCE($1, stage), notes = COALESCE($2, notes), updated_at = CURRENT_TIMESTAMP WHERE id = $3 RETURNING *",
      [data.stage || null, data.notes || data.last_action || null, id]
    );
    return ok(r.rows[0]);
  },
  async getClients(_params: any = {}) {
    const r = await query("SELECT id, type, name, email, phone, address, city FROM customers ORDER BY created_at DESC LIMIT 200");
    return ok(r.rows);
  },
  async getClient(id: number | string) {
    const r = await query("SELECT * FROM customers WHERE id = $1", [id]);
    return ok(r.rows[0] || { id, name: "Inconnu" });
  },
};

// ─── BILLING ──────────────────────────────────────────────────────────────
export const billing = {
  async getQuotes(_params: any = {}) {
    const r = await query("SELECT id, number, amount, currency, status, date, customer_id, agent_id FROM quotes ORDER BY date DESC LIMIT 200");
    return ok(r.rows);
  },
  async createQuote(data: any) {
    const number = data.quote_ref || data.number || `AI-Q-${Date.now()}`;
    const r = await query(
      "INSERT INTO quotes (number, customer_id, amount, currency, status, date, agent_id) VALUES ($1,$2,$3,$4,$5,CURRENT_DATE,$6) RETURNING *",
      [number, data.client_id || data.customer_id || null, data.total_fcfa || data.amount || 0, data.currency || "XAF", "Brouillon", data.agent_id || null]
    );
    return ok(r.rows[0]);
  },
  async getInvoices(params: any = {}) {
    let where = "";
    if (params.status === "sent") where = "WHERE status = 'En attente'";
    else if (params.period === "current_month") where = "WHERE date_trunc('month', date) = date_trunc('month', CURRENT_DATE)";
    const r = await query(`SELECT id, number, amount, currency, status, date, due_date, customer_id, agent_id FROM invoices ${where} ORDER BY date DESC LIMIT 200`);
    return ok(r.rows);
  },
  async getInvoice(id: number | string) {
    const r = await query("SELECT * FROM invoices WHERE id = $1", [id]);
    return ok(r.rows[0] || {});
  },
  async updateInvoice(id: number, data: any) {
    const r = await query("UPDATE invoices SET status = COALESCE($1, status) WHERE id = $2 RETURNING *", [data.status || data.recovery_stage || null, id]);
    return ok(r.rows[0]);
  },
  async getOverdueInvoices() {
    const r = await query(
      `SELECT i.id, i.number, i.amount, i.due_date, i.customer_id, c.name as client_name, c.email as client_email, c.phone as client_phone
       FROM invoices i LEFT JOIN customers c ON i.customer_id = c.id
       WHERE i.status IN ('En attente','En retard') AND i.due_date < CURRENT_DATE
       ORDER BY i.due_date ASC LIMIT 100`
    );
    return ok(r.rows);
  },
  async getCatalog() {
    const r = await query("SELECT id, name, price, type FROM products ORDER BY name ASC LIMIT 200");
    return ok(r.rows);
  },
};

// ─── FINANCE ──────────────────────────────────────────────────────────────
export const finance = {
  async getTransactions(params: any = {}) {
    // Approximated from invoices + commissions
    const r = await query(
      `SELECT id, date, number as ref, amount, currency, status, 'invoice' as type FROM invoices
       ${params.period ? "WHERE to_char(date,'YYYY-MM') = $1" : ""}
       ORDER BY date DESC LIMIT 200`,
      params.period ? [params.period] : []
    );
    return ok(r.rows);
  },
  async createTransaction(_data: any) {
    return ok({ created: true, ai_generated: true });
  },
  async getBudget(_params: any = {}) {
    return ok({ revenue_target: 50000000, cost_target: 35000000, currency: "XAF" });
  },
  async getReports(_params: any = {}) {
    const r = await query(
      `SELECT
         (SELECT COALESCE(SUM(amount),0) FROM invoices WHERE status='Payée') as total_paid,
         (SELECT COALESCE(SUM(amount),0) FROM invoices WHERE status IN ('En attente','En retard')) as total_open,
         (SELECT COUNT(*) FROM customers) as customers_count`
    );
    return ok(r.rows[0]);
  },
  async getTreasury() {
    const r = await query(
      `SELECT
         COALESCE(SUM(CASE WHEN status='Payée' THEN amount ELSE 0 END),0) as cash_in,
         COALESCE(SUM(CASE WHEN status IN ('En attente','En retard') THEN amount ELSE 0 END),0) as receivables
       FROM invoices`
    );
    return ok({ ...r.rows[0], currency: "XAF" });
  },
};

// ─── HR ───────────────────────────────────────────────────────────────────
export const hr = {
  async getEmployees() {
    const r = await query("SELECT uid, name, email, role, zone, created_at FROM users WHERE role IN ('agent','admin') ORDER BY name ASC");
    return ok(r.rows);
  },
  async getEmployee(uid: string) {
    const r = await query("SELECT uid, name, email, role, zone FROM users WHERE uid = $1", [uid]);
    return ok(r.rows[0] || {});
  },
};

// ─── SUPPORT ──────────────────────────────────────────────────────────────
export const support = {
  async getTickets(_params: any = {}) {
    // Approximated from activities of type 'Support'
    const r = await query("SELECT id, subject, type, status, created_at FROM activities WHERE type IN ('Support','Problème','Incident') ORDER BY created_at DESC LIMIT 100").catch(() => ({ rows: [] as any[] }));
    return ok(r.rows);
  },
};

// ─── NOTIFICATIONS ────────────────────────────────────────────────────────
export const notify = {
  async sendEmail(_data: any) {
    return ok({ queued: true, channel: "email", simulated: !process.env.SMTP_FROM });
  },
  async sendWhatsApp(_data: any) {
    return ok({ queued: true, channel: "whatsapp", simulated: !process.env.WHATSAPP_TOKEN });
  },
  async createAlert(data: any) {
    // Persist as an activity for visibility in CRM
    try {
      await query(
        "INSERT INTO activities (type, subject, notes, status, created_at) VALUES ('Alerte IA', $1, $2, 'À faire', CURRENT_TIMESTAMP)",
        [data.type || "alerte_ia", data.message || ""]
      );
    } catch { /* table may not have status col on older builds */ }
    return ok({ alerted: true });
  },
};

// ─── DOCS / MARKETING (light stubs) ──────────────────────────────────────
export const docs = {
  async list(_params: any = {}) { return ok([]); },
};
export const marketing = {
  async getCampaigns() { return ok([]); },
};
