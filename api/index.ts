import express from "express";
import pg from "pg";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import cookieParser from "cookie-parser";

const JWT_SECRET = process.env.JWT_SECRET || "smart-business-secret-key";

// PostgreSQL connection pool (singleton for serverless)
let pool: pg.Pool | null = null;
function getPool(): pg.Pool {
  if (!pool) {
    pool = new pg.Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
      max: 5,
    });
  }
  return pool;
}

async function query(text: string, params: any[] = []) {
  const p = getPool();
  return p.query(text, params);
}

// Auth middleware
const authenticateToken = (req: any, res: any, next: any) => {
  const token = req.cookies?.token;
  if (!token) return res.status(401).json({ error: "Unauthorized" });
  jwt.verify(token, JWT_SECRET, (err: any, user: any) => {
    if (err) return res.status(403).json({ error: "Forbidden" });
    req.user = user;
    next();
  });
};

// Create Express app
const app = express();
app.use(express.json());
app.use(cookieParser());

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
    res.cookie("token", token, { httpOnly: true, secure: true, sameSite: 'none' });
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
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) return res.status(400).json({ error: "Invalid password" });
    const token = jwt.sign({ uid: user.uid, role: user.role }, JWT_SECRET);
    res.cookie("token", token, { httpOnly: true, secure: true, sameSite: 'none' });
    res.json({ uid: user.uid, email: user.email, name: user.name, role: user.role });
  } catch (err: any) {
    console.error("Login error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

app.post("/api/auth/logout", (req, res) => { res.clearCookie("token"); res.json({ success: true }); });

app.get("/api/auth/me", authenticateToken, async (req: any, res) => {
  try {
    const result = await query('SELECT uid, email, name, role, created_at as "createdAt" FROM users WHERE uid = $1', [req.user.uid]);
    if (result.rows.length === 0) return res.status(404).json({ error: "User not found" });
    res.json(result.rows[0]);
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
app.get("/api/portfolio-items", authenticateToken, async (req, res) => {
  try { res.json((await query("SELECT * FROM portfolio_items ORDER BY name ASC")).rows); } catch (err) { res.status(500).json({ error: "Server error" }); }
});
app.get("/api/categories/:categoryId/items", authenticateToken, async (req, res) => {
  try { res.json((await query("SELECT * FROM portfolio_items WHERE category_id = $1 ORDER BY name ASC", [req.params.categoryId])).rows); } catch (err) { res.status(500).json({ error: "Server error" }); }
});
app.post("/api/portfolio-items", authenticateToken, async (req, res) => {
  const { category_id, name, sub_type, address, city, bp, tel, fax, mail, web } = req.body;
  if (!category_id || !name) return res.status(400).json({ error: "Category ID and Name are required" });
  try { res.status(201).json((await query("INSERT INTO portfolio_items (category_id, name, sub_type, address, city, bp, tel, fax, mail, web) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *", [category_id, name, sub_type, address, city, bp, tel, fax, mail, web])).rows[0]); } catch (err) { res.status(500).json({ error: "Server error" }); }
});

// Users (Admin)
app.get("/api/users", authenticateToken, async (req: any, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: "Forbidden" });
  try { res.json((await query('SELECT uid, email, name, role, created_at as "createdAt" FROM users ORDER BY created_at DESC')).rows); } catch (err) { res.status(500).json({ error: "Server error" }); }
});
app.post("/api/users", authenticateToken, async (req: any, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: "Forbidden" });
  const { email, password, name, role } = req.body;
  if (!email || !password || !name || !role) return res.status(400).json({ error: "Missing required fields" });
  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const uid = Math.random().toString(36).substring(2, 15);
    res.json((await query('INSERT INTO users (uid, email, password, name, role) VALUES ($1,$2,$3,$4,$5) RETURNING uid, email, name, role, created_at as "createdAt"', [uid, email, hashedPassword, name, role])).rows[0]);
  } catch (err) { res.status(400).json({ error: "Email already exists" }); }
});
app.put("/api/users/:uid/role", authenticateToken, async (req: any, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: "Forbidden" });
  const { uid } = req.params; const { role } = req.body;
  try {
    const u = await query("SELECT email FROM users WHERE uid = $1", [uid]);
    if (u.rows.length > 0 && u.rows[0].email === 'eden@tbi-center.fr') return res.status(400).json({ error: "Cannot change main admin role" });
    await query("UPDATE users SET role = $1 WHERE uid = $2", [role, uid]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: "Server error" }); }
});
app.delete("/api/users/:uid", authenticateToken, async (req: any, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: "Forbidden" });
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
  if (req.user.role !== 'admin') return res.status(403).json({ error: "Forbidden" });
  try {
    const [callsRes, customersRes, usersRes] = await Promise.all([
      query("SELECT status, agent_name FROM calls"), query("SELECT count(*) FROM customers"), query("SELECT uid, name FROM users WHERE role = 'agent'")
    ]);
    const calls = callsRes.rows; const totalCustomers = parseInt(customersRes.rows[0].count); const agents = usersRes.rows;
    res.json({ totalCalls: calls.length, completedCalls: calls.filter(c => c.status === 'completed').length, pendingCalls: calls.filter(c => c.status === 'pending').length, totalCustomers, agentPerformance: agents.map(a => ({ name: a.name, calls: calls.filter(c => c.agent_name === a.name).length, completed: calls.filter(c => c.agent_name === a.name && c.status === 'completed').length })) });
  } catch (err) { res.status(500).json({ error: "Server error" }); }
});

