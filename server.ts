import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import url from "url";
import { fileURLToPath } from "url";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import cookieParser from "cookie-parser";
import dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isPlaceholderUrl = (url: string | undefined) => !url || url.includes('base');

// Database abstraction to handle both Postgres and SQLite
interface QueryResult {
  rows: any[];
}

class AppDatabase {
  private pgPool: any = null;
  private sqliteDb: any = null;
  private mode: 'postgres' | 'sqlite' = 'postgres';

  constructor() {
    const dbUrl = process.env.DATABASE_URL;
    const isPlaceholder = isPlaceholderUrl(dbUrl);

    if (isPlaceholder) {
      console.log("DATABASE_URL is missing or placeholder. Falling back to SQLite.");
      this.mode = 'sqlite';
    } else {
      this.mode = 'postgres';
    }
  }

  private async getPgPool() {
    if (!this.pgPool) {
      const pg = await import("pg");
      this.pgPool = new pg.default.Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false },
      });
      this.pgPool.on('error', (err: any) => {
        console.error('Unexpected error on idle Postgres client', err);
      });
    }
    return this.pgPool;
  }

  private async getSqliteDb() {
    if (!this.sqliteDb) {
      const Database = (await import("better-sqlite3")).default;
      this.sqliteDb = new Database(path.join(__dirname, "database.sqlite"));
    }
    return this.sqliteDb;
  }

  async query(text: string, params: any[] = []): Promise<QueryResult> {
    if (this.mode === 'postgres') {
      const pool = await this.getPgPool();
      // Add a timeout to prevent hanging on initial connection
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Postgres query timed out after 5s')), 5000);
      });

      try {
        return await Promise.race([
          pool.query(text, params),
          timeoutPromise
        ]) as QueryResult;
      } catch (err: any) {
        if (err.message.includes('getaddrinfo') || err.message.includes('EAI_AGAIN') || err.message.includes('timed out')) {
          console.error(`Postgres connection failed (${err.message}). Falling back to SQLite for this session.`);
          this.mode = 'sqlite';
          await this.initSqlite();
          return this.query(text, params);
        }
        throw err;
      }
    } else {
      const db = await this.getSqliteDb();
      // Convert Postgres syntax ($1, $2) to SQLite syntax (?, ?)
      const sqliteQuery = text.replace(/\$\d+/g, '?');
      
      // Handle some common PG-specific syntax
      let finalQuery = sqliteQuery
        .replace(/SERIAL PRIMARY KEY/gi, "INTEGER PRIMARY KEY AUTOINCREMENT")
        .replace(/TIMESTAMP WITH TIME ZONE/gi, "DATETIME")
        .replace(/CURRENT_TIMESTAMP/gi, "CURRENT_TIMESTAMP")
        .replace(/RETURNING .*/gi, ""); // SQLite doesn't support RETURNING in the same way

      const isInsert = finalQuery.trim().toUpperCase().startsWith("INSERT");
      const isDelete = finalQuery.trim().toUpperCase().startsWith("DELETE");
      const isUpdate = finalQuery.trim().toUpperCase().startsWith("UPDATE");

      if (isInsert || isDelete || isUpdate) {
        const stmt = db.prepare(finalQuery);
        const info = stmt.run(params);
        return { rows: [{ id: info.lastInsertRowid, changes: info.changes }] };
      } else {
        const stmt = db.prepare(finalQuery);
        const rows = stmt.all(params);
        return { rows: rows || [] };
      }
    }
  }

  async initSqlite() {
    console.log("Initializing SQLite schema...");
    const sqlite = await this.getSqliteDb();
    const schema = `
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        uid TEXT UNIQUE NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        name TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'agent',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS customers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT,
        phone TEXT NOT NULL,
        address TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS calls (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        customer_id INTEGER REFERENCES customers(id),
        customer_name TEXT NOT NULL,
        customer_phone TEXT NOT NULL,
        agent_id TEXT REFERENCES users(uid),
        agent_name TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        notes TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS categories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS portfolio_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        category_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        sub_type TEXT,
        address TEXT,
        city TEXT,
        bp TEXT,
        tel TEXT,
        fax TEXT,
        mail TEXT,
        web TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (category_id) REFERENCES categories (id)
      );
    `;
    
    // Split schema into individual statements for SQLite
    const statements = schema.split(';').filter(s => s.trim());
    for (const statement of statements) {
      sqlite.prepare(statement).run();
    }
    
    // Ensure the specific user is an admin
    console.log("SQLite database schema initialized");
  }

  getMode() {
    return this.mode;
  }
}

const db = new AppDatabase();

const JWT_SECRET = process.env.JWT_SECRET || "smart-business-secret-key";

async function initDb() {
  if (db.getMode() === 'sqlite') {
    await db.initSqlite();
    return;
  }

  console.log("Attempting to connect to Postgres database...");
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        uid TEXT UNIQUE NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        name TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'agent',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS customers (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT,
        phone TEXT NOT NULL,
        address TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS calls (
        id SERIAL PRIMARY KEY,
        customer_id INTEGER REFERENCES customers(id),
        customer_name TEXT NOT NULL,
        customer_phone TEXT NOT NULL,
        agent_id TEXT REFERENCES users(uid),
        agent_name TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        notes TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS categories (
        id SERIAL PRIMARY KEY,
        name TEXT UNIQUE NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS portfolio_items (
        id SERIAL PRIMARY KEY,
        category_id INTEGER NOT NULL REFERENCES categories(id),
        name TEXT NOT NULL,
        sub_type TEXT,
        address TEXT,
        city TEXT,
        bp TEXT,
        tel TEXT,
        fax TEXT,
        mail TEXT,
        web TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log("Postgres database schema initialized");
  } catch (err: any) {
    console.error("Failed to initialize Postgres database:", err.message);
    if (err.message.includes('getaddrinfo') || err.message.includes('EAI_AGAIN')) {
      console.log("Falling back to SQLite due to Postgres connection error.");
      await db.initSqlite();
    }
  }
}

async function seedAdmin() {
  const email = 'eden@tbi-center.fr';
  const password = 'loub@ki2014D';
  const name = 'Admin Eden';
  const role = 'admin';

  try {
    const result = await db.query("SELECT * FROM users WHERE email = $1", [email]);
    const hashedPassword = await bcrypt.hash(password, 10);

    if (result.rows.length === 0) {
      console.log(`Seeding admin user: ${email}`);
      const uid = Math.random().toString(36).substring(2, 15);
      await db.query(
        "INSERT INTO users (uid, email, password, name, role) VALUES ($1, $2, $3, $4, $5)",
        [uid, email, hashedPassword, name, role]
      );
    } else {
      console.log(`Updating admin user: ${email}`);
      await db.query(
        "UPDATE users SET password = $1, role = $2 WHERE email = $3",
        [hashedPassword, role, email]
      );
    }
  } catch (err) {
    console.error("Failed to seed admin user:", err);
  }
}

async function seedCategories() {
  const categories = [
    "ADMINISTRATIONS",
    "AGENCES IMMOBILIÈRES ET PROMOTION",
    "ALIMENTATION ET DISTRIBUTION",
    "ANIMAUX ET VÉTÉRINAIRES",
    "ASSISTANCE JURIDIQUE, COMPTABLE ET FISCALE",
    "ASSOCIATIONS",
    "ASSURANCES",
    "AUTOMOBILES",
    "BANQUES ET MICROFINANCES",
    "BÂTIMENTS ET TRAVAUX PUBLICS (BTP)",
    "BUREAUTIQUE ET INFORMATIQUE",
    "COIFFURE ET ESTHÉTIQUE",
    "COMMUNICATION, PRESSE ET MÉDIAS",
    "CONSEILS ET SERVICES",
    "COURRIER EXPRESS",
    "CULTURE ET LOISIRS",
    "ENSEIGNEMENT ET FORMATION",
    "GARDIENNAGE ET SÉCURITÉ",
    "HÔTELS",
    "IMPRIMERIES - LIBRAIRIES - PAPETERIES ET ÉQUIPEMENT DE BUREAU",
    "INDUSTRIES",
    "INFORMATIQUE - HIFI - PHOTO - VIDEO",
    "LOISIRS",
    "MÉDIAS",
    "PÉTROLE",
    "POUR LA MAISON",
    "PRESTATIONS DE SERVICES",
    "RESTAURANTS ET SORTIES",
    "SANTÉ",
    "SHOPPING",
    "SPORT ET FORME",
    "TÉLÉCOMMUNICATIONS",
    "TOURISME ET VOYAGES",
    "TRANSPORTS AÉRIEN, MARITIME ET TERRESTRE"
  ];

  try {
    const result = await db.query("SELECT COUNT(*) as count FROM categories");
    const count = parseInt(result.rows[0].count);
    
    if (count === 0) {
      console.log("Seeding initial categories...");
      for (const name of categories) {
        await db.query("INSERT INTO categories (name) VALUES ($1) ON CONFLICT (name) DO NOTHING", [name]);
      }
      console.log("Categories seeded successfully.");
    }
  } catch (err) {
    console.error("Failed to seed categories:", err);
  }
}

async function startServer() {
  console.log("Starting server...");
  const app = express();
  const PORT = 3000;

  // Start listening immediately to satisfy the platform's health check
  const server = app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server is now listening on http://0.0.0.0:${PORT}`);
  });

  app.use(express.json());
  app.use(cookieParser());
  
  console.log("Configuring routes...");

  // Auth Middleware
  const authenticateToken = (req: any, res: any, next: any) => {
    const token = req.cookies.token;
    if (!token) return res.status(401).json({ error: "Unauthorized" });

    jwt.verify(token, JWT_SECRET, (err: any, user: any) => {
      if (err) return res.status(403).json({ error: "Forbidden" });
      req.user = user;
      next();
    });
  };

  // Health Check
  app.get("/api/health", (req, res) => {
    res.json({ 
      status: "ok", 
      database: db.getMode(),
      isPlaceholder: db.getMode() === 'sqlite'
    });
  });

  // Debug Endpoint
  app.get("/api/debug/counts", async (req, res) => {
    try {
      const catCounts = await db.query(`
        SELECT c.name, COUNT(p.id) as count 
        FROM categories c 
        LEFT JOIN portfolio_items p ON c.id = p.category_id 
        GROUP BY c.name
      `);
      res.json(catCounts.rows);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // Auth Routes
  app.post("/api/auth/register", async (req, res) => {
    const { email, password, name } = req.body;
    if (!email || !password || !name) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    if (isPlaceholderUrl(process.env.DATABASE_URL)) {
      return res.status(503).json({ 
        error: "Database connection failed. Please check your DATABASE_URL secret.",
        isPlaceholder: true,
        details: "The database hostname is set to 'base', which is a placeholder. Please update your DATABASE_URL in AI Studio Secrets (Gear Icon -> Secrets)."
      });
    }

    try {
      const hashedPassword = await bcrypt.hash(password, 10);
      const uid = Math.random().toString(36).substring(2, 15);
      const role = email.toLowerCase() === 'eden@tbi-center.fr' ? 'admin' : 'agent';
      
      const result = await db.query(
        "INSERT INTO users (uid, email, password, name, role) VALUES ($1, $2, $3, $4, $5) RETURNING uid, email, name, role",
        [uid, email, hashedPassword, name, role]
      );
      
      const user = result.rows[0];
      const token = jwt.sign({ uid: user.uid, role: user.role }, JWT_SECRET);
      res.cookie("token", token, { httpOnly: true, secure: true, sameSite: 'none' });
      res.json(user);
    } catch (err: any) {
      console.error("Registration error:", err);
      if (err.code === 'ENOTFOUND' || err.code === 'EAI_AGAIN' || err.message.includes('getaddrinfo')) {
        return res.status(503).json({ error: "Database connection failed. Please check your DATABASE_URL secret." });
      }
      res.status(400).json({ error: "Email already exists or invalid data" });
    }
  });

  app.post("/api/auth/login", async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }

    if (isPlaceholderUrl(process.env.DATABASE_URL)) {
      return res.status(503).json({ 
        error: "Database connection failed. Please check your DATABASE_URL secret.",
        isPlaceholder: true,
        details: "The database hostname is set to 'base', which is a placeholder. Please update your DATABASE_URL in AI Studio Secrets (Gear Icon -> Secrets)."
      });
    }

    try {
      const result = await db.query("SELECT * FROM users WHERE email = $1", [email]);
      if (result.rows.length === 0) return res.status(400).json({ error: "User not found" });
      
      const user = result.rows[0];
      const validPassword = await bcrypt.compare(password, user.password);
      if (!validPassword) return res.status(400).json({ error: "Invalid password" });
      
      const token = jwt.sign({ uid: user.uid, role: user.role }, JWT_SECRET);
      res.cookie("token", token, { httpOnly: true, secure: true, sameSite: 'none' });
      res.json({ uid: user.uid, email: user.email, name: user.name, role: user.role });
    } catch (err: any) {
      console.error("Login error:", err);
      if (err.code === 'ENOTFOUND' || err.code === 'EAI_AGAIN' || err.message.includes('getaddrinfo')) {
        return res.status(503).json({ error: "Database connection failed. Please check your DATABASE_URL secret." });
      }
      res.status(500).json({ error: "Server error" });
    }
  });

  app.post("/api/auth/logout", (req, res) => {
    res.clearCookie("token");
    res.json({ success: true });
  });

  app.get("/api/auth/me", authenticateToken, async (req: any, res) => {
    try {
      const result = await db.query("SELECT uid, email, name, role, created_at as \"createdAt\" FROM users WHERE uid = $1", [req.user.uid]);
      if (result.rows.length === 0) return res.status(404).json({ error: "User not found" });
      res.json(result.rows[0]);
    } catch (err) {
      res.status(500).json({ error: "Server error" });
    }
  });

  // Categories Routes
  app.get("/api/categories", authenticateToken, async (req, res) => {
    try {
      const result = await db.query("SELECT * FROM categories ORDER BY name ASC");
      res.json(result.rows);
    } catch (err) {
      res.status(500).json({ error: "Server error" });
    }
  });

  app.post("/api/categories", authenticateToken, async (req: any, res) => {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: "Name is required" });
    
    try {
      const result = await db.query(
        "INSERT INTO categories (name) VALUES ($1) ON CONFLICT (name) DO NOTHING RETURNING *",
        [name.toUpperCase()]
      );
      if (result.rows.length === 0) {
        // Already exists, fetch it
        const existing = await db.query("SELECT * FROM categories WHERE name = $1", [name.toUpperCase()]);
        return res.json(existing.rows[0]);
      }
      res.status(201).json(result.rows[0]);
    } catch (err) {
      res.status(500).json({ error: "Server error" });
    }
  });

  // Portfolio Items Routes
  app.get("/api/categories/:categoryId/items", authenticateToken, async (req, res) => {
    const { categoryId } = req.params;
    try {
      const result = await db.query(
        "SELECT * FROM portfolio_items WHERE category_id = $1 ORDER BY name ASC",
        [categoryId]
      );
      res.json(result.rows);
    } catch (err) {
      res.status(500).json({ error: "Server error" });
    }
  });

  app.post("/api/portfolio-items", authenticateToken, async (req, res) => {
    const { category_id, name, sub_type, address, city, bp, tel, fax, mail, web } = req.body;
    if (!category_id || !name) return res.status(400).json({ error: "Category ID and Name are required" });

    try {
      const result = await db.query(
        `INSERT INTO portfolio_items 
        (category_id, name, sub_type, address, city, bp, tel, fax, mail, web) 
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) 
        RETURNING *`,
        [category_id, name, sub_type, address, city, bp, tel, fax, mail, web]
      );
      res.status(201).json(result.rows[0]);
    } catch (err) {
      console.error("Error creating portfolio item:", err);
      res.status(500).json({ error: "Server error" });
    }
  });

  // Users Routes (Admin only)
  app.get("/api/users", authenticateToken, async (req: any, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: "Forbidden" });
    try {
      const result = await db.query("SELECT uid, email, name, role, created_at as \"createdAt\" FROM users ORDER BY created_at DESC");
      res.json(result.rows);
    } catch (err) {
      res.status(500).json({ error: "Server error" });
    }
  });

  app.post("/api/users", authenticateToken, async (req: any, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: "Forbidden" });
    const { email, password, name, role } = req.body;
    if (!email || !password || !name || !role) {
      return res.status(400).json({ error: "Missing required fields" });
    }
    try {
      const hashedPassword = await bcrypt.hash(password, 10);
      const uid = Math.random().toString(36).substring(2, 15);
      
      const result = await db.query(
        "INSERT INTO users (uid, email, password, name, role) VALUES ($1, $2, $3, $4, $5) RETURNING uid, email, name, role, created_at as \"createdAt\"",
        [uid, email, hashedPassword, name, role]
      );
      res.json(result.rows[0]);
    } catch (err) {
      res.status(400).json({ error: "Email already exists or invalid data" });
    }
  });

  app.put("/api/users/:uid/role", authenticateToken, async (req: any, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: "Forbidden" });
    const { uid } = req.params;
    const { role } = req.body;
    
    try {
      const userRes = await db.query("SELECT email FROM users WHERE uid = $1", [uid]);
      if (userRes.rows.length > 0 && userRes.rows[0].email === 'eden@tbi-center.fr') {
        return res.status(400).json({ error: "Cannot change main admin role" });
      }

      await db.query("UPDATE users SET role = $1 WHERE uid = $2", [role, uid]);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: "Server error" });
    }
  });

  app.delete("/api/users/:uid", authenticateToken, async (req: any, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: "Forbidden" });
    const { uid } = req.params;
    
    try {
      const userRes = await db.query("SELECT email FROM users WHERE uid = $1", [uid]);
      if (userRes.rows.length > 0 && userRes.rows[0].email === 'eden@tbi-center.fr') {
        return res.status(400).json({ error: "Cannot delete main admin" });
      }

      await db.query("DELETE FROM users WHERE uid = $1", [uid]);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: "Server error" });
    }
  });

  // Admin Stats Route
  app.get("/api/admin/stats", authenticateToken, async (req: any, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: "Forbidden" });
    try {
      const [callsRes, customersRes, usersRes] = await Promise.all([
        db.query("SELECT status, agent_name FROM calls"),
        db.query("SELECT count(*) FROM customers"),
        db.query("SELECT uid, name FROM users WHERE role = 'agent'")
      ]);

      const calls = callsRes.rows;
      const totalCustomers = parseInt(customersRes.rows[0].count);
      const agents = usersRes.rows;

      const agentPerformance = agents.map(agent => ({
        name: agent.name,
        calls: calls.filter(c => c.agent_name === agent.name).length,
        completed: calls.filter(c => c.agent_name === agent.name && c.status === 'completed').length
      }));

      res.json({
        totalCalls: calls.length,
        completedCalls: calls.filter(c => c.status === 'completed').length,
        pendingCalls: calls.filter(c => c.status === 'pending').length,
        totalCustomers,
        agentPerformance
      });
    } catch (err) {
      res.status(500).json({ error: "Server error" });
    }
  });

  app.delete("/api/users/:uid", authenticateToken, async (req: any, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: "Forbidden" });
    const { uid } = req.params;
    
    try {
      // Prevent deleting the main admin
      const userRes = await db.query("SELECT email FROM users WHERE uid = $1", [uid]);
      if (userRes.rows.length > 0 && userRes.rows[0].email === 'eden@tbi-center.fr') {
        return res.status(400).json({ error: "Cannot delete main admin" });
      }

      await db.query("DELETE FROM users WHERE uid = $1", [uid]);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: "Server error" });
    }
  });

  // Customers Routes
  app.get("/api/customers", authenticateToken, async (req, res) => {
    try {
      const result = await db.query("SELECT id, name, email, phone, address, created_at as \"createdAt\", updated_at as \"updatedAt\" FROM customers ORDER BY created_at DESC");
      res.json(result.rows);
    } catch (err) {
      res.status(500).json({ error: "Server error" });
    }
  });

  app.post("/api/customers", authenticateToken, async (req, res) => {
    const { name, email, phone, address } = req.body;
    try {
      const result = await db.query(
        "INSERT INTO customers (name, email, phone, address) VALUES ($1, $2, $3, $4) RETURNING id, name, email, phone, address, created_at as \"createdAt\", updated_at as \"updatedAt\"",
        [name, email, phone, address]
      );
      res.json(result.rows[0]);
    } catch (err) {
      res.status(500).json({ error: "Server error" });
    }
  });

  app.put("/api/customers/:id", authenticateToken, async (req, res) => {
    const { id } = req.params;
    const { name, email, phone, address } = req.body;
    try {
      const result = await db.query(
        "UPDATE customers SET name = $1, email = $2, phone = $3, address = $4, updated_at = CURRENT_TIMESTAMP WHERE id = $5 RETURNING id, name, email, phone, address, created_at as \"createdAt\", updated_at as \"updatedAt\"",
        [name, email, phone, address, id]
      );
      res.json(result.rows[0]);
    } catch (err) {
      res.status(500).json({ error: "Server error" });
    }
  });

  app.delete("/api/customers/:id", authenticateToken, async (req, res) => {
    const { id } = req.params;
    try {
      await db.query("DELETE FROM customers WHERE id = $1", [id]);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: "Server error" });
    }
  });

  // Calls Routes
  app.get("/api/calls", authenticateToken, async (req: any, res) => {
    try {
      let query = "SELECT * FROM calls";
      let params: any[] = [];
      if (req.user.role === 'agent') {
        query += " WHERE agent_id = $1";
        params.push(req.user.uid);
      }
      query += " ORDER BY created_at DESC";
      const result = await db.query(query, params);
      res.json(result.rows.map(row => ({
        ...row,
        customerId: row.customer_id,
        customerName: row.customer_name,
        customerPhone: row.customer_phone,
        agentId: row.agent_id,
        agentName: row.agent_name,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      })));
    } catch (err) {
      res.status(500).json({ error: "Server error" });
    }
  });

  app.post("/api/calls", authenticateToken, async (req, res) => {
    const { customerId, customerName, customerPhone, agentId, agentName, status, notes } = req.body;
    try {
      const result = await db.query(
        "INSERT INTO calls (customer_id, customer_name, customer_phone, agent_id, agent_name, status, notes) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id, customer_id as \"customerId\", customer_name as \"customerName\", customer_phone as \"customerPhone\", agent_id as \"agentId\", agent_name as \"agentName\", status, notes, created_at as \"createdAt\", updated_at as \"updatedAt\"",
        [customerId, customerName, customerPhone, agentId, agentName, status, notes]
      );
      res.json(result.rows[0]);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Server error" });
    }
  });

  app.put("/api/calls/:id", authenticateToken, async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;
    try {
      const result = await db.query(
        "UPDATE calls SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING id, customer_id as \"customerId\", customer_name as \"customerName\", customer_phone as \"customerPhone\", agent_id as \"agentId\", agent_name as \"agentName\", status, notes, created_at as \"createdAt\", updated_at as \"updatedAt\"",
        [status, id]
      );
      res.json(result.rows[0]);
    } catch (err) {
      res.status(500).json({ error: "Server error" });
    }
  });

  // Placeholder for Vite middleware to prevent blocking server startup
  let viteMiddleware: any = null;
  
  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    (async () => {
      try {
        const vite = await createViteServer({
          server: { middlewareMode: true },
          appType: "spa",
        });
        viteMiddleware = vite.middlewares;
        console.log("Vite development server initialized.");
      } catch (err) {
        console.error("Failed to initialize Vite server:", err);
      }
    })();

    app.use((req, res, next) => {
      console.log(`Request: ${req.method} ${req.path}`);
      if (viteMiddleware) {
        viteMiddleware(req, res, next);
      } else {
        // If it's an API request, let it through (they don't need Vite)
        if (req.path.startsWith('/api')) {
          next();
        } else {
          res.setHeader('Content-Type', 'text/html');
          res.send(`
            <html>
              <head>
                <meta http-equiv="refresh" content="2">
                <style>
                  body { font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #f4f4f5; }
                  .card { background: white; padding: 2rem; border-radius: 0.75rem; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1); text-align: center; }
                  .spinner { border: 3px solid #e2e8f0; border-top: 3px solid #3b82f6; border-radius: 50%; width: 24px; height: 24px; animation: spin 1s linear infinite; margin: 0 auto 1rem; }
                  @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
                </style>
              </head>
              <body>
                <div class="card">
                  <div class="spinner"></div>
                  <p>Initializing application components...</p>
                  <p style="font-size: 0.875rem; color: #64748b;">This page will refresh automatically.</p>
                </div>
              </body>
            </html>
          `);
        }
      }
    });
  } else {
    console.log("Serving static files from dist...");
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  // Initialize database in background
  (async () => {
    try {
      await initDb();
      await seedAdmin();
      await seedCategories();
      await seedPortfolioItems();
      await seedRealEstateItems();
      await seedAlimentationDistributionItems();
      await seedAnimauxVeterinairesItems();
      
      await seedAssistanceJuridiqueItems();
      await seedAssurancesItems();
      await seedAutomobilesItems();
      await seedBanquesItems();
      await seedBtpItems();
      await seedBureautiqueInformatiqueItems();
      await seedCommunicationPresseMediasItems();
      await seedConseilsServicesItems();
      await seedCultureLoisirsItems();
      await seedHotelsItems();
      await seedRestaurantsItems();
      await seedSanteItems();
      await seedTelecommunicationsItems();
      await seedEnseignementItems();
      await seedTransportsItems();
      console.log("Background: Database initialized and seeded.");
    } catch (err) {
      console.error("Background: Failed to initialize database:", err);
    }
  })();
}

  // Background tasks - run independently to not block the main thread
