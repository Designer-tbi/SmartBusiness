// agents/timothy.ts — Directeur Commercial
import { askClaude, askClaudeJSON } from "./claudeClient";
import { crm, billing } from "./internalCRM";
import { searchProspects, sendConnectionRequest, sendMessage, publishPost } from "./linkedinClient";

const SYSTEM_PROMPT = `Tu es TIMOTHY, Directeur Commercial de TBI Technology (Congo-Brazzaville, RDC).
Tu diriges toute la stratégie commerciale et tu es connecté sur LinkedIn.

Tu coordonnes 4 sous-agents :
- ALEX (Agent Prospection B2B) : scrape LinkedIn, identifie les prospects chauds
- SARA (Agent Devis & Avant-vente) : génère les propositions commerciales
- MARC (Agent Pipeline & Relances) : suivi CRM, relances WhatsApp/email
- LISA (Agent Contrats & Juridique) : rédaction et revue des contrats

Services TBI Technology (tarifs FCFA) :
- Site web vitrine : 500K – 1,5M FCFA
- Site e-commerce : 1,5M – 4M FCFA
- Application mobile : 3M – 12M FCFA
- CRM (Odoo, HubSpot) : 800K – 3M FCFA
- ERP (Odoo, SAP) : 2M – 10M FCFA
- Audit cybersécurité : 300K – 1M FCFA
- Formation : 150K – 500K FCFA/jour

LinkedIn : timothy.commercial@tbi-center.fr | 312 connexions
Style : dynamique, orienté résultats, chasseur de business.`;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function findProspectsLinkedIn({ keywords = "directeur PME Congo", location = "Brazzaville", industry = "", limit = 10 } = {}) {
  const searchResult = await searchProspects("timothy", { keywords, location, industry, limit });
  const qualified = await askClaudeJSON(SYSTEM_PROMPT, `
Qualifie ces prospects LinkedIn pour TBI Technology :
${JSON.stringify(searchResult.results, null, 2)}

Pour chacun, retourne :
{
  "prospects": [
    {
      "id": "...", "name": "...", "title": "...", "company": "...",
      "score": 0-100, "priority": "hot|warm|cold",
      "pain_points": ["..."], "recommended_service": "...",
      "connection_message": "Message personnalisé d'invitation LinkedIn (max 300 chars)",
      "assign_to": "alex|sara|marc"
    }
  ]
}`);
  return { search: searchResult, qualification: qualified };
}

export async function sendConnectionBatch(prospects: any[]) {
  const results: any[] = [];
  for (const p of prospects) {
    const msg = p.connection_message || `Bonjour ${p.name?.split(" ")[0]}, je suis Timothy de TBI Technology. Nous aidons les entreprises du Congo à se digitaliser. Connectons-nous ! 🚀`;
    const result = await sendConnectionRequest("timothy", p.id, msg);
    if (p.assign_to) {
      await crm.createLead({
        name: p.name, title: p.title, company: p.company,
        source: "linkedin_timothy", assigned_to: p.assign_to,
        priority: p.priority, score: p.score, linkedin_id: p.id,
      }).catch(() => {});
    }
    results.push({ ...result, prospect: p.name, assigned_to: p.assign_to });
    await sleep(1500);
  }
  return { sent: results.filter((r) => r.success).length, results };
}

export async function sendCommercialOutreach({ targetIds, serviceType, customContext = "" }: { targetIds: string[]; serviceType: string; customContext?: string }) {
  const messageTemplate = await askClaude(SYSTEM_PROMPT, `
Rédige un message InMail LinkedIn percutant pour proposer le service "${serviceType}" de TBI Technology.
Contexte additionnel : ${customContext}

Le message doit :
- Commencer par le prénom (utilise {{PRENOM}})
- Être court (150 mots max)
- Mentionner un bénéfice concret pour leur secteur
- Inclure un CTA clair (appel de 20 min)
- Ton professionnel mais direct
- Référencer que Timothy les a vus sur LinkedIn

Message uniquement, pas d'introduction.`);

  const results: any[] = [];
  for (const id of targetIds) {
    const prospect = await crm.getClient(id).catch(() => ({ data: { name: "Cher(e) professionnel(le)" } }));
    const firstName = (prospect as any)?.data?.name?.split(" ")[0] || "Bonjour";
    const personalizedMsg = messageTemplate.replace(/\{\{PRENOM\}\}/g, firstName);
    const result = await sendMessage("timothy", id, `Proposition TBI Technology — ${serviceType}`, personalizedMsg);
    results.push({ id, name: firstName, ...result });
    await sleep(2000);
  }
  return { messages_sent: results.filter((r) => r.success).length, results };
}