// Customers
app.get("/api/customers", authenticateToken, async (req, res) => {
  try { res.json((await query('SELECT id, type, first_name as "firstName", last_name as "lastName", company_name as "companyName", name, email, phone, address, city, industry, created_at as "createdAt", updated_at as "updatedAt" FROM customers ORDER BY created_at DESC')).rows); } catch (err) { res.status(500).json({ error: "Server error" }); }
});
app.post("/api/customers", authenticateToken, async (req, res) => {
  const { type, firstName, lastName, companyName, email, phone, address, city, industry } = req.body;
  const name = type === 'company' ? companyName : `${firstName} ${lastName}`;
  try { res.status(201).json((await query('INSERT INTO customers (type, first_name, last_name, company_name, name, email, phone, address, city, industry) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id, type, first_name as "firstName", last_name as "lastName", company_name as "companyName", name, email, phone, address, city, industry, created_at as "createdAt"', [type || 'individual', firstName, lastName, companyName, name, email, phone, address, city, industry])).rows[0]); } catch (err) { res.status(500).json({ error: "Server error" }); }
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
app.delete("/api/customers/:id", authenticateToken, async (req, res) => {
  try { await query("DELETE FROM customers WHERE id = $1", [req.params.id]); res.json({ success: true }); } catch (err) { res.status(500).json({ error: "Server error" }); }
});

// Leads
app.get("/api/leads", authenticateToken, async (req, res) => {
  try { res.json((await query('SELECT id, type, first_name as "firstName", last_name as "lastName", company_name as "companyName", email, phone, source, status, notes, created_at as "createdAt", updated_at as "updatedAt" FROM leads ORDER BY created_at DESC')).rows); } catch (err) { res.status(500).json({ error: "Server error" }); }
});
app.post("/api/leads", authenticateToken, async (req: any, res) => {
  const { type, firstName, lastName, companyName, email, phone, source, status, notes } = req.body;
  try {
    const result = await query('INSERT INTO leads (type, first_name, last_name, company_name, email, phone, source, status, notes) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id, type, first_name as "firstName", last_name as "lastName", company_name as "companyName", email, phone, source, status, notes, created_at as "createdAt"', [type || 'individual', firstName, lastName, companyName, email, phone, source, status || 'Nouveau', notes]);
    const leadId = result.rows[0].id;
    try { const d = new Date(); d.setDate(d.getDate() + 1); await query("INSERT INTO activities (type, subject, lead_id, agent_id, status, date, notes) VALUES ($1,$2,$3,$4,$5,$6,$7)", ['Appel', `Premier contact - Lead #${leadId}`, leadId, req.user.uid, 'À faire', d.toISOString(), `Contacter: ${type === 'company' ? companyName : firstName + ' ' + lastName}`]); } catch (e) {}
    res.status(201).json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: "Server error" }); }
});
app.put("/api/leads/:id", authenticateToken, async (req, res) => {
  const { id } = req.params; const { type, firstName, lastName, companyName, email, phone, source, status, notes } = req.body;
  try {
    const result = await query('UPDATE leads SET type=$1, first_name=$2, last_name=$3, company_name=$4, email=$5, phone=$6, source=$7, status=$8, notes=$9, updated_at=CURRENT_TIMESTAMP WHERE id=$10 RETURNING id, type, first_name as "firstName", last_name as "lastName", company_name as "companyName", email, phone, source, status, notes, updated_at as "updatedAt"', [type, firstName, lastName, companyName, email, phone, source, status, notes, id]);
    if (result.rows.length === 0) return res.status(404).json({ error: "Lead not found" });
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: "Server error" }); }
});
app.delete("/api/leads/:id", authenticateToken, async (req, res) => {
  try { await query("DELETE FROM leads WHERE id = $1", [req.params.id]); res.json({ success: true }); } catch (err) { res.status(500).json({ error: "Server error" }); }
});

