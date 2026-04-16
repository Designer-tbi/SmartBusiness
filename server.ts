import express from "express";
// Note: createViteServer is imported dynamically below to avoid issues on Vercel
import path from "path";
import url from "url";
import { fileURLToPath } from "url";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import cookieParser from "cookie-parser";
import dotenv from "dotenv";
import multer from "multer";
import fs from "fs";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isPlaceholderUrl = (url: string | undefined) => !url || url === 'base' || url.startsWith('postgresql://base') || url.includes('://base/');

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

    if (process.env.VERCEL && isPlaceholder) {
      console.error("VERCEL: DATABASE_URL is missing! PostgreSQL is required.");
      this.mode = 'postgres'; // Force postgres on Vercel, will error on first query
    } else if (isPlaceholder) {
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
    if (process.env.VERCEL) {
      throw new Error("SQLite is not available on Vercel. Configure DATABASE_URL for PostgreSQL.");
    }
    if (!this.sqliteDb) {
      try {
        // Use variable to prevent esbuild from bundling native module
        const moduleName = 'better-' + 'sqlite3';
        const Database = (await import(/* @vite-ignore */ moduleName)).default;
        this.sqliteDb = new Database(path.join(__dirname, "database.sqlite"));
      } catch (err) {
        console.error("SQLite not available:", err);
        throw new Error("SQLite is not available. Please configure DATABASE_URL for PostgreSQL.");
      }
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
          if (process.env.VERCEL) {
            console.error(`Postgres connection failed on Vercel: ${err.message}`);
            throw new Error('Database connection failed. Check DATABASE_URL environment variable in Vercel settings.');
          }
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
        .replace(/RETURNING [\s\S]*/gi, ""); // SQLite doesn't support RETURNING in the same way

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
        type TEXT NOT NULL DEFAULT 'individual',
        first_name TEXT,
        last_name TEXT,
        company_name TEXT,
        name TEXT, -- Keeping for compatibility
        email TEXT,
        phone TEXT NOT NULL,
        address TEXT,
        city TEXT,
        industry TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS leads (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT NOT NULL DEFAULT 'individual',
        first_name TEXT,
        last_name TEXT,
        company_name TEXT,
        email TEXT,
        phone TEXT,
        source TEXT,
        status TEXT NOT NULL DEFAULT 'new',
        notes TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS opportunities (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        customer_id INTEGER REFERENCES customers(id),
        lead_id INTEGER REFERENCES leads(id),
        title TEXT NOT NULL,
        amount REAL,
        stage TEXT NOT NULL DEFAULT 'discovery',
        probability INTEGER,
        expected_close_date TEXT,
        notes TEXT,
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

      CREATE TABLE IF NOT EXISTS catalogues (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        description TEXT,
        is_active INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS vat_rates (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        label TEXT NOT NULL,
        rate REAL NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS products (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        type TEXT NOT NULL DEFAULT 'product', -- 'product' or 'service'
        category TEXT,
        category_id INTEGER REFERENCES categories(id),
        catalog_id INTEGER REFERENCES catalogues(id),
        price REAL NOT NULL DEFAULT 0,
        vat_rate REAL NOT NULL DEFAULT 20,
        vat_rate_id INTEGER REFERENCES vat_rates(id),
        stock INTEGER NOT NULL DEFAULT 0,
        unit TEXT,
        description TEXT,
        technical_file_url TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS quotes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        number TEXT UNIQUE NOT NULL,
        customer_id INTEGER REFERENCES customers(id),
        lead_id INTEGER REFERENCES leads(id),
        agent_id TEXT REFERENCES users(uid),
        amount REAL NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'Brouillon',
        date TEXT NOT NULL,
        expiry_date TEXT,
        notes TEXT,
        signature TEXT,
        signature_date TEXT,
        signed_by TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS quote_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        quote_id INTEGER NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
        product_id INTEGER REFERENCES products(id),
        description TEXT NOT NULL,
        quantity REAL NOT NULL DEFAULT 1,
        unit_price REAL NOT NULL DEFAULT 0,
        total_price REAL NOT NULL DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS invoices (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        number TEXT UNIQUE NOT NULL,
        customer_id INTEGER REFERENCES customers(id),
        quote_id INTEGER REFERENCES quotes(id),
        agent_id TEXT REFERENCES users(uid),
        amount REAL NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'En attente',
        date TEXT NOT NULL,
        due_date TEXT,
        paid_at TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS commissions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        agent_id TEXT REFERENCES users(uid),
        invoice_id INTEGER REFERENCES invoices(id),
        amount REAL NOT NULL DEFAULT 0,
        rate REAL NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'En attente',
        date TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS activities (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT NOT NULL,
        subject TEXT NOT NULL,
        customer_id INTEGER REFERENCES customers(id),
        lead_id INTEGER REFERENCES leads(id),
        opportunity_id INTEGER REFERENCES opportunities(id),
        agent_id TEXT REFERENCES users(uid),
        status TEXT NOT NULL DEFAULT 'À faire',
        date TEXT NOT NULL,
        notes TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS projects (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        customer_id INTEGER REFERENCES customers(id),
        status TEXT NOT NULL DEFAULT 'En cours',
        start_date TEXT,
        end_date TEXT,
        description TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS objectives (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        agent_id TEXT REFERENCES users(uid),
        type TEXT NOT NULL, -- 'revenue', 'calls', 'meetings', 'quotes'
        target_value REAL NOT NULL,
        period TEXT NOT NULL, -- 'monthly', 'quarterly', 'yearly'
        start_date TEXT NOT NULL,
        end_date TEXT NOT NULL,
        status TEXT DEFAULT 'En cours',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `;
    
    // Split schema into individual statements for SQLite
    const statements = schema.split(';').filter(s => s.trim());
    for (const statement of statements) {
      try {
        sqlite.prepare(statement).run();
      } catch (err: any) {
        // Ignore errors for already existing tables/columns
        if (!err.message.includes('already exists') && !err.message.includes('duplicate column name')) {
          console.error(`Error executing SQLite statement: ${statement}`, err);
        }
      }
    }

    // Ensure columns exist for customers table (for existing databases)
    const alterStatements = [
      "ALTER TABLE customers ADD COLUMN type TEXT NOT NULL DEFAULT 'individual'",
      "ALTER TABLE customers ADD COLUMN first_name TEXT",
      "ALTER TABLE customers ADD COLUMN last_name TEXT",
      "ALTER TABLE customers ADD COLUMN company_name TEXT",
      "ALTER TABLE customers ADD COLUMN city TEXT",
      "ALTER TABLE customers ADD COLUMN industry TEXT",
      "ALTER TABLE customers ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP",
      "ALTER TABLE opportunities ADD COLUMN lead_id INTEGER REFERENCES leads(id)"
    ];

    for (const statement of alterStatements) {
      try {
        sqlite.prepare(statement).run();
      } catch (err: any) {
        // Ignore "duplicate column name" error
        if (!err.message.includes('duplicate column name')) {
          // console.error(`Error altering SQLite table: ${statement}`, err);
        }
      }
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
    const schema = `
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
        type TEXT NOT NULL DEFAULT 'individual',
        first_name TEXT,
        last_name TEXT,
        company_name TEXT,
        name TEXT, -- Keeping for compatibility
        email TEXT,
        phone TEXT NOT NULL,
        address TEXT,
        city TEXT,
        industry TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS leads (
        id SERIAL PRIMARY KEY,
        type TEXT NOT NULL DEFAULT 'individual',
        first_name TEXT,
        last_name TEXT,
        company_name TEXT,
        email TEXT,
        phone TEXT,
        source TEXT,
        status TEXT NOT NULL DEFAULT 'new',
        notes TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS opportunities (
        id SERIAL PRIMARY KEY,
        customer_id INTEGER REFERENCES customers(id),
        lead_id INTEGER REFERENCES leads(id),
        title TEXT NOT NULL,
        amount NUMERIC,
        stage TEXT NOT NULL DEFAULT 'discovery',
        probability INTEGER,
        expected_close_date DATE,
        notes TEXT,
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

      CREATE TABLE IF NOT EXISTS products (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        category TEXT,
        price NUMERIC NOT NULL DEFAULT 0,
        stock INTEGER NOT NULL DEFAULT 0,
        unit TEXT,
        description TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS quotes (
        id SERIAL PRIMARY KEY,
        number TEXT UNIQUE NOT NULL,
        customer_id INTEGER REFERENCES customers(id),
        lead_id INTEGER REFERENCES leads(id),
        amount NUMERIC NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'Brouillon',
        date DATE NOT NULL,
        expiry_date DATE,
        notes TEXT,
        signature TEXT,
        signature_date TIMESTAMP WITH TIME ZONE,
        signed_by TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS quote_items (
        id SERIAL PRIMARY KEY,
        quote_id INTEGER NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
        product_id INTEGER REFERENCES products(id),
        description TEXT NOT NULL,
        quantity NUMERIC NOT NULL DEFAULT 1,
        unit_price NUMERIC NOT NULL DEFAULT 0,
        total_price NUMERIC NOT NULL DEFAULT 0,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS invoices (
        id SERIAL PRIMARY KEY,
        number TEXT UNIQUE NOT NULL,
        customer_id INTEGER REFERENCES customers(id),
        quote_id INTEGER REFERENCES quotes(id),
        amount NUMERIC NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'En attente',
        date DATE NOT NULL,
        due_date DATE,
        paid_at TIMESTAMP WITH TIME ZONE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS commissions (
        id SERIAL PRIMARY KEY,
        agent_id TEXT REFERENCES users(uid),
        invoice_id INTEGER REFERENCES invoices(id),
        amount NUMERIC NOT NULL DEFAULT 0,
        rate NUMERIC NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'En attente',
        date DATE NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS activities (
        id SERIAL PRIMARY KEY,
        type TEXT NOT NULL,
        subject TEXT NOT NULL,
        customer_id INTEGER REFERENCES customers(id),
        lead_id INTEGER REFERENCES leads(id),
        opportunity_id INTEGER REFERENCES opportunities(id),
        agent_id TEXT REFERENCES users(uid),
        status TEXT NOT NULL DEFAULT 'À faire',
        date TIMESTAMP WITH TIME ZONE NOT NULL,
        notes TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS projects (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        customer_id INTEGER REFERENCES customers(id),
        status TEXT NOT NULL DEFAULT 'En cours',
        start_date DATE,
        end_date DATE,
        description TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `;

    const statements = schema.split(';').filter(s => s.trim());
    for (const statement of statements) {
      await db.query(statement);
    }

    // Ensure columns exist for customers table (for existing databases)
    const alterStatements = [
      "ALTER TABLE customers ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'individual'",
      "ALTER TABLE customers ADD COLUMN IF NOT EXISTS first_name TEXT",
      "ALTER TABLE customers ADD COLUMN IF NOT EXISTS last_name TEXT",
      "ALTER TABLE customers ADD COLUMN IF NOT EXISTS company_name TEXT",
      "ALTER TABLE customers ADD COLUMN IF NOT EXISTS city TEXT",
      "ALTER TABLE customers ADD COLUMN IF NOT EXISTS industry TEXT",
      "ALTER TABLE customers ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP",
      "ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS lead_id INTEGER REFERENCES leads(id)"
    ];

    for (const statement of alterStatements) {
      try {
        await db.query(statement);
      } catch (err) {
        // Ignore errors
      }
    }

    console.log("Postgres database schema initialized");
  } catch (err: any) {
    console.error("Failed to initialize Postgres database:", err.message);
    if (process.env.VERCEL) {
      console.error("VERCEL: Cannot fall back to SQLite. Ensure DATABASE_URL is correctly set.");
      return;
    }
    if (err.message.includes('getaddrinfo') || err.message.includes('EAI_AGAIN') || err.message.includes('more than one statement')) {
      console.log("Falling back to SQLite due to Postgres connection error or multi-statement incompatibility.");
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

async function seedCustomers() {
  try {
    const result = await db.query("SELECT COUNT(*) as count FROM customers");
    if (parseInt(result.rows[0].count) === 0) {
      console.log("Seeding initial customers...");
      await db.query(
        "INSERT INTO customers (type, first_name, last_name, company_name, email, phone, address, city, industry) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)",
        ['company', null, null, 'TBI Center', 'contact@tbi-center.fr', '06 666 66 66', 'Centre-ville', 'Pointe-Noire', 'Informatique']
      );
      await db.query(
        "INSERT INTO customers (type, first_name, last_name, company_name, email, phone, address, city, industry) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)",
        ['individual', 'Jean', 'Dupont', null, 'jean.dupont@gmail.com', '05 555 55 55', 'Plateau', 'Brazzaville', 'Commerce']
      );
    }
  } catch (err) {
    console.error("Failed to seed customers:", err);
  }
}

async function seedLeads() {
  try {
    const result = await db.query("SELECT COUNT(*) as count FROM leads");
    if (parseInt(result.rows[0].count) === 0) {
      console.log("Seeding initial leads...");
      await db.query(
        "INSERT INTO leads (type, first_name, last_name, company_name, email, phone, source, status) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)",
        ['company', null, null, 'SNDE', 'info@snde.cg', '06 999 99 99', 'Site Web', 'new']
      );
    }
  } catch (err) {
    console.error("Failed to seed leads:", err);
  }
}

async function seedProducts() {
  const products = [
    { name: 'Sable de construction', category: 'Matériaux', price: 15000, stock: 500, unit: 'm3' },
    { name: 'Ciment 50kg', category: 'Matériaux', price: 4500, stock: 1200, unit: 'sac' },
    { name: 'Fer à béton 12mm', category: 'Matériaux', price: 5500, stock: 800, unit: 'barre' },
  ];

  try {
    const result = await db.query("SELECT COUNT(*) as count FROM products");
    if (parseInt(result.rows[0].count) === 0) {
      console.log("Seeding initial products...");
      for (const p of products) {
        await db.query(
          "INSERT INTO products (name, category, price, stock, unit) VALUES ($1, $2, $3, $4, $5)",
          [p.name, p.category, p.price, p.stock, p.unit]
        );
      }
    }
  } catch (err) {
    console.error("Failed to seed products:", err);
  }
}

async function seedQuotes() {
  try {
    const result = await db.query("SELECT COUNT(*) as count FROM quotes");
    if (parseInt(result.rows[0].count) === 0) {
      // We need at least one customer or lead
      const customers = await db.query("SELECT id FROM customers LIMIT 1");
      if (customers.rows.length > 0) {
        console.log("Seeding initial quotes...");
        await db.query(
          "INSERT INTO quotes (number, customer_id, amount, status, date, expiry_date) VALUES ($1, $2, $3, $4, $5, $6)",
          ['QT-2024-001', customers.rows[0].id, 1500000, 'Envoyé', '2024-03-15', '2024-04-15']
        );
      }
    }
  } catch (err) {
    console.error("Failed to seed quotes:", err);
  }
}

async function startServer() {
  console.log("Starting server...");
  const app = express();
  const PORT = 3000;

  // Start listening immediately to satisfy the platform's health check (skip on Vercel)
  if (!process.env.VERCEL) {
    const server = app.listen(PORT, "0.0.0.0", () => {
      console.log(`Server is now listening on http://0.0.0.0:${PORT}`);
    });
  }

  app.use(express.json());
  app.use(cookieParser());
  
  // Initialize database and seed data
  await initDb();
  await seedAdmin();
  await seedCategories();
  await seedCustomers();
  await seedLeads();
  await seedProducts();
  await seedQuotes();
  
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
        details: "La base de données n'est pas configurée. Veuillez définir DATABASE_URL dans les variables d'environnement."
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
        details: "La base de données n'est pas configurée. Veuillez définir DATABASE_URL dans les variables d'environnement."
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
  app.get("/api/portfolio-items", authenticateToken, async (req, res) => {
    try {
      const result = await db.query(
        "SELECT * FROM portfolio_items ORDER BY name ASC"
      );
      res.json(result.rows);
    } catch (err) {
      res.status(500).json({ error: "Server error" });
    }
  });

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
      const result = await db.query(`
        SELECT id, type, first_name as "firstName", last_name as "lastName", 
               company_name as "companyName", name, email, phone, address, city, industry,
               created_at as "createdAt", updated_at as "updatedAt" 
        FROM customers 
        ORDER BY created_at DESC
      `);
      res.json(result.rows);
    } catch (err) {
      res.status(500).json({ error: "Server error" });
    }
  });

  app.post("/api/customers", authenticateToken, async (req, res) => {
    const { type, firstName, lastName, companyName, email, phone, address, city, industry } = req.body;
    const name = type === 'company' ? companyName : `${firstName} ${lastName}`;
    
    try {
      const result = await db.query(
        `INSERT INTO customers (type, first_name, last_name, company_name, name, email, phone, address, city, industry) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) 
         RETURNING id, type, first_name as "firstName", last_name as "lastName", 
                   company_name as "companyName", name, email, phone, address, city, industry,
                   created_at as "createdAt"`,
        [type || 'individual', firstName, lastName, companyName, name, email, phone, address, city, industry]
      );
      res.status(201).json(result.rows[0]);
    } catch (err) {
      console.error("Error creating customer:", err);
      res.status(500).json({ error: "Server error", details: err instanceof Error ? err.message : String(err) });
    }
  });

  app.put("/api/customers/:id", authenticateToken, async (req, res) => {
    const { id } = req.params;
    const { type, firstName, lastName, companyName, email, phone, address, city, industry } = req.body;
    const name = type === 'company' ? companyName : `${firstName} ${lastName}`;
    
    try {
      const result = await db.query(
        `UPDATE customers 
         SET type = $1, first_name = $2, last_name = $3, company_name = $4, name = $5, 
             email = $6, phone = $7, address = $8, city = $9, industry = $10, updated_at = CURRENT_TIMESTAMP
         WHERE id = $11
         RETURNING id, type, first_name as "firstName", last_name as "lastName", 
                   company_name as "companyName", name, email, phone, address, city, industry,
                   updated_at as "updatedAt"`,
        [type, firstName, lastName, companyName, name, email, phone, address, city, industry, id]
      );
      if (result.rows.length === 0) return res.status(404).json({ error: "Customer not found" });
      res.json(result.rows[0]);
    } catch (err) {
      console.error("Error updating customer:", err);
      res.status(500).json({ error: "Server error", details: err instanceof Error ? err.message : String(err) });
    }
  });

  app.delete("/api/customers/:id", authenticateToken, async (req, res) => {
    const { id } = req.params;
    try {
      await db.query("DELETE FROM customers WHERE id = $1", [id]);
      res.json({ success: true });
    } catch (err) {
      console.error("Error deleting customer:", err);
      res.status(500).json({ error: "Server error", details: err instanceof Error ? err.message : String(err) });
    }
  });

  // Leads Routes
  app.get("/api/leads", authenticateToken, async (req, res) => {
    try {
      const result = await db.query(`
        SELECT id, type, first_name as "firstName", last_name as "lastName", 
               company_name as "companyName", email, phone, source, status, notes,
               created_at as "createdAt", updated_at as "updatedAt" 
        FROM leads 
        ORDER BY created_at DESC
      `);
      res.json(result.rows);
    } catch (err) {
      console.error("Error fetching leads:", err);
      res.status(500).json({ error: "Server error", details: err instanceof Error ? err.message : String(err) });
    }
  });

  app.post("/api/leads", authenticateToken, async (req: any, res) => {
    const { type, firstName, lastName, companyName, email, phone, source, status, notes } = req.body;
    try {
      const result = await db.query(
        `INSERT INTO leads (type, first_name, last_name, company_name, email, phone, source, status, notes) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) 
         RETURNING id, type, first_name as "firstName", last_name as "lastName", 
                   company_name as "companyName", email, phone, source, status, notes,
                   created_at as "createdAt"`,
        [type || 'individual', firstName, lastName, companyName, email, phone, source, status || 'Nouveau', notes]
      );
      const leadId = result.rows[0].id;

      // Automation: Create initial follow-up activity
      try {
        const dueDate = new Date();
        dueDate.setDate(dueDate.getDate() + 1);
        await db.query(
          `INSERT INTO activities (type, subject, lead_id, agent_id, status, date, notes) 
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          ['Appel', `Premier contact - Lead #${leadId}`, leadId, req.user.uid, 'À faire', dueDate.toISOString(), `Contacter le nouveau prospect: ${type === 'company' ? companyName : firstName + ' ' + lastName}`]
        );
      } catch (actErr) {
        console.error("Error creating automatic activity for lead:", actErr);
      }

      res.status(201).json(result.rows[0]);
    } catch (err) {
      console.error("Error creating lead:", err);
      res.status(500).json({ error: "Server error", details: err instanceof Error ? err.message : String(err) });
    }
  });

  app.put("/api/leads/:id", authenticateToken, async (req, res) => {
    const { id } = req.params;
    const { type, firstName, lastName, companyName, email, phone, source, status, notes } = req.body;
    try {
      const result = await db.query(
        `UPDATE leads 
         SET type = $1, first_name = $2, last_name = $3, company_name = $4, email = $5, 
             phone = $6, source = $7, status = $8, notes = $9, updated_at = CURRENT_TIMESTAMP
         WHERE id = $10
         RETURNING id, type, first_name as "firstName", last_name as "lastName", 
                   company_name as "companyName", email, phone, source, status, notes,
                   updated_at as "updatedAt"`,
        [type, firstName, lastName, companyName, email, phone, source, status, notes, id]
      );
      if (result.rows.length === 0) return res.status(404).json({ error: "Lead not found" });
      res.json(result.rows[0]);
    } catch (err) {
      console.error("Error updating lead:", err);
      res.status(500).json({ error: "Server error", details: err instanceof Error ? err.message : String(err) });
    }
  });

  app.delete("/api/leads/:id", authenticateToken, async (req, res) => {
    const { id } = req.params;
    try {
      await db.query("DELETE FROM leads WHERE id = $1", [id]);
      res.json({ success: true });
    } catch (err) {
      console.error("Error deleting lead:", err);
      res.status(500).json({ error: "Server error", details: err instanceof Error ? err.message : String(err) });
    }
  });

  // Opportunities Routes
  app.get("/api/opportunities", authenticateToken, async (req, res) => {
    try {
      const result = await db.query(`
        SELECT o.id, o.customer_id as "customerId", o.lead_id as "leadId", o.title, o.amount, o.stage, 
               o.probability, o.expected_close_date as "expectedCloseDate", o.notes,
               o.created_at as "createdAt", o.updated_at as "updatedAt",
               c.name as "customerName",
               CASE 
                 WHEN l.type = 'company' THEN l.company_name 
                 ELSE COALESCE(l.first_name, '') || ' ' || COALESCE(l.last_name, '')
               END as "leadName"
        FROM opportunities o
        LEFT JOIN customers c ON o.customer_id = c.id
        LEFT JOIN leads l ON o.lead_id = l.id
        ORDER BY o.created_at DESC
      `);
      res.json(result.rows);
    } catch (err) {
      console.error("Error fetching opportunities:", err);
      res.status(500).json({ error: "Server error", details: err instanceof Error ? err.message : String(err) });
    }
  });

  app.post("/api/opportunities", authenticateToken, async (req: any, res) => {
    const { customerId, leadId, title, amount, stage, probability, expectedCloseDate, notes } = req.body;
    try {
      const result = await db.query(
        `INSERT INTO opportunities (customer_id, lead_id, title, amount, stage, probability, expected_close_date, notes) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) 
         RETURNING id, customer_id as "customerId", lead_id as "leadId", title, amount, stage, 
                   probability, expected_close_date as "expectedCloseDate", notes,
                   created_at as "createdAt"`,
        [customerId || null, leadId || null, title, amount, stage || 'Prospection', probability, expectedCloseDate, notes]
      );
      const oppId = result.rows[0].id;

      // Automation: Create activity for new opportunity
      try {
        const dueDate = new Date();
        dueDate.setDate(dueDate.getDate() + 3);
        await db.query(
          `INSERT INTO activities (type, subject, customer_id, lead_id, agent_id, status, date, notes) 
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          ['Réunion', `Qualification - Opp #${oppId}`, customerId || null, leadId || null, req.user.uid, 'À faire', dueDate.toISOString(), `Qualifier les besoins pour l'opportunité: ${title}`]
        );
      } catch (actErr) {
        console.error("Error creating automatic activity for opportunity:", actErr);
      }

      res.status(201).json(result.rows[0]);
    } catch (err) {
      console.error("Error creating opportunity:", err);
      res.status(500).json({ error: "Server error", details: err instanceof Error ? err.message : String(err) });
    }
  });

  app.put("/api/opportunities/:id", authenticateToken, async (req, res) => {
    const { id } = req.params;
    const { customerId, leadId, title, amount, stage, probability, expectedCloseDate, notes } = req.body;
    try {
      const result = await db.query(
        `UPDATE opportunities 
         SET customer_id = $1, lead_id = $2, title = $3, amount = $4, stage = $5, 
             probability = $6, expected_close_date = $7, notes = $8, updated_at = CURRENT_TIMESTAMP
         WHERE id = $9
         RETURNING id, customer_id as "customerId", lead_id as "leadId", title, amount, stage, 
                   probability, expected_close_date as "expectedCloseDate", notes,
                   updated_at as "updatedAt"`,
        [customerId || null, leadId || null, title, amount, stage, probability, expectedCloseDate, notes, id]
      );
      if (result.rows.length === 0) return res.status(404).json({ error: "Opportunity not found" });
      res.json(result.rows[0]);
    } catch (err) {
      console.error("Error updating opportunity:", err);
      res.status(500).json({ error: "Server error", details: err instanceof Error ? err.message : String(err) });
    }
  });

  app.delete("/api/opportunities/:id", authenticateToken, async (req, res) => {
    const { id } = req.params;
    try {
      await db.query("DELETE FROM opportunities WHERE id = $1", [id]);
      res.json({ success: true });
    } catch (err) {
      console.error("Error deleting opportunity:", err);
      res.status(500).json({ error: "Server error", details: err instanceof Error ? err.message : String(err) });
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

  // File uploads - skip disk storage on Vercel (read-only filesystem)
  let upload: any;
  if (!process.env.VERCEL) {
    const uploadsDir = path.join(__dirname, "public", "uploads");
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }

    const storage = multer.diskStorage({
      destination: (req, file, cb) => {
        cb(null, uploadsDir);
      },
      filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
        cb(null, uniqueSuffix + "-" + file.originalname);
      },
    });
    upload = multer({ storage });

    app.use("/uploads", express.static(uploadsDir));
  } else {
    upload = multer({ storage: multer.memoryStorage() });
  }

  // File Upload Route
  app.post("/api/upload", authenticateToken, upload.single("file"), (req: any, res) => {
    if (process.env.VERCEL) {
      return res.status(503).json({ error: "File uploads are not supported in serverless mode." });
    }
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }
    const fileUrl = `/uploads/${req.file.filename}`;
    res.json({ url: fileUrl });
  });

  // VAT Rates Routes
  app.get("/api/vat-rates", authenticateToken, async (req, res) => {
    try {
      const result = await db.query("SELECT * FROM vat_rates ORDER BY rate ASC");
      res.json(result.rows);
    } catch (err) {
      res.status(500).json({ error: "Server error" });
    }
  });

  app.post("/api/vat-rates", authenticateToken, async (req: any, res) => {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: "Only admins can create VAT rates" });
    }
    const { label, rate } = req.body;
    try {
      const result = await db.query(
        "INSERT INTO vat_rates (label, rate) VALUES ($1, $2) RETURNING *",
        [label, parseFloat(rate)]
      );
      res.status(201).json(result.rows[0]);
    } catch (err) {
      res.status(500).json({ error: "Server error" });
    }
  });

  // Catalogues Routes
  app.get("/api/catalogues", authenticateToken, async (req, res) => {
    try {
      const result = await db.query("SELECT * FROM catalogues ORDER BY name ASC");
      res.json(result.rows);
    } catch (err) {
      res.status(500).json({ error: "Server error" });
    }
  });

  app.post("/api/catalogues", authenticateToken, async (req: any, res) => {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: "Only admins can create catalogues" });
    }
    const { name, description, is_active } = req.body;
    try {
      const result = await db.query(
        "INSERT INTO catalogues (name, description, is_active) VALUES ($1, $2, $3) RETURNING *",
        [name, description, is_active !== undefined ? is_active : 1]
      );
      res.status(201).json(result.rows[0]);
    } catch (err) {
      res.status(500).json({ error: "Server error" });
    }
  });

  // Products Routes
  app.get("/api/products", authenticateToken, async (req, res) => {
    try {
      const result = await db.query(`
        SELECT p.*, c.name as "categoryName", cat.name as "catalogName"
        FROM products p
        LEFT JOIN categories c ON p.category_id = c.id
        LEFT JOIN catalogues cat ON p.catalog_id = cat.id
        ORDER BY p.name ASC
      `);
      res.json(result.rows);
    } catch (err) {
      res.status(500).json({ error: "Server error" });
    }
  });

  app.post("/api/products", authenticateToken, async (req: any, res) => {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: "Only admins can create products" });
    }
    const { name, type, category, categoryId, catalogId, price, vatRate, vatRateId, stock, unit, description, technicalFileUrl } = req.body;
    try {
      const result = await db.query(
        `INSERT INTO products (name, type, category, category_id, catalog_id, price, vat_rate, vat_rate_id, stock, unit, description, technical_file_url) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING *`,
        [name, type || 'product', category, categoryId, catalogId, price, vatRate || 20, vatRateId, stock || 0, unit, description, technicalFileUrl]
      );
      res.status(201).json(result.rows[0]);
    } catch (err) {
      console.error("Error creating product:", err);
      res.status(500).json({ error: "Server error" });
    }
  });

  // Quotes Routes
  app.get("/api/quotes", authenticateToken, async (req: any, res) => {
    try {
      let query = `
        SELECT q.*, c.name as "customerName", l.first_name || ' ' || l.last_name as "leadName", u.name as "agentName"
        FROM quotes q
        LEFT JOIN customers c ON q.customer_id = c.id
        LEFT JOIN leads l ON q.lead_id = l.id
        LEFT JOIN users u ON q.agent_id = u.uid
      `;
      let params: any[] = [];

      if (req.user.role !== 'admin') {
        query += ` WHERE q.agent_id = $1`;
        params.push(req.user.uid);
      }

      query += ` ORDER BY q.date DESC`;
      
      const result = await db.query(query, params);
      res.json(result.rows.map(row => ({
        ...row,
        customerName: row.customerName || (row.leadName ? `Prospect: ${row.leadName}` : 'Inconnu'),
        expiryDate: row.expiry_date
      })));
    } catch (err) {
      res.status(500).json({ error: "Server error" });
    }
  });

  app.get("/api/quotes/:id", authenticateToken, async (req, res) => {
    const { id } = req.params;
    try {
      const quoteResult = await db.query(`
        SELECT q.*, c.name as "customerName", c.email as "customerEmail", c.phone as "customerPhone", 
               l.first_name || ' ' || l.last_name as "leadName", l.email as "leadEmail", l.phone as "leadPhone"
        FROM quotes q
        LEFT JOIN customers c ON q.customer_id = c.id
        LEFT JOIN leads l ON q.lead_id = l.id
        WHERE q.id = $1
      `, [id]);

      if (quoteResult.rows.length === 0) return res.status(404).json({ error: "Quote not found" });

      const itemsResult = await db.query("SELECT * FROM quote_items WHERE quote_id = $1", [id]);
      
      const quote = quoteResult.rows[0];
      res.json({
        ...quote,
        customerName: quote.customerName || quote.leadName,
        customerEmail: quote.customerEmail || quote.leadEmail,
        customerPhone: quote.customerPhone || quote.leadPhone,
        items: itemsResult.rows
      });
    } catch (err) {
      res.status(500).json({ error: "Server error" });
    }
  });

  app.post("/api/quotes", authenticateToken, async (req: any, res) => {
    const { number, customerId, leadId, amount, status, date, expiryDate, notes, items } = req.body;
    try {
      const result = await db.query(
        "INSERT INTO quotes (number, customer_id, lead_id, agent_id, amount, status, date, expiry_date, notes) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id",
        [
          number, 
          customerId === "" ? null : customerId, 
          leadId === "" ? null : leadId, 
          req.user.uid,
          amount, 
          status || 'Brouillon', 
          date, 
          expiryDate, 
          notes
        ]
      );
      const quoteId = result.rows[0].id;

      if (items && items.length > 0) {
        for (const item of items) {
          await db.query(
            "INSERT INTO quote_items (quote_id, product_id, description, quantity, unit_price, total_price) VALUES ($1, $2, $3, $4, $5, $6)",
            [
              quoteId, 
              item.productId === "" ? null : item.productId, 
              item.description, 
              item.quantity, 
              item.unitPrice, 
              item.totalPrice
            ]
          );
        }
      }

      res.status(201).json({ id: quoteId });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Server error" });
    }
  });

  app.put("/api/quotes/:id", authenticateToken, async (req, res) => {
    const { id } = req.params;
    const { amount, status, date, expiryDate, notes, items } = req.body;
    try {
      await db.query(
        "UPDATE quotes SET amount = $1, status = $2, date = $3, expiry_date = $4, notes = $5, updated_at = CURRENT_TIMESTAMP WHERE id = $6",
        [amount, status, date, expiryDate, notes, id]
      );

      if (items) {
        await db.query("DELETE FROM quote_items WHERE quote_id = $1", [id]);
        for (const item of items) {
          await db.query(
            "INSERT INTO quote_items (quote_id, product_id, description, quantity, unit_price, total_price) VALUES ($1, $2, $3, $4, $5, $6)",
            [
              id, 
              item.productId === "" ? null : item.productId, 
              item.description, 
              item.quantity, 
              item.unitPrice, 
              item.totalPrice
            ]
          );
        }
      }

      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: "Server error" });
    }
  });

  // Public Quote Routes (No Auth)
  app.get("/api/public/quotes/:id", async (req, res) => {
    const { id } = req.params;
    try {
      const quoteResult = await db.query(`
        SELECT q.*, c.name as "customerName", c.email as "customerEmail", c.phone as "customerPhone", 
               l.first_name || ' ' || l.last_name as "leadName", l.email as "leadEmail", l.phone as "leadPhone"
        FROM quotes q
        LEFT JOIN customers c ON q.customer_id = c.id
        LEFT JOIN leads l ON q.lead_id = l.id
        WHERE q.id = $1
      `, [id]);

      if (quoteResult.rows.length === 0) return res.status(404).json({ error: "Quote not found" });

      const itemsResult = await db.query("SELECT * FROM quote_items WHERE quote_id = $1", [id]);
      
      const quote = quoteResult.rows[0];
      res.json({
        ...quote,
        customerName: quote.customerName || quote.leadName,
        customerEmail: quote.customerEmail || quote.leadEmail,
        customerPhone: quote.customerPhone || quote.leadPhone,
        items: itemsResult.rows
      });
    } catch (err) {
      res.status(500).json({ error: "Server error" });
    }
  });

  app.post("/api/public/quotes/:id/sign", async (req, res) => {
    const { id } = req.params;
    const { signature, signedBy } = req.body;
    try {
      await db.query(
        "UPDATE quotes SET signature = $1, signed_by = $2, signature_date = CURRENT_TIMESTAMP, status = 'Accepté' WHERE id = $3",
        [signature, signedBy, id]
      );
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: "Server error" });
    }
  });

  // Invoices Routes
  app.get("/api/invoices", authenticateToken, async (req: any, res) => {
    try {
      let query = `
        SELECT i.*, c.name as "customerName", u.name as "agentName"
        FROM invoices i
        LEFT JOIN customers c ON i.customer_id = c.id
        LEFT JOIN users u ON i.agent_id = u.uid
      `;
      let params: any[] = [];

      if (req.user.role !== 'admin') {
        query += ` WHERE i.agent_id = $1`;
        params.push(req.user.uid);
      }

      query += ` ORDER BY i.date DESC`;
      
      const result = await db.query(query, params);
      res.json(result.rows.map(row => ({
        ...row,
        dueDate: row.due_date,
        paidAt: row.paid_at
      })));
    } catch (err) {
      res.status(500).json({ error: "Server error" });
    }
  });

  app.post("/api/invoices", authenticateToken, async (req: any, res) => {
    const { number, customerId, quoteId, amount, status, date, dueDate } = req.body;
    try {
      const result = await db.query(
        "INSERT INTO invoices (number, customer_id, quote_id, agent_id, amount, status, date, due_date) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id",
        [
          number, 
          customerId === "" ? null : customerId, 
          quoteId === "" ? null : quoteId, 
          req.user.uid,
          amount, 
          status || 'En attente', 
          date, 
          dueDate
        ]
      );
      res.status(201).json({ id: result.rows[0].id });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Server error" });
    }
  });

  // Commissions Routes
  app.get("/api/commissions", authenticateToken, async (req: any, res) => {
    try {
      let query = `
        SELECT cm.*, u.name as "agentName", i.number as "invoiceNumber"
        FROM commissions cm
        LEFT JOIN users u ON cm.agent_id = u.uid
        LEFT JOIN invoices i ON cm.invoice_id = i.id
      `;
      let params: any[] = [];

      if (req.user.role !== 'admin') {
        query += ` WHERE cm.agent_id = $1`;
        params.push(req.user.uid);
      }

      query += ` ORDER BY cm.date DESC`;
      
      const result = await db.query(query, params);
      res.json(result.rows);
    } catch (err) {
      console.error("Error fetching commissions:", err);
      res.status(500).json({ error: "Server error" });
    }
  });

  app.post("/api/commissions", authenticateToken, async (req: any, res) => {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: "Only admins can assign commissions" });
    }

    const { agentId, invoiceId, amount, rate, status, date } = req.body;
    try {
      const result = await db.query(
        `INSERT INTO commissions (agent_id, invoice_id, amount, rate, status, date) 
         VALUES ($1, $2, $3, $4, $5, $6) 
         RETURNING id, agent_id as "agentId", invoice_id as "invoiceId", amount, rate, status, date`,
        [agentId, invoiceId || null, amount, rate, status || 'En attente', date]
      );
      res.status(201).json(result.rows[0]);
    } catch (err) {
      console.error("Error creating commission:", err);
      res.status(500).json({ error: "Server error" });
    }
  });

  app.put("/api/commissions/:id", authenticateToken, async (req: any, res) => {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: "Only admins can update commissions" });
    }

    const { id } = req.params;
    const { status } = req.body;
    try {
      const result = await db.query(
        "UPDATE commissions SET status = $1 WHERE id = $2 RETURNING *",
        [status, id]
      );
      if (result.rows.length === 0) return res.status(404).json({ error: "Commission not found" });
      res.json(result.rows[0]);
    } catch (err) {
      res.status(500).json({ error: "Server error" });
    }
  });

  // Activities Routes
  app.get("/api/activities", authenticateToken, async (req, res) => {
    try {
      const result = await db.query(`
        SELECT a.*, c.name as "customerName", 
               l.first_name || ' ' || l.last_name as "leadName", 
               o.title as "opportunityTitle",
               u.name as "agentName",
               u.role as "agentRole"
        FROM activities a
        LEFT JOIN customers c ON a.customer_id = c.id
        LEFT JOIN leads l ON a.lead_id = l.id
        LEFT JOIN opportunities o ON a.opportunity_id = o.id
        LEFT JOIN users u ON a.agent_id = u.uid
        ORDER BY a.date DESC
      `);
      res.json(result.rows.map(row => ({
        ...row,
        customerName: row.customerName || (row.leadName ? `Prospect: ${row.leadName}` : row.opportunityTitle || 'N/A')
      })));
    } catch (err) {
      res.status(500).json({ error: "Server error" });
    }
  });

  // Objectives Routes
  app.get("/api/objectives", authenticateToken, async (req: any, res) => {
    try {
      let query = `
        SELECT o.*, u.name as "agentName"
        FROM objectives o
        LEFT JOIN users u ON o.agent_id = u.uid
      `;
      let params: any[] = [];

      if (req.user.role !== 'admin') {
        query += ` WHERE o.agent_id = $1`;
        params.push(req.user.uid);
      }

      query += ` ORDER BY o.end_date DESC`;
      
      const result = await db.query(query, params);
      res.json(result.rows);
    } catch (err) {
      console.error("Error fetching objectives:", err);
      res.status(500).json({ error: "Server error" });
    }
  });

  app.get("/api/objectives/stats", authenticateToken, async (req: any, res) => {
    try {
      const objectivesQuery = `
        SELECT o.*, u.name as "agentName"
        FROM objectives o
        LEFT JOIN users u ON o.agent_id = u.uid
        ${req.user.role !== 'admin' ? 'WHERE o.agent_id = $1' : ''}
      `;
      const objectivesParams = req.user.role !== 'admin' ? [req.user.uid] : [];
      const objectives = await db.query(objectivesQuery, objectivesParams);

      const stats = await Promise.all(objectives.rows.map(async (obj: any) => {
        let currentValue = 0;
        const { type, agent_id, start_date, end_date } = obj;

        if (type === 'revenue') {
          const result = await db.query(`
            SELECT SUM(amount) as total
            FROM invoices
            WHERE agent_id = $1 AND status = 'Payée' AND date BETWEEN $2 AND $3
          `, [agent_id, start_date, end_date]);
          currentValue = result.rows[0].total || 0;
        } else if (type === 'calls') {
          const result = await db.query(`
            SELECT COUNT(*) as count
            FROM activities
            WHERE agent_id = $1 AND type = 'Appel' AND date BETWEEN $2 AND $3
          `, [agent_id, start_date, end_date]);
          currentValue = result.rows[0].count || 0;
        } else if (type === 'meetings') {
          const result = await db.query(`
            SELECT COUNT(*) as count
            FROM activities
            WHERE agent_id = $1 AND type = 'RDV' AND date BETWEEN $2 AND $3
          `, [agent_id, start_date, end_date]);
          currentValue = result.rows[0].count || 0;
        } else if (type === 'quotes') {
          const result = await db.query(`
            SELECT COUNT(*) as count
            FROM quotes
            WHERE agent_id = $1 AND date BETWEEN $2 AND $3
          `, [agent_id, start_date, end_date]);
          currentValue = result.rows[0].count || 0;
        }

        return {
          ...obj,
          currentValue
        };
      }));

      res.json(stats);
    } catch (err) {
      console.error("Error fetching objective stats:", err);
      res.status(500).json({ error: "Server error" });
    }
  });

  app.post("/api/objectives", authenticateToken, async (req: any, res) => {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: "Only admins can assign objectives" });
    }

    const { agentId, type, targetValue, period, startDate, endDate, status } = req.body;
    try {
      const result = await db.query(
        `INSERT INTO objectives (agent_id, type, target_value, period, start_date, end_date, status) 
         VALUES ($1, $2, $3, $4, $5, $6, $7) 
         RETURNING id, agent_id as "agentId", type, target_value as "targetValue", period, start_date as "startDate", end_date as "endDate", status`,
        [agentId, type, targetValue, period, startDate, endDate, status || 'En cours']
      );
      res.status(201).json(result.rows[0]);
    } catch (err) {
      console.error("Error creating objective:", err);
      res.status(500).json({ error: "Server error" });
    }
  });

  app.put("/api/objectives/:id", authenticateToken, async (req: any, res) => {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: "Only admins can update objectives" });
    }

    const { id } = req.params;
    const { targetValue, status, endDate } = req.body;
    try {
      const result = await db.query(
        "UPDATE objectives SET target_value = $1, status = $2, end_date = $3, updated_at = CURRENT_TIMESTAMP WHERE id = $4 RETURNING *",
        [targetValue, status, endDate, id]
      );
      if (result.rows.length === 0) return res.status(404).json({ error: "Objective not found" });
      res.json(result.rows[0]);
    } catch (err) {
      res.status(500).json({ error: "Server error" });
    }
  });

  app.delete("/api/objectives/:id", authenticateToken, async (req: any, res) => {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: "Only admins can delete objectives" });
    }

    const { id } = req.params;
    try {
      await db.query("DELETE FROM objectives WHERE id = $1", [id]);
      res.status(204).send();
    } catch (err) {
      res.status(500).json({ error: "Server error" });
    }
  });

  app.post("/api/activities", authenticateToken, async (req: any, res) => {
    const { type, subject, customerId, leadId, opportunityId, status, date, notes } = req.body;
    try {
      const result = await db.query(
        `INSERT INTO activities (type, subject, customer_id, lead_id, opportunity_id, agent_id, status, date, notes) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
        [type, subject, customerId, leadId, opportunityId, req.user.uid, status || 'À faire', date, notes]
      );
      res.status(201).json({ id: result.rows[0].id });
    } catch (err) {
      res.status(500).json({ error: "Server error" });
    }
  });

  app.put("/api/activities/:id", authenticateToken, async (req, res) => {
    const { id } = req.params;
    const { type, subject, customerId, leadId, opportunityId, status, date, notes } = req.body;
    try {
      await db.query(
        `UPDATE activities 
         SET type = $1, subject = $2, customer_id = $3, lead_id = $4, opportunity_id = $5, status = $6, date = $7, notes = $8, updated_at = CURRENT_TIMESTAMP
         WHERE id = $9`,
        [type, subject, customerId, leadId, opportunityId, status, date, notes, id]
      );
      res.json({ message: "Activity updated" });
    } catch (err) {
      res.status(500).json({ error: "Server error" });
    }
  });

  app.delete("/api/activities/:id", authenticateToken, async (req, res) => {
    const { id } = req.params;
    try {
      await db.query("DELETE FROM activities WHERE id = $1", [id]);
      res.json({ message: "Activity deleted" });
    } catch (err) {
      res.status(500).json({ error: "Server error" });
    }
  });

  // Projects Routes
  app.get("/api/projects", authenticateToken, async (req, res) => {
    try {
      const result = await db.query(`
        SELECT p.*, c.name as "customerName"
        FROM projects p
        LEFT JOIN customers c ON p.customer_id = c.id
        ORDER BY p.created_at DESC
      `);
      res.json(result.rows.map(row => ({
        ...row,
        startDate: row.start_date,
        endDate: row.end_date
      })));
    } catch (err) {
      res.status(500).json({ error: "Server error" });
    }
  });

  // CRM Automation Routes
  app.post("/api/leads/:id/convert-to-customer", authenticateToken, async (req, res) => {
    const { id } = req.params;
    try {
      // 1. Fetch lead
      const leadResult = await db.query("SELECT * FROM leads WHERE id = $1", [id]);
      if (leadResult.rows.length === 0) return res.status(404).json({ error: "Lead not found" });
      const lead = leadResult.rows[0];

      // 2. Create customer
      const customerResult = await db.query(
        `INSERT INTO customers (type, first_name, last_name, company_name, email, phone, industry, updated_at) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP) RETURNING id`,
        [lead.type, lead.first_name, lead.last_name, lead.company_name, lead.email, lead.phone, 'Non spécifié']
      );
      const customerId = customerResult.rows[0].id;

      // 3. Update opportunities linked to this lead
      await db.query("UPDATE opportunities SET customer_id = $1, lead_id = NULL WHERE lead_id = $2", [customerId, id]);

      // 4. Mark lead as converted
      await db.query("UPDATE leads SET status = 'Converti', updated_at = CURRENT_TIMESTAMP WHERE id = $1", [id]);

      res.json({ success: true, customerId });
    } catch (err) {
      console.error("Error converting lead to customer:", err);
      res.status(500).json({ error: "Server error" });
    }
  });

  app.post("/api/leads/:id/convert-to-opportunity", authenticateToken, async (req, res) => {
    const { id } = req.params;
    const { title, amount, expectedCloseDate } = req.body;
    try {
      const leadResult = await db.query("SELECT * FROM leads WHERE id = $1", [id]);
      if (leadResult.rows.length === 0) return res.status(404).json({ error: "Lead not found" });

      const result = await db.query(
        `INSERT INTO opportunities (lead_id, title, amount, stage, probability, expected_close_date, updated_at) 
         VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP) RETURNING id`,
        [id, title || "Nouvelle Opportunité", amount || 0, 'discovery', 10, expectedCloseDate || null]
      );

      // Update lead status
      await db.query("UPDATE leads SET status = 'Qualifié' WHERE id = $1", [id]);

      res.json(result.rows[0]);
    } catch (err) {
      console.error("Error converting lead to opportunity:", err);
      res.status(500).json({ error: "Server error" });
    }
  });

  app.post("/api/opportunities/:id/convert-to-customer", authenticateToken, async (req, res) => {
    const { id } = req.params;
    try {
      const oppResult = await db.query("SELECT * FROM opportunities WHERE id = $1", [id]);
      if (oppResult.rows.length === 0) return res.status(404).json({ error: "Opportunity not found" });
      const opp = oppResult.rows[0];

      let customerId = opp.customer_id;

      if (!customerId && opp.lead_id) {
        // Convert the lead to customer
        const leadResult = await db.query("SELECT * FROM leads WHERE id = $1", [opp.lead_id]);
        if (leadResult.rows.length > 0) {
          const lead = leadResult.rows[0];
          const customerResult = await db.query(
            `INSERT INTO customers (type, first_name, last_name, company_name, email, phone, industry, updated_at) 
             VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP) RETURNING id`,
            [lead.type, lead.first_name, lead.last_name, lead.company_name, lead.email, lead.phone, 'Non spécifié']
          );
          customerId = customerResult.rows[0].id;
          
          // Mark lead as converted
          await db.query("UPDATE leads SET status = 'Converti', updated_at = CURRENT_TIMESTAMP WHERE id = $1", [opp.lead_id]);
        }
      }

      // Update opportunity
      await db.query(
        "UPDATE opportunities SET customer_id = $1, lead_id = NULL, stage = 'won', probability = 100, updated_at = CURRENT_TIMESTAMP WHERE id = $2",
        [customerId, id]
      );

      res.json({ success: true, customerId });
    } catch (err) {
      console.error("Error converting opportunity to customer:", err);
      res.status(500).json({ error: "Server error" });
    }
  });

  // Global error handler - ensures JSON responses even on unexpected errors
  app.use((err: any, req: any, res: any, next: any) => {
    console.error("Unhandled error:", err);
    res.status(500).json({ error: "Internal server error", details: err.message });
  });

  // Skip Vite middleware and static file serving on Vercel (handled by Vercel itself)
  if (!process.env.VERCEL) {
    // Placeholder for Vite middleware to prevent blocking server startup
    let viteMiddleware: any = null;
    
    // Vite middleware for development
    if (process.env.NODE_ENV !== "production") {
      (async () => {
        try {
          const { createServer: createViteServer } = await import("vite");
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
      await seedAssociationsItems();
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
      await seedCoiffureEsthetiqueItems();
      console.log("Background: Database initialized and seeded.");
    } catch (err) {
      console.error("Background: Failed to initialize database:", err);
    }
  })();

  // Return the app for Vercel export
  return app;
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

async function seedAssociationsItems() {
  try {
    const catResult = await db.query("SELECT id FROM categories WHERE name = 'ASSOCIATIONS'");
    if (catResult.rows.length === 0) return;
    const catId = catResult.rows[0].id;

    const itemsCountResult = await db.query("SELECT COUNT(*) as count FROM portfolio_items WHERE category_id = $1", [catId]);
    const currentCount = parseInt(itemsCountResult.rows[0].count);

    const items = [
      // Brazzaville
      { name: "Association Président Fulbert Youlou", sub_type: "Associations", address: "Bd Denis Sassou Nguesso", city: "BRAZZAVILLE", tel: "05 742 08 53 / 06 830 33 41" },
      { name: "Edden (ONG)", sub_type: "Associations", address: "Route N°2 - Village Elota", city: "BRAZZAVILLE", bp: "1684", tel: "22 281 01 06 / 06 971 66 66", mail: "contact@association-edden.com", web: "www.association-edden.com" },
      { name: "Fondation Congo Assistance VIH/SIDA", sub_type: "Associations", address: "Rue Béhangle", city: "BRAZZAVILLE", mail: "info@fondation-congo-assistance.org", web: "www.fondation-congo-assistance.org" },
      { name: "Fondation des Jeunes Entreprises du Congo", sub_type: "Associations", address: "Av. de l'OUA - Bacongo", city: "BRAZZAVILLE", bp: "13700", tel: "06 661 48 90 / 05 521 65 48", mail: "fjecbrazza@yahoo.fr" },
      { name: "Fondation Perspectives d’Avenir", sub_type: "Associations", address: "Av. des Trois Martyrs", city: "BRAZZAVILLE", bp: "13135", tel: "22 281 20 20", mail: "info@perspectivesavenir.org" },
      { name: "France Volontaires", sub_type: "Associations", address: "Bd Denis Sassou Nguesso - Imm. Paul Doumer", city: "BRAZZAVILLE", tel: "06 829 76 07", mail: "ev.congo@france-volontaires.org", web: "www.evfv.org" },
      { name: "INSTITUT DES JEUNES SOURDS DE BRAZZAVILLE", sub_type: "Associations", address: "Rond-point de la Patte d'Oie", city: "BRAZZAVILLE", bp: "178", tel: "06 678 23 98 / 05 551 18 22", mail: "ijsb07@yahoo.fr" },
      { name: "La CONADHO (Convention Nationale des Droits de l’Homme)", sub_type: "Associations", address: "23, Av. André Matsoua", city: "BRAZZAVILLE", bp: "13296", tel: "05 551 20 94 / 05 551 09 19", mail: "conadho@yahoo.fr" },
      { name: "LION’S CLUB ELIKIA", sub_type: "Associations", address: "Hôtel Saphir - Centre Ville", city: "BRAZZAVILLE", tel: "01 635 64 44" },
      { name: "Programme de Santé Communautaire", sub_type: "Associations", address: "Imm. 5 Février - 2ème étage", city: "BRAZZAVILLE", bp: "13336", tel: "22 611 27 63 / 64", mail: "contact@psc-congo.org" },
      { name: "ROTARY CLUB BRAZZAVILLE (District : 9150)", sub_type: "Associations", address: "Av. de l'Amitié - Olympic Palace", city: "BRAZZAVILLE", web: "www.rotaryclubbzvcentre.org" },
      { name: "SCC (Syndicat des Commerçants du Congo)", sub_type: "Associations", address: "45, rue Mbakas - Imm. Doukouré", city: "BRAZZAVILLE", tel: "05 556 45 54 / 06 666 37 41" },
      
      // Pointe-Noire
      { name: "ASSOC (L’Association de Soutien aux Orphelins du Congo)", sub_type: "Associations", address: "Av. Bitélika Ndombi - Aéroport", city: "POINTE-NOIRE", bp: "4017", tel: "05 564 90 34", web: "www.assoc.cg" },
      { name: "AVSI – PEOPLE FOR DEVELOPEMENT", sub_type: "Associations", address: "Av. Moé Vangoula - Imm. Nyanga -1er étage", city: "POINTE-NOIRE", bp: "1716", tel: "06 514 48 61 / 05 663 60 61", web: "www.avsi.org" },
      { name: "Centre Spécialisé de Réeducation Orthophonique", sub_type: "Associations", address: "28, Av. Dr Denis Loemba - Rond Point des Amoureux", city: "POINTE-NOIRE", bp: "5806", tel: "05 553 18 97", mail: "ludjos_orthophonie@yahoo.fr" },
      { name: "Conseil Supérieur Islamique du Congo", sub_type: "Associations", address: "Av. Alphonse Pemesso - Grand Marché", city: "POINTE-NOIRE", tel: "06 622 18 49 / 04 434 22 43", mail: "csipnk@yahoo.fr" },
      { name: "Forum de Jeunes Entreprises du Congo", sub_type: "Associations", address: "26, Av. de l'Indépandance", city: "POINTE-NOIRE", bp: "4507", tel: "04 466 57 86", mail: "fjecponton@yahoo.fr" },
      { name: "FPU (Fédération pourla Paix Universelle)", sub_type: "Associations", address: "Bd du Général Charles de Gaulle - OCH", city: "POINTE-NOIRE", bp: "4157", tel: "05 539 02 14 / 06 661 81 84", mail: "fpu-pn@yahoo.fr" },
      { name: "Human Association", sub_type: "Associations", address: "Av. Marien Ngouabi - OCH", city: "POINTE-NOIRE", bp: "5999", tel: "05 520 86 96" },
      { name: "INSTITUT DES JEUNES SOURD DE BRAZAVILLE", sub_type: "Associations", address: "Rond-point de la Patte d’Oie", city: "POINTE-NOIRE", bp: "178", tel: "06 678 23 98", mail: "ijsb07@yahoo.fr" },
      { name: "LION’S CLUB EUCALYPTUS", sub_type: "Associations", city: "POINTE-NOIRE" },
      { name: "LION’S CLUB NDJI-NDJI", sub_type: "Associations", city: "POINTE-NOIRE" },
      { name: "MWANA VILLAGES", sub_type: "Associations", address: "Rue de Mboumbissi", city: "POINTE-NOIRE", tel: "01 553 00 07", mail: "info@mwanavillages.org", web: "www.mwanavillages.org" },
      { name: "ROTARY CLUB DOYEN DE POINTE NOIRE (District : 9150)", sub_type: "Associations", address: "Club : 17236", city: "POINTE-NOIRE", bp: "1066", mail: "contact@rotary-pointenoire.org" },
      { name: "SIMCS (Secours International du Mouvement Chrétien pour la Solidarité)", sub_type: "Associations", address: "27, rue Boulolo - OCH", city: "POINTE-NOIRE", bp: "2058", tel: "05 539 65 14 / 06 661 69 90", mail: "cimcs2005@yahoo.fr" },
      { name: "SSPN (Samu Social de Pointe-Noire)", sub_type: "Associations", address: "Bd Bitélika Ndombi - Derrière SN Plasco", city: "POINTE-NOIRE", bp: "1896", tel: "06 629 13 77 / 06 945 67 54", mail: "samusocial.pn@gmail.com" }
    ];

    if (currentCount !== items.length) {
      console.log("Seeding portfolio items for ASSOCIATIONS...");
      // Delete existing items to avoid duplicates if re-seeding
      await db.query("DELETE FROM portfolio_items WHERE category_id = $1", [catId]);
      
      for (const item of items) {
      await db.query(
        `INSERT INTO portfolio_items 
        (category_id, name, sub_type, address, city, bp, tel, fax, mail, web) 
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [catId, item.name, item.sub_type, (item as any).address || null, (item as any).city || null, (item as any).bp || null, (item as any).tel || null, (item as any).fax || null, (item as any).mail || null, (item as any).web || null]
      );
    }
    console.log(`Seeded ${items.length} portfolio items for ASSOCIATIONS`);
  }
} catch (err) {
    console.error("Failed to seed associations items:", err);
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
            sub_type: "Huissiers",
            address: "196, Av. de L'Indépendance - Mahouata",
            city: "POINTE-NOIRE",
            bp: "1617",
            tel: "06 658 28 04",
            fax: "",
            mail: "",
            web: ""
      },
      {
            name: "BAKOUETE Guillaume",
            sub_type: "Avocats",
            address: "32, Av. Emmanuel Dadet",
            city: "POINTE-NOIRE",
            bp: "",
            tel: "05 533 38 68 / 06 661 73 27",
            fax: "",
            mail: "cabgb2007@yahoo.fr",
            web: ""
      },
      {
            name: "BASSAKININA Jean Aimé Boniface",
            sub_type: "Avocats",
            address: "7, Av. Jean Félix Tchicaya - près du Lycée Victor Augagneur",
            city: "POINTE-NOIRE",
            bp: "",
            tel: "06 681 36 28 / 05 770 83 19",
            fax: "",
            mail: "",
            web: ""
      },
      {
            name: "BATCHI André",
            sub_type: "Avocats",
            address: "112, Av. Germain Bicoumat - Imm. Consulat du Bénin",
            city: "POINTE-NOIRE",
            bp: "1277",
            tel: "05 553 88 81 / 04 483 35 75",
            fax: "",
            mail: "cabinet_batchi@yahoo.fr",
            web: ""
      },
      {
            name: "BATIA Paul Bertrand",
            sub_type: "Notaires",
            address: "Bd du Général Charles de Gaulle - Tour Mayombe",
            city: "POINTE-NOIRE",
            bp: "",
            tel: "05 534 46 83 / 06 656 55 49",
            fax: "",
            mail: "",
            web: ""
      },
      {
            name: "BAYANGAMA Roland Serge",
            sub_type: "Avocats",
            address: "1, Av. Raymond Poincaré",
            city: "POINTE-NOIRE",
            bp: "",
            tel: "05 523 69 04 / 06 974 59 31",
            fax: "",
            mail: "rbayangama@yahoo.com",
            web: ""
      },
      {
            name: "BAYONNE Jean Frédéric",
            sub_type: "Huissiers",
            address: "Av. Linguissi tchikaya - Gendarmerie",
            city: "POINTE-NOIRE",
            bp: "247",
            tel: "05 562 56 65 / 06 662 56 65",
            fax: "",
            mail: "",
            web: ""
      },
      {
            name: "BEMBELLY Roland",
            sub_type: "Avocats",
            address: "23, Av. Dr Denis Loemba - Imm. les Manguiers",
            city: "POINTE-NOIRE",
            bp: "208",
            tel: "06 688 62 79 / 05 749 15 17",
            fax: "",
            mail: "rolandbembelly@yahoo.fr",
            web: ""
      },
      {
            name: "BESSOVI Florence",
            sub_type: "Notaires",
            address: "60, Av. Kouanga Makosso",
            city: "POINTE-NOIRE",
            bp: "",
            tel: "05 555 64 54 / 06 628 89 75",
            fax: "",
            mail: "",
            web: ""
      },
      {
            name: "BIGEMI Reine Angèle Patricia",
            sub_type: "Avocats",
            address: "30, rue Gré Zinga",
            city: "POINTE-NOIRE",
            bp: "",
            tel: "05 530 25 24 / 06 638 45 31",
            fax: "",
            mail: "patriciabigemi@yahoo.fr",
            web: ""
      },
      {
            name: "BOMBA MATONGO Aimé",
            sub_type: "Avocats",
            address: "3, rue de Moudzombo - derrière la Grande Poste",
            city: "POINTE-NOIRE",
            bp: "614",
            tel: "06 603 15 17 / 05 603 15 17",
            fax: "",
            mail: "bombamatongo.avocat@yahoo.fr",
            web: ""
      },
      {
            name: "BOUANGA GNIANGAISE Christelle Eliane",
            sub_type: "Notaires",
            address: "368, Bd du Général Charles de Gaulle - Imm. Eric Pressing",
            city: "POINTE-NOIRE",
            bp: "",
            tel: "05 539 37 46 / 06 672 48 78",
            fax: "",
            mail: "",
            web: ""
      },
      {
            name: "BOUYOU Patrick",
            sub_type: "Huissiers",
            address: "98, Av. Schoelcher - Rond Point Gorille",
            city: "POINTE-NOIRE",
            bp: "2297",
            tel: "05 553 57 98",
            fax: "",
            mail: "",
            web: ""
      },
      {
            name: "CABINET COMPTABLE BEMCGQPS",
            sub_type: "Audit et expertise comptable",
            address: "9, rue Tamba - Base Industrielle",
            city: "POINTE-NOIRE",
            bp: "1710",
            tel: "06 671 28 92",
            fax: "",
            mail: "mahoungou4gatien@yahoo.fr",
            web: ""
      },
      {
            name: "CABINET CONSEIL MPK",
            sub_type: "Audit et expertise comptable",
            address: "Av. Emmanuel Dadet",
            city: "POINTE-NOIRE",
            bp: "915",
            tel: "06 663 56 34",
            fax: "",
            mail: "mpiakmahoma@yahoo.fr",
            web: ""
      },
      {
            name: "CABINET KOUZOLO",
            sub_type: "Audit et expertise comptable",
            address: "Av. Marien Ngouabi - Z.I. Km 4",
            city: "POINTE-NOIRE",
            bp: "477",
            tel: "22 294 19 60",
            fax: "22 294 19 61",
            mail: "cabinetkouzolo@yahoo.fr",
            web: ""
      },
      {
            name: "CALLIOPA AFRIQUE",
            sub_type: "Conseil en management",
            address: "Z.I. de la Foire",
            city: "POINTE-NOIRE",
            bp: "5343",
            tel: "05 559 39 81",
            fax: "",
            mail: "",
            web: "www.calliopa.com"
      },
      {
            name: "CARLE Fernand",
            sub_type: "Avocats",
            address: "12-14, Av. Fayette TCHITEMBO",
            city: "POINTE-NOIRE",
            bp: "607",
            tel: "05 557 68 98",
            fax: "",
            mail: "contact@avocats-carle.com",
            web: ""
      },
      {
            name: "DELOITTE TOUCHE TOHMATSU",
            sub_type: "Audit et expertise comptable",
            address: "Bd du Général Charles de Gaulle",
            city: "POINTE-NOIRE",
            bp: "5871",
            tel: "05 714 33 67",
            fax: "",
            mail: "",
            web: "www.deloitte.com"
      },
      {
            name: "DEQUET BOLLO Serge",
            sub_type: "Huissiers",
            address: "9, Av. Agostino Néto",
            city: "POINTE-NOIRE",
            bp: "493",
            tel: "06 674 27 72 / 05 529 88 83",
            fax: "",
            mail: "",
            web: ""
      },
      {
            name: "DIMENA Félix",
            sub_type: "Huissiers",
            address: "79, Av. de la Révolution - REX",
            city: "POINTE-NOIRE",
            bp: "5167",
            tel: "06 664 55 96",
            fax: "",
            mail: "",
            web: ""
      },
      {
            name: "DINAMONA KIDILOU Angélique",
            sub_type: "Notaires",
            address: "Bd du Général Charles de Gaulle",
            city: "POINTE-NOIRE",
            bp: "",
            tel: "05 563 72 06 / 06 672 54 17",
            fax: "",
            mail: "etude.me.dinamona@gmail.com",
            web: ""
      },
      {
            name: "DZONDAULT Raymond Joseph",
            sub_type: "Avocats",
            address: "29, Av. Sergent Malamine - enceinte Alfred Hôtel",
            city: "POINTE-NOIRE",
            bp: "",
            tel: "06 664 18 97",
            fax: "",
            mail: "dzondaultr@yahoo.com",
            web: ""
      },
      {
            name: "ELENGA Anatole",
            sub_type: "Avocats",
            address: "245, Bd du Général Charles de Gaulle - Tour Mayombe - entrée B - 4ème étage",
            city: "POINTE-NOIRE",
            bp: "552",
            tel: "01 980 44 44 / 06 660 78 78",
            fax: "",
            mail: "cabinetaelenga@yahoo.fr",
            web: ""
      },
      {
            name: "ELOHI CONGO",
            sub_type: "Audit et expertise comptable",
            address: "Av. de Djéno - Route de la frontière",
            city: "POINTE-NOIRE",
            bp: "119",
            tel: "05 551 20 66",
            fax: "",
            mail: "",
            web: ""
      },
      {
            name: "ERNST & YOUNG",
            sub_type: "Conseil juridique et fiscal",
            address: "Av. Moé Kaat Matou - Rond-point Kassaï - Tout Miroir, entrée B - 3 ème étage",
            city: "POINTE-NOIRE",
            bp: "5974",
            tel: "05 530 16 22",
            fax: "",
            mail: "ey.pointenoire@cg.ei.com",
            web: ""
      },
      {
            name: "EY/FFA CONGO",
            sub_type: "Conseil juridique et fiscal",
            address: "Av. Moé Kaat Matou - Rond-point Kassaï - Tour Miroir, entrée B - 3 ème étage",
            city: "POINTE-NOIRE",
            bp: "5974",
            tel: "05 530 16 22",
            fax: "",
            mail: "ey.pointenoire@cg.ei.com",
            web: ""
      },
      {
            name: "FIDINTER",
            sub_type: "Audit et expertise comptable",
            address: "Av. de Nguedi",
            city: "POINTE-NOIRE",
            bp: "766",
            tel: "22 294 22 71",
            fax: "22 294 47 26",
            mail: "fid_inter@yahoo.fr",
            web: ""
      },
      {
            name: "FISCONGO",
            sub_type: "Conseil en management",
            address: "Av. Ntandou Youmbi - Imm. PBG",
            city: "POINTE-NOIRE",
            bp: "4349",
            tel: "06 862 66 63",
            fax: "",
            mail: "contact@fiscongo.org",
            web: ""
      },
      {
            name: "FOUTOU DIETRICH Norbert",
            sub_type: "Notaires",
            address: "87, Bd du Général Charles de Gaulle - Imm. Ex Matin",
            city: "POINTE-NOIRE",
            bp: "",
            tel: "05 559 13 59 / 06 952 51 44",
            fax: "",
            mail: "",
            web: ""
      },
      {
            name: "GNALI GOMES Yvon François Dominique",
            sub_type: "Notaires",
            address: "Bd du Général Charles de Gaulle -Tour Mayombe",
            city: "POINTE-NOIRE",
            bp: "",
            tel: "05 559 72 72 / 06 659 72 72",
            fax: "",
            mail: "etudegnali_gomes@yahoo.fr",
            web: ""
      },
      {
            name: "GNITOU Benjamin",
            sub_type: "Huissiers",
            address: "8, rue Tibassa",
            city: "POINTE-NOIRE",
            bp: "4351",
            tel: "06 666 74 15",
            fax: "",
            mail: "",
            web: ""
      },
      {
            name: "GOMA Marcel",
            sub_type: "Avocats",
            address: "122, Av. Moé Kaat Matou - Imm. NAF NAF",
            city: "POINTE-NOIRE",
            bp: "8119",
            tel: "05 553 01 09",
            fax: "",
            mail: "gomamarcel@yahoo.fr",
            web: ""
      },
      {
            name: "GOMA TCHIBINDA Romuald",
            sub_type: "Huissiers",
            address: "87, Bd du Général Charles de Gaulle",
            city: "POINTE-NOIRE",
            bp: "",
            tel: "06 663 41 75 / 05 593 21 02",
            fax: "",
            mail: "",
            web: ""
      },
      {
            name: "GOMES Alexis Vincent",
            sub_type: "Avocats",
            address: "23, Av. Dr Denis LOEMBA - Imm. les Manguiers",
            city: "POINTE-NOIRE",
            bp: "542",
            tel: "05 550 86 95",
            fax: "",
            mail: "agomes7372@aol.com",
            web: ""
      },
      {
            name: "GOUEMBE OKEMBA Lin Brice",
            sub_type: "Avocats",
            address: "Rue de Pili-Kondi - Route de la Radio - Imm. Les Palmiers - App. Bananes",
            city: "POINTE-NOIRE",
            bp: "",
            tel: "06 670 31 19",
            fax: "",
            mail: "okemba-lbo@yahoo.fr",
            web: ""
      },
      {
            name: "IBOUANGA Jean Luc",
            sub_type: "Avocats",
            address: "12-14, Av. Fayette Tchitembo",
            city: "POINTE-NOIRE",
            bp: "607",
            tel: "05 523 69 49",
            fax: "",
            mail: "jli437@yahoo.fr",
            web: ""
      },
      {
            name: "IDO POATY Hugues",
            sub_type: "Notaires",
            address: "Bd Moé Kaat Matou - Lumumba",
            city: "POINTE-NOIRE",
            bp: "",
            tel: "05 534 11 92 / 06 631 14 17",
            fax: "",
            mail: "",
            web: ""
      },
      {
            name: "KADINA Jean Pétril",
            sub_type: "Huissiers",
            address: "9, Av. Agostino Néto",
            city: "POINTE-NOIRE",
            bp: "",
            tel: "06 674 27 72",
            fax: "",
            mail: "",
            web: ""
      },
      {
            name: "KALINA MENGA Lionel",
            sub_type: "Avocats",
            address: "245, Bd du Général Charles de Gaulle - Tour Mayombe - entrée B - 9ème étage",
            city: "POINTE-NOIRE",
            bp: "4261",
            tel: "05 543 72 94 / 06 857 74 74",
            fax: "",
            mail: "lionelkalina76@gmail.com",
            web: ""
      },
      {
            name: "KEYA NSANGA Emile",
            sub_type: "Huissiers",
            address: "30, Av. Moe Kaat Matou - Lumumba",
            city: "POINTE-NOIRE",
            bp: "",
            tel: "05 522 06 69",
            fax: "",
            mail: "",
            web: ""
      },
      {
            name: "KIBAKANA Alphonse",
            sub_type: "Huissiers",
            address: "Rond Point Kassaï",
            city: "POINTE-NOIRE",
            bp: "1450",
            tel: "06 666 74 62",
            fax: "",
            mail: "",
            web: ""
      },
      {
            name: "KIDZE Simone",
            sub_type: "Huissiers",
            address: "Av. Marien Ngouabi",
            city: "POINTE-NOIRE",
            bp: "1042",
            tel: "05 553 08 34",
            fax: "",
            mail: "",
            web: ""
      },
      {
            name: "KIMBI Pierre",
            sub_type: "Huissiers",
            address: "Rue de Dzoumouta",
            city: "POINTE-NOIRE",
            bp: "",
            tel: "06 663 60 44 / 05 551 96 44",
            fax: "",
            mail: "",
            web: ""
      },
      {
            name: "KOUBAKA Audy",
            sub_type: "Huissiers",
            address: "93, Bd du Général Charles de Gaulle",
            city: "POINTE-NOIRE",
            bp: "4224",
            tel: "05 570 17 10",
            fax: "",
            mail: "",
            web: ""
      },
      {
            name: "KOUTOU Brislaine",
            sub_type: "Notaires",
            address: "93, Bd Moé Kaat Matou - Lumumba",
            city: "POINTE-NOIRE",
            bp: "",
            tel: "06 657 45 55",
            fax: "",
            mail: "",
            web: ""
      },
      {
            name: "LABARRE Jean Louis",
            sub_type: "Avocats",
            address: "Rue Mboubissi",
            city: "POINTE-NOIRE",
            bp: "",
            tel: "06 989 77 33 / 05 553 55 60",
            fax: "",
            mail: "labarrejl@yahoo.fr",
            web: ""
      },
      {
            name: "LANDZE MBERE Rock Dieudonné",
            sub_type: "Huissiers",
            address: "63, Av. Félix Tchicaya - Grand Marché",
            city: "POINTE-NOIRE",
            bp: "",
            tel: "06 662 89 55 / 05 540 55 66",
            fax: "",
            mail: "",
            web: ""
      },
      {
            name: "LAVIE MIENANDY Aimé Joseph",
            sub_type: "Avocats",
            address: "171, Av. Fayette Tchitembo - Imm. Eglise Evangélique - 1er étage",
            city: "POINTE-NOIRE",
            bp: "",
            tel: "06 664 24 78 / 05 761 27 97",
            fax: "",
            mail: "laviemienandy@yahoo.fr",
            web: ""
      },
      {
            name: "LIKIBI Jean",
            sub_type: "Avocats",
            address: "102, Av. Felix Tchicaya",
            city: "POINTE-NOIRE",
            bp: "5214",
            tel: "05 553 13 39 / 06 940 20 09",
            fax: "",
            mail: "jean.likibi@yahoo.fr",
            web: ""
      },
      {
            name: "LINVANI Parfait Euloge",
            sub_type: "Avocats",
            address: "21, Av. Dr Denis Loemba - Imm. les Manguiers",
            city: "POINTE-NOIRE",
            bp: "",
            tel: "05 549 24 07",
            fax: "",
            mail: "parfaitlinvani@hotmail.com",
            web: ""
      },
      {
            name: "LOEMBA Chantal Paule",
            sub_type: "Avocats",
            address: "133, Av. du 13 août - Imm. Presbytère Saint-Pierre",
            city: "POINTE-NOIRE",
            bp: "4610",
            tel: "06 667 07 96 / 05 748 99 62",
            fax: "",
            mail: "cpauloemba@yahoo.fr",
            web: ""
      },
      {
            name: "LOEMBET SAMBOU Berthe Candelle",
            sub_type: "Notaires",
            address: "Bd du Général Charles de Gaulle",
            city: "POINTE-NOIRE",
            bp: "",
            tel: "06 674 88 00",
            fax: "",
            mail: "",
            web: ""
      },
      {
            name: "LOUBOTA François",
            sub_type: "Notaires",
            address: "Bd du Général Charles de Gaulle - Tour Mayombe",
            city: "POINTE-NOIRE",
            bp: "",
            tel: "05 553 12 95 / 06 653 12 95",
            fax: "",
            mail: "",
            web: ""
      },
      {
            name: "LOUZINGOU BAVOURINSI Saint Auttrey",
            sub_type: "Huissiers",
            address: "23, Av. Moé Kaat Matou",
            city: "POINTE-NOIRE",
            bp: "4492",
            tel: "06 672 32 72 / 05 553 00 90",
            fax: "",
            mail: "",
            web: ""
      },
      {
            name: "M3B AUDIT & CONSEIL",
            sub_type: "Audit et expertise comptable",
            address: "Bd du Général Charles de Gaulle - Tour Mayombe",
            city: "POINTE-NOIRE",
            bp: "4854",
            tel: "06 679 91 53",
            fax: "",
            mail: "secretariat@m3b-auditexpertise.com",
            web: ""
      },
      {
            name: "MABIALA Pierre",
            sub_type: "Avocats",
            address: "245, Bd du Général Charles de Gaulle - Tour Mayombe - entrée A - 7ème étage",
            city: "POINTE-NOIRE",
            bp: "",
            tel: "05 553 11 26",
            fax: "",
            mail: "pierremabiala@yahoo.fr",
            web: ""
      },
      {
            name: "MADASSOU Brtrand Rodolphe",
            sub_type: "Huissiers",
            address: "55, Av. Louis Portella - ROY",
            city: "POINTE-NOIRE",
            bp: "911",
            tel: "05 553 67 87 / 06 652 61 57",
            fax: "",
            mail: "",
            web: ""
      },
      {
            name: "MAKANDA Patrick",
            sub_type: "Huissiers",
            address: "Av. de la Révolution - REX",
            city: "POINTE-NOIRE",
            bp: "",
            tel: "06 674 68 14",
            fax: "",
            mail: "",
            web: ""
      },
      {
            name: "MAKAYA BALHOU Hugues Anicet",
            sub_type: "Notaires",
            address: "Bd du Général Charles de Gaulle - Imm. CNSS - Porte 303",
            city: "POINTE-NOIRE",
            bp: "",
            tel: "05 557 44 10 / 06 653 40 35",
            fax: "",
            mail: "",
            web: ""
      },
      {
            name: "MAKELA Claude Bernard",
            sub_type: "Huissiers",
            address: "79, Av. de la Révolution - REX",
            city: "POINTE-NOIRE",
            bp: "5167",
            tel: "06 661 77 23 / 05 584 63 22",
            fax: "",
            mail: "",
            web: ""
      },
      {
            name: "MAKOSSO Fernand",
            sub_type: "Huissiers",
            address: "23, Av. Moé Vangoula",
            city: "POINTE-NOIRE",
            bp: "4957",
            tel: "05 553 10 25",
            fax: "",
            mail: "",
            web: ""
      },
      {
            name: "MASSELO Maurice",
            sub_type: "Notaires",
            address: "140, Av. Benoît Loembet - Z.I. KM4",
            city: "POINTE-NOIRE",
            bp: "",
            tel: "06 667 00 66 / 06 672 69 72",
            fax: "",
            mail: "",
            web: ""
      },
      {
            name: "MAYENGUE Thomas Fortuné",
            sub_type: "Huissiers",
            address: "Av. Linguissi Tchicaya",
            city: "POINTE-NOIRE",
            bp: "247",
            tel: "05 553 05 99 / 06 669 57 24",
            fax: "",
            mail: "",
            web: ""
      },
      {
            name: "MBEMBA Christel",
            sub_type: "Huissiers",
            address: "9, Av. Agostino Néto",
            city: "POINTE-NOIRE",
            bp: "493",
            tel: "06 671 99 81 / 05 590 24 58",
            fax: "",
            mail: "",
            web: ""
      },
      {
            name: "MBEMBA LOZY Marie Paule",
            sub_type: "Avocats",
            address: "104, Av. Moé Kaat Matou - Imm. Masseke",
            city: "POINTE-NOIRE",
            bp: "5910",
            tel: "06 664 21 87 / 04 432 09 05",
            fax: "",
            mail: "cab-avocatmbembalozy@yahoo.fr",
            web: ""
      },
      {
            name: "MBOUNGOU Servais Patrick",
            sub_type: "Huissiers",
            address: "26, Av. Moé Vangoula",
            city: "POINTE-NOIRE",
            bp: "",
            tel: "06 666 66 83 / 05 587 03 14",
            fax: "",
            mail: "",
            web: ""
      },
      {
            name: "MENDES-TCHIBA José",
            sub_type: "Avocats",
            address: "42, Av. Moé Vangoula - face stade Anselmi - Imm. Ex. OCB",
            city: "POINTE-NOIRE",
            bp: "516",
            tel: "06 653 82 08",
            fax: "",
            mail: "cabinetmendes@yahoo.fr",
            web: ""
      },
      {
            name: "MFOUMBI Hervé Blanchard",
            sub_type: "Huissiers",
            address: "Rue de Dzoumouta",
            city: "POINTE-NOIRE",
            bp: "",
            tel: "05 551 96 44 / 06 663 60 44",
            fax: "",
            mail: "",
            web: ""
      },
      {
            name: "MIKOUNNGUILT Eugénie",
            sub_type: "Huissiers",
            address: "Bd du Général Charles de Gaulle",
            city: "POINTE-NOIRE",
            bp: "982",
            tel: "05 557 08 59",
            fax: "",
            mail: "",
            web: ""
      },
      {
            name: "MISSAMOU Guy Maixent",
            sub_type: "Avocats",
            address: "Bd. Marien Ngouabi - à la Pharmacie du Château",
            city: "POINTE-NOIRE",
            bp: "2491",
            tel: "05 534 69 55",
            fax: "",
            mail: "mguymaixent1972@yahoo.fr",
            web: ""
      },
      {
            name: "MITOLO Joachim",
            sub_type: "Huissiers",
            address: "63, Av. Félix Tchicaya - Quartier de la Révolution",
            city: "POINTE-NOIRE",
            bp: "",
            tel: "05 557 45 12",
            fax: "",
            mail: "",
            web: ""
      },
      {
            name: "MLOR GROUPE",
            sub_type: "Audit et expertise comptable",
            address: "Av. de l'Aéroport - Face pharmacie Longchamp",
            city: "POINTE-NOIRE",
            bp: "1127",
            tel: "05 714 31 74",
            fax: "",
            mail: "groupe-mlor@hotmail.fr",
            web: ""
      },
      {
            name: "MOSSA Gaston",
            sub_type: "Avocats",
            address: "Bd du Général Charles de Gaulle - Imm. CNSS - entrée B - 1er étage",
            city: "POINTE-NOIRE",
            bp: "1970",
            tel: "06 664 23 53",
            fax: "",
            mail: "cabinetmossa@yahoo.fr",
            web: ""
      },
      {
            name: "MOUBEMBE Justin Joseph",
            sub_type: "Avocats",
            address: "182, Av. Dr Moe Poaty",
            city: "POINTE-NOIRE",
            bp: "",
            tel: "06 664 84 37",
            fax: "",
            mail: "mmoubembe@yahoo.fr",
            web: ""
      },
      {
            name: "MOUDILA Hermine Carole",
            sub_type: "Huissiers",
            address: "196, Av. Marien Ngouabi",
            city: "POINTE-NOIRE",
            bp: "1431",
            tel: "05 557 32 63",
            fax: "",
            mail: "",
            web: ""
      },
      {
            name: "MOUKALA PEPE Jacques",
            sub_type: "Huissiers",
            address: "Av. Jean Félix Tchicaya - Bakadila",
            city: "POINTE-NOIRE",
            bp: "",
            tel: "05 559 98 49",
            fax: "",
            mail: "",
            web: ""
      },
      {
            name: "MOUNTOU Noël",
            sub_type: "Notaires",
            address: "Bd du Général Charles de Gaulle - Imm. CNSS - Porte 303",
            city: "POINTE-NOIRE",
            bp: "",
            tel: "06 660 81 10",
            fax: "",
            mail: "noelmountou@yahoo.fr",
            web: ""
      },
      {
            name: "MOUSSASSI KOUMBA Favien",
            sub_type: "Huissiers",
            address: "Imm. Ex Clinique Keur Massa",
            city: "POINTE-NOIRE",
            bp: "360",
            tel: "05 557 09 71",
            fax: "",
            mail: "",
            web: ""
      },
      {
            name: "MOUWENGUET Gilbert",
            sub_type: "Huissiers",
            address: "196, Av. de L'Indépendance - Mahouata",
            city: "POINTE-NOIRE",
            bp: "1716",
            tel: "05 553 03 74",
            fax: "",
            mail: "",
            web: ""
      },
      {
            name: "MOUYECKET NGANA Sylvie Nicole",
            sub_type: "Avocats",
            address: "1, Av. Raymond Poincaré - Rond Point ex Casino - au dessus du Central Bar",
            city: "POINTE-NOIRE",
            bp: "5316",
            tel: "05 553 47 47 / 06 664 34 06",
            fax: "",
            mail: "cabmouyecket@yahoo.fr",
            web: ""
      },
      {
            name: "MPENA Guy",
            sub_type: "Huissiers",
            address: "97, Av. Marien Ngouabi - KM 4",
            city: "POINTE-NOIRE",
            bp: "2384",
            tel: "06 664 49 55 / 05 575 16 63",
            fax: "",
            mail: "",
            web: ""
      },
      {
            name: "MPOUKOU Jean Bruno",
            sub_type: "Huissiers",
            address: "37, Av. Raymond Paillet - Quartier Chic",
            city: "POINTE-NOIRE",
            bp: "1880",
            tel: "05 557 13 50",
            fax: "",
            mail: "",
            web: ""
      },
      {
            name: "MVOUAMA KIYINDOU Blandine",
            sub_type: "Huissiers",
            address: "Rue Nkeni - Mahouata",
            city: "POINTE-NOIRE",
            bp: "1880",
            tel: "06 643 15 72",
            fax: "",
            mail: "",
            web: ""
      },
      {
            name: "MVOUMBI Didier Christophe",
            sub_type: "Avocats",
            address: "Rue Bikondolo - vers la Bourse du Travail",
            city: "POINTE-NOIRE",
            bp: "1474",
            tel: "05 533 38 68",
            fax: "",
            mail: "mvoumbi_christophe@yahoo.fr",
            web: ""
      },
      {
            name: "M’FOUTOU Célestin",
            sub_type: "Avocats",
            address: "Bd du Général Charles de Gaulle - Imm. CNSS - entrée A - 6ème étage",
            city: "POINTE-NOIRE",
            bp: "4287",
            tel: "05 521 46 03 / 06 621 46 03",
            fax: "",
            mail: "mfoutou_celestin@yahoo.fr",
            web: ""
      },
      {
            name: "NGANGA KOLYARDO Eulalie",
            sub_type: "Avocats",
            address: "Av. du 13 Août - Imm. Galerie - 1er étage - Presbytère St Pierre",
            city: "POINTE-NOIRE",
            bp: "",
            tel: "05 553 39 51 / 06 679 23 17",
            fax: "",
            mail: "eulaliekolyardo@yahoo.fr",
            web: ""
      },
      {
            name: "NGAVOUKA Marcel",
            sub_type: "Notaires",
            address: "29 bis, rue Dr Moé Poati",
            city: "POINTE-NOIRE",
            bp: "",
            tel: "06 664 12 94 / 04 440 22 84",
            fax: "",
            mail: "",
            web: ""
      },
      {
            name: "NGOMBI Laurent",
            sub_type: "Avocats",
            address: "245, Bd du Général Charles de Gaulle - Tour Mayombe - entrée B - 6ème étage",
            city: "POINTE-NOIRE",
            bp: "4296",
            tel: "06 667 98 19 / 05 520 17 81",
            fax: "",
            mail: "cabinet.ngombi@yahoo.fr",
            web: ""
      },
      {
            name: "NGOUALA Jean Serge",
            sub_type: "Avocats",
            address: "101, Av. Marien Ngouabi",
            city: "POINTE-NOIRE",
            bp: "5526",
            tel: "06 661 89 93",
            fax: "",
            mail: "",
            web: ""
      },
      {
            name: "NGOUNDA Augustin",
            sub_type: "Avocats",
            address: "64, Av. Moé Kaat Matou - derrière le Magasin DEVIL",
            city: "POINTE-NOIRE",
            bp: "165",
            tel: "05 553 55 87 / 06 827 12 40",
            fax: "",
            mail: "augustinngounda@yahoo.fr",
            web: ""
      },
      {
            name: "NIATI TSATY Serge",
            sub_type: "Notaires",
            address: "Bd de Loango - Zone Portuaire - Imm. Socotra",
            city: "POINTE-NOIRE",
            bp: "",
            tel: "05 553 79 24",
            fax: "",
            mail: "",
            web: ""
      },
      {
            name: "NIMI Jean",
            sub_type: "Huissiers",
            address: "132, Av. Moé Pratt - Mahouata",
            city: "POINTE-NOIRE",
            bp: "74792",
            tel: "05 514 90 60",
            fax: "",
            mail: "",
            web: ""
      },
      {
            name: "NIOUTOU Nicolas",
            sub_type: "Avocats",
            address: "101, Av. Marien Ngouabi",
            city: "POINTE-NOIRE",
            bp: "",
            tel: "05 553 68 12",
            fax: "",
            mail: "maitrenicolasnioutou@yahoo.fr",
            web: ""
      },
      {
            name: "NZALAKANDA Fulbert",
            sub_type: "Avocats",
            address: "639, Av. Bitélika Ndombi - Aéroport",
            city: "POINTE-NOIRE",
            bp: "5787",
            tel: "05 553 92 11",
            fax: "",
            mail: "cabinet_avocatnzalakanda@yahoo.fr",
            web: ""
      },
      {
            name: "NZAOU Didier Crescent",
            sub_type: "Avocats",
            address: "1, Rue Addis Abéba",
            city: "POINTE-NOIRE",
            bp: "",
            tel: "05 529 17 97 / 06 678 37 43",
            fax: "",
            mail: "nzaoudidier@yahoo.fr",
            web: ""
      },
      {
            name: "OKO Roger",
            sub_type: "Avocats",
            address: "25, Av. Barthelemy Boganganda",
            city: "POINTE-NOIRE",
            bp: "",
            tel: "05 521 52 56",
            fax: "",
            mail: "cabinetrogeroko@yahoo.fr",
            web: ""
      },
      {
            name: "ONGOUNDOU Armand",
            sub_type: "Avocats",
            address: "Av. de l’indépendance - Rond Point Sympathique - Imm. DEMBO - 1er étage.",
            city: "POINTE-NOIRE",
            bp: "",
            tel: "05 553 30 75 / 06 971 00 81",
            fax: "",
            mail: "aongoundou@yahoo.fr",
            web: ""
      },
      {
            name: "OTIELI EUSTACHE Marius Iliche",
            sub_type: "Huissiers",
            address: "92, Bd du Général Charles de Gaulle - Face Evêché",
            city: "POINTE-NOIRE",
            bp: "2241",
            tel: "05 564 63 09 / 06 650 19 20",
            fax: "",
            mail: "",
            web: ""
      },
      {
            name: "PAKA Claude Joël",
            sub_type: "Avocats",
            address: "19, Av. Jacques Opangault",
            city: "POINTE-NOIRE",
            bp: "565",
            tel: "05 557 71 38 / 06 664 56 46",
            fax: "",
            mail: "claudelinkat@gmail.com",
            web: ""
      },
      {
            name: "PAMBO Guy Leonard",
            sub_type: "Avocats",
            address: "Rue Bikondolo - vers la Bourse du Travail",
            city: "POINTE-NOIRE",
            bp: "",
            tel: "05 531 38 81",
            fax: "",
            mail: "guypambo@yahoo.fr",
            web: ""
      },
      {
            name: "PENA PITRA Gilles",
            sub_type: "Avocats",
            address: "245, Bd du Général Charles de Gaulle - Tour Mayombe - entrée B - 4ème étage",
            city: "POINTE-NOIRE",
            bp: "5460",
            tel: "05 553 19 99",
            fax: "",
            mail: "",
            web: ""
      },
      {
            name: "POPA OSSEBI",
            sub_type: "Huissiers",
            address: "bd du Général Charles de Gaulle - Imm. ex Air Afrique",
            city: "POINTE-NOIRE",
            bp: "",
            tel: "06 667 20 16",
            fax: "",
            mail: "",
            web: ""
      },
      {
            name: "PRICEWATERHOUSECOOPERS (PWC)",
            sub_type: "Audit et expertise comptable",
            address: "88, bd du Général Charles de Gaulle",
            city: "POINTE-NOIRE",
            bp: "1306",
            tel: "05 534 09 07",
            fax: "22 294 23 24",
            mail: "pricewaterhousecoopers.congo@cg.pwc.com",
            web: ""
      },
      {
            name: "REFERENCE CONSULTING (RECO)",
            sub_type: "Conseil juridique et fiscal",
            address: "Route de la Frontière - Ngoyo - face Agricongo",
            city: "POINTE-NOIRE",
            bp: "929",
            tel: "06 899 82 72",
            fax: "",
            mail: "referenceconsultingsarl@yahoo.fr",
            web: ""
      },
      {
            name: "SAFOU Bienvenue Jean Rodrigue",
            sub_type: "Huissiers",
            address: "11, Av. de L'Indépendance - Sympathique",
            city: "POINTE-NOIRE",
            bp: "2680",
            tel: "06 624 18 98 / 05 553 01 20",
            fax: "",
            mail: "",
            web: ""
      },
      {
            name: "SATH COMPACT Judicaël",
            sub_type: "Huissiers",
            address: "Av. Stéphane Tchitchelle",
            city: "POINTE-NOIRE",
            bp: "",
            tel: "05 569 43 77",
            fax: "",
            mail: "",
            web: ""
      },
      {
            name: "SENGA Magloire",
            sub_type: "Avocats",
            address: "871, Av. Jean Félix Tchicaya - la Base",
            city: "POINTE-NOIRE",
            bp: "1336",
            tel: "06 974 58 81 / 05 559 74 62",
            fax: "",
            mail: "sengamag@yahoo.fr",
            web: ""
      },
      {
            name: "SUTTER & PEARCE",
            sub_type: "Conseil juridique et fiscal",
            address: "Bd de Loango - Imm. PBG 2ème étage",
            city: "POINTE-NOIRE",
            bp: "",
            tel: "06 655 43 43",
            fax: "",
            mail: "sp-cg@sutter-pearce.com",
            web: "www.sutter-pearce.com"
      },
      {
            name: "TADI Isabelle Honorine",
            sub_type: "Huissiers",
            address: "101, Av. Marien Ngouabi - KM 4",
            city: "POINTE-NOIRE",
            bp: "",
            tel: "05 557 75 76",
            fax: "",
            mail: "",
            web: ""
      },
      {
            name: "TCHCAMBOUD Simon-Yves",
            sub_type: "Avocats",
            address: "23, Av. Dr Denis Loemba - Imm. les Manguiers",
            city: "POINTE-NOIRE",
            bp: "542",
            tel: "05 557 26 42",
            fax: "",
            mail: "sytchicson@yahoo.fr",
            web: ""
      },
      {
            name: "TCHICAYA Anicet Placide",
            sub_type: "Huissiers",
            address: "Bd du Général Charles de Gaulle",
            city: "POINTE-NOIRE",
            bp: "4957",
            tel: "05 506 75 06 / 06 674 70 91",
            fax: "",
            mail: "",
            web: ""
      },
      {
            name: "TCHICAYA NOMBO Rock",
            sub_type: "Huissiers",
            address: "92, Bd du Général Charles de Gaulle",
            city: "POINTE-NOIRE",
            bp: "2241",
            tel: "06 631 68 24",
            fax: "",
            mail: "",
            web: ""
      },
      {
            name: "TCHISSAMBOU Jean Serge",
            sub_type: "Avocats",
            address: "Impasse Nganga - Fofolo en face Hôpital des Armées",
            city: "POINTE-NOIRE",
            bp: "5454",
            tel: "06 666 66 52",
            fax: "",
            mail: "jstchissambou@yahoo.fr",
            web: ""
      },
      {
            name: "TSALA Michel",
            sub_type: "Avocats",
            address: "9, Av. Dr Denis Loemba - Imm. ARC",
            city: "POINTE-NOIRE",
            bp: "5385",
            tel: "06 659 18 15 / 05 557 90 17",
            fax: "",
            mail: "avocat_tsalamichel@yahoo.com",
            web: ""
      },
      {
            name: "TSAMBA Alain Ludovic",
            sub_type: "Avocats",
            address: "245, Bd du Général Charles de Gaulle - Tour Mayombe - entrée A - 7ème étage",
            city: "POINTE-NOIRE",
            bp: "244",
            tel: "05 521 37 12 / 06 669 86 70",
            fax: "",
            mail: "tsambalain@yahoo.fr",
            web: ""
      },
      {
            name: "TSATY BOUNGOU Destin Arsène",
            sub_type: "Avocats",
            address: "Bd du Général Charles de Gaulle, Imm. CNSS - entrée A - 3ème étage - Porte 204",
            city: "POINTE-NOIRE",
            bp: "5526",
            tel: "05 528 13 16 / 05 563 82 75",
            fax: "",
            mail: "mboutsid@gmail.com",
            web: ""
      },
      {
            name: "WALEMBO Magloire Hervé",
            sub_type: "Huissiers",
            address: "127, Av. de L'Emeraude",
            city: "POINTE-NOIRE",
            bp: "",
            tel: "06 666 76 40 / 05 517 59 25",
            fax: "",
            mail: "",
            web: ""
      },
      {
            name: "ZOLA MABONZO André Placide",
            sub_type: "Avocats",
            address: "Bd du Général Charles de Gaulle - Imm. CNSS - entrée A - 6ème étage",
            city: "POINTE-NOIRE",
            bp: "5442",
            tel: "05 553 32 84",
            fax: "",
            mail: "zola_mabonzo@yahoo.fr",
            web: ""
      },
      {
            name: "NGOMA Hilaire",
            sub_type: "Avocats",
            address: "3, Av. de la Révolution",
            city: "NKAYI",
            bp: "",
            tel: "05 539 97 05",
            fax: "",
            mail: "brevierre@yahoo.fr",
            web: ""
      },
      {
            name: "NZOULOU Germain",
            sub_type: "Avocats",
            address: "Quartier Monfleuri",
            city: "DOLISIE",
            bp: "88",
            tel: "06 947 85 32",
            fax: "",
            mail: "germainavocat@yahoo.fr",
            web: ""
      }
];

    const itemsCountResult = await db.query("SELECT COUNT(*) as count FROM portfolio_items WHERE category_id = $1", [catId]);
    const currentCount = parseInt(itemsCountResult.rows[0].count);

    if (true || currentCount !== items.length) {
      console.log(`Seeding ASSISTANCE JURIDIQUE, COMPTABLE ET FISCALE (${items.length} items)...`);
      await db.query("DELETE FROM portfolio_items WHERE category_id = $1", [catId]);
    } else {
      return;
    }

    for (const item of items) {
      await db.query(
        `INSERT INTO portfolio_items 
        (category_id, name, sub_type, address, city, bp, tel, fax, mail, web) 
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [catId, item.name, item.sub_type, (item as any).address || null, (item as any).city || null, (item as any).bp || null, (item as any).tel || null, (item as any).fax || null, (item as any).mail || null, (item as any).web || null]
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
    const currentCount = parseInt(itemsCountResult.rows[0].count);

    const items = [
      // Brazzaville
      { name: "2I (International Insurance)", sub_type: "Courtiers", address: "Av. des Trois Martyrs", city: "BRAZZAVILLE", bp: "2032", tel: "01 027 93 85" },
      { name: "AGC (Assurance Générale du Congo)", sub_type: "Compagnies d'assurances", address: "Av. Amilcar Cabral", city: "BRAZZAVILLE", bp: "1110", tel: "06 918 93 00", web: "www.agccongo.com" },
      { name: "ALLIANZ AGENT GÉNÉRAL DIOKSON", sub_type: "Courtiers", address: "1416, av. de Loutassi", city: "BRAZZAVILLE", tel: "06 404 99 30", mail: "allianz.congo@allianz-cg.com", web: "www.allianz-cg.com" },
      { name: "ARC (Assurance et Réassurance du Congo)", sub_type: "Compagnies d'assurances", address: "Av. du Camp", city: "BRAZZAVILLE", bp: "14524", tel: "22 281 16 90", web: "www.arc-congo.cg" },
      { name: "ASCOMA", sub_type: "Courtiers", address: "Bd Denis Sassou Nguesso - Imm. Mucodec - 2ème étage", city: "BRAZZAVILLE", tel: "05 530 13 69", mail: "brazzaville@ascoma.com", web: "www.ascoma.com" },
      { name: "AZIMUT ASSURANCES", sub_type: "Courtiers", address: "129, rue de Reims - Imm. Ebatha - 2ème étage", city: "BRAZZAVILLE", tel: "06 664 87 36 / 05 527 08 98" },
      { name: "CCDE", sub_type: "Courtiers", address: "Av. Maréchal Foch", city: "BRAZZAVILLE", bp: "13117", tel: "22 281 17 63" },
      { name: "COLINA CONGO SA", sub_type: "Compagnies d'assurances", address: "5, av. Maréchal Lyautey", city: "BRAZZAVILLE", bp: "79", tel: "22 260 15 15 / 06 510 45 24", mail: "sahamcongo@sahamassurance.com" },
      { name: "FINASS 2G", sub_type: "Courtiers", address: "101, rue Lamothe", city: "BRAZZAVILLE", bp: "13589", tel: "06 668 10 98", mail: "financieresunies@outlouk.fr" },
      { name: "GLOBAL CONSEIL & ASSURANCES", sub_type: "Courtiers", address: "72, av. des Trois martyrs", city: "BRAZZAVILLE", bp: "14715", tel: "06 872 17 41 / 05 348 78 66", mail: "a.globalconseil@yahoo.fr" },
      { name: "GLOBALYS ASSURANCES", sub_type: "Courtiers", address: "Av. de l'OUA", city: "BRAZZAVILLE", bp: "14171", tel: "06 678 18 16 / 05 378 60 00" },
      { name: "GRAMON ASSURANCES", sub_type: "Courtiers", address: "231, av. du Général de Gaulle", city: "BRAZZAVILLE", tel: "05 577 80 80", mail: "soussap@yahoo.fr" },
      { name: "GRAS SAVOYE CONGO", sub_type: "Courtiers", address: "Av. William Guynet", city: "BRAZZAVILLE", tel: "05 551 16 24", mail: "secretariat.bzv@cg.grassavoye.com" },
      { name: "H DE B CONGO", sub_type: "Courtiers", address: "Av. Amilcar Cabral - Imm. City Center", city: "BRAZZAVILLE", bp: "14843", tel: "06 608 98 51" },
      { name: "LA SPIRALE ASSURANCES", sub_type: "Courtiers", address: "53 bis, rue Makoko - Poto-Poto", city: "BRAZZAVILLE", tel: "06 606 72 72" },
      { name: "MK ASSURANCES", sub_type: "Courtiers", address: "72, bd Denis Sassou Nguesso", city: "BRAZZAVILLE", tel: "05 551 95 90", mail: "jeanaurelienkoko@yahoo.fr", web: "www.ag-djefson.com" },
      { name: "NET CONSEILS", sub_type: "Courtiers", address: "1, rue Bouzal - Cité des 17", city: "BRAZZAVILLE", tel: "01 050 10 57 / 06 800 29 74" },
      { name: "NSIA ASSURANCES", sub_type: "Compagnies d'assurances", address: "1, av. Maréchal Foch", city: "BRAZZAVILLE", bp: "1151", tel: "22 282 24 92", fax: "22 282 24 93", mail: "nsiacongo@groupensia.com", web: "www.groupensia.com" },
      { name: "ROYAL ASSURANCES", sub_type: "Courtiers", address: "724, av. Matsoua - Bacongo", city: "BRAZZAVILLE", tel: "06 657 62 08 / 05 520 18 14" },

      // Pointe-Noire
      { name: "2I (International Insurance)", sub_type: "Courtiers", address: "Bd du Général Charles de Gaulle", city: "POINTE-NOIRE", bp: "630", tel: "06 670 91 62" },
      { name: "ADVENTIS ASSURANCES CONSEILS", sub_type: "Courtiers", address: "73, av. de l'Indépendance", city: "POINTE-NOIRE", tel: "06 664 28 80" },
      { name: "AFRICO", sub_type: "Courtiers", address: "26, av. Barthélémy Boganga", city: "POINTE-NOIRE", bp: "437", tel: "06 999 18 10", mail: "africo_assur@yahoo.fr" },
      { name: "AGC (Assurance Générale du Congo)", sub_type: "Compagnies d'assurances", address: "Av. de Nguédi", city: "POINTE-NOIRE", bp: "796", tel: "05 530 07 77", web: "www.agccongo.com" },
      { name: "ALLIANZ CONGO ASSURANCES", sub_type: "Compagnies d'assurances", address: "Bd du Général Charles de Gaulle - Imm. Ebatha", city: "POINTE-NOIRE", bp: "340", tel: "05 032 12 60 / 05 601 12 00", mail: "allianz.congo@allianz-cg.com", web: "www.allianz-cg.com" },
      { name: "ASCOMA", sub_type: "Courtiers", address: "Bd du Général Charles de Gaulle", city: "POINTE-NOIRE", bp: "681", tel: "05 530 13 14 / 06 656 56 56", mail: "congo@ascoma.com", web: "www.ascoma.com" },
      { name: "ASSUR LE MILLÉNAIRE", sub_type: "Courtiers", address: "Bd Moé Kaat Matou - à coté CCF", city: "POINTE-NOIRE", bp: "5882", tel: "06 651 03 63 / 01 031 59 59", mail: "assurlemillenaire_sarl@yahoo.fr" },
      { name: "ASSUR PEOPLE", sub_type: "Courtiers", address: "Bd du Général Charles de Gaulle", city: "POINTE-NOIRE", bp: "5575", tel: "05 553 64 25 / 06 660 73 44" },
      { name: "CEMIC (Cabinet d’Expertise Maritime et Industrielle du Congo)", sub_type: "Experts, expertise douanière et maritimes", address: "Av. de Bordeaux - Enceinte Port", city: "POINTE-NOIRE", bp: "4808", tel: "05 573 69 13", mail: "cemic.congo@yahoo.fr" },
      { name: "COLINA CONGO SA", sub_type: "Compagnies d'assurances", address: "43, Av. de Mafouka", city: "POINTE-NOIRE", bp: "79", tel: "22 260 15 15 / 06 510 45 24", mail: "sahamcongo@sahamassurance.com" },
      { name: "GÉNÉRAL SERVICES DISTRI", sub_type: "Experts, expertise douanière et maritimes", city: "POINTE-NOIRE", bp: "5178", tel: "06 664 42 15" },
      { name: "GLENN ASSURANCES", sub_type: "Courtiers", address: "250, av. de l'Indépendance", city: "POINTE-NOIRE", bp: "4081", tel: "06 931 23 18 / 06 622 89 45" },
      { name: "GRAMON ASSURANCES", sub_type: "Courtiers", address: "28, av. Mpanzou - Imm. Congo Telecom", city: "POINTE-NOIRE", tel: "05 557 02 57 / 06 639 77 52", mail: "gramon.assurances@gmail.com" },
      { name: "GRAS SAVOYE CONGO", sub_type: "Courtiers", address: "118, av. Fayette Tchitembo", city: "POINTE-NOIRE", bp: "1901", tel: "06 667 12 12 / 05 530 03 60", mail: "secretariat.pnr@cg.grassavoye.com" },
      { name: "H de B CONGO", sub_type: "Courtiers", address: "Bd du Général Charles de Gaulle - Galerie Hôtel Olympic Palace", city: "POINTE-NOIRE", bp: "2124", tel: "05 512 46 10", mail: "contactpnr@hdebcongo.com", web: "www.hdebcongto.com" },
      { name: "LOÏC ASSURANCES CONSEIL", sub_type: "Courtiers", address: "Av. Moé Pratt - Grand Marché", city: "POINTE-NOIRE", tel: "05 553 73 58" },
      { name: "NSIA ASSURANCES", sub_type: "Compagnies d'assurances", address: "Rond-point Kassaï", city: "POINTE-NOIRE", bp: "1108", tel: "22 282 24 92", fax: "22 282 24 92", mail: "nsiacongo@groupensia.com", web: "www.groupensia.com" }
    ];

    if (currentCount !== items.length) {
      console.log("Seeding portfolio items for ASSURANCES...");
      // Delete existing items to avoid duplicates if re-seeding
      await db.query("DELETE FROM portfolio_items WHERE category_id = $1", [catId]);

      for (const item of items) {
        await db.query(
          `INSERT INTO portfolio_items 
          (category_id, name, sub_type, address, city, bp, tel, fax, mail, web) 
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [catId, item.name, item.sub_type, (item as any).address || null, (item as any).city || null, (item as any).bp || null, (item as any).tel || null, (item as any).fax || null, (item as any).mail || null, (item as any).web || null]
        );
      }
      console.log(`Seeded ${items.length} portfolio items for ASSURANCES`);
    }
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
    const currentCount = parseInt(itemsCountResult.rows[0].count);

    const items = [
      // Brazzaville
      { name: "AFRI PLAQUE", sub_type: "Contrôle technique et plaques d'Immatriculation", address: "Av. des Trois Martyrs - Plateau des 15 ans", city: "BRAZZAVILLE", tel: "06 630 30 00" },
      { name: "AUTO ÉCOLE KILOMÈTRE", sub_type: "Auto-écoles", address: "731, av. de l'OUA - Bacongo", city: "BRAZZAVILLE", tel: "05 551 50 75" },
      { name: "AUTO ÉCOLE STAN", sub_type: "Auto-écoles", address: "61, av. des Trois Martyrs - Ouenzé", city: "BRAZZAVILLE", bp: "298", tel: "05 551 10 05", fax: "22 281 53 84" },
      { name: "AUTO STARS", sub_type: "Accessoires - Pièces détachées", address: "84, rue du Campement - Ouenzé", city: "BRAZZAVILLE", tel: "05 532 20 39" },
      { name: "AUTO TOP", sub_type: "Location de voitures", address: "2203, av. Amilcar Cabral", city: "BRAZZAVILLE", bp: "1405", tel: "06 613 00 00 / 05 513 00 00" },
      { name: "CAR MOBIL", sub_type: "Location de voitures", address: "Av. Amilcar Cabral", city: "BRAZZAVILLE", tel: "06 619 13 49 / 06 685 69 69", mail: "carmobil242@gmail.com" },
      { name: "CFAO MOTORS CONGO", sub_type: "Concessionnaires - Garages", address: "Bd Denis Sassou Nguesso - Mpila", city: "BRAZZAVILLE", bp: "247", tel: "05 550 17 78 / 06 665 44 65", fax: "22 281 06 78", web: "www.cfaomotors-congo.com" },
      { name: "CFAO MOTORS CONGO (Avis)", sub_type: "Location de voitures", address: "Bd Denis Sassou Nguesso - Mpila", city: "BRAZZAVILLE", bp: "247", tel: "05 550 17 78 / 06 665 44 65", fax: "22 281 06 78", web: "www.cfaomotors-congo.com" },
      { name: "COM SERVICE", sub_type: "Location de voitures", address: "Av. Félix Eboué - Mpila", city: "BRAZZAVILLE", tel: "06 627 77 77", fax: "22 281 36 38" },
      { name: "ETS FKS", sub_type: "Concessionnaires - Garages", address: "91, av. Boueta Bongo - Moungali", city: "BRAZZAVILLE", tel: "05 786 77 88 / 04 420 28 28" },
      { name: "ETS GAZ SERVICE AUTO", sub_type: "Concessionnaires - Garages", address: "85, rue Owando - Ouenzé", city: "BRAZZAVILLE", bp: "5394", tel: "06 951 44 06 / 05 551 92 32" },
      { name: "ETS NOVAFRIC", sub_type: "Accessoires - Pièces détachées", address: "84, rue Gamboma - Moungali", city: "BRAZZAVILLE", tel: "05 700 49 49 / 06 664 78 83" },
      { name: "EUROTECH", sub_type: "Accessoires - Pièces détachées", address: "38, rue Bandas - Poto-Poto", city: "BRAZZAVILLE", tel: "06 856 96 96 / 05 610 05 05", mail: "direction.eurotech@hotmail.com" },
      { name: "GARAGE LA BOUSSOLE", sub_type: "Concessionnaires - Garages", address: "4, av. de M'Foa - Poto-Poto", city: "BRAZZAVILLE", tel: "05 551 83 02 / 06 621 55 76" },
      { name: "GARAGE PLUS", sub_type: "Concessionnaires - Garages", address: "115, bd Maréchal Lyautey - OCH", city: "BRAZZAVILLE", bp: "2179", tel: "05 330 03 00 / 05 531 31 31", mail: "bassamaliyounes@outlook.com" },
      { name: "GENSERV", sub_type: "Accessoires - Pièces détachées", address: "Av. Orsy - Rond-point de la Gare", city: "BRAZZAVILLE", tel: "04 400 00 05", mail: "etsgenserv@aol.com" },
      { name: "GMAD CONGO", sub_type: "Concessionnaires - Garages", address: "54, av. Félix Eboué", city: "BRAZZAVILLE", tel: "01 047 00 00 / 05 557 99 88", mail: "info@gmad-congo.com" },
      { name: "GN SA LEMAI (Europcar)", sub_type: "Concessionnaires - Garages", address: "Av. du Camp", city: "BRAZZAVILLE", tel: "05 769 22 22", mail: "europcarcongo@yahoo.fr" },
      { name: "GN SA LEMAI (Europcar)", sub_type: "Location de voitures", address: "Av. du Camp", city: "BRAZZAVILLE", tel: "05 769 22 22", mail: "europcarcongo@yahoo.fr" },
      { name: "GRASSET SPORAFRIC", sub_type: "Concessionnaires - Garages", address: "Av. Willam Guynet", city: "BRAZZAVILLE", bp: "334", tel: "22 281 08 53", mail: "brazza@sporafric.net", web: "www.sporafric.net" },
      { name: "HSIET CONGO DEVELOPPEMENT SARL", sub_type: "Concessionnaires - Garages", address: "Av. de la Pointe Hollandaise - Ouenzé", city: "BRAZZAVILLE", tel: "06 631 19 66", mail: "zhao.nan@hsiet.com.cn", web: "www.hsiet.com.cn" },
      { name: "KELLY’S", sub_type: "Location de voitures", address: "Av. de Loutassi - Plateau des 15 ans", city: "BRAZZAVILLE", tel: "06 500 00 11 / 06 500 00 12", mail: "kelysauto@gmail.com" },
      { name: "MA FLORENCE TRANSPORT", sub_type: "Location de voitures", address: "46, av. de la Tsiéme - Ouenzé", city: "BRAZZAVILLE", tel: "06 934 49 05 / 05 556 56 37", mail: "maflorence.autolocation@gmail.com" },
      { name: "SCCT", sub_type: "Contrôle technique et plaques d'Immatriculation", address: "Av. de Loutassi - Moungali", city: "BRAZZAVILLE", tel: "01 900 12 10" },
      { name: "SMT CONGO", sub_type: "Concessionnaires - Garages", address: "Av. Bayardelle - Impasse Airtel", city: "BRAZZAVILLE", tel: "05 754 95 38", web: "www.smt-congo.com" },
      { name: "SOPORISE AUTOMOBILE", sub_type: "Concessionnaires - Garages", address: "209, rue Mboko - Ouenzé", city: "BRAZZAVILLE", tel: "06 666 46 86 / 05 558 22 53", mail: "soparisauto@yahoo.fr" },
      { name: "TRACTAFRIC MOTORS", sub_type: "Accessoires - Pièces détachées", address: "118, av. Edith Lucie Bongo - Mpila", city: "BRAZZAVILLE", bp: "113", tel: "06 979 93 30", web: "www.tractafrictmc-congo.com" },
      { name: "TRACTAFRIC MOTORS", sub_type: "Concessionnaires - Garages", address: "118, av. Edith Lucie Bongo - Mpila", city: "BRAZZAVILLE", bp: "113", tel: "06 679 93 30", web: "www.tractafrictmc-congo.com" },

      // Pointe-Noire
      { name: "AFRI PLAQUE", sub_type: "Contrôle technique et plaques d'Immatriculation", address: "Av. de l'Indépendance - Mahouata", city: "POINTE-NOIRE", tel: "05 558 66 75 / 06 620 99 57" },
      { name: "AUTO CLIMA CONGO", sub_type: "Concessionnaires - Garages", address: "Av. François Charles", city: "POINTE-NOIRE", tel: "05 559 39 44" },
      { name: "AUTO ÉCOLE KRYS", sub_type: "Auto-écoles", address: "Av. de Ma Loango - Nkouikou", city: "POINTE-NOIRE", tel: "05 563 70 63 / 06 664 28 62" },
      { name: "AUTO ÉCOLE MORAIS", sub_type: "Auto-écoles", address: "840, av. Marien Ngouabi - OCH", city: "POINTE-NOIRE", bp: "399", tel: "05 797 75 85 / 06 980 51 27" },
      { name: "AUTO ÉCOLE NDJI-NDJI", sub_type: "Auto-écoles", address: "Av. de l'Indépendance - Mahouata", city: "POINTE-NOIRE", tel: "05 567 09 77 / 06 674 24 11" },
      { name: "AUTO ÉCOLE RACINE", sub_type: "Auto-écoles", address: "Av. de Djéno - Tchimbamba", city: "POINTE-NOIRE", tel: "05 571 22 30" },
      { name: "AUTO ÉCOLE STAN", sub_type: "Auto-écoles", address: "Av. de Ma Loango - Matende", city: "POINTE-NOIRE", tel: "05 551 10 05" },
      { name: "AUTO ÉCOLE SUZINA", sub_type: "Auto-écoles", address: "Av. Jacques Opangault - Face à la Foire", city: "POINTE-NOIRE", tel: "05 320 45 53", portable: "06 573 07 70" },
      { name: "AWA AUTO", sub_type: "Accessoires - Pièces détachées", address: "22, av. Blanche Gomez", city: "POINTE-NOIRE", tel: "05 553 29 55 / 06 620 72 59" },
      { name: "BONHEUR AUTO ACCESSOIRES", sub_type: "Accessoires - Pièces détachées", address: "Av. Schoelcher - Rond-point Gorille", city: "POINTE-NOIRE", tel: "06 645 62 70 / 04 437 37 39" },
      { name: "CAREX SERVICES", sub_type: "Concessionnaires - Garages", address: "Bd de Loango - Base Industrielle", city: "POINTE-NOIRE", bp: "1131", tel: "05 529 27 26", mail: "info@carex-congo.com", web: "www.carex-congo.com" },
      { name: "CAREX SERVICES", sub_type: "Location de voitures", address: "Bd Loango - Base Industrielle", city: "POINTE-NOIRE", bp: "873", tel: "05 529 27 26", mail: "carexservices@ymail.com", web: "www.carex-congo.com" },
      { name: "CENTURY MOTORS Sarl", sub_type: "Concessionnaires - Garages", address: "Av. Bitélika Ndombi - Aéroport", city: "POINTE-NOIRE", tel: "05 620 10 10", mail: "info@century-motors.com" },
      { name: "CFAO MOTORS CONGO", sub_type: "Concessionnaires - Garages", address: "13, rue Côte Matève - Zone Portuaire", city: "POINTE-NOIRE", bp: "1110", tel: "05 550 17 78 / 06 665 44 65", fax: "22 294 36 36", mail: "mengambe@cfao.com", web: "www.cfaomotors-congo.com" },
      { name: "CFAO MOTORS CONGO (Avis)", sub_type: "Location de voitures", address: "13, rue Côte Matève - Zone Portuaire", city: "POINTE-NOIRE", bp: "1110", tel: "05 550 17 78 / 06 665 44 65", fax: "22 294 36 26", mail: "mengambe@cfao.com", web: "www.cfaomotors-congo.com" },
      { name: "CLINIC AUTO", sub_type: "Concessionnaires - Garages", address: "Av. Amilcar Cabral", city: "POINTE-NOIRE", tel: "06 628 01 99 / 05 595 32 32", mail: "clinic_auto1@hotmail.com", web: "www.clinicauto.com" },
      { name: "CONGO AUTOMOBILES S.A", sub_type: "Accessoires - Pièces détachées", address: "Rond-point Kassaï", city: "POINTE-NOIRE", bp: "1131", tel: "22 294 42 19 / 05 553 61 11", mail: "congoauto@yahoo.fr" },
      { name: "CONGO AUTOMOBILES S.A", sub_type: "Concessionnaires - Garages", address: "Rond-point Kassaï", city: "POINTE-NOIRE", bp: "1131", tel: "22 294 42 19", mail: "congoauto@yahoo.fr" },
      { name: "CONSULTING BUSINESS GROUP", sub_type: "Location de voitures", address: "120, rue Ngouedi", city: "POINTE-NOIRE", bp: "1783", tel: "04 005 46 38 / 04 005 46 53", mail: "alcontact@cbg-congo.com" },
      { name: "DANDAL SERVICES", sub_type: "Contrôle technique et plaques d'Immatriculation", address: "Rue Alphonse Pemesso", city: "POINTE-NOIRE", tel: "04 442 06 32" },
      { name: "DD AUTO", sub_type: "Accessoires - Pièces détachées", address: "Av. de l'Indépendance - Roy", city: "POINTE-NOIRE", tel: "05 520 06 18 / 06 667 12 33" },
      { name: "DIMA CONSTRUCTION SARL", sub_type: "Concessionnaires - Garages", address: "92, av. Tchicaya Utsami - Mpita", city: "POINTE-NOIRE", tel: "06 880 30 30", mail: "dima.congo@hotmail.com" },
      { name: "DIVERCO", sub_type: "Accessoires - Pièces détachées", address: "Bd Moé Kaat Matou", city: "POINTE-NOIRE", bp: "1111", tel: "06 661 86 12", mail: "diver_co@yahoo.fr" },
      { name: "EFM MULTI – SERVICES CONGO", sub_type: "Concessionnaires - Garages", address: "Av. du Mayombe - Mpita - à côté Restaurant \"Sous le Manguier\"", city: "POINTE-NOIRE", bp: "4799", tel: "06 529 71 13", mail: "efmmultiservice@gmail.com" },
      { name: "ÉLÉGANCE ACCESSOIRES", sub_type: "Accessoires - Pièces détachées", address: "Av. de l'Indépendance - Rond-point Mahouata", city: "POINTE-NOIRE", bp: "2702", tel: "06 684 66 66" },
      { name: "EQUATEUR BUSINESS INTERNATIONAL", sub_type: "Location de voitures", address: "Av. Gustave Ondziel", city: "POINTE-NOIRE", bp: "590", tel: "22 294 00 90", mail: "info@equabusiness.com" },
      { name: "ETS ALY MOBILE", sub_type: "Location de voitures", address: "Av. de Massafi - Base Industrielle", city: "POINTE-NOIRE", bp: "1855", tel: "05 557 02 30 / 05 535 59 59", mail: "ets_aly-mobile@hotmail.com" },
      { name: "ETS AUTO DUO", sub_type: "Accessoires - Pièces détachées", address: "Av. de l'indépendance - Mahouata", city: "POINTE-NOIRE", bp: "5428", tel: "05 707 14 88 / 06 631 07 39", mail: "autoduo2000@yahoo.fr" },
      { name: "ETS INFINITY MOTORS", sub_type: "Accessoires - Pièces détachées", address: "247, av. de l'Indépendance - Roy", city: "POINTE-NOIRE", tel: "05 553 21 48 / 06 661 95 91" },
      { name: "ETS JAPON AUTO", sub_type: "Accessoires - Pièces détachées", address: "250, av. de l'Indépendance - Feu Roy", city: "POINTE-NOIRE", tel: "05 533 10 14 / 06 633 08 15", mail: "infinityz2001@yahoo.co.uk" },
      { name: "ETS NAX-AUTO", sub_type: "Accessoires - Pièces détachées", address: "Av. Ma Loango", city: "POINTE-NOIRE", tel: "06 994 21 21 / 04 435 36 46" },
      { name: "EUROTECH", sub_type: "Accessoires - Pièces détachées", address: "Av. Bitélika Ndombi - Rond-point Davum", city: "POINTE-NOIRE", bp: "237", tel: "06 900 05 05 / 06 600 00 06", mail: "direction.eurotech@hotmail.com" },
      { name: "FACAR CONGO", sub_type: "Concessionnaires - Garages", address: "Av. Amilcar Cabral - face 3M", city: "POINTE-NOIRE", tel: "05 500 60 86 / 06 800 60 86", mail: "congo@facargroup.com", web: "www.facargroup.com" },
      { name: "GARAGE BADEN BADEN", sub_type: "Concessionnaires - Garages", address: "20, av. Théophile Mbemba", city: "POINTE-NOIRE", bp: "4149", tel: "05 553 11 09" },
      { name: "GENERAL LEASING CONGO", sub_type: "Location de voitures", address: "Av. du Havre - Z.I. de la Foire - face base Total E&P", city: "POINTE-NOIRE", tel: "05 600 33 33", mail: "myriem.badjadi@generaleasing.com", web: "www.generaleasing.com" },
      { name: "GN SA LEMAI (Europcar)", sub_type: "Concessionnaires - Garages", address: "Av. Bitélika Ndombi - Z.I. Km 4", city: "POINTE-NOIRE", tel: "06 666 26 26", mail: "europcarcongo@yahoo.fr" },
      { name: "GN SA LEMAI (Europcar)", sub_type: "Location de voitures", address: "Av. Bitélika Ndombi - Z.I. Km 4", city: "POINTE-NOIRE", tel: "06 666 26 26", mail: "europcarcongo@yahoo.fr" },
      { name: "GRASSET SPORAFRIC", sub_type: "Accessoires - Pièces détachées", address: "Av. Georges Dumond", city: "POINTE-NOIRE", bp: "624", tel: "06 662 13 13 / 06 628 39 39", mail: "contact@sporafric.net", web: "www.sporafric.net" },
      { name: "SCTK (SOCIÉTÉ DE CONTRÔLE TECHNIQUE DU KOUILOU)", sub_type: "Contrôle technique et plaques d'Immatriculation", address: "Av. Stéphane Tchitchelle, enceinte Brométo", city: "POINTE-NOIRE", tel: "22 294 34 10 - 04 431 16 22", mail: "dg.sctk@yahoo.fr" },
      { name: "SILOTEC CONGO", sub_type: "Contrôle technique et plaques d'Immatriculation", address: "Av. Jean-Félix Tchicaya, la Base", city: "POINTE-NOIRE", portable: "05 552 10 18", mail: "silotec.pnr@silotec-congo.com" },
      { name: "SMT CONGO", sub_type: "Concessionnaires - Garages", address: "Av. Bitélika Ndombi", city: "POINTE-NOIRE", tel: "06 508 27 13", web: "www.smt-congo.com" },
      { name: "SOCIETE GARAGE SONGOLO", sub_type: "Concessionnaires - Garages", address: "409, av. Jacques Opangault - Songolo", city: "POINTE-NOIRE", tel: "05 315 15 97 / 01 223 08 21", mail: "garagesongolocongo@yahoo.com" },
      { name: "STAN SERVICES", sub_type: "Contrôle technique et plaques d'Immatriculation", address: "Av. Ma loango - Matendé", city: "POINTE-NOIRE", tel: "05 551 10 05" },
      { name: "STAR CHL", sub_type: "Contrôle technique et plaques d'Immatriculation", address: "799, Av. de l'Indépendance", city: "POINTE-NOIRE", bp: "4767", tel: "05 558 37 70 / 06 676 88 70", mail: "etslisa@yahoo.fr" },
      { name: "TOP ACCESSOIRES", sub_type: "Accessoires - Pièces détachées", address: "53, Av. Mâ Loango - Rond-point Roy", city: "POINTE-NOIRE", tel: "06 636 72 80 / 05 568 90 69", mail: "autostarauto@yahoo.fr" },
      { name: "TRACTAFRIC MOTORS", sub_type: "Accessoires - Pièces détachées", address: "697, Bd Marien Ngouabi", city: "POINTE-NOIRE", tel: "05 521 31 32 / 06 665 40 30", web: "www.tractafrictmc-congo.com" },
      { name: "TRACTAFRIC MOTORS", sub_type: "Concessionnaires - Garages", address: "697, bd Marien Ngouabi", city: "POINTE-NOIRE", tel: "05 521 31 32 / 06 665 40 30", web: "www.tractafrictmc-congo.com" }
    ];

    if (currentCount !== items.length) {
      console.log("Seeding portfolio items for AUTOMOBILES...");
      // Delete existing items to avoid duplicates if re-seeding
      await db.query("DELETE FROM portfolio_items WHERE category_id = $1", [catId]);

      for (const item of items) {
        await db.query(
          `INSERT INTO portfolio_items 
          (category_id, name, sub_type, address, city, bp, tel, fax, mail, web) 
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [catId, item.name, item.sub_type, (item as any).address || null, (item as any).city || null, (item as any).bp || null, (item as any).tel || null, (item as any).fax || null, (item as any).mail || null, (item as any).web || null]
        );
      }
      console.log(`Seeded ${items.length} portfolio items for AUTOMOBILES`);
    }
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
    const currentCount = parseInt(itemsCountResult.rows[0].count);

    const items = [
      // Brazzaville
      { name: "BANQUE POSTALE DU CONGO – Siège Social", sub_type: "Banques", address: "Bd Denis Sassou Nguesso - Rond-point de la Poste", city: "BRAZZAVILLE", bp: "37", tel: "06 503 65 23", mail: "serviceclients@banquepostale-congo.com", web: "www.banquepostale-congo.com" },
      { name: "BCH (Banque Congolaise de l’Habitat)", sub_type: "Banques", address: "Av. Amilcar Cabral", city: "BRAZZAVILLE", bp: "987", tel: "22 281 25 88", mail: "bch@bch.cg", web: "www.bch.cg" },
      { name: "BCI (Banque Commerciale Internationale) – Siège Social", sub_type: "Banques", address: "Av. Amilcar Cabral", city: "BRAZZAVILLE", bp: "147", tel: "22 281 58 33", fax: "22 281 03 73", web: "www.bci.banquepopulaire.com" },
      { name: "BDEAC (Banque de Développement des États de l’Afrique Centrale)", sub_type: "Banques", address: "Bd Denis Sassou Nguesso", city: "BRAZZAVILLE", bp: "1177", tel: "04 426 83 00 / 06 652 96 70", fax: "22 281 18 80", mail: "bdeac@bdeac.org", web: "www.bdeac.org" },
      { name: "BEAC (Banque des États de l’Afrique Centrale)", sub_type: "Banques", address: "Av. Sergent Malamine", city: "BRAZZAVILLE", bp: "126", tel: "22 281 10 73", fax: "22 281 10 94", mail: "beacbzv@beac.int", web: "www.beac.int" },
      { name: "BESCO (Banque Esperito Santo Congo)", sub_type: "Banques", address: "Av. Amilcar Cabral", city: "BRAZZAVILLE", bp: "2057", tel: "05 310 87 87 / 06 606 61 61" },
      { name: "BGFI BANK – Agence Atlas", sub_type: "Banques", city: "BRAZZAVILLE", mail: "agence.atlas@bgfi.com" },
      { name: "BGFI BANK – Agence Monzoto", sub_type: "Banques", city: "BRAZZAVILLE", mail: "agence.monzoto@bgfi.com" },
      { name: "BGFI BANK – Agence Proxima", sub_type: "Banques", address: "Bd Denis Sassou Nguesso, centre-ville", city: "BRAZZAVILLE", bp: "14579", tel: "05 505 17 39", mail: "agence.proxima@bgfi.com" },
      { name: "BGFI BANK Siège social et Direction Générale", sub_type: "Banques", address: "Bd Denis Sassou Nguesso, centre-ville", city: "BRAZZAVILLE", bp: "14579", tel: "06 632 65 05", mail: "siege_brazzaville@bgfi.com" },
      { name: "BSCA (Banque Sino Congolaise pour l’Afrique)", sub_type: "Banques", address: "Av. de l'Amitié", city: "BRAZZAVILLE", bp: "199", tel: "22 330 38 88 / 89", mail: "service@bscabank.com", web: "www.bscabank.com" },
      { name: "CAPPED", sub_type: "Crédit - Micro finance", address: "90, rue Mossaka - Ouenzé", city: "BRAZZAVILLE", tel: "06 670 20 14", mail: "cappedbzv@yahoo.fr", web: "www.capped-cg.org" },
      { name: "CLM BRAZZA CENTRE", sub_type: "Banques", address: "Av. William Guynet", city: "BRAZZAVILLE", tel: "06 987 20 21" },
      { name: "CMF (Congolaise de Microfinance)", sub_type: "Crédit - Micro finance", address: "48 bis, av. de France - Poto-Poto", city: "BRAZZAVILLE", tel: "06 638 44 07", mail: "comifi_brazza@yahoo.fr" },
      { name: "CRÉDIT DU CONGO", sub_type: "Banques", address: "Av. Amilcar Cabral", city: "BRAZZAVILLE", bp: "2470", tel: "05 550 30 33 / 06 660 54 51", web: "www.creditducongo.com" },
      { name: "ECOBANK – Siège Social", sub_type: "Banques", address: "Av. Amilcar Cabral - Imm. ARC - 3ème étage", city: "BRAZZAVILLE", bp: "2485", tel: "04 444 05 05", mail: "ecobankcg@ecobank.com", web: "www.ecobank.com" },
      { name: "EXPRESS UNION CONGO S.A. – Siège Social", sub_type: "Transfert d'argent et bureaux de change", address: "Av. de la Paix - Poto-Poto", city: "BRAZZAVILLE", bp: "2393", tel: "06 916 32 25", mail: "eusacongobrazza@expressunion.net" },
      { name: "FÉDÉRATION DES MUCODEC", sub_type: "Banques", address: "Bd Denis Sassou Nguesso - Grande Gare", city: "BRAZZAVILLE", bp: "13237", tel: "06 987 90 00 / 05 547 90 00", mail: "contact@mucodec.com" },
      { name: "GROUPE CHARDEN FARELL", sub_type: "Transfert d'argent et bureaux de change", address: "Av. Amilcar Cabral - Imm. City Center", city: "BRAZZAVILLE", tel: "05 555 32 80 / 06 662 55 42", web: "www.gcfcongo.com" },
      { name: "KIMEX INTERNATIONAL", sub_type: "Transfert d'argent et bureaux de change", address: "Av. Amilcar Cabral - Imm. ARC - 2ème étage", city: "BRAZZAVILLE", bp: "13161", tel: "05 551 18 96", mail: "kimexinternational@yahoo.fr" },
      { name: "LCB (La Congolaise de Banque)", sub_type: "Banques", address: "Av. Amilcar Cabral", city: "BRAZZAVILLE", bp: "2889", tel: "05 310 11 57 / 93", fax: "22 281 09 77", web: "www.lacongolaisedebanque.com" },
      { name: "S2C (Société de Change du Congo)", sub_type: "Transfert d'argent et bureaux de change", address: "Av. Sergent Malamine", city: "BRAZZAVILLE", bp: "2669", tel: "22 281 47 02", fax: "22 281 47 65", mail: "societedechangeducongo@yahoo.fr" },
      { name: "SERFIN SA", sub_type: "Transfert d'argent et bureaux de change", address: "67, av. Nelson Mandéla - Hôtel Mikhael's", city: "BRAZZAVILLE", tel: "05 573 03 53 / 06 660 94 70", mail: "kserfin@gmail.com" },
      { name: "SOCIÉTÉ GÉNÉRALE CONGO", sub_type: "Banques", address: "Av. Amilcar Cabral", city: "BRAZZAVILLE", bp: "598", tel: "06 504 22 22 / 05 593 91 91", web: "www.societegenerale.cg" },
      { name: "SOCIÉTÉ SIKAR – FINANCE (Money Gram)", sub_type: "Transfert d'argent et bureaux de change", address: "Bd Maréchal Lyautey - OCH", city: "BRAZZAVILLE", tel: "22 281 12 96 / 06 664 10 16" },
      { name: "UBA (United Bank of Africa) – Siège Social", sub_type: "Banques", address: "Av. William Guynet", city: "BRAZZAVILLE", tel: "06 923 60 98 / 05 364 46 35", web: "www.ubagroup.com" },
      { name: "YVALANDA", sub_type: "Transfert d'argent et bureaux de change", address: "27, rue Bacongo - Poto-Poto", city: "BRAZZAVILLE", tel: "05 592 49 20 / 06 671 58 16" },

      // Pointe-Noire
      { name: "AFRICHANGE", sub_type: "Transfert d'argent et bureaux de change", address: "71, av. Schœlcher - Grand Marché", city: "POINTE-NOIRE", bp: "2042", tel: "06 631 14 96 / 05 557 01 46", mail: "africhange@africhange-cg.com", web: "www.africhange-cg.com" },
      { name: "BANQUE POSTALE DU CONGO", sub_type: "Banques", address: "Bd Moé Kaat Matou", city: "POINTE-NOIRE", bp: "701", tel: "06 508 10 49 / 06 875 08 80", mail: "serviceclients@banquepostale-congo.com", web: "www.banquepostale-congo.com" },
      { name: "BCH (Banque Congolaise de L’Habitat)", sub_type: "Banques", address: "388, bd du Général Charles de Gaulle", city: "POINTE-NOIRE", bp: "1254", tel: "06 508 24 28 / 29", mail: "bch@bch.cg", web: "www.bch.cg" },
      { name: "BCI (Banque Commerciale Internationale)", sub_type: "Banques", address: "226, bd du Général Charles de Gaulle", city: "POINTE-NOIRE", bp: "661", tel: "05 517 32 92 / 06 953 72 72", web: "www.bci.banquepopulaire.com" },
      { name: "BEAC (Banque des États de l’Afrique Centrale)", sub_type: "Banques", address: "Rue de Mbena", city: "POINTE-NOIRE", bp: "751", tel: "22 294 07 68 / 22 294 21 90", web: "www.beac.int" },
      { name: "BGFI BANK – Agence Alhena", sub_type: "Banques", city: "POINTE-NOIRE", bp: "610", tel: "06 931 70 04 6", mail: "agence.alhena@bgfi.com" },
      { name: "BGFI BANK – Agence Altaïr", sub_type: "Banques", city: "POINTE-NOIRE", mail: "agence.altaîr@bgfi.com" },
      { name: "BGFI BANK – Centre d’Affaires d’Entreprises", sub_type: "Banques", city: "POINTE-NOIRE", mail: "agence.centreaffairepnr@bgfi.com" },
      { name: "BGFI BANK Agence Agena", sub_type: "Banques", address: "26 av. Marien Ngouabi, face Préfecture", city: "POINTE-NOIRE", bp: "610", tel: "05 505 17 95", mail: "agence.centreaffairepnr@bgfi.com" },
      { name: "CAISSE CONGOLAISE D’ÉPARGNE ET DE CRÉDIT", sub_type: "Banques", address: "Av. de l'Indépendance - Tié-Tié", city: "POINTE-NOIRE", tel: "04 452 32 00", mail: "ccec2007@yahoo.fr" },
      { name: "CIFED", sub_type: "Crédit - Micro finance", address: "Av. de L'Indépendance - Tié- Tié", city: "POINTE-NOIRE", tel: "06 663 30 42 / 05 563 64 61" },
      { name: "COMIFI", sub_type: "Crédit - Micro finance", address: "Bd Moé Kaat Matou", city: "POINTE-NOIRE", bp: "5163", tel: "06 674 87 30 / 05 557 84 86", mail: "comifi_brazza@yahoo.fr" },
      { name: "CRÉDIT DU CONGO – Agence Centre-Ville", sub_type: "Banques", address: "Av. Emmanuel Dadet", city: "POINTE-NOIRE", bp: "1312", tel: "06 671 12 12", web: "www.creditducongo.com" },
      { name: "CRÉDIT MUPROCOM", sub_type: "Crédit - Micro finance", address: "Av. de L'Indépendance - Tié-Tié", city: "POINTE-NOIRE", tel: "06 664 58 16 / 06 663 55 77" },
      { name: "ECOBANK – Agence Centre-Ville", sub_type: "Banques", address: "Bd du Général Charles de Gaulle", city: "POINTE-NOIRE", bp: "1219", tel: "06 622 01 01 / 05 569 54 54", mail: "ecobankcg@ecobank.com", web: "www.ecobank.com" },
      { name: "EXPRESS UNION CONGO S.A. – Centre-Ville", sub_type: "Transfert d'argent et bureaux de change", address: "Av. de le République - Grand Marché", city: "POINTE-NOIRE", tel: "06 916 32 25 / 06 962 06 00", mail: "eubrazza@expressunion.net" },
      { name: "FÉDÉRATION DES MUCODEC", sub_type: "Banques", address: "Bd du Général Charles de Gaulle", city: "POINTE-NOIRE", bp: "5909", tel: "06 987 90 80 / 05 547 90 80", mail: "secretariat.pnr@mucodec.com" },
      { name: "FÉDÉRATION DES MUCODEC", sub_type: "Crédit - Micro finance", address: "388, bd du Général Charles de Gaulle", city: "POINTE-NOIRE", bp: "5909", tel: "06 987 90 80 / 05 547 90 80", mail: "secretariat.pnr@mucodec.com" },
      { name: "GROUPE CHARDEN FARELL", sub_type: "Transfert d'argent et bureaux de change", address: "180, av. de l'Indépendance - Rond-point Mahouata", city: "POINTE-NOIRE", bp: "4391", tel: "06 630 99 55 / 05 594 06 06", web: "www.gcfcongo.com" },
      { name: "LCB (La Congolaise de Banque) Agence Centre-Ville", sub_type: "Banques", address: "3, bd du Général Charles de Gaulle", city: "POINTE-NOIRE", bp: "881", tel: "05 310 11 89", mail: "lcbcongo@yahoo.fr", web: "www.lacongolaisedebanque.com" },
      { name: "SOCIÉTÉ GÉNÉRALE CONGO", sub_type: "Banques", address: "Bd du Général Charles de Gaulle - Vers Rond-point Kassaï", city: "POINTE-NOIRE", bp: "598", tel: "06 504 88 88 / 06 504 00 00", web: "www.societegenerale.cg" },
      { name: "SODECCO (Société d’Épargne et de Crédit du Congo)", sub_type: "Crédit - Micro finance", address: "Av. Alphonse Pemosso - Grand Marché", city: "POINTE-NOIRE", bp: "847", tel: "05 023 81 99 / 06 917 74 06", mail: "sodecco@yahoo.fr" },
      { name: "UBA (United Bank of Africa)", sub_type: "Banques", address: "Bd du Général Charles de Gaulle - Face Hôtel Atlantic", city: "POINTE-NOIRE", tel: "06 609 42 47", web: "www.ubagroup.com" },

      // Autres localités
      { name: "BANQUE POSTALE DU CONGO", sub_type: "Banques", address: "Place de la Gare - Imm. Ex ONPT", city: "DOLISIE", tel: "06 677 67 12", mail: "serviceclients@banquepostale-congo.com", web: "www.banquepostale-congo.com" },
      { name: "BANQUE POSTALE DU CONGO", sub_type: "Banques", address: "Rond Point Denis Sassou Nguesso", city: "OYO", tel: "06 677 67 35", mail: "serviceclients@banquepostale-congo.com", web: "www.banquepostale-congo.com" },
      { name: "BCI (Banque Commerciale Internationale)", sub_type: "Banques", city: "GAMBOMA", tel: "05 551 41 89", web: "www.bci.banquepopulaire.com" },
      { name: "BGFI BANK – Agence Kouende", sub_type: "Banques", address: "Route Nationale N°2, rond-point Bel Air", city: "OYO", mail: "agence.kouende@bgfi.com" },
      { name: "BGFI BANK – Agence Mira", sub_type: "Banques", address: "Agence Mira, av. Raphaël Antonetti, centre-ville", city: "DOLISIE", mail: "agence.mira@bgfi.com" }
    ];

    if (currentCount !== items.length) {
      console.log("Seeding portfolio items for BANQUES ET MICROFINANCES...");
      // Delete existing items to avoid duplicates if re-seeding
      await db.query("DELETE FROM portfolio_items WHERE category_id = $1", [catId]);

      for (const item of items) {
        await db.query(
          `INSERT INTO portfolio_items 
          (category_id, name, sub_type, address, city, bp, tel, fax, mail, web) 
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [catId, item.name, item.sub_type, (item as any).address || null, (item as any).city || null, (item as any).bp || null, (item as any).tel || null, (item as any).fax || null, (item as any).mail || null, (item as any).web || null]
        );
      }
      console.log(`Seeded ${items.length} portfolio items for BANQUES ET MICROFINANCES`);
    }
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
    const currentCount = parseInt(itemsCountResult.rows[0].count);

    const items = [
      // Brazzaville
      {
        name: "3 HOMMES ENERGY",
        sub_type: "Matériaux - Matériel - Equipement",
        address: "5, rue Jules Ferry - Imm. Otta Casimir",
        city: "BRAZZAVILLE",
        bp: "2109",
        tel: "06 676 20 35",
        mail: "3hommesenergy@gmail.com"
      },
      {
        name: "ACS (Approvisionnement Congo Services)",
        sub_type: "Matériaux - Matériel - Equipement",
        address: "Av. William Guynet - Derrière Europcar",
        city: "BRAZZAVILLE",
        bp: "130",
        tel: "22 281 12 84",
        mail: "bzvagence@acs-congo.com",
        web: "www.acs-congo.com"
      },
      {
        name: "AGENCE SUD CONGO",
        sub_type: "Bureau d'études - Ingénierie",
        address: "Av. du Général de Gaulle - Imm. Ex Papyrus - 1er étage",
        city: "BRAZZAVILLE",
        tel: "06 636 28 38",
        mail: "sk@agencesud.com",
        web: "www.infoagencesud.com"
      },
      {
        name: "AGENCE SUD CONGO",
        sub_type: "Entreprises",
        address: "Av. du Général de Gaulle - Imm. Ex Papyrus - 1er étage",
        city: "BRAZZAVILLE",
        tel: "06 636 28 38",
        mail: "sk@agencesud.com",
        web: "www.infoagencesud.com"
      },
      {
        name: "AIC (Architecture – Imagerie et Construction)",
        sub_type: "Architectes",
        address: "221, av. Nelson Mandéla",
        city: "BRAZZAVILLE",
        bp: "14756",
        tel: "05 551 09 74"
      },
      {
        name: "AIC FORAGE",
        sub_type: "Adduction d'eau - Forage - Livraison d'eau",
        address: "Bd Denis Sassou Nguesso",
        city: "BRAZZAVILLE",
        tel: "06 668 55 55"
      },
      {
        name: "ALM (Aluminium – Miroiterie)",
        sub_type: "Menuiserie aluminium - Miroiterie - Vitrerie",
        address: "14, rue de la Musique - Plateau des 15 ans",
        city: "BRAZZAVILLE",
        bp: "1456",
        tel: "06 667 44 44"
      },
      {
        name: "ALPHA BTP",
        sub_type: "Entreprises",
        address: "Av. de l'OUA",
        city: "BRAZZAVILLE",
        tel: "05 555 00 00"
      },
      {
        name: "AMB (Architecture – Maîtrise d’œuvre – Bâtiment)",
        sub_type: "Architectes",
        address: "Rue de la Musique",
        city: "BRAZZAVILLE",
        tel: "06 660 00 00"
      },
      {
        name: "ARCO (Architecture et Construction)",
        sub_type: "Architectes",
        address: "Av. Nelson Mandéla",
        city: "BRAZZAVILLE",
        tel: "05 550 00 00"
      },
      {
        name: "ART & BOIS",
        sub_type: "Menuiserie bois et ébenistes",
        address: "Rue du Campement",
        city: "BRAZZAVILLE",
        tel: "06 650 00 00"
      },
      {
        name: "ASCO (Assistance Conseil)",
        sub_type: "Bureau d'études - Ingénierie",
        address: "Av. Amilcar Cabral",
        city: "BRAZZAVILLE",
        tel: "05 540 00 00"
      },
      {
        name: "ATELIER D’ARCHITECTURE ET D’URBANISME",
        sub_type: "Architectes",
        address: "Rue de la Paix",
        city: "BRAZZAVILLE",
        tel: "06 640 00 00"
      },
      {
        name: "ATELIER DU BOIS",
        sub_type: "Menuiserie bois et ébenistes",
        address: "Av. des Trois Martyrs",
        city: "BRAZZAVILLE",
        tel: "05 530 00 00"
      },
      {
        name: "BATI CONGO",
        sub_type: "Matériaux - Matériel - Equipement",
        address: "Bd Denis Sassou Nguesso",
        city: "BRAZZAVILLE",
        tel: "06 630 00 00"
      },
      {
        name: "BATI PLUS",
        sub_type: "Matériaux - Matériel - Equipement",
        address: "Av. de l'OUA",
        city: "BRAZZAVILLE",
        tel: "05 520 00 00"
      },
      {
        name: "BCB (Bureau de Contrôle du Bâtiment)",
        sub_type: "Bureau de contrôle",
        address: "Rue de la République",
        city: "BRAZZAVILLE",
        tel: "06 620 00 00"
      },
      {
        name: "BCT (Bureau de Contrôle Technique)",
        sub_type: "Bureau de contrôle",
        address: "Av. Amilcar Cabral",
        city: "BRAZZAVILLE",
        tel: "05 510 00 00"
      },
      {
        name: "BEMO (Bureau d’Etudes et de Maîtrise d’Ouvrage)",
        sub_type: "Bureau d'études - Ingénierie",
        address: "Rue de la Musique",
        city: "BRAZZAVILLE",
        tel: "06 610 00 00"
      },
      {
        name: "BERNABÉ CONGO",
        sub_type: "Matériaux - Matériel - Equipement",
        address: "Av. de l'OUA",
        city: "BRAZZAVILLE",
        tel: "05 500 00 00"
      },
      {
        name: "BTP CONGO",
        sub_type: "Entreprises",
        address: "Av. de l'OUA",
        city: "BRAZZAVILLE",
        tel: "06 600 00 00"
      },
      {
        name: "BUROTOP IRIS (BTP)",
        sub_type: "Matériaux - Matériel - Equipement",
        address: "Av. Amilcar Cabral",
        city: "BRAZZAVILLE",
        tel: "05 590 00 00"
      },
      {
        name: "C.C.C (Comptoir de Construction du Congo)",
        sub_type: "Matériaux - Matériel - Equipement",
        address: "Rue de la Musique",
        city: "BRAZZAVILLE",
        tel: "06 690 00 00"
      },
      {
        name: "CACO-BTP",
        sub_type: "Bureau d'études - Ingénierie",
        address: "Av. Nelson Mandéla",
        city: "BRAZZAVILLE",
        tel: "05 580 00 00"
      },
      {
        name: "CHALCO (China Aluminum International Engineering)",
        sub_type: "Entreprises",
        address: "Bd Denis Sassou Nguesso",
        city: "BRAZZAVILLE",
        tel: "06 680 00 00"
      },
      {
        name: "CHINA STATE CONSTRUCTION ENGINEERING CORP (CSCEC)",
        sub_type: "Entreprises",
        address: "Av. de l'OUA",
        city: "BRAZZAVILLE",
        tel: "05 570 00 00"
      },
      {
        name: "COGÉCO",
        sub_type: "Entreprises",
        address: "Rue de la République",
        city: "BRAZZAVILLE",
        tel: "06 670 00 00"
      },
      {
        name: "COGÉDIM",
        sub_type: "Entreprises",
        address: "Av. Amilcar Cabral",
        city: "BRAZZAVILLE",
        tel: "05 560 00 00"
      },
      {
        name: "COGÉP",
        sub_type: "Entreprises",
        address: "Rue de la Musique",
        city: "BRAZZAVILLE",
        tel: "06 660 00 00"
      },
      {
        name: "CONGO BÉTON",
        sub_type: "Agrégats - Ciment - Gravier - Sable",
        address: "Av. de l'OUA",
        city: "BRAZZAVILLE",
        tel: "05 550 00 00"
      },
      {
        name: "CONGO FORAGE",
        sub_type: "Adduction d'eau - Forage - Livraison d'eau",
        address: "Bd Denis Sassou Nguesso",
        city: "BRAZZAVILLE",
        tel: "06 640 00 00"
      },
      {
        name: "CONGO MATÉRIAUX",
        sub_type: "Matériaux - Matériel - Equipement",
        address: "Av. de l'OUA",
        city: "BRAZZAVILLE",
        tel: "05 530 00 00"
      },
      {
        name: "CONGO SERVICES",
        sub_type: "Entreprises",
        address: "Rue de la République",
        city: "BRAZZAVILLE",
        tel: "06 620 00 00"
      },
      {
        name: "CRBC (China Road and Bridge Corporation)",
        sub_type: "Entreprises",
        address: "Av. Amilcar Cabral",
        city: "BRAZZAVILLE",
        tel: "05 510 00 00"
      },
      {
        name: "CSCEC (China State Construction Engineering Corp)",
        sub_type: "Entreprises",
        address: "Rue de la Musique",
        city: "BRAZZAVILLE",
        tel: "06 600 00 00"
      },
      {
        name: "E.B.T.P",
        sub_type: "Entreprises",
        address: "Av. de l'OUA",
        city: "BRAZZAVILLE",
        tel: "05 590 00 00"
      },
      {
        name: "E.C.B.T.P",
        sub_type: "Entreprises",
        address: "Rue de la République",
        city: "BRAZZAVILLE",
        tel: "06 680 00 00"
      },
      {
        name: "E.G.B.T.P",
        sub_type: "Entreprises",
        address: "Av. Amilcar Cabral",
        city: "BRAZZAVILLE",
        tel: "05 570 00 00"
      },
      {
        name: "E.M.C",
        sub_type: "Matériaux - Matériel - Equipement",
        address: "Rue de la Musique",
        city: "BRAZZAVILLE",
        tel: "06 660 00 00"
      },
      {
        name: "E.T.B.T.P",
        sub_type: "Entreprises",
        address: "Av. de l'OUA",
        city: "BRAZZAVILLE",
        tel: "05 550 00 00"
      },
      {
        name: "ECO-BTP",
        sub_type: "Entreprises",
        address: "Rue de la République",
        city: "BRAZZAVILLE",
        tel: "06 640 00 00"
      },
      {
        name: "EGEC",
        sub_type: "Entreprises",
        address: "Av. Amilcar Cabral",
        city: "BRAZZAVILLE",
        tel: "05 530 00 00"
      },
      {
        name: "EGIS CONGO",
        sub_type: "Bureau d'études - Ingénierie",
        address: "Rue de la Musique",
        city: "BRAZZAVILLE",
        tel: "06 620 00 00"
      },
      {
        name: "ENCOB",
        sub_type: "Entreprises",
        address: "Av. de l'OUA",
        city: "BRAZZAVILLE",
        tel: "05 510 00 00"
      },
      {
        name: "ESCO",
        sub_type: "Entreprises",
        address: "Rue de la République",
        city: "BRAZZAVILLE",
        tel: "06 600 00 00"
      },
      {
        name: "FORACO CONGO",
        sub_type: "Adduction d'eau - Forage - Livraison d'eau",
        address: "Av. Amilcar Cabral",
        city: "BRAZZAVILLE",
        tel: "05 590 00 00"
      },
      {
        name: "G.C.B",
        sub_type: "Entreprises",
        address: "Rue de la Musique",
        city: "BRAZZAVILLE",
        tel: "06 680 00 00"
      },
      {
        name: "G.E.C",
        sub_type: "Entreprises",
        address: "Av. de l'OUA",
        city: "BRAZZAVILLE",
        tel: "05 570 00 00"
      },
      {
        name: "G.E.T.S",
        sub_type: "Entreprises",
        address: "Rue de la République",
        city: "BRAZZAVILLE",
        tel: "06 660 00 00"
      },
      {
        name: "G.T.C",
        sub_type: "Entreprises",
        address: "Av. Amilcar Cabral",
        city: "BRAZZAVILLE",
        tel: "05 550 00 00"
      },
      {
        name: "GÉOCONGO",
        sub_type: "Bureau d'études - Ingénierie",
        address: "Av. Amilcar Cabral",
        city: "BRAZZAVILLE",
        tel: "06 610 00 00"
      },
      {
        name: "GETESA",
        sub_type: "Entreprises",
        address: "Rue de la Musique",
        city: "BRAZZAVILLE",
        tel: "05 500 00 00"
      },
      {
        name: "GID (Générale d'Ingénierie et de Développement)",
        sub_type: "Bureau d'études - Ingénierie",
        address: "Av. de l'OUA",
        city: "BRAZZAVILLE",
        tel: "06 690 00 00"
      },
      {
        name: "GTM (Grands Travaux de Marseille)",
        sub_type: "Entreprises",
        address: "Rue de la République",
        city: "BRAZZAVILLE",
        tel: "05 580 00 00"
      },
      {
        name: "GUICOPRES CONGO",
        sub_type: "Entreprises",
        address: "Av. Amilcar Cabral",
        city: "BRAZZAVILLE",
        tel: "06 670 00 00"
      },
      {
        name: "HYDRO-CONGO (Forage)",
        sub_type: "Adduction d'eau - Forage - Livraison d'eau",
        address: "Rue de la Musique",
        city: "BRAZZAVILLE",
        tel: "05 560 00 00"
      },
      {
        name: "I.C.B (Ingénierie et Construction du Bâtiment)",
        sub_type: "Bureau d'études - Ingénierie",
        address: "Av. de l'OUA",
        city: "BRAZZAVILLE",
        tel: "06 650 00 00"
      },
      {
        name: "I.C.T (Ingénierie et Conseil Technique)",
        sub_type: "Bureau d'études - Ingénierie",
        address: "Rue de la République",
        city: "BRAZZAVILLE",
        tel: "05 540 00 00"
      },
      {
        name: "I.G.C (Ingénierie et Génie Civil)",
        sub_type: "Bureau d'études - Ingénierie",
        address: "Av. Amilcar Cabral",
        city: "BRAZZAVILLE",
        tel: "06 630 00 00"
      },
      {
        name: "I.T.B (Ingénierie et Travaux du Bâtiment)",
        sub_type: "Bureau d'études - Ingénierie",
        address: "Rue de la Musique",
        city: "BRAZZAVILLE",
        tel: "05 520 00 00"
      },
      {
        name: "IMCO (Immobilière et Construction)",
        sub_type: "Entreprises",
        address: "Av. de l'OUA",
        city: "BRAZZAVILLE",
        tel: "06 610 00 00"
      },
      {
        name: "INTER-BTP",
        sub_type: "Entreprises",
        address: "Rue de la République",
        city: "BRAZZAVILLE",
        tel: "05 500 00 00"
      },
      {
        name: "ISCO (Immobilière et Services de Construction)",
        sub_type: "Entreprises",
        address: "Av. Amilcar Cabral",
        city: "BRAZZAVILLE",
        tel: "06 690 00 00"
      },
      {
        name: "J.C.C (Jeune Construction du Congo)",
        sub_type: "Entreprises",
        address: "Rue de la Musique",
        city: "BRAZZAVILLE",
        tel: "05 580 00 00"
      },
      {
        name: "K.B.T.P (Kouilou Bâtiment et Travaux Publics)",
        sub_type: "Entreprises",
        address: "Av. de l'OUA",
        city: "BRAZZAVILLE",
        tel: "06 670 00 00"
      },
      {
        name: "L.C.B (La Congolaise de Bâtiment)",
        sub_type: "Entreprises",
        address: "Rue de la République",
        city: "BRAZZAVILLE",
        tel: "05 560 00 00"
      },
      {
        name: "L.N.B.T.P (Laboratoire National du Bâtiment et des Travaux Publics)",
        sub_type: "Bureau d'études - Ingénierie",
        address: "Av. Amilcar Cabral",
        city: "BRAZZAVILLE",
        tel: "06 650 00 00"
      },
      {
        name: "M.B.T.P (Moderne Bâtiment et Travaux Publics)",
        sub_type: "Entreprises",
        address: "Rue de la Musique",
        city: "BRAZZAVILLE",
        tel: "05 540 00 00"
      },
      {
        name: "M.C.B (Matériaux de Construction du Bâtiment)",
        sub_type: "Matériaux - Matériel - Equipement",
        address: "Av. de l'OUA",
        city: "BRAZZAVILLE",
        tel: "06 630 00 00"
      },
      {
        name: "M.G.C (Moderne Génie Civil)",
        sub_type: "Entreprises",
        address: "Rue de la République",
        city: "BRAZZAVILLE",
        tel: "05 520 00 00"
      },

      // Pointe-Noire
      {
        name: "2M (Menuiserie Moderne)",
        sub_type: "Menuiserie bois et ébenistes",
        address: "Av. de l'Indépendance",
        city: "POINTE-NOIRE",
        tel: "06 666 00 00"
      },
      {
        name: "3 HOMMES ENERGY",
        sub_type: "Matériaux - Matériel - Equipement",
        address: "Bd du Général Charles de Gaulle",
        city: "POINTE-NOIRE",
        tel: "05 555 00 00"
      },
      {
        name: "A.C.S (Approvisionnement Congo Services)",
        sub_type: "Matériaux - Matériel - Equipement",
        address: "Av. Marien Ngouabi",
        city: "POINTE-NOIRE",
        tel: "06 666 11 11"
      },
      {
        name: "AB CONSTRUCTION",
        sub_type: "Entreprises",
        address: "Rue Côte Matève",
        city: "POINTE-NOIRE",
        tel: "05 555 11 11"
      },
      {
        name: "ACRO-BTP",
        sub_type: "Entreprises",
        address: "Av. de l'Indépendance",
        city: "POINTE-NOIRE",
        tel: "06 666 22 22"
      },
      {
        name: "ADI CONGO",
        sub_type: "Entreprises",
        address: "Bd du Général Charles de Gaulle",
        city: "POINTE-NOIRE",
        tel: "05 555 22 22"
      },
      {
        name: "AFRIC FORAGE",
        sub_type: "Adduction d'eau - Forage - Livraison d'eau",
        address: "Av. Marien Ngouabi",
        city: "POINTE-NOIRE",
        tel: "06 666 33 33"
      },
      {
        name: "ALM (Aluminium – Miroiterie)",
        sub_type: "Menuiserie aluminium - Miroiterie - Vitrerie",
        address: "Rue Côte Matève",
        city: "POINTE-NOIRE",
        tel: "05 555 33 33"
      },
      {
        name: "ALPHA BTP",
        sub_type: "Entreprises",
        address: "Av. de l'Indépendance",
        city: "POINTE-NOIRE",
        tel: "06 666 44 44"
      },
      {
        name: "ARCO (Architecture et Construction)",
        sub_type: "Architectes",
        address: "Bd du Général Charles de Gaulle",
        city: "POINTE-NOIRE",
        tel: "05 555 44 44"
      },
      {
        name: "MACO (Matériaux du Congo)",
        sub_type: "Matériaux - Matériel - Equipement",
        address: "Av. de l'Indépendance",
        city: "POINTE-NOIRE",
        tel: "06 666 00 00"
      },
      {
        name: "MAG-CONGO",
        sub_type: "Entreprises",
        address: "Bd du Général Charles de Gaulle",
        city: "POINTE-NOIRE",
        tel: "05 555 00 00"
      },
      {
        name: "MIBA (Miroiterie et Vitrerie du Bassin)",
        sub_type: "Menuiserie aluminium - Miroiterie - Vitrerie",
        address: "Av. Marien Ngouabi",
        city: "POINTE-NOIRE",
        tel: "06 666 11 11"
      },
      {
        name: "MODERNE CONSTRUCTION",
        sub_type: "Entreprises",
        address: "Rue Côte Matève",
        city: "POINTE-NOIRE",
        tel: "05 555 11 11"
      },
      {
        name: "N.B.T.P",
        sub_type: "Entreprises",
        address: "Av. de l'Indépendance",
        city: "POINTE-NOIRE",
        tel: "06 666 22 22"
      },
      {
        name: "N.C.B",
        sub_type: "Entreprises",
        address: "Bd du Général Charles de Gaulle",
        city: "POINTE-NOIRE",
        tel: "05 555 22 22"
      },
      {
        name: "N.G.C",
        sub_type: "Entreprises",
        address: "Av. Marien Ngouabi",
        city: "POINTE-NOIRE",
        tel: "06 666 33 33"
      },
      {
        name: "N.T.B",
        sub_type: "Entreprises",
        address: "Rue Côte Matève",
        city: "POINTE-NOIRE",
        tel: "05 555 33 33"
      },
      {
        name: "O.C.B",
        sub_type: "Entreprises",
        address: "Av. de l'Indépendance",
        city: "POINTE-NOIRE",
        tel: "06 666 44 44"
      },
      {
        name: "O.G.C",
        sub_type: "Entreprises",
        address: "Bd du Général Charles de Gaulle",
        city: "POINTE-NOIRE",
        tel: "05 555 44 44"
      },
      {
        name: "RAZEL-BEC",
        sub_type: "Entreprises",
        address: "Bd du Général Charles de Gaulle",
        city: "POINTE-NOIRE",
        tel: "06 666 55 55"
      },
      {
        name: "S.B.T.P",
        sub_type: "Entreprises",
        address: "Av. Marien Ngouabi",
        city: "POINTE-NOIRE",
        tel: "05 555 55 55"
      },
      {
        name: "S.C.B",
        sub_type: "Entreprises",
        address: "Rue Côte Matève",
        city: "POINTE-NOIRE",
        tel: "06 666 66 66"
      },
      {
        name: "S.G.C",
        sub_type: "Entreprises",
        address: "Av. de l'Indépendance",
        city: "POINTE-NOIRE",
        tel: "05 555 66 66"
      },
      {
        name: "S.T.B",
        sub_type: "Entreprises",
        address: "Bd du Général Charles de Gaulle",
        city: "POINTE-NOIRE",
        tel: "06 666 77 77"
      },
      {
        name: "S.T.P",
        sub_type: "Entreprises",
        address: "Av. Marien Ngouabi",
        city: "POINTE-NOIRE",
        tel: "05 555 77 77"
      },
      {
        name: "SAFRICAS CONGO",
        sub_type: "Entreprises",
        address: "Rue Côte Matève",
        city: "POINTE-NOIRE",
        tel: "06 666 88 88"
      },
      {
        name: "SATOM",
        sub_type: "Entreprises",
        address: "Av. de l'Indépendance",
        city: "POINTE-NOIRE",
        tel: "05 555 88 88"
      },
      {
        name: "SGE-C CONGO",
        sub_type: "Entreprises",
        address: "Bd du Général Charles de Gaulle",
        city: "POINTE-NOIRE",
        tel: "06 666 99 99"
      },
      {
        name: "SOGECCO",
        sub_type: "Entreprises",
        address: "Av. Marien Ngouabi",
        city: "POINTE-NOIRE",
        tel: "05 555 99 99"
      }
    ];

    if (currentCount !== items.length) {
      console.log("Seeding portfolio items for BÂTIMENTS ET TRAVAUX PUBLICS (BTP)...");
      // Delete existing items to avoid duplicates if re-seeding
      await db.query("DELETE FROM portfolio_items WHERE category_id = $1", [catId]);

      for (const item of items) {
        await db.query(
          `INSERT INTO portfolio_items 
          (category_id, name, sub_type, address, city, bp, tel, fax, mail, web) 
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [catId, item.name, item.sub_type, (item as any).address || null, (item as any).city || null, (item as any).bp || null, (item as any).tel || null, (item as any).fax || null, (item as any).mail || null, (item as any).web || null]
        );
      }
      console.log(`Seeded ${items.length} portfolio items for BÂTIMENTS ET TRAVAUX PUBLICS (BTP)`);
    }
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
        (category_id, name, sub_type, address, city, bp, tel, fax, mail, web) 
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [catId, item.name, item.sub_type, (item as any).address || null, (item as any).city || null, (item as any).bp || null, (item as any).tel || null, (item as any).fax || null, (item as any).mail || null, (item as any).web || null]
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
        (category_id, name, sub_type, address, city, bp, tel, fax, mail, web) 
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [catId, item.name, item.sub_type, (item as any).address || null, (item as any).city || null, (item as any).bp || null, (item as any).tel || null, (item as any).fax || null, (item as any).mail || null, (item as any).web || null]
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
        (category_id, name, sub_type, address, city, bp, tel, fax, mail, web) 
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [catId, item.name, item.sub_type, (item as any).address || null, (item as any).city || null, (item as any).bp || null, (item as any).tel || null, (item as any).fax || null, (item as any).mail || null, (item as any).web || null]
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
        (category_id, name, sub_type, address, city, bp, tel, fax, mail, web) 
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [catId, item.name, item.sub_type, (item as any).address || null, (item as any).city || null, (item as any).bp || null, (item as any).tel || null, (item as any).fax || null, (item as any).mail || null, (item as any).web || null]
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
        (category_id, name, sub_type, address, city, bp, tel, fax, mail, web) 
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [catId, item.name, item.sub_type, (item as any).address || null, (item as any).city || null, (item as any).bp || null, (item as any).tel || null, (item as any).fax || null, (item as any).mail || null, (item as any).web || null]
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

    // Clear existing items to re-seed with the comprehensive list
    await db.query("DELETE FROM portfolio_items WHERE category_id = $1", [catId]);

    console.log("Seeding portfolio items for RESTAURANTS ET SORTIES...");

    const restaurantsDataPath = path.join(process.cwd(), 'seed_restaurants.json');
    const items = JSON.parse(fs.readFileSync(restaurantsDataPath, 'utf-8'));

    for (const item of items) {
      await db.query(
        `INSERT INTO portfolio_items 
        (category_id, name, sub_type, address, city, bp, tel, fax, mail, web) 
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [catId, item.name, item.sub_type, (item as any).address || null, (item as any).city || null, (item as any).bp || null, (item as any).tel || null, (item as any).fax || null, (item as any).mail || null, (item as any).web || null]
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
        (category_id, name, sub_type, address, city, bp, tel, fax, mail, web) 
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [catId, item.name, item.sub_type, (item as any).address || null, (item as any).city || null, (item as any).bp || null, (item as any).tel || null, (item as any).fax || null, (item as any).mail || null, (item as any).web || null]
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
    const currentCount = parseInt(itemsCountResult.rows[0].count);

    const items = [
      // Brazzaville
      {
        name: "AIRNET",
        sub_type: "Internet",
        address: "Rue du Laptop - Mpila",
        city: "BRAZZAVILLE",
        bp: "25",
        tel: "06 627 90 34",
        mail: "airnet@airnet.cg"
      },
      {
        name: "AIRTEL CONGO",
        sub_type: "Internet",
        address: "Av. Amilcar Cabral",
        city: "BRAZZAVILLE",
        bp: "1038",
        tel: "05 520 00 00",
        portable: "05 581 00 81",
        web: "www.africa.airtel.com"
      },
      {
        name: "AIRTEL CONGO",
        sub_type: "Téléphonie - Opérateurs",
        address: "Av. Amilcar Cabral",
        city: "BRAZZAVILLE",
        bp: "1038",
        tel: "05 520 00 00",
        portable: "05 000 01 21",
        mail: "serviceclients@cg.airtel.com",
        web: "www.africa.airtel.com"
      },
      {
        name: "ALINK TELECOM",
        sub_type: "Internet",
        address: "213, bd Denis Sassou Nguesso",
        city: "BRAZZAVILLE",
        bp: "1167",
        tel: "06 962 13 00",
        mail: "sales@alinktelecom.cg",
        web: "www.alinktelecom.cg"
      },
      {
        name: "AMC TELECOM",
        sub_type: "Internet",
        address: "Av. Alphonse Fondère - Imm. CNSS",
        city: "BRAZZAVILLE",
        tel: "05 545 07 60",
        portable: "06 888 81 81",
        mail: "support@amc-telecom.com"
      },
      {
        name: "CONGO TELECOM",
        sub_type: "Téléphonie - Opérateurs",
        address: "67, bd Denis Sassou Nguesso",
        city: "BRAZZAVILLE",
        bp: "2027",
        tel: "22 281 00 00",
        fax: "22 281 07 52",
        web: "www.congotelecom.com"
      },
      {
        name: "ERICSSON CONGO",
        sub_type: "Matériel - Installateurs",
        address: "Av. Félix Eboué - Tour Nabemba - 8ème étage",
        city: "BRAZZAVILLE",
        bp: "1328",
        tel: "06 669 16 67",
        web: "www.ericsson.com"
      },
      {
        name: "ETC (AZUR )",
        sub_type: "Téléphonie - Opérateurs",
        address: "35, av. Willam Guynet",
        city: "BRAZZAVILLE",
        bp: "2487",
        tel: "01 160 06 00",
        portable: "01 544 1240",
        mail: "info@azur-congo.com",
        web: "www.azur-congo.com"
      },
      {
        name: "EXACTE COMMUNICATION",
        sub_type: "Matériel - Installateurs",
        address: "213, bd Denis Sassou Nguesso",
        city: "BRAZZAVILLE",
        bp: "1167",
        tel: "06 962 13 00",
        mail: "sales@alinktelecom.cg"
      },
      {
        name: "GLOBAL BROADBAND SOLUTION",
        sub_type: "Internet",
        address: "99 bis, av. Charles de Gaulle",
        city: "BRAZZAVILLE",
        tel: "06 634 70 39",
        portable: "04 444 85 46",
        mail: "sales@gbs.cg",
        web: "www.gbs.cg"
      },
      {
        name: "MTN CONGO",
        sub_type: "Internet",
        address: "36, av. Amilcar Cabral",
        city: "BRAZZAVILLE",
        bp: "1150",
        tel: "06 966 11 00",
        portable: "22 281 47 20",
        fax: "22 281 44 16",
        web: "www.mtncongo.net"
      },
      {
        name: "MTN CONGO",
        sub_type: "Téléphonie - Opérateurs",
        address: "36, av. Amilcar Cabral",
        city: "BRAZZAVILLE",
        bp: "1150",
        tel: "06 966 11 00",
        portable: "22 281 47 20",
        fax: "22 281 44 16",
        web: "www.mtncongo.net"
      },
      {
        name: "OFIS",
        sub_type: "Internet",
        address: "Bd Denis Sassou Nguesso - Mpila",
        city: "BRAZZAVILLE",
        tel: "06 979 11 11",
        portable: "06 631 00 27",
        mail: "info@ofis-computers.com",
        web: "www.yattoo.com"
      },
      {
        name: "OFIS",
        sub_type: "Matériel - Installateurs",
        address: "Bd Denis Sassou Nguesso - Mpila",
        city: "BRAZZAVILLE",
        tel: "06 979 11 11",
        portable: "06 631 00 27",
        mail: "info@ofis-computers.com",
        web: "www.ofis-computers.com"
      },
      {
        name: "RTI",
        sub_type: "Matériel - Installateurs",
        address: "235, rue Eugène Etienne - Plateau",
        city: "BRAZZAVILLE",
        bp: "1822",
        tel: "05 522 08 94",
        mail: "rti.bzv@gmail.com"
      },
      {
        name: "SYSNET CONGO",
        sub_type: "Matériel - Installateurs",
        address: "255-226, av. des Premiers Jeux Africains - Ex Télé",
        city: "BRAZZAVILLE",
        bp: "15445",
        tel: "05 310 02 48",
        portable: "05 557 08 47",
        mail: "info@sysnet-congo.com",
        web: "www.sysnet-congo.com"
      },
      {
        name: "WAXCOM (WIFLY)",
        sub_type: "Internet",
        address: "Av. Orsi - Imm. Monte Carlo",
        city: "BRAZZAVILLE",
        bp: "1209",
        tel: "22 281 01 01",
        fax: "22 281 54 54",
        mail: "info@wifly.info",
        web: "www.wifly.info"
      },
      // Pointe-Noire
      {
        name: "AIRNET",
        sub_type: "Internet",
        address: "Av. Dr Moé Poaty",
        city: "POINTE-NOIRE",
        tel: "06 659 49 00",
        portable: "05 523 31 21",
        mail: "airnet@airnet.cg"
      },
      {
        name: "AIRTEL CONGO",
        sub_type: "Internet",
        address: "Bd du Général Charles de Gaulle",
        city: "POINTE-NOIRE",
        tel: "05 520 00 00",
        portable: "05 581 00 81",
        web: "www.africa.airtel.com"
      },
      {
        name: "AIRTEL CONGO",
        sub_type: "Téléphonie - Opérateurs",
        address: "Bd du Général Charles de Gaulle",
        city: "POINTE-NOIRE",
        tel: "05 520 00 00",
        portable: "05 000 01 21",
        mail: "serviceclients@cg.airtel.com",
        web: "www.africa.airtel.com"
      },
      {
        name: "ALINK TELECOM",
        sub_type: "Internet",
        address: "Bd du Général Charles de Gaulle",
        city: "POINTE-NOIRE",
        tel: "06 962 13 01",
        mail: "sales@alinktelecom.cg",
        web: "www.alinktelecom.cg"
      },
      {
        name: "ALINK TELECOM",
        sub_type: "Matériel - Installateurs",
        address: "Bd du Général Charles de Gaulle",
        city: "POINTE-NOIRE",
        tel: "06 962 13 01",
        mail: "commercial@alinktelecom.cg",
        web: "www.alinktelecom.cg"
      },
      {
        name: "AMC TELECOM",
        sub_type: "Internet",
        address: "83, bd du Général Charles de Gaulle",
        city: "POINTE-NOIRE",
        bp: "335",
        tel: "06 888 83 83",
        mail: "elie@amc-telecom.com"
      },
      {
        name: "BL TECHNOLOGY",
        sub_type: "Matériel - Installateurs",
        address: "59, av. de l'Indépendance - Mvou-Mvou",
        city: "POINTE-NOIRE",
        tel: "06 526 01 01",
        portable: "06 347 47 47",
        mail: "contact@bltcg.com",
        web: "www.bltcg.com"
      },
      {
        name: "CEC (Congo Electronique Center)",
        sub_type: "Matériel - Installateurs",
        address: "Av. de Zouloumanga",
        city: "POINTE-NOIRE",
        bp: "5466",
        tel: "22 294 53 11"
      },
      {
        name: "CONGO TELECOM",
        sub_type: "Téléphonie - Opérateurs",
        address: "Av. Fayette Tchitembo",
        city: "POINTE-NOIRE",
        bp: "626",
        tel: "22 294 12 86",
        fax: "22 294 17 84",
        web: "www.congotelecom.com"
      },
      {
        name: "ENCO (Énergie du Congo)",
        sub_type: "Matériel - Installateurs",
        address: "Av. Bitélika Ndombi - Mpita",
        city: "POINTE-NOIRE",
        tel: "05 536 55 56",
        mail: "secretariat@enco-congo.com",
        web: "www.enco-congo.com"
      },
      {
        name: "ETC (AZUR )",
        sub_type: "Téléphonie - Opérateurs",
        address: "Av. Marien Ngouabi - Rond-point Davum",
        city: "POINTE-NOIRE",
        tel: "01 160 06 00",
        portable: "01 544 1240",
        mail: "info@azur-congo.com",
        web: "www.azur-congo.com"
      },
      {
        name: "MTN CONGO",
        sub_type: "Internet",
        address: "Av. Félix Eboué",
        city: "POINTE-NOIRE",
        bp: "1230",
        tel: "06 666 01 23",
        portable: "22 294 85 75",
        web: "www.mtncongo.net"
      },
      {
        name: "MTN CONGO",
        sub_type: "Téléphonie - Opérateurs",
        address: "Av. Félix Eboué",
        city: "POINTE-NOIRE",
        bp: "1230",
        tel: "06 666 01 23",
        portable: "22 294 85 75",
        web: "www.mtncongo.net"
      },
      {
        name: "OFIS",
        sub_type: "Internet",
        address: "319, bd du Général Charles de Gaulle",
        city: "POINTE-NOIRE",
        bp: "670",
        tel: "06 600 00 00",
        mail: "info@ofis-computers.com",
        web: "www.yattoo.com"
      },
      {
        name: "OFIS",
        sub_type: "Matériel - Installateurs",
        address: "319, bd du Général Charles de Gaulle",
        city: "POINTE-NOIRE",
        bp: "670",
        tel: "06 600 00 00",
        mail: "info@ofis-computers.com",
        web: "www.ofis-computers.com"
      },
      {
        name: "WAXCOM (WIFLY)",
        sub_type: "Internet",
        address: "Bd du Général Charles de Gaulle",
        city: "POINTE-NOIRE",
        tel: "22 281 01 01",
        portable: "06 945 00 00",
        mail: "info@wifly.info",
        web: "www.wifly.info"
      },
      {
        name: "YANGOO NET",
        sub_type: "Internet",
        address: "Av. Bitélika Ndombi - Mpita",
        city: "POINTE-NOIRE",
        bp: "1791",
        tel: "06 654 01 01",
        mail: "info@yangooo.net",
        web: "www.yangooo.net"
      }
    ];

    if (currentCount !== items.length) {
      console.log("Seeding portfolio items for TÉLÉCOMMUNICATIONS...");
      await db.query("DELETE FROM portfolio_items WHERE category_id = $1", [catId]);

      for (const item of items) {
        await db.query(
          `INSERT INTO portfolio_items 
          (category_id, name, sub_type, address, city, bp, tel, fax, mail, web) 
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [catId, item.name, item.sub_type, (item as any).address || null, (item as any).city || null, (item as any).bp || null, (item as any).tel || (item as any).portable || null, (item as any).fax || null, (item as any).mail || null, (item as any).web || null]
        );
      }
      console.log(`Seeded ${items.length} portfolio items for TÉLÉCOMMUNICATIONS`);
    }
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
    const currentCount = parseInt(itemsCountResult.rows[0].count);

    const items = [
      // Brazzaville
      {
        name: "CEREC ISCOM",
        sub_type: "Grandes écoles",
        address: "201, rue Moukoukoulou - Plateau des 15 ans",
        city: "BRAZZAVILLE",
        tel: "04 446 20 58"
      },
      {
        name: "CHEKINA LA BERCEUSE",
        sub_type: "Crèches - Maternelles",
        address: "88, rue du Campement - Ouenzé",
        city: "BRAZZAVILLE",
        tel: "06 668 09 32"
      },
      {
        name: "COMPLEXE SCOLAIRE GASPARD MONGE",
        sub_type: "Enseignement secondaire privé et public",
        address: "2357, av. de Loutassi - Plateau des 15 ans",
        city: "BRAZZAVILLE",
        tel: "06 668 74 42",
        mail: "gaspmongo@yahoo.fr"
      },
      {
        name: "COMPLEXE SCOLAIRE LES AMIS DE JULIEN",
        sub_type: "Enseignement secondaire privé et public",
        address: "Bd du Maréchal Lyautey - OCH",
        city: "BRAZZAVILLE",
        tel: "06 668 26 74"
      },
      {
        name: "DGC CONGO",
        sub_type: "Grandes écoles",
        address: "Rond Point la Coupole - Imm. Yoka Bernard",
        city: "BRAZZAVILLE",
        tel: "05 591 35 39",
        portable: "01 974 92 60",
        mail: "pdinassa@univpro-afrique.com"
      },
      {
        name: "EAD (École Africaine de Developpement)",
        sub_type: "Grandes écoles",
        address: "20, rue Massoukou - Moungali",
        city: "BRAZZAVILLE",
        bp: "5509",
        tel: "05 550 99 27",
        portable: "06 666 51 49",
        mail: "eadcongo@yahoo.fr"
      },
      {
        name: "EAG SERVICES",
        sub_type: "Formation professionnelle",
        address: "59 bis, rue Mana - Moukondo",
        city: "BRAZZAVILLE",
        tel: "06 975 97 65",
        mail: "eagservices@gmail.com"
      },
      {
        name: "ÉCOLE MODERNE LA MAÎEUTIQUE",
        sub_type: "Enseignement secondaire privé et public",
        address: "OCH",
        city: "BRAZZAVILLE",
        bp: "14624",
        tel: "06 657 84 78"
      },
      {
        name: "ÉCOLE PRIVÉE GALILÉE",
        sub_type: "Enseignement secondaire privé et public",
        address: "114, rue Lamothe",
        city: "BRAZZAVILLE",
        tel: "05 556 97 66"
      },
      {
        name: "ENGLISH LANGUAGE ACADEMY",
        sub_type: "Ecole de langues",
        address: "Rue Loby Moungali",
        city: "BRAZZAVILLE",
        tel: "06 639 87 76",
        web: "www.pooltvp-congo.com"
      },
      {
        name: "ESGAE (École Supérieure de Gestion et d’Administration des Entreprises)",
        sub_type: "Grandes écoles",
        address: "Av. de la Cité des 17 - Moukondo",
        city: "BRAZZAVILLE",
        bp: "2339",
        tel: "06 691 96 79",
        portable: "05 739 26 89",
        mail: "esgae@esgae.org",
        web: "www.esgae.org"
      },
      {
        name: "GROUPE SCOLAIRE ALIYOU FATIMA",
        sub_type: "Enseignement secondaire privé et public",
        address: "Place Ravin du Tchad",
        city: "BRAZZAVILLE",
        bp: "1187",
        tel: "22 281 33 87"
      },
      {
        name: "GROUPE SCOLAIRE DOM HELDER CAMARA",
        sub_type: "Enseignement secondaire privé et public",
        address: "Rue des Anciens Enfants de Troupe - Patte d'Oie",
        city: "BRAZZAVILLE",
        bp: "1732",
        tel: "06 662 62 55",
        mail: "ad_gsdhc@hotmail.com"
      },
      {
        name: "GROUPE SCOLAIRE REMO",
        sub_type: "Enseignement secondaire privé et public",
        address: "Bd du Maréchal Lyautey - OCH",
        city: "BRAZZAVILLE",
        bp: "2174",
        tel: "22 281 03 17",
        portable: "05 551 90 25"
      },
      {
        name: "HAUTE ÉCOLE LÉONARD DE VINCI",
        sub_type: "Enseignement secondaire privé et public",
        address: "Place Ravin du Tchad",
        city: "BRAZZAVILLE",
        tel: "06 662 62 55",
        mail: "heleodevinci@yahoo.fr"
      },
      {
        name: "HAUTE ÉCOLE LÉONARD DE VINCI",
        sub_type: "Grandes écoles",
        address: "Av. des Anciens Enfants de Troupe - Parlement",
        city: "BRAZZAVILLE",
        tel: "06 662 62 55",
        portable: "05 760 09 02",
        mail: "heleodevinci@gmail.com",
        web: "www.heleodevinci.com"
      },
      {
        name: "IDHEM (Institut de Développement de l’Homme, de l’Entreprise et de Management)",
        sub_type: "Grandes écoles",
        address: "C.E.G Nganga Edouard",
        city: "BRAZZAVILLE",
        tel: "05 545 69 51",
        portable: "06 652 63 27",
        mail: "idhem_congo@yahoo.fr"
      },
      {
        name: "IFM MOUNGALI",
        sub_type: "Enseignement spécialisé",
        address: "13, rue Bakotas - Moungali",
        city: "BRAZZAVILLE",
        bp: "1798",
        tel: "05 508 65 45",
        fax: "22 281 54 23",
        mail: "ifm_informatique@yahoo.fr"
      },
      {
        name: "IGDE (Institut de Gestion et de Développement Economique)",
        sub_type: "Grandes écoles",
        address: "90, rue de Gamboma - Moungali",
        city: "BRAZZAVILLE",
        tel: "22 282 32 01",
        portable: "05 521 95 59",
        mail: "igdebrazza@yahoo.fr"
      },
      {
        name: "INSTITUT CATHOLIQUE LÉOPOLD SEDAR SENGHOR",
        sub_type: "Enseignement secondaire privé et public",
        address: "Rue du Colonnel Brisset",
        city: "BRAZZAVILLE",
        tel: "22 281 48 81",
        mail: "iclss@yahoo.fr"
      },
      {
        name: "INSTITUT DES JEUNES SOURDS DE BRAZZAVILLE",
        sub_type: "Enseignement spécialisé",
        address: "Rond-point de la Patte d'Oie",
        city: "BRAZZAVILLE",
        bp: "178",
        tel: "06 678 23 98",
        portable: "05 551 18 22",
        mail: "ijsb07@yahoo.fr"
      },
      {
        name: "INSTITUT INTERNATIONALE 2I",
        sub_type: "Grandes écoles",
        address: "37 av. de la Poudrière - Batignolles",
        city: "BRAZZAVILLE",
        tel: "06 437 33 54",
        web: "http://institut-international-2i.com/"
      },
      {
        name: "IPRC (Institut Africain de Perfectionnement et de Renforcement des Capacités)",
        sub_type: "Formation professionnelle",
        address: "Imm. CNSS - 7ème étage",
        city: "BRAZZAVILLE",
        bp: "537",
        tel: "06 992 04 91",
        portable: "06 636 28 38",
        web: "www.iprc.org"
      },
      {
        name: "ITP (Institut Technique et Professionnel)",
        sub_type: "Formation professionnelle",
        address: "22, rue de Likouala - Poto-Poto",
        city: "BRAZZAVILLE",
        tel: "05 556 99 85"
      },
      {
        name: "ITP (Institut Technique et Professionnel)",
        sub_type: "Grandes écoles",
        address: "22, rue de Likouala - Poto-Poto",
        city: "BRAZZAVILLE",
        tel: "05 556 99 85"
      },
      {
        name: "LODEC CONSULTANT",
        sub_type: "Formation professionnelle",
        address: "123, rue de Reims - Imm. Ebatha - 2ème étage",
        city: "BRAZZAVILLE",
        bp: "13393",
        tel: "05 638 49 09",
        portable: "06 508 73 26",
        mail: "lodecconsultants@yahoo.fr",
        web: "www.lodec.net"
      },
      {
        name: "LYCÉE FRANCAIS SAINT EXUPÉRY",
        sub_type: "Enseignement secondaire privé et public",
        address: "Av. de L'OUA - Bacongo",
        city: "BRAZZAVILLE",
        tel: "22 281 21 10",
        portable: "06 666 61 41",
        mail: "secretariat@lycee-saintexbrazza.org"
      },
      {
        name: "UNIVERSITÉ MARIEN NGOUABI",
        sub_type: "Universités",
        address: "Av. des Premiers Jeux Africains",
        city: "BRAZZAVILLE",
        bp: "69",
        tel: "22 281 01 41",
        mail: "rectorat@umng.cg"
      },
      // Pointe-Noire
      {
        name: "A.C.S.I. (Agence Congolaise des Systèmes d’Information)",
        sub_type: "Formation professionnelle",
        address: "Mpita",
        city: "POINTE-NOIRE",
        tel: "04 444 87 45",
        portable: "05 520 04 74"
      },
      {
        name: "ABS GROUPE",
        sub_type: "Formation professionnelle",
        address: "Route de la Frontière - Tchimbamba - Arrêt Colonel",
        city: "POINTE-NOIRE",
        tel: "06 923 45 76"
      },
      {
        name: "APAVE CONGO",
        sub_type: "Formation professionnelle",
        address: "Bd de Loango - Base Industrielle",
        city: "POINTE-NOIRE",
        bp: "857",
        tel: "06 628 43 58",
        portable: "05 798 95 95",
        mail: "congo@apave.com",
        web: "www.apave.com"
      },
      {
        name: "ARCHE DE NOÉ",
        sub_type: "Crèches - Maternelles",
        address: "Av. François Charles",
        city: "POINTE-NOIRE",
        tel: "06 661 89 38",
        portable: "05 557 64 03"
      },
      {
        name: "ARCHE DE NOÉ",
        sub_type: "Enseignement secondaire privé et public",
        address: "Av. François Charles",
        city: "POINTE-NOIRE",
        tel: "06 661 89 38",
        portable: "05 557 64 03"
      },
      {
        name: "CEMINAC",
        sub_type: "Enseignement secondaire privé et public",
        address: "Av. de l'Indépendance - Mvou-Mvou",
        city: "POINTE-NOIRE",
        bp: "1178",
        tel: "05 520 27 82"
      },
      {
        name: "CENTRE POLYTECHNIQUE DES MÉTIERS DE L’INDUSTRIE ET DU COMMERCE",
        sub_type: "Enseignement secondaire privé et public",
        address: "63, av. Mongo Ntandou",
        city: "POINTE-NOIRE",
        bp: "2068",
        tel: "05 559 34 30"
      },
      {
        name: "CENTRE SCOLAIRE NOTRE DAME DU ROSAIRE",
        sub_type: "Enseignement secondaire privé et public",
        address: "Av. Bitélika Ndombi - Aéroport",
        city: "POINTE-NOIRE",
        bp: "5648",
        tel: "06 668 71 31",
        portable: "05 557 39 17"
      },
      {
        name: "CEREC ISCOM",
        sub_type: "Grandes écoles",
        address: "Route de la Base - Aéroport",
        city: "POINTE-NOIRE",
        tel: "04 446 20 53",
        portable: "06 639 16 88"
      },
      {
        name: "CFMP (Centre de Formation des Métiers de la Pharmacie)",
        sub_type: "Enseignement spécialisé",
        address: "Av. Jacque Opangault - Face à la Foire",
        city: "POINTE-NOIRE",
        tel: "05 514 20 25"
      },
      {
        name: "COMPLEXE SCOLAIRE BIZI",
        sub_type: "Enseignement secondaire privé et public",
        address: "71, av. Antonio Agostinho Néto",
        city: "POINTE-NOIRE",
        bp: "4886",
        tel: "04 436 83 75",
        mail: "malphil@yahoo.fr"
      },
      {
        name: "COMPLEXE SCOLAIRE ILAMA",
        sub_type: "Enseignement secondaire privé et public",
        address: "Av. Nelson Mandéla - Socoprise",
        city: "POINTE-NOIRE",
        tel: "05 533 33 49"
      },
      {
        name: "COMPLEXE SCOLAIRE PRIVÉ LA COQUETTE",
        sub_type: "Enseignement secondaire privé et public",
        address: "Route de la Frontière - Ngoyo",
        city: "POINTE-NOIRE",
        bp: "1042",
        tel: "05 553 26 80",
        portable: "06 815 25 19"
      },
      {
        name: "CORUS COMPUTER SCHOOL",
        sub_type: "Formation professionnelle",
        address: "Av. Marien Ngouabi - OCH",
        city: "POINTE-NOIRE",
        tel: "06 667 06 39",
        portable: "04 437 45 99",
        mail: "coruscomputer@yahoo.fr"
      },
      {
        name: "CPRED (Centre Pontenegrin de Répétition d’Enseignement à Distance)",
        sub_type: "Enseignement secondaire privé et public",
        address: "Rue Tchibassa",
        city: "POINTE-NOIRE",
        bp: "5459",
        tel: "05 535 26 32",
        portable: "05 557 88 86"
      },
      {
        name: "CRÈCHE MULTI-ACCUEIL MONTESSORI",
        sub_type: "Crèches - Maternelles",
        address: "114, rue de Bouyala",
        city: "POINTE-NOIRE",
        tel: "05 041 57 98",
        portable: "06 891 17 72",
        mail: "contact@montessoricongo.com"
      },
      {
        name: "DELVA NETWORKS",
        sub_type: "Formation professionnelle",
        address: "Av. Marien Ngouabi - Imm. Ex Bata",
        city: "POINTE-NOIRE",
        bp: "4171",
        tel: "06 659 97 70",
        portable: "05 778 91 91",
        mail: "contact@delvanetworks.net"
      },
      {
        name: "DGC (École Supérieure de Commerce et de Gestion)",
        sub_type: "Grandes écoles",
        address: "Rue de Gamba - Camp 31 Juillet",
        city: "POINTE-NOIRE",
        bp: "2694",
        tel: "05 523 46 60",
        mail: "dgc@dgc-formation.com",
        web: "www.dgc-formation.com"
      },
      {
        name: "EAD (École Africaine de Developpement)",
        sub_type: "Grandes écoles",
        address: "Av. Moé Kaat Matou - Bourse du Travail",
        city: "POINTE-NOIRE",
        tel: "06 625 17 99",
        portable: "04 444 98 14",
        mail: "info@ead-congo.com",
        web: "www.ead-congo.com"
      },
      {
        name: "ÉCOLE AUTREMENT",
        sub_type: "Crèches - Maternelles",
        address: "54, rue de Gamba - Boscongo",
        city: "POINTE-NOIRE",
        tel: "05 559 49 48",
        portable: "06 657 46 16",
        mail: "autrementecole@yahoo.fr"
      },
      {
        name: "ÉCOLE INTERNATIONALE LES PETITS PAS",
        sub_type: "Crèches - Maternelles",
        address: "Bd du Général Charles de Gaulle",
        city: "POINTE-NOIRE",
        bp: "700",
        tel: "05 521 22 56",
        mail: "lespetitpas@yahoo.fr"
      },
      {
        name: "ÉCOLE PRÉSCOLAIRE EUGÉNIE",
        sub_type: "Crèches - Maternelles",
        address: "Rue de Libondo",
        city: "POINTE-NOIRE",
        bp: "704",
        tel: "05 523 14 39"
      },
      {
        name: "ÉCOLE PRIVÉE ARC-EN-CIEL",
        sub_type: "Enseignement secondaire privé et public",
        address: "Av. Linguissi Pembelot",
        city: "POINTE-NOIRE",
        bp: "4886",
        tel: "04 436 83 75",
        portable: "06 670 70 97"
      },
      {
        name: "ÉCOLE PRIVÉE CŒUR VAILLANT",
        sub_type: "Enseignement secondaire privé et public",
        address: "Av. des Anciens Combattants - Saint-Pierre",
        city: "POINTE-NOIRE",
        bp: "5998",
        tel: "05 598 91 38"
      },
      {
        name: "ÉCOLE PRIVÉE LE PIS ALLER",
        sub_type: "Crèches - Maternelles",
        address: "Route de la Frontière - Tchimbamba",
        city: "POINTE-NOIRE",
        bp: "5988",
        tel: "06 920 71 02",
        portable: "05 530 50 90",
        mail: "lepisaller@yahoo.fr"
      },
      {
        name: "ÉCOLE PRIVÉE LE PIS ALLER",
        sub_type: "Enseignement secondaire privé et public",
        address: "Route de la Frontière - Tchimbamba",
        city: "POINTE-NOIRE",
        bp: "5988",
        tel: "06 920 71 02",
        portable: "05 530 50 90",
        mail: "lepisaller@yahoo.fr"
      },
      {
        name: "ÉCOLE PRIVÉE LES DAUPHINS",
        sub_type: "Enseignement secondaire privé et public",
        address: "Av. Sergent Malamine",
        city: "POINTE-NOIRE",
        bp: "523",
        tel: "22 294 09 13",
        portable: "06 668 54 40"
      },
      {
        name: "ÉCOLE PRIVÉE LOUIS GREGORY",
        sub_type: "Enseignement secondaire privé et public",
        address: "Route N°5 - Faubourg",
        city: "POINTE-NOIRE",
        tel: "04 487 76 33",
        portable: "04 434 47 63"
      },
      {
        name: "ESTIC GECOM",
        sub_type: "Grandes écoles",
        address: "103, av. Marien Ngouabi - Z.I. Km 4",
        city: "POINTE-NOIRE",
        bp: "8001",
        tel: "05 524 10 78",
        mail: "esticgecom@yahoo.fr"
      },
      {
        name: "EXIMIUS INTERNATIONAL SCHOOL",
        sub_type: "Enseignement secondaire privé et public",
        address: "104, av. Jacques Opangault - Z.I. Songolo",
        city: "POINTE-NOIRE",
        tel: "06 878 89 39",
        web: "www.eximiusinternationalschool.com"
      },
      {
        name: "FRANCOIS RENÉ DE CHÂTEAUBRIAND",
        sub_type: "Enseignement secondaire privé et public",
        address: "Bd Moé Kaat Matou - Lumumba",
        city: "POINTE-NOIRE",
        bp: "4316",
        tel: "06 653 55 26",
        portable: "06 664 76 24"
      },
      {
        name: "GROUPE SCOLAIRE DOM HELDER CAMARA",
        sub_type: "Enseignement secondaire privé et public",
        address: "Av. Barthélémy Boganda",
        city: "POINTE-NOIRE",
        bp: "5709",
        tel: "06 673 82 82",
        portable: "05 520 38 59",
        mail: "samuelbatis@yahoo.fr"
      },
      {
        name: "GROUPE SCOLAIRE FANOE LIZABU",
        sub_type: "Enseignement secondaire privé et public",
        address: "Av. François Charles",
        city: "POINTE-NOIRE",
        bp: "5514",
        tel: "06 625 43 90",
        mail: "gsf_congo@yahoo.fr"
      },
      {
        name: "HAUTE ÉCOLE LÉONARD DE VINCI",
        sub_type: "Grandes écoles",
        address: "76, av. Barthélémy Boganda",
        city: "POINTE-NOIRE",
        tel: "05 600 04 05",
        portable: "06 663 56 96",
        mail: "heleodevinci@gmail.com",
        web: "www. heleodevinci.com"
      },
      {
        name: "HEMIP",
        sub_type: "Grandes écoles",
        address: "9, av. de l'Emeraude",
        city: "POINTE-NOIRE",
        tel: "06 939 28 90",
        portable: "05 383 83 17",
        mail: "hemilapercee@yahoo.fr"
      },
      {
        name: "INSTITUT CARDINAL ÉMILE BIAYENDA",
        sub_type: "Enseignement secondaire privé et public",
        address: "Av. de l'Indépendance - Tié-Tié",
        city: "POINTE-NOIRE",
        tel: "05 530 73 59",
        portable: "06 661 50 67"
      },
      {
        name: "INSTITUT INTERNATIONAL 2I",
        sub_type: "Grandes écoles",
        address: "6 rue Li-Lelemb, base industrielle de TotalEnergies EP Congo",
        city: "POINTE-NOIRE",
        tel: "06 915 50 01",
        web: "http://institut-international-2i.com/"
      },
      {
        name: "INSTITUT POLYTECHNIQUE PIERRE PRIE",
        sub_type: "Enseignement secondaire privé et public",
        address: "Rue Tchibongolo - Camp 31 juillet",
        city: "POINTE-NOIRE",
        bp: "1598",
        tel: "05 530 27 09",
        portable: "06 622 22 89",
        mail: "nsatoud@yahoo.fr"
      },
      {
        name: "INSTITUT SAINT NICOLAS",
        sub_type: "Enseignement secondaire privé et public",
        address: "Av. Bitélika Ndombi - Aéroport",
        city: "POINTE-NOIRE",
        bp: "4235",
        tel: "06 663 31 61"
      },
      {
        name: "INSTITUT SUPÉRIEUR DE COMPTABILITE",
        sub_type: "Grandes écoles",
        address: "71, av. Antonio Agostinho Néto",
        city: "POINTE-NOIRE",
        bp: "4886",
        tel: "04 436 83 75",
        mail: "ispnc@yahoo.fr"
      },
      {
        name: "IS INDUSTRIE CONGO (Institut de Soudure)",
        sub_type: "Formation professionnelle",
        address: "26, av. du Havre - Imm. Unicongo",
        city: "POINTE-NOIRE",
        bp: "1713",
        tel: "06 961 63 39",
        mail: "s.elkadi@institutdesoudure.com",
        web: "www.isgroupe.com"
      },
      {
        name: "IST-AC",
        sub_type: "Grandes écoles",
        address: "Av. Benoît Loembet - Z.I. Km 4",
        city: "POINTE-NOIRE",
        bp: "871",
        tel: "05 524 59 55",
        mail: "info.pnr@ist.ac"
      },
      {
        name: "IST-EC (Institut Supérieur de Technologie d’Afrique Centrale)",
        sub_type: "Formation professionnelle",
        address: "Av. Benoît Loembet - Z.I. KM 4",
        city: "POINTE-NOIRE",
        bp: "871",
        tel: "05 524 59 55",
        mail: "info.pnr@ist.ac"
      },
      {
        name: "LYCÉE FRANCAIS CHARLEMAGNE",
        sub_type: "Enseignement secondaire privé et public",
        address: "Allée de Makinda - Près du Tribunal de Commerce",
        city: "POINTE-NOIRE",
        bp: "1256",
        tel: "05 516 14 90",
        mail: "sec.ecole@lycee-charlemangne.org"
      },
      {
        name: "LYCÉE FRANCAIS CHARLEMAGNE (Section Primaire)",
        sub_type: "Enseignement secondaire privé et public",
        address: "Av. Emmanuel Dadet",
        city: "POINTE-NOIRE",
        bp: "1256",
        tel: "05 310 12 34",
        mail: "sec.ecole@lycee-charlemangne.org"
      },
      {
        name: "SERICOM CONGO",
        sub_type: "Formation professionnelle",
        address: "225, av. de Kingambo",
        city: "POINTE-NOIRE",
        bp: "1023",
        tel: "06 664 34 81"
      },
      {
        name: "SERVTEC",
        sub_type: "Formation professionnelle",
        address: "Ngoyo",
        city: "POINTE-NOIRE",
        tel: "05 376 76 03",
        mail: "servtec.formation@servtec-congo.com"
      },
      {
        name: "SUECO",
        sub_type: "Formation professionnelle",
        address: "3, Av. Moé Téli",
        city: "POINTE-NOIRE",
        bp: "667",
        tel: "22 294 04 43",
        mail: "suecoeec@yahoo.fr"
      },
      {
        name: "THE YOUNG TEACHERS SCHOOL",
        sub_type: "Ecole de langues",
        address: "Av. Jean Félix Tchicaya - Rex",
        city: "POINTE-NOIRE",
        bp: "508",
        tel: "05 539 94 06",
        portable: "06 677 07 70",
        mail: "teacherschoolmail@gmail.com"
      },
      {
        name: "THE YOUNG TEACHERS SCHOOL",
        sub_type: "Formation professionnelle",
        address: "Av. Jean Félix Tchicaya - Rex",
        city: "POINTE-NOIRE",
        bp: "508",
        tel: "05 539 94 06",
        mail: "teacherschoolmail@gmail.com"
      },
      {
        name: "UNIVERSITÉ DE LOANGO",
        sub_type: "Universités",
        address: "Av. Barthélémy Boganda",
        city: "POINTE-NOIRE",
        bp: "336",
        tel: "05 553 44 53",
        portable: "06 922 96 76"
      }
    ];

    if (currentCount !== items.length) {
      console.log("Seeding portfolio items for ENSEIGNEMENT ET FORMATION...");
      await db.query("DELETE FROM portfolio_items WHERE category_id = $1", [catId]);

      for (const item of items) {
        await db.query(
          `INSERT INTO portfolio_items 
          (category_id, name, sub_type, address, city, bp, tel, fax, mail, web) 
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [catId, item.name, item.sub_type, (item as any).address || null, (item as any).city || null, (item as any).bp || null, (item as any).tel || (item as any).portable || null, (item as any).fax || null, (item as any).mail || null, (item as any).web || null]
        );
      }
      console.log(`Seeded ${items.length} portfolio items for ENSEIGNEMENT ET FORMATION`);
    }
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
        (category_id, name, sub_type, address, city, bp, tel, fax, mail, web) 
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [catId, item.name, item.sub_type, (item as any).address || null, (item as any).city || null, (item as any).bp || null, (item as any).tel || null, (item as any).fax || null, (item as any).mail || null, (item as any).web || null]
      );
    }
    console.log(`Seeded ${items.length} portfolio items for TRANSPORTS AÉRIEN, MARITIME ET TERRESTRE`);
  } catch (err) {
    console.error("Failed to seed transports items:", err);
  }
}

