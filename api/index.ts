import express from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import cookieParser from "cookie-parser";

import { query, ensureDbInitialized } from "./_lib/db";
import { JWT_SECRET, authenticateToken } from "./_lib/auth";
import { emailTransporter, FROM_EMAIL } from "./_lib/mailer";
import {
  createActivity,
  autoCreateInvoiceFromQuote,
  autoCreateCommissionFromInvoice,
  autoConvertLeadToCustomer,
  autoCreateOpportunityFromLead,
  autoSyncOpportunityFromQuote,
} from "./_lib/automation";
import {
  PAYPAL_BASE,
  getPayPalAccessToken,
  convertToPayPalCurrency,
  ensurePayPalPlanForProduct,
} from "./_lib/paypal";
import { handleSmartDeskProvisioningForQuote } from "./_lib/smartdesk";

// Create Express app
const app = express();
app.use(express.json({ limit: '50mb' }));
app.use(cookieParser());

// Auto-init middleware
app.use(async (req, res, next) => {
  await ensureDbInitialized();
  next();
});

// Health Check
app.get("/api/health", async (req, res) => {
  try {
    await query("SELECT 1");
    res.json({ status: "ok", database: "postgres" });
  } catch (err: any) {
    res.json({ status: "error", database: "disconnected", error: err.message });
  }
});

// Auth Routes
app.post("/api/auth/register", async (req, res) => {
  const { email, password, name } = req.body;
  if (!email || !password || !name) return res.status(400).json({ error: "Missing required fields" });
  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const uid = Math.random().toString(36).substring(2, 15);
    const role = email.toLowerCase() === 'eden@tbi-center.fr' ? 'admin' : 'agent';
    const result = await query(
      "INSERT INTO users (uid, email, password, name, role) VALUES ($1, $2, $3, $4, $5) RETURNING uid, email, name, role",
      [uid, email, hashedPassword, name, role]
    );
    const user = result.rows[0];
    const token = jwt.sign({ uid: user.uid, role: user.role }, JWT_SECRET);
    res.cookie("token", token, { httpOnly: true, secure: true, sameSite: 'lax' });
    res.json(user);
  } catch (err: any) {
    res.status(400).json({ error: "Email already exists or invalid data" });
  }
});

app.post("/api/auth/login", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: "Email and password are required" });
  try {
    const result = await query("SELECT * FROM users WHERE email = $1", [email]);
    if (result.rows.length === 0) return res.status(400).json({ error: "User not found" });
    const user = result.rows[0];

    // Check if account is active
    if (user.is_active === false) {
      return res.status(403).json({ error: "Compte désactivé. Contactez l'administrateur." });
    }

    // Auto-deactivate expired demo accounts (15 days after first login)
    if (user.account_type === 'demo' && user.first_login_at) {
      const firstLogin = new Date(user.first_login_at);
      const now = new Date();
      const diffDays = (now.getTime() - firstLogin.getTime()) / (1000 * 60 * 60 * 24);
      if (diffDays >= 15) {
        await query("UPDATE users SET is_active = false, deactivated_at = CURRENT_TIMESTAMP WHERE uid = $1", [user.uid]);
        return res.status(403).json({ error: "Votre période d'essai de 15 jours est terminée. Contactez l'administrateur pour activer votre compte." });
      }
    }

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) return res.status(400).json({ error: "Invalid password" });

    // Set first_login_at if not set
    if (!user.first_login_at) {
      await query("UPDATE users SET first_login_at = CURRENT_TIMESTAMP WHERE uid = $1", [user.uid]);
    }

    const token = jwt.sign({ uid: user.uid, role: user.role }, JWT_SECRET);
    res.cookie("token", token, { httpOnly: true, secure: true, sameSite: 'lax' });
    // Log session
    try {
      const ip = req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || req.ip || 'unknown';
      const ua = req.headers['user-agent'] || 'unknown';
      await query("INSERT INTO sessions (user_uid, user_email, user_name, user_role, ip_address, user_agent) VALUES ($1,$2,$3,$4,$5,$6)", [user.uid, user.email, user.name, user.role, typeof ip === 'string' ? ip : String(ip), ua]);
    } catch (e) { console.error("Session log error:", e); }
    res.json({ uid: user.uid, email: user.email, name: user.name, role: user.role });
  } catch (err: any) {
    console.error("Login error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

app.post("/api/auth/logout", (req, res) => { res.clearCookie("token"); res.json({ success: true }); });

app.get("/api/auth/me", authenticateToken, async (req: any, res) => {
  try {
    const result = await query('SELECT uid, email, name, role, zone, account_type as "accountType", is_active as "isActive", first_login_at as "firstLoginAt", company_name as "companyName", created_at as "createdAt" FROM users WHERE uid = $1', [req.user.uid]);
    if (result.rows.length === 0) return res.status(404).json({ error: "User not found" });
    const user = result.rows[0];
    // Calculate days remaining for demo
    if (user.accountType === 'demo' && user.firstLoginAt) {
      const diffDays = (new Date().getTime() - new Date(user.firstLoginAt).getTime()) / (1000 * 60 * 60 * 24);
      (user as any).demoRemainingDays = Math.max(0, Math.ceil(15 - diffDays));
    }
    res.json(user);
  } catch (err) { res.status(500).json({ error: "Server error" }); }
});

// Categories
app.get("/api/categories", authenticateToken, async (req, res) => {
  try { res.json((await query("SELECT * FROM categories ORDER BY name ASC")).rows); } catch (err) { res.status(500).json({ error: "Server error" }); }
});
app.post("/api/categories", authenticateToken, async (req: any, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: "Name is required" });
  try {
    const result = await query("INSERT INTO categories (name) VALUES ($1) ON CONFLICT (name) DO NOTHING RETURNING *", [name.toUpperCase()]);
    if (result.rows.length === 0) { const existing = await query("SELECT * FROM categories WHERE name = $1", [name.toUpperCase()]); return res.json(existing.rows[0]); }
    res.status(201).json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: "Server error" }); }
});

// Portfolio Items
app.get("/api/portfolio-items", authenticateToken, async (req: any, res) => {
  try {
    let q = "SELECT * FROM portfolio_items"; let params: any[] = [];
    if (req.user.role !== 'admin' && req.user.role !== 'superadmin') { q += " WHERE (agent_id = $1 OR agent_id IS NULL)"; params.push(req.user.uid); }
    q += " ORDER BY name ASC";
    res.json((await query(q, params)).rows);
  } catch (err) { res.status(500).json({ error: "Server error" }); }
});
app.get("/api/categories/:categoryId/items", authenticateToken, async (req: any, res) => {
  try {
    let q = "SELECT * FROM portfolio_items WHERE category_id = $1"; let params: any[] = [req.params.categoryId];
    if (req.user.role !== 'admin' && req.user.role !== 'superadmin') { q += " AND (agent_id = $2 OR agent_id IS NULL)"; params.push(req.user.uid); }
    q += " ORDER BY name ASC";
    res.json((await query(q, params)).rows);
  } catch (err) { res.status(500).json({ error: "Server error" }); }
});
app.post("/api/portfolio-items", authenticateToken, async (req: any, res) => {
  const { category_id, name, sub_type, address, city, bp, tel, fax, mail, web, niu } = req.body;
  if (!category_id || !name) return res.status(400).json({ error: "Category ID and Name are required" });
  try { res.status(201).json((await query("INSERT INTO portfolio_items (category_id, name, sub_type, address, city, bp, tel, fax, mail, web, niu, agent_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *", [category_id, name, sub_type, address, city, bp, tel, fax, mail, web, niu, req.user.uid])).rows[0]); } catch (err) { res.status(500).json({ error: "Server error" }); }
});
app.delete("/api/portfolio-items/:id", authenticateToken, async (req, res) => {
  try { await query("DELETE FROM portfolio_items WHERE id = $1", [req.params.id]); res.json({ success: true }); } catch (err) { res.status(500).json({ error: "Server error" }); }
});
app.delete("/api/categories/:id", authenticateToken, async (req: any, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'superadmin') return res.status(403).json({ error: "Forbidden" });
  try {
    await query("DELETE FROM portfolio_items WHERE category_id = $1", [req.params.id]);
    await query("DELETE FROM categories WHERE id = $1", [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: "Server error" }); }
});

// Users (Superadmin/Admin)
app.get("/api/users", authenticateToken, async (req: any, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'superadmin') return res.status(403).json({ error: "Forbidden" });
  try { res.json((await query('SELECT uid, email, name, role, account_type as "accountType", is_active as "isActive", first_login_at as "firstLoginAt", deactivated_at as "deactivatedAt", company_name as "companyName", zone, created_at as "createdAt" FROM users ORDER BY zone, created_at DESC')).rows.map(u => {
    if (u.accountType === 'demo' && u.firstLoginAt) {
      const diffDays = (new Date().getTime() - new Date(u.firstLoginAt).getTime()) / (1000 * 60 * 60 * 24);
      (u as any).demoRemainingDays = Math.max(0, Math.ceil(15 - diffDays));
    }
    return u;
  })); } catch (err) { res.status(500).json({ error: "Server error" }); }
});
app.post("/api/users", authenticateToken, async (req: any, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'superadmin') return res.status(403).json({ error: "Forbidden" });
  const { email, password, name, role, accountType, companyName, zone } = req.body;
  if (!email || !password || !name || !role) return res.status(400).json({ error: "Missing required fields" });
  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const uid = Math.random().toString(36).substring(2, 15);
    res.json((await query('INSERT INTO users (uid, email, password, name, role, account_type, company_name, zone, is_active) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,true) RETURNING uid, email, name, role, account_type as "accountType", company_name as "companyName", zone, is_active as "isActive", created_at as "createdAt"', [uid, email, hashedPassword, name, role, accountType || 'production', companyName || null, zone || 'CG'])).rows[0]);
  } catch (err) { res.status(400).json({ error: "Email already exists" }); }
});
app.put("/api/users/:uid/role", authenticateToken, async (req: any, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'superadmin') return res.status(403).json({ error: "Forbidden" });
  const { uid } = req.params; const { role } = req.body;
  try {
    const u = await query("SELECT email FROM users WHERE uid = $1", [uid]);
    if (u.rows.length > 0 && u.rows[0].email === 'eden@tbi-center.fr') return res.status(400).json({ error: "Cannot change main admin role" });
    await query("UPDATE users SET role = $1 WHERE uid = $2", [role, uid]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: "Server error" }); }
});
app.put("/api/users/:uid/toggle-active", authenticateToken, async (req: any, res) => {
  if (req.user.role !== 'superadmin') return res.status(403).json({ error: "Forbidden" });
  const { uid } = req.params;
  try {
    const u = await query("SELECT is_active, email FROM users WHERE uid = $1", [uid]);
    if (u.rows.length === 0) return res.status(404).json({ error: "User not found" });
    if (u.rows[0].email === 'eden@tbi-center.fr') return res.status(400).json({ error: "Cannot deactivate superadmin" });
    const newActive = !u.rows[0].is_active;
    await query("UPDATE users SET is_active = $1, deactivated_at = $2 WHERE uid = $3", [newActive, newActive ? null : new Date().toISOString(), uid]);
    res.json({ success: true, isActive: newActive });
  } catch (err) { res.status(500).json({ error: "Server error" }); }
});
app.put("/api/users/:uid/account-type", authenticateToken, async (req: any, res) => {
  if (req.user.role !== 'superadmin') return res.status(403).json({ error: "Forbidden" });
  const { uid } = req.params; const { accountType } = req.body;
  try {
    await query("UPDATE users SET account_type = $1 WHERE uid = $2", [accountType, uid]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: "Server error" }); }
});
app.delete("/api/users/:uid", authenticateToken, async (req: any, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'superadmin') return res.status(403).json({ error: "Forbidden" });
  const { uid } = req.params;
  try {
    const u = await query("SELECT email FROM users WHERE uid = $1", [uid]);
    if (u.rows.length > 0 && u.rows[0].email === 'eden@tbi-center.fr') return res.status(400).json({ error: "Cannot delete main admin" });
    await query("DELETE FROM users WHERE uid = $1", [uid]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: "Server error" }); }
});

// Admin Stats
app.get("/api/admin/stats", authenticateToken, async (req: any, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'superadmin') return res.status(403).json({ error: "Forbidden" });
  try {
    const [callsRes, customersRes, usersRes] = await Promise.all([
      query("SELECT status, agent_name FROM calls"), query("SELECT count(*) FROM customers"), query("SELECT uid, name FROM users WHERE role = 'agent'")
    ]);
    const calls = callsRes.rows; const totalCustomers = parseInt(customersRes.rows[0].count); const agents = usersRes.rows;
    res.json({ totalCalls: calls.length, completedCalls: calls.filter(c => c.status === 'completed').length, pendingCalls: calls.filter(c => c.status === 'pending').length, totalCustomers, agentPerformance: agents.map(a => ({ name: a.name, calls: calls.filter(c => c.agent_name === a.name).length, completed: calls.filter(c => c.agent_name === a.name && c.status === 'completed').length })) });
  } catch (err) { res.status(500).json({ error: "Server error" }); }
});