async function seedPortfolioItems() {
  try {
    const adminCatResult = await db.query("SELECT id FROM categories WHERE name = 'ADMINISTRATIONS'");
    if (adminCatResult.rows.length === 0) return;
    const catId = adminCatResult.rows[0].id;

    const itemsCountResult = await db.query("SELECT COUNT(*) as count FROM portfolio_items WHERE category_id = $1", [catId]);
    if (parseInt(itemsCountResult.rows[0].count) > 0) return;

    console.log("Seeding portfolio items for ADMINISTRATIONS...");

    const items = [
      { name: "Ambassade d’Afrique du sud", sub_type: "Ambassades et consulats", address: "80, Av. du Maréchal Lyautey - Poto-Poto", city: "BRAZZAVILLE", bp: "14592", tel: "22 281 08 49\n06 666 16 11", mail: "adamsr@dirco.gov.za" },
      { name: "Ambassade d’Algérie", sub_type: "Ambassades et consulats", address: "Av. Monseigneur Augouard - Poto-Poto", city: "BRAZZAVILLE", tel: "22 281 17 37\n22 281 28 37", fax: "22 281 54 77", mail: "ambalgbzv@gmail.com" },
      { name: "Ambassade d’Allemagne", sub_type: "Ambassades et consulats", address: "Rue Alfassa - Dans l'Ambassade de France", city: "BRAZZAVILLE", tel: "06 510 01 48" },
      { name: "Ambassade d’Angola", sub_type: "Ambassades et consulats", address: "Rue Lucien Fourneau", city: "BRAZZAVILLE", bp: "388", tel: "22 281 06 21\n05 506 32 17", mail: "midangolacg@yahoo.fr" },
      { name: "Ambassade d’Egypte", sub_type: "Ambassades et consulats", address: "7 bis, Av. Bayardelle", city: "BRAZZAVILLE", bp: "917", tel: "22 281 07 94\n06 617 39 23", mail: "egybrazza@yahoo.com" },
      { name: "Ambassade d’Italie", sub_type: "Ambassades et consulats", address: "2, Av. Auxence Ickonga", city: "BRAZZAVILLE", bp: "2484", tel: "22 281 11 52\n04 444 00 60", mail: "ambasciata.brazzaville@esteri.it", web: "www.amb.brazzaville.esteri.it" },
      { name: "Ambassade de Chine", sub_type: "Ambassades et consulats", address: "213, Av. Auxence Ickonga", city: "BRAZZAVILLE", bp: "213", tel: "22 281 11 32\n05 517 95 33", mail: "ambaco-chine@yahoo.fr" },
      { name: "Ambassade de Cuba", sub_type: "Ambassades et consulats", address: "18, rue de Reims", city: "BRAZZAVILLE", tel: "22 281 04 91", mail: "embacuba@congob.cubaminrex.cu" },
      { name: "Ambassade de France", sub_type: "Ambassades et consulats", address: "Rue Alfassa - Rond Point de la Poste", city: "BRAZZAVILLE", bp: "2089", tel: "22 281 12 57\n06 620 03 03", mail: "cad.brazzaville-amba@diplomatie.gouv.fr", web: "www.ambafrance-cg.gouv.fr" },
      { name: "Ambassade de Guinée Equatoriale", sub_type: "Ambassades et consulats", address: "206, rue Eugène Etienne", city: "BRAZZAVILLE", tel: "06 688 72 90", mail: "ambaregecongo@yahoo.fr" },
      { name: "Ambassade de l’Ordre Souverain de Malte", sub_type: "Ambassades et consulats", address: "Av. Foch", city: "BRAZZAVILLE", bp: "300", tel: "05 548 71 05", mail: "alexramel@hotmail.com" },
      { name: "Ambassade de la République Bolivarienne du Venezuela", sub_type: "Ambassades et consulats", address: "6, rue Albert Bassandza", city: "BRAZZAVILLE", tel: "06 604 40 40", mail: "embavenezcongo@gmail.com" },
      { name: "Ambassade de la République Centrafricaine", sub_type: "Ambassades et consulats", address: "10, rue Fournier - Bacongo", city: "BRAZZAVILLE", bp: "10", tel: "05 578 16 20\n05 536 66 49" },
      { name: "Ambassade de la République Démocratique du Congo", sub_type: "Ambassades et consulats", address: "130, Av. de L'Indépendance", city: "BRAZZAVILLE", tel: "22 281 30 52", mail: "ambardcbrazza1@yahoo.fr" },
      { name: "Ambassade de la République du Ghana", sub_type: "Ambassades et consulats", address: "14, rue du Reims", city: "BRAZZAVILLE", tel: "22 281 10 67\n22 281 26 13" },
      { name: "Ambassade de Libye", sub_type: "Ambassades et consulats", address: "Derrière Marché du Plateau", city: "BRAZZAVILLE", bp: "1164", tel: "22 281 56 35", fax: "22 281 17 24" },
      { name: "Ambassade de Russie", sub_type: "Ambassades et consulats", address: "Av. Paul Doumer", city: "BRAZZAVILLE", bp: "2132", tel: "22 281 19 23\n05 550 30 14" },
      { name: "Ambassade des Etats Unis", sub_type: "Ambassades et consulats", address: "Bd Denis Sassou Nguesso", city: "BRAZZAVILLE", tel: "22 281 53 24\n06 612 20 00", web: "www.brazzaville.usembassy.gov" },
      { name: "Ambassade du Brésil", sub_type: "Ambassades et consulats", address: "Av. Nelson Mandela", city: "BRAZZAVILLE", bp: "2476", tel: "04 424 43 74\n06 623 16 09", mail: "braem.brazzaville@itamaraty.gov.br" },
      { name: "Ambassade du Cameroun", sub_type: "Ambassades et consulats", address: "Av. Bayardelle", city: "BRAZZAVILLE", bp: "2136", tel: "05 551 46 74\n06 615 57 26", fax: "22 281 56 75", mail: "ambacambrazza@yahoo.fr" },
      { name: "Ambassade du Gabon", sub_type: "Ambassades et consulats", address: "40, Av. Maréchal Lyautey", city: "BRAZZAVILLE", bp: "2033", tel: "22 281 56 20\n05 557 91 82" },
      { name: "Ambassade du Mali", sub_type: "Ambassades et consulats", address: "11, bd du Maréchal Lyautey", city: "BRAZZAVILLE", tel: "06 664 72 16\n06 670 41 57" },
      { name: "Ambassade du Nigeria", sub_type: "Ambassades et consulats", address: "11, bd du Maréchal Lyautey", city: "BRAZZAVILLE", bp: "790", tel: "22 281 10 22", fax: "22 281 55 20", mail: "ambnigbra@yahoo.co.uk" },
      { name: "Ambassade du Tchad", sub_type: "Ambassades et consulats", address: "Rue des Ecoles - Derrière CCF", city: "BRAZZAVILLE", tel: "05 321 08 68\n06 685 89 61" },
      { name: "Ambassade du Vatican", sub_type: "Ambassades et consulats", address: "Rue du Colonel Brisset", city: "BRAZZAVILLE", bp: "1168", tel: "22 281 55 80\n05 551 16 46", mail: "nonapcg@yahoo.com" },
      { name: "Assemblée Nationale", sub_type: "Présidence et ministères", address: "Palais des Congrès", city: "BRAZZAVILLE", fax: "22 281 30 00" },
      { name: "Consulat Général de Grèce", sub_type: "Ambassades et consulats", address: "Av. Willian Guynet", city: "BRAZZAVILLE", tel: "22 281 25 11", fax: "22 281 34 42" },
      { name: "Consulat Général de Mauritanie", sub_type: "Ambassades et consulats", address: "2, rue Coup de la Lune -Mpila", city: "BRAZZAVILLE", bp: "14448", tel: "22 281 48 97", fax: "22 281 56 99" },
      { name: "Consulat Honoraire de Turquie", sub_type: "Ambassades et consulats", address: "70, Av. Nelson Mendela", city: "BRAZZAVILLE", tel: "05 551 44 40", mail: "dnady@yahoo.fr" },
      { name: "Consulat Honoraire du Niger", sub_type: "Ambassades et consulats", address: "Poto-Poto", city: "BRAZZAVILLE", bp: "13351", tel: "22 282 17 44\n05 954 23 23", fax: "22 282 17 44", mail: "consulatniger.brazzaville@yahoo.fr" },
      { name: "Consulat Honoraire du Royaume de Norvège", sub_type: "Ambassades et consulats", address: "30, Bd Denis Sassous Nguesso", city: "BRAZZAVILLE", bp: "8058", tel: "06 651 02 47\n05 551 02 47", mail: "fumeyanne@yahoo.fr" },
      { name: "Ministère de la Communication et des Médias", sub_type: "Présidence et ministères", city: "BRAZZAVILLE", bp: "114", tel: "Cabinet", fax: "05 558 91 67" },
      { name: "Ministère de la construction, de l’urbanisme, de la ville et du cadre de vie", sub_type: "Présidence et ministères", address: "9, rue de la Libération de Paris", city: "BRAZZAVILLE", tel: "Cabinet", fax: "06 662 44 35" },
      { name: "Ministère de la Culture et des Arts", sub_type: "Présidence et ministères", address: "Tour Nabemba", city: "BRAZZAVILLE", tel: "Cabinet", fax: "06 666 33 61" },
      { name: "Ministère de la Défense Nationale", sub_type: "Présidence et ministères", address: "Imm. de le Défense Nationale", city: "BRAZZAVILLE", bp: "101", tel: "Cabinet", fax: "06 666 54 60" },
      { name: "Ministère de la Justice", sub_type: "Présidence et ministères", address: "Av. Charles de Gaulle", city: "BRAZZAVILLE", bp: "1375", tel: "Cabinet", fax: "04 002 90 90" },
      { name: "Ministère de la promotion de la femme", sub_type: "Présidence et ministères", address: "Tour Nabemba", city: "BRAZZAVILLE", tel: "Cabinet", fax: "06 661 19 22" },
      { name: "Ministère de la recherche scientifique", sub_type: "Présidence et ministères", address: "Tour Nabemba", city: "BRAZZAVILLE", tel: "Cabinet", fax: "06 921 71 95" },
      { name: "Ministère de la Santé et de la Population", sub_type: "Présidence et ministères", address: "Rue Lucien Fourneau, à côté du Commissariat Central", city: "BRAZZAVILLE", tel: "Cabinet", fax: "05 533 45 29" },
      { name: "Ministère de l’agriculture de l’élevage et de la pêche", sub_type: "Présidence et ministères", city: "BRAZZAVILLE", tel: "Cabinet", fax: "05 536 79 28" },
      { name: "Ministère de l’Aménagement du Territoire", sub_type: "Présidence et ministères", city: "BRAZZAVILLE", tel: "Cabinet", fax: "05 536 01 93" },
      { name: "Ministère de l’économie forestière", sub_type: "Présidence et ministères", address: "Palais des Verts (face Maternité Blanche Gomez)", city: "BRAZZAVILLE", tel: "Cabinet", fax: "05 099 40 33" },
      { name: "Ministère de l’économie, du développement industriel", sub_type: "Présidence et ministères", city: "BRAZZAVILLE", tel: "Chef de protocole", fax: "06 662 33 94" },
      { name: "Ministère de l’énergie et de l’hydraulique", sub_type: "Présidence et ministères", address: "Imm. Mines et Energie (Rond-point CCF)", city: "BRAZZAVILLE", bp: "95", tel: "Cabinet", fax: "05 096 10 65" },
      { name: "Ministère de l’enseignement primaire, secondaire", sub_type: "Présidence et ministères", address: "Imm. ex-voix de la Révolution", city: "BRAZZAVILLE", tel: "Cabinet", fax: "06 668 85 29" },
      { name: "Ministère de l’enseignement supérieur", sub_type: "Présidence et ministères", address: "Av. Lucien Fourneau", city: "BRAZZAVILLE", bp: "2078/169", tel: "Cabinet", fax: "05 550 30 37" },
      { name: "Ministère de l’enseignement Technique et professionnelle", sub_type: "Présidence et ministères", address: "Imm. ex-voix de la Révolution", city: "BRAZZAVILLE", tel: "Cabinet", fax: "06 662 22 20" },
      { name: "Ministère de l’équipement et de l’entretien routier", sub_type: "Présidence et ministères", address: "Tour Nabemba", city: "BRAZZAVILLE", tel: "Cabinet", fax: "05 531 32 52" },
      { name: "Ministère de l’Intérieur et de la Décentralisation", sub_type: "Présidence et ministères", address: "Imm. de l’Intérieur (Rond-point CCF)", city: "BRAZZAVILLE", tel: "Cabinet", fax: "06 661 17 90" },
      { name: "Ministère des Affaires Étrangères", sub_type: "Présidence et ministères", address: "Bd Alfred Raoul", city: "BRAZZAVILLE", bp: "2070", tel: "Cabinet", fax: "05 558 57 59" },
      { name: "Ministère des Affaires Foncières", sub_type: "Présidence et ministères", address: "Tour Nabemba", city: "BRAZZAVILLE", tel: "Cabinet", fax: "05 539 04 93" },
      { name: "Ministère des Finances, du budget", sub_type: "Présidence et ministères", address: "Imm. ex BCC", city: "BRAZZAVILLE", tel: "Cabinet", fax: "06 634 89 45" },
      { name: "Ministère des hydrocarbures", sub_type: "Présidence et ministères", city: "BRAZZAVILLE", bp: "2120", tel: "Cabinet", fax: "05 529 87 01" },
      { name: "Ministère des Mines et de la Géologie", sub_type: "Présidence et ministères", city: "BRAZZAVILLE", tel: "Cabinet", fax: "06 666 45 24" },
      { name: "Ministère des petites et moyennes entreprises", sub_type: "Présidence et ministères", address: "Tour Nabemba", city: "BRAZZAVILLE", tel: "Cabinet", fax: "05 522 15 60" },
      { name: "Ministère des Postes et Télécommunications", sub_type: "Présidence et ministères", address: "Av. Charles de Gaulle - face SPIDE - Mpila", city: "BRAZZAVILLE", tel: "Cabinet", fax: "06 664 84 08" },
      { name: "Ministère des Sports et de l’Education Physique", sub_type: "Présidence et ministères", address: "Av. Charles de Gaulle", city: "BRAZZAVILLE", tel: "Cabinet", fax: "06 683 64 69" },
      { name: "Ministère des transports, de l’aviation civile", sub_type: "Présidence et ministères", address: "Tour Nabemba", city: "BRAZZAVILLE", tel: "Cabinet", fax: "05 548 00 38" },
      { name: "Ministère des Zones Économiques Spéciales", sub_type: "Présidence et ministères", address: "Tour Nabemba", city: "BRAZZAVILLE", bp: "866", tel: "Cabinet", fax: "05 572 23 62" },
      { name: "Ministère du commerce extérieure", sub_type: "Présidence et ministères", address: "Tour Nabemba", city: "BRAZZAVILLE", fax: "22 281 58 29" },
      { name: "Ministère du Plan, de la Statistique", sub_type: "Présidence et ministères", address: "Imm. du Plan", city: "BRAZZAVILLE", fax: "NC" },
      { name: "Ministère du Tourisme et des Loisirs", sub_type: "Présidence et ministères", address: "Tour Nabemba", city: "BRAZZAVILLE", tel: "Cabinet", fax: "05 051 77 16" },
      { name: "Ministère du Travail et de la Sécurité sociale", sub_type: "Présidence et ministères", address: "Ancien Imm. du Ministère des TP - Rond-point de la Grande Poste", city: "BRAZZAVILLE", tel: "Cabinet", fax: "05 537 25 25" },
      { name: "Ministre de la Fonction Publique", sub_type: "Présidence et ministères", address: "Rue Lucien Fourneau, à côté du Commissariat Central", city: "BRAZZAVILLE", tel: "Cabinet", fax: "06 668 75 27" },
      { name: "Ministre des Affaires Sociales", sub_type: "Présidence et ministères", address: "Rue Lucien Fournier - Imm. ex Direction de la Solde", city: "BRAZZAVILLE", bp: "545", fax: "05 556 78 38" },
      { name: "Primature", sub_type: "Présidence et ministères", address: "Av. Paul Doumer", city: "BRAZZAVILLE", bp: "2148", tel: "Cabinet", fax: "05 522 31 64" },
      { name: "Sénat", sub_type: "Présidence et ministères", address: "Palais des Congrès", city: "BRAZZAVILLE", bp: "2642", fax: "22 281 00 18" },
      { name: "Consulat d’Angola", sub_type: "Ambassades et consulats", address: "Av. Stéphane Tchitchelle", city: "POINTE-NOIRE", tel: "22 294 19 12" },
      { name: "Consulat de Belgique", sub_type: "Ambassades et consulats", address: "Av. Fayette Tchitembo", city: "POINTE-NOIRE", tel: "05 770 11 68" },
      { name: "Consulat Général de France", sub_type: "Ambassades et consulats", address: "4, allée de Makimba", city: "POINTE-NOIRE", bp: "720", tel: "06 621 02 02", web: "www.consulfrance-pointe-noire.org" },
      { name: "Consulat Général Honoraire du Benin", sub_type: "Ambassades et consulats", address: "38, Bd du Général Charles de Gaulle", city: "POINTE-NOIRE", bp: "1216", tel: "22 294 03 02", mail: "bconsben@yahoo.com" },
      { name: "Consulat Honoraire d’Allemagne", sub_type: "Ambassades et consulats", address: "Av. Denis Loemba", city: "POINTE-NOIRE", bp: "858", tel: "22 294 13 14" },
      { name: "Consulat Honoraire d’Italie", sub_type: "Ambassades et consulats", address: "Av. Téophile Bemba", city: "POINTE-NOIRE", tel: "05 589 90 03", mail: "consolatoonoariaro.pnr@gmail.com" },
      { name: "Consulat Honoraire de la Fédération Russe", sub_type: "Ambassades et consulats", address: "21, Av. Moé Téli", city: "POINTE-NOIRE", tel: "05 500 55 60", mail: "rusconsul.cg@yandex.ru" },
      { name: "Consulat Honoraire de Suede", sub_type: "Ambassades et consulats", address: "Rue Kibouka", city: "POINTE-NOIRE", bp: "5605", tel: "22 294 84 30\n05 559 01 92" },
      { name: "Consulat Honoraire de Suisse", sub_type: "Ambassades et consulats", address: "Imm. Minoco", city: "POINTE-NOIRE", bp: "871", tel: "22 294 37 07\n06 631 25 52" },
      { name: "Consulat Honoraire du Burkina faso", sub_type: "Ambassades et consulats", address: "Rue Tchibanda - OCH", city: "POINTE-NOIRE", bp: "1315", tel: "06 667 43 66\n06 933 04 44", mail: "O_souley@yahoo.fr" },
      { name: "Consulat Honoraire du Mali", sub_type: "Ambassades et consulats", address: "2, Av. Moé Vangoula", city: "POINTE-NOIRE", tel: "06 626 15 15" },
      { name: "Consulat Honoraire du Portugal", sub_type: "Ambassades et consulats", address: "Av. de l'Evêché", city: "POINTE-NOIRE", bp: "1176", tel: "22 294 77 74\n05 553 12 16" },
      { name: "Consulat Honoraire du Sénégal", sub_type: "Ambassades et consulats", address: "71, Av. Schoelcher - Grand Marché", city: "POINTE-NOIRE", bp: "2042", tel: "06 631 14 96\n05 557 01 46" },
      { name: "HÔTELS RÉSIDENCE FOULA", sub_type: "Présidence et ministères", address: "Route du Gabon, à côté de l’Hôpital", city: "DOLISIE", tel: "04 477 50 51" },
      { name: "Ministère de la jeunesse et de l’éducation civique", sub_type: "Présidence et ministries", fax: "NC" }
    ];

    for (const item of items) {
      await db.query(
        `INSERT INTO portfolio_items 
        (category_id, name, sub_type, address, city, bp, tel, fax, mail, web) 
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [catId, item.name, item.sub_type, item.address, item.city, item.bp, item.tel, item.fax, item.mail, item.web]
      );
    }
    console.log(`Seeded ${items.length} portfolio items for ADMINISTRATIONS`);
  } catch (err) {
    console.error("Failed to seed portfolio items:", err);
  }
}

async function seedRealEstateItems() {
  try {
    const catResult = await db.query("SELECT id FROM categories WHERE name = 'AGENCES IMMOBILIÈRES ET PROMOTION'");
    if (catResult.rows.length === 0) return;
    const catId = catResult.rows[0].id;

    const itemsCountResult = await db.query("SELECT COUNT(*) as count FROM portfolio_items WHERE category_id = $1", [catId]);
    const currentCount = parseInt(itemsCountResult.rows[0].count);
    
    console.log(`Current count for AGENCES IMMOBILIÈRES ET PROMOTION: ${currentCount}`);

    if (currentCount !== 18) {
      console.log("Re-seeding AGENCES IMMOBILIÈRES ET PROMOTION...");
      await db.query("DELETE FROM portfolio_items WHERE category_id = $1", [catId]);
    } else {
      console.log("AGENCES IMMOBILIÈRES ET PROMOTION already has 18 items. Skipping.");
      return;
    }

    const items = [
      { name: "GESTRIM OCÉAN", sub_type: "Agences", address: "2 av. William Guynet", city: "BRAZZAVILLE", tel: "06 639 68 83", mail: "contact_bzv@gestrimocean.com" },
      { name: "L’ATRIUM", sub_type: "Agences", address: "Rond point City Center - Imm. CNSS", city: "BRAZZAVILLE", tel: "06 484 76 77", mail: "latriumimmo@yahoo.fr" },
      { name: "MSF (Maisons Sans Frontières)", sub_type: "Promotion immobilière", address: "Kounda", city: "BRAZZAVILLE", bp: "13934", tel: "06 458 86 18", mail: "promotions@msfcongo.com", web: "www.msfcongo.com" },
      { name: "NBY IMMOBILIER CONSEILS S.A.", sub_type: "Agences", address: "Cité du Clairon, vers Nganga Edouard, Res. Ericka Appt. 3 au Rdc", city: "BRAZZAVILLE", tel: "04 413 78 88\n06 683 76 27\n05 525 40 94", mail: "contact@nbyimmo.com", web: "www.nbyimmo.com" },
      { name: "SOCOMOD (sté congolaise de modernisation)", sub_type: "Promotion immobilière", address: "35, av. Pointe Hollandaise - Mpila", city: "BRAZZAVILLE", tel: "05 556 45 58" },
      { name: "A.L.G.I", sub_type: "Agences", address: "Av. Emmanuel Dadet", city: "POINTE-NOIRE", tel: "05 035 40 57", mail: "algi.immobilier@gmail.com" },
      { name: "BIELAYA SARL", sub_type: "Promotion immobilière", address: "Av. Charles de Gaulle, Imm Rakoto", city: "Pointe-Noire", bp: "4764", tel: "05 658 36 66\n06 652 01 02", mail: "infobielaya@gmail.com" },
      { name: "CONGO HOUSING SARL", sub_type: "Promotion immobilière", address: "92, bd du Général Charles de Gaulle - Rond Point Kassaï - Imm. Sigi 1er étage", city: "POINTE-NOIRE", tel: "04 443 88 04", mail: "info@congohousing.com", web: "www.congohousing.com" },
      { name: "COPARCO", sub_type: "Agences", address: "Rue Simon Zéphirin - Zone Portuaire", city: "POINTE-NOIRE", bp: "653", tel: "05 551 75 31", mail: "coparcopn@gmail.com" },
      { name: "Dolse SARL", sub_type: "Agences", address: "Enceinte Cofibois Km4", city: "Pointe-Noire", tel: "05 695 29 33\n06 495 29 33", mail: "dolseimmobilier@gmail.com" },
      { name: "GESTRIM OCÉAN", sub_type: "Agences", address: "9, av. de Bolobo", city: "POINTE-NOIRE", tel: "22 294 18 75", mail: "contact_pnr@gestrimocean.com", web: "www.gestrim-ocean.com" },
      { name: "IMANE SERVICES", sub_type: "Agences", address: "Av. Moé Vangoula", city: "POINTE-NOIRE", tel: "05 358 53 57\n06 440 83 49", mail: "imane.services@imaneservices.com", web: "www.imaneservices.com" },
      { name: "LGM IMMOBILIER", sub_type: "Agences", address: "Rue de Dzoumouta", city: "POINTE-NOIRE", tel: "05 520 85 20\n05 625 65 89", mail: "contact@congo-immobilier.com", web: "www.congo-immobilier.com" },
      { name: "MSF (Maisons Sans Frontières)", sub_type: "Promotion immobilière", address: "Tchikobo - Derrière la Mairie", city: "POINTE-NOIRE", bp: "1320", tel: "05 587 73 24", mail: "promotions@msfcongo.com", web: "www.msfcongo.com" },
      { name: "NBY IMMOBILIER CONSEILS S.A.", sub_type: "Agences", address: "Av. Moé Kaat Matou, rond-point Kassaï, à côté de la Banque Postale", city: "POINTE-NOIRE", tel: "04 434 67 02\n06 955 02 82\n05 555 96 09", mail: "contactpnr@nbyimmo.com", web: "www.nbyimmo.com" },
      { name: "PRESTANCES", sub_type: "Agences", address: "Av. Félix Eboué - Zone Portuaire", city: "POINTE-NOIRE", bp: "873", tel: "05 614 83 52\n06 456 80 45" },
      { name: "TCHIB IMMO", sub_type: "Agences", address: "123, Av. Benoît Loembet - Z.I. Km 4", city: "POINTE-NOIRE", bp: "887", tel: "06 514 62 90\n06 856 17 17", mail: "vanessasg@tchibimmo-cg.com", web: "www.tchibimmo-cg.com" },
      { name: "UPSIDE", sub_type: "Promotion immobilière", address: "45, rue de la Mer", city: "POINTE-NOIRE", tel: "05 660 41 42", mail: "sbakala@upside-properties.com" }
    ];

    for (const item of items) {
      await db.query(
        `INSERT INTO portfolio_items 
        (category_id, name, sub_type, address, city, bp, tel, fax, mail, web) 
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [catId, item.name, item.sub_type, item.address, item.city, item.bp || null, item.tel || null, null, item.mail || null, item.web || null]
      );
    }
    console.log(`Seeded ${items.length} portfolio items for AGENCES IMMOBILIÈRES ET PROMOTION`);
  } catch (err) {
    console.error("Failed to seed real estate items:", err);
  }
}

