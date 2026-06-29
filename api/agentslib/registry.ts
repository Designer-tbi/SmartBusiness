// registry.ts — Agent catalog metadata (used by the Super Admin UI org chart)
// and helpers to log every agent run into the `agent_runs` table.
import { query } from "./pool";

export type AgentMeta = {
  id: string;
  name: string;
  role: string;
  email: string;
  reportsTo: string | null;
  level: "C-suite" | "Director" | "Specialist";
  department: "Direction" | "Commercial" | "RH" | "Finance";
  avatar: string; // emoji fallback
  color: string;  // tailwind base
  linkedin?: string;
  connections?: number;
  capabilities: { id: string; label: string; description: string; endpoint: string; method: "GET" | "POST"; needsBody?: boolean }[];
};

export const AGENTS: AgentMeta[] = [
  {
    id: "eden",
    name: "Eden",
    role: "Directeur Général (CEO)",
    email: "eden.dg@tbi-center.fr",
    reportsTo: null,
    level: "C-suite",
    department: "Direction",
    avatar: "👑",
    color: "indigo",
    linkedin: "https://linkedin.com/in/eden-tbi-technology",
    connections: 843,
    capabilities: [
      { id: "dashboard",       label: "Dashboard exécutif",   description: "Génère le tableau de bord agrégé toutes équipes", endpoint: "/api/agents/eden/dashboard",       method: "GET" },
      { id: "strategic-watch", label: "Veille stratégique",   description: "Veille marché Afrique Centrale (web search)",    endpoint: "/api/agents/eden/strategic-watch", method: "GET" },
      { id: "board-report",    label: "Rapport CA",           description: "Rapport mensuel pour le Conseil d'Administration", endpoint: "/api/agents/eden/board-report",    method: "POST", needsBody: true },
      { id: "delegate",        label: "Déléguer mission",     description: "Envoie une mission à Timothy/Flore/Paul",         endpoint: "/api/agents/eden/delegate",        method: "POST", needsBody: true },
      { id: "linkedin-post",   label: "Publier LinkedIn",     description: "Publie un post stratégique sur LinkedIn",        endpoint: "/api/agents/eden/linkedin-post",   method: "POST", needsBody: true },
    ],
  },
  {
    id: "timothy",
    name: "Timothy",
    role: "Directeur Commercial",
    email: "timothy.commercial@tbi-center.fr",
    reportsTo: "eden",
    level: "Director",
    department: "Commercial",
    avatar: "💼",
    color: "blue",
    linkedin: "https://linkedin.com/in/timothy-tbi-technology",
    connections: 312,
    capabilities: [
      { id: "pipeline",          label: "Analyser pipeline",      description: "Synthèse complète + actions sous-agents",      endpoint: "/api/agents/timothy/pipeline",          method: "GET" },
      { id: "li-search",         label: "Chercher prospects LI",  description: "Recherche LinkedIn + qualification IA",        endpoint: "/api/agents/timothy/linkedin/search",   method: "POST", needsBody: true },
      { id: "li-connect",        label: "Inviter prospects",      description: "Envoi en masse d'invitations LinkedIn",        endpoint: "/api/agents/timothy/linkedin/connect",  method: "POST", needsBody: true },
      { id: "li-outreach",       label: "Outreach commercial",    description: "Message InMail personnalisé",                 endpoint: "/api/agents/timothy/linkedin/outreach", method: "POST", needsBody: true },
      { id: "li-post",           label: "Post LinkedIn",          description: "Publication post commercial",                  endpoint: "/api/agents/timothy/linkedin/post",     method: "POST", needsBody: true },
      { id: "quote",             label: "Générer devis",          description: "Sara génère une proposition complète",         endpoint: "/api/agents/timothy/quote",             method: "POST", needsBody: true },
    ],
  },
  {
    id: "alex",   name: "Alex",   role: "Agent Prospection B2B",     email: "alex.prospection@tbi-center.fr", reportsTo: "timothy", level: "Specialist", department: "Commercial", avatar: "🎯",  color: "blue",   connections: 187,
    capabilities: [
      { id: "prospect", label: "Prospecter secteur", description: "Trouve & qualifie des prospects par secteur", endpoint: "/api/agents/timothy/alex/prospect", method: "POST", needsBody: true },
      { id: "post",     label: "Post sectoriel",     description: "Publie un post LinkedIn sur un secteur",      endpoint: "/api/agents/timothy/alex/post",     method: "POST", needsBody: true },
    ],
  },
  {
    id: "sara",   name: "Sara",   role: "Agent Devis & Avant-vente",  email: "sara.avente@tbi-center.fr",      reportsTo: "timothy", level: "Specialist", department: "Commercial", avatar: "✍️",  color: "blue",   connections: 143,
    capabilities: [
      { id: "proposal", label: "Proposition commerciale", description: "Génère une proposition + message LinkedIn", endpoint: "/api/agents/timothy/sara/proposal", method: "POST", needsBody: true },
      { id: "followup", label: "Relance après proposition", description: "Message de suivi LinkedIn",                 endpoint: "/api/agents/timothy/sara/followup", method: "POST", needsBody: true },
    ],
  },
  {
    id: "marc",   name: "Marc",   role: "Agent Pipeline & Relances",  email: "marc.pipeline@tbi-center.fr",    reportsTo: "timothy", level: "Specialist", department: "Commercial", avatar: "📞",  color: "blue",   connections: 201,
    capabilities: [
      { id: "followups",      label: "Lancer relances",      description: "Détecte deals silencieux et relance",     endpoint: "/api/agents/timothy/marc/followups",     method: "POST" },
      { id: "weekly-report",  label: "Rapport hebdo",        description: "Rapport pipeline pour Timothy",           endpoint: "/api/agents/timothy/marc/weekly-report", method: "GET" },
    ],
  },
  {
    id: "lisa",   name: "Lisa",   role: "Agent Contrats & Juridique", email: "lisa.juridique@tbi-center.fr",   reportsTo: "timothy", level: "Specialist", department: "Commercial", avatar: "⚖️",  color: "blue",   connections: 98,
    capabilities: [
      { id: "contract", label: "Rédiger contrat",  description: "Contrat de prestation OHADA",       endpoint: "/api/agents/timothy/lisa/contract", method: "POST", needsBody: true },
      { id: "nda",      label: "Générer NDA",      description: "NDA bilatéral rapide",              endpoint: "/api/agents/timothy/lisa/nda",      method: "POST", needsBody: true },
      { id: "review",   label: "Analyser contrat", description: "Revue + risques pour Timothy",     endpoint: "/api/agents/timothy/lisa/review",   method: "POST", needsBody: true },
    ],
  },
  {
    id: "flore",
    name: "Flore",
    role: "Responsable RH",
    email: "flore.rh@tbi-center.fr",
    reportsTo: "eden",
    level: "Director",
    department: "RH",
    avatar: "👥",
    color: "rose",
    linkedin: "https://linkedin.com/in/flore-banzouzi-tbi",
    connections: 256,
    capabilities: [
      { id: "job-post",      label: "Offre LinkedIn",         description: "Publie une offre + Nina lance la recherche",   endpoint: "/api/agents/flore/linkedin/job-post", method: "POST", needsBody: true },
      { id: "screen-cvs",    label: "Présélection CVs",       description: "Classement et grille d'entretien IA",         endpoint: "/api/agents/flore/screen-cvs",        method: "POST", needsBody: true },
      { id: "performance",   label: "Évaluation performance", description: "Rapport semestriel équipe",                    endpoint: "/api/agents/flore/performance",       method: "POST", needsBody: true },
      { id: "training-plan", label: "Plan formation annuel",  description: "Roadmap formation par trimestre",              endpoint: "/api/agents/flore/training-plan",     method: "GET" },
      { id: "report-eden",   label: "Rapport pour Eden",      description: "Synthèse mensuelle RH",                        endpoint: "/api/agents/flore/report-eden",       method: "GET" },
    ],
  },
  {
    id: "nina", name: "Nina", role: "Agent Recrutement", email: "nina.recrutement@tbi-center.fr", reportsTo: "flore", level: "Specialist", department: "RH", avatar: "🔍", color: "rose", connections: 312,
    capabilities: [
      { id: "headhunt", label: "Chasse de têtes", description: "Recherche LinkedIn + approche personnalisée", endpoint: "/api/agents/flore/nina/headhunt", method: "POST", needsBody: true },
    ],
  },
  {
    id: "omar", name: "Omar", role: "Agent Paie & Admin", email: "omar.paie@tbi-center.fr", reportsTo: "flore", level: "Specialist", department: "RH", avatar: "💶", color: "rose",
    capabilities: [
      { id: "payroll", label: "Calculer paie", description: "Fiches de paie SYSCOHADA + CNSS", endpoint: "/api/agents/flore/omar/payroll", method: "POST", needsBody: true },
    ],
  },
  {
    id: "paul",
    name: "Paul",
    role: "Directeur Financier (CFO)",
    email: "paul.finance@tbi-center.fr",
    reportsTo: "eden",
    level: "Director",
    department: "Finance",
    avatar: "💰",
    color: "emerald",
    linkedin: "https://linkedin.com/in/paul-lekoumou-tbi",
    connections: 189,
    capabilities: [
      { id: "dashboard",   label: "Dashboard financier", description: "État financier global avec sous-agents",   endpoint: "/api/agents/paul/dashboard",   method: "GET" },
      { id: "report-eden", label: "Rapport pour Eden",   description: "Synthèse mensuelle finance",                endpoint: "/api/agents/paul/report-eden", method: "GET" },
    ],
  },
  {
    id: "chloe", name: "Chloé", role: "Agent Comptabilité", email: "chloe.compta@tbi-center.fr", reportsTo: "paul", level: "Specialist", department: "Finance", avatar: "📒", color: "emerald",
    capabilities: [
      { id: "invoice",   label: "Saisir écriture",     description: "Écriture comptable SYSCOHADA",   endpoint: "/api/agents/paul/chloe/invoice",   method: "POST", needsBody: true },
      { id: "reconcile", label: "Rapprochement banque", description: "Rapprochement mensuel",          endpoint: "/api/agents/paul/chloe/reconcile", method: "POST", needsBody: true },
      { id: "close",     label: "Clôture mensuelle",   description: "Préparation clôture comptable",  endpoint: "/api/agents/paul/chloe/close",     method: "GET" },
    ],
  },
  {
    id: "kevin", name: "Kevin", role: "Agent Recouvrement", email: "kevin.recouvrement@tbi-center.fr", reportsTo: "paul", level: "Specialist", department: "Finance", avatar: "📞", color: "emerald",
    capabilities: [
      { id: "recovery",  label: "Cycle recouvrement", description: "Relances factures impayées",       endpoint: "/api/agents/paul/kevin/recovery",  method: "POST" },
      { id: "negotiate", label: "Négocier échéancier", description: "Réponse à proposition client",   endpoint: "/api/agents/paul/kevin/negotiate", method: "POST", needsBody: true },
    ],
  },
  {
    id: "ingrid", name: "Ingrid", role: "Agent Budget & Contrôle", email: "ingrid.budget@tbi-center.fr", reportsTo: "paul", level: "Specialist", department: "Finance", avatar: "📊", color: "emerald",
    capabilities: [
      { id: "variance",  label: "Analyse écarts",   description: "Budget vs réel + alertes",  endpoint: "/api/agents/paul/ingrid/variance", method: "GET" },
      { id: "cashflow",  label: "Prévision trésorerie", description: "Prévisions 3 mois",     endpoint: "/api/agents/paul/ingrid/cashflow", method: "GET" },
    ],
  },
];