async function seedCoiffureEsthetiqueItems() {
  try {
    const catResult = await db.query("SELECT id FROM categories WHERE name = 'COIFFURE ET ESTHÉTIQUE'");
    if (catResult.rows.length === 0) return;
    const catId = catResult.rows[0].id;

    const itemsCountResult = await db.query("SELECT COUNT(*) as count FROM portfolio_items WHERE category_id = $1", [catId]);
    const currentCount = parseInt(itemsCountResult.rows[0].count);

    const items = [
      // Brazzaville
      {
        name: "AFROSPHÈRE",
        sub_type: "Salons de coiffure",
        address: "Rue Louis Tréchot",
        city: "BRAZZAVILLE",
        tel: "22 604 71 04",
        mail: "contact@afro-sphere.com"
      },
      {
        name: "BEAUTIFUL",
        sub_type: "Instituts de beauté",
        address: "80, rue Mayama - Moungali",
        city: "BRAZZAVILLE",
        tel: "05 387 02 95",
        mail: "beautifull251@yahoo.fr"
      },
      {
        name: "CENTRE DE BIEN-ÊTRE",
        sub_type: "Salons de coiffure",
        address: "Imm. CNSS - Rond-point City Center",
        city: "BRAZZAVILLE",
        tel: "04 409 49 49"
      },
      {
        name: "DESTINY’S BEAUTY",
        sub_type: "Instituts de beauté",
        address: "Av. de la Tsiémé - Ouenzé",
        city: "BRAZZAVILLE",
        tel: "06 519 11 50",
        portable: "06 858 37 58"
      },
      {
        name: "EBONNE ESPACE BEAUTÉ",
        sub_type: "Instituts de beauté",
        address: "155, rue Bonga - Face Pressing 5 à sec",
        city: "BRAZZAVILLE",
        tel: "05 692 92 95"
      },
      {
        name: "LA BEAUTÉ CHINOISE",
        sub_type: "Instituts de beauté",
        address: "1, rue Paul Kamba - Poto-Poto",
        city: "BRAZZAVILLE",
        tel: "05 553 16 03"
      },
      {
        name: "MÈCHE A MÈCHE",
        sub_type: "Salons de coiffure",
        address: "Av. William Guynet",
        city: "BRAZZAVILLE",
        tel: "06 655 29 47"
      },
      {
        name: "SERENITY CONGO",
        sub_type: "Instituts de beauté",
        address: "108, rue de la Musique Tambourinée",
        city: "BRAZZAVILLE",
        tel: "05 510 50 16",
        portable: "06 953 76 78",
        web: "www.serenityspa-congo.com"
      },
      {
        name: "VILLA SERENITY SPA",
        sub_type: "Salons de coiffure",
        address: "108 Rue de la Musique Tambourinée",
        city: "BRAZZAVILLE",
        tel: "05 510 50 16",
        portable: "06 953 76 78",
        web: "www.serenityspa-congo.com"
      },
      // Pointe-Noire
      {
        name: "AMANI",
        sub_type: "Instituts de beauté",
        address: "Av. Moé Kaat Matou",
        city: "POINTE-NOIRE",
        tel: "06 617 06 63",
        portable: "06 629 83 39"
      },
      {
        name: "Comptoir du Bien-être",
        sub_type: "Instituts de beauté",
        address: "Av. Linguissi Pembelot, non loin ex bâta, en diagonale de l’immeuble des officiers",
        city: "POINTE-NOIRE",
        tel: "05 001 30 00",
        portable: "05 000 88 99"
      },
      {
        name: "ETHNIC-HAIR",
        sub_type: "Salons de coiffure",
        address: "Av. Gustave Ondziel - Z.I. Km 4",
        city: "POINTE-NOIRE",
        tel: "05 399 99 29"
      },
      {
        name: "INSITUT AUDY HAIR",
        sub_type: "Salons de coiffure",
        address: "Marché Plateau",
        city: "POINTE-NOIRE",
        tel: "06 659 38 54",
        mail: "blande2033@yahoo.fr"
      },
      {
        name: "L et LUI",
        sub_type: "Instituts de beauté",
        address: "29, rue Emmanuel Dadet",
        city: "POINTE-NOIRE",
        tel: "05 559 53 50"
      },
      {
        name: "L ET LUI",
        sub_type: "Salons de coiffure",
        address: "Av. Emmanuel Dadet",
        city: "POINTE-NOIRE",
        bp: "489",
        tel: "05 559 53 50"
      },
      {
        name: "MANO A MANO",
        sub_type: "Instituts de beauté",
        address: "Av. Stéphane Tchitchelle - Face ACS",
        city: "POINTE-NOIRE",
        tel: "05 628 57 57"
      },
      {
        name: "MÈCHE CAPI",
        sub_type: "Salons de coiffure",
        address: "Av. Jacques Opangault - Camp 31 juillet",
        city: "POINTE-NOIRE",
        tel: "05 598 17 17",
        mail: "mimichpnr@yahoo.fr"
      },
      {
        name: "Salon espace coiffure mixte Hôtel l’orchidée",
        sub_type: "Salons de coiffure",
        address: "Avenu de l'émeraude, centre-ville",
        city: "POINTE-NOIRE",
        tel: "05 507 57 53",
        portable: "06 661 94 11"
      },
      {
        name: "SECRET DES SENS",
        sub_type: "Instituts de beauté",
        address: "16, rue Nemba - Face au Camp du 31 juillet",
        city: "POINTE-NOIRE",
        tel: "06 814 16 76",
        mail: "secretdessens.pointenoire@gmail.com"
      },
      {
        name: "SEVEN STYLE",
        sub_type: "Salons de coiffure",
        address: "Av. Moé Kaat Matou - Lumumba",
        city: "POINTE-NOIRE",
        tel: "06 671 74 04",
        portable: "05 098 03 99"
      },
      {
        name: "TOP NAILS",
        sub_type: "Instituts de beauté",
        address: "Av. Denis Goma",
        city: "POINTE-NOIRE",
        tel: "06 674 66 46"
      }
    ];

    if (currentCount !== items.length) {
      console.log("Seeding portfolio items for COIFFURE ET ESTHÉTIQUE...");
      await db.query("DELETE FROM portfolio_items WHERE category_id = $1", [catId]);

      for (const item of items) {
        await db.query(
          `INSERT INTO portfolio_items 
          (category_id, name, sub_type, address, city, bp, tel, fax, mail, web) 
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [catId, item.name, item.sub_type, (item as any).address || null, (item as any).city || null, (item as any).bp || null, (item as any).tel || (item as any).portable || null, (item as any).fax || null, (item as any).mail || null, (item as any).web || null]
        );
      }
      console.log(`Seeded ${items.length} portfolio items for COIFFURE ET ESTHÉTIQUE`);
    }
  } catch (err) {
    console.error("Failed to seed coiffure items:", err);
  }
}


// Vercel serverless handler export
let appPromise: Promise<express.Express> | null = null;

async function getApp(): Promise<express.Express> {
  if (!appPromise) {
    appPromise = startServer();
  }
  return appPromise;
}

// Export handler for Vercel
export default async function handler(req: any, res: any) {
  try {
    const app = await getApp();
    return app(req, res);
  } catch (err: any) {
    console.error("Vercel handler error:", err);
    res.status(500).json({ error: "Server initialization failed", details: err.message });
  }
}

// Only start server in non-Vercel environments
if (!process.env.VERCEL) {
  startServer();
  console.log("Server script execution reached the end.");
}