// Agent Performance Stats — individual or admin overview
app.get("/api/stats/agent", authenticateToken, async (req: any, res) => {
  try {
    const agentId = req.user.uid;
    const isAdmin = req.user.role === 'admin' || req.user.role === 'superadmin';
    const filter = isAdmin && req.query.agentId ? String(req.query.agentId) : agentId;

    const [leadsR, custR, oppR, quotesR, invR, actR, commR] = await Promise.all([
      query("SELECT COUNT(*)::int as total, COUNT(*) FILTER (WHERE status='Converti')::int as converted FROM leads WHERE agent_id = $1", [filter]),
      query("SELECT COUNT(*)::int as total FROM customers WHERE agent_id = $1", [filter]),
      query("SELECT COUNT(*)::int as total, COALESCE(SUM(amount),0) as pipeline FROM opportunities WHERE customer_id IN (SELECT id FROM customers WHERE agent_id = $1) OR lead_id IN (SELECT id FROM leads WHERE agent_id = $1)", [filter]),
      query("SELECT COUNT(*)::int as total, COUNT(*) FILTER (WHERE status='Signé')::int as signed, COUNT(*) FILTER (WHERE status='Envoyé')::int as sent, COALESCE(SUM(amount) FILTER (WHERE status='Signé'),0) as signed_amount, COALESCE(SUM(amount),0) as total_amount FROM quotes WHERE agent_id = $1", [filter]),
      query("SELECT COUNT(*)::int as total, COUNT(*) FILTER (WHERE status='Payée')::int as paid, COALESCE(SUM(amount) FILTER (WHERE status='Payée'),0) as revenue, COALESCE(SUM(amount),0) as total_amount FROM invoices WHERE agent_id = $1", [filter]),
      query("SELECT type, COUNT(*)::int as count FROM activities WHERE agent_id = $1 GROUP BY type", [filter]),
      query("SELECT COALESCE(SUM(amount),0) as total, COALESCE(SUM(amount) FILTER (WHERE status='Payé'),0) as paid FROM commissions WHERE agent_id = $1", [filter]),
    ]);

    const quoteRow = quotesR.rows[0];
    const conversionRate = quoteRow.total > 0 ? Math.round((quoteRow.signed / quoteRow.total) * 100) : 0;
    const activitiesByType: Record<string, number> = {};
    for (const r of actR.rows) activitiesByType[r.type] = r.count;

    res.json({
      pipeline: {
        leads: leadsR.rows[0].total,
        leadsConverted: leadsR.rows[0].converted,
        customers: custR.rows[0].total,
        opportunities: oppR.rows[0].total,
        opportunitiesValue: Number(oppR.rows[0].pipeline),
      },
      quotes: {
        total: quoteRow.total,
        signed: quoteRow.signed,
        sent: quoteRow.sent,
        signedAmount: Number(quoteRow.signed_amount),
        totalAmount: Number(quoteRow.total_amount),
        conversionRate,
      },
      revenue: {
        invoiced: Number(invR.rows[0].total_amount),
        paid: Number(invR.rows[0].revenue),
        invoicesPaid: invR.rows[0].paid,
        invoicesTotal: invR.rows[0].total,
      },
      activities: activitiesByType,
      commissions: {
        total: Number(commR.rows[0].total),
        paid: Number(commR.rows[0].paid),
      },
    });
  } catch (err: any) {
    console.error("Agent stats error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// Admin: All Agents Performance Comparison
app.get("/api/stats/agents-overview", authenticateToken, async (req: any, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'superadmin') return res.status(403).json({ error: "Forbidden" });
  try {
    const agents = (await query("SELECT uid, name, email, zone, account_type FROM users WHERE role = 'agent' ORDER BY name")).rows;
    const data = await Promise.all(agents.map(async (a: any) => {
      const [quotesR, invR, actR, leadsR] = await Promise.all([
        query("SELECT COUNT(*)::int as total, COUNT(*) FILTER (WHERE status='Signé')::int as signed, COALESCE(SUM(amount) FILTER (WHERE status='Signé'),0) as signed_amount FROM quotes WHERE agent_id = $1", [a.uid]),
        query("SELECT COALESCE(SUM(amount) FILTER (WHERE status='Payée'),0) as revenue, COUNT(*) FILTER (WHERE status='Payée')::int as paid FROM invoices WHERE agent_id = $1", [a.uid]),
        query("SELECT COUNT(*)::int as total, COUNT(*) FILTER (WHERE type='Appel')::int as calls, COUNT(*) FILTER (WHERE type='RDV' OR type='Réunion')::int as meetings FROM activities WHERE agent_id = $1", [a.uid]),
        query("SELECT COUNT(*)::int as total FROM leads WHERE agent_id = $1", [a.uid]),
      ]);
      const q = quotesR.rows[0];
      const conversionRate = q.total > 0 ? Math.round((q.signed / q.total) * 100) : 0;
      return {
        uid: a.uid,
        name: a.name,
        email: a.email,
        zone: a.zone,
        accountType: a.account_type,
        revenue: Number(invR.rows[0].revenue),
        invoicesPaid: invR.rows[0].paid,
        quotesSigned: q.signed,
        quotesTotal: q.total,
        conversionRate,
        calls: actR.rows[0].calls,
        meetings: actR.rows[0].meetings,
        activities: actR.rows[0].total,
        leads: leadsR.rows[0].total,
        signedAmount: Number(q.signed_amount),
      };
    }));
    res.json(data);
  } catch (err: any) {
    console.error("Agents overview error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// Customers (agent sees own, admin sees all)
app.get("/api/customers", authenticateToken, async (req: any, res) => {
  try {
    let q = 'SELECT id, type, first_name as "firstName", last_name as "lastName", company_name as "companyName", name, email, phone, address, city, industry, agent_id, created_at as "createdAt", updated_at as "updatedAt" FROM customers';
    let params: any[] = [];
    if (req.user.role !== 'admin' && req.user.role !== 'superadmin') { q += ' WHERE agent_id = $1'; params.push(req.user.uid); }
    q += ' ORDER BY created_at DESC';
    res.json((await query(q, params)).rows);
  } catch (err) { res.status(500).json({ error: "Server error" }); }
});
app.post("/api/customers", authenticateToken, async (req: any, res) => {
  const { type, firstName, lastName, companyName, email, phone, address, city, industry, currency } = req.body;
  const name = type === 'company' ? companyName : `${firstName} ${lastName}`;
  try {
    const created = (await query('INSERT INTO customers (type, first_name, last_name, company_name, name, email, phone, address, city, industry, currency, agent_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id, type, first_name as "firstName", last_name as "lastName", company_name as "companyName", name, email, phone, address, city, industry, currency, created_at as "createdAt"', [type || 'individual', firstName, lastName, companyName, name, email, phone, address, city, industry, currency || null, req.user.uid])).rows[0];
    // AUTO: schedule onboarding RDV
    await createActivity({ type: 'RDV', subject: `Onboarding: ${name}`, agentId: req.user.uid, customerId: created.id, daysFromNow: 2, notes: 'Premier RDV de prise en main avec le nouveau client.' });
    res.status(201).json(created);
  } catch (err) { res.status(500).json({ error: "Server error" }); }
});
app.put("/api/customers/:id", authenticateToken, async (req, res) => {
  const { id } = req.params; const { type, firstName, lastName, companyName, email, phone, address, city, industry } = req.body;
  const name = type === 'company' ? companyName : `${firstName} ${lastName}`;
  try {
    const result = await query('UPDATE customers SET type=$1, first_name=$2, last_name=$3, company_name=$4, name=$5, email=$6, phone=$7, address=$8, city=$9, industry=$10, updated_at=CURRENT_TIMESTAMP WHERE id=$11 RETURNING id, type, first_name as "firstName", last_name as "lastName", company_name as "companyName", name, email, phone, address, city, industry, updated_at as "updatedAt"', [type, firstName, lastName, companyName, name, email, phone, address, city, industry, id]);
    if (result.rows.length === 0) return res.status(404).json({ error: "Customer not found" });
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: "Server error" }); }
});
app.delete("/api/customers/:id", authenticateToken, async (req: any, res) => {
  const { id } = req.params;
  try {
    // CASCADE manuel : détacher tout ce qui référence ce client (FK contraintes)
    await query("UPDATE quotes SET customer_id = NULL WHERE customer_id = $1", [id]);
    await query("UPDATE invoices SET customer_id = NULL WHERE customer_id = $1", [id]);
    await query("UPDATE opportunities SET customer_id = NULL WHERE customer_id = $1", [id]);
    await query("UPDATE activities SET customer_id = NULL WHERE customer_id = $1", [id]);
    await query("UPDATE projects SET customer_id = NULL WHERE customer_id = $1", [id]);
    await query("DELETE FROM comments WHERE entity_type = 'customer' AND entity_id = $1", [id]).catch(() => {});
    await query("DELETE FROM documents WHERE customer_id = $1", [id]).catch(() => {});
    const r = await query("DELETE FROM customers WHERE id = $1", [id]);
    if (r.rowCount === 0) return res.status(404).json({ error: "Client introuvable" });
    res.json({ success: true });
  } catch (err: any) {
    console.error("Delete customer error:", err);
    res.status(500).json({ error: "Erreur de suppression: " + (err.message || 'inconnue') });
  }
});

// Leads (agent sees own, admin sees all)
app.get("/api/leads", authenticateToken, async (req: any, res) => {
  try {
    let q = 'SELECT id, type, first_name as "firstName", last_name as "lastName", company_name as "companyName", email, phone, source, status, notes, address, city, niu, agent_id, created_at as "createdAt", updated_at as "updatedAt" FROM leads';
    let params: any[] = [];
    if (req.user.role !== 'admin' && req.user.role !== 'superadmin') { q += ' WHERE agent_id = $1'; params.push(req.user.uid); }
    q += ' ORDER BY created_at DESC';
    res.json((await query(q, params)).rows);
  } catch (err) { res.status(500).json({ error: "Server error" }); }
});
app.post("/api/leads", authenticateToken, async (req: any, res) => {
  const { type, firstName, lastName, companyName, email, phone, source, status, notes, address, city, currency } = req.body;
  try {
    const result = await query('INSERT INTO leads (type, first_name, last_name, company_name, email, phone, source, status, notes, address, city, currency, agent_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id, type, first_name as "firstName", last_name as "lastName", company_name as "companyName", email, phone, source, status, notes, address, city, currency, created_at as "createdAt"', [type || 'individual', firstName, lastName, companyName, email, phone, source, status || 'Nouveau', notes, address, city, currency || null, req.user.uid]);
    const leadId = result.rows[0].id;
    try { const d = new Date(); d.setDate(d.getDate() + 1); await query("INSERT INTO activities (type, subject, lead_id, agent_id, status, date, notes) VALUES ($1,$2,$3,$4,$5,$6,$7)", ['Appel', `Premier contact - Lead #${leadId}`, leadId, req.user.uid, 'À faire', d.toISOString(), `Contacter: ${type === 'company' ? companyName : firstName + ' ' + lastName}`]); } catch (e) {}
    res.status(201).json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: "Server error" }); }
});
app.put("/api/leads/:id", authenticateToken, async (req: any, res) => {
  const { id } = req.params; const { type, firstName, lastName, companyName, email, phone, source, status, notes, address, city, currency } = req.body;
  try {
    const result = await query('UPDATE leads SET type=$1, first_name=$2, last_name=$3, company_name=$4, email=$5, phone=$6, source=$7, status=$8, notes=$9, address=$10, city=$11, currency=$12, updated_at=CURRENT_TIMESTAMP WHERE id=$13 RETURNING id, type, first_name as "firstName", last_name as "lastName", company_name as "companyName", email, phone, source, status, notes, address, city, currency, agent_id as "agentId", updated_at as "updatedAt"', [type, firstName, lastName, companyName, email, phone, source, status, notes, address, city, currency || null, id]);
    if (result.rows.length === 0) return res.status(404).json({ error: "Lead not found" });
    const lead = result.rows[0];
    let opportunityId: number | null = null;
    // AUTO: status='Qualifié' → create opportunity
    if (status === 'Qualifié') {
      opportunityId = await autoCreateOpportunityFromLead(parseInt(id), lead.agentId || req.user.uid);
    }
    // AUTO: status='Converti' → create customer (and link opportunity)
    let customerId: number | null = null;
    if (status === 'Converti') {
      customerId = await autoConvertLeadToCustomer(parseInt(id));
    }
    res.json({ ...lead, autoOpportunityId: opportunityId, autoCustomerId: customerId });
  } catch (err) { res.status(500).json({ error: "Server error" }); }
});
app.delete("/api/leads/:id", authenticateToken, async (req, res) => {
  try { await query("DELETE FROM leads WHERE id = $1", [req.params.id]); res.json({ success: true }); } catch (err) { res.status(500).json({ error: "Server error" }); }
});

// Opportunities
app.get("/api/opportunities", authenticateToken, async (req: any, res) => {
  try {
    let q = 'SELECT o.id, o.customer_id as "customerId", o.lead_id as "leadId", o.title, o.amount, o.currency, o.stage, o.probability, o.expected_close_date as "expectedCloseDate", o.notes, o.created_at as "createdAt", o.updated_at as "updatedAt", c.name as "customerName", c.agent_id as "customerAgentId", l.agent_id as "leadAgentId", CASE WHEN l.type = \'company\' THEN l.company_name ELSE COALESCE(l.first_name,\'\') || \' \' || COALESCE(l.last_name,\'\') END as "leadName" FROM opportunities o LEFT JOIN customers c ON o.customer_id = c.id LEFT JOIN leads l ON o.lead_id = l.id';
    let params: any[] = [];
    if (req.user.role !== 'admin' && req.user.role !== 'superadmin') {
      q += ' WHERE c.agent_id = $1 OR l.agent_id = $1';
      params.push(req.user.uid);
    }
    q += ' ORDER BY o.created_at DESC';
    res.json((await query(q, params)).rows);
  } catch (err) { res.status(500).json({ error: "Server error" }); }
});
app.post("/api/opportunities", authenticateToken, async (req: any, res) => {
  const { customerId, leadId, title, amount, currency, stage, probability, expectedCloseDate, notes } = req.body;
  try {
    const result = await query('INSERT INTO opportunities (customer_id, lead_id, title, amount, currency, stage, probability, expected_close_date, notes) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id, customer_id as "customerId", lead_id as "leadId", title, amount, currency, stage, probability, expected_close_date as "expectedCloseDate", notes, created_at as "createdAt"', [customerId || null, leadId || null, title, amount, currency || null, stage || 'Prospection', probability, expectedCloseDate, notes]);
    res.status(201).json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: "Server error" }); }
});
app.put("/api/opportunities/:id", authenticateToken, async (req, res) => {
  const { id } = req.params; const { customerId, leadId, title, amount, currency, stage, probability, expectedCloseDate, notes } = req.body;
  try {
    const result = await query('UPDATE opportunities SET customer_id=$1, lead_id=$2, title=$3, amount=$4, currency=$5, stage=$6, probability=$7, expected_close_date=$8, notes=$9, updated_at=CURRENT_TIMESTAMP WHERE id=$10 RETURNING id, customer_id as "customerId", lead_id as "leadId", title, amount, currency, stage, probability, expected_close_date as "expectedCloseDate", notes, updated_at as "updatedAt"', [customerId || null, leadId || null, title, amount, currency || null, stage, probability, expectedCloseDate, notes, id]);
    if (result.rows.length === 0) return res.status(404).json({ error: "Opportunity not found" });
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: "Server error" }); }
});
app.delete("/api/opportunities/:id", authenticateToken, async (req, res) => {
  try { await query("DELETE FROM opportunities WHERE id = $1", [req.params.id]); res.json({ success: true }); } catch (err) { res.status(500).json({ error: "Server error" }); }
});

