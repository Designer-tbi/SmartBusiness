# SmartBusiness CRM — PRD

## Original problem statement
Massive overhaul and debugging of the CRM application (SmartBusiness). Core requests:
- Restore accidentally purged data (seed)
- Fix broken UI buttons (Commissions, Objectives, Activities)
- Build Agent & Admin Dashboards
- Automate the entire CRM conversion pipeline (Lead → Customer → Quote → Invoice → Commission)
- Integrate PayPal (one-time + subscriptions)
- Agent data isolation (multi-agent SaaS)
- Fix timezone calendar bugs
- Country-specific UI settings (RDC, Congo, France, USD/XAF/CDF, phone codes)
- Integrate SmartDesk API to auto-provision accounts + email credentials upon payment
- Refactor large `api/index.ts` into modules

## Tech stack
- Frontend: React 19 + Vite + TailwindCSS
- Backend: Express running as Vercel Serverless Function (`api/index.ts`)
- DB: PostgreSQL (Neon)
- Email: Nodemailer + OVH SMTP
- Payments: PayPal (REST API direct, Live mode)
- External: SmartDesk API for account provisioning

## Production URL
https://smart-business-sigma.vercel.app

## User language
French (fr-FR)

## Architecture (after refactor 2026-02)
```
/app/
├── api/
│   ├── index.ts           # Routes only (1679 lines)
│   └── _lib/
│       ├── auth.ts        # JWT + authenticateToken
│       ├── automation.ts  # CRM chain automation
│       ├── db.ts          # Pool + ensureDbInitialized + schema
│       ├── mailer.ts      # SMTP OVH
│       ├── paypal.ts      # PayPal Live API helpers
│       └── smartdesk.ts   # SmartDesk provisioning + welcome email
├── src/
│   ├── pages/             # React pages (Leads, Quotes, Dashboards, AgentPayments, ...)
│   ├── lib/countryConfig  # XAF/CDF/USD/EUR routing
│   └── ...
```

## What's been implemented (CHANGELOG)