// Opportunities
app.get("/api/opportunities", authenticateToken, async (req, res) => {
  try { res.json((await query('SELECT o.id, o.customer_id as "customerId", o.lead_id as "leadId", o.title, o.amount, o.stage, o.probability, o.expected_close_date as "expectedCloseDate", o.notes, o.created_at as "createdAt", o.updated_at as "updatedAt", c.name as "customerName", CASE WHEN l.type = \'company\' THEN l.company_name ELSE COALESCE(l.first_name,\'\') || \' \' || COALESCE(l.last_name,\'\') END as "leadName" FROM opportunities o LEFT JOIN customers c ON o.customer_id = c.id LEFT JOIN leads l ON o.lead_id = l.id ORDER BY o.created_at DESC')).rows); } catch (err) { res.status(500).json({ error: "Server error" }); }
});
app.post("/api/opportunities", authenticateToken, async (req: any, res) => {
  const { customerId, leadId, title, amount, stage, probability, expectedCloseDate, notes } = req.body;
  try {
    const result = await query('INSERT INTO opportunities (customer_id, lead_id, title, amount, stage, probability, expected_close_date, notes) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id, customer_id as "customerId", lead_id as "leadId", title, amount, stage, probability, expected_close_date as "expectedCloseDate", notes, created_at as "createdAt"', [customerId || null, leadId || null, title, amount, stage || 'Prospection', probability, expectedCloseDate, notes]);
    res.status(201).json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: "Server error" }); }
});
app.put("/api/opportunities/:id", authenticateToken, async (req, res) => {
  const { id } = req.params; const { customerId, leadId, title, amount, stage, probability, expectedCloseDate, notes } = req.body;
  try {
    const result = await query('UPDATE opportunities SET customer_id=$1, lead_id=$2, title=$3, amount=$4, stage=$5, probability=$6, expected_close_date=$7, notes=$8, updated_at=CURRENT_TIMESTAMP WHERE id=$9 RETURNING id, customer_id as "customerId", lead_id as "leadId", title, amount, stage, probability, expected_close_date as "expectedCloseDate", notes, updated_at as "updatedAt"', [customerId || null, leadId || null, title, amount, stage, probability, expectedCloseDate, notes, id]);
    if (result.rows.length === 0) return res.status(404).json({ error: "Opportunity not found" });
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: "Server error" }); }
});
app.delete("/api/opportunities/:id", authenticateToken, async (req, res) => {
  try { await query("DELETE FROM opportunities WHERE id = $1", [req.params.id]); res.json({ success: true }); } catch (err) { res.status(500).json({ error: "Server error" }); }
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
  if (req.user.role !== 'admin') return res.status(403).json({ error: "Forbidden" });
  try { res.status(201).json((await query("INSERT INTO vat_rates (label, rate) VALUES ($1, $2) RETURNING *", [req.body.label, parseFloat(req.body.rate)])).rows[0]); } catch (err) { res.status(500).json({ error: "Server error" }); }
});

// Catalogues
app.get("/api/catalogues", authenticateToken, async (req, res) => { try { res.json((await query("SELECT * FROM catalogues ORDER BY name ASC")).rows); } catch (err) { res.status(500).json({ error: "Server error" }); } });
app.post("/api/catalogues", authenticateToken, async (req: any, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: "Forbidden" });
  try { res.status(201).json((await query("INSERT INTO catalogues (name, description, is_active) VALUES ($1, $2, $3) RETURNING *", [req.body.name, req.body.description, req.body.is_active !== undefined ? req.body.is_active : 1])).rows[0]); } catch (err) { res.status(500).json({ error: "Server error" }); }
});