// =====================================================================
// COMMENTS — generic comment system on portfolio/lead/opportunity/customer
// =====================================================================
const COMMENT_ENTITIES = ['portfolio', 'lead', 'opportunity', 'customer'];
app.get("/api/comments/:entityType/:entityId", authenticateToken, async (req, res) => {
  const { entityType, entityId } = req.params;
  if (!COMMENT_ENTITIES.includes(entityType)) return res.status(400).json({ error: "Invalid entity" });
  try {
    const r = await query("SELECT * FROM comments WHERE entity_type = $1 AND entity_id = $2 ORDER BY created_at DESC", [entityType, entityId]);
    res.json(r.rows);
  } catch (err: any) { res.status(500).json({ error: "Server error: " + err.message }); }
});
app.post("/api/comments/:entityType/:entityId", authenticateToken, async (req: any, res) => {
  const { entityType, entityId } = req.params; const { content } = req.body;
  if (!COMMENT_ENTITIES.includes(entityType)) return res.status(400).json({ error: "Invalid entity" });
  if (!content || !content.trim()) return res.status(400).json({ error: "Commentaire vide" });
  try {
    const r = await query("INSERT INTO comments (entity_type, entity_id, author_id, author_name, content) VALUES ($1,$2,$3,$4,$5) RETURNING *",
      [entityType, entityId, req.user.uid, req.user.name || req.user.email || 'Utilisateur', content.trim()]);
    res.status(201).json(r.rows[0]);
  } catch (err: any) { res.status(500).json({ error: "Server error: " + err.message }); }
});
app.delete("/api/comments/:id", authenticateToken, async (req: any, res) => {
  try {
    const own = await query("SELECT author_id FROM comments WHERE id = $1", [req.params.id]);
    if (own.rows.length === 0) return res.status(404).json({ error: "Comment not found" });
    const isAdmin = req.user.role === 'admin' || req.user.role === 'superadmin';
    if (own.rows[0].author_id !== req.user.uid && !isAdmin) return res.status(403).json({ error: "Forbidden" });
    await query("DELETE FROM comments WHERE id = $1", [req.params.id]);
    res.json({ success: true });
  } catch (err: any) { res.status(500).json({ error: "Server error" }); }
});

// Calls
app.get("/api/calls", authenticateToken, async (req: any, res) => {
  try {
    let q = "SELECT * FROM calls"; let params: any[] = [];
    if (req.user.role === 'agent') { q += " WHERE agent_id = $1"; params.push(req.user.uid); }
    q += " ORDER BY created_at DESC";
    const result = await query(q, params);
    res.json(result.rows.map(r => ({ ...r, customerId: r.customer_id, customerName: r.customer_name, customerPhone: r.customer_phone, agentId: r.agent_id, agentName: r.agent_name, createdAt: r.created_at, updatedAt: r.updated_at })));
  } catch (err) { res.status(500).json({ error: "Server error" }); }
});
app.post("/api/calls", authenticateToken, async (req, res) => {
  const { customerId, customerName, customerPhone, agentId, agentName, status, notes } = req.body;
  try { res.json((await query('INSERT INTO calls (customer_id, customer_name, customer_phone, agent_id, agent_name, status, notes) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id, customer_id as "customerId", customer_name as "customerName", customer_phone as "customerPhone", agent_id as "agentId", agent_name as "agentName", status, notes, created_at as "createdAt", updated_at as "updatedAt"', [customerId, customerName, customerPhone, agentId, agentName, status, notes])).rows[0]); } catch (err) { res.status(500).json({ error: "Server error" }); }
});
app.put("/api/calls/:id", authenticateToken, async (req, res) => {
  const { id } = req.params; const { status } = req.body;
  try { res.json((await query('UPDATE calls SET status=$1, updated_at=CURRENT_TIMESTAMP WHERE id=$2 RETURNING id, customer_id as "customerId", customer_name as "customerName", customer_phone as "customerPhone", agent_id as "agentId", agent_name as "agentName", status, notes, created_at as "createdAt", updated_at as "updatedAt"', [status, id])).rows[0]); } catch (err) { res.status(500).json({ error: "Server error" }); }
});

// Upload (disabled on Vercel)
app.post("/api/upload", authenticateToken, (req: any, res) => { res.status(503).json({ error: "File uploads not supported in serverless mode" }); });

// VAT Rates
app.get("/api/vat-rates", authenticateToken, async (req, res) => { try { res.json((await query("SELECT * FROM vat_rates ORDER BY rate ASC")).rows); } catch (err) { res.status(500).json({ error: "Server error" }); } });
app.post("/api/vat-rates", authenticateToken, async (req: any, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'superadmin') return res.status(403).json({ error: "Forbidden" });
  try { res.status(201).json((await query("INSERT INTO vat_rates (label, rate) VALUES ($1, $2) RETURNING *", [req.body.label, parseFloat(req.body.rate)])).rows[0]); } catch (err) { res.status(500).json({ error: "Server error" }); }
});

// Catalogues
app.get("/api/catalogues", authenticateToken, async (req, res) => { try { res.json((await query("SELECT * FROM catalogues ORDER BY name ASC")).rows); } catch (err) { res.status(500).json({ error: "Server error" }); } });
app.post("/api/catalogues", authenticateToken, async (req: any, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'superadmin') return res.status(403).json({ error: "Forbidden" });
  try { res.status(201).json((await query("INSERT INTO catalogues (name, description, is_active) VALUES ($1, $2, $3) RETURNING *", [req.body.name, req.body.description, req.body.is_active !== undefined ? req.body.is_active : 1])).rows[0]); } catch (err) { res.status(500).json({ error: "Server error" }); }
});

// Products
// Products (filtered by user zone/currency)
app.get("/api/products", authenticateToken, async (req: any, res) => {
  try {
    // Get user zone
    const userRes = await query("SELECT zone FROM users WHERE uid = $1", [req.user.uid]);
    const userZone = userRes.rows[0]?.zone || 'CG';
    // Zone -> allowed currencies mapping
    const zoneCurrencies: Record<string, string[]> = {
      'CG': ['XAF'],         // Congo Brazzaville -> XAF only
      'CM': ['XAF'],         // Cameroun -> XAF
      'GA': ['XAF'],         // Gabon -> XAF
      'TD': ['XAF'],         // Tchad -> XAF
      'CF': ['XAF'],         // Centrafrique -> XAF
      'GQ': ['XAF'],         // Guinée Eq. -> XAF
      'CD': ['CDF', 'USD'],  // RD Congo -> CDF + USD
      'CI': ['XOF'],         // Côte d'Ivoire -> XOF
      'SN': ['XOF'],         // Sénégal -> XOF
      'FR': ['EUR'],         // France -> EUR
    };
    const allowed = zoneCurrencies[userZone] || ['XAF'];
    // Admin/superadmin see all products
    let q = 'SELECT p.*, c.name as "categoryName", cat.name as "catalogName" FROM products p LEFT JOIN categories c ON p.category_id = c.id LEFT JOIN catalogues cat ON p.catalog_id = cat.id';
    let params: any[] = [];
    if (req.user.role !== 'admin' && req.user.role !== 'superadmin') {
      const placeholders = allowed.map((_, i) => `$${i + 1}`).join(',');
      q += ` WHERE (p.currency IN (${placeholders}) OR p.currency IS NULL)`;
      params = allowed;
    }
    q += ' ORDER BY p.name ASC';
    res.json((await query(q, params)).rows);
  } catch (err) { res.status(500).json({ error: "Server error" }); }
});
app.post("/api/products", authenticateToken, async (req: any, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'superadmin') return res.status(403).json({ error: "Forbidden" });
  const { name, type, category, categoryId, catalogId, price, vatRate, vatRateId, stock, unit, description, technicalFileUrl, currency, billingType, billingPeriod } = req.body;
  try {
    const bt = billingType === 'subscription' ? 'subscription' : 'one_time';
    const bp = bt === 'subscription' ? (billingPeriod || 'monthly') : null;
    res.status(201).json((await query("INSERT INTO products (name, type, category, category_id, catalog_id, price, vat_rate, vat_rate_id, stock, unit, description, technical_file_url, currency, billing_type, billing_period) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *", [name, type || 'product', category, categoryId, catalogId, price, vatRate || 20, vatRateId, stock || 0, unit, description, technicalFileUrl, currency || 'XAF', bt, bp])).rows[0]);
  } catch (err: any) { console.error(err); res.status(500).json({ error: "Server error: " + err.message }); }
});
app.put("/api/products/:id", authenticateToken, async (req: any, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'superadmin') return res.status(403).json({ error: "Forbidden" });
  const { name, price, vatRate, stock, unit, description, currency, billingType, billingPeriod } = req.body;
  try {
    const bt = billingType === 'subscription' ? 'subscription' : 'one_time';
    const bp = bt === 'subscription' ? (billingPeriod || 'monthly') : null;
    // Invalidate existing PayPal plan when billing changes
    await query("UPDATE products SET name=COALESCE($1,name), price=COALESCE($2,price), vat_rate=COALESCE($3,vat_rate), stock=COALESCE($4,stock), unit=COALESCE($5,unit), description=COALESCE($6,description), currency=COALESCE($7,currency), billing_type=$8, billing_period=$9, paypal_plan_id=NULL WHERE id=$10",
      [name, price, vatRate, stock, unit, description, currency, bt, bp, req.params.id]);
    res.json({ success: true });
  } catch (err: any) { res.status(500).json({ error: "Server error: " + err.message }); }
});
app.delete("/api/products/:id", authenticateToken, async (req: any, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'superadmin') return res.status(403).json({ error: "Forbidden" });
  try { await query("DELETE FROM products WHERE id = $1", [req.params.id]); res.json({ success: true }); } catch (err) { res.status(500).json({ error: "Server error" }); }
});

// Quotes
app.get("/api/quotes", authenticateToken, async (req: any, res) => {
  try {
    let q = 'SELECT q.*, c.name as "customerName", c.email as "customerEmail", l.first_name || \' \' || l.last_name as "leadName", l.email as "leadEmail", u.name as "agentName" FROM quotes q LEFT JOIN customers c ON q.customer_id = c.id LEFT JOIN leads l ON q.lead_id = l.id LEFT JOIN users u ON q.agent_id = u.uid';
    let params: any[] = [];
    if (req.user.role !== 'admin' && req.user.role !== 'superadmin') { q += ' WHERE q.agent_id = $1'; params.push(req.user.uid); }
    q += ' ORDER BY q.date DESC';
    const result = await query(q, params);
    res.json(result.rows.map(r => ({ ...r, customerName: r.customerName || (r.leadName ? `Prospect: ${r.leadName}` : 'Inconnu'), expiryDate: r.expiry_date })));
  } catch (err) { res.status(500).json({ error: "Server error" }); }
});
app.get("/api/quotes/:id", authenticateToken, async (req, res) => {
  const { id } = req.params;
  try {
    const qr = await query('SELECT q.*, c.name as "customerName", c.email as "customerEmail", c.phone as "customerPhone", l.first_name || \' \' || l.last_name as "leadName", l.email as "leadEmail", l.phone as "leadPhone" FROM quotes q LEFT JOIN customers c ON q.customer_id = c.id LEFT JOIN leads l ON q.lead_id = l.id WHERE q.id = $1', [id]);
    if (qr.rows.length === 0) return res.status(404).json({ error: "Quote not found" });
    const items = await query("SELECT * FROM quote_items WHERE quote_id = $1", [id]);
    const quote = qr.rows[0];
    res.json({ ...quote, customerName: quote.customerName || quote.leadName, customerEmail: quote.customerEmail || quote.leadEmail, customerPhone: quote.customerPhone || quote.leadPhone, items: items.rows });
  } catch (err) { res.status(500).json({ error: "Server error" }); }
});
// Helper: reject quote items that mix subscription + one_time
async function validateQuoteItemsMix(items: any[]): Promise<string | null> {
  if (!items || items.length === 0) return null;
  const productIds = items.map(i => i.productId).filter((x: any) => x !== "" && x !== null && x !== undefined);
  if (productIds.length === 0) return null;
  const r = await query("SELECT id, billing_type FROM products WHERE id = ANY($1::int[])", [productIds]);
  const types = new Set(r.rows.map((p: any) => p.billing_type || 'one_time'));
  if (types.has('subscription') && types.has('one_time')) {
    return "Un devis ne peut pas mélanger des produits d'abonnement et des produits à paiement unique.";
  }
  return null;
}