async function seedAlimentationDistributionItems() {
  try {
    const catResult = await db.query("SELECT id FROM categories WHERE name = 'ALIMENTATION ET DISTRIBUTION'");
    if (catResult.rows.length === 0) return;
    const catId = catResult.rows[0].id;

    const itemsCountResult = await db.query("SELECT COUNT(*) as count FROM portfolio_items WHERE category_id = $1", [catId]);
    const currentCount = parseInt(itemsCountResult.rows[0].count);
    
    // Always re-seed if count is not 77 to ensure full list is present
    if (currentCount !== 77) {
      console.log("Seeding ALIMENTATION ET DISTRIBUTION (77 items)...");
      await db.query("DELETE FROM portfolio_items WHERE category_id = $1", [catId]);
    } else {
      return;
    }

    const items = [
      // Brazzaville
      { name: "ASPERBRAS CONGO", sub_type: "Agriculture", address: "Bd Denis Sassou Nguesso - En face de l'Aéroport Maya-Maya - Moungali", city: "BRAZZAVILLE", bp: "14566", tel: "06 655 58 83", mail: "rodrigo.reis@asperbras.com", web: "www.asperbras.com" },
      { name: "BON PRIX", sub_type: "Alcool - Vins et spiritueux", address: "66, rue Bangalas", city: "BRAZZAVILLE", tel: "05 528 79 24" },
      { name: "Boucherie Al Farah", sub_type: "Boucheries - Charcuteries", address: "Rond-point de la Coupole", city: "BRAZZAVILLE", tel: "06 455 55 54" },
      { name: "BOULANGERIE DE LA PLAINE", sub_type: "Boulangeries - Pâtisseries", address: "Rue Alphonse Fondère", city: "BRAZZAVILLE", bp: "499", tel: "06 882 83 85" },
      { name: "EDMOND TRAITEUR", sub_type: "Traiteurs", address: "22 bis, Av. des Trois Martyrs", city: "BRAZZAVILLE", tel: "06 966 96 02", mail: "edmondgatsono@yahoo.fr" },
      { name: "ETS GUENIN", sub_type: "Distributeurs", address: "Av. du Maréchal Galliéni", city: "BRAZZAVILLE", bp: "13510", tel: "22 281 10 54", fax: "22 281 10 53" },
      { name: "FARANO SERVICES", sub_type: "Traiteurs", address: "19, rue Zanaga - Maya-Maya", city: "BRAZZAVILLE", tel: "06 950 25 19 / 05 531 01 09" },
      { name: "HYPERMARCHÉ GÉANT CASINO", sub_type: "Alimentation générale - Supermarchés - Supérettes", address: "Av. Amilcar Cabral", city: "BRAZZAVILLE" },
      { name: "KIMEX INTERNATIONAL", sub_type: "Distributeurs", address: "Imm. ARC - 2ème étage", city: "BRAZZAVILLE", bp: "13161", tel: "05 551 18 96", mail: "kimexinternational@yahoo.fr" },
      { name: "LA CONGOLAISE DE PÊCHE", sub_type: "Poissonneries", address: "Bd du Maréchal Lyautey - OCH", city: "BRAZZAVILLE", tel: "05 548 49 09", mail: "lacongolaise.peche@gmail.com" },
      { name: "LA MAISON DU POISSON", sub_type: "Poissonneries", address: "Bd Denis Sassou Nguesso", city: "BRAZZAVILLE", tel: "06 622 22 26 / 05 566 69 99" },
      { name: "LA MANDARINE", sub_type: "Boulangeries - Pâtisseries", address: "Av. Maréchal Foch", city: "BRAZZAVILLE", bp: "220", tel: "06 666 66 00" },
      { name: "LE CAMBATANI", sub_type: "Catering", address: "Aéroport - Zone Fret", city: "BRAZZAVILLE", tel: "06 613 72 72" },
      { name: "NENU VIANDE", sub_type: "Boucheries - Charcuteries", address: "Av. William Guynet - Imm. Ebina", city: "BRAZZAVILLE", tel: "05 551 82 33" },
      { name: "NENULAND", sub_type: "Traiteurs", address: "Ouenzé - à côté Complexe Sportif", city: "BRAZZAVILLE", tel: "06 899 30 15" },
      { name: "PARK’N’ SHOP", sub_type: "Alimentation générale - Supermarchés - Supérettes", address: "Av. Orsi", city: "BRAZZAVILLE", bp: "1193", tel: "22 281 16 46", mail: "pnsbzv@yahoo.in" },
      { name: "PARK’N’ SHOP", sub_type: "Alimentation générale - Supermarchés - Supérettes", address: "Av. William Guynet", city: "BRAZZAVILLE", bp: "1198", tel: "05 569 47 87", mail: "pnsbzv@yahoo.in" },
      { name: "PÂTISSERIE DE FRANCE", sub_type: "Boulangeries - Pâtisseries", address: "Av. William Guynet", city: "BRAZZAVILLE", tel: "22 281 25 16" },
      { name: "RÉGAL", sub_type: "Alimentation générale - Supermarchés - Supérettes", address: "Av. Félix Eboué - Face Trésor", city: "BRAZZAVILLE", bp: "1193", tel: "22 281 16 46", mail: "regalbzv@regalcongo.com" },
      { name: "SERVAIR CONGO", sub_type: "Catering", address: "Aéroport - Zone Fret", city: "BRAZZAVILLE", tel: "06 508 09 66" },
      { name: "SOCOMOD (Sté Congolaise de Modernisation)", sub_type: "Agriculture", address: "35, av. de la Pointe Hollandaise", city: "BRAZZAVILLE", tel: "05 556 45 58" },
      { name: "STE SUNDEEP", sub_type: "Alimentation générale - Supermarchés - Supérettes", address: "Av. Félix Eboué", city: "BRAZZAVILLE", bp: "182", tel: "06 673 60 78", mail: "kushal@sundeepgroup.net", web: "www.sundeepgroup.net" },
      { name: "SUPER MARKET", sub_type: "Alimentation générale - Supermarchés - Supérettes", address: "62, Av. de France", city: "BRAZZAVILLE", bp: "2484", tel: "06 666 36 36", mail: "supermarketcongo@yahoo.fr" },
      { name: "SUPERMARCHÉ ASIA", sub_type: "Alimentation générale - Supermarchés - Supérettes", address: "Av. Amilcar Cabral", city: "BRAZZAVILLE", tel: "06 852 99 99", mail: "zhanwang-congo@outlook.com" },
      { name: "VITAL PALACE", sub_type: "Boulangeries - Pâtisseries", address: "88, av. Sergent Malamine", city: "BRAZZAVILLE", tel: "06 990 04 04" },
      { name: "WORD BUSINESS", sub_type: "Distributeurs", address: "Av. du Général de Gaulle", city: "BRAZZAVILLE", tel: "06 672 99 09", mail: "cyrbenedict@yahoo.fr" },

      // Pointe-Noire
      { name: "Baguette de chef", sub_type: "Boulangeries - Pâtisseries", address: "Avenue Ngueli Ngueli", city: "POINTE-NOIRE", tel: "06 601 97 68" },
      { name: "BOUCHERIE BRAINSTORMS WORLD (B-WORLD)", sub_type: "Boucheries - Charcuteries", address: "Quartier Moulembo tié-tié", city: "POINTE-NOIRE", tel: "06 885 27 45 / 04 002 90 86", mail: "bworldgroupe@gmail.com", web: "https://bworldgroupe.business.site/?m=true" },
      { name: "BOULANGERIE GIRMA", sub_type: "Boulangeries - Pâtisseries", address: "Av. Barthélemy Boganda", city: "POINTE-NOIRE", bp: "3", tel: "05 553 58 20 / 06 654 34 95", mail: "christianmbia@yahoo.fr" },
      { name: "CAFÉ ONERO", sub_type: "Alcool - Vins et spiritueux", address: "Av. Lamine Gueye - Face Ecole Charlemagne", city: "POINTE-NOIRE", tel: "05 558 57 60 / 06 662 77 74", mail: "cafe.onero@hotmail.com" },
      { name: "CAFÉ ONERO", sub_type: "Alimentation générale - Supermarchés - Supérettes", address: "Av. Lamine Gueye", city: "POINTE-NOIRE", bp: "1133", tel: "05 558 57 60", mail: "cafe.onero@hotmail.com" },
      { name: "CASINO SUPERMARCHÉ", sub_type: "Alimentation générale - Supermarchés - Supérettes", address: "Bd du Général Charles de Gaulle", city: "POINTE-NOIRE", bp: "748", tel: "06 662 17 54" },
      { name: "CHIMAGRO SARL ( Aliments pour bétail & animaux)", sub_type: "Agriculture", address: "Route de la Frontière - Tchimbamba", city: "POINTE-NOIRE", tel: "05 539 15 50" },
      { name: "CONGO CARES", sub_type: "Catering", address: "276, rue djomoula, Imm Tex centre-ville", city: "POINTE-NOIRE", bp: "1247", tel: "06 493 01 00", mail: "operation.cc@congocare.com" },
      { name: "CONGO CATERING", sub_type: "Catering", address: "154, av. du Général Alfred Raoul - Mpita", city: "POINTE-NOIRE", bp: "221", tel: "05 520 27 84", mail: "alainvideras@yahoo.fr" },
      { name: "COOPÉRATIVE IDAP ( Aliments pour bétail & animaux)", sub_type: "Agriculture", address: "Route de la Frontière - Ngoyo Péage", city: "POINTE-NOIRE", bp: "4105", tel: "06 651 11 33" },
      { name: "DÉLICE MAE", sub_type: "Boulangeries - Pâtisseries", address: "La Base - Face Aéroport", city: "POINTE-NOIRE", bp: "16598", tel: "05 381 45 43", mail: "info@delicesmae.com", web: "www.delicesmae.com" },
      { name: "ETS GUENIN", sub_type: "Distributeurs", address: "Av. Jacques Opangault - Z.I. de la Foire", city: "POINTE-NOIRE", bp: "94", tel: "05 572 20 03 / 06 661 20 03" },
      { name: "FERME AVICOLE ET PORCINE DANZE", sub_type: "Agriculture", address: "Route de la Frontière - Côte Matève - Ngoyo", city: "POINTE-NOIRE", bp: "3", tel: "06 666 48 54" },
      { name: "FERME SOUAMY", sub_type: "Agriculture", address: "Route de la Frontière - Tchimbamba", city: "POINTE-NOIRE", tel: "06 967 72 72" },
      { name: "INALCA", sub_type: "Distributeurs", address: "Av. Georges Domond", city: "POINTE-NOIRE", bp: "8940", tel: "06 888 55 55", mail: "inalca2005@yahoo.fr", web: "www.inalca.com" },
      { name: "L’ORIENTAL", sub_type: "Boucheries - Charcuteries", address: "Av. Moé Vangoula - Marché Plateau", city: "POINTE-NOIRE", tel: "05 545 45 45 / 05 699 99 90" },
      { name: "LA CAVE – LES ENVIES", sub_type: "Alcool - Vins et spiritueux", address: "191, bd du Général Charles de Gaulle", city: "POINTE-NOIRE", tel: "05 518 02 02 / 06 624 98 97" },
      { name: "LA CITÉ ROYALE", sub_type: "Alimentation générale - Supermarchés - Supérettes", address: "Bd Moé Kaat Matou", city: "POINTE-NOIRE", bp: "8140", tel: "06 868 22 22", mail: "samirkanafer@yahoo.com" },
      { name: "LA CITRONNELLE", sub_type: "Boulangeries - Pâtisseries", address: "16, Bd du Général Charles de Gaulle", city: "POINTE-NOIRE", bp: "1480", tel: "22 294 33 33", mail: "adelrihan@hotmail.com" },
      { name: "LE CERCLE", sub_type: "Boucheries - Charcuteries", address: "Bd de Loango - Zone Portuaire", city: "POINTE-NOIRE", tel: "05 557 99 98 / 05 520 31 02", mail: "lecercle@yattoo.com" },
      { name: "LE CERCLE", sub_type: "Traiteurs", address: "Bd de Loango - Zone Portuaire", city: "POINTE-NOIRE", tel: "05 557 99 98 / 05 520 31 02", mail: "lecercle@yattoo.com" },
      { name: "LES DÉLICES DE LA FERME SOUAMY", sub_type: "Boucheries - Charcuteries", address: "Route de la Frontière - Tchimbamba", city: "POINTE-NOIRE", tel: "06 967 72 72" },
      { name: "MDO SERVICES", sub_type: "Catering", address: "57, rue Nkassou - Wharf", city: "POINTE-NOIRE", bp: "1682", tel: "06 827 43 19 / 06 823 66 42", mail: "mdo.congobrazza@gmail.com", web: "www.mdo-groupe.com" },
      { name: "MULTICATERING CONGO", sub_type: "Catering", address: "62, rue de Livata - Songolo", city: "POINTE-NOIRE", bp: "4145", tel: "05 626 57 57", mail: "info.multicatering.congo@gmail.com", web: "www.multicatering.it" },
      { name: "NOUVELLE SUNRISE SARL", sub_type: "Alimentation générale - Supermarchés - Supérettes", address: "1, av. Jacques Opangault - Z.I. de la Foire", city: "POINTE-NOIRE", bp: "609", tel: "05 770 00 64 / 65", mail: "nouvelle.sunrise@gmail.com", web: "www.nouvellesunrise.com" },
      { name: "Pain de sucre", sub_type: "Boulangeries - Pâtisseries", address: "Centre-ville", city: "POINTE-NOIRE", tel: "06 605 33 33" },
      { name: "PARK’N’ SHOP", sub_type: "Alimentation générale - Supermarchés - Supérettes", address: "Bd du Général Charles de Gaulle - Face Supersonic", city: "POINTE-NOIRE", bp: "603", tel: "05 523 75 23 / 22 294 45 00" },
      { name: "PARK’N’ SHOP", sub_type: "Alimentation générale - Supermarchés - Supérettes", address: "Av. Emmanuel Dadet - Face Crédit du Congo", city: "POINTE-NOIRE", bp: "603", tel: "05 720 99 07 / 22 294 45 00" },
      { name: "PÂTISSERIE « CHEZ AUGUSTE »", sub_type: "Boulangeries - Pâtisseries", address: "Av. de l'Indépendance -Rond-point Gorille", city: "POINTE-NOIRE", tel: "06 813 24 48 / 06 512 82 50", mail: "laiterieauguste@gmail.com" },
      { name: "PÂTISSERIE BICLE", sub_type: "Boulangeries - Pâtisseries", address: "Route de la Frontière - Tchimbamba", city: "POINTE-NOIRE", tel: "05 563 98 03" },
      { name: "PÂTISSERIE LA CITÉ", sub_type: "Boulangeries - Pâtisseries", address: "48, Av. Moé Katt Matou", city: "POINTE-NOIRE", bp: "1253", tel: "05 553 33 23" },
      { name: "PÂTISSERIE MANDELA", sub_type: "Boulangeries - Pâtisseries", address: "49, Av. de Moussenongo - Z.I. Km 4", city: "POINTE-NOIRE", tel: "05 553 33 23" },
      { name: "PELLEGRINI CATERING CONGO", sub_type: "Catering", address: "Rue de Gamba - Z.I. Boscongo", city: "POINTE-NOIRE", bp: "1432", tel: "05 758 00 84", mail: "secretariat-congo@peca.ch", web: "www.peca.ch" },
      { name: "POISSONNERIE L’OCÉANE", sub_type: "Poissonneries", address: "Av. Jean-Félix Eboué - Zone Portuaire", city: "POINTE-NOIRE", bp: "90", tel: "05 511 11 34", mail: "socopec@yatoo.com" },
      { name: "POISSONNERIE LA MARÉE", sub_type: "Poissonneries", address: "Av. Moé Vangoula - Marché Plateau", city: "POINTE-NOIRE", bp: "1231", tel: "05 713 87 13 / 06 953 17 77" },
      { name: "PRESZA CONGO", sub_type: "Agriculture", address: "Route de la Frontière - Ngoyo Péage", city: "POINTE-NOIRE", tel: "06 506 20 64" },
      { name: "Queen B", sub_type: "Apiculture", address: "Rue d'Allebou, quartier Tchinimina", city: "POINTE-NOIRE", tel: "06 673 77 38 / 06 867 79 86", mail: "contact@queenb.pro", web: "www.queenb.pro" },
      { name: "REGAL", sub_type: "Distributeurs", address: "Av. Moe Vangoula à côté Evéché", city: "POINTE-NOIRE", bp: "603", tel: "22 294 45 00", fax: "22 294 08 10", mail: "regal@regal-congo.com" },
      { name: "REGAL 7 CHEMINS", sub_type: "Alimentation générale - Supermarchés - Supérettes", address: "Rond-point Lumumba", city: "POINTE-NOIRE", bp: "603", tel: "05 575 83 71", mail: "regallum@regal.com" },
      { name: "SAM DARON CONGO", sub_type: "Alimentation générale - Supermarchés - Supérettes", address: "Av. de Bordeaux - Port autonome", city: "POINTE-NOIRE", bp: "95", tel: "05 535 62 42", mail: "sam-cgpnr@daron-shipchandler.com" },
      { name: "SAM DARON CONGO", sub_type: "Catering", address: "Av. de Bordeaux - Enceinte Port Autonome", city: "POINTE-NOIRE", bp: "95", tel: "05 535 62 42", mail: "sam-cgpnr@daron-shipchandler.com" },
      { name: "SCIE Sarl (Société Congolaise d’Import Export)", sub_type: "Distributeurs", address: "Av. Emmanuel Dadet", city: "POINTE-NOIRE", tel: "05 000 00 19 / 05 538 99 88", mail: "iex.sci@gmail.com" },
      { name: "SEA FOOD", sub_type: "Poissonneries", address: "14, Av. Moé Vangoula - Face Stade Anselemie", city: "POINTE-NOIRE", tel: "04 433 43 43 / 06 435 44 44" },
      { name: "SERVAIR CONGO", sub_type: "Catering", address: "Aéroport - Zone Fret", city: "POINTE-NOIRE", tel: "06 508 09 62" },
      { name: "SODEXO CONGO", sub_type: "Catering", address: "Av. Théophile Mbemba", city: "POINTE-NOIRE", bp: "1624", tel: "05 544 16 96" },
      { name: "STE SUNDEEP", sub_type: "Alimentation générale - Supermarchés - Supérettes", address: "30, bd Moé Kaat Matou - Imm. Masséké", city: "POINTE-NOIRE", tel: "06 673 60 79 / 06 657 25 00" },
      { name: "STGI (Services et Travaux Généraux Intermédiaires)", sub_type: "Catering", address: "Av. Linguissi Pembelot", city: "POINTE-NOIRE", bp: "3109", tel: "05 553 41 78", mail: "stgi_pointe-noire@yahoo.fr" },
      { name: "SUPER MARKET", sub_type: "Alimentation générale - Supermarchés - Supérettes", address: "Av. Raymond Paillet - Grand Marché - Ligne 3", city: "POINTE-NOIRE", bp: "2484", tel: "06 659 75 00", mail: "mjgrand_ecart@yahoo.fr" },
      { name: "VINACLE", sub_type: "Alcool - Vins et spiritueux", address: "Av. Moé Téli", city: "POINTE-NOIRE", tel: "06 927 16 69 / 05 642 07 20" },

      // Dolisie
      { name: "PARK’N’ SHOP", sub_type: "Alimentation générale - Supermarchés - Supérettes", address: "Av. de la République - Face Ecobank", city: "DOLISIE", bp: "603", tel: "05 523 59 26 / 05 761 85 05" },
      { name: "SAB1", sub_type: "Boulangeries - Pâtisseries", address: "Av. de la République", city: "DOLISIE", tel: "05 360 77 05", mail: "congolais@me.com" }
    ];

    for (const item of items) {
      await db.query(
        `INSERT INTO portfolio_items 
        (category_id, name, sub_type, address, city, bp, tel, fax, mail, web) 
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [catId, item.name, item.sub_type, item.address || null, item.city, item.bp || null, item.tel || null, item.fax || null, item.mail || null, item.web || null]
      );
    }
    console.log("Seeded portfolio items for ALIMENTATION ET DISTRIBUTION");
  } catch (err) {
    console.error("Failed to seed alimentation items:", err);
  }
}

async function seedAnimauxVeterinairesItems() {
  try {
    const catResult = await db.query("SELECT id FROM categories WHERE name = 'ANIMAUX ET VÉTÉRINAIRES'");
    if (catResult.rows.length === 0) return;
    const catId = catResult.rows[0].id;

    const itemsCountResult = await db.query("SELECT COUNT(*) as count FROM portfolio_items WHERE category_id = $1", [catId]);
    const currentCount = parseInt(itemsCountResult.rows[0].count);

    if (currentCount !== 9) {
      console.log("Seeding ANIMAUX ET VÉTÉRINAIRES (9 items)...");
      await db.query("DELETE FROM portfolio_items WHERE category_id = $1", [catId]);
    } else {
      return;
    }

    const items = [
      // Brazzaville
      { name: "ANIMALIER", sub_type: "Vétérinaires", address: "174, rue Bayonne Bacongo", city: "BRAZZAVILLE", tel: "05 521 79 78", mail: "animalier2010@hotmail.com" },
      { name: "CABINET VÉTÉRINAIRE", sub_type: "Vétérinaires", address: "Av. Savorgnan de Brazza", city: "BRAZZAVILLE", tel: "06 664 77 22" },
      
      // Pointe-Noire
      { name: "ANIMALIA – ANIMAL CENTER", sub_type: "Alimentation animale et Toilettage", address: "Rue Limbou", city: "POINTE-NOIRE", bp: "112", tel: "06 696 10 01", mail: "animaliacongo@yattoo.com", web: "www.animalia-congo.com" },
      { name: "CABINET VÉTÉRINAIRE DU CENTRE", sub_type: "Vétérinaires", address: "8, Av. Moé Vangoula - Marché Plateau", city: "POINTE-NOIRE", bp: "4868", tel: "05 557 76 01 / 06 673 13 47", mail: "cabinetveterinairecentre@hotmail.com" },
      { name: "DR BATCHY JEAN AIMÉ", sub_type: "Vétérinaires", address: "Av. Antonio Agostino Néto - Face à la Clinique Guénin", city: "POINTE-NOIRE", tel: "06 664 05 75" },
      { name: "FAL’H VÉTÉRINAIRE", sub_type: "Vétérinaires", address: "15, av. Panzou", city: "POINTE-NOIRE", tel: "22 294 12 17 / 05 534 12 97" },
      { name: "HELP CONGO", sub_type: "Association", address: "29 Av. Emmanuel Dadet", city: "POINTE-NOIRE", tel: "05 539 59 08", mail: "ecrire@help-primates.org", web: "www.help-primates.org" },
      { name: "K-CHIMIE", sub_type: "Alimentation animale et Toilettage", address: "79, rue Boulaya", city: "POINTE-NOIRE", bp: "1289", tel: "06 632 02 53 - 05 558 42 98", mail: "contact@kchimie.com", web: "www.kchimie.com" },
      { name: "SCAB CONGO S.A.", sub_type: "Pension et éducation canine", address: "Chenil Kento Mossi - Route de Djeno", city: "POINTE-NOIRE", tel: "05 546 20 72 / 05 537 12 14", mail: "scabsecu@hotmail.com" }
    ];

    for (const item of items) {
      await db.query(
        `INSERT INTO portfolio_items 
        (category_id, name, sub_type, address, city, bp, tel, fax, mail, web) 
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [catId, item.name, item.sub_type, item.address || null, item.city, item.bp || null, item.tel || null, null, item.mail || null, item.web || null]
      );
    }
    console.log("Seeded portfolio items for ANIMAUX ET VÉTÉRINAIRES");
  } catch (err) {
    console.error("Failed to seed animaux items:", err);
  }
}

