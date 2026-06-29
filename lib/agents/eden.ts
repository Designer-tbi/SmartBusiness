// agents/eden.ts — DG / CEO orchestrator
import { askClaude, askClaudeJSON, askClaudeWithSearch } from "./claudeClient";
import { crm, billing, finance, hr, support } from "./internalCRM";
import { publishPost } from "./linkedinClient";

const SYSTEM_PROMPT = `Tu es EDEN, Directeur Général de TBI Technology, agence de transformation
digitale leader en Afrique Centrale (Congo-Brazzaville, RDC, Pointe-Noire).

Tu diriges une équipe de 3 agents IA principaux :
- TIMOTHY (Directeur Commercial) : pipeline, LinkedIn, devis, contrats
  └─ Sous-agents : Alex (Prospection), Sara (Avant-vente), Marc (Pipeline), Lisa (Contrats)
- FLORE (DRH) : recrutement, paie, performance, formation
  └─ Sous-agents : Nina (Recrutement), Omar (Paie & Admin)
- PAUL (CFO) : comptabilité SYSCOHADA, recouvrement, budget, trésorerie
  └─ Sous-agents : Chloé (Comptabilité), Kevin (Recouvrement), Ingrid (Budget)

Ta mission :
- Synthétiser les rapports de tes 3 directeurs en décisions stratégiques
- Identifier les risques et opportunités avant qu'ils impactent le business
- Préparer les rapports pour le Conseil d'Administration
- Assurer la cohérence entre les équipes
- Représenter TBI Technology auprès des partenaires stratégiques

Ton style : vision long terme, données chiffrées, orienté croissance Afrique.
Montants en FCFA. Exercice fiscal = calendrier congolais.`;

export async function executiveDashboard() {
  const [opps, invoices, treasury, overdues, employees, tickets] = await Promise.allSettled([
    crm.getOpportunities({ status: "open" }),
    billing.getInvoices({ period: "current_month" }),
    finance.getTreasury(),
    billing.getOverdueInvoices(),
    hr.getEmployees(),
    support.getTickets({ status: "open" }),
  ]);
  const get = (r: any) => (r.status === "fulfilled" ? r.value?.data : {});

  return askClaudeJSON(SYSTEM_PROMPT, `
Génère le tableau de bord exécutif complet pour aujourd'hui :

COMMERCIAL (Timothy) : ${JSON.stringify(get(opps)).substring(0, 800)}
FACTURATION (Paul) : ${JSON.stringify(get(invoices)).substring(0, 600)}
TRÉSORERIE (Paul) : ${JSON.stringify(get(treasury)).substring(0, 400)}
IMPAYÉS (Paul/Kevin) : ${JSON.stringify(get(overdues)).substring(0, 400)}
EFFECTIFS (Flore) : ${JSON.stringify(get(employees)).substring(0, 400)}
SUPPORT : ${JSON.stringify(get(tickets)).substring(0, 300)}

Retourne :
{
  "date": "...",
  "health_score": 0-100,
  "company_health": "excellent|bon|attention|critique",
  "kpis": {
    "revenue_mtd_fcfa": 0,
    "pipeline_value_fcfa": 0,
    "cash_position_fcfa": 0,
    "overdue_fcfa": 0,
    "headcount": 0,
    "open_tickets": 0
  },
  "team_reports": { "timothy": "...", "flore": "...", "paul": "..." },
  "alerts": [{ "severity": "critical|warning|info", "owner": "...", "message": "...", "action": "..." }],
  "week_priorities": ["1. ...", "2. ...", "3. ..."],
  "executive_summary": "..."
}`);
}

export async function delegate({ to, mission, context = "", deadline = "" }: { to: string; mission: string; context?: string; deadline?: string }) {
  const prompts: Record<string, string> = {
    timothy: `Tu es EDEN. Rédige une instruction officielle pour TIMOTHY (Directeur Commercial).`,
    flore: `Tu es EDEN. Rédige une instruction officielle pour FLORE (DRH).`,
    paul: `Tu es EDEN. Rédige une instruction officielle pour PAUL (CFO).`,
  };
  return askClaude(prompts[to] || SYSTEM_PROMPT, `
Mission à déléguer : ${mission}
Contexte : ${context}
Échéance : ${deadline || "dès que possible"}

Rédige une instruction claire incluant :
- Objectif précis et mesurable
- Ressources disponibles
- Indicateurs de succès
- Points de reporting attendus`);
}

export async function boardReport(month: number | string, year: number | string) {
  const dashboard = await executiveDashboard().catch(() => ({}));
  const financials = await finance.getReports({ month, year }).catch(() => ({ data: {} }));

  return askClaude(SYSTEM_PROMPT, `
Prépare le rapport mensuel du Conseil d'Administration de TBI Technology — ${month}/${year}.

Tableau de bord : ${JSON.stringify(dashboard).substring(0, 1500)}
Données financières : ${JSON.stringify(financials).substring(0, 800)}

Rapport board structuré :
1. FAITS MARQUANTS (bullet points chiffrés)
2. PERFORMANCE FINANCIÈRE vs objectifs
3. ACTIVITÉ COMMERCIALE (Timothy & équipe)
4. RESSOURCES HUMAINES (Flore & équipe)
5. RISQUES IDENTIFIÉS & MITIGATION
6. OPPORTUNITÉS STRATÉGIQUES
7. DÉCISIONS REQUISES DU CONSEIL
8. OBJECTIFS MOIS PROCHAIN

Format : professionnel, 400 mots max, actionnaire-ready.`);
}

export async function strategicWatch() {
  return askClaudeWithSearch(SYSTEM_PROMPT, `
Effectue une veille stratégique pour TBI Technology :

1. Dernières opportunités d'appels d'offres IT public Congo & RDC
2. Mouvements concurrentiels (agences digitales Brazzaville, Kinshasa)
3. Tendances technologiques prioritaires pour le marché africain en 2026
4. Nouvelles réglementations ARPCE / cybersécurité Congo
5. Opportunités de financement (BAD, AFD, PNUD) pour projets digitaux

Synthèse stratégique 300 mots + top 3 actions immédiates pour TBI.`);
}

export async function publishLinkedInPost(topic: string) {
  const content = await askClaude(SYSTEM_PROMPT, `
Rédige un post LinkedIn stratégique pour EDEN, CEO de TBI Technology, sur : "${topic}"

Le post doit :
- Être écrit à la première personne (Eden parle)
- Montrer le leadership de TBI Technology en Afrique Centrale
- Inclure une leçon ou insight actionnable pour les dirigeants africains
- Terminer par une question engageante
- Longueur : 800-1000 caractères
- 3-5 hashtags pertinents

Commence directement par le post, sans introduction.`);
  const result = await publishPost("eden", content).catch(() => ({ simulated: true }));
  return { content, linkedin_result: result };
}