// Products
app.get("/api/products", authenticateToken, async (req, res) => {
  try { res.json((await query('SELECT p.*, c.name as "categoryName", cat.name as "catalogName" FROM products p LEFT JOIN categories c ON p.category_id = c.id LEFT JOIN catalogues cat ON p.catalog_id = cat.id ORDER BY p.name ASC')).rows); } catch (err) { res.status(500).json({ error: "Server error" }); }
});
app.post("/api/products", authenticateToken, async (req: any, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: "Forbidden" });
  const { name, type, category, categoryId, catalogId, price, vatRate, vatRateId, stock, unit, description, technicalFileUrl } = req.body;
  try { res.status(201).json((await query("INSERT INTO products (name, type, category, category_id, catalog_id, price, vat_rate, vat_rate_id, stock, unit, description, technical_file_url) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *", [name, type || 'product', category, categoryId, catalogId, price, vatRate || 20, vatRateId, stock || 0, unit, description, technicalFileUrl])).rows[0]); } catch (err) { res.status(500).json({ error: "Server error" }); }
});

// Quotes
app.get("/api/quotes", authenticateToken, async (req: any, res) => {
  try {
    let q = 'SELECT q.*, c.name as "customerName", l.first_name || \' \' || l.last_name as "leadName", u.name as "agentName" FROM quotes q LEFT JOIN customers c ON q.customer_id = c.id LEFT JOIN leads l ON q.lead_id = l.id LEFT JOIN users u ON q.agent_id = u.uid';
    let params: any[] = [];
    if (req.user.role !== 'admin') { q += ' WHERE q.agent_id = $1'; params.push(req.user.uid); }
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
app.post("/api/quotes", authenticateToken, async (req: any, res) => {
  const { number, customerId, leadId, amount, status, date, expiryDate, notes, items } = req.body;
  try {
    const result = await query("INSERT INTO quotes (number, customer_id, lead_id, agent_id, amount, status, date, expiry_date, notes) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id", [number, customerId === "" ? null : customerId, leadId === "" ? null : leadId, req.user.uid, amount, status || 'Brouillon', date, expiryDate, notes]);
    const quoteId = result.rows[0].id;
    if (items?.length > 0) { for (const item of items) { await query("INSERT INTO quote_items (quote_id, product_id, description, quantity, unit_price, total_price) VALUES ($1,$2,$3,$4,$5,$6)", [quoteId, item.productId === "" ? null : item.productId, item.description, item.quantity, item.unitPrice, item.totalPrice]); } }
    res.status(201).json({ id: quoteId });
  } catch (err) { res.status(500).json({ error: "Server error" }); }
});
app.put("/api/quotes/:id", authenticateToken, async (req, res) => {
  const { id } = req.params; const { amount, status, date, expiryDate, notes, items } = req.body;
  try {
    await query("UPDATE quotes SET amount=$1, status=$2, date=$3, expiry_date=$4, notes=$5, updated_at=CURRENT_TIMESTAMP WHERE id=$6", [amount, status, date, expiryDate, notes, id]);
    if (items) { await query("DELETE FROM quote_items WHERE quote_id = $1", [id]); for (const item of items) { await query("INSERT INTO quote_items (quote_id, product_id, description, quantity, unit_price, total_price) VALUES ($1,$2,$3,$4,$5,$6)", [id, item.productId === "" ? null : item.productId, item.description, item.quantity, item.unitPrice, item.totalPrice]); } }
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: "Server error" }); }
});

// Public Quotes (no auth)
app.get("/api/public/quotes/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const qr = await query('SELECT q.*, c.name as "customerName", c.email as "customerEmail", c.phone as "customerPhone", l.first_name || \' \' || l.last_name as "leadName", l.email as "leadEmail", l.phone as "leadPhone" FROM quotes q LEFT JOIN customers c ON q.customer_id = c.id LEFT JOIN leads l ON q.lead_id = l.id WHERE q.id = $1', [id]);
    if (qr.rows.length === 0) return res.status(404).json({ error: "Quote not found" });
    const items = await query("SELECT * FROM quote_items WHERE quote_id = $1", [id]);
    const quote = qr.rows[0];
    res.json({ ...quote, customerName: quote.customerName || quote.leadName, customerEmail: quote.customerEmail || quote.leadEmail, customerPhone: quote.customerPhone || quote.leadPhone, items: items.rows });
  } catch (err) { res.status(500).json({ error: "Server error" }); }
});
app.post("/api/public/quotes/:id/sign", async (req, res) => {
  const { id } = req.params; const { signature, signedBy } = req.body;
  try { await query("UPDATE quotes SET signature=$1, signed_by=$2, signature_date=CURRENT_TIMESTAMP, status='Accepté' WHERE id=$3", [signature, signedBy, id]); res.json({ success: true }); } catch (err) { res.status(500).json({ error: "Server error" }); }
});