app.post("/api/quotes", authenticateToken, async (req: any, res) => {
  const { number, customerId, leadId, amount, status, date, expiryDate, notes, items } = req.body;
  try {
    const err = await validateQuoteItemsMix(items || []);
    if (err) return res.status(400).json({ error: err });
    const result = await query("INSERT INTO quotes (number, customer_id, lead_id, agent_id, amount, status, date, expiry_date, notes) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id", [number, customerId === "" ? null : customerId, leadId === "" ? null : leadId, req.user.uid, amount, status || 'Brouillon', date, expiryDate, notes]);
    const quoteId = result.rows[0].id;
    if (items?.length > 0) { for (const item of items) { await query("INSERT INTO quote_items (quote_id, product_id, description, quantity, unit_price, total_price) VALUES ($1,$2,$3,$4,$5,$6)", [quoteId, item.productId === "" ? null : item.productId, item.description, item.quantity, item.unitPrice, item.totalPrice]); } }
    res.status(201).json({ id: quoteId });
  } catch (err: any) { console.error(err); res.status(500).json({ error: "Server error: " + err.message }); }
});
app.put("/api/quotes/:id", authenticateToken, async (req, res) => {
  const { id } = req.params; const { amount, status, date, expiryDate, notes, items } = req.body;
  try {
    if (items) { const err = await validateQuoteItemsMix(items); if (err) return res.status(400).json({ error: err }); }
    await query("UPDATE quotes SET amount=$1, status=$2, date=$3, expiry_date=$4, notes=$5, updated_at=CURRENT_TIMESTAMP WHERE id=$6", [amount, status, date, expiryDate, notes, id]);
    if (items) { await query("DELETE FROM quote_items WHERE quote_id = $1", [id]); for (const item of items) { await query("INSERT INTO quote_items (quote_id, product_id, description, quantity, unit_price, total_price) VALUES ($1,$2,$3,$4,$5,$6)", [id, item.productId === "" ? null : item.productId, item.description, item.quantity, item.unitPrice, item.totalPrice]); } }
    // AUTO: sync linked opportunity + invoice on Signé/Refusé
    let invoiceId = null;
    if (status === 'Signé' || status === 'Accepté') {
      invoiceId = await autoCreateInvoiceFromQuote(parseInt(id));
      await autoSyncOpportunityFromQuote(parseInt(id), status);
    } else if (status === 'Refusé') {
      await autoSyncOpportunityFromQuote(parseInt(id), status);
    }
    res.json({ success: true, invoiceId });
  } catch (err) { res.status(500).json({ error: "Server error" }); }
});

app.delete("/api/quotes/:id", authenticateToken, async (req: any, res) => {
  const { id } = req.params;
  try {
    // CASCADE manuel: détacher invoices/documents puis supprimer items + quote
    await query("UPDATE invoices SET quote_id = NULL WHERE quote_id = $1", [id]);
    await query("UPDATE documents SET quote_id = NULL WHERE quote_id = $1", [id]);
    await query("DELETE FROM quote_items WHERE quote_id = $1", [id]);
    const r = await query("DELETE FROM quotes WHERE id = $1", [id]);
    if (r.rowCount === 0) return res.status(404).json({ error: "Devis introuvable" });
    res.json({ success: true });
  } catch (err: any) {
    console.error("Delete quote error:", err);
    res.status(500).json({ error: "Erreur de suppression: " + (err.message || 'inconnue') });
  }
});

// Convert signed quote to invoice (uses helper — idempotent)
app.post("/api/quotes/:id/convert-to-invoice", authenticateToken, async (req: any, res) => {
  const { id } = req.params;
  try {
    const invoiceId = await autoCreateInvoiceFromQuote(parseInt(id));
    if (!invoiceId) return res.status(400).json({ error: "Devis non convertible (client manquant ou devis inexistant)" });
    const inv = await query("SELECT number FROM invoices WHERE id = $1", [invoiceId]);
    res.json({ success: true, invoiceId, invoiceNumber: inv.rows[0]?.number });
  } catch (err: any) { console.error(err); res.status(500).json({ error: "Server error" }); }
});

// Send Quote by Email
app.post("/api/quotes/:id/send-email", authenticateToken, async (req: any, res) => {
  const { id } = req.params;
  const { recipientEmail, recipientName, message } = req.body;
  if (!recipientEmail) return res.status(400).json({ error: "Email du destinataire requis" });
  try {
    const qr = await query('SELECT q.*, c.name as "customerName", c.email as "customerEmail" FROM quotes q LEFT JOIN customers c ON q.customer_id = c.id WHERE q.id = $1', [id]);
    if (qr.rows.length === 0) return res.status(404).json({ error: "Devis non trouvé" });
    const quote = qr.rows[0];
    const signUrl = `https://tbi-crm.pro/public/quotes/${id}`;
    const htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: #4f46e5; padding: 20px; border-radius: 12px 12px 0 0; text-align: center;">
          <h1 style="color: white; margin: 0; font-size: 24px;">SmartBusiness</h1>
          <p style="color: #c7d2fe; margin: 5px 0 0;">Devis N° ${quote.number}</p>
        </div>
        <div style="background: #ffffff; padding: 30px; border: 1px solid #e2e8f0; border-top: none;">
          <p style="color: #334155; font-size: 16px;">Bonjour ${recipientName || 'Cher client'},</p>
          <p style="color: #64748b; line-height: 1.6;">${message || 'Veuillez trouver ci-joint votre devis. Vous pouvez le consulter et le signer électroniquement en cliquant sur le bouton ci-dessous.'}</p>
          <div style="margin: 30px 0; padding: 20px; background: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0;">
            <p style="margin: 0 0 5px; color: #64748b; font-size: 14px;">Montant du devis :</p>
            <p style="margin: 0; color: #1e293b; font-size: 28px; font-weight: bold;">${Number(quote.amount).toLocaleString()} FCFA</p>
            <p style="margin: 10px 0 0; color: #64748b; font-size: 13px;">Valable jusqu'au : ${quote.expiry_date ? new Date(quote.expiry_date).toLocaleDateString('fr-FR') : 'Non spécifié'}</p>
          </div>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${signUrl}" style="display: inline-block; background: #4f46e5; color: white; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: bold; font-size: 16px;">Consulter et Signer le Devis</a>
          </div>
          <p style="color: #94a3b8; font-size: 12px; text-align: center;">Si le bouton ne fonctionne pas, copiez ce lien : ${signUrl}</p>
        </div>
        <div style="background: #f8fafc; padding: 15px; border-radius: 0 0 12px 12px; text-align: center; border: 1px solid #e2e8f0; border-top: none;">
          <p style="color: #94a3b8; font-size: 12px; margin: 0;">SmartBusiness CRM - TBI Center</p>
        </div>
      </div>
    `;
    await emailTransporter.sendMail({
      from: '"SmartBusiness" <demo@smart-desk.pro>',
      to: recipientEmail,
      subject: `Devis ${quote.number} - Signature requise`,
      html: htmlContent
    });
    // Update quote status to "Envoyé"
    await query("UPDATE quotes SET status = 'Envoyé', updated_at = CURRENT_TIMESTAMP WHERE id = $1", [id]);
    res.json({ success: true, message: "Email envoyé avec succès" });
  } catch (err: any) {
    console.error("Email send error:", err);
    res.status(500).json({ error: "Erreur d'envoi: " + err.message });
  }
});

// Public Quotes (no auth)
app.get("/api/public/quotes/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const qr = await query('SELECT q.*, c.name as "customerName", c.email as "customerEmail", c.phone as "customerPhone", c.address as "customerAddress", c.city as "customerCity", l.first_name || \' \' || l.last_name as "leadName", l.email as "leadEmail", l.phone as "leadPhone", l.address as "leadAddress", l.city as "leadCity", u.name as "agentName", u.email as "agentEmail" FROM quotes q LEFT JOIN customers c ON q.customer_id = c.id LEFT JOIN leads l ON q.lead_id = l.id LEFT JOIN users u ON q.agent_id = u.uid WHERE q.id = $1', [id]);
    if (qr.rows.length === 0) return res.status(404).json({ error: "Quote not found" });
    const items = await query("SELECT qi.*, p.billing_type, p.billing_period FROM quote_items qi LEFT JOIN products p ON qi.product_id = p.id WHERE qi.quote_id = $1", [id]);
    const quote = qr.rows[0];
    const hasSubscription = items.rows.some((i: any) => i.billing_type === 'subscription');
    res.json({ ...quote, customerName: quote.customerName || quote.leadName, customerEmail: quote.customerEmail || quote.leadEmail, customerPhone: quote.customerPhone || quote.leadPhone, customerAddress: quote.customerAddress || quote.leadAddress, customerCity: quote.customerCity || quote.leadCity, items: items.rows, hasSubscription, paymentMode: hasSubscription ? 'subscription' : 'one_time' });
  } catch (err) { res.status(500).json({ error: "Server error" }); }
});

// Public Invoice view (no auth — for client preview/share)
app.get("/api/public/invoices/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const ir = await query('SELECT i.*, c.name as "customerName", c.email as "customerEmail", c.phone as "customerPhone", c.address as "customerAddress", c.city as "customerCity", u.name as "agentName", u.email as "agentEmail", q.number as "quoteNumber" FROM invoices i LEFT JOIN customers c ON i.customer_id = c.id LEFT JOIN users u ON i.agent_id = u.uid LEFT JOIN quotes q ON i.quote_id = q.id WHERE i.id = $1', [id]);
    if (ir.rows.length === 0) return res.status(404).json({ error: "Invoice not found" });
    const inv = ir.rows[0];
    // Fetch quote items for the invoice (via linked quote)
    let items: any[] = [];
    if (inv.quote_id) {
      const itemsRes = await query("SELECT * FROM quote_items WHERE quote_id = $1", [inv.quote_id]);
      items = itemsRes.rows;
    }
    res.json({ ...inv, dueDate: inv.due_date, paidAt: inv.paid_at, items });
  } catch (err) { res.status(500).json({ error: "Server error" }); }
});

// =====================================================================
// PAYPAL INTEGRATION (REST API direct — no SDK, serverless-friendly)
// =====================================================================

// Public — Create PayPal order for a quote
app.post("/api/public/quotes/:id/paypal/create-order", async (req, res) => {
  const { id } = req.params;
  try {
    const qr = await query("SELECT * FROM quotes WHERE id = $1", [id]);
    if (qr.rows.length === 0) return res.status(404).json({ error: "Devis introuvable" });
    const quote = qr.rows[0];
    if (quote.payment_status === 'PAID') return res.status(400).json({ error: "Devis déjà payé" });

    const converted = convertToPayPalCurrency(Number(quote.amount), 'XAF');
    const token = await getPayPalAccessToken();
    const orderRes = await fetch(`${PAYPAL_BASE}/v2/checkout/orders`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        intent: 'CAPTURE',
        purchase_units: [{
          reference_id: `QUOTE-${id}`,
          description: `Devis ${quote.number}`,
          amount: { currency_code: converted.currency, value: converted.value }
        }]
      })
    });
    const order: any = await orderRes.json();
    if (!orderRes.ok) {
      console.error('PayPal create-order error:', order);
      return res.status(500).json({ error: 'PayPal error: ' + (order.message || JSON.stringify(order)) });
    }
    res.json({ id: order.id, originalAmount: quote.amount, originalCurrency: 'XAF', paidAmount: converted.value, paidCurrency: converted.currency });
  } catch (err: any) {
    console.error('PayPal create-order exception:', err);
    res.status(500).json({ error: err.message || 'Server error' });
  }
});

// Public — Capture PayPal order (after user approves payment)
app.post("/api/public/quotes/:id/paypal/capture/:orderId", async (req, res) => {
  const { id, orderId } = req.params;
  try {
    const token = await getPayPalAccessToken();
    const captureRes = await fetch(`${PAYPAL_BASE}/v2/checkout/orders/${orderId}/capture`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
    });
    const capture: any = await captureRes.json();
    if (!captureRes.ok || capture.status !== 'COMPLETED') {
      console.error('PayPal capture error:', capture);
      return res.status(500).json({ error: 'Capture échouée: ' + (capture.message || capture.status) });
    }
    const transactionId = capture.purchase_units?.[0]?.payments?.captures?.[0]?.id || orderId;
    const amount = capture.purchase_units?.[0]?.payments?.captures?.[0]?.amount?.value;
    const currency = capture.purchase_units?.[0]?.payments?.captures?.[0]?.amount?.currency_code;
    await query("UPDATE quotes SET payment_status='PAID', payment_id=$1, payment_method='PAYPAL', payment_date=CURRENT_TIMESTAMP, payment_amount=$2, payment_currency=$3, updated_at=CURRENT_TIMESTAMP WHERE id=$4",
      [transactionId, amount, currency, id]);
    // AUTO: provision SmartDesk account if quote contains SmartDesk product
    const sd = await handleSmartDeskProvisioningForQuote(parseInt(id));
    res.json({ success: true, transactionId, amount, currency, smartdesk: sd });
  } catch (err: any) {
    console.error('PayPal capture exception:', err);
    res.status(500).json({ error: err.message || 'Server error' });
  }
});

// Expose PayPal client ID to frontend (public, safe — secret stays server-side)
app.get("/api/public/paypal/config", (req, res) => {
  res.json({
    clientId: process.env.PAYPAL_CLIENT_ID || '',
    mode: process.env.PAYPAL_MODE === 'live' ? 'live' : 'sandbox'
  });
});

// Admin: retry SmartDesk provisioning for a paid quote
app.post("/api/quotes/:id/smartdesk/provision", authenticateToken, async (req: any, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'superadmin') return res.status(403).json({ error: "Forbidden" });
  try {
    const sd = await handleSmartDeskProvisioningForQuote(parseInt(req.params.id));
    if (sd.error) return res.status(400).json({ error: sd.error });
    res.json(sd);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Public — Create PayPal subscription plan data for a subscription-type quote
app.post("/api/public/quotes/:id/paypal/subscription-plan", async (req, res) => {
  const { id } = req.params;
  try {
    const qr = await query("SELECT * FROM quotes WHERE id = $1", [id]);
    if (qr.rows.length === 0) return res.status(404).json({ error: "Devis introuvable" });
    if (qr.rows[0].payment_status === 'PAID') return res.status(400).json({ error: "Devis déjà payé" });

    const items = await query("SELECT qi.*, p.billing_type, p.billing_period FROM quote_items qi LEFT JOIN products p ON qi.product_id = p.id WHERE qi.quote_id = $1", [id]);
    const rows = items.rows;
    const hasSubscription = rows.some((i: any) => i.billing_type === 'subscription');
    const hasOneTime = rows.some((i: any) => i.billing_type === 'one_time' || !i.billing_type);

    if (!hasSubscription) return res.status(400).json({ error: "Ce devis ne contient pas d'abonnement" });
    if (hasSubscription && hasOneTime) return res.status(400).json({ error: "Un devis ne peut pas mélanger abonnement et produit unique" });

    // For simplicity: take the first subscription product as the master plan (most common case: 1 subscription per quote)
    const subItem = rows.find((i: any) => i.billing_type === 'subscription');
    if (!subItem?.product_id) return res.status(400).json({ error: "Produit d'abonnement invalide" });

    const plan = await ensurePayPalPlanForProduct(subItem.product_id);
    res.json({ planId: plan.planId, amount: plan.amount, currency: plan.currency });
  } catch (err: any) {
    console.error('subscription-plan error:', err);
    res.status(500).json({ error: err.message || 'Server error' });
  }
});

// Public — Record subscription activation (called after user approves subscription on PayPal)
app.post("/api/public/quotes/:id/paypal/subscription/:subscriptionId", async (req, res) => {
  const { id, subscriptionId } = req.params;
  try {
    const token = await getPayPalAccessToken();
    // Fetch subscription to validate it's ACTIVE
    const sr = await fetch(`${PAYPAL_BASE}/v1/billing/subscriptions/${subscriptionId}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const sub: any = await sr.json();
    if (!sr.ok) { console.error('sub fetch error:', sub); return res.status(500).json({ error: 'Impossible de vérifier l\'abonnement' }); }
    if (sub.status !== 'ACTIVE' && sub.status !== 'APPROVED') {
      return res.status(400).json({ error: `Abonnement non actif (${sub.status})` });
    }
    const amount = sub.billing_info?.last_payment?.amount?.value || null;
    const currency = sub.billing_info?.last_payment?.amount?.currency_code || 'EUR';
    await query("UPDATE quotes SET payment_status='PAID', payment_id=$1, payment_method='PAYPAL_SUBSCRIPTION', payment_date=CURRENT_TIMESTAMP, payment_amount=$2, payment_currency=$3, subscription_id=$4, updated_at=CURRENT_TIMESTAMP WHERE id=$5",
      [subscriptionId, amount, currency, subscriptionId, id]);
    // AUTO: provision SmartDesk account if quote contains SmartDesk product
    const sd = await handleSmartDeskProvisioningForQuote(parseInt(id));
    res.json({ success: true, subscriptionId, status: sub.status, smartdesk: sd });
  } catch (err: any) {
    console.error('subscription activate error:', err);
    res.status(500).json({ error: err.message || 'Server error' });
  }
});
app.post("/api/public/quotes/:id/sign", async (req, res) => {
  const { id } = req.params; const { signature, signedBy } = req.body;
  try {
    // SECURITY: signature requires payment first
    const qr = await query("SELECT payment_status FROM quotes WHERE id = $1", [id]);
    if (qr.rows.length === 0) return res.status(404).json({ error: "Devis introuvable" });
    if (qr.rows[0].payment_status !== 'PAID') {
      return res.status(403).json({ error: "Le paiement doit être effectué avant la signature." });
    }
    await query("UPDATE quotes SET signature=$1, signed_by=$2, signature_date=CURRENT_TIMESTAMP, status='Signé' WHERE id=$3", [signature, signedBy, id]);
    // AUTO: full chain — invoice + opportunity sync
    const invoiceId = await autoCreateInvoiceFromQuote(parseInt(id));
    await autoSyncOpportunityFromQuote(parseInt(id), 'Signé');
    res.json({ success: true, invoiceId });
  } catch (err) { res.status(500).json({ error: "Server error" }); }
});