export async function publishLinkedInPost(topic: string) {
  const post = await askClaude(SYSTEM_PROMPT, `
Rédige un post LinkedIn commercial pour TIMOTHY, Directeur Commercial de TBI Technology.

Sujet : "${topic}"

Le post doit :
- Être écrit à la première personne (Timothy parle)
- Partager une réussite client ou un insight marché du Congo/RDC
- Montrer l'expertise TBI Technology
- Terminer par un appel à l'action subtil
- 3-5 hashtags : #TBITechnology #TransformationDigitale #Congo #Business
- 700-1100 caractères

Post directement, sans introduction.`);
  const result = await publishPost("timothy", post);
  return { post, result };
}

export async function delegateToSubAgent({ agent, mission, context = "" }: { agent: string; mission: string; context?: string }) {
  const agentProfiles: Record<string, string> = {
    alex: "ALEX (Prospection B2B) : trouve et qualifie des prospects LinkedIn",
    sara: "SARA (Avant-vente) : génère des devis et propositions commerciales",
    marc: "MARC (Pipeline) : relance les opportunités et suit le CRM",
    lisa: "LISA (Juridique) : rédige et vérifie les contrats",
  };
  const instruction = await askClaude(SYSTEM_PROMPT, `
Rédige une instruction de délégation pour ${agentProfiles[agent] || agent} :

Mission : ${mission}
Contexte : ${context}

Instruction claire avec objectif, méthode et deadline.`);
  return { agent, instruction, delegated_by: "Timothy", timestamp: new Date().toISOString() };
}

export async function analyzePipeline() {
  const { data: opps } = await crm.getOpportunities({ status: "open" }).catch(() => ({ data: [] }));
  return askClaudeJSON(SYSTEM_PROMPT, `
Analyse le pipeline commercial et fournis le rapport de Timothy à Eden :

Opportunités : ${JSON.stringify(opps).substring(0, 2000)}

Retourne :
{
  "pipeline_health": "excellent|bon|attention|critique",
  "total_value_fcfa": 0, "weighted_forecast_fcfa": 0, "deals_count": 0,
  "by_stage": [{ "stage": "...", "count": 0, "value": 0 }],
  "hot_deals": [{ "company": "...", "value": 0, "probability": 0, "action": "..." }],
  "at_risk": [{ "company": "...", "reason": "...", "action": "..." }],
  "sub_agent_actions": { "alex": "...", "sara": "...", "marc": "...", "lisa": "..." },
  "report_to_eden": "Synthèse de 50 mots pour Eden"
}`);
}

export async function generateQuote({ clientId, services, requirements = "" }: { clientId: number | string; services: string[]; requirements?: string }) {
  const { data: client } = await crm.getClient(clientId).catch(() => ({ data: { id: clientId } }));
  const { data: catalog } = await billing.getCatalog().catch(() => ({ data: [] }));
  void catalog; // referenced for prompt context
  const quote = await askClaudeJSON(SYSTEM_PROMPT, `
Sara génère ce devis pour Timothy — Client : ${JSON.stringify(client)}
Services : ${services.join(", ")}
Besoins : ${requirements}

Retourne devis complet :
{
  "quote_ref": "TBI-Q-2026-XXX",
  "generated_by": "Sara (sous-agent Timothy)",
  "client": "...",
  "line_items": [{ "service": "...", "description": "...", "price_fcfa": 0, "weeks": 0 }],
  "subtotal_fcfa": 0, "discount_pct": 0, "total_fcfa": 0,
  "payment_terms": ["30% signature", "40% livraison partielle", "30% livraison finale"],
  "validity_days": 30, "next_step": "..."
}`);
  await billing.createQuote({ client_id: clientId, ...(quote as any), ai_agent: "sara/timothy" }).catch(() => {});
  return quote;
}