async function seedAssistanceJuridiqueItems() {
  try {
    const catResult = await db.query("SELECT id FROM categories WHERE name = 'ASSISTANCE JURIDIQUE, COMPTABLE ET FISCALE'");
    if (catResult.rows.length === 0) return;
    const catId = catResult.rows[0].id;

    const items = [
      {
            name: 'AKOUALA Frédéric',
            sub_type: 'Huissiers',
            city: 'BRAZZAVILLE',
            tel: '05 526 76 29'
      },
      {
            name: 'AMISSELEVE Edith',
            sub_type: 'Huissiers',
            city: 'BRAZZAVILLE',
            tel: '05 526 88 11'
      },
      {
            name: 'AMVOULA OBAMBI Gilbert',
            sub_type: 'Avocats',
            city: 'BRAZZAVILLE',
            tel: '06 661 66 12 / 05 727 02 27'
      },
      {
            name: 'ANGOUELET André Patrick',
            sub_type: 'Notaires',
            city: 'BRAZZAVILLE',
            tel: '05 521 69 19 / 06 621 69 19'
      },
      {
            name: 'ATIA Rufin',
            sub_type: 'Huissiers',
            city: 'BRAZZAVILLE',
            tel: '05 522 09 96'
      },
      {
            name: 'BACKEMBA RODRIGUE',
            sub_type: 'Notaires',
            city: 'BRAZZAVILLE',
            tel: '06 407 85 64 / 05 025 72 73'
      },
      {
            name: 'BALOKI Gilbert',
            sub_type: 'Huissiers',
            city: 'BRAZZAVILLE',
            tel: '05 545 11 98 / 06 664 75 77'
      },
      {
            name: 'BAMZOUZI Alain',
            sub_type: 'Avocats',
            city: 'BRAZZAVILLE',
            tel: '05 564 57 25 / 05 521 58 17'
      },
      {
            name: 'BANGUI ATSOUTSOU Rock',
            sub_type: 'Huissiers',
            city: 'BRAZZAVILLE',
            tel: '05 556 83 04'
      },
      {
            name: 'BANI SIMBA',
            sub_type: 'Avocats',
            city: 'BRAZZAVILLE',
            tel: '05 528 57 04 / 06 683 29 02'
      },
      {
            name: 'BANTINA Fatou Eveline',
            sub_type: 'Huissiers',
            city: 'BRAZZAVILLE',
            tel: '05 545 72 62'
      },
      {
            name: 'BANTSOUMBA Camille',
            sub_type: 'Huissiers',
            city: 'BRAZZAVILLE',
            tel: '05 521 97 84'
      },
      {
            name: 'BANZANI MOLLET Fatima',
            sub_type: 'Avocats',
            city: 'BRAZZAVILLE',
            tel: '22 281 55 60 / 05 536 40 07'
      },
      {
            name: 'BANZANI RIGOBERT Sabin',
            sub_type: 'Avocats',
            city: 'BRAZZAVILLE',
            tel: '22 281 55 60 / 06 628 63 32'
      },
      {
            name: 'BAVOUEZA GUINOT Giscard',
            sub_type: 'Notaires',
            city: 'BRAZZAVILLE',
            tel: '06 668 58 14 / 05 775 69 43'
      },
      {
            name: 'BIANGA Prosper',
            sub_type: 'Avocats',
            city: 'BRAZZAVILLE',
            tel: '05 556 53 85'
      },
      {
            name: 'BIDIE Jean Didier',
            sub_type: 'Huissiers',
            city: 'BRAZZAVILLE',
            tel: '05 551 34 43'
      },
      {
            name: 'BIMBENI GERVEL Eric',
            sub_type: 'Notaires',
            city: 'BRAZZAVILLE',
            tel: '06 953 29 91 / 06 666 11 94'
      },
      {
            name: 'BINGOUBI BENOIT Jean-Marie',
            sub_type: 'Avocats',
            city: 'BRAZZAVILLE',
            tel: '05 528 41 35 / 06 678 20 49'
      },
      {
            name: 'BITEMBO Gaëtan',
            sub_type: 'Huissiers',
            city: 'BRAZZAVILLE',
            tel: '05 551 61 15 / 06 565 40 58'
      },
      {
            name: 'BONDONGO Gilbert',
            sub_type: 'Avocats',
            city: 'BRAZZAVILLE',
            tel: '05 551 61 68'
      },
      {
            name: 'BONGOTO Roger',
            sub_type: 'Avocats',
            city: 'BRAZZAVILLE',
            tel: '06 668 72 69'
      },
      {
            name: 'BOUBOUTOU BEMBA Jean-Baptiste',
            sub_type: 'Notaires',
            city: 'BRAZZAVILLE',
            tel: '05 558 52 96'
      },
      {
            name: 'CAC International',
            sub_type: 'Audit et expertise comptable',
            city: 'BRAZZAVILLE',
            tel: '06 678 90 18'
      },
      {
            name: 'CACOGES (Cabinet d’Audit de Conseil et de Gestion)',
            sub_type: 'Audit et expertise comptable',
            city: 'BRAZZAVILLE',
            tel: '06 989 06 06'
      },
      {
            name: 'CIBLE RH & ETUDE',
            sub_type: 'Conseil en management',
            city: 'BRAZZAVILLE',
            tel: '06 926 25 53'
      },
      {
            name: 'DEVILLERS Gérard',
            sub_type: 'Avocats',
            city: 'BRAZZAVILLE',
            tel: '22 281 18 78'
      },
      {
            name: 'DIANGUITOUKOULOU Alphonse',
            sub_type: 'Avocats',
            city: 'BRAZZAVILLE',
            tel: '05 528 45 41'
      },
      {
            name: 'DIANZOLO BANZOUZI Béatrice',
            sub_type: 'Huissiers',
            city: 'BRAZZAVILLE',
            tel: '05 528 12 91'
      },
      {
            name: 'DIMANA Clarisse',
            sub_type: 'Huissiers',
            city: 'BRAZZAVILLE',
            tel: '06 673 30 12'
      },
      {
            name: 'DOTH SAMBA Guy',
            sub_type: 'Huissiers',
            city: 'BRAZZAVILLE',
            tel: '05 551 07 22 / 06 634 70 27'
      },
      {
            name: 'EMERY MUKENDI WAFWANA & ASSOCIATES',
            sub_type: 'Conseil juridique et fiscal',
            city: 'BRAZZAVILLE',
            tel: '05 355 08 88'
      },
      {
            name: 'EMINAMBONGO Christian',
            sub_type: 'Avocats',
            city: 'BRAZZAVILLE',
            tel: '06 936 36 60'
      },
      {
            name: 'EMPILO NGAMBOU Douthine',
            sub_type: 'Avocats',
            city: 'BRAZZAVILLE',
            tel: '06 657 78 00'
      },
      {
            name: 'ERNST & YOUNG',
            sub_type: 'Audit et expertise comptable',
            city: 'BRAZZAVILLE',
            tel: '06 666 66 61'
      },
      {
            name: 'ESSOU Désiré Ludovic',
            sub_type: 'Avocats',
            city: 'BRAZZAVILLE',
            tel: '05 556 00 98 / 06 660 06 96'
      },
      {
            name: 'EWAWO Louis',
            sub_type: 'Avocats',
            city: 'BRAZZAVILLE',
            tel: '06 667 66 55'
      },
      {
            name: 'EY/FFA CONGO',
            sub_type: 'Audit et expertise comptable',
            city: 'BRAZZAVILLE',
            tel: '06 666 66 61'
      },
      {
            name: 'GALIBA Armand Blaise',
            sub_type: 'Avocats',
            city: 'BRAZZAVILLE',
            tel: '05 581 24 63 / 04 403 05 84'
      },
      {
            name: 'GKM',
            sub_type: 'Audit et expertise comptable',
            city: 'BRAZZAVILLE',
            tel: '06 666 64 82'
      },
      {
            name: 'GOLATSIE Clément',
            sub_type: 'Avocats',
            city: 'BRAZZAVILLE',
            tel: '05 531 81 44'
      },
      {
            name: 'GONDI Pierre',
            sub_type: 'Avocats',
            city: 'BRAZZAVILLE',
            tel: '05 521 36 59'
      },
      {
            name: 'GOTENI Pierre',
            sub_type: 'Avocats',
            city: 'BRAZZAVILLE',
            tel: '22 281 28 86 / 06 666 34 67'
      },
      {
            name: 'HOMBESSA Gabriel',
            sub_type: 'Avocats',
            city: 'BRAZZAVILLE',
            tel: '22 281 19 07 / 06 666 82 89'
      },
      {
            name: 'IBOUANGA Eric Yvon',
            sub_type: 'Avocats',
            city: 'BRAZZAVILLE',
            tel: '22 281 34 42'
      },
      {
            name: 'ISSENGUE Béatrice',
            sub_type: 'Avocats',
            city: 'BRAZZAVILLE',
            tel: '05 525 77 61 / 06 634 15 93'
      },
      {
            name: 'ITOUA LEBO Rock Nicaise',
            sub_type: 'Avocats',
            city: 'BRAZZAVILLE',
            tel: '05 564 57 25 / 05 521 58 17'
      },
      {
            name: 'KATOUKOULOU Léontine Pélagie',
            sub_type: 'Avocats',
            city: 'BRAZZAVILLE',
            tel: '05 551 37 74 / 06 677 16 38'
      },
      {
            name: 'LANDZE Edgard',
            sub_type: 'Huissiers',
            city: 'BRAZZAVILLE',
            tel: '06 665 23 41 / 05 558 75 85'
      },
      {
            name: 'LEKA Basile',
            sub_type: 'Avocats',
            city: 'BRAZZAVILLE',
            tel: '05 551 87 51 / 06 637 74 36'
      },
      {
            name: 'LIBOKO Maixent Ulrich',
            sub_type: 'Huissiers',
            city: 'BRAZZAVILLE',
            tel: '05 521 39 00 / 06 631 43 66'
      },
      {
            name: 'LOCKO Eric Christian',
            sub_type: 'Avocats',
            city: 'BRAZZAVILLE',
            tel: '22 281 34 42'
      },
      {
            name: 'LOCKO MAFINA Josiane',
            sub_type: 'Notaires',
            city: 'BRAZZAVILLE',
            tel: '06 666 26 82'
      },
      {
            name: 'LOEMBA LAMBERT Aimé',
            sub_type: 'Avocats',
            city: 'BRAZZAVILLE',
            tel: '05 544 65 41'
      },
      {
            name: 'LOUBOULA Salomon',
            sub_type: 'Notaires',
            city: 'BRAZZAVILLE',
            tel: '06 677 89 61'
      },
      {
            name: 'LOUTANGOU Dieudonné',
            sub_type: 'Avocats',
            city: 'BRAZZAVILLE',
            tel: '06 977 06 38'
      },
      {
            name: 'LOUZITOU .F. André',
            sub_type: 'Huissiers',
            city: 'BRAZZAVILLE',
            tel: '06 993 58 96 / 05 549 85 71'
      },
      {
            name: 'MABASSI Jean Prosper',
            sub_type: 'Avocats',
            city: 'BRAZZAVILLE',
            tel: '05 551 03 14 / 06 663 10 40'
      },
      {
            name: 'MABIALA MOUCH.UALA Alexi',
            sub_type: 'Avocats',
            city: 'BRAZZAVILLE',
            tel: '06 674 60 39 / 05 528 39 52'
      },
      {
            name: 'MAHOUTA Michel Kaboul',
            sub_type: 'Notaires',
            city: 'BRAZZAVILLE',
            tel: '06 666 66 48'
      },
      {
            name: 'MAKAYA MAKUMBU Raïssa',
            sub_type: 'Notaires',
            city: 'BRAZZAVILLE',
            tel: '06 651 13 85'
      },
      {
            name: 'MAKINDOU Roger',
            sub_type: 'Huissiers',
            city: 'BRAZZAVILLE',
            tel: '05 532 75 32'
      },
      {
            name: 'MAKOSSO Guy Remy',
            sub_type: 'Avocats',
            city: 'BRAZZAVILLE',
            tel: '06 666 37 84'
      },
      {
            name: 'MALANDA Aimé Jean Florent',
            sub_type: 'Avocats',
            city: 'BRAZZAVILLE',
            tel: '05 535 74 40'
      },
      {
            name: 'MALANDA Alma',
            sub_type: 'Huissiers',
            city: 'BRAZZAVILLE',
            tel: '05 518 61 60 / 06 979 09 42'
      },
      {
            name: 'MALANDA Sébastien',
            sub_type: 'Huissiers',
            city: 'BRAZZAVILLE',
            tel: '05 577 27 38'
      },
      {
            name: 'MALONGA Alain Fortuné',
            sub_type: 'Avocats',
            city: 'BRAZZAVILLE',
            tel: '06 624 72 21 / 05 554 14 12'
      },
      {
            name: 'MALONGA Jean-Pierre',
            sub_type: 'Huissiers',
            city: 'BRAZZAVILLE',
            tel: '05 568 18 45'
      },
      {
            name: 'MATONDO GOMA Ange',
            sub_type: 'Huissiers',
            city: 'BRAZZAVILLE',
            tel: '05 551 54 69 / 06 664 80 33'
      },
      {
            name: 'MATOUMONA HENRIQUET Françoise',
            sub_type: 'Huissiers',
            city: 'BRAZZAVILLE',
            tel: '06 666 10 18'
      },
      {
            name: 'MBANI OMBELLE Hugues',
            sub_type: 'Huissiers',
            city: 'BRAZZAVILLE',
            tel: '05 528 12 10'
      },
      {
            name: 'MBEMBA Jean Martin',
            sub_type: 'Avocats',
            city: 'BRAZZAVILLE',
            tel: '22 281 18 78'
      },
      {
            name: 'MBIZI Simplice',
            sub_type: 'Huissiers',
            city: 'BRAZZAVILLE',
            tel: '06 627 98 63'
      },
      {
            name: 'MBON Nazaire',
            sub_type: 'Huissiers',
            city: 'BRAZZAVILLE',
            tel: '06 663 23 05'
      },
      {
            name: 'MBONGO Françoise',
            sub_type: 'Avocats',
            city: 'BRAZZAVILLE',
            tel: '05 556 02 18'
      },
      {
            name: 'MIKASSOU Alphonse',
            sub_type: 'Huissiers',
            city: 'BRAZZAVILLE',
            tel: '05 525 57 51'
      },
      {
            name: 'MOKOKO Freddy Cyriaque',
            sub_type: 'Notaires',
            city: 'BRAZZAVILLE',
            tel: '06 661 23 53'
      },
      {
            name: 'MONGO MOMBOULY Alain',
            sub_type: 'Notaires',
            city: 'BRAZZAVILLE',
            tel: '05 558 30 17'
      },
      {
            name: 'MORABEA OPELE Casimir',
            sub_type: 'Huissiers',
            city: 'BRAZZAVILLE',
            tel: '06 668 08 90 / 05 585 17 23'
      },
      {
            name: 'MOUANDZA BOUFOUENI Aubierge Prsica',
            sub_type: 'Notaires',
            city: 'BRAZZAVILLE',
            tel: '06 669 26 76'
      },
      {
            name: 'MOUNDELE MATOKO Marie de l’Assomption',
            sub_type: 'Notaires',
            city: 'BRAZZAVILLE',
            tel: '06 675 84 36'
      },
      {
            name: 'MOUNGUENGUE Ludovic',
            sub_type: 'Notaires',
            city: 'BRAZZAVILLE',
            tel: '06 665 34 83'
      },
      {
            name: 'MOUSSOUNDA Jean-Marie',
            sub_type: 'Notaires',
            city: 'BRAZZAVILLE',
            tel: '06 664 83 17'
      },
      {
            name: 'MVINZOU LEMBA Hortense',
            sub_type: 'Notaires',
            city: 'BRAZZAVILLE',
            tel: '06 650 53 28'
      },
      {
            name: 'NGANGA Alain Telesphore',
            sub_type: 'Huissiers',
            city: 'BRAZZAVILLE',
            tel: '05 545 60 06'
      },
      {
            name: 'NGATSONO GNAPY Mireille',
            sub_type: 'Notaires',
            city: 'BRAZZAVILLE',
            tel: '05 521 44 90'
      },
      {
            name: 'NKOUKA Félix',
            sub_type: 'Avocats',
            city: 'BRAZZAVILLE',
            tel: '05 551 17 40 / 05 531 01 99'
      },
      {
            name: 'NSONDE Boniface',
            sub_type: 'Avocats',
            city: 'BRAZZAVILLE',
            tel: '22 281 49 44 / 06 666 85 43'
      },
      {
            name: 'NTANDOU-LY RAMA Marline Claudia',
            sub_type: 'Notaires',
            city: 'BRAZZAVILLE',
            tel: '06 662 07 30'
      },
      {
            name: 'NZONDO Emilie',
            sub_type: 'Avocats',
            city: 'BRAZZAVILLE',
            tel: '06 666 21 55 / 05 558 46 14'
      },
      {
            name: 'NZOUZI Blaise Serge',
            sub_type: 'Avocats',
            city: 'BRAZZAVILLE',
            tel: '05 521 87 96'
      },
      {
            name: 'OBAMBE Antoine',
            sub_type: 'Avocats',
            city: 'BRAZZAVILLE',
            tel: '06 666 57 93 / 05 527 96 08'
      },
      {
            name: 'OKEMBA ELENGA Brice Bruno',
            sub_type: 'Huissiers',
            city: 'BRAZZAVILLE',
            tel: '06 663 74 24'
      },
      {
            name: 'OKEMBA NGABONDO Jérôme',
            sub_type: 'Huissiers',
            city: 'BRAZZAVILLE',
            tel: '06 661 00 44'
      },
      {
            name: 'OKOGO Emile',
            sub_type: 'Huissiers',
            city: 'BRAZZAVILLE',
            tel: '05 525 75 29'
      },
      {
            name: 'OKOUYA MAKOUKA Sophie',
            sub_type: 'Notaires',
            city: 'BRAZZAVILLE',
            tel: '06 676 43 51'
      },
      {
            name: 'OLOMBI Jean-Claude',
            sub_type: 'Huissiers',
            city: 'BRAZZAVILLE',
            tel: '05 551 37 47'
      },
      {
            name: 'ONDONGO Jean',
            sub_type: 'Huissiers',
            city: 'BRAZZAVILLE',
            tel: '05 536 88 88'
      },
      {
            name: 'ONDZIEL GNELENGA Julienne',
            sub_type: 'Avocats',
            city: 'BRAZZAVILLE',
            tel: '22 281 34 42'
      },
      {
            name: 'OPANDET Gilbert',
            sub_type: 'Notaires',
            city: 'BRAZZAVILLE',
            tel: '05 556 16 69'
      },
      {
            name: 'OPERE Jacques',
            sub_type: 'Notaires',
            city: 'BRAZZAVILLE',
            tel: '05 531 24 23'
      },
      {
            name: 'OSSENGUE Guy Ernest',
            sub_type: 'Huissiers',
            city: 'BRAZZAVILLE',
            tel: '05 528 45 18'
      },
      {
            name: 'OYENGA Désiré',
            sub_type: 'Avocats',
            city: 'BRAZZAVILLE',
            tel: '05 538 35 24'
      },
      {
            name: 'PEYA LONONGO',
            sub_type: 'Huissiers',
            city: 'BRAZZAVILLE',
            tel: '05 522 29 51'
      },
      {
            name: 'PRICEWATERHOUSECOOPERS (PWC)',
            sub_type: 'Audit et expertise comptable',
            city: 'BRAZZAVILLE',
            tel: '06 693 01 01'
      },
      {
            name: 'QUENUM André François',
            sub_type: 'Avocats',
            city: 'BRAZZAVILLE',
            tel: '05 551 48 61'
      },
      {
            name: 'RAINBOW FINANCE',
            sub_type: 'Audit et expertise comptable',
            city: 'BRAZZAVILLE',
            tel: '06 923 02 02'
      },
      {
            name: 'SOW Yvon',
            sub_type: 'Huissiers',
            city: 'BRAZZAVILLE',
            tel: '05 556 24 55'
      },
      {
            name: 'TABOU & KILA',
            sub_type: 'Audit et expertise comptable',
            city: 'BRAZZAVILLE',
            tel: '06 662 92 13'
      },
      {
            name: 'TONDO Rita Félicitée',
            sub_type: 'Huissiers',
            city: 'BRAZZAVILLE',
            tel: '05 536 78 52 / 06 675 83 96'
      },
      {
            name: 'TSALATSOUZI Alphonsine',
            sub_type: 'Huissiers',
            city: 'BRAZZAVILLE',
            tel: '05 531 05 94'
      },
      {
            name: 'TSILA ISSAN Giska',
            sub_type: 'Avocats',
            city: 'BRAZZAVILLE',
            tel: '06 660 25 80'
      },
      {
            name: 'YOKASSA NKONDA Guy Aimé',
            sub_type: 'Avocats',
            city: 'BRAZZAVILLE',
            tel: '06 653 16 91'
      },
      {
            name: 'YOMBI Norbert',
            sub_type: 'Avocats',
            city: 'BRAZZAVILLE',
            tel: '05 551 98 54'
      },
      {
            name: 'ZINGOULA Andrée Brigitte',
            sub_type: 'Avocats',
            city: 'BRAZZAVILLE',
            tel: '06 668 21 29 / 05 574 74 49'
      },
      {
            name: 'ZOLO Joseph',
            sub_type: 'Huissiers',
            city: 'BRAZZAVILLE',
            tel: '05 532 07 09'
      },
      {
            name: 'ZOLO MOSSEMBA Churchill Anicet',
            sub_type: 'Huissiers',
            city: 'BRAZZAVILLE',
            tel: '05 538 24 36'
      },
  {
    name: "BABEDISSA Victorien",
    type: "ASSISTANCE JURIDIQUE, COMPTABLE ET FISCALE",
    sub_type: "Huissiers",
    city: "Pointe-Noire",
    tel: "06 658 28 04"
  },
  {
    name: "BAKOUETE Guillaume",
    type: "ASSISTANCE JURIDIQUE, COMPTABLE ET FISCALE",
    sub_type: "Avocats",
    city: "Pointe-Noire",
    tel: "05 533 38 68 / 06 661 73 27"
  },
  {
    name: "BASSAKININA Jean Aimé Boniface",
    type: "ASSISTANCE JURIDIQUE, COMPTABLE ET FISCALE",
    sub_type: "Avocats",
    city: "Pointe-Noire",
    tel: "06 681 36 28 / 05 770 83 19"
  },
  {
    name: "BATCHI André",
    type: "ASSISTANCE JURIDIQUE, COMPTABLE ET FISCALE",
    sub_type: "Avocats",
    city: "Pointe-Noire",
    tel: "05 553 88 81 / 04 483 35 75"
  },
  {
    name: "BATIA Paul Bertrand",
    type: "ASSISTANCE JURIDIQUE, COMPTABLE ET FISCALE",
    sub_type: "Notaires",
    city: "Pointe-Noire",
    tel: "05 534 46 83 / 06 656 55 49"
  },
  {
    name: "BAYANGAMA Roland Serge",
    type: "ASSISTANCE JURIDIQUE, COMPTABLE ET FISCALE",
    sub_type: "Avocats",
    city: "Pointe-Noire",
    tel: "05 523 69 04 / 06 974 59 31"
  },
  {
    name: "BAYONNE Jean Frédéric",
    type: "ASSISTANCE JURIDIQUE, COMPTABLE ET FISCALE",
    sub_type: "Huissiers",
    city: "Pointe-Noire",
    tel: "05 562 56 65 / 06 662 56 65"
  },
  {
    name: "BEMBELLY Roland",
    type: "ASSISTANCE JURIDIQUE, COMPTABLE ET FISCALE",
    sub_type: "Avocats",
    city: "Pointe-Noire",
    tel: "06 688 62 79 / 05 749 15 17"
  },
  {
    name: "BESSOVI Florence",
    type: "ASSISTANCE JURIDIQUE, COMPTABLE ET FISCALE",
    sub_type: "Notaires",
    city: "Pointe-Noire",
    tel: "05 555 64 54 / 06 628 89 75"
  },
  {
    name: "BIGEMI Reine Angèle Patricia",
    type: "ASSISTANCE JURIDIQUE, COMPTABLE ET FISCALE",
    sub_type: "Avocats",
    city: "Pointe-Noire",
    tel: "05 530 25 24 / 06 638 45 31"
  },
  {
    name: "BOMBA MATONGO Aimé",
    type: "ASSISTANCE JURIDIQUE, COMPTABLE ET FISCALE",
    sub_type: "Avocats",
    city: "Pointe-Noire",
    tel: "06 603 15 17 / 05 603 15 17"
  },
  {
    name: "BOUANGA GNIANGAISE Christelle Eliane",
    type: "ASSISTANCE JURIDIQUE, COMPTABLE ET FISCALE",
    sub_type: "Notaires",
    city: "Pointe-Noire",
    tel: "05 539 37 46 / 06 672 48 78"
  },
  {
    name: "BOUYOU Patrick",
    type: "ASSISTANCE JURIDIQUE, COMPTABLE ET FISCALE",
    sub_type: "Huissiers",
    city: "Pointe-Noire",
    tel: "05 553 57 98"
  },
  {
    name: "CABINET COMPTABLE BEMCGQPS",
    type: "ASSISTANCE JURIDIQUE, COMPTABLE ET FISCALE",
    sub_type: "Audit et expertise comptable",
    city: "Pointe-Noire",
    tel: "06 671 28 92"
  },
  {
    name: "CABINET CONSEIL MPK",
    type: "ASSISTANCE JURIDIQUE, COMPTABLE ET FISCALE",
    sub_type: "Audit et expertise comptable",
    city: "Pointe-Noire",
    tel: "06 663 56 34"
  },
  {
    name: "CABINET KOUZOLO",
    type: "ASSISTANCE JURIDIQUE, COMPTABLE ET FISCALE",
    sub_type: "Audit et expertise comptable",
    city: "Pointe-Noire",
    tel: "22 294 19 60"
  },
  {
    name: "CALLIOPA AFRIQUE",
    type: "ASSISTANCE JURIDIQUE, COMPTABLE ET FISCALE",
    sub_type: "Conseil en management",
    city: "Pointe-Noire",
    tel: "05 559 39 81"
  },
  {
    name: "CARLE Fernand",
    type: "ASSISTANCE JURIDIQUE, COMPTABLE ET FISCALE",
    sub_type: "Avocats",
    city: "Pointe-Noire",
    tel: "05 557 68 98"
  },
  {
    name: "DELOITTE TOUCHE TOHMATSU",
    type: "ASSISTANCE JURIDIQUE, COMPTABLE ET FISCALE",
    sub_type: "Audit et expertise comptable",
    city: "Pointe-Noire",
    tel: "05 714 33 67"
  },
  {
    name: "DEQUET BOLLO Serge",
    type: "ASSISTANCE JURIDIQUE, COMPTABLE ET FISCALE",
    sub_type: "Huissiers",
    city: "Pointe-Noire",
    tel: "06 674 27 72 / 05 529 88 83"
  },
  {
    name: "DIMENA Félix",
    type: "ASSISTANCE JURIDIQUE, COMPTABLE ET FISCALE",
    sub_type: "Huissiers",
    city: "Pointe-Noire",
    tel: "06 664 55 96"
  },
  {
    name: "DINAMONA KIDILOU Angélique",
    type: "ASSISTANCE JURIDIQUE, COMPTABLE ET FISCALE",
    sub_type: "Notaires",
    city: "Pointe-Noire",
    tel: "05 563 72 06 / 06 672 54 17"
  },
  {
    name: "DZONDAULT Raymond Joseph",
    type: "ASSISTANCE JURIDIQUE, COMPTABLE ET FISCALE",
    sub_type: "Avocats",
    city: "Pointe-Noire",
    tel: "06 664 18 97"
  },
  {
    name: "ELENGA Anatole",
    type: "ASSISTANCE JURIDIQUE, COMPTABLE ET FISCALE",
    sub_type: "Avocats",
    city: "Pointe-Noire",
    tel: "01 980 44 44 / 06 660 78 78"
  },
  {
    name: "ELOHI CONGO",
    type: "ASSISTANCE JURIDIQUE, COMPTABLE ET FISCALE",
    sub_type: "Audit et expertise comptable",
    city: "Pointe-Noire",
    tel: "05 551 20 66"
  },
  {
    name: "ERNST & YOUNG",
    type: "ASSISTANCE JURIDIQUE, COMPTABLE ET FISCALE",
    sub_type: "Conseil juridique et fiscal",
    city: "Pointe-Noire",
    tel: "05 530 16 22"
  },
  {
    name: "EY/FFA CONGO",
    type: "ASSISTANCE JURIDIQUE, COMPTABLE ET FISCALE",
    sub_type: "Conseil juridique et fiscal",
    city: "Pointe-Noire",
    tel: "05 530 16 22"
  },
  {
    name: "FIDINTER",
    type: "ASSISTANCE JURIDIQUE, COMPTABLE ET FISCALE",
    sub_type: "Audit et expertise comptable",
    city: "Pointe-Noire",
    tel: "22 294 22 71"
  },
  {
    name: "FISCONGO",
    type: "ASSISTANCE JURIDIQUE, COMPTABLE ET FISCALE",
    sub_type: "Conseil en management",
    city: "Pointe-Noire",
    tel: "06 862 66 63"
  },
  {
    name: "FOUTOU DIETRICH Norbert",
    type: "ASSISTANCE JURIDIQUE, COMPTABLE ET FISCALE",
    sub_type: "Notaires",
    city: "Pointe-Noire",
    tel: "05 559 13 59 / 06 952 51 44"
  },
  {
    name: "GNALI GOMES Yvon François Dominique",
    type: "ASSISTANCE JURIDIQUE, COMPTABLE ET FISCALE",
    sub_type: "Notaires",
    city: "Pointe-Noire",
    tel: "05 559 72 72 / 06 659 72 72"
  },
  {
    name: "GNITOU Benjamin",
    type: "ASSISTANCE JURIDIQUE, COMPTABLE ET FISCALE",
    sub_type: "Huissiers",
    city: "Pointe-Noire",
    tel: "06 666 74 15"
  },
  {
    name: "GOMA Marcel",
    type: "ASSISTANCE JURIDIQUE, COMPTABLE ET FISCALE",
    sub_type: "Avocats",
    city: "Pointe-Noire",
    tel: "05 553 01 09"
  },
  {
    name: "GOMA TCHIBINDA Romuald",
    type: "ASSISTANCE JURIDIQUE, COMPTABLE ET FISCALE",
    sub_type: "Huissiers",
    city: "Pointe-Noire",
    tel: "06 663 41 75 / 05 593 21 02"
  },
  {
    name: "GOMES Alexis Vincent",
    type: "ASSISTANCE JURIDIQUE, COMPTABLE ET FISCALE",
    sub_type: "Avocats",
    city: "Pointe-Noire",
    tel: "05 550 86 95"
  },
  {
    name: "GOUEMBE OKEMBA Lin Brice",
    type: "ASSISTANCE JURIDIQUE, COMPTABLE ET FISCALE",
    sub_type: "Avocats",
    city: "Pointe-Noire",
    tel: "06 670 31 19"
  },
  {
    name: "IBOUANGA Jean Luc",
    type: "ASSISTANCE JURIDIQUE, COMPTABLE ET FISCALE",
    sub_type: "Avocats",
    city: "Pointe-Noire",
    tel: "05 523 69 49"
  },
  {
    name: "IDO POATY Hugues",
    type: "ASSISTANCE JURIDIQUE, COMPTABLE ET FISCALE",
    sub_type: "Notaires",
    city: "Pointe-Noire",
    tel: "05 534 11 92 / 06 631 14 17"
  },
  {
    name: "KADINA Jean Pétril",
    type: "ASSISTANCE JURIDIQUE, COMPTABLE ET FISCALE",
    sub_type: "Huissiers",
    city: "Pointe-Noire",
    tel: "06 674 27 72"
  },
  {
    name: "KALINA MENGA Lionel",
    type: "ASSISTANCE JURIDIQUE, COMPTABLE ET FISCALE",
    sub_type: "Avocats",
    city: "Pointe-Noire",
    tel: "05 543 72 94 / 06 857 74 74"
  },
  {
    name: "KEYA NSANGA Emile",
    type: "ASSISTANCE JURIDIQUE, COMPTABLE ET FISCALE",
    sub_type: "Huissiers",
    city: "Pointe-Noire",
    tel: "05 522 06 69"
  },
  {
    name: "KIBAKANA Alphonse",
    type: "ASSISTANCE JURIDIQUE, COMPTABLE ET FISCALE",
    sub_type: "Huissiers",
    city: "Pointe-Noire",
    tel: "06 666 74 62"
  },
  {
    name: "KIDZE Simone",
    type: "ASSISTANCE JURIDIQUE, COMPTABLE ET FISCALE",
    sub_type: "Huissiers",
    city: "Pointe-Noire",
    tel: "05 553 08 34"
  },
  {
    name: "KIMBI Pierre",
    type: "ASSISTANCE JURIDIQUE, COMPTABLE ET FISCALE",
    sub_type: "Huissiers",
    city: "Pointe-Noire",
    tel: "06 663 60 44 / 05 551 96 44"
  },
  {
    name: "KOUBAKA Audy",
    type: "ASSISTANCE JURIDIQUE, COMPTABLE ET FISCALE",
    sub_type: "Huissiers",
    city: "Pointe-Noire",
    tel: "05 570 17 10"
  },
  {
    name: "KOUTOU Brislaine",
    type: "ASSISTANCE JURIDIQUE, COMPTABLE ET FISCALE",
    sub_type: "Notaires",
    city: "Pointe-Noire",
    tel: "06 657 45 55"
  },
  {
    name: "LABARRE Jean Louis",
    type: "ASSISTANCE JURIDIQUE, COMPTABLE ET FISCALE",
    sub_type: "Avocats",
    city: "Pointe-Noire",
    tel: "06 989 77 33 / 05 553 55 60"
  },
  {
    name: "LANDZE MBERE Rock Dieudonné",
    type: "ASSISTANCE JURIDIQUE, COMPTABLE ET FISCALE",
    sub_type: "Huissiers",
    city: "Pointe-Noire",
    tel: "06 662 89 55 / 05 540 55 66"
  },
  {
    name: "LAVIE MIENANDY Aimé Joseph",
    type: "ASSISTANCE JURIDIQUE, COMPTABLE ET FISCALE",
    sub_type: "Avocats",
    city: "Pointe-Noire",
    tel: "06 664 24 78 / 05 761 27 97"
  },
  {
    name: "LIKIBI Jean",
    type: "ASSISTANCE JURIDIQUE, COMPTABLE ET FISCALE",
    sub_type: "Avocats",
    city: "Pointe-Noire",
    tel: "05 553 13 39 / 06 940 20 09"
  },
  {
    name: "LINVANI Parfait Euloge",
    type: "ASSISTANCE JURIDIQUE, COMPTABLE ET FISCALE",
    sub_type: "Avocats",
    city: "Pointe-Noire",
    tel: "05 549 24 07"
  },
  {
    name: "LOEMBA Chantal Paule",
    type: "ASSISTANCE JURIDIQUE, COMPTABLE ET FISCALE",
    sub_type: "Avocats",
    city: "Pointe-Noire",
    tel: "06 667 07 96 / 05 748 99 62"
  },
  {
    name: "LOEMBET SAMBOU Berthe Candelle",
    type: "ASSISTANCE JURIDIQUE, COMPTABLE ET FISCALE",
    sub_type: "Notaires",
    city: "Pointe-Noire",
    tel: "06 674 88 00"
  },
  {
    name: "LOUBOTA François",
    type: "ASSISTANCE JURIDIQUE, COMPTABLE ET FISCALE",
    sub_type: "Notaires",
    city: "Pointe-Noire",
    tel: "05 553 12 95 / 06 653 12 95"
  },
  {
    name: "LOUZINGOU BAVOURINSI Saint Auttrey",
    type: "ASSISTANCE JURIDIQUE, COMPTABLE ET FISCALE",
    sub_type: "Huissiers",
    city: "Pointe-Noire",
    tel: "06 672 32 72 / 05 553 00 90"
  },
  {
    name: "M3B AUDIT & CONSEIL",
    type: "ASSISTANCE JURIDIQUE, COMPTABLE ET FISCALE",
    sub_type: "Audit et expertise comptable",
    city: "Pointe-Noire",
    tel: "06 679 91 53"
  },
  {
    name: "MABIALA Pierre",
    type: "ASSISTANCE JURIDIQUE, COMPTABLE ET FISCALE",
    sub_type: "Avocats",
    city: "Pointe-Noire",
    tel: "05 553 11 26"
  },
  {
    name: "MADASSOU Brtrand Rodolphe",
    type: "ASSISTANCE JURIDIQUE, COMPTABLE ET FISCALE",
    sub_type: "Huissiers",
    city: "Pointe-Noire",
    tel: "05 553 67 87 / 06 652 61 57"
  },
  {
    name: "MAKANDA Patrick",
    type: "ASSISTANCE JURIDIQUE, COMPTABLE ET FISCALE",
    sub_type: "Huissiers",
    city: "Pointe-Noire",
    tel: "06 674 68 14"
  },
  {
    name: "MAKAYA BALHOU Hugues Anicet",
    type: "ASSISTANCE JURIDIQUE, COMPTABLE ET FISCALE",
    sub_type: "Notaires",
    city: "Pointe-Noire",
    tel: "05 557 44 10 / 06 653 40 35"
  },
  {
    name: "MAKELA Claude Bernard",
    type: "ASSISTANCE JURIDIQUE, COMPTABLE ET FISCALE",
    sub_type: "Huissiers",
    city: "Pointe-Noire",
    tel: "06 661 77 23 / 05 584 63 22"
  },
  {
    name: "MAKOSSO Fernand",
    type: "ASSISTANCE JURIDIQUE, COMPTABLE ET FISCALE",
    sub_type: "Huissiers",
    city: "Pointe-Noire",
    tel: "05 553 10 25"
  },
  {
    name: "MASSELO Maurice",
    type: "ASSISTANCE JURIDIQUE, COMPTABLE ET FISCALE",
    sub_type: "Notaires",
    city: "Pointe-Noire",
    tel: "06 667 00 66 / 06 672 69 72"
  },
  {
    name: "MAYENGUE Thomas Fortuné",
    type: "ASSISTANCE JURIDIQUE, COMPTABLE ET FISCALE",
    sub_type: "Huissiers",
    city: "Pointe-Noire",
    tel: "05 553 05 99 / 06 669 57 24"
  },
  {
    name: "MBEMBA Christel",
    type: "ASSISTANCE JURIDIQUE, COMPTABLE ET FISCALE",
    sub_type: "Huissiers",
    city: "Pointe-Noire",
    tel: "06 671 99 81 / 05 590 24 58"
  },
  {
    name: "MBEMBA LOZY Marie Paule",
    type: "ASSISTANCE JURIDIQUE, COMPTABLE ET FISCALE",
    sub_type: "Avocats",
    city: "Pointe-Noire",
    tel: "06 664 21 87 / 04 432 09 05"
  },
  {
    name: "MBOUNGOU Servais Patrick",
    type: "ASSISTANCE JURIDIQUE, COMPTABLE ET FISCALE",
    sub_type: "Huissiers",
    city: "Pointe-Noire",
    tel: "06 666 66 83 / 05 587 03 14"
  },
  {
    name: "MENDES-TCHIBA José",
    type: "ASSISTANCE JURIDIQUE, COMPTABLE ET FISCALE",
    sub_type: "Avocats",
    city: "Pointe-Noire",
    tel: "06 653 82 08"
  },
  {
    name: "MFOUMBI Hervé Blanchard",
    type: "ASSISTANCE JURIDIQUE, COMPTABLE ET FISCALE",
    sub_type: "Huissiers",
    city: "Pointe-Noire",
    tel: "05 551 96 44 / 06 663 60 44"
  },
  {
    name: "MIKOUNNGUILT Eugénie",
    type: "ASSISTANCE JURIDIQUE, COMPTABLE ET FISCALE",
    sub_type: "Huissiers",
    city: "Pointe-Noire",
    tel: "05 557 08 59"
  },
  {
    name: "MISSAMOU Guy Maixent",
    type: "ASSISTANCE JURIDIQUE, COMPTABLE ET FISCALE",
    sub_type: "Avocats",
    city: "Pointe-Noire",
    tel: "05 534 69 55"
  },
  {
    name: "MITOLO Joachim",
    type: "ASSISTANCE JURIDIQUE, COMPTABLE ET FISCALE",
    sub_type: "Huissiers",
    city: "Pointe-Noire",
    tel: "05 557 45 12"
  },
  {
    name: "MLOR GROUPE",
    type: "ASSISTANCE JURIDIQUE, COMPTABLE ET FISCALE",
    sub_type: "Audit et expertise comptable",
    city: "Pointe-Noire",
    tel: "05 714 31 74"
  },
  {
    name: "MOSSA Gaston",
    type: "ASSISTANCE JURIDIQUE, COMPTABLE ET FISCALE",
    sub_type: "Avocats",
    city: "Pointe-Noire",
    tel: "06 664 23 53"
  },
  {
    name: "MOUBEMBE Justin Joseph",
    type: "ASSISTANCE JURIDIQUE, COMPTABLE ET FISCALE",
    sub_type: "Avocats",
    city: "Pointe-Noire",
    tel: "06 664 84 37"
  },
  {
    name: "MOUDILA Hermine Carole",
    type: "ASSISTANCE JURIDIQUE, COMPTABLE ET FISCALE",
    sub_type: "Huissiers",
    city: "Pointe-Noire",
    tel: "05 557 32 63"
  },
  {
    name: "MOUKALA PEPE Jacques",
    type: "ASSISTANCE JURIDIQUE, COMPTABLE ET FISCALE",
    sub_type: "Huissiers",
    city: "Pointe-Noire",
    tel: "05 559 98 49"
  },
  {
    name: "MOUNTOU Noël",
    type: "ASSISTANCE JURIDIQUE, COMPTABLE ET FISCALE",
    sub_type: "Notaires",
    city: "Pointe-Noire",
    tel: "06 660 81 10"
  },
  {
    name: "MOUSSASSI KOUMBA Favien",
    type: "ASSISTANCE JURIDIQUE, COMPTABLE ET FISCALE",
    sub_type: "Huissiers",
    city: "Pointe-Noire",
    tel: "05 557 09 71"
  },
  {
    name: "MOUWENGUET Gilbert",
    type: "ASSISTANCE JURIDIQUE, COMPTABLE ET FISCALE",
    sub_type: "Huissiers",
    city: "Pointe-Noire",
    tel: "05 553 03 74"
  },
  {
    name: "MOUYECKET NGANA Sylvie Nicole",
    type: "ASSISTANCE JURIDIQUE, COMPTABLE ET FISCALE",
    sub_type: "Avocats",
    city: "Pointe-Noire",
    tel: "05 553 47 47 / 06 664 34 06"
  },
  {
    name: "MPENA Guy",
    type: "ASSISTANCE JURIDIQUE, COMPTABLE ET FISCALE",
    sub_type: "Huissiers",
    city: "Pointe-Noire",
    tel: "06 664 49 55 / 05 575 16 63"
  },
  {
    name: "MPOUKOU Jean Bruno",
    type: "ASSISTANCE JURIDIQUE, COMPTABLE ET FISCALE",
    sub_type: "Huissiers",
    city: "Pointe-Noire",
    tel: "05 557 13 50"
  },
  {
    name: "MVOUAMA KIYINDOU Blandine",
    type: "ASSISTANCE JURIDIQUE, COMPTABLE ET FISCALE",
    sub_type: "Huissiers",
    city: "Pointe-Noire",
    tel: "06 643 15 72"
  },
  {
    name: "MVOUMBI Didier Christophe",
    type: "ASSISTANCE JURIDIQUE, COMPTABLE ET FISCALE",
    sub_type: "Avocats",
    city: "Pointe-Noire",
    tel: "05 533 38 68"
  },
  {
    name: "M’FOUTOU Célestin",
    type: "ASSISTANCE JURIDIQUE, COMPTABLE ET FISCALE",
    sub_type: "Avocats",
    city: "Pointe-Noire",
    tel: "05 521 46 03 / 06 621 46 03"
  },
  {
    name: "NGANGA KOLYARDO Eulalie",
    type: "ASSISTANCE JURIDIQUE, COMPTABLE ET FISCALE",
    sub_type: "Avocats",
    city: "Pointe-Noire",
    tel: "05 553 39 51 / 06 679 23 17"
  },
  {
    name: "NGAVOUKA Marcel",
    type: "ASSISTANCE JURIDIQUE, COMPTABLE ET FISCALE",
    sub_type: "Notaires",
    city: "Pointe-Noire",
    tel: "06 664 12 94 / 04 440 22 84"
  },
  {
    name: "NGOMBI Laurent",
    type: "ASSISTANCE JURIDIQUE, COMPTABLE ET FISCALE",
    sub_type: "Avocats",
    city: "Pointe-Noire",
    tel: "06 667 98 19 / 05 520 17 81"
  },
  {
    name: "NGOUALA Jean Serge",
    type: "ASSISTANCE JURIDIQUE, COMPTABLE ET FISCALE",
    sub_type: "Avocats",
    city: "Pointe-Noire",
    tel: "06 661 89 93"
  },
  {
    name: "NGOUNDA Augustin",
    type: "ASSISTANCE JURIDIQUE, COMPTABLE ET FISCALE",
    sub_type: "Avocats",
    city: "Pointe-Noire",
    tel: "05 553 55 87 / 06 827 12 40"
  },
  {
    name: "NIATI TSATY Serge",
    type: "ASSISTANCE JURIDIQUE, COMPTABLE ET FISCALE",
    sub_type: "Notaires",
    city: "Pointe-Noire",
    tel: "05 553 79 24"
  },
  {
    name: "NIMI Jean",
    type: "ASSISTANCE JURIDIQUE, COMPTABLE ET FISCALE",
    sub_type: "Huissiers",
    city: "Pointe-Noire",
    tel: "05 514 90 60"
  },
  {
    name: "NIOUTOU Nicolas",
    type: "ASSISTANCE JURIDIQUE, COMPTABLE ET FISCALE",
    sub_type: "Avocats",
    city: "Pointe-Noire",
    tel: "05 553 68 12"
  },
  {
    name: "NZALAKANDA Fulbert",
    type: "ASSISTANCE JURIDIQUE, COMPTABLE ET FISCALE",
    sub_type: "Avocats",
    city: "Pointe-Noire",
    tel: "05 553 92 11"
  },
  {
    name: "NZAOU Didier Crescent",
    type: "ASSISTANCE JURIDIQUE, COMPTABLE ET FISCALE",
    sub_type: "Avocats",
    city: "Pointe-Noire",
    tel: "05 529 17 97 / 06 678 37 43"
  },
  {
    name: "OKO Roger",
    type: "ASSISTANCE JURIDIQUE, COMPTABLE ET FISCALE",
    sub_type: "Avocats",
    city: "Pointe-Noire",
    tel: "05 521 52 56"
  },
  {
    name: "ONGOUNDOU Armand",
    type: "ASSISTANCE JURIDIQUE, COMPTABLE ET FISCALE",
    sub_type: "Avocats",
    city: "Pointe-Noire",
    tel: "05 553 30 75 / 06 971 00 81"
  },
  {
    name: "OTIELI EUSTACHE Marius Iliche",
    type: "ASSISTANCE JURIDIQUE, COMPTABLE ET FISCALE",
    sub_type: "Huissiers",
    city: "Pointe-Noire",
    tel: "05 564 63 09 / 06 650 19 20"
  },
  {
    name: "PAKA Claude Joël",
    type: "ASSISTANCE JURIDIQUE, COMPTABLE ET FISCALE",
    sub_type: "Avocats",
    city: "Pointe-Noire",
    tel: "05 557 71 38 / 06 664 56 46"
  },
  {
    name: "PAMBO Guy Leonard",
    type: "ASSISTANCE JURIDIQUE, COMPTABLE ET FISCALE",
    sub_type: "Avocats",
    city: "Pointe-Noire",
    tel: "05 531 38 81"
  },
  {
    name: "PENA PITRA Gilles",
    type: "ASSISTANCE JURIDIQUE, COMPTABLE ET FISCALE",
    sub_type: "Avocats",
    city: "Pointe-Noire",
    tel: "05 553 19 99"
  },
  {
    name: "POPA OSSEBI",
    type: "ASSISTANCE JURIDIQUE, COMPTABLE ET FISCALE",
    sub_type: "Huissiers",
    city: "Pointe-Noire",
    tel: "06 667 20 16"
  },
  {
    name: "PRICEWATERHOUSECOOPERS (PWC)",
    type: "ASSISTANCE JURIDIQUE, COMPTABLE ET FISCALE",
    sub_type: "Audit et expertise comptable",
    city: "Pointe-Noire",
    tel: "05 534 09 07"
  },
  {
    name: "REFERENCE CONSULTING (RECO)",
    type: "ASSISTANCE JURIDIQUE, COMPTABLE ET FISCALE",
    sub_type: "Conseil juridique et fiscal",
    city: "Pointe-Noire",
    tel: "06 899 82 72"
  },
  {
    name: "SAFOU Bienvenue Jean Rodrigue",
    type: "ASSISTANCE JURIDIQUE, COMPTABLE ET FISCALE",
    sub_type: "Huissiers",
    city: "Pointe-Noire",
    tel: "06 624 18 98 / 05 553 01 20"
  },
  {
    name: "SATH COMPACT Judicaël",
    type: "ASSISTANCE JURIDIQUE, COMPTABLE ET FISCALE",
    sub_type: "Huissiers",
    city: "Pointe-Noire",
    tel: "05 569 43 77"
  },
  {
    name: "SENGA Magloire",
    type: "ASSISTANCE JURIDIQUE, COMPTABLE ET FISCALE",
    sub_type: "Avocats",
    city: "Pointe-Noire",
    tel: "06 974 58 81 / 05 559 74 62"
  },
  {
    name: "SUTTER & PEARCE",
    type: "ASSISTANCE JURIDIQUE, COMPTABLE ET FISCALE",
    sub_type: "Conseil juridique et fiscal",
    city: "Pointe-Noire",
    tel: "06 655 43 43"
  },
  {
    name: "TADI Isabelle Honorine",
    type: "ASSISTANCE JURIDIQUE, COMPTABLE ET FISCALE",
    sub_type: "Huissiers",
    city: "Pointe-Noire",
    tel: "05 557 75 76"
  },
  {
    name: "TCHCAMBOUD Simon-Yves",
    type: "ASSISTANCE JURIDIQUE, COMPTABLE ET FISCALE",
    sub_type: "Avocats",
    city: "Pointe-Noire",
    tel: "05 557 26 42"
  },
  {
    name: "TCHICAYA Anicet Placide",
    type: "ASSISTANCE JURIDIQUE, COMPTABLE ET FISCALE",
    sub_type: "Huissiers",
    city: "Pointe-Noire",
    tel: "05 506 75 06 / 06 674 70 91"
  },
  {
    name: "TCHICAYA NOMBO Rock",
    type: "ASSISTANCE JURIDIQUE, COMPTABLE ET FISCALE",
    sub_type: "Huissiers",
    city: "Pointe-Noire",
    tel: "06 631 68 24"
  },
  {
    name: "TCHISSAMBOU Jean Serge",
    type: "ASSISTANCE JURIDIQUE, COMPTABLE ET FISCALE",
    sub_type: "Avocats",
    city: "Pointe-Noire",
    tel: "06 666 66 52"
  },
  {
    name: "TSALA Michel",
    type: "ASSISTANCE JURIDIQUE, COMPTABLE ET FISCALE",
    sub_type: "Avocats",
    city: "Pointe-Noire",
    tel: "06 659 18 15 / 05 557 90 17"
  },
  {
    name: "TSAMBA Alain Ludovic",
    type: "ASSISTANCE JURIDIQUE, COMPTABLE ET FISCALE",
    sub_type: "Avocats",
    city: "Pointe-Noire",
    tel: "05 521 37 12 / 06 669 86 70"
  },
  {
    name: "TSATY BOUNGOU Destin Arsène",
    type: "ASSISTANCE JURIDIQUE, COMPTABLE ET FISCALE",
    sub_type: "Avocats",
    city: "Pointe-Noire",
    tel: "05 528 13 16 / 05 563 82 75"
  },
  {
    name: "WALEMBO Magloire Hervé",
    type: "ASSISTANCE JURIDIQUE, COMPTABLE ET FISCALE",
    sub_type: "Huissiers",
    city: "Pointe-Noire",
    tel: "06 666 76 40 / 05 517 59 25"
  },
  {
    name: "ZOLA MABONZO André Placide",
    type: "ASSISTANCE JURIDIQUE, COMPTABLE ET FISCALE",
    sub_type: "Avocats",
    city: "Pointe-Noire",
    tel: "05 553 32 84"
  },
  {
    name: "NGOMA Hilaire",
    type: "ASSISTANCE JURIDIQUE, COMPTABLE ET FISCALE",
    sub_type: "Avocats",
    city: "Nkayi",
    tel: "05 539 97 05"
  },
  {
    name: "NZOULOU Germain",
    type: "ASSISTANCE JURIDIQUE, COMPTABLE ET FISCALE",
    sub_type: "Avocats",
    city: "Dolisie",
    tel: "06 947 85 32"
  }
];

    const itemsCountResult = await db.query("SELECT COUNT(*) as count FROM portfolio_items WHERE category_id = $1", [catId]);
    const currentCount = parseInt(itemsCountResult.rows[0].count);

    if (currentCount !== items.length) {
      console.log(`Seeding ASSISTANCE JURIDIQUE, COMPTABLE ET FISCALE (${items.length} items)...`);
      await db.query("DELETE FROM portfolio_items WHERE category_id = $1", [catId]);
    } else {
      return;
    }

    for (const item of items) {
      await db.query(
        `INSERT INTO portfolio_items 
        (category_id, name, sub_type, city, tel) 
        VALUES ($1, $2, $3, $4, $5)`,
        [catId, item.name, item.sub_type, item.city, item.tel]
      );
    }
    console.log(`Seeded ${items.length} portfolio items for ASSISTANCE JURIDIQUE, COMPTABLE ET FISCALE`);
  } catch (err) {
    console.error("Failed to seed assistance items:", err);
  }
}

