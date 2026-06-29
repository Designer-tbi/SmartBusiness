// agents/paul.ts — CFO + Chloé (Compta), Kevin (Recouvrement), Ingrid (Budget)
import { askClaude, askClaudeJSON } from "./claudeClient";
import { finance, billing, crm, notify } from "./internalCRM";

const SYSTEM_PROMPT = `Tu es PAUL, Directeur Financier (CFO) de TBI Technology (Brazzaville, Congo).
Tu rapportes à EDEN (DG) et tu coordonnes 3 sous-agents :
- CHLOÉ (Comptabilité SYSCOHADA) : saisie comptable, rapprochement bancaire, clôtures
- KEVIN (Recouvrement) : relances factures impayées, échéanciers, mise en demeure
- INGRID (Budget & Contrôle) : budget vs réel, trésorerie, prévisions, scénarios

Cadre comptable : SYSCOHADA (Système Comptable OHADA)
TVA Congo : 18% | Devise : FCFA (XAF) | Exercice : 1er jan – 31 déc
Plan comptable clés :
- 706 : Prestations de services (CA)
- 411 : Clients | 401 : Fournisseurs | 512 : Banques
- 4441 : TVA collectée | 4452 : TVA déductible

Structure coûts TBI : Personnel 45% | Hébergement/Licences 10% | Marketing 8%
Loyer 6% | Sous-traitance 12% | Autres 5% | Marge nette cible 14%

Tu produis les états financiers mensuels pour Eden et le CA.`;

export async function financialDashboard(period: string) {
  const [transactions, invoices, treasury, budget] = await Promise.allSettled([
    finance.getTransactions({ period }),
    billing.getInvoices({ period }),
    finance.getTreasury(),
    finance.getBudget({ period }),
  ]);
  const get = (r: any) => (r.status === "fulfilled" ? r.value?.data : {});
  return askClaudeJSON(SYSTEM_PROMPT, `
Paul prépare le tableau de bord financier pour Eden — ${period} :

Transactions : ${JSON.stringify(get(transactions)).substring(0, 800)}
Facturation : ${JSON.stringify(get(invoices)).substring(0, 600)}
Trésorerie : ${JSON.stringify(get(treasury)).substring(0, 300)}
Budget : ${JSON.stringify(get(budget)).substring(0, 400)}

Retourne :
{
  "period": "${period}",
  "ca_ht_fcfa": 0, "charges_totales_fcfa": 0,
  "marge_nette_fcfa": 0, "marge_nette_pct": 0,
  "tresorerie_fcfa": 0, "creances_clients_fcfa": 0,
  "dettes_fournisseurs_fcfa": 0, "tva_a_payer_fcfa": 0,
  "sub_agent_status": { "chloe": "...", "kevin": "...", "ingrid": "..." },
  "alerts": [{ "type": "...", "severity": "...", "message": "...", "action": "..." }],
  "eden_summary": "Synthèse 80 mots pour Eden"
}`);
}

export async function reportToEden(month: string | number, year: string | number) {
  const dashboard = await financialDashboard(`${year}-${month}`).catch(() => ({}));
  return askClaude(SYSTEM_PROMPT, `
Paul rédige le rapport financier mensuel pour EDEN — ${month}/${year} :
${JSON.stringify(dashboard).substring(0, 1500)}

Rapport structuré (300 mots) :
1. Performance financière vs objectifs
2. Trésorerie et alertes
3. Actions Chloé / Kevin / Ingrid ce mois
4. Points d'attention pour Eden
5. Prévisions mois prochain`);
}

// ─── CHLOÉ ─────────────────────────────────────────────────────────────
const CHLOE_PROMPT = `Tu es CHLOÉ, Agent Comptabilité SYSCOHADA de TBI Technology, sous la direction de PAUL.
Tu tiens la comptabilité selon le plan SYSCOHADA applicable au Congo.
TVA 18%, plan comptable congolais, rapprochement bancaire mensuel.`;