// Invoices
app.get("/api/invoices", authenticateToken, async (req: any, res) => {
  try {
    let q = 'SELECT i.*, c.name as "customerName", u.name as "agentName" FROM invoices i LEFT JOIN customers c ON i.customer_id = c.id LEFT JOIN users u ON i.agent_id = u.uid';
    let params: any[] = [];
    if (req.user.role !== 'admin') { q += ' WHERE i.agent_id = $1'; params.push(req.user.uid); }
    q += ' ORDER BY i.date DESC';
    res.json((await query(q, params)).rows.map(r => ({ ...r, dueDate: r.due_date, paidAt: r.paid_at })));
  } catch (err) { res.status(500).json({ error: "Server error" }); }
});
app.post("/api/invoices", authenticateToken, async (req: any, res) => {
  const { number, customerId, quoteId, amount, status, date, dueDate } = req.body;
  try { res.status(201).json({ id: (await query("INSERT INTO invoices (number, customer_id, quote_id, agent_id, amount, status, date, due_date) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id", [number, customerId === "" ? null : customerId, quoteId === "" ? null : quoteId, req.user.uid, amount, status || 'En attente', date, dueDate])).rows[0].id }); } catch (err) { res.status(500).json({ error: "Server error" }); }
});

// Commissions
app.get("/api/commissions", authenticateToken, async (req: any, res) => {
  try {
    let q = 'SELECT cm.*, u.name as "agentName", i.number as "invoiceNumber" FROM commissions cm LEFT JOIN users u ON cm.agent_id = u.uid LEFT JOIN invoices i ON cm.invoice_id = i.id';
    let params: any[] = [];
    if (req.user.role !== 'admin') { q += ' WHERE cm.agent_id = $1'; params.push(req.user.uid); }
    q += ' ORDER BY cm.date DESC';
    res.json((await query(q, params)).rows);
  } catch (err) { res.status(500).json({ error: "Server error" }); }
});
app.post("/api/commissions", authenticateToken, async (req: any, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: "Forbidden" });
  const { agentId, invoiceId, amount, rate, status, date } = req.body;
  try { res.status(201).json((await query('INSERT INTO commissions (agent_id, invoice_id, amount, rate, status, date) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, agent_id as "agentId", invoice_id as "invoiceId", amount, rate, status, date', [agentId, invoiceId || null, amount, rate, status || 'En attente', date])).rows[0]); } catch (err) { res.status(500).json({ error: "Server error" }); }
});
app.put("/api/commissions/:id", authenticateToken, async (req: any, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: "Forbidden" });
  const { id } = req.params; const { status } = req.body;
  try {
    const result = await query("UPDATE commissions SET status = $1 WHERE id = $2 RETURNING *", [status, id]);
    if (result.rows.length === 0) return res.status(404).json({ error: "Commission not found" });
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: "Server error" }); }
});