// Invoices
app.get("/api/invoices", authenticateToken, async (req: any, res) => {
  try {
    // AUTO: mark unpaid invoices past due_date as 'En retard'
    await query("UPDATE invoices SET status = 'En retard', updated_at = CURRENT_TIMESTAMP WHERE status = 'En attente' AND due_date IS NOT NULL AND due_date < CURRENT_DATE");
    let q = 'SELECT i.*, c.name as "customerName", u.name as "agentName" FROM invoices i LEFT JOIN customers c ON i.customer_id = c.id LEFT JOIN users u ON i.agent_id = u.uid';
    let params: any[] = [];
    if (req.user.role !== 'admin' && req.user.role !== 'superadmin') { q += ' WHERE i.agent_id = $1'; params.push(req.user.uid); }
    q += ' ORDER BY i.date DESC';
    res.json((await query(q, params)).rows.map(r => ({ ...r, dueDate: r.due_date, paidAt: r.paid_at })));
  } catch (err) { res.status(500).json({ error: "Server error" }); }
});
app.post("/api/invoices", authenticateToken, async (req: any, res) => {
  const { number, customerId, quoteId, amount, status, date, dueDate, notes } = req.body;
  const invoiceNum = number || `F-${new Date().getFullYear()}-${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`;
  try { res.status(201).json({ id: (await query("INSERT INTO invoices (number, customer_id, quote_id, agent_id, amount, status, date, due_date, notes) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id", [invoiceNum, customerId === "" ? null : customerId, quoteId === "" ? null : quoteId, req.user.uid, amount || 0, status || 'En attente', date || new Date().toISOString().split('T')[0], dueDate || null, notes || null])).rows[0].id }); } catch (err: any) { console.error(err); res.status(500).json({ error: "Server error: " + err.message }); }
});
app.put("/api/invoices/:id", authenticateToken, async (req: any, res) => {
  const { id } = req.params;
  const { status, amount, dueDate } = req.body;
  try {
    const cur = await query("SELECT status FROM invoices WHERE id = $1", [id]);
    if (cur.rows.length === 0) return res.status(404).json({ error: "Invoice not found" });
    const wasPaid = cur.rows[0].status === 'Payée';
    const becomesPaid = status === 'Payée';
    const paidAt = becomesPaid && !wasPaid ? new Date().toISOString() : null;
    if (paidAt) {
      await query("UPDATE invoices SET status=$1, amount=COALESCE($2, amount), due_date=COALESCE($3, due_date), paid_at=$4, updated_at=CURRENT_TIMESTAMP WHERE id=$5", [status, amount, dueDate, paidAt, id]);
    } else {
      await query("UPDATE invoices SET status=COALESCE($1, status), amount=COALESCE($2, amount), due_date=COALESCE($3, due_date), updated_at=CURRENT_TIMESTAMP WHERE id=$4", [status, amount, dueDate, id]);
    }
    // AUTO: create commission when invoice becomes Payée
    let commissionId = null;
    if (becomesPaid && !wasPaid) {
      commissionId = await autoCreateCommissionFromInvoice(parseInt(id));
    }
    res.json({ success: true, commissionId });
  } catch (err: any) { console.error(err); res.status(500).json({ error: "Server error" }); }
});
app.delete("/api/invoices/:id", authenticateToken, async (req: any, res) => {
  const { id } = req.params;
  try {
    // CASCADE manuel: supprimer commissions liées, détacher documents, puis facture
    await query("DELETE FROM commissions WHERE invoice_id = $1", [id]);
    await query("UPDATE documents SET invoice_id = NULL WHERE invoice_id = $1", [id]);
    const r = await query("DELETE FROM invoices WHERE id = $1", [id]);
    if (r.rowCount === 0) return res.status(404).json({ error: "Facture introuvable" });
    res.json({ success: true });
  } catch (err: any) {
    console.error("Delete invoice error:", err);
    res.status(500).json({ error: "Erreur de suppression: " + (err.message || 'inconnue') });
  }
});

// Commissions
app.get("/api/commissions", authenticateToken, async (req: any, res) => {
  try {
    let q = 'SELECT cm.*, u.name as "agentName", i.number as "invoiceNumber" FROM commissions cm LEFT JOIN users u ON cm.agent_id = u.uid LEFT JOIN invoices i ON cm.invoice_id = i.id';
    let params: any[] = [];
    if (req.user.role !== 'admin' && req.user.role !== 'superadmin') { q += ' WHERE cm.agent_id = $1'; params.push(req.user.uid); }
    q += ' ORDER BY cm.date DESC';
    res.json((await query(q, params)).rows);
  } catch (err) { res.status(500).json({ error: "Server error" }); }
});
app.post("/api/commissions", authenticateToken, async (req: any, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'superadmin') return res.status(403).json({ error: "Forbidden" });
  const { agentId, invoiceId, amount, rate, status, date } = req.body;
  try { res.status(201).json((await query('INSERT INTO commissions (agent_id, invoice_id, amount, rate, status, date) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, agent_id as "agentId", invoice_id as "invoiceId", amount, rate, status, date', [agentId, invoiceId || null, amount, rate, status || 'En attente', date])).rows[0]); } catch (err) { res.status(500).json({ error: "Server error" }); }
});
app.put("/api/commissions/:id", authenticateToken, async (req: any, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'superadmin') return res.status(403).json({ error: "Forbidden" });
  const { id } = req.params; const { status } = req.body;
  try {
    const result = await query("UPDATE commissions SET status = $1 WHERE id = $2 RETURNING *", [status, id]);
    if (result.rows.length === 0) return res.status(404).json({ error: "Commission not found" });
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: "Server error" }); }
});
app.delete("/api/commissions/:id", authenticateToken, async (req: any, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'superadmin') return res.status(403).json({ error: "Forbidden" });
  try {
    const r = await query("DELETE FROM commissions WHERE id = $1", [req.params.id]);
    if (r.rowCount === 0) return res.status(404).json({ error: "Commission introuvable" });
    res.json({ success: true });
  } catch (err: any) { res.status(500).json({ error: "Erreur: " + err.message }); }
});

// Activities
app.get("/api/activities", authenticateToken, async (req: any, res) => {
  try {
    // AUTO: mark overdue 'À faire' activities as 'En retard'
    await query("UPDATE activities SET status='En retard', updated_at=CURRENT_TIMESTAMP WHERE status='À faire' AND date < CURRENT_TIMESTAMP - INTERVAL '1 day'");
    let q = 'SELECT a.*, c.name as "customerName", l.first_name || \' \' || l.last_name as "leadName", o.title as "opportunityTitle", u.name as "agentName", u.role as "agentRole" FROM activities a LEFT JOIN customers c ON a.customer_id = c.id LEFT JOIN leads l ON a.lead_id = l.id LEFT JOIN opportunities o ON a.opportunity_id = o.id LEFT JOIN users u ON a.agent_id = u.uid';
    // Non-admin users cannot see admin/superadmin activities
    if (req.user.role !== 'admin' && req.user.role !== 'superadmin') {
      q += " WHERE (u.role IS NULL OR u.role NOT IN ('admin','superadmin'))";
    }
    q += ' ORDER BY a.date DESC';
    const result = await query(q);
    res.json(result.rows.map((r: any) => ({ ...r, customerName: r.customerName || (r.leadName ? `Prospect: ${r.leadName}` : r.opportunityTitle || 'N/A') })));
  } catch (err) { res.status(500).json({ error: "Server error" }); }
});
app.post("/api/activities", authenticateToken, async (req: any, res) => {
  const { type, subject, customerId, leadId, opportunityId, status, date, notes } = req.body;
  try { res.status(201).json({ id: (await query("INSERT INTO activities (type, subject, customer_id, lead_id, opportunity_id, agent_id, status, date, notes) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id", [type, subject, customerId, leadId, opportunityId, req.user.uid, status || 'À faire', date, notes])).rows[0].id }); } catch (err) { res.status(500).json({ error: "Server error" }); }
});
app.put("/api/activities/:id", authenticateToken, async (req, res) => {
  const { id } = req.params; const { type, subject, customerId, leadId, opportunityId, status, date, notes } = req.body;
  try { await query("UPDATE activities SET type=$1, subject=$2, customer_id=$3, lead_id=$4, opportunity_id=$5, status=$6, date=$7, notes=$8, updated_at=CURRENT_TIMESTAMP WHERE id=$9", [type, subject, customerId, leadId, opportunityId, status, date, notes, id]); res.json({ message: "Activity updated" }); } catch (err) { res.status(500).json({ error: "Server error" }); }
});
app.delete("/api/activities/:id", authenticateToken, async (req, res) => {
  try { await query("DELETE FROM activities WHERE id = $1", [req.params.id]); res.json({ message: "Activity deleted" }); } catch (err) { res.status(500).json({ error: "Server error" }); }
});