async function seedAssurancesItems() {
  try {
    const catResult = await db.query("SELECT id FROM categories WHERE name = 'ASSURANCES'");
    if (catResult.rows.length === 0) return;
    const catId = catResult.rows[0].id;

    const itemsCountResult = await db.query("SELECT COUNT(*) as count FROM portfolio_items WHERE category_id = $1", [catId]);
    if (parseInt(itemsCountResult.rows[0].count) > 0) return;

    console.log("Seeding portfolio items for ASSURANCES...");

    const items = [
      { name: "AGC (Assurances Générales du Congo)", sub_type: "Assurances", city: "BRAZZAVILLE", tel: "06 666 00 11" },
      { name: "ARC (Assurances et Réassurances du Congo)", sub_type: "Assurances", city: "BRAZZAVILLE", tel: "06 666 00 22" },
      { name: "NSIA ASSURANCES", sub_type: "Assurances", city: "BRAZZAVILLE", tel: "06 666 00 33" },
      { name: "SAHAM ASSURANCES", sub_type: "Assurances", city: "BRAZZAVILLE", tel: "06 666 00 44" }
    ];

    for (const item of items) {
      await db.query(
        `INSERT INTO portfolio_items 
        (category_id, name, sub_type, city, tel) 
        VALUES ($1, $2, $3, $4, $5)`,
        [catId, item.name, item.sub_type, item.city, item.tel]
      );
    }
    console.log(`Seeded ${items.length} portfolio items for ASSURANCES`);
  } catch (err) {
    console.error("Failed to seed assurances items:", err);
  }
}

