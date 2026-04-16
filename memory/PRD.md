# SmartBusiness - PRD

## Problem Statement
Déploiement Vercel - fonction serverless crash (FUNCTION_INVOCATION_FAILED) à cause de better-sqlite3 (module C++ natif)

## Architecture
- Frontend: React 19 + Vite + Tailwind (static on Vercel)
- Backend: `api/index.ts` standalone Express serverless (PostgreSQL only)
- DB: PostgreSQL (Neon) - auto-init tables on first request
- Auth: JWT cookies httpOnly
- URL: https://www.tbi-crm.pro

## Implemented
- Standalone `api/index.ts` with all 60+ routes (no server.ts dependency)
- Auto DB table creation + admin seeding
- Health check verified working on production

## Backlog
- P1: File uploads (Vercel Blob/Cloudinary)
- P2: Cold start optimization