// Objectives
app.get("/api/objectives", authenticateToken, async (req: any, res) => {
  try {
    let q = 'SELECT o.*, u.name as "agentName" FROM objectives o LEFT JOIN users u ON o.agent_id = u.uid'; let params: any[] = [];
    if (req.user.role !== 'admin' && req.user.role !== 'superadmin') { q += ' WHERE o.agent_id = $1'; params.push(req.user.uid); }
    q += ' ORDER BY o.end_date DESC';
    res.json((await query(q, params)).rows);
  } catch (err) { res.status(500).json({ error: "Server error" }); }
});
app.get("/api/objectives/stats", authenticateToken, async (req: any, res) => {
  try {
    const oq = `SELECT o.*, u.name as "agentName" FROM objectives o LEFT JOIN users u ON o.agent_id = u.uid ${req.user.role !== 'admin' && req.user.role !== 'superadmin' ? 'WHERE o.agent_id = $1' : ''}`;
    const objectives = await query(oq, req.user.role !== 'admin' && req.user.role !== 'superadmin' ? [req.user.uid] : []);
    const stats = await Promise.all(objectives.rows.map(async (obj: any) => {
      let currentValue = 0; const { type, agent_id, start_date, end_date } = obj;
      if (type === 'revenue') { currentValue = (await query("SELECT SUM(amount) as total FROM invoices WHERE agent_id=$1 AND status='Payée' AND date BETWEEN $2 AND $3", [agent_id, start_date, end_date])).rows[0].total || 0; }
      else if (type === 'calls') { currentValue = (await query("SELECT COUNT(*) as count FROM activities WHERE agent_id=$1 AND type='Appel' AND date BETWEEN $2 AND $3", [agent_id, start_date, end_date])).rows[0].count || 0; }
      else if (type === 'meetings') { currentValue = (await query("SELECT COUNT(*) as count FROM activities WHERE agent_id=$1 AND type='RDV' AND date BETWEEN $2 AND $3", [agent_id, start_date, end_date])).rows[0].count || 0; }
      else if (type === 'quotes') { currentValue = (await query("SELECT COUNT(*) as count FROM quotes WHERE agent_id=$1 AND date BETWEEN $2 AND $3", [agent_id, start_date, end_date])).rows[0].count || 0; }
      // AUTO: update status if target reached or expired
      const numCurrent = Number(currentValue);
      const numTarget = Number(obj.target_value);
      let newStatus = obj.status;
      if (numCurrent >= numTarget && obj.status !== 'Atteint') {
        newStatus = 'Atteint';
        await query("UPDATE objectives SET status='Atteint', updated_at=CURRENT_TIMESTAMP WHERE id=$1", [obj.id]);
      } else if (new Date(end_date) < new Date() && numCurrent < numTarget && obj.status === 'En cours') {
        newStatus = 'Échoué';
        await query("UPDATE objectives SET status='Échoué', updated_at=CURRENT_TIMESTAMP WHERE id=$1", [obj.id]);
      }
      return { ...obj, currentValue: numCurrent, status: newStatus };
    }));
    res.json(stats);
  } catch (err) { res.status(500).json({ error: "Server error" }); }
});
app.post("/api/objectives", authenticateToken, async (req: any, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'superadmin') return res.status(403).json({ error: "Forbidden" });
  const { agentId, type, targetValue, period, startDate, endDate, status } = req.body;
  try { res.status(201).json((await query('INSERT INTO objectives (agent_id, type, target_value, period, start_date, end_date, status) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id, agent_id as "agentId", type, target_value as "targetValue", period, start_date as "startDate", end_date as "endDate", status', [agentId, type, targetValue, period, startDate, endDate, status || 'En cours'])).rows[0]); } catch (err) { res.status(500).json({ error: "Server error" }); }
});
app.put("/api/objectives/:id", authenticateToken, async (req: any, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'superadmin') return res.status(403).json({ error: "Forbidden" });
  const { id } = req.params; const { targetValue, status, endDate } = req.body;
  try {
    const result = await query("UPDATE objectives SET target_value=$1, status=$2, end_date=$3, updated_at=CURRENT_TIMESTAMP WHERE id=$4 RETURNING *", [targetValue, status, endDate, id]);
    if (result.rows.length === 0) return res.status(404).json({ error: "Objective not found" });
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: "Server error" }); }
});
app.delete("/api/objectives/:id", authenticateToken, async (req: any, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'superadmin') return res.status(403).json({ error: "Forbidden" });
  try { await query("DELETE FROM objectives WHERE id = $1", [req.params.id]); res.status(204).send(); } catch (err) { res.status(500).json({ error: "Server error" }); }
});

// Projects
app.get("/api/projects", authenticateToken, async (req, res) => {
  try { res.json((await query('SELECT p.*, c.name as "customerName" FROM projects p LEFT JOIN customers c ON p.customer_id = c.id ORDER BY p.created_at DESC')).rows.map(r => ({ ...r, startDate: r.start_date, endDate: r.end_date }))); } catch (err) { res.status(500).json({ error: "Server error" }); }
});
app.post("/api/projects", authenticateToken, async (req: any, res) => {
  const { name, customerId, status, startDate, endDate, description } = req.body;
  if (!name) return res.status(400).json({ error: "Name required" });
  try {
    const result = await query('INSERT INTO projects (name, customer_id, status, start_date, end_date, description) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *', [name, customerId || null, status || 'En cours', startDate || null, endDate || null, description || null]);
    res.status(201).json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: "Server error" }); }
});
app.delete("/api/projects/:id", authenticateToken, async (req, res) => {
  try { await query("DELETE FROM projects WHERE id = $1", [req.params.id]); res.json({ success: true }); } catch (err) { res.status(500).json({ error: "Server error" }); }
});

// Debug
app.get("/api/debug/counts", async (req, res) => {
  try { res.json((await query("SELECT c.name, COUNT(p.id) as count FROM categories c LEFT JOIN portfolio_items p ON c.id = p.category_id GROUP BY c.name")).rows); } catch (err) { res.status(500).json({ error: err instanceof Error ? err.message : String(err) }); }
});

// Convert Opportunity to Lead (keeping contact info from notes)
app.post("/api/opportunities/:id/convert-to-lead", authenticateToken, async (req: any, res) => {
  const { id } = req.params;
  try {
    const or2 = await query("SELECT * FROM opportunities WHERE id = $1", [id]);
    if (or2.rows.length === 0) return res.status(404).json({ error: "Opportunity not found" });
    const opp = or2.rows[0];
    // Parse contact info from notes
    const notes = opp.notes || '';
    const telMatch = notes.match(/Tél:\s*(.+)/);
    const emailMatch = notes.match(/Email:\s*(.+)/);
    const niuMatch = notes.match(/NIU:\s*(.+)/);
    const adresseMatch = notes.match(/Adresse:\s*(.+)/);
    const cityMatch = notes.match(/- ([^\n]+)/);
    const nameFromTitle = opp.title.replace('Opportunité - ', '');
    const result = await query(
      'INSERT INTO leads (type, company_name, email, phone, source, status, notes, address, city, agent_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id, type, company_name as "companyName", email, phone, source, status, notes, address, city, created_at as "createdAt"',
      ['company', nameFromTitle, emailMatch?.[1]?.trim() || null, telMatch?.[1]?.trim()?.split(/[\n/]+/)[0] || null, 'Opportunité', 'Qualifié', `NIU: ${niuMatch?.[1]?.trim() || 'N/A'}\nConverti depuis l'opportunité: ${opp.title}\nMontant estimé: ${opp.amount} FCFA`, adresseMatch?.[1]?.trim()?.split(' -')[0] || null, cityMatch?.[1]?.trim() || null, req.user.uid]
    );
    // Update opportunity stage
    await query("UPDATE opportunities SET stage = 'negotiation', probability = 50, updated_at = CURRENT_TIMESTAMP WHERE id = $1", [id]);
    res.json(result.rows[0]);
  } catch (err: any) { console.error(err); res.status(500).json({ error: "Server error" }); }
});

// CRM Automation
app.post("/api/leads/:id/convert-to-customer", authenticateToken, async (req, res) => {
  const { id } = req.params;
  try {
    const lr = await query("SELECT * FROM leads WHERE id = $1", [id]);
    if (lr.rows.length === 0) return res.status(404).json({ error: "Lead not found" });
    const customerId = await autoConvertLeadToCustomer(parseInt(id));
    if (!customerId) return res.status(500).json({ error: "Conversion échouée" });
    res.json({ success: true, customerId });
  } catch (err: any) {
    console.error("convert-to-customer error:", err);
    res.status(500).json({ error: "Server error: " + err.message });
  }
});
app.post("/api/leads/:id/convert-to-opportunity", authenticateToken, async (req, res) => {
  const { id } = req.params; const { title, amount, expectedCloseDate } = req.body;
  try {
    const lr = await query("SELECT * FROM leads WHERE id = $1", [id]);
    if (lr.rows.length === 0) return res.status(404).json({ error: "Lead not found" });
    const result = await query("INSERT INTO opportunities (lead_id, title, amount, stage, probability, expected_close_date, updated_at) VALUES ($1,$2,$3,$4,$5,$6,CURRENT_TIMESTAMP) RETURNING id", [id, title || "Nouvelle Opportunité", amount || 0, 'discovery', 10, expectedCloseDate || null]);
    await query("UPDATE leads SET status='Qualifié' WHERE id=$1", [id]);
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: "Server error" }); }
});
app.post("/api/opportunities/:id/convert-to-customer", authenticateToken, async (req, res) => {
  const { id } = req.params;
  try {
    const or2 = await query("SELECT * FROM opportunities WHERE id = $1", [id]);
    if (or2.rows.length === 0) return res.status(404).json({ error: "Opportunity not found" });
    const opp = or2.rows[0]; let customerId = opp.customer_id;
    if (!customerId && opp.lead_id) {
      const lr = await query("SELECT * FROM leads WHERE id = $1", [opp.lead_id]);
      if (lr.rows.length > 0) { const lead = lr.rows[0]; const cr = await query("INSERT INTO customers (type, first_name, last_name, company_name, email, phone, industry, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,CURRENT_TIMESTAMP) RETURNING id", [lead.type, lead.first_name, lead.last_name, lead.company_name, lead.email, lead.phone, 'Non spécifié']); customerId = cr.rows[0].id; await query("UPDATE leads SET status='Converti', updated_at=CURRENT_TIMESTAMP WHERE id=$1", [opp.lead_id]); }
    }
    await query("UPDATE opportunities SET customer_id=$1, lead_id=NULL, stage='won', probability=100, updated_at=CURRENT_TIMESTAMP WHERE id=$2", [customerId, id]);
    res.json({ success: true, customerId });
  } catch (err) { res.status(500).json({ error: "Server error" }); }
});

// Superadmin Dashboard - Demo countdown & stats
app.get("/api/superadmin/dashboard", authenticateToken, async (req: any, res) => {
  if (req.user.role !== 'superadmin') return res.status(403).json({ error: "Forbidden" });
  try {
    const allUsers = (await query('SELECT uid, email, name, role, account_type, is_active, first_login_at, deactivated_at, company_name, created_at FROM users ORDER BY created_at DESC')).rows;
    const demoAccounts = allUsers.filter(u => u.account_type === 'demo').map(u => {
      let daysRemaining = 15;
      let daysUsed = 0;
      if (u.first_login_at) {
        daysUsed = Math.floor((new Date().getTime() - new Date(u.first_login_at).getTime()) / (1000 * 60 * 60 * 24));
        daysRemaining = Math.max(0, 15 - daysUsed);
      }
      return { ...u, daysRemaining, daysUsed, expired: daysRemaining <= 0 };
    });
    const prodAccounts = allUsers.filter(u => u.account_type === 'production');
    const totalSessions = (await query("SELECT COUNT(*) as count FROM sessions")).rows[0].count;
    const todaySessions = (await query("SELECT COUNT(*) as count FROM sessions WHERE logged_in_at >= CURRENT_DATE")).rows[0].count;
    res.json({
      totalUsers: allUsers.length,
      activeUsers: allUsers.filter(u => u.is_active).length,
      inactiveUsers: allUsers.filter(u => !u.is_active).length,
      demoAccounts,
      prodAccounts,
      demoCount: demoAccounts.length,
      prodCount: prodAccounts.length,
      expiredDemos: demoAccounts.filter(d => d.expired).length,
      totalSessions: parseInt(totalSessions),
      todaySessions: parseInt(todaySessions),
    });
  } catch (err) { res.status(500).json({ error: "Server error" }); }
});

// Sessions tracking (Admin only)
app.get("/api/admin/sessions", authenticateToken, async (req: any, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'superadmin') return res.status(403).json({ error: "Forbidden" });
  try {
    const { user, dateFrom, dateTo } = req.query;
    let q = 'SELECT id, user_uid, user_email, user_name, user_role, ip_address, user_agent, logged_in_at as "loggedInAt", logged_out_at as "loggedOutAt" FROM sessions WHERE 1=1';
    const params: any[] = [];
    let idx = 1;
    if (user) { q += ` AND (user_email ILIKE $${idx} OR user_name ILIKE $${idx})`; params.push(`%${user}%`); idx++; }
    if (dateFrom) { q += ` AND logged_in_at >= $${idx}`; params.push(dateFrom); idx++; }
    if (dateTo) { q += ` AND logged_in_at <= $${idx}`; params.push(dateTo); idx++; }
    q += ' ORDER BY logged_in_at DESC LIMIT 200';
    res.json((await query(q, params)).rows);
  } catch (err) { res.status(500).json({ error: "Server error" }); }
});