export const chloe = {
  async processInvoice({ type, vendor, amount, date, description }: { type: string; vendor: string; amount: number; date: string; description: string }) {
    const entry: any = await askClaudeJSON(CHLOE_PROMPT, `
Génère l'écriture comptable SYSCOHADA pour :
Type : ${type} | Tiers : ${vendor} | Montant : ${amount} FCFA | Date : ${date}
Description : ${description}

Retourne :
{
  "journal": "achat|vente|banque|caisse|opérations_diverses",
  "date": "${date}", "libelle": "...",
  "ecritures": [{ "compte": "...", "libelle": "...", "debit": 0, "credit": 0 }],
  "tva_collectee": 0, "tva_deductible": 0,
  "ht": 0, "ttc": ${amount}, "paul_note": "..."
}`);
    await finance.createTransaction({ ...entry, created_by: "chloe_ia" }).catch(() => {});
    return entry;
  },
  async bankReconciliation({ bankLines, period }: { bankLines: any[]; period: string }) {
    const { data: bookEntries } = await finance.getTransactions({ period }).catch(() => ({ data: [] }));
    return askClaudeJSON(CHLOE_PROMPT, `
Rapprochement bancaire ${period} pour TBI Technology :
Relevé bancaire : ${JSON.stringify(bankLines, null, 2)}
Écritures comptables : ${JSON.stringify(bookEntries).substring(0, 1500)}

Retourne :
{
  "solde_banque": 0, "solde_comptable": 0, "ecart": 0,
  "transactions_rapprochees": 0,
  "transactions_non_rapprochees_banque": [{ "date": "...", "libelle": "...", "montant": 0 }],
  "transactions_non_rapprochees_compta": [{ "date": "...", "libelle": "...", "montant": 0 }],
  "actions_correctives": ["..."], "rapprochement_ok": true,
  "paul_summary": "..."
}`);
  },
  async monthlyClose(month: string | number, year: string | number) {
    const { data: tx } = await finance.getTransactions({ period: `${year}-${month}` }).catch(() => ({ data: [] }));
    const { data: inv } = await billing.getInvoices({ period: `${year}-${month}` } as any).catch(() => ({ data: [] }));
    return askClaude(CHLOE_PROMPT, `
Chloé prépare la clôture mensuelle ${month}/${year} pour Paul :
Transactions : ${JSON.stringify(tx).substring(0, 800)}
Factures : ${JSON.stringify(inv).substring(0, 600)}

Inclus : CA HT, TVA à déclarer, résultat du mois, écritures de clôture à passer,
points d'attention pour l'expert-comptable.`);
  },
};

// ─── KEVIN ─────────────────────────────────────────────────────────────
const KEVIN_PROMPT = `Tu es KEVIN, Agent Recouvrement de TBI Technology, sous la direction de PAUL.
Tu relances les clients qui n'ont pas payé leurs factures, avec fermeté mais diplomatie.
Politique : J+7 rappel, J+15 relance formelle, J+30 mise en demeure, J+45 escalade Paul.
Pénalités de retard : 1.5%/mois selon contrat.`;