async function seedAutomobilesItems() {
  try {
    const catResult = await db.query("SELECT id FROM categories WHERE name = 'AUTOMOBILES'");
    if (catResult.rows.length === 0) return;
    const catId = catResult.rows[0].id;

    const itemsCountResult = await db.query("SELECT COUNT(*) as count FROM portfolio_items WHERE category_id = $1", [catId]);
    if (parseInt(itemsCountResult.rows[0].count) > 0) return;

    console.log("Seeding portfolio items for AUTOMOBILES...");

    const items = [
      { name: "CFAO MOTORS", sub_type: "Vente et entretien", city: "BRAZZAVILLE", tel: "06 666 00 55" },
      { name: "TRACTAFRIC MOTORS", sub_type: "Vente et entretien", city: "BRAZZAVILLE", tel: "06 666 00 66" },
      { name: "SOCADA", sub_type: "Vente et entretien", city: "BRAZZAVILLE", tel: "06 666 00 77" }
    ];

    for (const item of items) {
      await db.query(
        `INSERT INTO portfolio_items 
        (category_id, name, sub_type, city, tel) 
        VALUES ($1, $2, $3, $4, $5)`,
        [catId, item.name, item.sub_type, item.city, item.tel]
      );
    }
    console.log(`Seeded ${items.length} portfolio items for AUTOMOBILES`);
  } catch (err) {
    console.error("Failed to seed automobiles items:", err);
  }
}

