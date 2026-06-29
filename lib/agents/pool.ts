// Shared PostgreSQL pool for the AI agents module.
// Reuses the same DATABASE_URL as the main api/index.ts. Pool instances are
// process-scoped — Vercel warm functions reuse the same process so this is safe.
import pg from "pg";

let _pool: pg.Pool | null = null;
export function pool(): pg.Pool {
  if (!_pool) {
    _pool = new pg.Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
      max: 3, // smaller pool for agent jobs to leave headroom for user traffic
    });
  }
  return _pool;
}

export async function query(text: string, params: any[] = []) {
  return pool().query(text, params);
}