### Feb 2026
- ✅ DB seeded with realistic demo data
- ✅ Agent & Admin Dashboards
- ✅ Automated CRM sync (Lead→Customer→Invoice→Commission at 20%)
- ✅ Fix Lead conversion (phone NULL constraint, missing fields)
- ✅ Fix Calendar timezone date shifting (noon UTC trick)
- ✅ Public preview pages for Quotes & Invoices
- ✅ PayPal Live integration (one-time + subscription) with signature gating
- ✅ Fix delete cascade for Quotes/Invoices
- ✅ Country-specific UI (phone codes, currencies, city dropdowns)
- ✅ Agent data isolation (Portfolio, Leads, Opportunities by agent_id)
- ✅ Comments sections (expandable in CRM lists)
- ✅ RDC zone defaults to USD
- ✅ SmartDesk auto-provisioning via EXTERNAL_API_KEY on payment
- ✅ Manual "Re-provisionner" admin button
- ✅ Fix PayPal 401 silent error (PAYPAL_MODE=live alignment + verbose errors + enableFunding:card)
- ✅ **New page "Mes Paiements"** (`/payments`) — agent view of paid quotes + commissions + SmartDesk status with 20s polling
- ✅ **Refactor `api/index.ts`**: 2192 → 1679 lines, extracted 6 helper modules (db, auth, mailer, automation, paypal, smartdesk). Pure refactor, 23/23 production tests pass.
- ✅ **Livraison 1** (28 fév): Catégories CRUD (PUT/DELETE), Portfolio statuts gagne/perdu/à_recontacter + champ lost_reason, Catalogue Edit/Delete produits, opportunités persistent agent_id, nextMonthlyNumber DEV-YYYY-MM-NNN. ⚠️ Code en place, déploiement Vercel en attente (Save to GitHub).
- ✅ **Livraison 2** (28 fév): Page Paiements enrichie (colonne Produit/Service + Date en 2e position, recherche par produit), Portfolio admin filter par utilisateur (dropdown Tous les utilisateurs), Catégories avec créateur affiché ("Créé par X"), établissements avec agent affiché ("Agent: X"). Bug totaux concaténés corrigé dans Opportunities.tsx + Tracking.tsx (Number() wrap).
- ✅ **Équipe IA TBI Technology** (28 fév) — Super Admin uniquement
  - 13 agents IA hiérarchisés : Eden (CEO) → Timothy/Flore/Paul (Directors) → 9 sous-agents
  - Claude Sonnet 4.6 via clé Anthropic utilisateur (ANTHROPIC_API_KEY)
  - 30+ endpoints `/api/agents/*` (superadmin guard)
  - Page `/ai-team` avec org chart interactif, panneau d'action par agent, historique runs IA
  - Table `agent_runs` (logs durée, statut, input, output, errors)
  - LinkedIn par agent (mode simulation par défaut, real API si token OAuth présent)
  - Adapter `internalCRM.ts` (direct DB calls, remplace l'HTTP adapter du prototype original)
- ✅ **Livraison AI Massive** (4 mars 2026) — Multiples améliorations IA + mobile
  - Migration vers **Claude Fable 5** avec `thinking: {type: "adaptive"}` (native fetch, PAS de @anthropic-ai/sdk pour éviter FUNCTION_INVOCATION_FAILED)
  - Backend monolithique `/api/agents.ts` (1500+ lignes, NE PAS SPLITTER — casse le bundle Vercel)
  - **Command Bar globale** : chat conversationnel flottant avec tous les agents (`POST /api/agents/:agentId/chat`)
  - **104 capacités fixes** + **Action libre** (u-free) permettant exécution de n'importe quelle tâche en texte libre
  - **Outils externes** (Web Fetching) : `POST /api/agents/tools/fetch-url`, `/analyze`, `/extract-to-crm` — permet aux agents de scraper le web et injecter directement dans le CRM
  - Composant `ExternalToolsPanel` sur `/ai-team` pour piloter ces outils
  - **UI mobile-first globale** : hamburger drawer, sidebar avec départements + badges `[IA]`, `.responsive-table` CSS (tables collapse en cards mobile), safe-areas iOS
  - **OAuth LinkedIn 3-legged** : `/api/agents/oauth/linkedin/:agentId/start` + callback, tokens stockés par agent dans `agent_linkedin_tokens`. Nécessite `LINKEDIN_CLIENT_ID_<AGENT>` + `LINKEDIN_CLIENT_SECRET_<AGENT>` dans Vercel env.
  - **AI-to-CRM Write** : les agents écrivent directement dans `leads`, `quotes`, `reports` via `internalCRM` adapter
  - **Fix SQL** (4 mars) : `/api/agents/runs/recent` — CASE mixant jsonb + text → utilisation de `to_jsonb('<<truncated>>'::text)`
- ✅ **Livraison Temps Réel + Honnêteté LinkedIn** (4 mars 2026, prêt à déployer)
  - **SSE Streaming Chat** (`POST /api/agents/:agentId/chat/stream`) : réponses Claude Fable 5 mot-par-mot en temps réel dans la Command Bar
  - **`streamClaude()`** async-generator qui parse les SSE d'Anthropic et yield chaque text_delta
  - **`startRun`/`finishRun`** helpers pour tracker les runs IA `status='running'` avec durée écoulée
  - **`GET /api/agents/runs/live`** : liste des tâches IA actuellement en cours (< 10min)
  - **Presence** (`POST /api/presence/heartbeat` + `GET /api/presence/online`) : table `user_presence`, timeout 60s
  - **Hooks React** : `useLivePoll` (polling 3s tab-visibility aware avec détection nouveautés) + `usePresence` (heartbeat 20s)
  - **Composants** : `<LiveBadge>` (dot pulsant), `<PresenceIndicator>` (cluster avatars + popover), `<LiveRunsPanel>` (cartes tâches IA en cours)
  - **Pages CRM live** : Leads, Devis, Factures avec auto-refresh 3s + badge "🟢 Nouveau" sur nouveaux items (auto-clear 15s)
  - **LinkedIn honnêteté** : les fonctions `liSendMessage/liSendConnection/liPublishPost/liSearchProspects` ne mentent plus. Au lieu de retourner `success:true` en simulation silencieuse, elles renvoient `{success:false, simulated:true, error, reason, workaround}` avec la vraie raison (Marketing Developer Platform requis pour messages, etc.)
  - **UI transparence** : Panel AgentPanel affiche bannière amber "⚠️ Action NON exécutée en réel" (data-testid=`agent-result-simulated`) ou emerald "✅ Exécuté en temps réel" (data-testid=`agent-result-live`) selon `result.simulated`/`result.live`

## Backlog / Roadmap

### P1
- Stats de conversion: tunnel Devis envoyés → signés → payés
- Modaliser tous les formulaires restants en popup (Leads, Opportunités, Clients, Devis…)
- Vérification temporelle de la remise à 0 mensuelle des numérotations devis/factures
- Filtre admin Catégories : extension à toutes les autres entités (Opportunités, Clients, Devis)
- 13 tokens LinkedIn OAuth (1 par agent IA) pour passer du mode simulation à l'API réelle

### P2
- Badge visuel statut provisioning SmartDesk sur page Devis admin
- Email automatique à l'agent quand son devis est payé
- Webhooks PayPal pour gérer remboursements / disputes
- Export CSV des paiements pour comptabilité

### P3
- Advanced Card Fields PayPal (formulaire carte inline sans popup) si compte ACDC éligible
- Split frontend bundle (code splitting via dynamic imports) — bundle actuel 1.28MB

## Key API endpoints
- `POST /api/auth/login` — JWT cookie 'token'
- `GET /api/auth/me` — current user
- `GET /api/customers|leads|opportunities|quotes|invoices|commissions` — auth, agent-isolated
- `GET /api/agent/payments` — paid quotes + commission + SmartDesk status
- `POST /api/quotes/:id/smartdesk/provision` — manual retry
- `POST /api/public/quotes/:id/paypal/create-order` — PayPal one-time
- `POST /api/public/quotes/:id/paypal/subscription-plan` — PayPal sub
- `GET /api/public/paypal/config` — exposes clientId + mode

## Env vars (Vercel)
- `DATABASE_URL` (Neon)
- `JWT_SECRET`
- `PAYPAL_MODE=live`
- `PAYPAL_CLIENT_ID` / `PAYPAL_CLIENT_SECRET` (Live)
- `EXTERNAL_API_KEY` (SmartDesk)
- `SMARTDESK_API_URL` (SmartDesk)
- `SMTP_FROM` (optional, default demo@smart-desk.pro)
- `ANTHROPIC_API_KEY` ⚡ — clé Claude Fable 5 (le user a fourni sa propre clé, PAS emergent llm key)
- `CLAUDE_MODEL` (default: claude-fable-5)
- `CLAUDE_MAX_TOKENS` (default: 4096)
- `LINKEDIN_CLIENT_ID_<AGENT_UC>` + `LINKEDIN_CLIENT_SECRET_<AGENT_UC>` — OAuth 3-legged flow (ex: `LINKEDIN_CLIENT_ID_TIMOTHY`). Sinon mode simulation.
- `LINKEDIN_REDIRECT_URI` (optionnel, default: https://smart-business-sigma.vercel.app/api/agents/oauth/linkedin/callback)

## Test credentials
See `/app/memory/test_credentials.md`

## Regression test suite
`/app/backend/tests/test_production_api.py` — 23 tests covering health, auth, all list endpoints, admin/superadmin, PayPal flow.
Run: `cd /app && python -m pytest backend/tests/test_production_api.py -v`