// Activities
app.get("/api/activities", authenticateToken, async (req, res) => {
  try {
    const result = await query('SELECT a.*, c.name as "customerName", l.first_name || \' \' || l.last_name as "leadName", o.title as "opportunityTitle", u.name as "agentName", u.role as "agentRole" FROM activities a LEFT JOIN customers c ON a.customer_id = c.id LEFT JOIN leads l ON a.lead_id = l.id LEFT JOIN opportunities o ON a.opportunity_id = o.id LEFT JOIN users u ON a.agent_id = u.uid ORDER BY a.date DESC');
    res.json(result.rows.map(r => ({ ...r, customerName: r.customerName || (r.leadName ? `Prospect: ${r.leadName}` : r.opportunityTitle || 'N/A') })));
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
    if (req.user.role !== 'admin') { q += ' WHERE o.agent_id = $1'; params.push(req.user.uid); }
    q += ' ORDER BY o.end_date DESC';
    res.json((await query(q, params)).rows);
  } catch (err) { res.status(500).json({ error: "Server error" }); }
});
app.get("/api/objectives/stats", authenticateToken, async (req: any, res) => {
  try {
    const oq = `SELECT o.*, u.name as "agentName" FROM objectives o LEFT JOIN users u ON o.agent_id = u.uid ${req.user.role !== 'admin' ? 'WHERE o.agent_id = $1' : ''}`;
    const objectives = await query(oq, req.user.role !== 'admin' ? [req.user.uid] : []);
    const stats = await Promise.all(objectives.rows.map(async (obj: any) => {
      let currentValue = 0; const { type, agent_id, start_date, end_date } = obj;
      if (type === 'revenue') { currentValue = (await query("SELECT SUM(amount) as total FROM invoices WHERE agent_id=$1 AND status='Payée' AND date BETWEEN $2 AND $3", [agent_id, start_date, end_date])).rows[0].total || 0; }
      else if (type === 'calls') { currentValue = (await query("SELECT COUNT(*) as count FROM activities WHERE agent_id=$1 AND type='Appel' AND date BETWEEN $2 AND $3", [agent_id, start_date, end_date])).rows[0].count || 0; }
      else if (type === 'meetings') { currentValue = (await query("SELECT COUNT(*) as count FROM activities WHERE agent_id=$1 AND type='RDV' AND date BETWEEN $2 AND $3", [agent_id, start_date, end_date])).rows[0].count || 0; }
      else if (type === 'quotes') { currentValue = (await query("SELECT COUNT(*) as count FROM quotes WHERE agent_id=$1 AND date BETWEEN $2 AND $3", [agent_id, start_date, end_date])).rows[0].count || 0; }
      return { ...obj, currentValue };
    }));
    res.json(stats);
  } catch (err) { res.status(500).json({ error: "Server error" }); }
});
app.post("/api/objectives", authenticateToken, async (req: any, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: "Forbidden" });
  const { agentId, type, targetValue, period, startDate, endDate, status } = req.body;
  try { res.status(201).json((await query('INSERT INTO objectives (agent_id, type, target_value, period, start_date, end_date, status) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id, agent_id as "agentId", type, target_value as "targetValue", period, start_date as "startDate", end_date as "endDate", status', [agentId, type, targetValue, period, startDate, endDate, status || 'En cours'])).rows[0]); } catch (err) { res.status(500).json({ error: "Server error" }); }
});
app.put("/api/objectives/:id", authenticateToken, async (req: any, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: "Forbidden" });
  const { id } = req.params; const { targetValue, status, endDate } = req.body;
  try {
    const result = await query("UPDATE objectives SET target_value=$1, status=$2, end_date=$3, updated_at=CURRENT_TIMESTAMP WHERE id=$4 RETURNING *", [targetValue, status, endDate, id]);
    if (result.rows.length === 0) return res.status(404).json({ error: "Objective not found" });
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: "Server error" }); }
});
app.delete("/api/objectives/:id", authenticateToken, async (req: any, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: "Forbidden" });
  try { await query("DELETE FROM objectives WHERE id = $1", [req.params.id]); res.status(204).send(); } catch (err) { res.status(500).json({ error: "Server error" }); }
});

// Projects
app.get("/api/projects", authenticateToken, async (req, res) => {
  try { res.json((await query('SELECT p.*, c.name as "customerName" FROM projects p LEFT JOIN customers c ON p.customer_id = c.id ORDER BY p.created_at DESC')).rows.map(r => ({ ...r, startDate: r.start_date, endDate: r.end_date }))); } catch (err) { res.status(500).json({ error: "Server error" }); }
});

// Debug
app.get("/api/debug/counts", async (req, res) => {
  try { res.json((await query("SELECT c.name, COUNT(p.id) as count FROM categories c LEFT JOIN portfolio_items p ON c.id = p.category_id GROUP BY c.name")).rows); } catch (err) { res.status(500).json({ error: err instanceof Error ? err.message : String(err) }); }
});

// CRM Automation
app.post("/api/leads/:id/convert-to-customer", authenticateToken, async (req, res) => {
  const { id } = req.params;
  try {
    const lr = await query("SELECT * FROM leads WHERE id = $1", [id]);
    if (lr.rows.length === 0) return res.status(404).json({ error: "Lead not found" });
    const lead = lr.rows[0];
    const cr = await query("INSERT INTO customers (type, first_name, last_name, company_name, email, phone, industry, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,CURRENT_TIMESTAMP) RETURNING id", [lead.type, lead.first_name, lead.last_name, lead.company_name, lead.email, lead.phone, 'Non spécifié']);
    const customerId = cr.rows[0].id;
    await query("UPDATE opportunities SET customer_id=$1, lead_id=NULL WHERE lead_id=$2", [customerId, id]);
    await query("UPDATE leads SET status='Converti', updated_at=CURRENT_TIMESTAMP WHERE id=$1", [id]);
    res.json({ success: true, customerId });
  } catch (err) { res.status(500).json({ error: "Server error" }); }
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

// Global error handler
app.use((err: any, req: any, res: any, next: any) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ error: "Internal server error" });
});

export default app;