// Admin: Seed demo data — creates a realistic dataset for the CRM
app.post("/api/admin/seed-demo", authenticateToken, async (req: any, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'superadmin') return res.status(403).json({ error: "Forbidden" });
  try {
    const summary: Record<string, number> = {};
    const hashed = await bcrypt.hash('Demo2026!', 10);
    const mkUid = () => Math.random().toString(36).substring(2, 15);

    // 1) Agents (5): 3 Congo Brazza (XAF), 2 RDC (CDF)
    const agents = [
      { email: 'agent.brazza1@smart-desk.pro', name: 'Marie Nzaba', zone: 'CG', accountType: 'production' },
      { email: 'agent.brazza2@smart-desk.pro', name: 'Paul Loemba', zone: 'CG', accountType: 'production' },
      { email: 'agent.brazza3@smart-desk.pro', name: 'Christelle Mboungou', zone: 'CG', accountType: 'demo' },
      { email: 'agent.kinshasa1@smart-desk.pro', name: 'Joseph Mukendi', zone: 'CD', accountType: 'production' },
      { email: 'agent.kinshasa2@smart-desk.pro', name: 'Aline Tshisekedi', zone: 'CD', accountType: 'demo' },
    ];
    const agentUids: string[] = [];
    for (const a of agents) {
      const exists = await query("SELECT uid FROM users WHERE email = $1", [a.email]);
      if (exists.rows.length > 0) { agentUids.push(exists.rows[0].uid); continue; }
      const uid = mkUid();
      await query("INSERT INTO users (uid, email, password, name, role, account_type, zone, is_active, first_login_at) VALUES ($1,$2,$3,$4,'agent',$5,$6,true,CURRENT_TIMESTAMP)",
        [uid, a.email, hashed, a.name, a.accountType, a.zone]);
      agentUids.push(uid);
    }
    summary.agents = agentUids.length;

    // 2) Categories (Portfolio)
    const cats = ['HÔTELLERIE', 'RESTAURATION', 'COMMERCE', 'INDUSTRIE', 'SERVICES'];
    const catIds: number[] = [];
    for (const c of cats) {
      const r = await query("INSERT INTO categories (name) VALUES ($1) ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING id", [c]);
      catIds.push(r.rows[0].id);
    }
    summary.categories = catIds.length;

    // 3) Portfolio items
    const portfolio = [
      { cat: 0, name: 'Hôtel Olympic Palace', city: 'Brazzaville', tel: '+242 06 555 1001', niu: 'P230012345' },
      { cat: 0, name: 'Radisson Blu Kinshasa', city: 'Kinshasa', tel: '+243 81 234 5678', niu: 'A0123456789' },
      { cat: 1, name: 'Restaurant Le Massamba', city: 'Pointe-Noire', tel: '+242 06 444 5566', niu: 'P230098765' },
      { cat: 1, name: 'Le Chalet Kin', city: 'Kinshasa', tel: '+243 99 777 8888', niu: 'A0987654321' },
      { cat: 2, name: 'Supermarché Casino', city: 'Brazzaville', tel: '+242 06 333 2211', niu: 'P230055555' },
      { cat: 3, name: 'Cimaf Congo', city: 'Pointe-Noire', tel: '+242 05 222 1144', niu: 'P230066666' },
      { cat: 4, name: 'TBI Center', city: 'Brazzaville', tel: '+242 06 100 0000', niu: 'P230011111' },
    ];
    let pCount = 0;
    for (const p of portfolio) {
      await query("INSERT INTO portfolio_items (category_id, name, city, tel, niu) VALUES ($1,$2,$3,$4,$5)",
        [catIds[p.cat], p.name, p.city, p.tel, p.niu]);
      pCount++;
    }
    summary.portfolioItems = pCount;

    // 4) Products (mixed currencies)
    const products = [
      { name: 'Forfait CRM Starter', type: 'service', price: 150000, currency: 'XAF', vat: 18 },
      { name: 'Forfait CRM Pro', type: 'service', price: 500000, currency: 'XAF', vat: 18 },
      { name: 'Forfait CRM Enterprise', type: 'service', price: 1500000, currency: 'XAF', vat: 18 },
      { name: 'Formation 1 jour', type: 'service', price: 250000, currency: 'XAF', vat: 18 },
      { name: 'Maintenance mensuelle', type: 'service', price: 75000, currency: 'XAF', vat: 18 },
      { name: 'CRM Basic (RDC)', type: 'service', price: 350000, currency: 'CDF', vat: 16 },
      { name: 'CRM Premium (RDC)', type: 'service', price: 1200000, currency: 'CDF', vat: 16 },
      { name: 'Audit IT', type: 'service', price: 800000, currency: 'XAF', vat: 18 },
      { name: 'Setup Email Pro', type: 'service', price: 50000, currency: 'XAF', vat: 18 },
      { name: 'Hosting Annuel', type: 'service', price: 120000, currency: 'XAF', vat: 18 },
    ];
    let prodCount = 0;
    const productIds: number[] = [];
    for (const p of products) {
      const r = await query("INSERT INTO products (name, type, price, vat_rate, currency, stock, unit) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id",
        [p.name, p.type, p.price, p.vat, p.currency, 100, 'unité']);
      productIds.push(r.rows[0].id);
      prodCount++;
    }
    summary.products = prodCount;

    // 5) Customers
    const customers = [
      { type: 'company', companyName: 'Hôtel Olympic Palace', email: 'contact@olympic.cg', phone: '+242 06 555 1001', city: 'Brazzaville', address: 'Av. Amilcar Cabral', industry: 'Hôtellerie', agent: 0 },
      { type: 'company', companyName: 'Restaurant Massamba', email: 'info@massamba.cg', phone: '+242 06 444 5566', city: 'Pointe-Noire', address: 'Bd. Charles de Gaulle', industry: 'Restauration', agent: 1 },
      { type: 'company', companyName: 'Casino Brazza', email: 'achats@casino.cg', phone: '+242 06 333 2211', city: 'Brazzaville', address: 'Centre-ville', industry: 'Commerce', agent: 0 },
      { type: 'individual', firstName: 'Jean', lastName: 'Mabiala', email: 'jean.mabiala@gmail.com', phone: '+242 06 111 0001', city: 'Brazzaville', address: 'Bacongo', industry: 'Particulier', agent: 2 },
      { type: 'individual', firstName: 'Sophie', lastName: 'Bouanga', email: 'sophie.b@yahoo.fr', phone: '+242 06 111 0002', city: 'Brazzaville', address: 'Poto-Poto', industry: 'Particulier', agent: 1 },
      { type: 'company', companyName: 'Radisson Blu Kin', email: 'sales@radisson-kin.cd', phone: '+243 81 234 5678', city: 'Kinshasa', address: 'Bd. du 30 juin', industry: 'Hôtellerie', agent: 3 },
      { type: 'company', companyName: 'Le Chalet Kin', email: 'reservation@chalet-kin.cd', phone: '+243 99 777 8888', city: 'Kinshasa', address: 'Gombe', industry: 'Restauration', agent: 4 },
      { type: 'individual', firstName: 'David', lastName: 'Kasongo', email: 'd.kasongo@gmail.com', phone: '+243 99 111 2233', city: 'Kinshasa', address: 'Lemba', industry: 'Particulier', agent: 3 },
    ];
    let custCount = 0;
    const customerIds: number[] = [];
    for (const c of customers) {
      const name = c.type === 'company' ? c.companyName : `${c.firstName} ${c.lastName}`;
      const r = await query('INSERT INTO customers (type, first_name, last_name, company_name, name, email, phone, address, city, industry, agent_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id',
        [c.type, c.firstName || null, c.lastName || null, c.companyName || null, name, c.email, c.phone, c.address, c.city, c.industry, agentUids[c.agent]]);
      customerIds.push(r.rows[0].id);
      custCount++;
    }
    summary.customers = custCount;

    // 6) Leads
    const leads = [
      { type: 'company', companyName: 'Brasseries du Congo', email: 'contact@brasseries.cg', phone: '+242 06 200 0001', source: 'Salon Pro', status: 'Nouveau', city: 'Brazzaville', niu: 'P230077777', agent: 0 },
      { type: 'company', companyName: 'Total Energies CG', email: 'b2b@totalenergies.cg', phone: '+242 05 100 2233', source: 'Référence', status: 'Qualifié', city: 'Pointe-Noire', niu: 'P230088888', agent: 1 },
      { type: 'individual', firstName: 'Patrick', lastName: 'Ngouma', email: 'patrick.ngouma@hotmail.com', phone: '+242 06 444 0011', source: 'Site web', status: 'Nouveau', city: 'Brazzaville', agent: 2 },
      { type: 'company', companyName: 'BGFI Bank Kin', email: 'corp@bgfibank.cd', phone: '+243 81 555 0001', source: 'LinkedIn', status: 'Qualifié', city: 'Kinshasa', niu: 'A0111222333', agent: 3 },
      { type: 'company', companyName: 'Vodacom RDC', email: 'partners@vodacom.cd', phone: '+243 82 999 0001', source: 'Salon Pro', status: 'Nouveau', city: 'Kinshasa', agent: 4 },
      { type: 'individual', firstName: 'Claire', lastName: 'Lokondo', email: 'c.lokondo@gmail.com', phone: '+243 99 444 5566', source: 'Pub Facebook', status: 'Nouveau', city: 'Lubumbashi', agent: 4 },
      { type: 'company', companyName: 'Société Générale Congo', email: 'commercial@sgc.cg', phone: '+242 06 700 0001', source: 'Téléprospection', status: 'En cours', city: 'Brazzaville', niu: 'P230099999', agent: 0 },
    ];
    let leadCount = 0;
    for (const l of leads) {
      await query('INSERT INTO leads (type, first_name, last_name, company_name, email, phone, source, status, city, niu, agent_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',
        [l.type, l.firstName || null, l.lastName || null, l.companyName || null, l.email, l.phone, l.source, l.status, l.city, l.niu || null, agentUids[l.agent]]);
      leadCount++;
    }
    summary.leads = leadCount;

    // 7) Opportunities
    const opps = [
      { customer: 0, title: 'Déploiement CRM Hôtel Olympic', amount: 2500000, stage: 'Négociation', proba: 70 },
      { customer: 2, title: 'Module commercial Casino', amount: 800000, stage: 'Prospection', proba: 30 },
      { customer: 5, title: 'CRM complet Radisson Kin', amount: 4500000, stage: 'Proposition', proba: 60 },
      { customer: 1, title: 'Solution restaurant Massamba', amount: 600000, stage: 'Découverte', proba: 20 },
      { customer: 6, title: 'Pack Premium Le Chalet', amount: 1200000, stage: 'Négociation', proba: 80 },
    ];
    let oppCount = 0;
    for (const o of opps) {
      const cd = new Date(); cd.setMonth(cd.getMonth() + 2);
      await query('INSERT INTO opportunities (customer_id, title, amount, stage, probability, expected_close_date) VALUES ($1,$2,$3,$4,$5,$6)',
        [customerIds[o.customer], o.title, o.amount, o.stage, o.proba, cd.toISOString().split('T')[0]]);
      oppCount++;
    }
    summary.opportunities = oppCount;

    // 8) Quotes (with items)
    const quotes = [
      { customer: 0, agent: 0, status: 'Signé', amount: 2500000, days: -15, products: [[1, 1], [3, 2]] },
      { customer: 1, agent: 1, status: 'Envoyé', amount: 600000, days: -5, products: [[0, 1], [4, 6]] },
      { customer: 2, agent: 0, status: 'Brouillon', amount: 800000, days: -2, products: [[1, 1], [4, 4]] },
      { customer: 3, agent: 2, status: 'Signé', amount: 200000, days: -20, products: [[0, 1]] },
      { customer: 4, agent: 1, status: 'Refusé', amount: 350000, days: -10, products: [[3, 1], [4, 1]] },
      { customer: 5, agent: 3, status: 'Envoyé', amount: 4500000, days: -7, products: [[2, 1], [7, 1]] },
      { customer: 6, agent: 4, status: 'Signé', amount: 1200000, days: -25, products: [[1, 2], [4, 4]] },
      { customer: 7, agent: 3, status: 'Brouillon', amount: 150000, days: -1, products: [[0, 1]] },
    ];
    let qCount = 0;
    const quoteIds: number[] = [];
    for (const [idx, q] of quotes.entries()) {
      const date = new Date(); date.setDate(date.getDate() + q.days);
      const expiry = new Date(date); expiry.setDate(expiry.getDate() + 30);
      const number = `QT-2026-${String(100 + idx).padStart(3, '0')}`;
      const sigDate = q.status === 'Signé' ? new Date(date.getTime() + 5*24*60*60*1000).toISOString() : null;
      const r = await query("INSERT INTO quotes (number, customer_id, agent_id, amount, status, date, expiry_date, signature_date, signed_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id",
        [number, customerIds[q.customer], agentUids[q.agent], q.amount, q.status, date.toISOString().split('T')[0], expiry.toISOString().split('T')[0], sigDate, q.status === 'Signé' ? 'Client' : null]);
      const qid = r.rows[0].id;
      quoteIds.push(qid);
      for (const [pIdx, qty] of q.products) {
        const product = products[pIdx];
        await query("INSERT INTO quote_items (quote_id, product_id, description, quantity, unit_price, total_price) VALUES ($1,$2,$3,$4,$5,$6)",
          [qid, productIds[pIdx], product.name, qty, product.price, product.price * qty]);
      }
      qCount++;
    }
    summary.quotes = qCount;

    // 9) Invoices (from signed quotes)
    let invCount = 0;
    const invoiceIds: number[] = [];
    for (const [idx, q] of quotes.entries()) {
      if (q.status !== 'Signé') continue;
      const date = new Date(); date.setDate(date.getDate() + q.days + 5);
      const due = new Date(date); due.setDate(due.getDate() + 30);
      const status = idx % 2 === 0 ? 'Payée' : 'En attente';
      const num = `F-2026-${String(100 + idx).padStart(3, '0')}`;
      const r = await query("INSERT INTO invoices (number, customer_id, quote_id, agent_id, amount, status, date, due_date, paid_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id",
        [num, customerIds[q.customer], quoteIds[idx], agentUids[q.agent], q.amount, status, date.toISOString().split('T')[0], due.toISOString().split('T')[0], status === 'Payée' ? new Date().toISOString() : null]);
      invoiceIds.push(r.rows[0].id);
      invCount++;
    }
    summary.invoices = invCount;

    // 10) Activities (calls, RDV, emails) — generate ~20 spread across agents
    const types = ['Appel', 'RDV', 'Email', 'Réunion', 'Tâche'];
    const subjects = ['Premier contact', 'Démo produit', 'Suivi devis', 'Relance commerciale', 'RDV signature', 'Présentation', 'Closing', 'Onboarding'];
    let actCount = 0;
    for (let i = 0; i < 25; i++) {
      const agentIdx = i % agentUids.length;
      const date = new Date(); date.setDate(date.getDate() - (i % 30) + 5);
      const status = i % 3 === 0 ? 'Terminé' : 'À faire';
      const type = types[i % types.length];
      const subject = subjects[i % subjects.length];
      const customerId = customerIds[i % customerIds.length];
      await query("INSERT INTO activities (type, subject, customer_id, agent_id, status, date, notes) VALUES ($1,$2,$3,$4,$5,$6,$7)",
        [type, `${subject} #${i+1}`, customerId, agentUids[agentIdx], status, date.toISOString(), `Activité créée par seed - ${type}`]);
      actCount++;
    }
    summary.activities = actCount;

    // 11) Objectives (per agent)
    const startMonth = new Date(); startMonth.setDate(1);
    const endMonth = new Date(startMonth); endMonth.setMonth(endMonth.getMonth() + 1); endMonth.setDate(0);
    let objCount = 0;
    for (const uid of agentUids) {
      await query("INSERT INTO objectives (agent_id, type, target_value, period, start_date, end_date, status) VALUES ($1,'revenue',$2,'monthly',$3,$4,'En cours')",
        [uid, 5000000, startMonth.toISOString().split('T')[0], endMonth.toISOString().split('T')[0]]);
      await query("INSERT INTO objectives (agent_id, type, target_value, period, start_date, end_date, status) VALUES ($1,'calls',30,'monthly',$2,$3,'En cours')",
        [uid, startMonth.toISOString().split('T')[0], endMonth.toISOString().split('T')[0]]);
      await query("INSERT INTO objectives (agent_id, type, target_value, period, start_date, end_date, status) VALUES ($1,'quotes',10,'monthly',$2,$3,'En cours')",
        [uid, startMonth.toISOString().split('T')[0], endMonth.toISOString().split('T')[0]]);
      objCount += 3;
    }
    summary.objectives = objCount;

    // 12) Commissions (20% on paid invoices)
    let cmCount = 0;
    for (const [idx, q] of quotes.entries()) {
      if (q.status !== 'Signé') continue;
      const invIndex = invoiceIds.findIndex((_, i) => i === cmCount);
      if (invIndex < 0) break;
      const date = new Date(); date.setDate(date.getDate() + q.days + 10);
      const rate = 20;
      const amt = Math.round(q.amount * rate / 100);
      await query("INSERT INTO commissions (agent_id, invoice_id, amount, rate, status, date) VALUES ($1,$2,$3,$4,$5,$6)",
        [agentUids[q.agent], invoiceIds[invIndex], amt, rate, idx % 2 === 0 ? 'Payé' : 'En attente', date.toISOString().split('T')[0]]);
      cmCount++;
    }
    summary.commissions = cmCount;

    // 13) Projects
    let prjCount = 0;
    for (const [idx, c] of customers.entries()) {
      if (idx >= 3) break;
      const start = new Date(); start.setDate(start.getDate() - 30);
      const end = new Date(start); end.setMonth(end.getMonth() + 3);
      await query("INSERT INTO projects (name, customer_id, status, start_date, end_date, description) VALUES ($1,$2,$3,$4,$5,$6)",
        [`Déploiement CRM ${c.companyName || c.firstName}`, customerIds[idx], 'En cours', start.toISOString().split('T')[0], end.toISOString().split('T')[0], 'Implémentation et formation utilisateurs']);
      prjCount++;
    }
    summary.projects = prjCount;

    res.json({ success: true, message: "Données de démonstration créées avec succès", summary });
  } catch (err: any) {
    console.error("Seed error:", err);
    res.status(500).json({ error: "Server error: " + err.message });
  }
});

