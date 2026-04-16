# SmartBusiness - PRD

## Architecture
- Frontend: React 19 + Vite + Tailwind (static on Vercel)
- Backend: `api/index.ts` standalone Express serverless (PostgreSQL only)
- DB: PostgreSQL (Neon) - auto-init tables
- Auth: JWT cookies httpOnly
- URL: https://www.tbi-crm.pro

## Implemented
- Standalone `api/index.ts` with all routes (no server.ts dependency)
- Auto DB init + admin seeding
- **Data purge** endpoint + all CRM data reset to 0
- **Documents module**: upload (base64), list, preview, download, delete
- **Sessions tracking**: logs every login (IP, user-agent, timestamp)
- **Agent isolation**: customers/leads scoped to agent_id (admin sees all)
- **Admin Sessions page**: filterable by user/date

## Agent Data Isolation
- Customers: agent_id column, agents see only their own
- Leads: agent_id column, agents see only their own
- Quotes/Invoices/Calls: already have agent_id
- Admin sees everything

## Backlog
- P1: File uploads via cloud storage (Vercel Blob)
- P2: Cold start optimization
- P2: Email sending for quote links