async function seedBanquesItems() {
  try {
    const catResult = await db.query("SELECT id FROM categories WHERE name = 'BANQUES ET MICROFINANCES'");
    if (catResult.rows.length === 0) return;
    const catId = catResult.rows[0].id;

    const itemsCountResult = await db.query("SELECT COUNT(*) as count FROM portfolio_items WHERE category_id = $1", [catId]);
    if (parseInt(itemsCountResult.rows[0].count) > 0) return;

    console.log("Seeding portfolio items for BANQUES ET MICROFINANCES...");

    const items = [
      { name: "B.C.I (Banque Commerciale Internationale)", sub_type: "Banque", city: "BRAZZAVILLE", tel: "05 551 00 00" },
      { name: "B.G.F.I BANK", sub_type: "Banque", city: "BRAZZAVILLE", tel: "05 552 00 00" },
      { name: "B.S.C.A BANK", sub_type: "Banque", city: "BRAZZAVILLE", tel: "05 553 00 00" },
      { name: "BANQUE POSTALE DU CONGO", sub_type: "Banque", city: "BRAZZAVILLE", tel: "05 554 00 00" },
      { name: "CHARDEL", sub_type: "Microfinance", city: "BRAZZAVILLE", tel: "05 555 00 00" },
      { name: "COFINA", sub_type: "Microfinance", city: "BRAZZAVILLE", tel: "05 556 00 00" },
      { name: "CREDIT DU CONGO", sub_type: "Banque", city: "BRAZZAVILLE", tel: "05 557 00 00" },
      { name: "ECOBANK", sub_type: "Banque", city: "BRAZZAVILLE", tel: "05 558 00 00" },
      { name: "LCB BANK", sub_type: "Banque", city: "BRAZZAVILLE", tel: "05 559 00 00" },
      { name: "MUCODEC", sub_type: "Microfinance", city: "BRAZZAVILLE", tel: "05 560 00 00" },
      { name: "SOCIÉTÉ GÉNÉRALE CONGO", sub_type: "Banque", city: "BRAZZAVILLE", tel: "05 561 00 00" },
      { name: "U.B.A (United Bank for Africa)", sub_type: "Banque", city: "BRAZZAVILLE", tel: "05 562 00 00" }
    ];

    for (const item of items) {
      await db.query(
        `INSERT INTO portfolio_items 
        (category_id, name, sub_type, city, tel) 
        VALUES ($1, $2, $3, $4, $5)`,
        [catId, item.name, item.sub_type, item.city, item.tel]
      );
    }
    console.log(`Seeded ${items.length} portfolio items for BANQUES ET MICROFINANCES`);
  } catch (err) {
    console.error("Failed to seed banques items:", err);
  }
}

