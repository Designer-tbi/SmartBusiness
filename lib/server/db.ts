import pg from "pg";
import bcrypt from "bcryptjs";

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

export async function query(text: string, params: any[] = []) {
  const p = getPool();
  return p.query(text, params);
}

let dbInitialized = false;
export async function ensureDbInitialized() {
  if (dbInitialized) return;
  try {
    const schema = [
      "CREATE TABLE IF NOT EXISTS users (id SERIAL PRIMARY KEY, uid TEXT UNIQUE NOT NULL, email TEXT UNIQUE NOT NULL, password TEXT NOT NULL, name TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'agent', account_type TEXT NOT NULL DEFAULT 'production', is_active BOOLEAN NOT NULL DEFAULT true, first_login_at TIMESTAMP WITH TIME ZONE, deactivated_at TIMESTAMP WITH TIME ZONE, company_name TEXT, created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP)",
      "CREATE TABLE IF NOT EXISTS customers (id SERIAL PRIMARY KEY, type TEXT NOT NULL DEFAULT 'individual', first_name TEXT, last_name TEXT, company_name TEXT, name TEXT, email TEXT, phone TEXT NOT NULL, address TEXT, city TEXT, industry TEXT, created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP)",
      "CREATE TABLE IF NOT EXISTS leads (id SERIAL PRIMARY KEY, type TEXT NOT NULL DEFAULT 'individual', first_name TEXT, last_name TEXT, company_name TEXT, email TEXT, phone TEXT, source TEXT, status TEXT NOT NULL DEFAULT 'new', notes TEXT, address TEXT, city TEXT, niu TEXT, created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP)",
      "CREATE TABLE IF NOT EXISTS opportunities (id SERIAL PRIMARY KEY, customer_id INTEGER REFERENCES customers(id), lead_id INTEGER REFERENCES leads(id), title TEXT NOT NULL, amount NUMERIC, stage TEXT NOT NULL DEFAULT 'discovery', probability INTEGER, expected_close_date DATE, notes TEXT, created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP)",
      "CREATE TABLE IF NOT EXISTS calls (id SERIAL PRIMARY KEY, customer_id INTEGER REFERENCES customers(id), customer_name TEXT NOT NULL, customer_phone TEXT NOT NULL, agent_id TEXT REFERENCES users(uid), agent_name TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', notes TEXT, created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP)",
      "CREATE TABLE IF NOT EXISTS categories (id SERIAL PRIMARY KEY, name TEXT UNIQUE NOT NULL, created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP)",
      "CREATE TABLE IF NOT EXISTS portfolio_items (id SERIAL PRIMARY KEY, category_id INTEGER NOT NULL REFERENCES categories(id), name TEXT NOT NULL, sub_type TEXT, address TEXT, city TEXT, bp TEXT, tel TEXT, fax TEXT, mail TEXT, web TEXT, niu TEXT, created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP)",
      "CREATE TABLE IF NOT EXISTS products (id SERIAL PRIMARY KEY, name TEXT NOT NULL, type TEXT NOT NULL DEFAULT 'product', category TEXT, category_id INTEGER, catalog_id INTEGER, price NUMERIC NOT NULL DEFAULT 0, vat_rate NUMERIC NOT NULL DEFAULT 20, vat_rate_id INTEGER, stock INTEGER NOT NULL DEFAULT 0, unit TEXT, description TEXT, technical_file_url TEXT, created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP)",
      "CREATE TABLE IF NOT EXISTS vat_rates (id SERIAL PRIMARY KEY, label TEXT NOT NULL, rate NUMERIC NOT NULL, created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP)",
      "CREATE TABLE IF NOT EXISTS catalogues (id SERIAL PRIMARY KEY, name TEXT NOT NULL, description TEXT, is_active INTEGER DEFAULT 1, created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP)",
      "CREATE TABLE IF NOT EXISTS quotes (id SERIAL PRIMARY KEY, number TEXT UNIQUE NOT NULL, customer_id INTEGER REFERENCES customers(id), lead_id INTEGER REFERENCES leads(id), agent_id TEXT, amount NUMERIC NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'Brouillon', date DATE NOT NULL, expiry_date DATE, notes TEXT, signature TEXT, signature_date TIMESTAMP WITH TIME ZONE, signed_by TEXT, created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP)",
      "CREATE TABLE IF NOT EXISTS quote_items (id SERIAL PRIMARY KEY, quote_id INTEGER NOT NULL REFERENCES quotes(id) ON DELETE CASCADE, product_id INTEGER, description TEXT NOT NULL, quantity NUMERIC NOT NULL DEFAULT 1, unit_price NUMERIC NOT NULL DEFAULT 0, total_price NUMERIC NOT NULL DEFAULT 0, created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP)",
      "CREATE TABLE IF NOT EXISTS invoices (id SERIAL PRIMARY KEY, number TEXT UNIQUE NOT NULL, customer_id INTEGER REFERENCES customers(id), quote_id INTEGER REFERENCES quotes(id), agent_id TEXT, amount NUMERIC NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'En attente', date DATE NOT NULL, due_date DATE, paid_at TIMESTAMP WITH TIME ZONE, created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP)",
      "CREATE TABLE IF NOT EXISTS commissions (id SERIAL PRIMARY KEY, agent_id TEXT, invoice_id INTEGER REFERENCES invoices(id), amount NUMERIC NOT NULL DEFAULT 0, rate NUMERIC NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'En attente', date DATE NOT NULL, created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP)",
      "CREATE TABLE IF NOT EXISTS activities (id SERIAL PRIMARY KEY, type TEXT NOT NULL, subject TEXT NOT NULL, customer_id INTEGER, lead_id INTEGER, opportunity_id INTEGER, agent_id TEXT, status TEXT NOT NULL DEFAULT 'À faire', date TIMESTAMP WITH TIME ZONE NOT NULL, notes TEXT, created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP)",
      "CREATE TABLE IF NOT EXISTS projects (id SERIAL PRIMARY KEY, name TEXT NOT NULL, customer_id INTEGER, status TEXT NOT NULL DEFAULT 'En cours', start_date DATE, end_date DATE, description TEXT, created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP)",
      "CREATE TABLE IF NOT EXISTS objectives (id SERIAL PRIMARY KEY, agent_id TEXT, type TEXT NOT NULL, target_value NUMERIC NOT NULL, period TEXT NOT NULL, start_date TEXT NOT NULL, end_date TEXT NOT NULL, status TEXT DEFAULT 'En cours', created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP)",
      "CREATE TABLE IF NOT EXISTS documents (id SERIAL PRIMARY KEY, name TEXT NOT NULL, file_name TEXT NOT NULL, file_type TEXT, file_size INTEGER, file_data TEXT, customer_id INTEGER, quote_id INTEGER, invoice_id INTEGER, uploaded_by TEXT, notes TEXT, created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP)",
      "CREATE TABLE IF NOT EXISTS sessions (id SERIAL PRIMARY KEY, user_uid TEXT NOT NULL, user_email TEXT NOT NULL, user_name TEXT NOT NULL, user_role TEXT NOT NULL, ip_address TEXT, user_agent TEXT, logged_in_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP, logged_out_at TIMESTAMP WITH TIME ZONE)",
      "ALTER TABLE customers ADD COLUMN IF NOT EXISTS agent_id TEXT",
      "ALTER TABLE leads ADD COLUMN IF NOT EXISTS agent_id TEXT",
      "ALTER TABLE leads ADD COLUMN IF NOT EXISTS address TEXT",
      "ALTER TABLE leads ADD COLUMN IF NOT EXISTS city TEXT",
      "ALTER TABLE leads ADD COLUMN IF NOT EXISTS niu TEXT",
      "ALTER TABLE portfolio_items ADD COLUMN IF NOT EXISTS niu TEXT",
      "ALTER TABLE users ADD COLUMN IF NOT EXISTS account_type TEXT DEFAULT 'production'",
      "ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true",
      "ALTER TABLE users ADD COLUMN IF NOT EXISTS first_login_at TIMESTAMP WITH TIME ZONE",
      "ALTER TABLE users ADD COLUMN IF NOT EXISTS deactivated_at TIMESTAMP WITH TIME ZONE",
      "ALTER TABLE users ADD COLUMN IF NOT EXISTS company_name TEXT",
      "ALTER TABLE users ADD COLUMN IF NOT EXISTS zone TEXT DEFAULT 'CG'",
      "ALTER TABLE products ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'XAF'",
      "ALTER TABLE quotes ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'UNPAID'",
      "ALTER TABLE quotes ADD COLUMN IF NOT EXISTS payment_id TEXT",
      "ALTER TABLE quotes ADD COLUMN IF NOT EXISTS payment_method TEXT",
      "ALTER TABLE quotes ADD COLUMN IF NOT EXISTS payment_date TIMESTAMP WITH TIME ZONE",
      "ALTER TABLE quotes ADD COLUMN IF NOT EXISTS payment_amount NUMERIC",
      "ALTER TABLE quotes ADD COLUMN IF NOT EXISTS payment_currency TEXT",
      "ALTER TABLE invoices ADD COLUMN IF NOT EXISTS notes TEXT",
      "ALTER TABLE products ADD COLUMN IF NOT EXISTS billing_type TEXT DEFAULT 'one_time'",
      "ALTER TABLE products ADD COLUMN IF NOT EXISTS billing_period TEXT DEFAULT NULL",
      "ALTER TABLE products ADD COLUMN IF NOT EXISTS paypal_plan_id TEXT DEFAULT NULL",
      "ALTER TABLE quotes ADD COLUMN IF NOT EXISTS subscription_id TEXT DEFAULT NULL",
      "ALTER TABLE portfolio_items ADD COLUMN IF NOT EXISTS agent_id TEXT",
      "ALTER TABLE leads ADD COLUMN IF NOT EXISTS currency TEXT",
      "ALTER TABLE customers ADD COLUMN IF NOT EXISTS currency TEXT",
      "ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS currency TEXT",
      `CREATE TABLE IF NOT EXISTS comments (
        id SERIAL PRIMARY KEY,
        entity_type TEXT NOT NULL,
        entity_id INTEGER NOT NULL,
        author_id TEXT,
        author_name TEXT,
        content TEXT NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )`,
      "CREATE INDEX IF NOT EXISTS idx_comments_entity ON comments(entity_type, entity_id)",
      "ALTER TABLE documents ADD COLUMN IF NOT EXISTS tag TEXT",
      "CREATE TABLE IF NOT EXISTS reports (id SERIAL PRIMARY KEY, agent_id TEXT NOT NULL, agent_name TEXT NOT NULL, title TEXT NOT NULL, period_start DATE NOT NULL, period_end DATE NOT NULL, calls_count INTEGER DEFAULT 0, meetings_count INTEGER DEFAULT 0, quotes_count INTEGER DEFAULT 0, quotes_amount NUMERIC DEFAULT 0, new_leads INTEGER DEFAULT 0, new_customers INTEGER DEFAULT 0, invoices_amount NUMERIC DEFAULT 0, summary TEXT, challenges TEXT, next_actions TEXT, status TEXT DEFAULT 'submitted', created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP)",
      "CREATE TABLE IF NOT EXISTS report_comments (id SERIAL PRIMARY KEY, report_id INTEGER NOT NULL REFERENCES reports(id) ON DELETE CASCADE, author_id TEXT NOT NULL, author_name TEXT NOT NULL, author_role TEXT NOT NULL, content TEXT NOT NULL, created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP)",
    ];
    for (const s of schema) { await query(s); }
    // Seed superadmin
    const adminCheck = await query("SELECT * FROM users WHERE email = $1", ['eden@tbi-center.fr']);
    if (adminCheck.rows.length === 0) {
      const hashedPassword = await bcrypt.hash('loub@ki2014D', 10);
      const uid = Math.random().toString(36).substring(2, 15);
      await query("INSERT INTO users (uid, email, password, name, role, account_type, is_active) VALUES ($1, $2, $3, $4, $5, $6, $7)", [uid, 'eden@tbi-center.fr', hashedPassword, 'Admin Eden', 'superadmin', 'production', true]);
    } else {
      // Ensure existing admin is superadmin
      await query("UPDATE users SET role = 'superadmin', account_type = 'production', is_active = true WHERE email = 'eden@tbi-center.fr'");
    }
    dbInitialized = true;
    console.log("Database initialized successfully");
  } catch (err) {
    console.error("DB init error:", err);
  }
}