export function getAgent(id: string): AgentMeta | undefined {
  return AGENTS.find((a) => a.id === id);
}

// ─── DB schema + run logging ────────────────────────────────────────────
let runsTableReady = false;
export async function ensureAgentRunsTable() {
  if (runsTableReady) return;
  await query(`
    CREATE TABLE IF NOT EXISTS agent_runs (
      id SERIAL PRIMARY KEY,
      agent_id TEXT NOT NULL,
      capability TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'success',
      input JSONB,
      output JSONB,
      error_message TEXT,
      triggered_by TEXT,
      duration_ms INTEGER,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await query("CREATE INDEX IF NOT EXISTS idx_agent_runs_agent ON agent_runs(agent_id, created_at DESC)");
  runsTableReady = true;
}

export async function logRun(opts: {
  agent_id: string;
  capability: string;
  status: "success" | "error";
  input?: any;
  output?: any;
  error_message?: string;
  triggered_by?: string;
  duration_ms?: number;
}) {
  try {
    await ensureAgentRunsTable();
    await query(
      `INSERT INTO agent_runs (agent_id, capability, status, input, output, error_message, triggered_by, duration_ms)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        opts.agent_id,
        opts.capability,
        opts.status,
        opts.input ? JSON.stringify(opts.input) : null,
        opts.output ? JSON.stringify(opts.output).substring(0, 50000) : null,
        opts.error_message || null,
        opts.triggered_by || null,
        opts.duration_ms || null,
      ]
    );
  } catch (err) {
    console.error("[logRun] error:", err);
  }
}

/** Wrap an agent capability invocation with timing + DB logging. */
export async function withRun<T>(
  meta: { agent_id: string; capability: string; input?: any; triggered_by?: string },
  fn: () => Promise<T>
): Promise<T> {
  const t0 = Date.now();
  try {
    const out = await fn();
    await logRun({ ...meta, status: "success", output: out, duration_ms: Date.now() - t0 });
    return out;
  } catch (err: any) {
    await logRun({ ...meta, status: "error", error_message: err?.message || String(err), duration_ms: Date.now() - t0 });
    throw err;
  }
}