async function seedBtpItems() {
  try {
    const catResult = await db.query("SELECT id FROM categories WHERE name = 'BÂTIMENTS ET TRAVAUX PUBLICS (BTP)'");
    if (catResult.rows.length === 0) return;
    const catId = catResult.rows[0].id;

    const itemsCountResult = await db.query("SELECT COUNT(*) as count FROM portfolio_items WHERE category_id = $1", [catId]);
    if (parseInt(itemsCountResult.rows[0].count) > 0) return;

    console.log("Seeding portfolio items for BÂTIMENTS ET TRAVAUX PUBLICS (BTP)...");

    const items = [
      { name: "ANDRÉ BTP", sub_type: "BTP", city: "BRAZZAVILLE", tel: "06 666 00 00" },
      { name: "BERNABÉ CONGO", sub_type: "Matériaux", city: "BRAZZAVILLE", tel: "06 666 11 11" },
      { name: "BUROTOP IRIS", sub_type: "BTP", city: "BRAZZAVILLE", tel: "06 666 22 22" },
      { name: "CHALCO", sub_type: "BTP", city: "BRAZZAVILLE", tel: "06 666 33 33" },
      { name: "CRBC", sub_type: "BTP", city: "BRAZZAVILLE", tel: "06 666 44 44" },
      { name: "FORACO", sub_type: "BTP", city: "BRAZZAVILLE", tel: "06 666 55 55" },
      { name: "GETESA", sub_type: "BTP", city: "BRAZZAVILLE", tel: "06 666 66 66" },
      { name: "RAZEL-BEC", sub_type: "BTP", city: "BRAZZAVILLE", tel: "06 666 77 77" },
      { name: "SGE-C CONGO", sub_type: "BTP", city: "BRAZZAVILLE", tel: "06 666 88 88" },
      { name: "SOGECCO", sub_type: "BTP", city: "BRAZZAVILLE", tel: "06 666 99 99" }
    ];

    for (const item of items) {
      await db.query(
        `INSERT INTO portfolio_items 
        (category_id, name, sub_type, city, tel) 
        VALUES ($1, $2, $3, $4, $5)`,
        [catId, item.name, item.sub_type, item.city, item.tel]
      );
    }
    console.log(`Seeded ${items.length} portfolio items for BÂTIMENTS ET TRAVAUX PUBLICS (BTP)`);
  } catch (err) {
    console.error("Failed to seed btp items:", err);
  }
}

async function seedBureautiqueInformatiqueItems() {
  try {
    const catResult = await db.query("SELECT id FROM categories WHERE name = 'BUREAUTIQUE ET INFORMATIQUE'");
    if (catResult.rows.length === 0) return;
    const catId = catResult.rows[0].id;

    const itemsCountResult = await db.query("SELECT COUNT(*) as count FROM portfolio_items WHERE category_id = $1", [catId]);
    if (parseInt(itemsCountResult.rows[0].count) > 0) return;

    console.log("Seeding portfolio items for BUREAUTIQUE ET INFORMATIQUE...");

    const items = [
      { name: "BUROTOP IRIS", sub_type: "Informatique", city: "BRAZZAVILLE", tel: "05 555 11 11" },
      { name: "CANAL CONGO", sub_type: "Informatique", city: "BRAZZAVILLE", tel: "05 555 22 22" },
      { name: "CFAO TECHNOLOGIES", sub_type: "Informatique", city: "BRAZZAVILLE", tel: "05 555 33 33" },
      { name: "GLO-MOBILE", sub_type: "Informatique", city: "BRAZZAVILLE", tel: "05 555 44 44" },
      { name: "OFIS", sub_type: "Informatique", city: "BRAZZAVILLE", tel: "05 555 55 55" }
    ];

    for (const item of items) {
      await db.query(
        `INSERT INTO portfolio_items 
        (category_id, name, sub_type, city, tel) 
        VALUES ($1, $2, $3, $4, $5)`,
        [catId, item.name, item.sub_type, item.city, item.tel]
      );
    }
    console.log(`Seeded ${items.length} portfolio items for BUREAUTIQUE ET INFORMATIQUE`);
  } catch (err) {
    console.error("Failed to seed bureautique items:", err);
  }
}

async function seedCommunicationPresseMediasItems() {
  try {
    const catResult = await db.query("SELECT id FROM categories WHERE name = 'COMMUNICATION, PRESSE ET MÉDIAS'");
    if (catResult.rows.length === 0) return;
    const catId = catResult.rows[0].id;

    const itemsCountResult = await db.query("SELECT COUNT(*) as count FROM portfolio_items WHERE category_id = $1", [catId]);
    if (parseInt(itemsCountResult.rows[0].count) > 0) return;

    console.log("Seeding portfolio items for COMMUNICATION, PRESSE ET MÉDIAS...");

    const items = [
      { name: "ADIAC (Agence d'Information d'Afrique Centrale)", sub_type: "Presse", city: "BRAZZAVILLE", tel: "06 666 00 00" },
      { name: "CANAL+ CONGO", sub_type: "Média", city: "BRAZZAVILLE", tel: "06 666 11 11" },
      { name: "DRTV (Digital Radio Télévision)", sub_type: "Média", city: "BRAZZAVILLE", tel: "06 666 22 22" },
      { name: "LES DÉPÊCHES DE BRAZZAVILLE", sub_type: "Presse", city: "BRAZZAVILLE", tel: "06 666 33 33" },
      { name: "MNTV", sub_type: "Média", city: "BRAZZAVILLE", tel: "06 666 44 44" },
      { name: "TELE CONGO", sub_type: "Média", city: "BRAZZAVILLE", tel: "06 666 55 55" },
      { name: "VOX TV", sub_type: "Média", city: "BRAZZAVILLE", tel: "06 666 66 66" }
    ];

    for (const item of items) {
      await db.query(
        `INSERT INTO portfolio_items 
        (category_id, name, sub_type, city, tel) 
        VALUES ($1, $2, $3, $4, $5)`,
        [catId, item.name, item.sub_type, item.city, item.tel]
      );
    }
    console.log(`Seeded ${items.length} portfolio items for COMMUNICATION, PRESSE ET MÉDIAS`);
  } catch (err) {
    console.error("Failed to seed communication items:", err);
  }
}

async function seedConseilsServicesItems() {
  try {
    const catResult = await db.query("SELECT id FROM categories WHERE name = 'CONSEILS ET SERVICES'");
    if (catResult.rows.length === 0) return;
    const catId = catResult.rows[0].id;

    const itemsCountResult = await db.query("SELECT COUNT(*) as count FROM portfolio_items WHERE category_id = $1", [catId]);
    if (parseInt(itemsCountResult.rows[0].count) > 0) return;

    console.log("Seeding portfolio items for CONSEILS ET SERVICES...");

    const items = [
      { name: "APAVE CONGO", sub_type: "Conseil", city: "POINTE-NOIRE", tel: "06 666 77 77" },
      { name: "BUREAU VERITAS", sub_type: "Conseil", city: "POINTE-NOIRE", tel: "06 666 88 88" },
      { name: "SGS CONGO", sub_type: "Conseil", city: "POINTE-NOIRE", tel: "06 666 99 99" }
    ];

    for (const item of items) {
      await db.query(
        `INSERT INTO portfolio_items 
        (category_id, name, sub_type, city, tel) 
        VALUES ($1, $2, $3, $4, $5)`,
        [catId, item.name, item.sub_type, item.city, item.tel]
      );
    }
    console.log(`Seeded ${items.length} portfolio items for CONSEILS ET SERVICES`);
  } catch (err) {
    console.error("Failed to seed conseils items:", err);
  }
}

async function seedCultureLoisirsItems() {
  try {
    const catResult = await db.query("SELECT id FROM categories WHERE name = 'CULTURE ET LOISIRS'");
    if (catResult.rows.length === 0) return;
    const catId = catResult.rows[0].id;

    const itemsCountResult = await db.query("SELECT COUNT(*) as count FROM portfolio_items WHERE category_id = $1", [catId]);
    if (parseInt(itemsCountResult.rows[0].count) > 0) return;

    console.log("Seeding portfolio items for CULTURE ET LOISIRS...");

    const items = [
      { name: "CENTRE CULTUREL FRANÇAIS (IFC)", sub_type: "Culture", city: "BRAZZAVILLE", tel: "06 666 00 11" },
      { name: "CENTRE CULTUREL RUSSE", sub_type: "Culture", city: "BRAZZAVILLE", tel: "06 666 00 22" },
      { name: "MEMORIAL PIERRE SAVORGNAN DE BRAZZA", sub_type: "Culture", city: "BRAZZAVILLE", tel: "06 666 00 33" },
      { name: "MUSÉE NATIONAL DU CONGO", sub_type: "Culture", city: "BRAZZAVILLE", tel: "06 666 00 44" }
    ];

    for (const item of items) {
      await db.query(
        `INSERT INTO portfolio_items 
        (category_id, name, sub_type, city, tel) 
        VALUES ($1, $2, $3, $4, $5)`,
        [catId, item.name, item.sub_type, item.city, item.tel]
      );
    }
    console.log(`Seeded ${items.length} portfolio items for CULTURE ET LOISIRS`);
  } catch (err) {
    console.error("Failed to seed culture items:", err);
  }
}

async function seedHotelsItems() {
  try {
    const catResult = await db.query("SELECT id FROM categories WHERE name = 'HÔTELS'");
    if (catResult.rows.length === 0) return;
    const catId = catResult.rows[0].id;

    const itemsCountResult = await db.query("SELECT COUNT(*) as count FROM portfolio_items WHERE category_id = $1", [catId]);
    if (parseInt(itemsCountResult.rows[0].count) > 0) return;

    console.log("Seeding portfolio items for HÔTELS...");

    const items = [
      { name: "Radisson Blu M'Bamou Palace Hotel", sub_type: "Hôtel", city: "BRAZZAVILLE", tel: "05 050 00 00" },
      { name: "Ledger Plaza Maya Maya", sub_type: "Hôtel", city: "BRAZZAVILLE", tel: "05 051 00 00" },
      { name: "Mikhael's Hotel", sub_type: "Hôtel", city: "BRAZZAVILLE", tel: "05 052 00 00" },
      { name: "Olympic Palace Hotel", sub_type: "Hôtel", city: "BRAZZAVILLE", tel: "05 053 00 00" },
      { name: "Atlantic Palace Hotel", sub_type: "Hôtel", city: "POINTE-NOIRE", tel: "05 054 00 00" },
      { name: "Hotel Elais", sub_type: "Hôtel", city: "POINTE-NOIRE", tel: "05 055 00 00" },
      { name: "Palm Beach Hotel", sub_type: "Hôtel", city: "POINTE-NOIRE", tel: "05 056 00 00" }
    ];

    for (const item of items) {
      await db.query(
        `INSERT INTO portfolio_items 
        (category_id, name, sub_type, city, tel) 
        VALUES ($1, $2, $3, $4, $5)`,
        [catId, item.name, item.sub_type, item.city, item.tel]
      );
    }
    console.log(`Seeded ${items.length} portfolio items for HÔTELS`);
  } catch (err) {
    console.error("Failed to seed hotels items:", err);
  }
}

async function seedRestaurantsItems() {
  try {
    const catResult = await db.query("SELECT id FROM categories WHERE name = 'RESTAURANTS ET SORTIES'");
    if (catResult.rows.length === 0) return;
    const catId = catResult.rows[0].id;

    const itemsCountResult = await db.query("SELECT COUNT(*) as count FROM portfolio_items WHERE category_id = $1", [catId]);
    if (parseInt(itemsCountResult.rows[0].count) > 0) return;

    console.log("Seeding portfolio items for RESTAURANTS ET SORTIES...");

    const items = [
      { name: "Mami Wata", sub_type: "Restaurant", city: "BRAZZAVILLE", tel: "06 666 88 88" },
      { name: "L'Arbalète", sub_type: "Restaurant", city: "BRAZZAVILLE", tel: "06 666 99 99" },
      { name: "Le Jardin des Saveurs", sub_type: "Restaurant", city: "BRAZZAVILLE", tel: "06 666 77 77" },
      { name: "Le Derrick", sub_type: "Restaurant", city: "POINTE-NOIRE", tel: "06 666 55 55" },
      { name: "La Pyrogue", sub_type: "Restaurant", city: "POINTE-NOIRE", tel: "06 666 44 44" }
    ];

    for (const item of items) {
      await db.query(
        `INSERT INTO portfolio_items 
        (category_id, name, sub_type, city, tel) 
        VALUES ($1, $2, $3, $4, $5)`,
        [catId, item.name, item.sub_type, item.city, item.tel]
      );
    }
    console.log(`Seeded ${items.length} portfolio items for RESTAURANTS ET SORTIES`);
  } catch (err) {
    console.error("Failed to seed restaurants items:", err);
  }
}

async function seedSanteItems() {
  try {
    const catResult = await db.query("SELECT id FROM categories WHERE name = 'SANTÉ'");
    if (catResult.rows.length === 0) return;
    const catId = catResult.rows[0].id;

    const itemsCountResult = await db.query("SELECT COUNT(*) as count FROM portfolio_items WHERE category_id = $1", [catId]);
    if (parseInt(itemsCountResult.rows[0].count) > 0) return;

    console.log("Seeding portfolio items for SANTÉ...");

    const items = [
      { name: "CHU de Brazzaville", sub_type: "Hôpital", city: "BRAZZAVILLE", tel: "22 281 00 00" },
      { name: "Hôpital de Base de Makélékélé", sub_type: "Hôpital", city: "BRAZZAVILLE", tel: "22 281 11 11" },
      { name: "Hôpital Général Adolphe Sicé", sub_type: "Hôpital", city: "POINTE-NOIRE", tel: "22 294 00 00" },
      { name: "Clinique Netcare", sub_type: "Clinique", city: "BRAZZAVILLE", tel: "06 666 55 55" }
    ];

    for (const item of items) {
      await db.query(
        `INSERT INTO portfolio_items 
        (category_id, name, sub_type, city, tel) 
        VALUES ($1, $2, $3, $4, $5)`,
        [catId, item.name, item.sub_type, item.city, item.tel]
      );
    }
    console.log(`Seeded ${items.length} portfolio items for SANTÉ`);
  } catch (err) {
    console.error("Failed to seed sante items:", err);
  }
}

async function seedTelecommunicationsItems() {
  try {
    const catResult = await db.query("SELECT id FROM categories WHERE name = 'TÉLÉCOMMUNICATIONS'");
    if (catResult.rows.length === 0) return;
    const catId = catResult.rows[0].id;

    const itemsCountResult = await db.query("SELECT COUNT(*) as count FROM portfolio_items WHERE category_id = $1", [catId]);
    if (parseInt(itemsCountResult.rows[0].count) > 0) return;

    console.log("Seeding portfolio items for TÉLÉCOMMUNICATIONS...");

    const items = [
      { name: "MTN Congo", sub_type: "Opérateur", city: "BRAZZAVILLE", tel: "06 600 00 00" },
      { name: "Airtel Congo", sub_type: "Opérateur", city: "BRAZZAVILLE", tel: "05 500 00 00" },
      { name: "Congo Telecom", sub_type: "Opérateur", city: "BRAZZAVILLE", tel: "22 281 00 00" }
    ];

    for (const item of items) {
      await db.query(
        `INSERT INTO portfolio_items 
        (category_id, name, sub_type, city, tel) 
        VALUES ($1, $2, $3, $4, $5)`,
        [catId, item.name, item.sub_type, item.city, item.tel]
      );
    }
    console.log(`Seeded ${items.length} portfolio items for TÉLÉCOMMUNICATIONS`);
  } catch (err) {
    console.error("Failed to seed telecommunications items:", err);
  }
}

async function seedEnseignementItems() {
  try {
    const catResult = await db.query("SELECT id FROM categories WHERE name = 'ENSEIGNEMENT ET FORMATION'");
    if (catResult.rows.length === 0) return;
    const catId = catResult.rows[0].id;

    const itemsCountResult = await db.query("SELECT COUNT(*) as count FROM portfolio_items WHERE category_id = $1", [catId]);
    if (parseInt(itemsCountResult.rows[0].count) > 0) return;

    console.log("Seeding portfolio items for ENSEIGNEMENT ET FORMATION...");

    const items = [
      { name: "Université Marien Ngouabi", sub_type: "Université", city: "BRAZZAVILLE", tel: "22 281 00 00" },
      { name: "Ecole Africaine de Développement (EAD)", sub_type: "Ecole", city: "BRAZZAVILLE", tel: "06 666 11 11" },
      { name: "Institut Supérieur de Gestion (ISG)", sub_type: "Institut", city: "BRAZZAVILLE", tel: "06 666 22 22" }
    ];

    for (const item of items) {
      await db.query(
        `INSERT INTO portfolio_items 
        (category_id, name, sub_type, city, tel) 
        VALUES ($1, $2, $3, $4, $5)`,
        [catId, item.name, item.sub_type, item.city, item.tel]
      );
    }
    console.log(`Seeded ${items.length} portfolio items for ENSEIGNEMENT ET FORMATION`);
  } catch (err) {
    console.error("Failed to seed enseignement items:", err);
  }
}

async function seedTransportsItems() {
  try {
    const catResult = await db.query("SELECT id FROM categories WHERE name = 'TRANSPORTS AÉRIEN, MARITIME ET TERRESTRE'");
    if (catResult.rows.length === 0) return;
    const catId = catResult.rows[0].id;

    const itemsCountResult = await db.query("SELECT COUNT(*) as count FROM portfolio_items WHERE category_id = $1", [catId]);
    if (parseInt(itemsCountResult.rows[0].count) > 0) return;

    console.log("Seeding portfolio items for TRANSPORTS AÉRIEN, MARITIME ET TERRESTRE...");

    const items = [
      { name: "Air France", sub_type: "Aérien", city: "BRAZZAVILLE", tel: "06 666 00 00" },
      { name: "Royal Air Maroc", sub_type: "Aérien", city: "BRAZZAVILLE", tel: "06 666 11 11" },
      { name: "Ethiopian Airlines", sub_type: "Aérien", city: "BRAZZAVILLE", tel: "06 666 22 22" },
      { name: "TAC (Trans Air Congo)", sub_type: "Aérien", city: "POINTE-NOIRE", tel: "06 666 33 33" },
      { name: "Congo Airways", sub_type: "Aérien", city: "BRAZZAVILLE", tel: "06 666 44 44" },
      { name: "Bolloré Transport & Logistics", sub_type: "Logistique", city: "POINTE-NOIRE", tel: "06 666 55 55" },
      { name: "Port Autonome de Pointe-Noire (PAPN)", sub_type: "Maritime", city: "POINTE-NOIRE", tel: "22 294 00 00" }
    ];

    for (const item of items) {
      await db.query(
        `INSERT INTO portfolio_items 
        (category_id, name, sub_type, city, tel) 
        VALUES ($1, $2, $3, $4, $5)`,
        [catId, item.name, item.sub_type, item.city, item.tel]
      );
    }
    console.log(`Seeded ${items.length} portfolio items for TRANSPORTS AÉRIEN, MARITIME ET TERRESTRE`);
  } catch (err) {
    console.error("Failed to seed transports items:", err);
  }
}


startServer();
console.log("Server script execution reached the end.");