export const kevin = {
  async runRecovery() {
    const { data: overdues } = await billing.getOverdueInvoices().catch(() => ({ data: [] }));
    const results: any[] = [];
    for (const inv of overdues) {
      const daysLate = Math.floor((Date.now() - new Date(inv.due_date).getTime()) / 86400000);
      const action: any = await askClaudeJSON(KEVIN_PROMPT, `
Facture impayée : Client ${inv.client_name} | Montant : ${inv.amount} FCFA | Retard : ${daysLate} jours
Retourne :
{
  "action": "rappel_courtois|relance_formelle|mise_en_demeure|escalade_paul",
  "channel": "email|whatsapp|courrier",
  "penalites_fcfa": 0, "total_reclame_fcfa": 0,
  "message": "Message complet à envoyer",
  "objet": "...", "escalade_paul": ${daysLate > 40}
}`);
      if (action.channel === "whatsapp") {
        await notify.sendWhatsApp({ to: inv.client_phone, message: action.message, invoice_id: inv.id }).catch(() => {});
      } else {
        await notify.sendEmail({ to: inv.client_email, subject: action.objet, body: action.message }).catch(() => {});
      }
      if (action.escalade_paul) {
        await notify.createAlert({ type: "recouvrement_escalade", message: `Paul — Escalade recouvrement ${inv.client_name} : ${inv.amount} FCFA (${daysLate}j)` }).catch(() => {});
      }
      await billing.updateInvoice(inv.id, { recovery_stage: action.action }).catch(() => {});
      results.push({ invoice: inv.id, client: inv.client_name, action: action.action });
    }
    return { processed: overdues.length, results };
  },
  async negotiateSchedule({ invoiceId, clientProposal }: { invoiceId: number; clientProposal: any }) {
    const { data: inv } = await billing.getInvoice(invoiceId).catch(() => ({ data: {} }));
    return askClaudeJSON(KEVIN_PROMPT, `
Négocie l'échéancier pour : ${JSON.stringify(inv)} | Proposition client : ${JSON.stringify(clientProposal)}
Retourne : { "accept": true, "counter": [{ "date": "...", "montant_fcfa": 0 }], "conditions": ["..."], "reponse_client": "..." }`);
  },
};

// ─── INGRID ────────────────────────────────────────────────────────────
const INGRID_PROMPT = `Tu es INGRID, Agent Budget & Contrôle de Gestion de TBI Technology, sous la direction de PAUL.
Tu surveilles l'exécution budgétaire, analyses les écarts et prévois la trésorerie.
Tu alertes Paul dès qu'un poste dépasse 110% du budget ou que la trésorerie passe sous 2 mois de charges.`;

export const ingrid = {
  async varianceAnalysis(period: string) {
    const [actual, budget] = await Promise.all([
      finance.getTransactions({ period }).catch(() => ({ data: [] })),
      finance.getBudget({ period }).catch(() => ({ data: {} })),
    ]);
    return askClaudeJSON(INGRID_PROMPT, `
Analyse des écarts budgétaires ${period} pour Paul :
Réalisé : ${JSON.stringify(actual.data).substring(0, 800)}
Budget : ${JSON.stringify(budget.data).substring(0, 600)}

Retourne :
{
  "period": "${period}",
  "ca_budget": 0, "ca_reel": 0, "ca_ecart_pct": 0,
  "charges_budget": 0, "charges_reel": 0, "charges_ecart_pct": 0,
  "marge_budget_pct": 0, "marge_reel_pct": 0,
  "postes_en_depassement": [{ "poste": "...", "budget": 0, "reel": 0, "ecart_pct": 0 }],
  "actions_correctives": ["..."], "alertes": ["..."],
  "paul_summary": "Synthèse 60 mots pour Paul"
}`);
  },
  async cashForecast() {
    const [treasury, pipeline, invoicesDue] = await Promise.all([
      finance.getTreasury().catch(() => ({ data: {} })),
      crm.getOpportunities({ status: "open" }).catch(() => ({ data: [] })),
      billing.getInvoices({ status: "sent" }).catch(() => ({ data: [] })),
    ]);
    return askClaudeJSON(INGRID_PROMPT, `
Prévisions trésorerie 3 mois pour Paul :
Trésorerie actuelle : ${JSON.stringify(treasury.data).substring(0, 300)}
Pipeline à encaisser : ${JSON.stringify(pipeline.data).substring(0, 600)}
Factures à recevoir : ${JSON.stringify(invoicesDue.data).substring(0, 500)}

Retourne :
{
  "tresorerie_actuelle_fcfa": 0,
  "previsions": [{ "mois": "...", "encaissements": 0, "decaissements": 0, "solde_fin": 0, "alerte": "ok|attention|critique" }],
  "mois_critique": "...", "financement_necessaire": 0,
  "recommandations": ["..."], "paul_briefing": "..."
}`);
  },
};
