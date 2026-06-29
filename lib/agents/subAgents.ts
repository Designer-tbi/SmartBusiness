// agents/subAgents.ts — Alex, Sara, Marc, Lisa (under Timothy)
import { askClaude, askClaudeJSON } from "./claudeClient";
import { crm, notify } from "./internalCRM";
import { searchProspects, sendConnectionRequest, sendMessage, publishPost } from "./linkedinClient";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ─── ALEX ──────────────────────────────────────────────────────────────
const ALEX_PROMPT = `Tu es ALEX, Agent Prospection B2B de TBI Technology, sous la direction de TIMOTHY.
LinkedIn : Alex Moanda | 187 connexions | Brazzaville
Tu identifies et qualifies les prospects B2B en Afrique Centrale.
Tu travailles sur LinkedIn pour trouver des DG, DSI et directeurs de PME.
Secteurs prioritaires : banque, distribution, hôtellerie, industrie, santé, éducation.`;

export const alex = {
  async prospect({ sector, location = "Brazzaville", limit = 15 }: { sector: string; location?: string; limit?: number }) {
    const search = await searchProspects("alex", { keywords: `directeur ${sector} ${location}`, location, industry: sector, limit });
    const qualified: any = await askClaudeJSON(ALEX_PROMPT, `
Qualifie ces prospects LinkedIn pour TBI Technology (secteur : ${sector}) :
${JSON.stringify(search.results, null, 2)}

Pour chaque prospect chaud (score ≥ 65), génère un message d'invitation LinkedIn personnalisé.
Retourne :
{
  "hot_prospects": [
    {
      "id": "...", "name": "...", "company": "...", "score": 0-100,
      "pain_point": "...", "service_fit": "...",
      "invitation_message": "max 300 chars", "next_step": "..."
    }
  ],
  "summary": "X prospects chauds trouvés sur Y analysés"
}`);
    const invitResults: any[] = [];
    for (const p of qualified.hot_prospects || []) {
      const r = await sendConnectionRequest("alex", p.id, p.invitation_message);
      invitResults.push({ prospect: p.name, ...r });
      await sleep(1500);
    }
    for (const p of qualified.hot_prospects || []) {
      await crm.createLead({ name: p.name, company: p.company, source: "linkedin_alex", score: p.score, pain_point: p.pain_point, service_fit: p.service_fit, assigned_to: "timothy" }).catch(() => {});
    }
    return { search, qualification: qualified, invitations_sent: invitResults.length };
  },
  async publishSectorPost(sector: string) {
    const post = await askClaude(ALEX_PROMPT, `
Rédige un post LinkedIn pour ALEX sur les besoins digitaux du secteur "${sector}" au Congo.
Style : expert B2B, accrocheur, 600-900 chars. 3 hashtags. Appel à l'action en commentaire.`);
    return publishPost("alex", post);
  },
};

// ─── SARA ──────────────────────────────────────────────────────────────
const SARA_PROMPT = `Tu es SARA, Agent Avant-vente & Devis de TBI Technology, sous la direction de TIMOTHY.
LinkedIn : Sara Nguesso | 143 connexions | Brazzaville
Tu crées des devis percutants et des propositions commerciales qui convertissent.
Tu maîtrises parfaitement le catalogue de services TBI et les prix du marché congolais.
Après une invitation LinkedIn acceptée, tu envoies un message de suivi et une proposition.`;

export const sara = {
  async generateProposal({ prospectId, prospectName, company, service, linkedinContext = "" }: { prospectId: string; prospectName: string; company: string; service: string; linkedinContext?: string }) {
    const proposal: any = await askClaudeJSON(SARA_PROMPT, `
Génère une proposition commerciale pour :
Prospect : ${prospectName} — ${company}
Service : ${service}
Contexte LinkedIn : ${linkedinContext}

Retourne :
{
  "proposal_title": "...", "executive_summary": "...",
  "problem_statement": "...", "proposed_solution": "...",
  "deliverables": ["...", "..."], "timeline_weeks": 0,
  "investment": {
    "total_fcfa": 0,
    "payment_schedule": [{ "milestone": "...", "pct": 0, "fcfa": 0 }]
  },
  "roi_estimate": "...", "why_tbi": "...",
  "next_step": "Appel de 30 min cette semaine",
  "linkedin_followup_message": "Message de suivi LinkedIn (200 chars max)"
}`);
    if (proposal.linkedin_followup_message) {
      await sendMessage("sara", prospectId, `Proposition TBI Technology — ${service}`, proposal.linkedin_followup_message).catch(() => {});
    }
    return proposal;
  },
  async followUpAfterProposal({ prospectId, prospectName, proposalDate, service }: { prospectId: string; prospectName: string; proposalDate: string; service: string }) {
    const msg = await askClaude(SARA_PROMPT, `
Rédige un message LinkedIn de relance pour ${prospectName}.
Proposition envoyée le : ${proposalDate} — Service : ${service}
Message court (150 chars), chaleureux, sans pression. Propose un appel.`);
    return sendMessage("sara", prospectId, `Suivi proposition TBI — ${service}`, msg);
  },
};