// Admin: Purge all CRM data (keep only admin user)
app.post("/api/admin/purge", authenticateToken, async (req: any, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'superadmin') return res.status(403).json({ error: "Forbidden" });
  try {
    // Order matters due to foreign keys
    await query("DELETE FROM quote_items");
    await query("DELETE FROM commissions");
    await query("DELETE FROM activities");
    await query("DELETE FROM objectives");
    await query("DELETE FROM documents");
    await query("DELETE FROM sessions");
    await query("DELETE FROM invoices");
    await query("DELETE FROM quotes");
    await query("DELETE FROM calls");
    await query("DELETE FROM opportunities");
    await query("DELETE FROM leads");
    await query("DELETE FROM portfolio_items");
    await query("DELETE FROM products");
    await query("DELETE FROM projects");
    await query("DELETE FROM customers");
    await query("DELETE FROM categories");
    await query("DELETE FROM catalogues");
    await query("DELETE FROM vat_rates");
    // Delete non-admin users
    await query("DELETE FROM users WHERE email != 'eden@tbi-center.fr'");
    res.json({ success: true, message: "All CRM data purged. Only admin account remains." });
  } catch (err: any) {
    console.error("Purge error:", err);
    res.status(500).json({ error: "Server error", details: err.message });
  }
});

// Documents Routes
app.get("/api/documents", authenticateToken, async (req, res) => {
  try {
    const result = await query('SELECT id, name, file_name, file_type, file_size, customer_id, quote_id, invoice_id, uploaded_by, notes, created_at as "createdAt" FROM documents ORDER BY created_at DESC');
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: "Server error" }); }
});

app.get("/api/documents/:id", authenticateToken, async (req, res) => {
  try {
    const result = await query("SELECT * FROM documents WHERE id = $1", [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: "Document not found" });
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: "Server error" }); }
});

app.post("/api/documents", authenticateToken, async (req: any, res) => {
  const { name, fileName, fileType, fileSize, fileData, customerId, quoteId, invoiceId, notes } = req.body;
  if (!name || !fileName || !fileData) return res.status(400).json({ error: "Name, fileName and fileData are required" });
  try {
    const result = await query(
      'INSERT INTO documents (name, file_name, file_type, file_size, file_data, customer_id, quote_id, invoice_id, uploaded_by, notes) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id, name, file_name, file_type, file_size, customer_id, quote_id, invoice_id, uploaded_by, notes, created_at as "createdAt"',
      [name, fileName, fileType, fileSize, fileData, customerId || null, quoteId || null, invoiceId || null, req.user.uid, notes]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: "Server error" }); }
});

app.delete("/api/documents/:id", authenticateToken, async (req, res) => {
  try {
    await query("DELETE FROM documents WHERE id = $1", [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: "Server error" }); }
});

// Reports - Agents submit, Admin reviews
app.get("/api/reports", authenticateToken, async (req: any, res) => {
  try {
    let q = 'SELECT r.*, (SELECT COUNT(*) FROM report_comments rc WHERE rc.report_id = r.id) as "commentsCount" FROM reports r';
    let params: any[] = [];
    if (req.user.role !== 'admin' && req.user.role !== 'superadmin') {
      q += ' WHERE r.agent_id = $1'; params.push(req.user.uid);
    }
    q += ' ORDER BY r.created_at DESC';
    res.json((await query(q, params)).rows);
  } catch (err) { res.status(500).json({ error: "Server error" }); }
});

app.get("/api/reports/:id", authenticateToken, async (req: any, res) => {
  try {
    const r = await query("SELECT * FROM reports WHERE id = $1", [req.params.id]);
    if (r.rows.length === 0) return res.status(404).json({ error: "Report not found" });
    const report = r.rows[0];
    if (req.user.role !== 'admin' && req.user.role !== 'superadmin' && report.agent_id !== req.user.uid) {
      return res.status(403).json({ error: "Forbidden" });
    }
    const comments = await query('SELECT * FROM report_comments WHERE report_id = $1 ORDER BY created_at ASC', [req.params.id]);
    res.json({ ...report, comments: comments.rows });
  } catch (err) { res.status(500).json({ error: "Server error" }); }
});

app.post("/api/reports", authenticateToken, async (req: any, res) => {
  const { title, periodStart, periodEnd, callsCount, meetingsCount, quotesCount, quotesAmount, newLeads, newCustomers, invoicesAmount, summary, challenges, nextActions } = req.body;
  if (!title || !periodStart || !periodEnd) return res.status(400).json({ error: "Title and period required" });
  try {
    const userR = await query("SELECT name FROM users WHERE uid = $1", [req.user.uid]);
    const agentName = userR.rows[0]?.name || 'Unknown';
    const result = await query(
      'INSERT INTO reports (agent_id, agent_name, title, period_start, period_end, calls_count, meetings_count, quotes_count, quotes_amount, new_leads, new_customers, invoices_amount, summary, challenges, next_actions) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *',
      [req.user.uid, agentName, title, periodStart, periodEnd, callsCount || 0, meetingsCount || 0, quotesCount || 0, quotesAmount || 0, newLeads || 0, newCustomers || 0, invoicesAmount || 0, summary, challenges, nextActions]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: "Server error" }); }
});

app.put("/api/reports/:id/status", authenticateToken, async (req: any, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'superadmin') return res.status(403).json({ error: "Forbidden" });
  const { status } = req.body;
  try {
    await query("UPDATE reports SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2", [status, req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: "Server error" }); }
});

app.delete("/api/reports/:id", authenticateToken, async (req: any, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'superadmin') return res.status(403).json({ error: "Forbidden" });
  try { await query("DELETE FROM reports WHERE id = $1", [req.params.id]); res.json({ success: true }); } catch (err) { res.status(500).json({ error: "Server error" }); }
});

// Report Comments
app.post("/api/reports/:id/comments", authenticateToken, async (req: any, res) => {
  const { content } = req.body;
  if (!content) return res.status(400).json({ error: "Content required" });
  try {
    const userR = await query("SELECT name, role FROM users WHERE uid = $1", [req.user.uid]);
    const u = userR.rows[0];
    const result = await query(
      'INSERT INTO report_comments (report_id, author_id, author_name, author_role, content) VALUES ($1,$2,$3,$4,$5) RETURNING *',
      [req.params.id, req.user.uid, u?.name || 'Unknown', u?.role || 'agent', content]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: "Server error" }); }
});

// User Activity Tracking (Admin only)
app.get("/api/admin/user-activity", authenticateToken, async (req: any, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'superadmin') return res.status(403).json({ error: "Forbidden" });
  try {
    const users = (await query('SELECT uid, name, email, role, account_type, is_active, first_login_at, created_at FROM users ORDER BY created_at DESC')).rows;
    const activity = await Promise.all(users.map(async (u: any) => {
      const lastSession = (await query('SELECT logged_in_at, ip_address, user_agent FROM sessions WHERE user_uid = $1 ORDER BY logged_in_at DESC LIMIT 1', [u.uid])).rows[0];
      const sessionCount = (await query('SELECT COUNT(*) as count FROM sessions WHERE user_uid = $1', [u.uid])).rows[0].count;
      const recentActions = [];
      const leads = (await query('SELECT COUNT(*) as c FROM leads WHERE agent_id = $1', [u.uid])).rows[0].c;
      const customers = (await query('SELECT COUNT(*) as c FROM customers WHERE agent_id = $1', [u.uid])).rows[0].c;
      const quotes = (await query('SELECT COUNT(*) as c FROM quotes WHERE agent_id = $1', [u.uid])).rows[0].c;
      const activities = (await query('SELECT COUNT(*) as c FROM activities WHERE agent_id = $1', [u.uid])).rows[0].c;
      const reports = (await query('SELECT COUNT(*) as c FROM reports WHERE agent_id = $1', [u.uid])).rows[0].c;
      return {
        ...u,
        lastSession: lastSession || null,
        sessionCount: parseInt(sessionCount),
        stats: { leads: parseInt(leads), customers: parseInt(customers), quotes: parseInt(quotes), activities: parseInt(activities), reports: parseInt(reports) }
      };
    }));
    res.json(activity);
  } catch (err) { res.status(500).json({ error: "Server error" }); }
});

// =====================================================================
// AGENT PAYMENTS DASHBOARD — paid quotes + commission + SmartDesk status
// =====================================================================
app.get("/api/agent/payments", authenticateToken, async (req: any, res) => {
  try {
    const isAdminLike = req.user.role === 'admin' || req.user.role === 'superadmin';
    const params: any[] = [];
    let whereAgent = "";
    if (!isAdminLike) {
      whereAgent = "AND q.agent_id = $1";
      params.push(req.user.uid);
    }
    const sql = `
      SELECT 
        q.id, q.number, q.amount, q.date, q.agent_id,
        q.payment_status, q.payment_id, q.payment_method, q.payment_date,
        q.payment_amount, q.payment_currency, q.subscription_id,
        c.name AS customer_name, c.email AS customer_email, c.company_name AS customer_company,
        u.name AS agent_name,
        (SELECT COUNT(*) FROM quote_items qi LEFT JOIN products p ON qi.product_id = p.id
          WHERE qi.quote_id = q.id AND LOWER(COALESCE(p.name, qi.description, '')) LIKE '%smartdesk%') > 0 AS has_smartdesk,
        (SELECT MAX(d.created_at) FROM documents d WHERE d.quote_id = q.id AND d.tag = 'smartdesk_provisioned') AS smartdesk_provisioned_at,
        (SELECT cm.amount FROM commissions cm WHERE cm.invoice_id IN (SELECT i.id FROM invoices i WHERE i.quote_id = q.id) AND cm.agent_id = q.agent_id LIMIT 1) AS commission_amount,
        (SELECT cm.status FROM commissions cm WHERE cm.invoice_id IN (SELECT i.id FROM invoices i WHERE i.quote_id = q.id) AND cm.agent_id = q.agent_id LIMIT 1) AS commission_status,
        (SELECT cm.rate FROM commissions cm WHERE cm.invoice_id IN (SELECT i.id FROM invoices i WHERE i.quote_id = q.id) AND cm.agent_id = q.agent_id LIMIT 1) AS commission_rate
      FROM quotes q
      LEFT JOIN customers c ON q.customer_id = c.id
      LEFT JOIN users u ON q.agent_id = u.uid
      WHERE q.payment_status = 'PAID' ${whereAgent}
      ORDER BY q.payment_date DESC NULLS LAST, q.id DESC
    `;
    const r = await query(sql, params);
    res.json(r.rows);
  } catch (err: any) {
    console.error('agent/payments error', err);
    res.status(500).json({ error: err.message || 'Server error' });
  }
});

// Global error handler
app.use((err: any, req: any, res: any, next: any) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ error: "Internal server error" });
});

export default app;
