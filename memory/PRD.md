# SmartBusiness CRM — PRD

## Architecture
- Frontend: React 19 + Vite + Tailwind (static on Vercel via `/dist`)
- Backend: `api/index.ts` standalone Express serverless function (PostgreSQL only)
- DB: PostgreSQL (Neon) — auto-init tables on first request
- Auth: JWT cookies httpOnly, SameSite=Lax
- Local dev fallback: `server.ts` with SQLite for development only
- Production URL: https://www.tbi-crm.pro

## User Roles
- `superadmin` — full access (eden@tbi-center.fr)
- `admin` — full access except deactivating superadmin
- `agent` — sees only own data (customers, leads, quotes, invoices, commissions, objectives)

## Implemented (Feb 2026)
### CRM Automation Chain — NEW
- **Devis Signé** (PUT admin ou public sign) → **Facture créée automatiquement** (statut "En attente")
- **Facture marquée Payée** (PUT `/api/invoices/:id`) → **Commission 20% créée automatiquement**
- Idempotent : pas de doublon si invoice/commission existe déjà
- Helpers centralisés : `autoCreateInvoiceFromQuote()`, `autoCreateCommissionFromInvoice()`
- Constante `COMMISSION_RATE = 20` (modifiable globalement)
- Bouton "✓ Marquer comme payée" sur chaque facture déclenche auto-commission

### Foundation
- Vercel serverless deployment via `api/index.ts`
- Auto DB init + admin seeding (eden@tbi-center.fr / loub@ki2014D)
- Multi-tenant Demo (15-day trial) vs Production accounts
- Multi-zone currency: CG/CM/GA/TD/CF/GQ → XAF, CD → CDF/USD, FR → EUR, etc.
- Sessions tracking with IP + user-agent

### CRM Core
- Portfolio (categories + items with NIU, address, contacts)
- Leads → Opportunities → Customers conversion pipeline
- Quotes with line items, VAT, discounts (line + global)
- Quote email sending via OVH SMTP (Nodemailer)
- Quote e-signature (public route + signature canvas)
- Quote → Invoice conversion (signed quotes)
- Invoices, Projects, Activities, Objectives, Commissions
- Documents module (base64 storage, preview, download)
- Reports module (agent submits, admin reviews + comments)

### Dashboards (Feb 2026 — NEW)
- **Agent Dashboard**: CA encaissé, devis signés, taux conversion, pipeline (prospects/opp/clients), activités (appels/RDV), commissions
- **Admin/Superadmin Dashboard**: équipe globale, top 5 agents, table de performance détaillée par agent, comparatif CA encaissé/signé
- New endpoints: `/api/stats/agent`, `/api/stats/agents-overview`

### Demo Data Seeder (Feb 2026 — NEW)
- `/api/admin/seed-demo` endpoint creates:
  - 5 agents (3 CG/XAF + 2 CD/CDF, mix demo/prod) — password `Demo2026!`
  - 5 categories + 7 portfolio items
  - 10 products (mix XAF/CDF)
  - 8 customers, 7 leads, 5 opportunities
  - 8 quotes (signed/sent/draft/refused) with line items
  - 4 invoices (mix paid/pending) auto-generated from signed quotes
  - 25 activities (calls/RDV/email/réunion across agents)
  - 15 objectives (revenue/calls/quotes per agent)
  - 4 commissions, 3 projects
- Idempotent on agents (checks email before insert)
- Triggered via "🔄 Charger les données démo" button on admin dashboard

### Bug Fixes (Feb 2026)
- Fixed superadmin role check in: Dashboard, Objectives, Commissions, Catalog, Calls, Tracking
- AuthContext role type extended to `'admin' | 'agent' | 'superadmin'`
- Portfolio item type now includes `niu` field

## Backlog
- P1: Quote text color tweaks in form (minor)
- P1: File uploads via Vercel Blob (currently disabled in serverless)
- P2: Refactor `/app/api/index.ts` (1000+ lines) into modular routes
- P2: Cold start optimization
- P2: Email reminders for expiring demo accounts