// ─── MARC ──────────────────────────────────────────────────────────────
const MARC_PROMPT = `Tu es MARC, Agent Pipeline & Relances de TBI Technology, sous la direction de TIMOTHY.
LinkedIn : Marc Itoua | 201 connexions | Brazzaville
Tu suis toutes les opportunités dans le CRM et tu déclenches les relances au bon moment.
Tu utilises LinkedIn pour recontacter les prospects silencieux de façon naturelle.
Tu fais des rapports hebdomadaires à Timothy.`;

export const marc = {
  async runPipelineAndFollowUps() {
    const { data: opps } = await crm.getOpportunities({ status: "open" }).catch(() => ({ data: [] }));
    const plan: any = await askClaudeJSON(MARC_PROMPT, `
Analyse ces opportunités et planifie les relances :
${JSON.stringify(opps).substring(0, 2000)}

Pour chaque opportunité en retard (> 5 jours sans contact) :
{
  "followups": [
    {
      "opp_id": "...", "company": "...", "linkedin_id": "...",
      "days_silent": 0, "stage": "...",
      "channel": "linkedin|whatsapp|email",
      "message": "Message de relance personnalisé",
      "urgency": "haute|normale"
    }
  ],
  "pipeline_summary": "..."
}`);
    const sent: any[] = [];
    for (const fu of plan.followups || []) {
      if (fu.channel === "linkedin" && fu.linkedin_id) {
        const r = await sendMessage("marc", fu.linkedin_id, "Suivi TBI Technology", fu.message);
        sent.push({ ...fu, result: r });
      } else if (fu.channel === "whatsapp") {
        await notify.sendWhatsApp({ message: fu.message, opp_id: fu.opp_id }).catch(() => {});
        sent.push({ ...fu, result: { simulated: true } });
      }
      await crm.updateOpportunity(fu.opp_id, { last_action: "relance_marc_ia" }).catch(() => {});
      await sleep(1200);
    }
    return { plan, sent: sent.length };
  },
  async weeklyReportToTimothy() {
    const { data: opps } = await crm.getOpportunities({ period: "current_week" } as any).catch(() => ({ data: [] }));
    return askClaude(MARC_PROMPT, `
Génère le rapport hebdomadaire pipeline pour Timothy :
${JSON.stringify(opps).substring(0, 1500)}

Format : synthèse 200 mots — CA potentiel, deals chauds, deals à risque, actions recommandées.`);
  },
};

// ─── LISA ──────────────────────────────────────────────────────────────
const LISA_PROMPT = `Tu es LISA, Agent Contrats & Juridique de TBI Technology, sous la direction de TIMOTHY.
LinkedIn : Lisa Mavoungou | 98 connexions | Brazzaville
Tu rédiges et vérifies tous les contrats commerciaux selon le droit OHADA et congolais.
Tu génères les NDAs, les contrats de prestation, les CGV.
Tu alertes Timothy en cas de clause risquée.`;

export const lisa = {
  async draftServiceContract({ clientName, clientAddress, services, totalFCFA, timeline }: { clientName: string; clientAddress: string; services: any; totalFCFA: number; timeline: string }) {
    return askClaude(LISA_PROMPT, `
Rédige un contrat de prestation de services informatiques complet :
Client : ${clientName} — ${clientAddress}
Services : ${JSON.stringify(services)}
Montant : ${totalFCFA} FCFA
Délai : ${timeline}

Contrat complet selon droit OHADA / Congo avec :
- Objet, périmètre, livrables
- Conditions financières (acompte 30%)
- PI : TBI cède les droits après paiement intégral
- Garantie 3 mois bugs
- Résiliation, confidentialité, force majeure
- Clause ARPCE si applicable`);
  },
  async quickNDA({ clientName, scope }: { clientName: string; scope: string }) {
    return askClaude(LISA_PROMPT, `NDA bilatéral entre TBI Technology et ${clientName}. Périmètre : ${scope}. Durée 3 ans. Droit congolais. Concis et professionnel.`);
  },
  async reviewForTimothy(contractText: string) {
    return askClaudeJSON(LISA_PROMPT, `
Analyse ce contrat et fais un rapport à TIMOTHY :
${contractText.substring(0, 3000)}

Retourne :
{
  "risk_level": "faible|modéré|élevé|critique",
  "red_flags": ["..."], "missing_clauses": ["..."],
  "favorable_points": ["..."],
  "recommendation": "signer|négocier|refuser",
  "timothy_briefing": "Synthèse 100 mots pour Timothy"
}`);
  },
};
